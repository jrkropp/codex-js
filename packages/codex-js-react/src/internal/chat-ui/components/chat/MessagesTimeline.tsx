import { LegendList, type LegendListRef } from "@legendapp/list/react";
import {
	BoxIcon,
	CheckIcon,
	CopyIcon,
	FileDiffIcon,
	GlobeIcon,
	ImageIcon,
	LightbulbIcon,
	PaperclipIcon,
	SearchIcon,
	SettingsIcon,
	TerminalIcon,
} from "lucide-react";
import {
	createContext,
	memo,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import { Button } from "../ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../ui/tooltip";
import { cn } from "../../lib/utils";
import type {
	CoreTurnItem as TurnItem,
	CoreUserInput as UserInput,
	CoreUserMessageTurnItem as UserMessageTurnItem,
	ThreadHistoryTurn as Turn,
} from "@jrkropp/codex-js/client";

import { decodeHistoryMentions } from "./mention-codec";
import type { ExpandedImagePreview } from "./composer-image-attachments";
import { AssistantChangedFilesSection } from "./ChangedFilesTree";
import {
	deriveMessagesTimelineRows,
	computeStableMessagesTimelineRows,
	isAssistantCredentialError,
	resolveAssistantMessageCopyState,
	visibleTimelineWorkEntries,
	type MessagesTimelineRow,
	type StableMessagesTimelineRowsState,
	type TimelineWorkEntry,
} from "./MessagesTimeline.logic";
import ChatMarkdown from "../ChatMarkdown";
import { ProposedPlanCard } from "./ProposedPlanCard";

export type MessagesTimelineProps = {
	activeTurnStartedAt: string | null;
	errors: string[];
	isWorking: boolean;
	listRef: React.RefObject<LegendListRef | null>;
	onImageExpand: (preview: ExpandedImagePreview) => void;
	onIsAtEndChange: (isAtEnd: boolean) => void;
	optimisticUserMessages: readonly UserMessageTurnItem[];
	runtimeError: string | null;
	turns: readonly Turn[];
	warnings: string[];
};

type TimelineRowContextValue = {
	onImageExpand: (preview: ExpandedImagePreview) => void;
};

const TimelineRowContext = createContext<TimelineRowContextValue | null>(null);

type MessageTimelineRowModel = Extract<MessagesTimelineRow, { kind: "message" }>;
type UserMessageTimelineRowModel = MessageTimelineRowModel & {
	item: Extract<TurnItem, { type: "UserMessage" }>;
};
type AssistantMessageTimelineRowModel = MessageTimelineRowModel & {
	item: Extract<TurnItem, { type: "AgentMessage" }>;
};

const TIMELINE_LIST_HEADER = <div className="h-3 sm:h-4" />;
const TIMELINE_LIST_FOOTER = <div className="h-3 sm:h-4" />;

export const MessagesTimeline = memo(function MessagesTimeline({
	activeTurnStartedAt,
	errors,
	isWorking,
	listRef,
	onImageExpand,
	onIsAtEndChange,
	optimisticUserMessages,
	runtimeError,
	turns,
	warnings,
}: MessagesTimelineProps) {
	const rawRows = useMemo(
		() =>
			deriveMessagesTimelineRows({
				turns,
				optimisticUserMessages,
				isWorking,
				activeTurnStartedAt,
				warnings,
				errors,
				runtimeError,
		}),
		[
			activeTurnStartedAt,
			errors,
			isWorking,
			optimisticUserMessages,
			runtimeError,
			turns,
			warnings,
		],
	);
	const rows = useStableRows(rawRows);
	const showEmptyState = rows.length === 1 && rows[0]?.kind === "empty";
	const rowContext = useMemo(() => ({ onImageExpand }), [onImageExpand]);
	const handleScroll = useCallback(() => {
		const state = listRef.current?.getState?.();
		if (state) {
			onIsAtEndChange(state.isAtEnd);
		}
	}, [listRef, onIsAtEndChange]);

	const previousRowCountRef = useRef(rows.length);
	useEffect(() => {
		const previousRowCount = previousRowCountRef.current;
		previousRowCountRef.current = rows.length;

		if (previousRowCount > 0 || rows.length === 0) {
			return;
		}

		onIsAtEndChange(true);
		const frameId = window.requestAnimationFrame(() => {
			void listRef.current?.scrollToEnd?.({ animated: false });
		});
		return () => window.cancelAnimationFrame(frameId);
	}, [listRef, onIsAtEndChange, rows.length]);

	const renderItem = useCallback(
		({ item }: { item: MessagesTimelineRow }) => (
			<div
				className="mx-auto w-full min-w-0 max-w-3xl overflow-x-clip"
				data-timeline-root="true"
			>
				<TimelineRowContent row={item} />
			</div>
		),
		[],
	);

	if (showEmptyState) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-sm text-muted-foreground/30">
					Send a message to start the conversation.
				</p>
			</div>
		);
	}

	return (
		<TimelineRowContext.Provider value={rowContext}>
			<LegendList<MessagesTimelineRow>
				ref={listRef}
				data={rows}
				keyExtractor={keyExtractor}
				renderItem={renderItem}
				estimatedItemSize={90}
				initialScrollAtEnd
				maintainScrollAtEnd
				maintainScrollAtEndThreshold={0.1}
				maintainVisibleContentPosition
				onScroll={handleScroll}
				className="h-full overflow-x-hidden overscroll-y-contain px-3 sm:px-5"
				ListHeaderComponent={TIMELINE_LIST_HEADER}
				ListFooterComponent={TIMELINE_LIST_FOOTER}
			/>
		</TimelineRowContext.Provider>
	);
});

function keyExtractor(item: MessagesTimelineRow) {
	return item.id;
}

function useStableRows(rows: MessagesTimelineRow[]): MessagesTimelineRow[] {
	const previousState = useRef<StableMessagesTimelineRowsState>({
		byId: new Map<string, MessagesTimelineRow>(),
		result: [],
	});

	/* eslint-disable react-hooks/refs */
	return useMemo(() => {
		// This mirrors T3's structural-sharing hook; the ref is a render cache
		// for stable virtualized row identity, not UI state.
		const nextState = computeStableMessagesTimelineRows(
			rows,
			previousState.current,
		);
		previousState.current = nextState;
		return nextState.result;
	}, [rows]);
	/* eslint-enable react-hooks/refs */
}

const TimelineRowContent = memo(function TimelineRowContent({
	row,
}: {
	row: MessagesTimelineRow;
}) {
	return (
		<div
			className={cn(
				"pb-4",
				row.kind === "message" && row.role === "assistant"
					? "group/assistant"
					: null,
				row.kind === "message" && row.role === "user" ? "group/user" : null,
			)}
			data-timeline-row-id={row.id}
			data-timeline-row-kind={row.kind}
			data-message-id={row.kind === "message" ? row.item.id : undefined}
			data-message-role={row.kind === "message" ? row.role : undefined}
		>
			{row.kind === "message" ? <MessageTimelineRow row={row} /> : null}
			{row.kind === "proposed-plan" ? (
				<ProposedPlanTimelineRow row={row} />
			) : null}
			{row.kind === "work" ? <WorkTimelineRow row={row} /> : null}
			{row.kind === "working" ? <WorkingTimelineRow row={row} /> : null}
			{row.kind === "warning" ? <WarningTimelineRow message={row.message} /> : null}
			{row.kind === "error" ? <ErrorTimelineRow message={row.message} /> : null}
		</div>
	);
});

function useTimelineRowContext() {
	const context = useContext(TimelineRowContext);
	if (!context) {
		throw new Error("TimelineRowContext is not available.");
	}
	return context;
}

function MessageTimelineRow({
	row,
}: {
	row: MessageTimelineRowModel;
}) {
	if (row.item.type === "UserMessage") {
		return <UserTimelineRow row={row as UserMessageTimelineRowModel} />;
	}
	return <AssistantTimelineRow row={row as AssistantMessageTimelineRowModel} />;
}

function UserTimelineRow({
	row,
}: {
	row: UserMessageTimelineRowModel;
}) {
	const copyText = userInputTextForCopy(row.item.content);
	return (
		<div className="flex justify-end">
			<div className="group relative max-w-[80%] rounded-2xl rounded-br-sm border border-border bg-secondary px-4 py-3">
				<UserInputContent content={row.item.content} />
				<div className="mt-1.5 flex items-center justify-end gap-2">
					<div className="flex items-center gap-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
						{copyText ? <MessageCopyButton compact text={copyText} /> : null}
					</div>
					{row.createdAt ? (
						<p className="text-right text-muted-foreground/50 text-xs">
							{formatTimestamp(row.createdAt)}
						</p>
					) : null}
				</div>
			</div>
		</div>
	);
}

function AssistantTimelineRow({
	row,
}: {
	row: AssistantMessageTimelineRowModel;
}) {
	const text = row.item.content.map((part) => part.text).join("\n\n");
	const messageText =
		text.trim().length > 0 || row.item.phase === "streaming"
			? text
			: "(empty response)";
	const copyState = resolveAssistantMessageCopyState({
		showCopyButton: row.showAssistantCopyButton,
		streaming: row.item.phase === "streaming",
		text,
	});
	return (
		<div className="min-w-0 px-1 py-0.5">
			{row.showCompletionDivider ? (
				<AssistantCompletionDivider row={row} />
			) : null}
			<ChatMarkdown text={messageText} isStreaming={row.item.phase === "streaming"} />
			<AssistantChangedFilesSection
				files={row.changedFiles}
				turnId={row.turnId}
			/>
			<div className="mt-1.5 flex min-h-7 items-center gap-2">
				<AssistantMessageMeta row={row} />
				{copyState.visible && copyState.text ? (
					<MessageCopyButton compact text={copyState.text} />
				) : null}
			</div>
		</div>
	);
}

function AssistantCompletionDivider({
	row,
}: {
	row: Extract<MessagesTimelineRow, { kind: "message" }>;
}) {
	const duration =
		row.durationStart && row.completedAt
			? formatWorkingTimer(row.durationStart, row.completedAt)
			: null;
	return (
		<div className="my-3 flex items-center gap-3">
			<span className="h-px flex-1 bg-border" />
			<span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground/80">
				{duration ? (
					<>
						Response <span aria-hidden="true">&middot;</span> {duration}
					</>
				) : (
					"Response"
				)}
			</span>
			<span className="h-px flex-1 bg-border" />
		</div>
	);
}

function AssistantMessageMeta({
	row,
}: {
	row: Extract<MessagesTimelineRow, { kind: "message" }>;
}) {
	if (!row.createdAt) {
		return null;
	}

	const durationStart = row.durationStart;
	const completedAt = row.completedAt;
	return (
		<p className="text-muted-foreground/30 text-[10px]">
			{formatTimestamp(row.createdAt)}
			{durationStart ? (
				<>
					<span aria-hidden="true">&nbsp;&middot;&nbsp;</span>
					{completedAt ? (
						formatWorkingTimer(durationStart, completedAt)
					) : (
						<WorkingTimer createdAt={durationStart} />
					)}
				</>
			) : null}
		</p>
	);
}

function WorkTimelineRow({
	row,
}: {
	row: Extract<MessagesTimelineRow, { kind: "work" }>;
}) {
	const [expanded, setExpanded] = useState(false);
	const visible = visibleTimelineWorkEntries({
		entries: row.groupedEntries,
		expanded,
	});
	const hasOverflow = row.groupedEntries.length > visible.entries.length;
	const onlyToolEntries = row.groupedEntries.every((entry) => entry.tone === "tool");
	const showHeader = hasOverflow || !onlyToolEntries;
	const groupLabel = onlyToolEntries ? "Tool calls" : "Work log";

	return (
		<div
			className="min-w-0 rounded-xl border border-border/45 bg-card/25 px-2 py-1.5"
			data-work-group="true"
			data-work-group-count={row.groupedEntries.length}
		>
			{showHeader ? (
				<div className="mb-1.5 flex items-center justify-between gap-2 px-0.5">
					<p className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/55">
						{groupLabel} ({row.groupedEntries.length})
					</p>
					{hasOverflow ? (
						<button
							type="button"
							className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/55 transition-colors duration-150 hover:text-foreground/75"
							onClick={() => setExpanded((current) => !current)}
						>
							{expanded ? "Show less" : `Show ${visible.hiddenCount} more`}
						</button>
					) : null}
				</div>
			) : null}
			<div className="space-y-0.5">
				{visible.entries.map((entry) => (
					<SimpleWorkEntryRow key={entry.id} entry={entry} />
				))}
			</div>
		</div>
	);
}

const SimpleWorkEntryRow = memo(function SimpleWorkEntryRow({
	entry,
}: {
	entry: TimelineWorkEntry;
}) {
	const heading = formatCompactToolHeading(entry.label);
	const preview =
		entry.preview &&
		compactToolLabel(entry.preview).toLowerCase() ===
			compactToolLabel(heading).toLowerCase()
			? null
			: entry.preview;
	const displayText = preview ? `${heading} - ${preview}` : heading;
	const title = entry.title ?? displayText;
	const previewIsChangedFiles =
		entry.changedFiles.length > 0 &&
		entry.itemType === "FileChange" &&
		Boolean(preview);
	const tooltipText = title || displayText;
	const tooltipIsCommand = entry.itemType === "CommandExecution";
	return (
		<div
			className="rounded-lg px-1 py-1"
			data-work-entry-id={entry.id}
			data-work-entry-type={entry.itemType}
			title={title || undefined}
		>
			<div className="flex min-w-0 items-center gap-2 transition-[opacity,translate] duration-200">
				<span
					className={cn(
						"flex size-5 shrink-0 items-center justify-center",
						toneClassForWork(entry.tone),
					)}
				>
					<WorkEntryIcon entry={entry} />
				</span>
				<div className="min-w-0 flex-1 overflow-hidden">
					<Tooltip>
						<TooltipTrigger
							asChild
							aria-label={tooltipText}
							title={tooltipText}
						>
							<p
								className={cn(
									"truncate text-left text-[11px] leading-5",
									toneClassForWork(entry.tone),
									preview ? "text-muted-foreground/70" : null,
								)}
							>
								<span
									className={cn(
										"text-foreground/80",
										toneClassForWork(entry.tone),
									)}
								>
									{heading}
								</span>
								{preview ? (
									<span className="text-muted-foreground/55"> - {preview}</span>
								) : null}
							</p>
						</TooltipTrigger>
						<TooltipContent
							className={cn(
								"max-w-[min(720px,calc(100vw-2rem))]",
								tooltipIsCommand ? "px-1.5 py-1" : null,
							)}
							side="top"
							align="start"
						>
							<p
								className={cn(
									"whitespace-pre-wrap text-xs leading-5 wrap-break-word",
									tooltipIsCommand
										? "overflow-x-auto font-mono text-[11px] leading-4"
										: null,
								)}
							>
								{tooltipText}
							</p>
						</TooltipContent>
					</Tooltip>
				</div>
				{entry.status ? (
					<span className="shrink-0 text-muted-foreground/55 text-[10px]">
						{entry.status}
					</span>
				) : null}
			</div>
			{entry.changedFiles.length > 0 && !previewIsChangedFiles ? (
				<div className="mt-1 flex min-w-0 flex-wrap gap-1 pl-6">
					{entry.changedFiles.slice(0, 4).map((file) => (
						<span
							key={file}
							className="max-w-[180px] truncate rounded-md border border-border/55 bg-background/75 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/75"
							title={file}
						>
							{file}
						</span>
					))}
					{entry.changedFiles.length > 4 ? (
						<span className="px-1 text-[10px] text-muted-foreground/55">
							+{entry.changedFiles.length - 4}
						</span>
					) : null}
				</div>
			) : null}
		</div>
	);
});

function WorkEntryIcon({ entry }: { entry: TimelineWorkEntry }) {
	const className = "size-3.5";
	switch (entry.itemType) {
		case "CommandExecution":
			return <TerminalIcon className={className} aria-hidden="true" />;
		case "FileChange":
			return <FileDiffIcon className={className} aria-hidden="true" />;
		case "DynamicToolCall":
		case "McpToolCall":
			return <SettingsIcon className={className} aria-hidden="true" />;
		case "Reasoning":
			return <LightbulbIcon className={className} aria-hidden="true" />;
		case "WebSearch":
			return <SearchIcon className={className} aria-hidden="true" />;
		case "ImageView":
		case "ImageGeneration":
			return <ImageIcon className={className} aria-hidden="true" />;
		case "ContextCompaction":
			return <BoxIcon className={className} aria-hidden="true" />;
		case "HookPrompt":
			return <GlobeIcon className={className} aria-hidden="true" />;
	}
}

function compactToolLabel(value: string): string {
	return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

function formatCompactToolHeading(value: string): string {
	const trimmed = compactToolLabel(value);
	if (trimmed.length === 0) {
		return value;
	}
	return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

function toneClassForWork(tone: TimelineWorkEntry["tone"]): string {
	if (tone === "error") {
		return "text-destructive/70";
	}
	if (tone === "tool") {
		return "text-muted-foreground/70";
	}
	if (tone === "thinking") {
		return "text-muted-foreground/50";
	}
	return "text-muted-foreground/40";
}

function ProposedPlanTimelineRow({
	row,
}: {
	row: Extract<MessagesTimelineRow, { kind: "proposed-plan" }>;
}) {
	return (
		<div className="min-w-0 px-1 py-0.5">
			<ProposedPlanCard planMarkdown={row.item.text} />
		</div>
	);
}

function UserInputContent({ content }: { content: UserInput[] }) {
	const { onImageExpand } = useTimelineRowContext();
	const images = content.filter(
		(item): item is Extract<UserInput, { type: "image" }> =>
			item.type === "image",
	);
	const localImages = content.filter((item) => item.type === "local_image");
	const text = content
		.filter((item) => item.type === "text")
		.map((item) => item.text)
		.join("\n\n");
	const displayText = decodeHistoryMentions(text).text;
	const imagePreview = buildUserInputImagePreview(images);

	return (
		<div className="grid gap-3">
			{images.length > 0 ? (
				<div className="grid max-w-[420px] grid-cols-2 gap-2">
					{images.map((image, index) => (
						<button
							type="button"
							key={`${image.image_url}-${index}`}
							className="overflow-hidden rounded-lg border border-border/80 bg-background/70 text-left transition hover:border-border hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							onClick={() => {
								if (imagePreview) {
									onImageExpand({ ...imagePreview, index });
								}
							}}
						>
							<img
								src={image.image_url}
								alt=""
								className="block h-auto max-h-[220px] w-full object-cover"
							/>
						</button>
					))}
				</div>
			) : null}
			<UserMessageBody text={displayText} />
			{localImages.length > 0 ? (
				<div className="flex items-center gap-2 rounded-lg border bg-card/80 p-2 text-muted-foreground text-xs">
					<PaperclipIcon className="size-4" aria-hidden="true" />
					{localImages.length} local image
					{localImages.length === 1 ? "" : "s"}
				</div>
			) : null}
		</div>
	);
}

function UserMessageBody({ text }: { text: string }) {
	if (text.length === 0) {
		return null;
	}

	return (
		<div className="whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground">
			<UserMessageText text={text} />
		</div>
	);
}

function UserMessageText({ text }: { text: string }) {
	const parts = splitMentionText(text);
	return (
		<>
			{parts.map((part, index) =>
				part.kind === "mention" ? (
					<span
						key={`${part.text}-${index}`}
						className="inline-flex max-w-full align-baseline font-medium text-foreground"
						data-mention-chip="true"
					>
						{part.text}
					</span>
				) : (
					<span key={`${part.text}-${index}`}>{part.text}</span>
				),
			)}
		</>
	);
}

function WarningTimelineRow({ message }: { message: string }) {
	return (
		<div className="rounded-lg border bg-muted/50 px-4 py-3 text-muted-foreground text-sm">
			{message}
		</div>
	);
}

function ErrorTimelineRow({ message }: { message: string }) {
	const credentialError = isAssistantCredentialError(message);

	return (
		<div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-sm">
			<p>{message}</p>
			{credentialError ? (
				<a
					href="/settings/api-keys"
					className="mt-2 inline-flex font-medium underline-offset-4 hover:underline"
				>
					Open API key settings
				</a>
			) : null}
		</div>
	);
}

function WorkingTimelineRow({
	row,
}: {
	row: Extract<MessagesTimelineRow, { kind: "working" }>;
}) {
	return (
		<div className="py-0.5 pl-1.5">
			<div className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground/70">
				<span className="inline-flex items-center gap-[3px]">
					<span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/30" />
					<span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/30 [animation-delay:200ms]" />
					<span className="h-1 w-1 animate-pulse rounded-full bg-muted-foreground/30 [animation-delay:400ms]" />
				</span>
				<span>
					{row.createdAt ? (
						<>
							Working for <WorkingTimer createdAt={row.createdAt} />
						</>
					) : (
						"Working..."
					)}
				</span>
			</div>
		</div>
	);
}

function WorkingTimer({ createdAt }: { createdAt: string }) {
	const [nowMs, setNowMs] = useState(() => Date.now());
	useEffect(() => {
		const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
		return () => window.clearInterval(intervalId);
	}, [createdAt]);

	return <>{formatWorkingTimer(createdAt, new Date(nowMs).toISOString()) ?? "0s"}</>;
}

function formatWorkingTimer(startIso: string, endIso: string): string | null {
	const startedAtMs = Date.parse(startIso);
	const endedAtMs = Date.parse(endIso);
	if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) {
		return null;
	}

	const elapsedSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
	if (elapsedSeconds < 60) {
		return `${elapsedSeconds}s`;
	}

	const hours = Math.floor(elapsedSeconds / 3600);
	const minutes = Math.floor((elapsedSeconds % 3600) / 60);
	const seconds = elapsedSeconds % 60;

	if (hours > 0) {
		return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
	}

	return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatTimestamp(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) {
		return "";
	}
	return new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	}).format(date);
}

function userInputTextForCopy(content: readonly UserInput[]): string | null {
	const text = content
		.filter((item) => item.type === "text")
		.map((item) => decodeHistoryMentions(item.text).text)
		.join("\n\n")
		.trim();
	return text.length > 0 ? text : null;
}

function buildUserInputImagePreview(
	images: Extract<UserInput, { type: "image" }>[],
): ExpandedImagePreview | null {
	if (images.length === 0) {
		return null;
	}
	return {
		images: images.map((image, index) => ({
			src: image.image_url,
			name: `Image ${index + 1}`,
		})),
		index: 0,
	};
}

function splitMentionText(
	text: string,
): Array<{ kind: "mention" | "text"; text: string }> {
	const parts: Array<{ kind: "mention" | "text"; text: string }> = [];
	const mentionPattern = /@[\p{L}\p{N}_-]+/gu;
	let lastIndex = 0;
	for (const match of text.matchAll(mentionPattern)) {
		const start = match.index ?? 0;
		if (start > lastIndex) {
			parts.push({ kind: "text", text: text.slice(lastIndex, start) });
		}
		parts.push({ kind: "mention", text: match[0] ?? "" });
		lastIndex = start + (match[0]?.length ?? 0);
	}
	if (lastIndex < text.length) {
		parts.push({ kind: "text", text: text.slice(lastIndex) });
	}
	return parts.length > 0 ? parts : [{ kind: "text", text }];
}

function MessageCopyButton({
	compact = false,
	text,
}: {
	compact?: boolean;
	text: string;
}) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<number | null>(null);

	useEffect(
		() => () => {
			if (timeoutRef.current !== null) {
				window.clearTimeout(timeoutRef.current);
			}
		},
		[],
	);

	async function copyMessage() {
		if (!navigator.clipboard?.writeText) {
			return;
		}
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			return;
		}
		if (timeoutRef.current !== null) {
			window.clearTimeout(timeoutRef.current);
		}
		setCopied(true);
		timeoutRef.current = window.setTimeout(() => {
			timeoutRef.current = null;
			setCopied(false);
		}, 1000);
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="outline"
					size={compact ? "icon-xs" : "xs"}
					onClick={() => void copyMessage()}
					aria-label="Copy message"
					disabled={copied}
					className={cn(
						compact
							? "border-border/40 bg-background/25 text-muted-foreground/55 shadow-none hover:border-border/70 hover:bg-background/55 hover:text-muted-foreground/80"
							: "mt-1.5 border-border/50 bg-background/35 text-muted-foreground/45 opacity-0 shadow-none hover:border-border/70 hover:bg-background/55 hover:text-muted-foreground/70 group-hover/assistant:opacity-100",
					)}
				>
					{copied ? (
						<CheckIcon className="size-3 text-success" aria-hidden="true" />
					) : (
						<CopyIcon className="size-3" aria-hidden="true" />
					)}
				</Button>
			</TooltipTrigger>
			<TooltipContent>
				<p>{copied ? "Copied" : "Copy to clipboard"}</p>
			</TooltipContent>
		</Tooltip>
	);
}
