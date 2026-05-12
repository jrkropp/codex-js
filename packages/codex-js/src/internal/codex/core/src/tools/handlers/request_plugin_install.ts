import {
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
} from "../context";
import { ToolName } from "../tool_name";

export const REQUEST_PLUGIN_INSTALL_TOOL_NAME = "request_plugin_install";

export class RequestPluginInstallHandler
	implements ToolHandler<FunctionToolOutput>
{
	toolName(): ToolName {
		return ToolName.plain(REQUEST_PLUGIN_INSTALL_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(): Promise<FunctionToolOutput> {
		return FunctionToolOutput.fromText(
			"plugin installation is unavailable in this Codex assistant runtime",
			false,
		);
	}
}
