import type { ToolCall } from "./router";
import { ToolName } from "./tool_name";

export class ToolDispatchTrace {
	readonly events: Array<{
		type: "started" | "completed" | "failed";
		call_id: string;
		tool_name: string;
		message?: string;
	}> = [];

	start(call: ToolCall): void {
		this.events.push({
			type: "started",
			call_id: call.call_id,
			tool_name: ToolName.from(call.tool_name).display(),
		});
	}

	record_completed(call: ToolCall): void {
		this.events.push({
			type: "completed",
			call_id: call.call_id,
			tool_name: ToolName.from(call.tool_name).display(),
		});
	}

	record_failed(call: ToolCall, error: Error): void {
		this.events.push({
			type: "failed",
			call_id: call.call_id,
			tool_name: ToolName.from(call.tool_name).display(),
			message: error.message,
		});
	}
}
