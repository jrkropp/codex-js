import {
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../../context";
import { ToolName } from "../../tool_name";

export const WRITE_STDIN_TOOL_NAME = "write_stdin";

const EXECUTOR_UNAVAILABLE =
	"tool execution is unavailable in this Codex assistant runtime; a desktop/local executor is required.";

export class WriteStdinHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(WRITE_STDIN_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		parseFunctionArgs(invocation);
		return FunctionToolOutput.fromText(EXECUTOR_UNAVAILABLE, false);
	}
}

function parseFunctionArgs(invocation: ToolInvocation): unknown {
	if (invocation.payload.type !== "function") {
		return {};
	}
	try {
		return JSON.parse(invocation.payload.arguments || "{}");
	} catch {
		return {};
	}
}
