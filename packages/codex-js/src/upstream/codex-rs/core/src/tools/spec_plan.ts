import {
	REQUEST_USER_INPUT_TOOL_NAME,
	createRequestUserInputTool,
	requestUserInputToolDescription,
} from "./handlers/request_user_input_spec";
import { requestUserInputAvailableModes } from "../request_user_input";
import {
	REQUEST_PERMISSIONS_TOOL_NAME,
	createRequestPermissionsTool,
	requestPermissionsToolDescription,
} from "./handlers/request_permissions_spec";
import {
	create_apply_patch_tool,
} from "./handlers/apply_patch_spec";
import {
	PLAN_TOOL_NAME,
} from "./handlers/plan";
import {
	create_update_plan_tool,
} from "./handlers/plan_spec";
import { APPLY_PATCH_TOOL_NAME } from "./handlers/apply_patch";
import {
	create_exec_command_tool,
	create_write_stdin_tool,
} from "./handlers/shell_spec";
import {
	LIST_MCP_RESOURCES_TOOL_NAME,
	LIST_MCP_RESOURCE_TEMPLATES_TOOL_NAME,
	READ_MCP_RESOURCE_TOOL_NAME,
} from "./handlers/mcp_resource";
import {
	create_list_mcp_resources_tool,
	create_list_mcp_resource_templates_tool,
	create_read_mcp_resource_tool,
} from "./handlers/mcp_resource_spec";
import { EXEC_COMMAND_TOOL_NAME } from "./handlers/unified_exec/exec_command";
import { WRITE_STDIN_TOOL_NAME } from "./handlers/unified_exec/write_stdin";
import {
	CLOSE_AGENT_TOOL_NAME,
	FOLLOWUP_TASK_TOOL_NAME,
	LIST_AGENTS_TOOL_NAME,
	RESUME_AGENT_TOOL_NAME,
	SEND_INPUT_TOOL_NAME,
	SEND_MESSAGE_TOOL_NAME,
	SPAWN_AGENT_TOOL_NAME,
	WAIT_AGENT_TOOL_NAME,
} from "./handlers/multi_agents";
import {
	mcpToolCallableName,
	mcpToolCallableNamespace,
	type McpToolInfo,
} from "../mcp";
import {
	CREATE_GOAL_TOOL_NAME,
	GET_GOAL_TOOL_NAME,
	UPDATE_GOAL_TOOL_NAME,
} from "./handlers/goal";
import {
	create_create_goal_tool,
	create_get_goal_tool,
	create_update_goal_tool,
} from "./handlers/goal_spec";
import {
	create_image_generation_tool,
	create_web_search_tool,
} from "./hosted_spec";
import { createToolRegistryPlan, ToolHandlerKind } from "./spec_plan_types";
import type {
	ToolsConfig,
	ToolRegistryPlan,
	ToolRegistryPlanParams,
} from "./spec_plan_types";
import { ToolName } from "./tool_name";
import {
	coalesce_loadable_tool_specs,
	dynamic_tool_to_loadable_tool_spec,
	type LoadableToolSpec,
} from "./responses_api";
import { create_tool_search_tool } from "./handlers/tool_search_spec";
import {
	TOOL_SEARCH_DEFAULT_LIMIT,
	tool_search_source_info_for_dynamic_tools,
	tool_search_source_info_for_mcp_tools,
} from "./tool_search_entry";
import { qualify_tool_infos } from "../../../codex-mcp/src/tools";

export function build_tool_registry_plan(
	config: ToolsConfig,
	params: ToolRegistryPlanParams,
): ToolRegistryPlan {
	const plan = createToolRegistryPlan();

	plan.specs.push({
		spec: create_update_plan_tool(),
		supports_parallel_tool_calls: false,
	});
	plan.handlers.push({
		name: ToolName.plain(PLAN_TOOL_NAME),
		kind: ToolHandlerKind.Plan,
	});

	if (config.thread_goal_tools_enabled) {
		plan.specs.push({
			spec: create_get_goal_tool(),
			supports_parallel_tool_calls: false,
		});
		plan.handlers.push({
			name: ToolName.plain(GET_GOAL_TOOL_NAME),
			kind: ToolHandlerKind.GetGoal,
		});
		plan.specs.push({
			spec: create_create_goal_tool(),
			supports_parallel_tool_calls: false,
		});
		plan.handlers.push({
			name: ToolName.plain(CREATE_GOAL_TOOL_NAME),
			kind: ToolHandlerKind.CreateGoal,
		});
		plan.specs.push({
			spec: create_update_goal_tool(),
			supports_parallel_tool_calls: false,
		});
		plan.handlers.push({
			name: ToolName.plain(UPDATE_GOAL_TOOL_NAME),
			kind: ToolHandlerKind.UpdateGoal,
		});
	}

	plan.specs.push({
		spec: createRequestUserInputTool(
			requestUserInputToolDescription(
				config.request_user_input_available_modes.length > 0
					? config.request_user_input_available_modes
					: requestUserInputAvailableModes(),
			),
		),
		supports_parallel_tool_calls: false,
	});
	plan.handlers.push({
		name: ToolName.plain(REQUEST_USER_INPUT_TOOL_NAME),
		kind: ToolHandlerKind.RequestUserInput,
	});

	if (config.request_permissions_tool_enabled) {
		plan.specs.push({
			spec: createRequestPermissionsTool(requestPermissionsToolDescription()),
			supports_parallel_tool_calls: false,
		});
		plan.handlers.push({
			name: ToolName.plain(REQUEST_PERMISSIONS_TOOL_NAME),
			kind: ToolHandlerKind.RequestPermissions,
		});
	}

	if (config.multi_agent_tools_enabled) {
		for (const spec of createMultiAgentTools()) {
			plan.specs.push({ spec, supports_parallel_tool_calls: false });
		}
		plan.handlers.push(
			{ name: ToolName.plain(SPAWN_AGENT_TOOL_NAME), kind: ToolHandlerKind.SpawnAgent },
			{ name: ToolName.plain(SEND_INPUT_TOOL_NAME), kind: ToolHandlerKind.SendInput },
			{ name: ToolName.plain(WAIT_AGENT_TOOL_NAME), kind: ToolHandlerKind.WaitAgent },
			{ name: ToolName.plain(CLOSE_AGENT_TOOL_NAME), kind: ToolHandlerKind.CloseAgent },
			{ name: ToolName.plain(RESUME_AGENT_TOOL_NAME), kind: ToolHandlerKind.ResumeAgent },
			{ name: ToolName.plain(LIST_AGENTS_TOOL_NAME), kind: ToolHandlerKind.ListAgents },
			{ name: ToolName.plain(SEND_MESSAGE_TOOL_NAME), kind: ToolHandlerKind.SendMessage },
			{ name: ToolName.plain(FOLLOWUP_TASK_TOOL_NAME), kind: ToolHandlerKind.FollowupTask },
		);
	}

	const mcpTools = config.mcp_tools_enabled
		? qualify_tool_infos(params.mcp_tools ?? [])
		: [];
	const deferredMcpTools = config.mcp_tools_enabled
		? qualify_tool_infos(params.deferred_mcp_tools ?? [])
		: [];
	if (config.mcp_tools_enabled && (params.mcp_tools?.length ?? 0) > 0) {
		plan.specs.push(
			{
				spec: create_list_mcp_resources_tool(),
				supports_parallel_tool_calls: true,
			},
			{
				spec: create_list_mcp_resource_templates_tool(),
				supports_parallel_tool_calls: true,
			},
			{
				spec: create_read_mcp_resource_tool(),
				supports_parallel_tool_calls: true,
			},
		);
		plan.handlers.push(
			{
				name: ToolName.plain(LIST_MCP_RESOURCES_TOOL_NAME),
				kind: ToolHandlerKind.ListMcpResources,
			},
			{
				name: ToolName.plain(LIST_MCP_RESOURCE_TEMPLATES_TOOL_NAME),
				kind: ToolHandlerKind.ListMcpResourceTemplates,
			},
			{
				name: ToolName.plain(READ_MCP_RESOURCE_TOOL_NAME),
				kind: ToolHandlerKind.ReadMcpResource,
			},
		);
	}
	const deferredMcpToolsForSearch = config.namespace_tools
		? deferredMcpTools
		: [];
	const deferredDynamicTools = params.dynamic_tools.filter(
		(tool) =>
			tool.defer_loading && (config.namespace_tools || tool.namespace == null),
	);
	if (
		config.search_tool &&
		(deferredDynamicTools.length > 0 ||
			deferredMcpToolsForSearch.length > 0)
	) {
		const sources = [
			...tool_search_source_info_for_mcp_tools(deferredMcpToolsForSearch),
			...tool_search_source_info_for_dynamic_tools(deferredDynamicTools),
		];
		plan.specs.push({
			spec: create_tool_search_tool(sources, TOOL_SEARCH_DEFAULT_LIMIT),
			supports_parallel_tool_calls: true,
		});
		plan.handlers.push({
			name: ToolName.plain("tool_search"),
			kind: ToolHandlerKind.ToolSearch,
		});
		for (const tool of deferredMcpToolsForSearch) {
			plan.handlers.push({
				name: ToolName.namespaced(
					mcpToolCallableNamespace(tool),
					mcpToolCallableName(tool),
				),
				kind: ToolHandlerKind.Mcp,
			});
		}
	}

	const webSearchTool = create_web_search_tool({
		web_search_mode: config.web_search_mode,
		web_search_config: config.web_search_config,
		web_search_tool_type: config.web_search_tool_type,
	});
	if (webSearchTool) {
		plan.specs.push({
			spec: webSearchTool,
			supports_parallel_tool_calls: false,
		});
	}

	if (config.image_gen_tool) {
		plan.specs.push({
			spec: create_image_generation_tool("png"),
			supports_parallel_tool_calls: false,
		});
	}

	if (config.exec_command_tool_enabled) {
		plan.specs.push({
			spec: create_exec_command_tool(),
			supports_parallel_tool_calls: false,
		});
		plan.handlers.push({
			name: ToolName.plain(EXEC_COMMAND_TOOL_NAME),
			kind: ToolHandlerKind.ExecCommand,
		});
	}

	if (config.write_stdin_tool_enabled) {
		plan.specs.push({
			spec: create_write_stdin_tool(),
			supports_parallel_tool_calls: false,
		});
		plan.handlers.push({
			name: ToolName.plain(WRITE_STDIN_TOOL_NAME),
			kind: ToolHandlerKind.WriteStdin,
		});
	}

	if (config.apply_patch_tool_enabled) {
		plan.specs.push({
			spec: create_apply_patch_tool(),
			supports_parallel_tool_calls: false,
		});
		plan.handlers.push({
			name: ToolName.plain(APPLY_PATCH_TOOL_NAME),
			kind: ToolHandlerKind.ApplyPatch,
		});
	}

	const dynamicToolSpecs: LoadableToolSpec[] = [];
	for (const tool of params.dynamic_tools) {
		const name = ToolName.new(tool.namespace, tool.name);
		dynamicToolSpecs.push(dynamic_tool_to_loadable_tool_spec(tool));
		plan.handlers.push({
			name,
			kind: ToolHandlerKind.DynamicTool,
		});
	}

	for (const spec of coalesce_loadable_tool_specs(dynamicToolSpecs)) {
		if (spec.type === "namespace" && !config.namespace_tools) {
			continue;
		}
		plan.specs.push({
			spec,
			supports_parallel_tool_calls: false,
		});
	}

	if (config.mcp_tools_enabled) {
		const sortedMcpTools = [...mcpTools].sort((left, right) =>
			ToolName.namespaced(
				mcpToolCallableNamespace(left),
				mcpToolCallableName(left),
			)
				.display()
				.localeCompare(
					ToolName.namespaced(
						mcpToolCallableNamespace(right),
						mcpToolCallableName(right),
					).display(),
				),
		);
		for (const spec of coalesce_loadable_tool_specs(
			sortedMcpTools.map(mcp_tool_to_loadable_tool_spec),
		)) {
			if (spec.type === "namespace" && !config.namespace_tools) {
				continue;
			}
			plan.specs.push({
				spec,
				supports_parallel_tool_calls: false,
			});
		}
		for (const tool of mcpTools) {
			plan.handlers.push({
				name: ToolName.namespaced(
					mcpToolCallableNamespace(tool),
					mcpToolCallableName(tool),
				),
				kind: ToolHandlerKind.Mcp,
			});
		}
	}

	return plan;
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
				description: tool.description ?? `Call MCP tool ${tool.server_name}.${tool.name}.`,
				strict: false,
				parameters: tool.input_schema ?? { type: "object" },
			},
		],
	};
}

function mcp_tool_namespace_description(tool: McpToolInfo): string {
	const namespaceDescription = normalizeDescription(tool.namespace_description);
	if (namespaceDescription) {
		return namespaceDescription;
	}
	const connectorName = normalizeDescription(tool.connector_name);
	if (connectorName) {
		return `Tools for working with ${connectorName}.`;
	}
	return `MCP tools provided by ${tool.source_label ?? mcpToolCallableNamespace(tool)}.`;
}

function normalizeDescription(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : null;
}

function createMultiAgentTools() {
	return [
		createFunctionTool(
			SPAWN_AGENT_TOOL_NAME,
			"Spawn a new agent. This runtime requires a Worker-backed agent executor before agents can run.",
		),
		createFunctionTool(
			SEND_INPUT_TOOL_NAME,
			"Send a message to an existing agent.",
			["target"],
		),
		createFunctionTool(
			WAIT_AGENT_TOOL_NAME,
			"Wait for agents to reach a final status.",
			["targets"],
		),
		createFunctionTool(CLOSE_AGENT_TOOL_NAME, "Close an agent.", ["target"]),
		createFunctionTool(RESUME_AGENT_TOOL_NAME, "Resume an agent.", ["id"]),
		createFunctionTool(LIST_AGENTS_TOOL_NAME, "List live agents."),
		createFunctionTool(SEND_MESSAGE_TOOL_NAME, "Send a message to an agent.", [
			"target",
			"message",
		]),
		createFunctionTool(
			FOLLOWUP_TASK_TOOL_NAME,
			"Send a message to a target agent and trigger a follow-up turn.",
			["target", "message"],
		),
	];
}

function createFunctionTool(
	name: string,
	description: string,
	required: string[] = [],
) {
	return {
		type: "function" as const,
		name,
		description,
		strict: false,
		parameters: {
			type: "object",
			properties: {},
			required,
			additionalProperties: true,
		},
	};
}
