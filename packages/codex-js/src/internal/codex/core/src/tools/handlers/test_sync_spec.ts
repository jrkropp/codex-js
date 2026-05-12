import { TEST_SYNC_TOOL_NAME } from "./test_sync";

export function create_test_sync_tool() {
	return {
		type: "function" as const,
		name: TEST_SYNC_TOOL_NAME,
		description: "Codex test synchronization tool.",
		strict: false,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: true,
		},
	};
}
