import type { DynamicToolCallOutputContentItem } from "../../protocol";
import {
	FunctionCallError,
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../context";
import { ToolName, type ToolNameInput } from "../tool_name";

export type DynamicToolHandlerParams = {
	tool_name: ToolNameInput;
};

export class DynamicToolHandler implements ToolHandler<FunctionToolOutput> {
	private readonly tool_name: ToolName;

	constructor(params: DynamicToolHandlerParams) {
		this.tool_name = ToolName.from(params.tool_name);
	}

	toolName(): ToolName {
		return this.tool_name;
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async isMutating(): Promise<boolean> {
		return true;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		const { session, turn, call_id, payload } = invocation;

		if (payload.type !== "function") {
			throw FunctionCallError.respondToModel(
				"dynamic tool handler received unsupported payload",
			);
		}

		const args = parseArguments(payload.arguments);
		const response = await session.request_dynamic_tool(
			turn,
			call_id,
			this.tool_name.display(),
			args,
		);
		if (!response) {
			throw FunctionCallError.respondToModel(
				"dynamic tool call was cancelled before receiving a response",
			);
		}

		return FunctionToolOutput.fromContent(
			response.content_items.map(dynamicContentItemToFunctionContentItem),
			response.success,
		);
	}
}

export function dynamicToolName(input: {
	namespace?: string | null;
	name: string;
}): string {
	return ToolName.from(input).display();
}

function dynamicContentItemToFunctionContentItem(
	item: DynamicToolCallOutputContentItem,
) {
	switch (item.type) {
		case "inputText":
			return {
				type: "input_text" as const,
				text: item.text,
			};
		case "inputImage":
			return {
				type: "input_image" as const,
				image_url: item.imageUrl,
			};
	}
}

function parseArguments(argumentsJson: string): unknown {
	try {
		return JSON.parse(argumentsJson) as unknown;
	} catch (error) {
		throw FunctionCallError.respondToModel(
			`failed to parse function arguments: ${errorMessage(error)}`,
		);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
