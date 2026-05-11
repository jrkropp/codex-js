import { CODEX_APPS_MCP_SERVER_NAME } from "./mcp/mod";
import type { ToolInfo } from "./tools";

export const CODEX_APPS_TOOLS_CACHE_SCHEMA_VERSION = 2;
export const CODEX_APPS_TOOLS_CACHE_DIR = "cache/codex_apps_tools";

export type CodexAuthLike = {
	account_id?: string | null;
	chatgpt_user_id?: string | null;
	is_workspace_account?: boolean | (() => boolean | null | undefined) | null;
	get_account_id?: () => string | null | undefined;
	get_chatgpt_user_id?: () => string | null | undefined;
};

export type CodexAppsToolsCacheKey = {
	account_id?: string | null;
	chatgpt_user_id?: string | null;
	is_workspace_account: boolean;
};

export function codex_apps_tools_cache_key(
	auth?: CodexAuthLike | null,
): CodexAppsToolsCacheKey {
	return {
		account_id: auth?.get_account_id?.() ?? auth?.account_id ?? null,
		chatgpt_user_id:
			auth?.get_chatgpt_user_id?.() ?? auth?.chatgpt_user_id ?? null,
		is_workspace_account: codex_auth_is_workspace_account(auth),
	};
}

export function filter_non_codex_apps_mcp_tools_only(
	mcpTools: ReadonlyMap<string, ToolInfo> | Record<string, ToolInfo>,
): Map<string, ToolInfo> {
	const entries =
		mcpTools instanceof Map ? [...mcpTools.entries()] : Object.entries(mcpTools);
	return new Map(
		entries.filter(([, tool]) => tool.server_name !== CODEX_APPS_MCP_SERVER_NAME),
	);
}

export type CodexAppsToolsCacheStorage = {
	read(path: string): string | Uint8Array | null | undefined;
	write(path: string, bytes: string): void;
};

export class InMemoryCodexAppsToolsCacheStorage
	implements CodexAppsToolsCacheStorage
{
	private readonly files = new Map<string, string>();

	read(path: string): string | null {
		return this.files.get(path) ?? null;
	}

	write(path: string, bytes: string): void {
		this.files.set(path, bytes);
	}
}

export class CodexAppsToolsCacheContext {
	constructor(
		readonly codex_home: string,
		readonly user_key: CodexAppsToolsCacheKey,
		readonly storage: CodexAppsToolsCacheStorage | null = null,
	) {}

	cache_path(): string {
		const userKeyJson = JSON.stringify(this.user_key);
		const userKeyHash = sha1_hex(userKeyJson);
		return `${trim_trailing_slashes(this.codex_home)}/${CODEX_APPS_TOOLS_CACHE_DIR}/${userKeyHash}.json`;
	}
}

export type CachedCodexAppsToolsLoad =
	| { type: "Hit"; tools: ToolInfo[] }
	| { type: "Missing" }
	| { type: "Invalid" };

export const CachedCodexAppsToolsLoad = {
	Hit(tools: ToolInfo[]): CachedCodexAppsToolsLoad {
		return { type: "Hit", tools };
	},
	Missing: { type: "Missing" } as CachedCodexAppsToolsLoad,
	Invalid: { type: "Invalid" } as CachedCodexAppsToolsLoad,
} as const;

export function normalize_codex_apps_tool_title(
	server_name: string,
	connector_name: string | null | undefined,
	value: string,
): string {
	if (server_name !== CODEX_APPS_MCP_SERVER_NAME) {
		return value;
	}

	const connectorName = connector_name?.trim();
	if (!connectorName) {
		return value;
	}

	const prefix = `${connectorName}_`;
	const stripped = value.startsWith(prefix) ? value.slice(prefix.length) : null;
	return stripped && stripped.length > 0 ? stripped : value;
}

export function normalize_codex_apps_callable_name(
	server_name: string,
	tool_name: string,
	connector_id?: string | null,
	connector_name?: string | null,
): string {
	if (server_name !== CODEX_APPS_MCP_SERVER_NAME) {
		return tool_name;
	}

	const sanitizedToolName = sanitize_name(tool_name);
	const sanitizedConnectorName = sanitize_optional_name(connector_name);
	if (
		sanitizedConnectorName &&
		sanitizedToolName.startsWith(sanitizedConnectorName)
	) {
		const stripped = sanitizedToolName.slice(sanitizedConnectorName.length);
		if (stripped.length > 0) {
			return stripped;
		}
	}

	const sanitizedConnectorId = sanitize_optional_name(connector_id);
	if (sanitizedConnectorId && sanitizedToolName.startsWith(sanitizedConnectorId)) {
		const stripped = sanitizedToolName.slice(sanitizedConnectorId.length);
		if (stripped.length > 0) {
			return stripped;
		}
	}

	return sanitizedToolName;
}

export function normalize_codex_apps_callable_namespace(
	server_name: string,
	connector_name?: string | null,
): string {
	if (server_name === CODEX_APPS_MCP_SERVER_NAME && connector_name) {
		return `mcp__${server_name}__${sanitize_name(connector_name)}`;
	}
	return `mcp__${server_name}__`;
}

export function write_cached_codex_apps_tools_if_needed(
	server_name: string,
	cache_context: CodexAppsToolsCacheContext | null | undefined,
	tools: readonly ToolInfo[],
): void {
	if (server_name !== CODEX_APPS_MCP_SERVER_NAME || !cache_context) {
		return;
	}
	write_cached_codex_apps_tools(cache_context, tools);
}

export function load_startup_cached_codex_apps_tools_snapshot(
	server_name: string,
	cache_context: CodexAppsToolsCacheContext | null | undefined,
): ToolInfo[] | null {
	if (server_name !== CODEX_APPS_MCP_SERVER_NAME || !cache_context) {
		return null;
	}
	const loaded = load_cached_codex_apps_tools(cache_context);
	return loaded.type === "Hit" ? loaded.tools : null;
}

export function read_cached_codex_apps_tools(
	cache_context: CodexAppsToolsCacheContext,
): ToolInfo[] | null {
	const loaded = load_cached_codex_apps_tools(cache_context);
	return loaded.type === "Hit" ? loaded.tools : null;
}

export function load_cached_codex_apps_tools(
	cache_context: CodexAppsToolsCacheContext,
): CachedCodexAppsToolsLoad {
	const bytes = cache_context.storage?.read(cache_context.cache_path());
	if (bytes == null) {
		return CachedCodexAppsToolsLoad.Missing;
	}

	let cache: CodexAppsToolsDiskCache;
	try {
		const raw =
			typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
		cache = JSON.parse(raw) as CodexAppsToolsDiskCache;
	} catch {
		return CachedCodexAppsToolsLoad.Invalid;
	}

	if (
		cache.schema_version !== CODEX_APPS_TOOLS_CACHE_SCHEMA_VERSION ||
		!Array.isArray(cache.tools)
	) {
		return CachedCodexAppsToolsLoad.Invalid;
	}

	return CachedCodexAppsToolsLoad.Hit(
		filter_disallowed_codex_apps_tools(cache.tools),
	);
}

export function write_cached_codex_apps_tools(
	cache_context: CodexAppsToolsCacheContext,
	tools: readonly ToolInfo[],
): void {
	if (!cache_context.storage) {
		return;
	}
	const cache: CodexAppsToolsDiskCache = {
		schema_version: CODEX_APPS_TOOLS_CACHE_SCHEMA_VERSION,
		tools: filter_disallowed_codex_apps_tools([...tools]),
	};
	cache_context.storage.write(
		cache_context.cache_path(),
		JSON.stringify(cache, null, 2),
	);
}

export function filter_disallowed_codex_apps_tools(
	tools: ToolInfo[],
): ToolInfo[] {
	return tools.filter((tool) =>
		tool.connector_id == null ? true : is_connector_id_allowed(tool.connector_id),
	);
}

export function sanitize_name(name: string): string {
	return sanitize_slug(name).replaceAll("-", "_");
}

export function is_connector_id_allowed(
	connector_id: string,
	first_party_chat_originator = false,
): boolean {
	const disallowedConnectorIds = first_party_chat_originator
		? FIRST_PARTY_CHAT_DISALLOWED_CONNECTOR_IDS
		: DISALLOWED_CONNECTOR_IDS;
	return (
		!connector_id.startsWith(DISALLOWED_CONNECTOR_PREFIX) &&
		!disallowedConnectorIds.has(connector_id)
	);
}

type CodexAppsToolsDiskCache = {
	schema_version: number;
	tools: ToolInfo[];
};

const DISALLOWED_CONNECTOR_IDS = new Set([
	"asdk_app_6938a94a61d881918ef32cb999ff937c",
	"connector_2b0a9009c9c64bf9933a3dae3f2b1254",
	"connector_3f8d1a79f27c4c7ba1a897ab13bf37dc",
	"connector_68de829bf7648191acd70a907364c67c",
	"connector_68e004f14af881919eb50893d3d9f523",
	"connector_69272cb413a081919685ec3c88d1744e",
]);
const FIRST_PARTY_CHAT_DISALLOWED_CONNECTOR_IDS = new Set([
	"connector_0f9c9d4592e54d0a9a12b3f44a1e2010",
]);
const DISALLOWED_CONNECTOR_PREFIX = "connector_openai_";

function sanitize_optional_name(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? sanitize_name(trimmed) : null;
}

function codex_auth_is_workspace_account(
	auth?: CodexAuthLike | null,
): boolean {
	const value = auth?.is_workspace_account;
	return Boolean(typeof value === "function" ? value() : value);
}

function sanitize_slug(name: string): string {
	let normalized = "";
	for (const character of name) {
		normalized += /[A-Za-z0-9]/.test(character)
			? character.toLowerCase()
			: "-";
	}
	normalized = normalized.replace(/^-+|-+$/g, "");
	return normalized.length > 0 ? normalized : "app";
}

function trim_trailing_slashes(value: string): string {
	return value.replace(/\/+$/g, "");
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
		for (let index = 0; index < 16; index += 1) {
			const byteOffset = offset + index * 4;
			words[index] =
				((bytes[byteOffset] ?? 0) << 24) |
				((bytes[byteOffset + 1] ?? 0) << 16) |
				((bytes[byteOffset + 2] ?? 0) << 8) |
				(bytes[byteOffset + 3] ?? 0);
		}
		for (let index = 16; index < 80; index += 1) {
			words[index] = rotate_left(
				(words[index - 3] ?? 0) ^
					(words[index - 8] ?? 0) ^
					(words[index - 14] ?? 0) ^
					(words[index - 16] ?? 0),
				1,
			);
		}

		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;

		for (let index = 0; index < 80; index += 1) {
			let f: number;
			let k: number;
			if (index < 20) {
				f = (b & c) | (~b & d);
				k = 0x5a827999;
			} else if (index < 40) {
				f = b ^ c ^ d;
				k = 0x6ed9eba1;
			} else if (index < 60) {
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
				words[index] ?? 0,
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
