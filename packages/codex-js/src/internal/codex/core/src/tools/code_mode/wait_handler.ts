import {
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
} from "../context";
import { ToolName } from "../tool_name";
import { CODE_MODE_WAIT_TOOL_NAME } from "./wait_spec";

export class CodeModeWaitHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(CODE_MODE_WAIT_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(): Promise<FunctionToolOutput> {
		return FunctionToolOutput.fromText(
			"code mode wait is unavailable in this Codex assistant runtime",
			false,
		);
	}
}
