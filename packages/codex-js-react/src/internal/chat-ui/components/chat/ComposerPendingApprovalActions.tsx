import { memo } from "react";

import { Button } from "../ui/button";

export type ApprovalRequestId = string;

export type ProviderApprovalDecision =
	| "accept"
	| "acceptForSession"
	| "cancel"
	| "decline";

interface ComposerPendingApprovalActionsProps {
	isResponding: boolean;
	requestId: ApprovalRequestId;
	onRespondToApproval: (
		requestId: ApprovalRequestId,
		decision: ProviderApprovalDecision,
	) => Promise<void>;
}

export const ComposerPendingApprovalActions = memo(
	function ComposerPendingApprovalActions({
		isResponding,
		requestId,
		onRespondToApproval,
	}: ComposerPendingApprovalActionsProps) {
		return (
			<>
				<Button
					size="sm"
					variant="ghost"
					disabled={isResponding}
					onClick={() => void onRespondToApproval(requestId, "cancel")}
				>
					Cancel turn
				</Button>
				<Button
					size="sm"
					variant="destructive"
					disabled={isResponding}
					onClick={() => void onRespondToApproval(requestId, "decline")}
				>
					Decline
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={isResponding}
					onClick={() => void onRespondToApproval(requestId, "acceptForSession")}
				>
					Always allow this session
				</Button>
				<Button
					size="sm"
					variant="default"
					disabled={isResponding}
					onClick={() => void onRespondToApproval(requestId, "accept")}
				>
					Approve once
				</Button>
			</>
		);
	},
);
