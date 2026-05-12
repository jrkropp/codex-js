export const CODE_MODE_WAIT_TOOL_NAME = "code_mode_wait";

export function create_code_mode_wait_tool() {
	return {
		type: "function" as const,
		name: CODE_MODE_WAIT_TOOL_NAME,
		description: "Wait for a Codex code-mode cell.",
		strict: false,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: true,
		},
	};
}
