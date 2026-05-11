import { type LegendListRef } from "@legendapp/list/react";
import { ChevronDownIcon } from "lucide-react";
import {
	type ReactNode,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { cn } from "../../lib/utils";
import { ComposerBannerStack, type ComposerBannerStackItem } from "./ComposerBannerStack";
import { ExpandedImageDialog } from "./ExpandedImageDialog";
import { MessagesTimeline, type MessagesTimelineProps } from "./MessagesTimeline";
import type { ExpandedImagePreview } from "./composer-image-attachments";

export type ChatViewRenderComposerControls = {
	prepareForOptimisticAppend: () => Promise<void>;
	scheduleStickToBottom: () => void;
};

export type ChatViewProps = {
	actions?: ReactNode;
	bannerItems?: readonly ComposerBannerStackItem[];
	className?: string;
	composer: ReactNode;
	headerLeading?: ReactNode;
	listRef: React.RefObject<LegendListRef | null>;
	subtitle?: ReactNode;
	threadKey: string;
	timeline: Omit<
		MessagesTimelineProps,
		"listRef" | "onImageExpand" | "onIsAtEndChange"
	>;
	title: ReactNode;
	onControlsChange?: (controls: ChatViewRenderComposerControls | null) => void;
	onIsAtEndChange?: (isAtEnd: boolean) => void;
};

export const ChatView = memo(function ChatView({
	actions,
	bannerItems = [],
	className,
	composer,
	headerLeading,
	listRef,
	subtitle,
	threadKey,
	timeline,
	title,
	onControlsChange,
	onIsAtEndChange,
}: ChatViewProps) {
	const [showScrollToBottom, setShowScrollToBottom] = useState(false);
	const [expandedImage, setExpandedImage] =
		useState<ExpandedImagePreview | null>(null);
	const isAtEndRef = useRef(true);
	const showScrollDebounceTimeoutRef = useRef<number | null>(null);
	const stickToBottomFrameRef = useRef<number | null>(null);

	const cancelShowScrollDebounce = useCallback(() => {
		if (showScrollDebounceTimeoutRef.current === null) {
			return;
		}
		window.clearTimeout(showScrollDebounceTimeoutRef.current);
		showScrollDebounceTimeoutRef.current = null;
	}, []);

	const scrollToEnd = useCallback(
		(animated = false) => {
			listRef.current?.scrollToEnd?.({ animated });
		},
		[listRef],
	);

	const scheduleStickToBottom = useCallback(() => {
		if (!isAtEndRef.current) {
			return;
		}
		if (stickToBottomFrameRef.current !== null) {
			window.cancelAnimationFrame(stickToBottomFrameRef.current);
		}
		stickToBottomFrameRef.current = window.requestAnimationFrame(() => {
			stickToBottomFrameRef.current = null;
			scrollToEnd(false);
		});
	}, [scrollToEnd]);

	const prepareForOptimisticAppend = useCallback(async () => {
		isAtEndRef.current = true;
		cancelShowScrollDebounce();
		setShowScrollToBottom(false);
		await listRef.current?.scrollToEnd?.({ animated: false });
	}, [cancelShowScrollDebounce, listRef]);

	const handleIsAtEndChange = useCallback(
		(isAtEnd: boolean) => {
			onIsAtEndChange?.(isAtEnd);
			if (isAtEndRef.current === isAtEnd) {
				return;
			}
			isAtEndRef.current = isAtEnd;
			if (isAtEnd) {
				cancelShowScrollDebounce();
				setShowScrollToBottom(false);
				return;
			}
			if (showScrollDebounceTimeoutRef.current !== null) {
				return;
			}
			showScrollDebounceTimeoutRef.current = window.setTimeout(() => {
				showScrollDebounceTimeoutRef.current = null;
				if (!isAtEndRef.current) {
					setShowScrollToBottom(true);
				}
			}, 150);
		},
		[cancelShowScrollDebounce, onIsAtEndChange],
	);

	useEffect(() => {
		isAtEndRef.current = true;
		cancelShowScrollDebounce();
		const resetTimerId = window.setTimeout(() => {
			setShowScrollToBottom(false);
			setExpandedImage(null);
		}, 0);
		const frameId = window.requestAnimationFrame(() => scrollToEnd(false));
		return () => {
			window.clearTimeout(resetTimerId);
			window.cancelAnimationFrame(frameId);
		};
	}, [cancelShowScrollDebounce, scrollToEnd, threadKey]);

	useEffect(
		() => () => {
			cancelShowScrollDebounce();
			if (stickToBottomFrameRef.current !== null) {
				window.cancelAnimationFrame(stickToBottomFrameRef.current);
				stickToBottomFrameRef.current = null;
			}
		},
		[cancelShowScrollDebounce],
	);

	const composerControls = useMemo<ChatViewRenderComposerControls>(
		() => ({ prepareForOptimisticAppend, scheduleStickToBottom }),
		[prepareForOptimisticAppend, scheduleStickToBottom],
	);

	useEffect(() => {
		onControlsChange?.(composerControls);
		return () => onControlsChange?.(null);
	}, [composerControls, onControlsChange]);

	return (
		<section
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background",
				className,
			)}
		>
			<header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background/95 px-3 md:px-6">
				<div className="flex min-w-0 items-center gap-2">
					{headerLeading}
					<div className="min-w-0">
						<h1 className="truncate text-sm font-semibold">{title}</h1>
						{subtitle ? (
							<p className="truncate text-muted-foreground text-xs">{subtitle}</p>
						) : null}
					</div>
				</div>
				{actions ? (
					<div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
						{actions}
					</div>
				) : null}
			</header>

			<div className="flex min-h-0 min-w-0 flex-1">
				<div className="flex min-h-0 min-w-0 flex-1 flex-col">
					<div className="relative flex min-h-0 flex-1 flex-col">
						<MessagesTimeline
							{...timeline}
							listRef={listRef}
							onImageExpand={setExpandedImage}
							onIsAtEndChange={handleIsAtEndChange}
						/>
						{expandedImage ? (
							<ExpandedImageDialog
								preview={expandedImage}
								onClose={() => setExpandedImage(null)}
							/>
						) : null}
						{showScrollToBottom ? (
							<div className="pointer-events-none absolute bottom-1 left-1/2 z-30 flex -translate-x-1/2 justify-center py-1.5">
								<button
									type="button"
									onClick={() => scrollToEnd(true)}
									className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-muted-foreground text-xs shadow-sm transition-colors hover:border-border hover:text-foreground hover:cursor-pointer"
								>
									<ChevronDownIcon className="size-3.5" />
									Scroll to bottom
								</button>
							</div>
						) : null}
					</div>

					<div className="min-w-0 overflow-x-clip pl-[calc(env(safe-area-inset-left)+0.75rem)] pr-[calc(env(safe-area-inset-right)+0.75rem)] pt-1.5 sm:pl-[calc(env(safe-area-inset-left)+1.25rem)] sm:pr-[calc(env(safe-area-inset-right)+1.25rem)] sm:pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-[calc(env(safe-area-inset-bottom)+1rem)]">
						<div className="relative isolate min-w-0">
							<ComposerBannerStack className="relative z-0" items={bannerItems} />
							<div className="relative z-10">
								{composer}
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
});
