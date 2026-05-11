export const MCP_TOOL_NAME_PREFIX = "mcp";
export const MCP_TOOL_NAME_DELIMITER = "__";
export const CODEX_APPS_MCP_SERVER_NAME = "codex_apps";

export function sanitize_responses_api_tool_name(name: string): string {
	let sanitized = "";
	for (const char of name) {
		sanitized += /[A-Za-z0-9_]/.test(char) ? char : "_";
	}
	return sanitized.length > 0 ? sanitized : "_";
}

export function qualified_mcp_tool_name_prefix(serverName: string): string {
	return sanitize_responses_api_tool_name(
		`${MCP_TOOL_NAME_PREFIX}${MCP_TOOL_NAME_DELIMITER}${serverName}${MCP_TOOL_NAME_DELIMITER}`,
	);
}

export * from "./auth";

export class ToolPluginProvenance {
	private readonly plugin_display_names_by_connector_id = new Map<
		string,
		string[]
	>();
	private readonly plugin_display_names_by_mcp_server_name = new Map<
		string,
		string[]
	>();

	constructor(input: {
		plugin_display_names_by_connector_id?: ReadonlyMap<string, readonly string[]> | Record<string, readonly string[]>;
		plugin_display_names_by_mcp_server_name?: ReadonlyMap<string, readonly string[]> | Record<string, readonly string[]>;
	} = {}) {
		for (const [connectorId, names] of map_entries(
			input.plugin_display_names_by_connector_id,
		)) {
			this.plugin_display_names_by_connector_id.set(connectorId, [...names]);
		}
		for (const [serverName, names] of map_entries(
			input.plugin_display_names_by_mcp_server_name,
		)) {
			this.plugin_display_names_by_mcp_server_name.set(serverName, [...names]);
		}
	}

	plugin_display_names_for_connector_id(connectorId: string): readonly string[] {
		return this.plugin_display_names_by_connector_id.get(connectorId) ?? [];
	}

	plugin_display_names_for_mcp_server_name(serverName: string): readonly string[] {
		return this.plugin_display_names_by_mcp_server_name.get(serverName) ?? [];
	}
}

function map_entries(
	input?: ReadonlyMap<string, readonly string[]> | Record<string, readonly string[]>,
): Array<[string, readonly string[]]> {
	if (!input) {
		return [];
	}
	return input instanceof Map ? [...input.entries()] : Object.entries(input);
}
