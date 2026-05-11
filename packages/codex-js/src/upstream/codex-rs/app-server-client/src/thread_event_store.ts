import type {
	RequestId,
	ServerNotification,
	ServerRequest,
} from "../../app-server-protocol/schema/typescript";
import type {
	Thread,
	ThreadItem,
	ThreadTokenUsage,
	Turn,
} from "../../app-server-protocol/schema/typescript/v2";
import type { RateLimitSnapshot } from "../../app-server-protocol/schema/typescript/v2/RateLimitSnapshot";
import type { RenderedThreadConnectionStatus } from "../../core/src/rendered-thread";

export type ThreadBufferedEvent =
	| { notification: ServerNotification; type: "notification" }
	| { request: ServerRequest; type: "request" };

export type ServerNotificationThreadTarget =
	| { threadId: string; type: "thread" }
	| { threadId: string; type: "invalid_thread_id" }
	| { type: "global" };

export type ThreadEventSnapshot = {
	activeTurnIds: string[];
	accountRateLimits: RateLimitSnapshot | null;
	bufferedEvents: ThreadBufferedEvent[];
	connectionStatus: RenderedThreadConnectionStatus;
	errors: string[];
	pendingRequests: ServerRequest[];
	resolvedRequestIds: RequestId[];
	thread: Thread | null;
	tokenUsage: ThreadTokenUsageSnapshot | null;
	turns: Turn[];
	warnings: string[];
};

export type ThreadTokenUsageSnapshot = {
	threadId: string;
	tokenUsage: ThreadTokenUsage;
	turnId: string;
	updatedAt: string;
};

export class ThreadEventStore {
	private accountRateLimits: RateLimitSnapshot | null = null;
	private activeTurnIds = new Set<string>();
	private bufferedEvents: ThreadBufferedEvent[] = [];
	private connectionStatus: RenderedThreadConnectionStatus = "idle";
	private errors: string[] = [];
	private pendingRequests = new Map<RequestId, ServerRequest>();
	private resolvedRequestIds: RequestId[] = [];
	private thread: Thread | null = null;
	private tokenUsage: ThreadTokenUsageSnapshot | null = null;
	private turns: Turn[] = [];
	private warnings: string[] = [];

	static fromThread(thread: Thread): ThreadEventStore {
		const store = new ThreadEventStore();
		store.setThread(thread);
		return store;
	}

	applyNotification(notification: ServerNotification): ThreadEventSnapshot {
		applyServerNotificationToThreadEventStore(this, notification);
		return this.snapshot();
	}

	applyRequest(request: ServerRequest): ThreadEventSnapshot {
		applyServerRequestToThreadEventStore(this, request);
		return this.snapshot();
	}

	setConnectionStatus(status: RenderedThreadConnectionStatus): ThreadEventSnapshot {
		this.connectionStatus = status;
		return this.snapshot();
	}

	setThread(thread: Thread): ThreadEventSnapshot {
		this.thread = cloneThread(thread);
		this.turns = thread.turns.map(cloneTurn);
		this.activeTurnIds = new Set(
			this.turns
				.filter((turn) => turn.status === "inProgress")
				.map((turn) => turn.id),
		);
		return this.snapshot();
	}

	snapshot(): ThreadEventSnapshot {
		return {
			activeTurnIds: [...this.activeTurnIds],
			accountRateLimits: this.accountRateLimits ? { ...this.accountRateLimits } : null,
			bufferedEvents: [...this.bufferedEvents],
			connectionStatus: this.connectionStatus,
			errors: [...this.errors],
			pendingRequests: [...this.pendingRequests.values()],
			resolvedRequestIds: [...this.resolvedRequestIds],
			thread: this.thread ? cloneThread(this.thread) : null,
			tokenUsage: this.tokenUsage
				? {
						...this.tokenUsage,
						tokenUsage: cloneThreadTokenUsage(this.tokenUsage.tokenUsage),
					}
				: null,
			turns: this.turns.map(cloneTurn),
			warnings: [...this.warnings],
		};
	}

	noteNotification(notification: ServerNotification): void {
		this.bufferedEvents = [...this.bufferedEvents, { notification, type: "notification" }];
		switch (notification.method) {
			case "thread/started":
				this.setThread(notification.params.thread);
				return;
			case "thread/status/changed":
				if (this.thread) {
					this.thread = { ...this.thread, status: notification.params.status };
				}
				return;
			case "thread/name/updated":
				if (this.thread) {
					this.thread = { ...this.thread, name: notification.params.threadName ?? null };
				}
				return;
			case "thread/archived":
			case "thread/unarchived":
			case "thread/closed":
			case "thread/goal/updated":
			case "thread/goal/cleared":
				return;
			case "thread/tokenUsage/updated":
				this.tokenUsage = {
					threadId: notification.params.threadId,
					tokenUsage: cloneThreadTokenUsage(notification.params.tokenUsage),
					turnId: notification.params.turnId,
					updatedAt: new Date().toISOString(),
				};
				return;
			case "turn/started":
				this.upsertTurn(notification.params.turn);
				this.activeTurnIds.add(notification.params.turn.id);
				return;
			case "turn/diff/updated":
			case "turn/plan/updated":
				this.ensureTurn(notification.params.turnId);
				return;
			case "turn/completed":
				this.upsertTurn(notification.params.turn);
				this.activeTurnIds.delete(notification.params.turn.id);
				if (notification.params.turn.error?.message) {
					this.errors = appendUnique(this.errors, notification.params.turn.error.message);
				}
				return;
			case "item/started":
			case "item/completed":
				this.upsertItem(notification.params.turnId, notification.params.item);
				return;
			case "item/agentMessage/delta":
				this.applyAgentMessageDelta(
					notification.params.turnId,
					notification.params.itemId,
					notification.params.delta,
				);
				return;
			case "item/plan/delta":
				this.applyPlanDelta(
					notification.params.turnId,
					notification.params.itemId,
					notification.params.delta,
				);
				return;
			case "item/reasoning/summaryPartAdded":
				this.applyReasoningSummaryPartAdded(
					notification.params.turnId,
					notification.params.itemId,
					notification.params.summaryIndex,
				);
				return;
			case "item/reasoning/summaryTextDelta":
				this.applyReasoningSummaryTextDelta(
					notification.params.turnId,
					notification.params.itemId,
					notification.params.summaryIndex,
					notification.params.delta,
				);
				return;
			case "item/reasoning/textDelta":
				this.applyReasoningTextDelta(
					notification.params.turnId,
					notification.params.itemId,
					notification.params.contentIndex,
					notification.params.delta,
				);
				return;
			case "item/commandExecution/outputDelta":
				this.applyCommandOutputDelta(
					notification.params.turnId,
					notification.params.itemId,
					notification.params.delta,
				);
				return;
			case "item/fileChange/outputDelta":
				this.ensureTurn(notification.params.turnId);
				return;
			case "item/fileChange/patchUpdated":
				this.applyFileChangePatchUpdated(
					notification.params.turnId,
					notification.params.itemId,
					notification.params.changes,
				);
				return;
			case "item/mcpToolCall/progress":
			case "item/commandExecution/terminalInteraction":
			case "command/exec/outputDelta":
			case "process/outputDelta":
			case "process/exited":
			case "rawResponseItem/completed":
			case "hook/started":
			case "hook/completed":
			case "item/autoApprovalReview/started":
			case "item/autoApprovalReview/completed":
				return;
			case "thread/compacted":
				this.upsertItem(notification.params.turnId, {
					id: `compacted-${notification.params.turnId}`,
					type: "contextCompaction",
				});
				return;
			case "serverRequest/resolved":
				this.pendingRequests.delete(notification.params.requestId);
				this.resolvedRequestIds = appendUnique(
					this.resolvedRequestIds,
					notification.params.requestId,
				);
				return;
			case "warning":
				this.warnings = appendUnique(this.warnings, notification.params.message);
				return;
			case "error":
				this.errors = appendUnique(this.errors, notification.params.error.message);
				return;
			case "guardianWarning":
				this.warnings = appendUnique(this.warnings, notification.params.message);
				return;
			case "deprecationNotice":
				this.warnings = appendUnique(this.warnings, notification.params.summary);
				return;
			case "configWarning":
				this.warnings = appendUnique(this.warnings, notification.params.summary);
				return;
			case "account/rateLimits/updated":
				this.accountRateLimits = { ...notification.params.rateLimits };
				return;
			case "thread/realtime/started":
			case "thread/realtime/itemAdded":
			case "thread/realtime/transcript/delta":
			case "thread/realtime/transcript/done":
			case "thread/realtime/outputAudio/delta":
			case "thread/realtime/sdp":
			case "thread/realtime/error":
			case "thread/realtime/closed":
			case "fs/changed":
			case "model/rerouted":
			case "model/verification":
			case "mcpServer/oauthLogin/completed":
			case "mcpServer/startupStatus/updated":
			case "fuzzyFileSearch/sessionUpdated":
			case "fuzzyFileSearch/sessionCompleted":
			case "windows/worldWritableWarning":
			case "windowsSandbox/setupCompleted":
				return;
			default:
				if (notificationThreadId(notification)) {
					this.warnings = appendUnique(
						this.warnings,
						`Unsupported Codex app-server notification: ${notification.method}`,
					);
				}
				return;
		}
	}

	noteRequest(request: ServerRequest): void {
		this.bufferedEvents = [...this.bufferedEvents, { request, type: "request" }];
		this.pendingRequests.set(request.id, request);
	}

	private upsertTurn(turn: Turn): void {
		const index = this.turns.findIndex((candidate) => candidate.id === turn.id);
		if (index === -1) {
			this.turns = [...this.turns, cloneTurn(turn)];
			return;
		}
		const current = this.turns[index];
		this.turns = replaceAt(this.turns, index, {
			...current,
			...turn,
			items: turn.items.length > 0 ? turn.items.map(cloneThreadItem) : current.items,
		});
	}

	private upsertItem(turnId: string, item: ThreadItem): void {
		const turn = this.ensureTurn(turnId);
		const itemIndex = turn.items.findIndex((candidate) => candidate.id === item.id);
		const nextItems =
			itemIndex === -1
				? [...turn.items, cloneThreadItem(item)]
				: replaceAt(turn.items, itemIndex, cloneThreadItem(item));
		this.replaceTurn({ ...turn, items: nextItems, itemsView: "full" });
	}

	private applyAgentMessageDelta(turnId: string, itemId: string, delta: string): void {
		const turn = this.ensureTurn(turnId);
		const item = turn.items.find((candidate) => candidate.id === itemId);
		if (item?.type === "agentMessage") {
			this.upsertItem(turnId, { ...item, text: `${item.text}${delta}` });
			return;
		}
		this.upsertItem(turnId, {
			id: itemId,
			memoryCitation: null,
			phase: "commentary",
			text: delta,
			type: "agentMessage",
		});
	}

	private applyPlanDelta(turnId: string, itemId: string, delta: string): void {
		const turn = this.ensureTurn(turnId);
		const item = turn.items.find((candidate) => candidate.id === itemId);
		if (item?.type === "plan") {
			this.upsertItem(turnId, { ...item, text: `${item.text}${delta}` });
			return;
		}
		this.upsertItem(turnId, {
			id: itemId,
			text: delta,
			type: "plan",
		});
	}

	private applyReasoningSummaryPartAdded(
		turnId: string,
		itemId: string,
		summaryIndex: number,
	): void {
		const item = this.reasoningItem(turnId, itemId);
		const summary = replaceAtOrAppend(item.summary, summaryIndex, "");
		this.upsertItem(turnId, { ...item, summary });
	}

	private applyReasoningSummaryTextDelta(
		turnId: string,
		itemId: string,
		summaryIndex: number,
		delta: string,
	): void {
		const item = this.reasoningItem(turnId, itemId);
		const current = item.summary[summaryIndex] ?? "";
		const summary = replaceAtOrAppend(item.summary, summaryIndex, `${current}${delta}`);
		this.upsertItem(turnId, { ...item, summary });
	}

	private applyReasoningTextDelta(
		turnId: string,
		itemId: string,
		contentIndex: number,
		delta: string,
	): void {
		const item = this.reasoningItem(turnId, itemId);
		const current = item.content[contentIndex] ?? "";
		const content = replaceAtOrAppend(item.content, contentIndex, `${current}${delta}`);
		this.upsertItem(turnId, { ...item, content });
	}

	private applyCommandOutputDelta(
		turnId: string,
		itemId: string,
		delta: string,
	): void {
		const turn = this.ensureTurn(turnId);
		const item = turn.items.find((candidate) => candidate.id === itemId);
		if (item?.type !== "commandExecution") {
			return;
		}
		this.upsertItem(turnId, {
			...item,
			aggregatedOutput: `${item.aggregatedOutput ?? ""}${delta}`,
		});
	}

	private applyFileChangePatchUpdated(
		turnId: string,
		itemId: string,
		changes: Extract<ThreadItem, { type: "fileChange" }>["changes"],
	): void {
		const turn = this.ensureTurn(turnId);
		const item = turn.items.find((candidate) => candidate.id === itemId);
		if (item?.type !== "fileChange") {
			return;
		}
		this.upsertItem(turnId, { ...item, changes });
	}

	private reasoningItem(
		turnId: string,
		itemId: string,
	): Extract<ThreadItem, { type: "reasoning" }> {
		const turn = this.ensureTurn(turnId);
		const item = turn.items.find((candidate) => candidate.id === itemId);
		if (item?.type === "reasoning") {
			return item;
		}
		return {
			content: [],
			id: itemId,
			summary: [],
			type: "reasoning",
		};
	}

	private ensureTurn(turnId: string): Turn {
		const existing = this.turns.find((turn) => turn.id === turnId);
		if (existing) {
			return existing;
		}
		const turn: Turn = {
			completedAt: null,
			durationMs: null,
			error: null,
			id: turnId,
			items: [],
			itemsView: "full",
			startedAt: null,
			status: "inProgress",
		};
		this.turns = [...this.turns, turn];
		this.activeTurnIds.add(turnId);
		return turn;
	}

	private replaceTurn(turn: Turn): void {
		const index = this.turns.findIndex((candidate) => candidate.id === turn.id);
		this.turns = index === -1 ? [...this.turns, turn] : replaceAt(this.turns, index, turn);
	}
}

export function applyServerNotificationToThreadEventStore(
	store: ThreadEventStore,
	notification: ServerNotification,
): ThreadEventSnapshot {
	store.noteNotification(notification);
	return store.snapshot();
}

export function applyServerRequestToThreadEventStore(
	store: ThreadEventStore,
	request: ServerRequest,
): ThreadEventSnapshot {
	store.noteRequest(request);
	return store.snapshot();
}

export function serverRequestThreadId(request: ServerRequest): string | null {
	if ("params" in request && request.params && typeof request.params === "object") {
		const threadId = (request.params as { threadId?: unknown }).threadId;
		return typeof threadId === "string" ? threadId : null;
	}
	return null;
}

export function serverNotificationThreadTarget(
	notification: ServerNotification,
): ServerNotificationThreadTarget {
	const threadId = notificationThreadId(notification);
	if (!threadId) {
		return { type: "global" };
	}
	return isUuidLike(threadId)
		? { threadId, type: "thread" }
		: { threadId, type: "invalid_thread_id" };
}

export function threadEventSnapshotHasStarted(
	snapshot: ThreadEventSnapshot | null,
): boolean {
	if (!snapshot) {
		return false;
	}
	return (
		snapshot.turns.some((turn) => turn.items.length > 0) ||
		snapshot.activeTurnIds.length > 0 ||
		snapshot.pendingRequests.length > 0 ||
		snapshot.warnings.length > 0 ||
		snapshot.errors.length > 0
	);
}

function notificationThreadId(notification: ServerNotification): string | null {
	if (notification.method === "thread/started") {
		return notification.params.thread.id;
	}
	if ("params" in notification && notification.params && typeof notification.params === "object") {
		const threadId = (notification.params as { threadId?: unknown }).threadId;
		return typeof threadId === "string" ? threadId : null;
	}
	return null;
}

function cloneThread(thread: Thread): Thread {
	return {
		...thread,
		turns: thread.turns.map(cloneTurn),
	};
}

function cloneTurn(turn: Turn): Turn {
	return {
		...turn,
		items: turn.items.map(cloneThreadItem),
	};
}

function cloneThreadItem(item: ThreadItem): ThreadItem {
	return { ...item };
}

function cloneThreadTokenUsage(tokenUsage: ThreadTokenUsage): ThreadTokenUsage {
	return {
		last: { ...tokenUsage.last },
		modelContextWindow: tokenUsage.modelContextWindow,
		total: { ...tokenUsage.total },
	};
}

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
	return [...items.slice(0, index), item, ...items.slice(index + 1)];
}

function replaceAtOrAppend<T>(items: readonly T[], index: number, item: T): T[] {
	if (index < items.length) {
		return replaceAt(items, index, item);
	}
	return [...items, item];
}

function appendUnique<T>(items: readonly T[], item: T): T[] {
	return items.includes(item) ? [...items] : [...items, item];
}

function isUuidLike(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}
