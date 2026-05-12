import type { ThreadId } from "../ids";
import type { ResponseInputItem } from "../models";
import {
	qualified_mcp_tool_name_prefix,
	sanitize_responses_api_tool_name,
} from "../../../codex-mcp/src/mcp/mod";

export type McpRequestId = string | number;

export const McpServerStartupState = {
	Starting: "starting",
	Ready: "ready",
	Failed: "failed",
	Cancelled: "cancelled",
} as const;

export type McpServerStartupState =
	(typeof McpServerStartupState)[keyof typeof McpServerStartupState];

export type McpAuthStatus =
	| "unsupported"
	| "notLoggedIn"
	| "bearerToken"
	| "oAuth";

export type McpServerStatus = {
	name: string;
	startup_state: McpServerStartupState;
	error?: string | null;
	tools?: McpToolInfo[];
	resources?: McpResourceInfo[];
	resource_templates?: McpResourceTemplateInfo[];
	auth_status?: McpAuthStatus;
	authStatus?: McpAuthStatus;
	oauth?: {
		status: "not_required" | "required" | "authenticated" | "failed";
		error?: string | null;
	} | null;
};

export type McpServerStatusDetail = "full" | "toolsAndAuthOnly";

export type McpServerStatusListOptions = {
	detail?: McpServerStatusDetail | null;
};

export type McpServerRegistry = {
	servers: Record<string, unknown>;
};

export type McpServerRefreshConfig = {
	mcp_servers: Record<string, unknown>;
	mcp_oauth_credentials_store_mode?: unknown;
};

export type McpRuntimeEnvironment = {
	cwd: string;
	environment_id?: string | null;
};

export type McpToolInfo = {
	/** Raw MCP server name used to route protocol calls. */
	server_name: string;
	/** Raw MCP tool name sent back to the MCP server. */
	name: string;
	/** Model-visible namespace. Defaults to Codex's qualified MCP namespace. */
	callable_namespace?: string | null;
	/** Model-visible tool name. Defaults to `name` for simple hosts. */
	callable_name?: string | null;
	namespace_description?: string | null;
	title?: string | null;
	description?: string | null;
	input_schema?: unknown;
	connector_id?: string | null;
	connector_name?: string | null;
	plugin_display_names?: string[];
	source_label?: string | null;
	mcp_app_resource_uri?: string | null;
};

export type McpResourceInfo = {
	uri: string;
	name?: string | null;
	description?: string | null;
	mime_type?: string | null;
};

export type McpResourceTemplateInfo = McpResourceInfo & {
	uri_template: string;
};

export type McpResourceReadParams = {
	thread_id?: ThreadId | null;
	server_name: string;
	uri: string;
};

export type McpResourceListParams = {
	thread_id?: ThreadId | null;
	server_name?: string | null;
	cursor?: string | null;
};

export type McpResourceListResponse = {
	server_name?: string | null;
	resources: McpResourceInfo[];
	next_cursor?: string | null;
};

export type McpResourceTemplateListResponse = {
	server_name?: string | null;
	resource_templates: McpResourceTemplateInfo[];
	next_cursor?: string | null;
};

export type McpResourceReadResponse = {
	server_name: string;
	uri: string;
	contents: unknown[];
};

export type McpServerToolCallParams = {
	thread_id: ThreadId;
	call_id?: string | null;
	server_name: string;
	tool_name: string;
	arguments?: unknown;
	meta?: unknown;
};

export type McpServerToolCallResponse = {
	call_id?: string | null;
	server_name: string;
	tool_name: string;
	output: unknown;
	response_item?: ResponseInputItem | null;
};

export type McpServerOauthLoginParams = {
	name: string;
};

export type McpServerOauthLoginResponse = {
	status: "unsupported" | "started";
	name: string;
	message?: string | null;
};

export type McpServerElicitationRequest =
	| {
			type: "form";
			meta?: unknown;
			message: string;
			requested_schema: unknown;
	  }
	| {
			type: "url";
			meta?: unknown;
			message: string;
			url: string;
			elicitation_id?: string | null;
	  };

export type McpServerElicitationAction = "accept" | "decline" | "cancel";

export type McpServerElicitationResponse = {
	action: McpServerElicitationAction;
	content?: unknown;
	meta?: unknown;
};

export type McpServerElicitationRequestEvent = {
	turn_id: string;
	server_name: string;
	id: McpRequestId;
	request: McpServerElicitationRequest;
};

export type McpServerElicitationResponseOp = {
	type: "mcp_server_elicitation_response";
	server_name: string;
	id: McpRequestId;
	response: McpServerElicitationResponse;
};

export type McpToolCallProgressEvent = {
	call_id: string;
	turn_id?: string | null;
	server_name: string;
	tool_name: string;
	message?: string | null;
	progress?: unknown;
};

export type McpServerStatusUpdatedEvent = {
	status: McpServerStatus;
};

export type McpServerOauthLoginCompletedEvent = {
	name: string;
	status: "completed" | "failed" | "cancelled";
	error?: string | null;
};

export function mcpToolDisplayName(tool: McpToolInfo): string {
	return `${mcpToolCallableNamespace(tool)}.${mcpToolCallableName(tool)}`;
}

export function mcpToolCallableNamespace(tool: McpToolInfo): string {
	const namespace =
		normalizeMcpToolNamePart(tool.callable_namespace) ??
		qualified_mcp_tool_name_prefix(tool.server_name);
	return sanitize_responses_api_tool_name(namespace);
}

export function mcpToolCallableName(tool: McpToolInfo): string {
	return sanitize_responses_api_tool_name(
		normalizeMcpToolNamePart(tool.callable_name) ?? tool.name,
	);
}

function normalizeMcpToolNamePart(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : null;
}
