import { memo } from "react";

export type PendingApproval = {
	requestKind: "command" | "file-change" | "file-read";
};

interface ComposerPendingApprovalPanelProps {
	approval: PendingApproval;
	pendingCount: number;
}

export const ComposerPendingApprovalPanel = memo(
	function ComposerPendingApprovalPanel({
		approval,
		pendingCount,
	}: ComposerPendingApprovalPanelProps) {
		const approvalSummary =
			approval.requestKind === "command"
				? "Command approval requested"
				: approval.requestKind === "file-read"
					? "File-read approval requested"
					: "File-change approval requested";

		return (
			<div className="px-4 py-3.5 sm:px-5 sm:py-4">
				<div className="flex flex-wrap items-center gap-2">
					<span className="text-sm uppercase tracking-[0.2em]">
						PENDING APPROVAL
					</span>
					<span className="font-medium text-sm">{approvalSummary}</span>
					{pendingCount > 1 ? (
						<span className="text-muted-foreground text-xs">
							1/{pendingCount}
						</span>
					) : null}
				</div>
			</div>
		);
	},
);
