import type {
	FreeformTool,
	LoadableToolSpec,
	ResponsesApiFunctionTool,
} from "./responses_api";

export type JsonSchema = unknown;

export type ToolSpec =
	| LoadableToolSpec
	| {
			type: "tool_search";
			execution: string;
			description: string;
			parameters: JsonSchema;
	  }
	| { type: "local_shell" }
	| { type: "image_generation"; output_format: string }
	| {
			type: "web_search";
			external_web_access?: boolean;
			filters?: unknown;
			user_location?: unknown;
			search_context_size?: unknown;
			search_content_types?: string[];
	  }
	| (FreeformTool & { type: "custom" });

export type ConfiguredToolSpec = {
	spec: ToolSpec;
	supports_parallel_tool_calls: boolean;
};

export function toolSpecName(spec: ToolSpec): string {
	switch (spec.type) {
		case "function":
		case "namespace":
		case "custom":
			return spec.name;
		case "tool_search":
			return "tool_search";
		case "local_shell":
			return "local_shell";
		case "image_generation":
			return "image_generation";
		case "web_search":
			return "web_search";
	}
}

export function create_tools_json_for_responses_api(
	tools: readonly ToolSpec[],
): ToolSpec[] {
	assertValidResponsesToolSpecs(tools);
	return tools.map((tool) => structuredClone(tool));
}

export function assertValidResponsesToolSpecs(
	specs: readonly ToolSpec[],
): asserts specs is ToolSpec[] {
	const invalidTools = specs.filter((spec) => !isValidResponsesToolSpec(spec));
	if (invalidTools.length === 0) {
		return;
	}

	throw new Error(
		`Invalid OpenAI Responses tool specs: ${invalidTools
			.map((spec) => JSON.stringify(spec))
			.join(", ")}`,
	);
}

function isValidResponsesToolSpec(spec: ToolSpec): boolean {
	if (!("type" in spec)) {
		return false;
	}

	switch (spec.type) {
		case "function":
			return isValidResponsesApiFunctionTool(spec);
		case "namespace":
			return (
				typeof spec.name === "string" &&
				typeof spec.description === "string" &&
				Array.isArray(spec.tools) &&
				spec.tools.every(isValidResponsesApiFunctionTool)
			);
		case "tool_search":
			return typeof spec.execution === "string";
		case "local_shell":
		case "image_generation":
		case "web_search":
		case "custom":
			return true;
	}
}

function isValidResponsesApiFunctionTool(
	tool: ResponsesApiFunctionTool,
): boolean {
	return (
		tool.type === "function" &&
		typeof tool.name === "string" &&
		typeof tool.description === "string" &&
		typeof tool.strict === "boolean" &&
		"parameters" in tool
	);
}
