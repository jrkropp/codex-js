import { ChevronDownIcon, ChevronLeftIcon } from "lucide-react";
import { memo, type PointerEventHandler } from "react";

import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import {
	formatPendingPrimaryActionLabel,
	type PendingActionState,
} from "./ComposerPrimaryActions.logic";

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
	event.preventDefault();
};

export const ComposerPrimaryActions = memo(function ComposerPrimaryActions({
	compact,
	disabled = false,
	hasSendableContent,
	isConnecting = false,
	isEnvironmentUnavailable = false,
	isRunning,
	isSending,
	pendingAction,
	promptHasText = false,
	preserveComposerFocusOnPointerDown = false,
	showPlanFollowUpPrompt = false,
	onInterrupt,
	onImplementPlanInNewThread,
	onPreviousPendingQuestion,
}: {
	compact: boolean;
	disabled?: boolean;
	hasSendableContent: boolean;
	isConnecting?: boolean;
	isEnvironmentUnavailable?: boolean;
	isRunning: boolean;
	isSending: boolean;
	pendingAction: PendingActionState | null;
	promptHasText?: boolean;
	preserveComposerFocusOnPointerDown?: boolean;
	showPlanFollowUpPrompt?: boolean;
	onInterrupt: () => void;
	onImplementPlanInNewThread?: () => void;
	onPreviousPendingQuestion: () => void;
}) {
	const pointerFocusProps = preserveComposerFocusOnPointerDown
		? { onPointerDown: preventPointerFocus }
		: undefined;

	if (pendingAction) {
		return (
			<div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
				{pendingAction.questionIndex > 0 ? (
					compact ? (
						<Button
							type="button"
							size="icon-sm"
							variant="outline"
							className="rounded-full"
							{...pointerFocusProps}
							disabled={disabled || pendingAction.isResponding}
							aria-label="Previous question"
							onClick={onPreviousPendingQuestion}
						>
							<ChevronLeftIcon aria-hidden="true" className="size-3.5" />
						</Button>
					) : (
						<Button
							type="button"
							size="sm"
							variant="outline"
							className="rounded-full"
							{...pointerFocusProps}
							disabled={disabled || pendingAction.isResponding}
							onClick={onPreviousPendingQuestion}
						>
							Previous
						</Button>
					)
				) : null}
				<Button
					type="submit"
					size="sm"
					className={cn("rounded-full", compact ? "px-3" : "px-4")}
					{...pointerFocusProps}
					disabled={
						disabled ||
						isConnecting ||
						isEnvironmentUnavailable ||
						pendingAction.isResponding ||
						(pendingAction.isLastQuestion
							? !pendingAction.isComplete
							: !pendingAction.canAdvance)
					}
				>
					{formatPendingPrimaryActionLabel({
						compact,
						isLastQuestion: pendingAction.isLastQuestion,
						isResponding: pendingAction.isResponding,
						questionIndex: pendingAction.questionIndex,
					})}
				</Button>
			</div>
		);
	}

	if (isRunning) {
		return (
			<div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
				<button
					type="button"
					className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-rose-500/90 text-white transition-all duration-150 hover:scale-105 hover:bg-rose-500 disabled:pointer-events-none disabled:opacity-40 sm:h-8 sm:w-8"
					{...pointerFocusProps}
					disabled={isConnecting}
					aria-label="Stop response"
					onClick={onInterrupt}
				>
					<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
						<rect x="2" y="2" width="8" height="8" rx="1.5" />
					</svg>
				</button>
			</div>
		);
	}

	if (showPlanFollowUpPrompt) {
		if (promptHasText) {
			return (
				<Button
					type="submit"
					size="sm"
					className={cn(
						"rounded-full",
						compact ? "h-9 px-3 sm:h-8" : "h-9 px-4 sm:h-8",
					)}
					{...pointerFocusProps}
					disabled={disabled || isSending || isConnecting || isEnvironmentUnavailable}
				>
					{isConnecting || isSending ? "Sending..." : "Refine"}
				</Button>
			);
		}

		return (
			<div
				className="flex items-center justify-end"
				data-chat-composer-implement-actions="true"
			>
				<Button
					type="submit"
					size="sm"
					className="h-9 rounded-l-full rounded-r-none px-4 sm:h-8"
					{...pointerFocusProps}
					disabled={disabled || isSending || isConnecting || isEnvironmentUnavailable}
				>
					{isConnecting || isSending ? "Sending..." : "Implement"}
				</Button>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							type="button"
							size="sm"
							className="h-9 rounded-l-none rounded-r-full border-l-white/12 px-2 sm:h-8"
							aria-label="Implementation actions"
							{...pointerFocusProps}
							disabled={disabled || isSending || isConnecting || isEnvironmentUnavailable}
						>
							<ChevronDownIcon aria-hidden="true" className="size-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end" side="top">
						<DropdownMenuItem
							disabled={!onImplementPlanInNewThread}
							onClick={() => onImplementPlanInNewThread?.()}
						>
							Implement in a new thread
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		);
	}

	return (
		<div className={cn("flex items-center justify-end", compact ? "gap-1.5" : "gap-2")}>
			<button
				type="submit"
				className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/90 text-primary-foreground transition-all duration-150 enabled:cursor-pointer hover:bg-primary enabled:hover:scale-105 disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8"
				{...pointerFocusProps}
				disabled={
					disabled ||
					isSending ||
					isConnecting ||
					isEnvironmentUnavailable ||
					!hasSendableContent
				}
				aria-label={
					isEnvironmentUnavailable
						? "Codex unavailable"
						: isConnecting
							? "Connecting"
							: isSending
								? "Sending"
								: "Send message"
				}
			>
				{isSending ? (
					<svg
						width="14"
						height="14"
						viewBox="0 0 14 14"
						fill="none"
						className="animate-spin"
						aria-hidden="true"
					>
						<circle
							cx="7"
							cy="7"
							r="5.5"
							stroke="currentColor"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeDasharray="20 12"
						/>
					</svg>
				) : (
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
						<path
							d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				)}
			</button>
		</div>
	);
});
