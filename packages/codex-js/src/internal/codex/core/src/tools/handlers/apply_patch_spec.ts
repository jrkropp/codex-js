import { APPLY_PATCH_TOOL_NAME } from "./apply_patch";

export function create_apply_patch_tool() {
	return {
		type: "function" as const,
		name: APPLY_PATCH_TOOL_NAME,
		description:
			"Apply a patch through the configured Codex executor. This Codex assistant runtime validates and previews patches, but requires a desktop/local executor before files can be changed.",
		strict: false,
		parameters: {
			type: "object",
			properties: {
				patch: { type: "string" },
			},
			required: ["patch"],
			additionalProperties: false,
		},
	};
}
