import type { RequestId } from "../../app-server-protocol/schema/typescript";
import type { Turn } from "../../app-server-protocol/schema/typescript/v2";
import { appServerTurnFromCoreTurn } from "../../app-server-protocol/src/protocol/thread-resume";
import type { ThreadId } from "../../core/src/ids";
import type { EventMsg } from "../../core/src/protocol";
import { ThreadHistoryBuilder } from "../../core/src/thread-history-builder";

export type PendingInterruptQueue = RequestId[];

export type PendingThreadResumeRequest = {
	includeTurns: boolean;
	requestId: RequestId;
	threadId: ThreadId;
};

export type ThreadListenerCommand =
	| { request: PendingThreadResumeRequest; type: "send_thread_resume_response" }
	| { requestId: RequestId; type: "resolve_server_request" };

export type TurnSummary = {
	lastError: { message: string } | null;
	startedAt: number | null;
};

export type ThreadStateTrackResult = {
	activeTurn: Turn | null;
	terminalTurn: Turn | null;
};

export class ThreadState {
	pendingInterrupts: PendingInterruptQueue = [];
	turnSummary: TurnSummary = { lastError: null, startedAt: null };
	lastTerminalTurnId: string | null = null;
	experimentalRawEvents = false;
	listenerGeneration = 0;
	private currentTurnHistory = new ThreadHistoryBuilder();
	private listenerActive = false;

	setListener(): number {
		this.listenerGeneration = (this.listenerGeneration + 1) >>> 0;
		this.listenerActive = true;
		return this.listenerGeneration;
	}

	clearListener(): void {
		this.listenerActive = false;
		this.currentTurnHistory.reset();
	}

	hasListener(): boolean {
		return this.listenerActive;
	}

	setExperimentalRawEvents(enabled: boolean): void {
		this.experimentalRawEvents = enabled;
	}

	activeTurnSnapshot(): Turn | null {
		const turn = this.currentTurnHistory.active_turn_snapshot();
		return turn ? appServerTurnFromCoreTurn(turn) : null;
	}

	trackCurrentTurnEvent(eventTurnId: string, event: EventMsg): ThreadStateTrackResult {
		if (event.type === "turn_started") {
			this.turnSummary.startedAt = event.started_at ?? null;
		}
		if (event.type === "error") {
			this.turnSummary.lastError = { message: event.message };
		}
		this.currentTurnHistory.handle_event(event, eventTurnId);
		if (event.type === "turn_complete" || event.type === "turn_aborted") {
			this.lastTerminalTurnId = eventTurnId;
			const terminalTurn =
				this.currentTurnHistory.finish().find((turn) => turn.id === eventTurnId) ??
				null;
			this.currentTurnHistory.reset();
			return {
				activeTurn: null,
				terminalTurn: terminalTurn ? appServerTurnFromCoreTurn(terminalTurn) : null,
			};
		}
		return {
			activeTurn: this.activeTurnSnapshot(),
			terminalTurn: null,
		};
	}
}

export class ThreadStateManager {
	private readonly liveConnections = new Set<number>();
	private readonly threads = new Map<ThreadId, ThreadEntry>();
	private readonly threadIdsByConnection = new Map<number, Set<ThreadId>>();

	connectionInitialized(connectionId: number): void {
		this.liveConnections.add(connectionId);
	}

	threadState(threadId: ThreadId): ThreadState {
		const entry = this.threadEntry(threadId);
		return entry.state;
	}

	removeThreadState(threadId: ThreadId): void {
		const entry = this.threads.get(threadId);
		entry?.state.clearListener();
		this.threads.delete(threadId);
		for (const [connectionId, threadIds] of this.threadIdsByConnection) {
			threadIds.delete(threadId);
			if (threadIds.size === 0) {
				this.threadIdsByConnection.delete(connectionId);
			}
		}
	}

	clearAllListeners(): void {
		for (const entry of this.threads.values()) {
			entry.state.clearListener();
		}
	}

	subscribedConnectionIds(threadId: ThreadId): number[] {
		return Array.from(this.threads.get(threadId)?.connectionIds ?? []);
	}

	tryEnsureConnectionSubscribed(
		threadId: ThreadId,
		connectionId: number,
		experimentalRawEvents = false,
	): ThreadState | null {
		if (!this.liveConnections.has(connectionId)) {
			return null;
		}
		const threadIds = this.threadIdsByConnection.get(connectionId);
		if (threadIds) {
			threadIds.add(threadId);
		} else {
			this.threadIdsByConnection.set(connectionId, new Set([threadId]));
		}
		const entry = this.threadEntry(threadId);
		entry.connectionIds.add(connectionId);
		if (experimentalRawEvents) {
			entry.state.setExperimentalRawEvents(true);
		}
		return entry.state;
	}

	unsubscribeConnectionFromThread(threadId: ThreadId, connectionId: number): boolean {
		const entry = this.threads.get(threadId);
		const threadIds = this.threadIdsByConnection.get(connectionId);
		if (!entry || !threadIds?.has(threadId)) {
			return false;
		}
		entry.connectionIds.delete(connectionId);
		threadIds.delete(threadId);
		if (threadIds.size === 0) {
			this.threadIdsByConnection.delete(connectionId);
		}
		return true;
	}

	removeConnection(connectionId: number): ThreadId[] {
		this.liveConnections.delete(connectionId);
		const threadIds = Array.from(this.threadIdsByConnection.get(connectionId) ?? []);
		this.threadIdsByConnection.delete(connectionId);
		const emptyThreadIds: ThreadId[] = [];
		for (const threadId of threadIds) {
			const entry = this.threads.get(threadId);
			entry?.connectionIds.delete(connectionId);
			if (entry && entry.connectionIds.size === 0) {
				emptyThreadIds.push(threadId);
			}
		}
		return emptyThreadIds;
	}

	private threadEntry(threadId: ThreadId): ThreadEntry {
		const existing = this.threads.get(threadId);
		if (existing) {
			return existing;
		}
		const entry: ThreadEntry = {
			connectionIds: new Set(),
			state: new ThreadState(),
		};
		this.threads.set(threadId, entry);
		return entry;
	}
}

type ThreadEntry = {
	connectionIds: Set<number>;
	state: ThreadState;
};
