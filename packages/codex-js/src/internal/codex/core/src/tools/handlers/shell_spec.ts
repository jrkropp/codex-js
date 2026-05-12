import { EXEC_COMMAND_TOOL_NAME } from "./unified_exec/exec_command";
import { WRITE_STDIN_TOOL_NAME } from "./unified_exec/write_stdin";

export function create_exec_command_tool() {
	return {
		type: "function" as const,
		name: EXEC_COMMAND_TOOL_NAME,
		description:
			"Execute a shell command through the configured Codex executor. This Codex assistant runtime requires a desktop/local executor before commands can run.",
		strict: false,
		parameters: {
			type: "object",
			properties: {
				cmd: { type: "string" },
				workdir: { type: "string" },
				yield_time_ms: { type: "number" },
				max_output_tokens: { type: "number" },
				sandbox_permissions: {},
				justification: { type: "string" },
				prefix_rule: { type: "array", items: { type: "string" } },
			},
			required: ["cmd"],
			additionalProperties: true,
		},
	};
}

export function create_write_stdin_tool() {
	return {
		type: "function" as const,
		name: WRITE_STDIN_TOOL_NAME,
		description:
			"Write bytes to an existing Codex unified exec process. This Codex assistant runtime requires a desktop/local executor before stdin can be written.",
		strict: false,
		parameters: {
			type: "object",
			properties: {
				process_id: { type: "string" },
				chars: { type: "string" },
				yield_time_ms: { type: "number" },
				max_output_tokens: { type: "number" },
			},
			required: ["process_id"],
			additionalProperties: true,
		},
	};
}
