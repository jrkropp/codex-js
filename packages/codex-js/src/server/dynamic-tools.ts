import type {
	DynamicToolCallParams,
	DynamicToolCallResponse,
	DynamicToolSpec,
} from "../runtime";

export type DynamicToolExecutionContext<Context = unknown> = {
	callId: string;
	context?: Context;
	namespace: string | null;
	params: DynamicToolCallParams;
	threadId: string;
	tool: string;
	turnId: string;
};

export type DynamicToolExecute<Context = unknown, Args = unknown> = (
	args: Args,
	context: DynamicToolExecutionContext<Context>,
) => DynamicToolCallResponse | Promise<DynamicToolCallResponse>;

export type DynamicToolDefinition<Context = unknown, Args = unknown> = {
	deferLoading?: boolean;
	description: string;
	execute?: DynamicToolExecute<Context, Args>;
	inputSchema: unknown;
	name: string;
	namespace?: string | null;
};

export type DefinedDynamicTool<Context = unknown, Args = unknown> = Readonly<
	DynamicToolDefinition<Context, Args>
>;

export type DefinedDynamicToolset<Context = unknown> =
	readonly DefinedDynamicTool<Context>[];

type DynamicToolDefinitionForValidation = {
	deferLoading?: boolean;
	description: string;
	inputSchema: unknown;
	name: string;
	namespace?: string | null;
};

const RESPONSES_API_TOOL_NAME = /^[A-Za-z0-9_-]+$/u;
const RESPONSES_API_TOOL_NAME_MAX_LENGTH = 64;

export const dynamicToolResponse = {
	text(text: string): DynamicToolCallResponse {
		return {
			contentItems: [{ text, type: "inputText" }],
			success: true,
		};
	},
	image(imageUrl: string): DynamicToolCallResponse {
		return {
			contentItems: [{ imageUrl, type: "inputImage" }],
			success: true,
		};
	},
	error(message: string): DynamicToolCallResponse {
		return {
			contentItems: [{ text: message, type: "inputText" }],
			success: false,
		};
	},
};

export function defineDynamicTool<Context = unknown, Args = unknown>(
	definition: DynamicToolDefinition<Context, Args>,
): DefinedDynamicTool<Context, Args> {
	const tool = Object.freeze({
		...definition,
		deferLoading: definition.deferLoading ?? false,
		namespace: definition.namespace ?? null,
	});
	validateDynamicToolDefinitions([tool]);
	return tool;
}

export function defineDynamicToolset<Context = unknown>(
	definitions: readonly DynamicToolDefinition<Context>[],
): DefinedDynamicToolset<Context> {
	const tools = definitions.map((definition) =>
		Object.freeze({
			...definition,
			deferLoading: definition.deferLoading ?? false,
			namespace: definition.namespace ?? null,
		}),
	);
	validateDynamicToolDefinitions(tools);
	return Object.freeze(tools);
}

export function dynamicToolSpecFromDefinition(
	tool: DynamicToolDefinitionForValidation,
): DynamicToolSpec {
	return {
		defer_loading: tool.deferLoading ?? false,
		description: tool.description,
		input_schema: tool.inputSchema,
		name: tool.name,
		namespace: tool.namespace ?? null,
	};
}

export function dynamicToolSpecsFromDefinitions(
	tools: readonly DefinedDynamicTool[],
): DynamicToolSpec[] {
	return tools.map(dynamicToolSpecFromDefinition);
}

export function findDynamicTool<Context>(
	tools: readonly DefinedDynamicTool<Context>[],
	params: DynamicToolCallParams,
): DefinedDynamicTool<Context> | null {
	const namespace = params.namespace ?? null;
	return (
		tools.find(
			(tool) =>
				(tool.namespace ?? null) === namespace && tool.name === params.tool,
		) ?? null
	);
}

export function validateDynamicToolDefinitions(
	tools: readonly DynamicToolDefinitionForValidation[],
): void {
	const names = new Set<string>();
	for (const tool of tools) {
		validateResponsesApiName(tool.name, "name");
		if (tool.namespace) {
			validateResponsesApiName(tool.namespace, "namespace");
		}
		if ((tool.deferLoading ?? false) && !tool.namespace) {
			throw new Error(
				`Dynamic tool ${tool.name} uses deferLoading and must include a namespace.`,
			);
		}
		validateInputSchema(tool.name, tool.inputSchema);
		const key = `${tool.namespace ?? ""}:${tool.name}`;
		if (names.has(key)) {
			throw new Error(
				`Duplicate dynamic tool registration for ${tool.namespace ? `${tool.namespace}/` : ""}${tool.name}.`,
			);
		}
		names.add(key);
	}
}

function validateResponsesApiName(
	value: string,
	label: "name" | "namespace",
): void {
	if (
		value.length === 0 ||
		value.length > RESPONSES_API_TOOL_NAME_MAX_LENGTH ||
		!RESPONSES_API_TOOL_NAME.test(value)
	) {
		throw new Error(
			`Dynamic tool ${label} ${value} is not supported by the Responses API. Tool names and namespaces may only contain letters, numbers, underscores, and hyphens.`,
		);
	}
}

function validateInputSchema(toolName: string, schema: unknown): void {
	if (!isRecord(schema)) {
		throw new Error(
			`Dynamic tool ${toolName} inputSchema must be a JSON Schema object.`,
		);
	}
	if (schema.type !== "object") {
		throw new Error(
			`Dynamic tool ${toolName} inputSchema must use type "object".`,
		);
	}
	if ("properties" in schema && !isRecord(schema.properties)) {
		throw new Error(
			`Dynamic tool ${toolName} inputSchema.properties must be an object when present.`,
		);
	}
	if ("required" in schema && !isStringArray(schema.required)) {
		throw new Error(
			`Dynamic tool ${toolName} inputSchema.required must be a string array when present.`,
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}
