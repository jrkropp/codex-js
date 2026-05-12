import { requestUserInputAvailableModes } from "../request_user_input";
import {
	mcpToolCallableName,
	mcpToolCallableNamespace,
	type McpToolInfo,
} from "../mcp";
import type { DynamicToolSpec } from "../protocol";
import { ToolRegistryBuilder } from "./registry";
import type { ToolSpec } from "./context";
import { DynamicToolHandler } from "./handlers/dynamic";
import { ApplyPatchHandler } from "./handlers/apply_patch";
import { PlanHandler } from "./handlers/plan";
import { ExecCommandHandler } from "./handlers/unified_exec/exec_command";
import { WriteStdinHandler } from "./handlers/unified_exec/write_stdin";
import {
	CreateGoalHandler,
	GetGoalHandler,
	UpdateGoalHandler,
} from "./handlers/goal";
import { McpToolHandler } from "./handlers/mcp";
import {
	ListMcpResourcesHandler,
	ListMcpResourceTemplatesHandler,
	ReadMcpResourceHandler,
} from "./handlers/mcp_resource";
import {
	CloseAgentHandler,
	FollowupTaskHandler,
	ListAgentsHandler,
	ResumeAgentHandler,
	SendInputHandler,
	SendMessageHandler,
	SpawnAgentHandler,
	WaitAgentHandler,
} from "./handlers/multi_agents";
import { RequestPermissionsHandler } from "./handlers/request_permissions";
import { RequestUserInputHandler } from "./handlers/request_user_input";
import { ToolSearchHandler } from "./handlers/tool_search";
import {
	UnavailableToolHandler,
	unavailable_tool_message,
} from "./handlers/unavailable_tool";
import { build_tool_registry_plan } from "./spec_plan";
import {
	ToolHandlerKind,
	type ToolRegistryPlanParams,
	type ToolsConfig,
} from "./spec_plan_types";
import { ToolName } from "./tool_name";
import { build_tool_search_entries_for_config } from "./tool_search_entry";
import { qualify_tool_infos } from "../../../codex-mcp/src/tools";

export type BuildSpecsWithDiscoverableToolsParams = ToolRegistryPlanParams & {
	dynamic_tools: readonly DynamicToolSpec[];
	mcp_tools?: readonly McpToolInfo[];
};

export function build_specs_with_discoverable_tools(
	config: ToolsConfig,
	params: BuildSpecsWithDiscoverableToolsParams,
): ToolRegistryBuilder {
	const plan = build_tool_registry_plan(config, params);
	const builder = new ToolRegistryBuilder();

	for (const configuredSpec of plan.specs) {
		builder.pushSpecWithParallelSupport(
			configuredSpec.spec,
			configuredSpec.supports_parallel_tool_calls,
		);
	}

	const availableModes =
		config.request_user_input_available_modes.length > 0
			? config.request_user_input_available_modes
			: requestUserInputAvailableModes();
	const visibleMcpTools = qualify_tool_infos(params.mcp_tools ?? []);
	const deferredMcpTools = qualify_tool_infos(params.deferred_mcp_tools ?? []);
	const mcpTools = [...visibleMcpTools, ...deferredMcpTools];
	const deferredDynamicTools = params.dynamic_tools.filter(
		(tool) =>
			tool.defer_loading && (config.namespace_tools || tool.namespace == null),
	);
	const existingSpecNames = new Set(
		plan.specs.map((configuredSpec) => toolSpecDisplayName(configuredSpec.spec)),
	);

	for (const handlerSpec of plan.handlers) {
		switch (handlerSpec.kind) {
			case ToolHandlerKind.RequestUserInput:
				builder.registerHandler(
					new RequestUserInputHandler({ available_modes: [...availableModes] }),
				);
				break;
			case ToolHandlerKind.RequestPermissions:
				builder.registerHandler(new RequestPermissionsHandler());
				break;
			case ToolHandlerKind.DynamicTool:
				builder.registerHandler(
					new DynamicToolHandler({ tool_name: handlerSpec.name }),
				);
				break;
			case ToolHandlerKind.ToolSearch:
				builder.registerHandler(
					new ToolSearchHandler(
						build_tool_search_entries_for_config(
							config,
							deferredMcpTools,
							deferredDynamicTools,
						),
					),
				);
				break;
			case ToolHandlerKind.Mcp: {
				const toolName = ToolName.from(handlerSpec.name);
				const tool = mcpTools.find(
					(candidate) =>
						mcpToolCallableNamespace(candidate) === toolName.namespace &&
						mcpToolCallableName(candidate) === toolName.name,
				);
				if (tool) {
					builder.registerHandler(new McpToolHandler(tool));
				}
				break;
			}
			case ToolHandlerKind.ListMcpResources:
				builder.registerHandler(new ListMcpResourcesHandler());
				break;
			case ToolHandlerKind.ListMcpResourceTemplates:
				builder.registerHandler(new ListMcpResourceTemplatesHandler());
				break;
			case ToolHandlerKind.ReadMcpResource:
				builder.registerHandler(new ReadMcpResourceHandler());
				break;
			case ToolHandlerKind.ExecCommand:
				builder.registerHandler(new ExecCommandHandler());
				break;
			case ToolHandlerKind.WriteStdin:
				builder.registerHandler(new WriteStdinHandler());
				break;
			case ToolHandlerKind.ApplyPatch:
				builder.registerHandler(new ApplyPatchHandler());
				break;
			case ToolHandlerKind.Plan:
				builder.registerHandler(new PlanHandler());
				break;
			case ToolHandlerKind.GetGoal:
				builder.registerHandler(new GetGoalHandler());
				break;
			case ToolHandlerKind.CreateGoal:
				builder.registerHandler(new CreateGoalHandler());
				break;
			case ToolHandlerKind.UpdateGoal:
				builder.registerHandler(new UpdateGoalHandler());
				break;
			case ToolHandlerKind.SpawnAgent:
				builder.registerHandler(new SpawnAgentHandler());
				break;
			case ToolHandlerKind.SendInput:
				builder.registerHandler(new SendInputHandler());
				break;
			case ToolHandlerKind.WaitAgent:
				builder.registerHandler(new WaitAgentHandler());
				break;
			case ToolHandlerKind.CloseAgent:
				builder.registerHandler(new CloseAgentHandler());
				break;
			case ToolHandlerKind.ResumeAgent:
				builder.registerHandler(new ResumeAgentHandler());
				break;
			case ToolHandlerKind.ListAgents:
				builder.registerHandler(new ListAgentsHandler());
				break;
			case ToolHandlerKind.SendMessage:
				builder.registerHandler(new SendMessageHandler());
				break;
			case ToolHandlerKind.FollowupTask:
				builder.registerHandler(new FollowupTaskHandler());
				break;
			case ToolHandlerKind.UnavailableTool:
				builder.registerHandler(new UnavailableToolHandler(handlerSpec.name));
				break;
		}
	}

	const visibleMcpToolKeys = new Set(
		visibleMcpTools.map((tool) =>
			ToolName.namespaced(
				mcpToolCallableNamespace(tool),
				mcpToolCallableName(tool),
			).key(),
		),
	);
	for (const tool of deferredMcpTools) {
		const toolName = ToolName.namespaced(
			mcpToolCallableNamespace(tool),
			mcpToolCallableName(tool),
		);
		if (!visibleMcpToolKeys.has(toolName.key())) {
			builder.registerHandler(new McpToolHandler(tool));
		}
	}

	for (const toolName of params.unavailable_called_tools ?? []) {
		const displayName = toolName.display();
		if (!existingSpecNames.has(displayName)) {
			builder.pushSpec(createUnavailableToolSpec(displayName));
			existingSpecNames.add(displayName);
		}
		builder.registerHandler(new UnavailableToolHandler(toolName));
	}

	return builder;
}

export { ToolRegistryBuilder };

function toolSpecDisplayName(spec: ToolSpec): string {
	if (spec.type === "namespace") {
		return spec.name;
	}
	if ("name" in spec) {
		return spec.name;
	}
	return spec.type;
}

function createUnavailableToolSpec(toolName: string): ToolSpec {
	return {
		type: "function",
		name: toolName,
		description: unavailable_tool_message(
			toolName,
			"Calling this placeholder returns an error explaining that the tool is unavailable.",
		),
		strict: false,
		parameters: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
	};
}
