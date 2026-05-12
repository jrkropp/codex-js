import { MicIcon } from "lucide-react";
import { memo, type PointerEventHandler } from "react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import {
	getRealtimeConversationControlState,
	type RealtimeConversationUiState,
} from "./composer-realtime-conversation.logic";

export const ComposerRealtimeConversationControl = memo(
	function ComposerRealtimeConversationControl({
		compact,
		disabled = false,
		preserveComposerFocusOnPointerDown = false,
		realtimeConversation,
	}: {
		compact: boolean;
		disabled?: boolean;
		preserveComposerFocusOnPointerDown?: boolean;
		realtimeConversation: RealtimeConversationUiState;
	}) {
		const state = getRealtimeConversationControlState(realtimeConversation);
		const pointerFocusProps = preserveComposerFocusOnPointerDown
			? { onPointerDown: preventPointerFocus }
			: undefined;

		return (
			<Button
				type="button"
				variant="ghost"
				size={compact ? "icon-sm" : "sm"}
				className={cn(
					"shrink-0 text-muted-foreground/80 hover:text-foreground",
					state.isActive && "text-primary hover:text-primary",
					state.isBusy && "animate-pulse",
				)}
				{...pointerFocusProps}
				aria-label={state.label}
				aria-pressed={state.isActive}
				data-realtime-conversation-phase={realtimeConversation.phase}
				disabled={disabled || realtimeConversation.disabled || state.isBusy}
				title={state.title}
				onClick={
					state.action === "stop"
						? realtimeConversation.onStop
						: realtimeConversation.onStart
				}
			>
				{state.isBusy ? (
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
					<MicIcon aria-hidden="true" />
				)}
				<span className={compact ? "sr-only" : "hidden sm:inline"}>
					{state.isActive ? "Live voice" : "Realtime"}
				</span>
			</Button>
		);
	},
);

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
	event.preventDefault();
};
