import type {
	CoreTurnItem as TurnItem,
	CoreUserInput as UserInput,
	CoreUserMessageTurnItem as UserMessageTurnItem,
	ThreadHistoryTurn as Turn,
} from "@jrkropp/codex-js/client";

import {
	changedFilesForFileChangeTurnItem,
	type TimelineChangedFile,
} from "./ChangedFilesTree.logic";

export const TIMELINE_WORKING_ROW_ID = "working-indicator-row";
export const MAX_VISIBLE_WORK_LOG_ENTRIES = 6;

type TimelineMessageItem = Extract<
	TurnItem,
	{ type: "AgentMessage" | "UserMessage" }
>;
type TimelineProposedPlanItem = Extract<TurnItem, { type: "Plan" }>;
type TimelineWorkTurnItem = Exclude<
	TurnItem,
	TimelineMessageItem | TimelineProposedPlanItem
>;

export type TimelineWorkEntryTone = "error" | "info" | "thinking" | "tool";

export type TimelineWorkEntry = {
	changedFiles: string[];
	id: string;
	item: TimelineWorkTurnItem;
	itemType: TimelineWorkTurnItem["type"];
	label: string;
	preview: string | null;
	status: string | null;
	title: string | null;
	tone: TimelineWorkEntryTone;
};

export type MessagesTimelineRow =
	| { kind: "empty"; id: "empty" }
	| {
			kind: "message";
			completedAt: string | null;
			createdAt: string | null;
			durationStart: string | null;
			id: string;
			item: TimelineMessageItem;
			role: "assistant" | "user";
			changedFiles: TimelineChangedFile[];
			showAssistantCopyButton: boolean;
			showCompletionDivider: boolean;
			turnId: string | null;
	  }
	| {
			kind: "proposed-plan";
			createdAt: string | null;
			id: string;
			item: TimelineProposedPlanItem;
			turnId: string | null;
	  }
	| {
			kind: "work";
			createdAt: string | null;
			groupedEntries: TimelineWorkEntry[];
			id: string;
			turnId: string | null;
	  }
	| { kind: "working"; id: typeof TIMELINE_WORKING_ROW_ID; createdAt: string | null }
	| { kind: "warning"; id: string; message: string }
	| { kind: "error"; id: string; message: string };

export type StableMessagesTimelineRowsState = {
	byId: Map<string, MessagesTimelineRow>;
	result: MessagesTimelineRow[];
};

export function deriveMessagesTimelineRows(input: {
	turns: readonly Turn[];
	optimisticUserMessages?: readonly UserMessageTurnItem[];
	isWorking?: boolean;
	activeTurnStartedAt?: string | null;
	running?: boolean;
	hasPendingRequest?: boolean;
	warnings: string[];
	errors: string[];
	runtimeError: string | null;
}): MessagesTimelineRow[] {
	const rows = deriveTurnRows(input.turns, input.optimisticUserMessages ?? []);

	const isWorking =
		input.isWorking ??
		shouldShowWorkingRow({
			turns: input.turns,
			running: input.running ?? false,
			hasPendingRequest: input.hasPendingRequest ?? false,
		});

	if (isWorking) {
		rows.push({
			kind: "working",
			id: TIMELINE_WORKING_ROW_ID,
			createdAt: input.activeTurnStartedAt ?? null,
		});
	}

	for (const [index, warning] of input.warnings.entries()) {
		rows.push({
			kind: "warning",
			id: `warning-${index}-${hashSmall(warning)}`,
			message: warning,
		});
	}

	for (const [index, error] of input.errors.entries()) {
		rows.push({
			kind: "error",
			id: `thread-error-${index}-${hashSmall(error)}`,
			message: error,
		});
	}

	if (input.runtimeError) {
		rows.push({
			kind: "error",
			id: `runtime-error-${hashSmall(input.runtimeError)}`,
			message: input.runtimeError,
		});
	}

	return rows.length > 0 ? rows : [{ kind: "empty", id: "empty" }];
}

export function computeStableMessagesTimelineRows(
	rows: MessagesTimelineRow[],
	previous: StableMessagesTimelineRowsState,
): StableMessagesTimelineRowsState {
	const next = new Map<string, MessagesTimelineRow>();
	let changed = rows.length !== previous.byId.size;

	const result = rows.map((row, index) => {
		const previousRow = previous.byId.get(row.id);
		const nextRow =
			previousRow && messagesTimelineRowUnchanged(previousRow, row)
				? previousRow
				: row;
		next.set(row.id, nextRow);
		if (!changed && previous.result[index] !== nextRow) {
			changed = true;
		}
		return nextRow;
	});

	return changed ? { byId: next, result } : previous;
}

export function shouldShowWorkingRow(input: {
	isWorking?: boolean;
	items?: TurnItem[];
	turns?: readonly Turn[];
	running?: boolean;
	hasPendingRequest?: boolean;
}): boolean {
	if (typeof input.isWorking === "boolean") {
		return input.isWorking;
	}
	const items = input.items ?? input.turns?.flatMap((turn) => turn.items) ?? [];
	return Boolean(
		input.running &&
			!input.hasPendingRequest &&
			!items.some(
				(item) => item.type === "AgentMessage" && item.phase === "streaming",
			),
	);
}

export function buildOptimisticUserMessageTurnItem(input: {
	id: string;
	imageUrls?: readonly string[];
	items: readonly UserInput[];
}): UserMessageTurnItem {
	return {
		type: "UserMessage",
		id: input.id,
		content: [
			...input.items,
			...(input.imageUrls ?? []).map((imageUrl) => ({
				type: "image" as const,
				image_url: imageUrl,
			})),
		],
	};
}

export function mergeOptimisticUserMessageTurnItems(
	items: readonly TurnItem[],
	optimisticMessages: readonly UserMessageTurnItem[],
): TurnItem[] {
	if (optimisticMessages.length === 0) {
		return [...items];
	}

	const serverUserMessageIds = new Set(
		items.flatMap((item) =>
			item.type === "UserMessage" ? [item.id] : [],
		),
	);
	const pendingOptimisticMessages = optimisticMessages.filter(
		(message) => !serverUserMessageIds.has(message.id),
	);

	return pendingOptimisticMessages.length > 0
		? [...pendingOptimisticMessages, ...items]
		: [...items];
}

export function resolveAssistantMessageCopyState(input: {
	showCopyButton: boolean;
	streaming: boolean;
	text: string | null;
}): { text: string | null; visible: boolean } {
	const text = normalizeCopyText(input.text ?? "");

	return {
		text,
		visible: input.showCopyButton && Boolean(text) && !input.streaming,
	};
}

export function timelineWorkEntryForTurnItem(
	item: TurnItem,
): TimelineWorkEntry | null {
	switch (item.type) {
		case "UserMessage":
		case "AgentMessage":
		case "Plan":
			return null;
		case "CommandExecution": {
			const command = item.command.join(" ").trim();
			const output = [item.stdout, item.stderr].filter(Boolean).join("\n").trim();
			return {
				changedFiles: [],
				id: item.id,
				item,
				itemType: item.type,
				label: item.status === "in_progress" ? "Running command" : "Command",
				preview: command || null,
				status: readableStatus(item.status),
				title: [command, item.cwd ? `cwd: ${item.cwd}` : null, output]
					.filter(Boolean)
					.join("\n\n") || null,
				tone: item.status === "failed" ? "error" : "tool",
			};
		}
		case "FileChange": {
			const changedFiles = Object.keys(item.changes);
			const status = item.status ? readableStatus(item.status) : null;
			return {
				changedFiles,
				id: item.id,
				item,
				itemType: item.type,
				label: `${changedFiles.length} file change${
					changedFiles.length === 1 ? "" : "s"
				}`,
				preview: changedFiles.slice(0, 2).join(", ") || status,
				status,
				title:
					[changedFiles.join("\n"), item.stderr, item.stdout]
						.filter(Boolean)
						.join("\n\n") || null,
				tone: item.status === "failed" || item.status === "declined" ? "error" : "tool",
			};
		}
		case "DynamicToolCall": {
			const name = item.namespace ? `${item.namespace}.${item.tool}` : item.tool;
			return {
				changedFiles: [],
				id: item.id,
				item,
				itemType: item.type,
				label: name,
				preview: readableStatus(item.status),
				status: readableStatus(item.status),
				title: stringifyPreview(item.arguments),
				tone: item.status === "failed" ? "error" : "tool",
			};
		}
		case "McpToolCall": {
			const name = item.server ? `${item.server}.${item.tool}` : item.tool;
			return {
				changedFiles: [],
				id: item.id,
				item,
				itemType: item.type,
				label: name,
				preview: item.error?.message ?? readableStatus(item.status),
				status: readableStatus(item.status),
				title:
					item.error?.message ??
					stringifyPreview(item.result) ??
					stringifyPreview(item.arguments),
				tone: item.status === "failed" ? "error" : "tool",
			};
		}
		case "Reasoning": {
			const preview =
				firstNonEmpty(item.summary_text) ?? firstNonEmpty(item.raw_content);
			return {
				changedFiles: [],
				id: item.id,
				item,
				itemType: item.type,
				label: "Thinking",
				preview,
				status: null,
				title: [...item.summary_text, ...item.raw_content].join("\n\n") || null,
				tone: "thinking",
			};
		}
		case "WebSearch":
			return {
				changedFiles: [],
				id: item.id,
				item,
				itemType: item.type,
				label: "Web search",
				preview: webSearchPreview(item),
				status: null,
				title: webSearchPreview(item),
				tone: "tool",
			};
		case "ImageView":
			return {
				changedFiles: [],
				id: item.id,
				item,
				itemType: item.type,
				label: "Viewed image",
				preview: item.path,
				status: null,
				title: item.path,
				tone: "info",
			};
		case "ImageGeneration":
			return {
				changedFiles: item.saved_path ? [item.saved_path] : [],
				id: item.id,
				item,
				itemType: item.type,
				label: "Image generation",
				preview: item.saved_path ?? item.result ?? readableStatus(item.status),
				status: readableStatus(item.status),
				title:
					[item.revised_prompt, item.saved_path, item.result]
						.filter(Boolean)
						.join("\n\n") || null,
				tone: item.status === "failed" ? "error" : "tool",
			};
		case "ContextCompaction":
			return {
				changedFiles: [],
				id: item.id,
				item,
				itemType: item.type,
				label: "Compacted context",
				preview: null,
				status: null,
				title: null,
				tone: "info",
			};
		case "HookPrompt":
			return {
				changedFiles: [],
				id: item.id,
				item,
				itemType: item.type,
				label: "Hook prompt",
				preview: firstNonEmpty(item.fragments.map((fragment) => fragment.text)),
				status: null,
				title: item.fragments.map((fragment) => fragment.text).join("\n\n") || null,
				tone: "info",
			};
	}
}

export function visibleTimelineWorkEntries(input: {
	entries: readonly TimelineWorkEntry[];
	expanded?: boolean;
	maxVisible?: number;
}): { entries: TimelineWorkEntry[]; hiddenCount: number } {
	const maxVisible = input.maxVisible ?? MAX_VISIBLE_WORK_LOG_ENTRIES;
	if (input.expanded || input.entries.length <= maxVisible) {
		return { entries: [...input.entries], hiddenCount: 0 };
	}
	return {
		entries: input.entries.slice(-maxVisible),
		hiddenCount: input.entries.length - maxVisible,
	};
}

export function messagesTimelineFingerprint(
	rows: readonly MessagesTimelineRow[],
): string {
	const last = rows.at(-1);
	if (!last) {
		return "empty";
	}
	if (last.kind === "message" && last.item.type === "AgentMessage") {
		const text = last.item.content.map((part) => part.text).join("");
		return `${rows.length}:${last.id}:${text.length}:${last.item.phase ?? "done"}:${
			last.completedAt ?? ""
		}`;
	}
	if (last.kind === "proposed-plan") {
		return `${rows.length}:${last.id}:${last.item.text.length}`;
	}
	if (last.kind === "work") {
		const lastEntry = last.groupedEntries.at(-1);
		return `${rows.length}:${last.id}:${last.groupedEntries.length}:${
			lastEntry?.status ?? ""
		}`;
	}

	return `${rows.length}:${last.id}`;
}

export function turnItemTextForCopy(item: TurnItem): string | null {
	switch (item.type) {
		case "AgentMessage":
			return normalizeCopyText(item.content.map((part) => part.text).join("\n\n"));
		case "Plan":
			return normalizeCopyText(item.text);
		default:
			return null;
	}
}

export function isAssistantCredentialError(message: string): boolean {
	return /OpenAI API key|OpenAI platform credentials|OpenAI credential|Saved OpenAI credentials/i.test(
		message,
	);
}

function messagesTimelineRowUnchanged(
	a: MessagesTimelineRow,
	b: MessagesTimelineRow,
): boolean {
	if (a.kind !== b.kind || a.id !== b.id) {
		return false;
	}

	switch (a.kind) {
		case "empty":
			return true;
		case "working":
			return a.createdAt === (b as typeof a).createdAt;
		case "message":
			return (
				a.item === (b as typeof a).item &&
				a.createdAt === (b as typeof a).createdAt &&
				a.completedAt === (b as typeof a).completedAt &&
				a.durationStart === (b as typeof a).durationStart &&
				changedFilesUnchanged(a.changedFiles, (b as typeof a).changedFiles) &&
				a.showAssistantCopyButton === (b as typeof a).showAssistantCopyButton &&
				a.showCompletionDivider === (b as typeof a).showCompletionDivider &&
				a.turnId === (b as typeof a).turnId
			);
		case "proposed-plan":
			return (
				a.item === (b as typeof a).item &&
				a.createdAt === (b as typeof a).createdAt &&
				a.turnId === (b as typeof a).turnId
			);
		case "work":
			return (
				a.createdAt === (b as typeof a).createdAt &&
				a.turnId === (b as typeof a).turnId &&
				workEntriesUnchanged(a.groupedEntries, (b as typeof a).groupedEntries)
			);
		case "warning":
		case "error":
			return a.message === (b as typeof a).message;
	}
}

function deriveTurnRows(
	turns: readonly Turn[],
	optimisticUserMessages: readonly UserMessageTurnItem[],
): MessagesTimelineRow[] {
	const rows: MessagesTimelineRow[] = [];
	let pendingWorkEntries: TimelineWorkEntry[] = [];
	let pendingWorkTurnId: string | null = null;
	let pendingWorkCreatedAt: string | null = null;

	const latestCompletedTimedTurnId = latestCompletedTimedAssistantTurnId(turns);
	const firstAssistantMessageIds = firstAssistantMessageIdsByTurn(turns);
	const terminalAssistantMessageIdsByTurn = terminalAssistantMessageIdsByTurnId(turns);
	const terminalAssistantMessageIds = new Set(terminalAssistantMessageIdsByTurn.values());
	const changedFilesByTurn = changedFilesByTurnId(turns);
	let unplacedOptimisticUserMessages = pendingOptimisticUserMessages(
		turns,
		optimisticUserMessages,
	);

	const flushWork = () => {
		if (pendingWorkEntries.length === 0) {
			return;
		}
		const firstEntry = pendingWorkEntries[0];
		const lastEntry = pendingWorkEntries.at(-1);
		rows.push({
			kind: "work",
			createdAt: pendingWorkCreatedAt,
			groupedEntries: pendingWorkEntries,
			id: `work:${pendingWorkTurnId ?? "none"}:${firstEntry?.id ?? "first"}:${
				lastEntry?.id ?? "last"
			}:${pendingWorkEntries.length}`,
			turnId: pendingWorkTurnId,
		});
		pendingWorkEntries = [];
		pendingWorkTurnId = null;
		pendingWorkCreatedAt = null;
	};

	for (const turn of turns) {
		const createdAt = epochMsToIso(turn.started_at);
		const completedAt = epochMsToIso(turn.completed_at);
		const optimisticMessagesForTurn =
			turn.status === "in_progress" &&
			turn.items.length > 0 &&
			!turn.items.some((item) => item.type === "UserMessage")
				? unplacedOptimisticUserMessages
				: [];
		if (optimisticMessagesForTurn.length > 0) {
			unplacedOptimisticUserMessages = [];
			for (const item of optimisticMessagesForTurn) {
				rows.push(messageRowForTurnItem({
					completedAt: null,
					createdAt,
					durationStart: null,
					item,
					turnId: turn.id,
				}));
			}
		}

		for (const item of turn.items) {
			if (item.type === "UserMessage" || item.type === "AgentMessage") {
				flushWork();
				rows.push(
					messageRowForTurnItem({
						completedAt: item.type === "AgentMessage" ? completedAt : null,
						createdAt,
						durationStart: item.type === "AgentMessage" ? createdAt : null,
						item,
						turnId: turn.id,
						changedFiles:
							item.type === "AgentMessage" &&
							terminalAssistantMessageIdsByTurn.get(turn.id) === item.id
								? (changedFilesByTurn.get(turn.id) ?? [])
								: [],
						showAssistantCopyButton:
							item.type === "AgentMessage" && terminalAssistantMessageIds.has(item.id),
						showCompletionDivider:
							item.type === "AgentMessage" &&
							turn.id === latestCompletedTimedTurnId &&
							firstAssistantMessageIds.get(turn.id) === item.id,
					}),
				);
				continue;
			}

			if (item.type === "Plan") {
				flushWork();
				rows.push({
					kind: "proposed-plan",
					createdAt,
					id: item.id,
					item,
					turnId: turn.id,
				});
				continue;
			}

			const entry = timelineWorkEntryForTurnItem(item);
			if (!entry) {
				continue;
			}
			if (pendingWorkEntries.length === 0) {
				pendingWorkTurnId = turn.id;
				pendingWorkCreatedAt = createdAt;
			}
			pendingWorkEntries.push(entry);
		}
	}
	flushWork();

	for (const item of unplacedOptimisticUserMessages) {
		rows.push(messageRowForTurnItem({
			completedAt: null,
			createdAt: null,
			durationStart: null,
			item,
			turnId: null,
		}));
	}

	return rows;
}

function messageRowForTurnItem(input: {
	completedAt: string | null;
	createdAt: string | null;
	durationStart: string | null;
	item: TimelineMessageItem;
	turnId: string | null;
	changedFiles?: TimelineChangedFile[];
	showAssistantCopyButton?: boolean;
	showCompletionDivider?: boolean;
}): Extract<MessagesTimelineRow, { kind: "message" }> {
	return {
		kind: "message",
		completedAt: input.completedAt,
		createdAt: input.createdAt,
		durationStart: input.durationStart,
		id: input.item.id,
		item: input.item,
		role: input.item.type === "UserMessage" ? "user" : "assistant",
		changedFiles: input.changedFiles ?? [],
		showAssistantCopyButton: input.showAssistantCopyButton ?? false,
		showCompletionDivider: input.showCompletionDivider ?? false,
		turnId: input.turnId,
	};
}

function pendingOptimisticUserMessages(
	turns: readonly Turn[],
	optimisticMessages: readonly UserMessageTurnItem[],
): UserMessageTurnItem[] {
	if (optimisticMessages.length === 0) {
		return [];
	}
	const serverUserMessageIds = new Set(
		turns.flatMap((turn) =>
			turn.items.flatMap((item) =>
				item.type === "UserMessage" ? [item.id] : [],
			),
		),
	);
	return optimisticMessages.filter(
		(message) => !serverUserMessageIds.has(message.id),
	);
}

function latestCompletedTimedAssistantTurnId(turns: readonly Turn[]): string | null {
	for (let index = turns.length - 1; index >= 0; index -= 1) {
		const turn = turns[index];
		if (
			turn &&
			turn.started_at !== null &&
			turn.completed_at !== null &&
			turn.items.some((item) => item.type === "AgentMessage")
		) {
			return turn.id;
		}
	}
	return null;
}

function firstAssistantMessageIdsByTurn(turns: readonly Turn[]): Map<string, string> {
	const result = new Map<string, string>();
	for (const turn of turns) {
		const first = turn.items.find((item) => item.type === "AgentMessage");
		if (first) {
			result.set(turn.id, first.id);
		}
	}
	return result;
}

function terminalAssistantMessageIdsByTurnId(turns: readonly Turn[]): Map<string, string> {
	const result = new Map<string, string>();
	for (const turn of turns) {
		const terminal = [...turn.items]
			.reverse()
			.find((item) => item.type === "AgentMessage");
		if (terminal) {
			result.set(turn.id, terminal.id);
		}
	}
	return result;
}

function changedFilesByTurnId(turns: readonly Turn[]): Map<string, TimelineChangedFile[]> {
	const result = new Map<string, TimelineChangedFile[]>();
	for (const turn of turns) {
		const changedFiles = turn.items.flatMap((item) =>
			item.type === "FileChange" ? changedFilesForFileChangeTurnItem(item) : [],
		);
		if (changedFiles.length > 0) {
			result.set(turn.id, changedFiles);
		}
	}
	return result;
}

function epochMsToIso(value: number | null | undefined): string | null {
	if (value === null || value === undefined || !Number.isFinite(value)) {
		return null;
	}
	const milliseconds = Math.abs(value) < 10_000_000_000 ? value * 1000 : value;
	const date = new Date(milliseconds);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readableStatus(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	return value
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.toLowerCase();
}

function firstNonEmpty(values: readonly string[]): string | null {
	for (const value of values) {
		const trimmed = value.trim();
		if (trimmed) {
			return trimmed;
		}
	}
	return null;
}

function stringifyPreview(value: unknown): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value === "string") {
		return normalizeCopyText(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function webSearchPreview(item: Extract<TurnItem, { type: "WebSearch" }>): string | null {
	switch (item.action.type) {
		case "search":
			return item.action.query ?? item.action.queries?.join(", ") ?? item.query;
		case "open_page":
			return item.action.url ?? item.query;
		case "find_in_page":
			return [item.action.pattern, item.action.url].filter(Boolean).join(" in ");
		case "other":
			return item.query || null;
	}
}

function workEntriesUnchanged(
	a: readonly TimelineWorkEntry[],
	b: readonly TimelineWorkEntry[],
): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let index = 0; index < a.length; index += 1) {
		const left = a[index];
		const right = b[index];
		if (!left || !right) {
			return false;
		}
		if (
			left.item !== right.item ||
			left.id !== right.id ||
			left.itemType !== right.itemType ||
			left.label !== right.label ||
			left.preview !== right.preview ||
			left.status !== right.status ||
			left.title !== right.title ||
			left.tone !== right.tone ||
			left.changedFiles.length !== right.changedFiles.length ||
			left.changedFiles.some((file, fileIndex) => file !== right.changedFiles[fileIndex])
		) {
			return false;
		}
	}
	return true;
}

function changedFilesUnchanged(
	a: readonly TimelineChangedFile[],
	b: readonly TimelineChangedFile[],
): boolean {
	if (a.length !== b.length) {
		return false;
	}
	for (let index = 0; index < a.length; index += 1) {
		const left = a[index];
		const right = b[index];
		if (
			!left ||
			!right ||
			left.path !== right.path ||
			left.changeType !== right.changeType ||
			left.additions !== right.additions ||
			left.deletions !== right.deletions
		) {
			return false;
		}
	}
	return true;
}

function normalizeCopyText(value: string): string | null {
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function hashSmall(value: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < value.length; index += 1) {
		hash ^= value.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16);
}
