import type { DynamicToolSpec } from "../protocol";
import {
	mcpToolCallableName,
	mcpToolCallableNamespace,
	type McpToolInfo,
} from "../mcp";
import type { ToolsConfig } from "./spec_plan_types";
import {
	coalesce_loadable_tool_specs,
	dynamic_tool_to_loadable_tool_spec,
	type LoadableToolSpec,
} from "./responses_api";
import { ToolName } from "./tool_name";
import { qualify_tool_infos } from "../../../codex-mcp/src/tools";

export const TOOL_SEARCH_TOOL_NAME = "tool_search";
export const TOOL_SEARCH_DEFAULT_LIMIT = 8;

export type ToolSearchSourceInfo = {
	name: string;
	description?: string | null;
};

export type DiscoverableTool = {
	name: string;
	title?: string | null;
	description: string;
	source: string;
	input_schema?: unknown;
	server_name?: string | null;
	tool_name?: string | null;
	mcp_app_resource_uri?: string | null;
};

export type ToolSearchEntry = {
	limit_bucket?: string | null;
	output: LoadableToolSpec;
	search_text: string;
};

export function build_tool_search_entries(input: {
	dynamic_tools: readonly DynamicToolSpec[];
	mcp_tools?: readonly McpToolInfo[];
}): ToolSearchEntry[] {
	const entries: ToolSearchEntry[] = [];
	const mcpTools = qualify_tool_infos(input.mcp_tools ?? []).sort((a, b) =>
		ToolName.namespaced(mcpToolCallableNamespace(a), mcpToolCallableName(a))
			.display()
			.localeCompare(
				ToolName.namespaced(
					mcpToolCallableNamespace(b),
					mcpToolCallableName(b),
				).display(),
			),
	);
	for (const tool of mcpTools) {
		entries.push(mcp_tool_to_tool_search_entry(tool));
	}

	const dynamicTools = [...input.dynamic_tools].sort((a, b) =>
		(a.namespace ?? "")
			.localeCompare(b.namespace ?? "") || a.name.localeCompare(b.name),
	);
	for (const tool of dynamicTools) {
		entries.push(dynamic_tool_to_tool_search_entry(tool));
	}

	return entries;
}

export function build_tool_search_entries_for_config(
	config: ToolsConfig,
	mcp_tools: readonly McpToolInfo[] | null | undefined,
	dynamic_tools: readonly DynamicToolSpec[],
): ToolSearchEntry[] {
	return build_tool_search_entries({
		dynamic_tools: dynamic_tools.filter(
			(tool) =>
				tool.defer_loading && (config.namespace_tools || tool.namespace == null),
		),
		mcp_tools: config.namespace_tools ? (mcp_tools ?? []) : [],
	});
}

export function dynamic_tool_to_tool_search_entry(
	tool: DynamicToolSpec,
): ToolSearchEntry {
	return {
		search_text: build_dynamic_search_text(tool),
		output: dynamic_tool_to_loadable_tool_spec(tool),
		limit_bucket: null,
	};
}

export function mcp_tool_to_tool_search_entry(
	tool: McpToolInfo,
): ToolSearchEntry {
	return {
		search_text: build_mcp_search_text(tool),
		output: mcp_tool_to_loadable_tool_spec(tool),
		limit_bucket: tool.server_name,
	};
}

export function tool_search_source_info_for_dynamic_tools(
	tools: readonly DynamicToolSpec[],
): ToolSearchSourceInfo[] {
	return tools.length > 0
		? [
				{
					name: "Dynamic tools",
					description: "Tools provided by the current Codex thread.",
				},
			]
		: [];
}

export function tool_search_source_info_for_mcp_tools(
	tools: readonly McpToolInfo[],
): ToolSearchSourceInfo[] {
	return tools.flatMap((tool) => {
		const name =
			normalizeSearchSource(tool.connector_name) ??
			normalizeSearchSource(tool.source_label) ??
			normalizeSearchSource(tool.server_name);
		return name
			? [
					{
						name,
						description: normalizeSearchSource(tool.namespace_description),
					},
				]
			: [];
	});
}

export function tool_search_outputs(
	entries: readonly ToolSearchEntry[],
): LoadableToolSpec[] {
	return coalesce_loadable_tool_specs(entries.map((entry) => entry.output));
}

function mcp_tool_to_loadable_tool_spec(tool: McpToolInfo): LoadableToolSpec {
	return {
		type: "namespace",
		name: mcpToolCallableNamespace(tool),
		description: mcp_tool_namespace_description(tool),
		tools: [
			{
				type: "function",
				name: mcpToolCallableName(tool),
				description:
					tool.description ?? `Call MCP tool ${tool.server_name}.${tool.name}.`,
				strict: false,
				parameters: tool.input_schema ?? { type: "object" },
				defer_loading: true,
			},
		],
	};
}

function build_dynamic_search_text(tool: DynamicToolSpec): string {
	const parts = [
		tool.name,
		tool.name.replaceAll("_", " "),
		tool.description,
		...(tool.namespace ? [tool.namespace] : []),
		...schemaPropertyNames(tool.input_schema),
	];
	return parts.join(" ");
}

function build_mcp_search_text(tool: McpToolInfo): string {
	const namespace = mcpToolCallableNamespace(tool);
	const callableName = mcpToolCallableName(tool);
	const name = ToolName.namespaced(namespace, callableName).display();
	const parts = [
		name,
		callableName,
		tool.name,
		tool.server_name,
		namespace,
		...(tool.title ? [tool.title] : []),
		...(tool.description ? [tool.description] : []),
		...(tool.source_label ? [tool.source_label] : []),
		...(tool.connector_name ? [tool.connector_name] : []),
		...(tool.namespace_description ? [tool.namespace_description] : []),
		...(tool.plugin_display_names ?? []),
		...schemaPropertyNames(tool.input_schema),
	];
	return parts.join(" ");
}

function mcp_tool_namespace_description(tool: McpToolInfo): string {
	const namespaceDescription = normalizeSearchSource(tool.namespace_description);
	if (namespaceDescription) {
		return namespaceDescription;
	}
	const connectorName = normalizeSearchSource(tool.connector_name);
	if (connectorName) {
		return `Tools for working with ${connectorName}.`;
	}
	return `MCP tools provided by ${tool.source_label ?? mcpToolCallableNamespace(tool)}.`;
}

function normalizeSearchSource(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : null;
}

function schemaPropertyNames(schema: unknown): string[] {
	if (!schema || typeof schema !== "object" || !("properties" in schema)) {
		return [];
	}
	const properties = (schema as { properties?: unknown }).properties;
	return properties && typeof properties === "object"
		? Object.keys(properties)
		: [];
}
