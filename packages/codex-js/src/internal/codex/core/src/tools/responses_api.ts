import type { DynamicToolSpec } from "../protocol/dynamic_tools";
import type { JsonSchema } from "./tool_spec";

export type FreeformTool = {
	name: string;
	description: string;
	format: {
		type: string;
		syntax: string;
		definition: string;
	};
};

export type ResponsesApiTool = {
	name: string;
	description: string;
	strict: boolean;
	defer_loading?: boolean;
	parameters: JsonSchema;
};

export type ResponsesApiFunctionTool = ResponsesApiTool & {
	type: "function";
};

export type LoadableToolSpec =
	| ResponsesApiFunctionTool
	| (ResponsesApiNamespace & { type: "namespace" });

export type ResponsesApiNamespace = {
	name: string;
	description: string;
	tools: ResponsesApiNamespaceTool[];
};

export type ResponsesApiNamespaceTool = ResponsesApiFunctionTool;

export function default_namespace_description(namespaceName: string): string {
	return `Tools in the ${namespaceName} namespace.`;
}

export function dynamic_tool_to_responses_api_tool(
	tool: DynamicToolSpec,
): ResponsesApiTool {
	return {
		name: tool.name,
		description: tool.description,
		strict: false,
		...(tool.defer_loading ? { defer_loading: true } : {}),
		parameters: tool.input_schema,
	};
}

export function dynamic_tool_to_loadable_tool_spec(
	tool: DynamicToolSpec,
): LoadableToolSpec {
	const outputTool = {
		type: "function",
		...dynamic_tool_to_responses_api_tool(tool),
	} satisfies ResponsesApiFunctionTool;

	return tool.namespace
		? {
				type: "namespace",
				name: tool.namespace,
				description: default_namespace_description(tool.namespace),
				tools: [outputTool],
			}
		: outputTool;
}

export function coalesce_loadable_tool_specs(
	specs: Iterable<LoadableToolSpec>,
): LoadableToolSpec[] {
	const coalescedSpecs: LoadableToolSpec[] = [];

	for (const spec of specs) {
		if (spec.type === "function") {
			coalescedSpecs.push(spec);
			continue;
		}

		const existingNamespace = coalescedSpecs.find(
			(candidate): candidate is LoadableToolSpec & { type: "namespace" } =>
				candidate.type === "namespace" && candidate.name === spec.name,
		);

		if (existingNamespace) {
			existingNamespace.tools.push(...spec.tools);
			continue;
		}

		coalescedSpecs.push({
			...spec,
			tools: [...spec.tools],
		});
	}

	return coalescedSpecs;
}
