import {
	FunctionCallError,
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../context";
import { ToolName, type ToolNameInput } from "../tool_name";

export function unavailable_tool_message(
	toolName: string,
	nextStep: string,
): string {
	return `Tool \`${toolName}\` is not currently available. It appeared in earlier tool calls in this conversation, but its implementation is not available in the current request. ${nextStep}`;
}

export class UnavailableToolHandler implements ToolHandler<FunctionToolOutput> {
	private readonly tool_name: ToolName;

	constructor(toolName: ToolNameInput) {
		this.tool_name = ToolName.from(toolName);
	}

	toolName(): ToolName {
		return this.tool_name;
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		if (invocation.payload.type !== "function") {
			throw FunctionCallError.respondToModel(
				"unavailable tool handler received unsupported payload",
			);
		}
		return FunctionToolOutput.fromText(
			unavailable_tool_message(
				this.tool_name.display(),
				"Retry after the tool becomes available or ask the user to re-enable it.",
			),
			false,
		);
	}
}
