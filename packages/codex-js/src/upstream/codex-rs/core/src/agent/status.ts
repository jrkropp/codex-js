import { AgentStatus } from "./registry";

export function is_final(status: AgentStatus): boolean {
	return (
		status === AgentStatus.Completed ||
		status === AgentStatus.Failed ||
		status === AgentStatus.Closed ||
		status === AgentStatus.Cancelled
	);
}

export function agent_status_from_event(event: unknown): AgentStatus {
	if (typeof event === "object" && event !== null && "status" in event) {
		const status = (event as { status?: unknown }).status;
		if (typeof status === "string" && status in reverseAgentStatus) {
			return status as AgentStatus;
		}
	}
	return AgentStatus.Running;
}

const reverseAgentStatus = Object.fromEntries(
	Object.values(AgentStatus).map((status) => [status, true]),
);
