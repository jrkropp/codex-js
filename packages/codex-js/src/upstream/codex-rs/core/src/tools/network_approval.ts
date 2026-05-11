import { FunctionCallError } from "./context";

export type NetworkApprovalDecision =
	| { type: "approved" }
	| { type: "denied"; reason: string };

export async function request_network_approval(): Promise<NetworkApprovalDecision> {
	return {
		type: "denied",
		reason:
			"network approval is unavailable in this Codex assistant runtime; a desktop/local executor is required.",
	};
}

export function network_approval_denied_error(
	decision: Extract<NetworkApprovalDecision, { type: "denied" }>,
): FunctionCallError {
	return FunctionCallError.respondToModel(decision.reason);
}
