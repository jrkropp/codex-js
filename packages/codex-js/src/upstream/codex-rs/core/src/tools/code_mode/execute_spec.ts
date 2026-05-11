export const CODE_MODE_EXECUTE_TOOL_NAME = "code_mode_execute";

export function create_code_mode_execute_tool() {
	return {
		type: "function" as const,
		name: CODE_MODE_EXECUTE_TOOL_NAME,
		description: "Execute a Codex code-mode cell.",
		strict: false,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: true,
		},
	};
}
