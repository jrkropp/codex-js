import { REQUEST_PLUGIN_INSTALL_TOOL_NAME } from "./request_plugin_install";

export function create_request_plugin_install_tool() {
	return {
		type: "function" as const,
		name: REQUEST_PLUGIN_INSTALL_TOOL_NAME,
		description: "Request installation of a Codex plugin or connector.",
		strict: false,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: true,
		},
	};
}
