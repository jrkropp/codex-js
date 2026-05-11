import {
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
} from "../context";
import { ToolName } from "../tool_name";

export const VIEW_IMAGE_TOOL_NAME = "view_image";

export class ViewImageHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(VIEW_IMAGE_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(): Promise<FunctionToolOutput> {
		return FunctionToolOutput.fromText(
			"view_image is unavailable in this Codex assistant runtime",
			false,
		);
	}
}
