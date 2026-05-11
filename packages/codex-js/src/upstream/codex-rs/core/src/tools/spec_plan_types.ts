import type { ModeKind } from "../config-types";
import type { McpToolInfo } from "../mcp";
import type { DynamicToolSpec } from "../protocol/dynamic_tools";
import type { ConfiguredToolSpec } from "./context";
import type { ToolName } from "./tool_name";
import type { DiscoverableTool } from "./tool_search_entry";

export const ToolHandlerKind = {
	DynamicTool: "DynamicTool",
	RequestPermissions: "RequestPermissions",
	RequestUserInput: "RequestUserInput",
	ToolSearch: "ToolSearch",
	UnavailableTool: "UnavailableTool",
	Mcp: "Mcp",
	ListMcpResources: "ListMcpResources",
	ListMcpResourceTemplates: "ListMcpResourceTemplates",
	ReadMcpResource: "ReadMcpResource",
	ExecCommand: "ExecCommand",
	WriteStdin: "WriteStdin",
	ApplyPatch: "ApplyPatch",
	Plan: "Plan",
	GetGoal: "GetGoal",
	CreateGoal: "CreateGoal",
	UpdateGoal: "UpdateGoal",
	SpawnAgent: "SpawnAgent",
	SendInput: "SendInput",
	WaitAgent: "WaitAgent",
	CloseAgent: "CloseAgent",
	ResumeAgent: "ResumeAgent",
	ListAgents: "ListAgents",
	SendMessage: "SendMessage",
	FollowupTask: "FollowupTask",
} as const;

export type ToolHandlerKind =
	(typeof ToolHandlerKind)[keyof typeof ToolHandlerKind];

export type ToolHandlerSpec = {
	name: ToolName;
	kind: ToolHandlerKind;
};

export type ToolRegistryPlan = {
	specs: ConfiguredToolSpec[];
	handlers: ToolHandlerSpec[];
};

export type ToolRegistryPlanParams = {
	dynamic_tools: readonly DynamicToolSpec[];
	mcp_tools?: readonly McpToolInfo[];
	deferred_mcp_tools?: readonly McpToolInfo[];
	discoverable_tools?: readonly DiscoverableTool[];
	tool_namespaces?: readonly string[];
	unavailable_called_tools?: readonly ToolName[];
	parallel_mcp_tool_names?: readonly ToolName[];
};

export type WebSearchMode = "disabled" | "cached" | "live";

export type WebSearchToolType = "text" | "text_and_image";

export type WebSearchConfig = {
	filters?: unknown;
	user_location?: unknown;
	search_context_size?: unknown;
};

export type ToolsConfig = {
	namespace_tools: boolean;
	request_permissions_tool_enabled: boolean;
	request_user_input_available_modes: readonly ModeKind[];
	search_tool: boolean;
	web_search_mode: WebSearchMode | null;
	web_search_tool_type: WebSearchToolType;
	web_search_config?: WebSearchConfig | null;
	image_gen_tool: boolean;
	exec_command_tool_enabled: boolean;
	write_stdin_tool_enabled: boolean;
	apply_patch_tool_enabled: boolean;
	thread_goal_tools_enabled: boolean;
	mcp_tools_enabled: boolean;
	multi_agent_tools_enabled: boolean;
};

export type DefaultToolsConfigInput = {
	namespace_tools?: boolean;
	image_generation?: boolean;
	web_search?: boolean;
	request_permissions_tool_enabled?: boolean;
	request_user_input_available_modes?: readonly ModeKind[];
	search_tool?: boolean;
	web_search_mode?: WebSearchMode | null;
	web_search_tool_type?: WebSearchToolType;
	web_search_config?: WebSearchConfig | null;
	image_gen_tool?: boolean;
	exec_command_tool_enabled?: boolean;
	write_stdin_tool_enabled?: boolean;
	apply_patch_tool_enabled?: boolean;
	thread_goal_tools_enabled?: boolean;
	mcp_tools_enabled?: boolean;
	multi_agent_tools_enabled?: boolean;
};

export function createToolRegistryPlan(): ToolRegistryPlan {
	return {
		specs: [],
		handlers: [],
	};
}

export function defaultToolsConfig(
	input: DefaultToolsConfigInput = {},
): ToolsConfig {
	return {
		namespace_tools: input.namespace_tools ?? true,
		request_permissions_tool_enabled:
			input.request_permissions_tool_enabled ?? true,
		request_user_input_available_modes:
			input.request_user_input_available_modes ?? [],
		search_tool: input.search_tool ?? true,
		web_search_mode:
			input.web_search === false ? "disabled" : input.web_search_mode ?? "cached",
		web_search_tool_type: input.web_search_tool_type ?? "text",
		web_search_config: input.web_search_config ?? null,
		image_gen_tool: input.image_gen_tool ?? input.image_generation ?? false,
		exec_command_tool_enabled: input.exec_command_tool_enabled ?? false,
		write_stdin_tool_enabled: input.write_stdin_tool_enabled ?? false,
		apply_patch_tool_enabled: input.apply_patch_tool_enabled ?? false,
		thread_goal_tools_enabled: input.thread_goal_tools_enabled ?? true,
		mcp_tools_enabled: input.mcp_tools_enabled ?? true,
		multi_agent_tools_enabled: input.multi_agent_tools_enabled ?? false,
	};
}
