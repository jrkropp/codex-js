import {
	MCP_TOOL_NAME_DELIMITER,
	qualified_mcp_tool_name_prefix,
	sanitize_responses_api_tool_name,
} from "./mcp/mod";

export const MCP_TOOLS_CACHE_WRITE_DURATION_METRIC =
	"codex.mcp.tools.cache_write.duration_ms";

export type ToolInfo = {
	server_name: string;
	name: string;
	callable_name?: string | null;
	callable_namespace?: string | null;
	namespace_description?: string | null;
	title?: string | null;
	description?: string | null;
	input_schema?: unknown;
	meta?: unknown;
	connector_id?: string | null;
	connector_name?: string | null;
	plugin_display_names?: string[];
	source_label?: string | null;
	mcp_app_resource_uri?: string | null;
};

export type QualifiedToolInfo<T extends ToolInfo = ToolInfo> = T & {
	callable_name: string;
	callable_namespace: string;
	plugin_display_names: string[];
};

export class ToolFilter {
	constructor(
		readonly enabled: ReadonlySet<string> | null = null,
		readonly disabled: ReadonlySet<string> = new Set(),
	) {}

	static from_config(config: {
		enabled_tools?: readonly string[] | null;
		disabled_tools?: readonly string[] | null;
	}): ToolFilter {
		return new ToolFilter(
			config.enabled_tools ? new Set(config.enabled_tools) : null,
			new Set(config.disabled_tools ?? []),
		);
	}

	allows(toolName: string): boolean {
		if (this.enabled && !this.enabled.has(toolName)) {
			return false;
		}
		return !this.disabled.has(toolName);
	}
}

export function declared_openai_file_input_param_names(
	meta: unknown,
): string[] {
	if (!isRecord(meta)) {
		return [];
	}
	const params = meta[META_OPENAI_FILE_PARAMS];
	return Array.isArray(params)
		? params.filter((value): value is string => typeof value === "string" && value.length > 0)
		: [];
}

export function tool_with_model_visible_input_schema<T extends ToolInfo>(
	tool: T,
): T {
	const fileParams = declared_openai_file_input_param_names(tool.meta);
	if (fileParams.length === 0 || !isRecord(tool.input_schema)) {
		return { ...tool };
	}

	const inputSchema = structuredClone(tool.input_schema) as Record<string, unknown>;
	const properties = inputSchema.properties;
	if (isRecord(properties)) {
		for (const fieldName of fileParams) {
			const propertySchema = properties[fieldName];
			if (isRecord(propertySchema)) {
				properties[fieldName] = masked_input_property_schema(propertySchema);
			}
		}
	}

	return {
		...tool,
		input_schema: inputSchema,
	};
}

export function filter_tools<T extends ToolInfo>(
	tools: readonly T[],
	filter: ToolFilter,
): T[] {
	return tools.filter((tool) => filter.allows(tool.name));
}

export function qualify_tools<T extends ToolInfo>(
	tools: Iterable<T>,
): Map<string, QualifiedToolInfo<T>> {
	const seenRawNames = new Set<string>();
	const candidates: CallableToolCandidate<T>[] = [];

	for (const inputTool of tools) {
		const tool = normalize_tool_info(inputTool);
		const rawNamespaceIdentity = [
			tool.server_name,
			tool.callable_namespace,
			tool.connector_id ?? "",
		].join("\0");
		const rawToolIdentity = [
			rawNamespaceIdentity,
			tool.callable_name,
			tool.name,
		].join("\0");
		if (seenRawNames.has(rawToolIdentity)) {
			continue;
		}
		seenRawNames.add(rawToolIdentity);
		candidates.push({
			tool,
			raw_namespace_identity: rawNamespaceIdentity,
			raw_tool_identity: rawToolIdentity,
			callable_namespace: sanitize_responses_api_tool_name(
				tool.callable_namespace,
			),
			callable_name: sanitize_responses_api_tool_name(tool.callable_name),
		});
	}

	const namespaceIdentitiesByBase = new Map<string, Set<string>>();
	for (const candidate of candidates) {
		const identities =
			namespaceIdentitiesByBase.get(candidate.callable_namespace) ?? new Set();
		identities.add(candidate.raw_namespace_identity);
		namespaceIdentitiesByBase.set(candidate.callable_namespace, identities);
	}
	const collidingNamespaces = new Set(
		[...namespaceIdentitiesByBase.entries()]
			.filter(([, identities]) => identities.size > 1)
			.map(([namespace]) => namespace),
	);
	for (const candidate of candidates) {
		if (collidingNamespaces.has(candidate.callable_namespace)) {
			candidate.callable_namespace = append_namespace_hash_suffix(
				candidate.callable_namespace,
				candidate.raw_namespace_identity,
			);
		}
	}

	const toolIdentitiesByBase = new Map<string, Set<string>>();
	for (const candidate of candidates) {
		const key = `${candidate.callable_namespace}\0${candidate.callable_name}`;
		const identities = toolIdentitiesByBase.get(key) ?? new Set();
		identities.add(candidate.raw_tool_identity);
		toolIdentitiesByBase.set(key, identities);
	}
	const collidingTools = new Set(
		[...toolIdentitiesByBase.entries()]
			.filter(([, identities]) => identities.size > 1)
			.map(([key]) => key),
	);
	for (const candidate of candidates) {
		const key = `${candidate.callable_namespace}\0${candidate.callable_name}`;
		if (collidingTools.has(key)) {
			candidate.callable_name = append_hash_suffix(
				candidate.callable_name,
				candidate.raw_tool_identity,
			);
		}
	}

	candidates.sort((left, right) =>
		left.raw_tool_identity.localeCompare(right.raw_tool_identity),
	);

	const usedNames = new Set<string>();
	const qualifiedTools = new Map<string, QualifiedToolInfo<T>>();
	for (const candidate of candidates) {
		const [callableNamespace, callableName, qualifiedName] =
			unique_callable_parts(
				candidate.callable_namespace,
				candidate.callable_name,
				candidate.raw_tool_identity,
				usedNames,
			);
		const tool = {
			...candidate.tool,
			callable_namespace: callableNamespace,
			callable_name: callableName,
		};
		qualifiedTools.set(qualifiedName, tool);
	}

	return qualifiedTools;
}

export function qualify_tool_infos<T extends ToolInfo>(
	tools: readonly T[],
): Array<QualifiedToolInfo<T>> {
	return [...qualify_tools(tools).values()];
}

type CallableToolCandidate<T extends ToolInfo> = {
	tool: QualifiedToolInfo<T>;
	raw_namespace_identity: string;
	raw_tool_identity: string;
	callable_namespace: string;
	callable_name: string;
};

const MAX_TOOL_NAME_LENGTH = 64;
const CALLABLE_NAME_HASH_LEN = 12;
const META_OPENAI_FILE_PARAMS = "openai/fileParams";
const FILE_PATH_GUIDANCE =
	"This parameter expects an absolute local file path. If you want to upload a file, provide the absolute path to that file here.";

function normalize_tool_info<T extends ToolInfo>(tool: T): QualifiedToolInfo<T> {
	return {
		...tool,
		callable_namespace:
			normalize_string(tool.callable_namespace) ??
			qualified_mcp_tool_name_prefix(tool.server_name),
		callable_name: normalize_string(tool.callable_name) ?? tool.name,
		plugin_display_names: [...(tool.plugin_display_names ?? [])],
	};
}

function masked_input_property_schema(
	schema: Record<string, unknown>,
): Record<string, unknown> {
	const existingDescription =
		typeof schema.description === "string" ? schema.description : "";
	const description = existingDescription
		? existingDescription.includes(FILE_PATH_GUIDANCE)
			? existingDescription
			: `${existingDescription} ${FILE_PATH_GUIDANCE}`
		: FILE_PATH_GUIDANCE;
	const isArray = schema.type === "array" || "items" in schema;

	return isArray
		? {
				description,
				type: "array",
				items: { type: "string" },
			}
		: {
				description,
				type: "string",
			};
}

function callable_name_hash_suffix(rawIdentity: string): string {
	return `_${sha1_hex(rawIdentity).slice(0, CALLABLE_NAME_HASH_LEN)}`;
}

function append_hash_suffix(value: string, rawIdentity: string): string {
	return `${value}${callable_name_hash_suffix(rawIdentity)}`;
}

function append_namespace_hash_suffix(
	namespace: string,
	rawIdentity: string,
): string {
	if (namespace.endsWith(MCP_TOOL_NAME_DELIMITER)) {
		return `${namespace.slice(
			0,
			-MCP_TOOL_NAME_DELIMITER.length,
		)}${callable_name_hash_suffix(rawIdentity)}${MCP_TOOL_NAME_DELIMITER}`;
	}
	return append_hash_suffix(namespace, rawIdentity);
}

function truncate_name(value: string, maxLength: number): string {
	return [...value].slice(0, maxLength).join("");
}

function fit_callable_parts_with_hash(
	namespace: string,
	toolName: string,
	rawIdentity: string,
): [string, string] {
	const suffix = callable_name_hash_suffix(rawIdentity);
	const maxToolLength = Math.max(0, MAX_TOOL_NAME_LENGTH - namespace.length);
	if (maxToolLength >= suffix.length) {
		const prefixLength = maxToolLength - suffix.length;
		return [namespace, `${truncate_name(toolName, prefixLength)}${suffix}`];
	}

	const maxNamespaceLength = MAX_TOOL_NAME_LENGTH - suffix.length;
	return [truncate_name(namespace, maxNamespaceLength), suffix];
}

function unique_callable_parts(
	namespace: string,
	toolName: string,
	rawIdentity: string,
	usedNames: Set<string>,
): [string, string, string] {
	const qualifiedName = `${namespace}${toolName}`;
	if (qualifiedName.length <= MAX_TOOL_NAME_LENGTH && !usedNames.has(qualifiedName)) {
		usedNames.add(qualifiedName);
		return [namespace, toolName, qualifiedName];
	}

	let attempt = 0;
	for (;;) {
		const hashInput = attempt === 0 ? rawIdentity : `${rawIdentity}\0${attempt}`;
		const [candidateNamespace, candidateToolName] =
			fit_callable_parts_with_hash(namespace, toolName, hashInput);
		const candidateName = `${candidateNamespace}${candidateToolName}`;
		if (!usedNames.has(candidateName)) {
			usedNames.add(candidateName);
			return [candidateNamespace, candidateToolName, candidateName];
		}
		attempt += 1;
	}
}

function sha1_hex(input: string): string {
	const bytes = [...new TextEncoder().encode(input)];
	const bitLength = bytes.length * 8;
	bytes.push(0x80);
	while (bytes.length % 64 !== 56) {
		bytes.push(0);
	}
	for (let shift = 56; shift >= 0; shift -= 8) {
		bytes.push(Math.floor(bitLength / 2 ** shift) & 0xff);
	}

	let h0 = 0x67452301;
	let h1 = 0xefcdab89;
	let h2 = 0x98badcfe;
	let h3 = 0x10325476;
	let h4 = 0xc3d2e1f0;

	for (let offset = 0; offset < bytes.length; offset += 64) {
		const words = new Array<number>(80).fill(0);
		for (let i = 0; i < 16; i += 1) {
			const index = offset + i * 4;
			words[i] =
				((bytes[index] ?? 0) << 24) |
				((bytes[index + 1] ?? 0) << 16) |
				((bytes[index + 2] ?? 0) << 8) |
				(bytes[index + 3] ?? 0);
		}
		for (let i = 16; i < 80; i += 1) {
			words[i] = rotate_left(
				(words[i - 3] ?? 0) ^
					(words[i - 8] ?? 0) ^
					(words[i - 14] ?? 0) ^
					(words[i - 16] ?? 0),
				1,
			);
		}

		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;

		for (let i = 0; i < 80; i += 1) {
			let f: number;
			let k: number;
			if (i < 20) {
				f = (b & c) | (~b & d);
				k = 0x5a827999;
			} else if (i < 40) {
				f = b ^ c ^ d;
				k = 0x6ed9eba1;
			} else if (i < 60) {
				f = (b & c) | (b & d) | (c & d);
				k = 0x8f1bbcdc;
			} else {
				f = b ^ c ^ d;
				k = 0xca62c1d6;
			}

			const temp = unsigned_add(
				rotate_left(a, 5),
				f,
				e,
				k,
				words[i] ?? 0,
			);
			e = d;
			d = c;
			c = rotate_left(b, 30);
			b = a;
			a = temp;
		}

		h0 = unsigned_add(h0, a);
		h1 = unsigned_add(h1, b);
		h2 = unsigned_add(h2, c);
		h3 = unsigned_add(h3, d);
		h4 = unsigned_add(h4, e);
	}

	return [h0, h1, h2, h3, h4]
		.map((value) => value.toString(16).padStart(8, "0"))
		.join("");
}

function rotate_left(value: number, bits: number): number {
	return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function unsigned_add(...values: readonly number[]): number {
	return values.reduce((total, value) => (total + value) >>> 0, 0);
}

function normalize_string(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
