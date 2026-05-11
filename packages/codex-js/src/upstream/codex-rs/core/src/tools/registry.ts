export {
	FunctionCallError,
	FunctionCallErrorKind,
	matchesToolKind,
	ToolKind,
	ToolRegistry,
	type ConfiguredToolSpec,
	type PostToolUsePayload,
	type PreToolUsePayload,
	type ToolArgumentDiffConsumer,
	type ToolHandler,
	type ToolSpec,
} from "./context";
import {
	ToolRegistry,
	type ConfiguredToolSpec,
	type ToolHandler,
	type ToolSpec,
} from "./context";
import { ToolName } from "./tool_name";
export * from "./responses_api";
export * from "./spec";
export * from "./tool_spec";
export * from "./tool_search_entry";
export * from "./handlers/apply_patch";
export * from "./handlers/apply_patch_spec";
export * from "./handlers/shell_spec";
export * from "./handlers/unified_exec";
export * from "./events";
export * from "./sandboxing";
export { ToolName, type ToolNameInput } from "./tool_name";
export { build_tool_registry_plan } from "./spec_plan";
export {
	create_image_generation_tool,
	create_web_search_tool,
	type WebSearchToolOptions,
} from "./hosted_spec";
export {
	ToolHandlerKind,
	defaultToolsConfig,
	type DefaultToolsConfigInput,
	type ToolHandlerSpec,
	type ToolRegistryPlan,
	type ToolRegistryPlanParams,
	type ToolsConfig,
	type WebSearchConfig,
	type WebSearchMode,
	type WebSearchToolType,
} from "./spec_plan_types";

export class ToolRegistryBuilder {
	private readonly handlers = new Map<string, ToolHandler>();
	private readonly specs: ConfiguredToolSpec[] = [];

	pushSpec(spec: ToolSpec): void {
		this.pushSpecWithParallelSupport(spec, false);
	}

	pushSpecWithParallelSupport(
		spec: ToolSpec,
		supportsParallelToolCalls: boolean,
	): void {
		this.specs.push({
			spec,
			supports_parallel_tool_calls: supportsParallelToolCalls,
		});
	}

	registerHandler(handler: ToolHandler): void {
		this.handlers.set(ToolName.from(handler.toolName()).key(), handler);
	}

	build(): { specs: ConfiguredToolSpec[]; registry: ToolRegistry } {
		return {
			specs: [...this.specs],
			registry: ToolRegistry.fromHandlersForBuilder(this.handlers),
		};
	}
}
