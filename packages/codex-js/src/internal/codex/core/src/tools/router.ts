import type { McpToolInfo } from "../mcp";
import {
	mcpToolCallableName,
	mcpToolCallableNamespace,
} from "../mcp";
import type { ProviderCapabilities } from "../model-provider";
import type { DynamicToolSpec, ResponseItem } from "../protocol";
import { requestUserInputAvailableModes } from "../request_user_input";
import {
	CancellationToken,
	type ConfiguredToolSpec,
	ToolRegistry,
	type ToolArgumentDiffConsumer,
	type ToolPayload,
	type ToolSpec,
} from "./context";
import { build_specs_with_discoverable_tools } from "./spec";
import {
	defaultToolsConfig,
	type ToolsConfig,
} from "./spec_plan_types";
import { ToolName, type ToolNameInput } from "./tool_name";
import type { Session } from "../session/session";
import type { TurnContext } from "../session/turn-context";
import type { ToolCallSource } from "./context";
import type { DiscoverableTool } from "./tool_search_entry";
import { toolSpecName } from "./tool_spec";

export type ToolRouterParams = {
	dynamic_tools: readonly DynamicToolSpec[];
	mcp_tools?: readonly McpToolInfo[];
	deferred_mcp_tools?: readonly McpToolInfo[];
	unavailable_called_tools?: readonly ToolName[];
	parallel_mcp_server_names?: ReadonlySet<string>;
	discoverable_tools?: readonly DiscoverableTool[];
	provider_capabilities?: Partial<ProviderCapabilities>;
	tools_config?: Partial<ToolsConfig>;
};

export type ToolCall = {
	call_id: string;
	tool_name: ToolName;
	payload: ToolPayload;
};

export class ToolRouter {
	private constructor(
		private readonly tool_registry: ToolRegistry,
		private readonly configured_specs: ConfiguredToolSpec[],
		private readonly visible_specs: ToolSpec[],
		private readonly parallel_tool_names: Set<string>,
		private readonly parallel_mcp_server_names: ReadonlySet<string>,
	) {}

	static from_config(params: ToolRouterParams): ToolRouter {
		const availableModes = requestUserInputAvailableModes();
		const config = defaultToolsConfig({
			namespace_tools: params.provider_capabilities?.namespace_tools,
			image_generation: params.provider_capabilities?.image_generation,
			web_search: params.provider_capabilities?.web_search,
			request_user_input_available_modes: availableModes,
			...params.tools_config,
		});
		const builder = build_specs_with_discoverable_tools(config, {
			dynamic_tools: params.dynamic_tools,
			mcp_tools: params.mcp_tools ?? [],
			deferred_mcp_tools: params.deferred_mcp_tools ?? params.mcp_tools ?? [],
			unavailable_called_tools: params.unavailable_called_tools ?? [],
			parallel_mcp_tool_names: [],
			discoverable_tools: params.discoverable_tools ?? [],
		});
		const { specs, registry } = builder.build();
		const deferredDynamicToolNames = new Set(
			params.dynamic_tools
				.filter((tool) => tool.defer_loading)
				.map((tool) => ToolName.from(tool).key()),
		);
		const model_visible_specs = specs
			.map((configuredTool) => configuredTool.spec)
			.map((spec) => filter_deferred_dynamic_tool_spec(spec, deferredDynamicToolNames))
			.filter((spec): spec is ToolSpec => spec !== null);

		return new ToolRouter(
			registry,
			specs,
			model_visible_specs,
			new Set(configured_parallel_tool_names(specs)),
			params.parallel_mcp_server_names ?? new Set<string>(),
		);
	}

	specs(): ToolSpec[] {
		return this.configured_specs.map((tool) => tool.spec);
	}

	configured_tools(): ConfiguredToolSpec[] {
		return this.configured_specs;
	}

	model_visible_specs(): ToolSpec[] {
		return [...this.visible_specs];
	}

	registry_for_test(): ToolRegistry {
		return this.tool_registry;
	}

	registry(): ToolRegistry {
		return this.tool_registry;
	}

	find_spec(toolName: ToolNameInput): ToolSpec | null {
		const name = ToolName.from(toolName);
		return findToolSpec(this.specs(), name);
	}

	createDiffConsumer(toolName: ToolNameInput): ToolArgumentDiffConsumer | null {
		return this.tool_registry.createDiffConsumer(toolName);
	}

	tool_supports_parallel(call: ToolCall): boolean {
		if (call.payload.type === "mcp") {
			return this.parallel_mcp_server_names.has(call.payload.server);
		}
		if (call.tool_name.namespace !== null) {
			return false;
		}
		return this.parallel_tool_names.has(call.tool_name.key());
	}

	static async build_tool_call(
		session: Session,
		item: ResponseItem,
	): Promise<ToolCall | null> {
		if (isFunctionCallResponseItem(item)) {
			const toolName = ToolName.new(item.namespace, item.name);
			const mcpTool = toolName.namespace
				? await session.resolve_mcp_tool_info(toolName.display())
				: null;
			if (mcpTool) {
				return {
					call_id: item.call_id,
					tool_name: ToolName.namespaced(
						mcpToolCallableNamespace(mcpTool),
						mcpToolCallableName(mcpTool),
					),
					payload: {
						type: "mcp",
						server: mcpTool.server_name,
						tool: mcpTool.name,
						raw_arguments: item.arguments,
					},
				};
			}
			return {
				call_id: item.call_id,
				tool_name: toolName,
				payload: {
					type: "function",
					arguments: item.arguments,
				},
			};
		}

		if (isCustomToolCallResponseItem(item)) {
			return {
				call_id: item.call_id,
				tool_name: ToolName.plain(item.name),
				payload: {
					type: "custom",
					input: item.input,
				},
			};
		}

		if (isClientToolSearchCallResponseItem(item)) {
			return {
				call_id: item.call_id,
				tool_name: ToolName.plain("tool_search"),
				payload: {
					type: "tool_search",
					arguments: item.arguments,
				},
			};
		}

		if (isLocalShellCallResponseItem(item)) {
			return {
				call_id: item.call_id,
				tool_name: ToolName.plain("local_shell"),
				payload: {
					type: "local_shell",
					params: item.action,
				},
			};
		}

		return null;
	}

	async dispatch_tool_call_with_code_mode_result(params: {
		session: Session;
		turn: TurnContext;
		call: ToolCall;
		source?: ToolCallSource;
		signal?: AbortSignal;
	}) {
		const { session, turn, call } = params;
		return this.tool_registry.dispatchAny({
			session,
			turn,
			cancellation_token: new CancellationToken(params.signal),
			call_id: call.call_id,
			tool_name: call.tool_name,
			source: params.source ?? { type: "direct" },
			payload: call.payload,
		});
	}
}

function filter_deferred_dynamic_tool_spec(
	spec: ToolSpec,
	deferredDynamicToolNames: Set<string>,
): ToolSpec | null {
	if (spec.type === "function") {
		return deferredDynamicToolNames.has(ToolName.plain(spec.name).key())
			? null
			: spec;
	}

	if (spec.type === "namespace") {
		const visibleTools = spec.tools.filter(
			(tool) =>
				!deferredDynamicToolNames.has(
					ToolName.namespaced(spec.name, tool.name).key(),
				),
		);

		return visibleTools.length > 0
			? {
					...spec,
					tools: visibleTools,
				}
			: null;
	}

	return spec;
}

function configured_parallel_tool_names(specs: ConfiguredToolSpec[]): string[] {
	return specs
		.filter((spec) => spec.supports_parallel_tool_calls)
		.filter((spec) => spec.spec.type !== "namespace")
		.map((spec) => ToolName.plain(toolSpecName(spec.spec)).key());
}

function findToolSpec(specs: ToolSpec[], toolName: ToolName): ToolSpec | null {
	for (const spec of specs) {
		if (
			toolName.namespace === null &&
			(spec.type === "function" || spec.type === "custom") &&
			spec.name === toolName.name
		) {
			return spec;
		}

		if (spec.type === "namespace" && spec.name === toolName.namespace) {
			const nestedTool = spec.tools.find((tool) => tool.name === toolName.name);
			if (nestedTool) {
				return nestedTool;
			}
		}
	}

	return null;
}

function isFunctionCallResponseItem(
	item: ResponseItem,
): item is ResponseItem & {
	type: "function_call";
	call_id: string;
	name: string;
	namespace?: string | null;
	arguments: string;
} {
	return (
		item.type === "function_call" &&
		typeof item.call_id === "string" &&
		typeof item.name === "string" &&
		(item.namespace === undefined ||
			item.namespace === null ||
			typeof item.namespace === "string") &&
		typeof item.arguments === "string"
	);
}

function isCustomToolCallResponseItem(
	item: ResponseItem,
): item is ResponseItem & {
	type: "custom_tool_call";
	call_id: string;
	name: string;
	input: string;
} {
	return (
		item.type === "custom_tool_call" &&
		typeof item.call_id === "string" &&
		typeof item.name === "string" &&
		typeof item.input === "string"
	);
}

function isClientToolSearchCallResponseItem(
	item: ResponseItem,
): item is ResponseItem & {
	type: "tool_search_call";
	call_id: string;
	execution: "client";
	arguments: Record<string, unknown>;
} {
	return (
		item.type === "tool_search_call" &&
		typeof item.call_id === "string" &&
		item.execution === "client" &&
		typeof item.arguments === "object" &&
		item.arguments !== null
	);
}

function isLocalShellCallResponseItem(
	item: ResponseItem,
): item is ResponseItem & {
	type: "local_shell_call";
	call_id: string;
	action: Record<string, unknown>;
} {
	return (
		item.type === "local_shell_call" &&
		typeof item.call_id === "string" &&
		typeof item.action === "object" &&
		item.action !== null
	);
}
