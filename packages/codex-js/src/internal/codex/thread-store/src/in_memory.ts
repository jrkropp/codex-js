import { ThreadMemoryMode } from "../../core/src/memory";
import type { ThreadId } from "../../core/src/ids";
import type { RolloutItem } from "../../core/src/protocol";
import type {
	AppendThreadItemsParams,
	ArchiveThreadParams,
	CreateThreadParams,
	ListThreadsParams,
	LoadThreadHistoryParams,
	ReadThreadByRolloutPathParams,
	ReadThreadParams,
	ResumeThreadParams,
	StoredThread,
	StoredThreadHistory,
	ThreadPage,
	UpdateThreadMetadataParams,
} from "../../core/src/thread-store/types";
import type { ThreadStore } from "../../core/src/thread-store/store";

export type InMemoryThreadStoreCalls = {
	archiveThread: number;
	appendItems: number;
	createThread: number;
	discardThread: number;
	flushThread: number;
	listThreads: number;
	loadHistory: number;
	persistThread: number;
	readThread: number;
	readThreadByRolloutPath: number;
	resumeThread: number;
	shutdownThread: number;
	unarchiveThread: number;
	updateThreadMetadata: number;
};

type InMemoryThreadStoreState = {
	calls: InMemoryThreadStoreCalls;
	createdThreads: Map<ThreadId, CreateThreadParams>;
	histories: Map<ThreadId, RolloutItem[]>;
	rolloutPaths: Map<string, ThreadId>;
	threads: Map<ThreadId, StoredThread>;
};

export type InMemoryThreadStoreSnapshot = {
	createdThreads: Array<[ThreadId, CreateThreadParams]>;
	histories: Array<[ThreadId, RolloutItem[]]>;
	rolloutPaths: Array<[string, ThreadId]>;
	threads: Array<[ThreadId, StoredThread]>;
};

const stores = new Map<string, InMemoryThreadStore>();

export class InMemoryThreadStore implements ThreadStore {
	protected readonly state: InMemoryThreadStoreState = {
		calls: emptyCalls(),
		createdThreads: new Map(),
		histories: new Map(),
		rolloutPaths: new Map(),
		threads: new Map(),
	};

	static forId(id: string): InMemoryThreadStore {
		const existing = stores.get(id);
		if (existing) {
			return existing;
		}
		const store = new InMemoryThreadStore();
		stores.set(id, store);
		return store;
	}

	static removeId(id: string): InMemoryThreadStore | null {
		const store = stores.get(id) ?? null;
		stores.delete(id);
		return store;
	}

	calls(): InMemoryThreadStoreCalls {
		return { ...this.state.calls };
	}

	snapshot(): InMemoryThreadStoreSnapshot {
		return {
			createdThreads: Array.from(this.state.createdThreads.entries()),
			histories: Array.from(this.state.histories.entries()).map(
				([threadId, items]) => [threadId, [...items]],
			),
			rolloutPaths: Array.from(this.state.rolloutPaths.entries()),
			threads: Array.from(this.state.threads.entries()).map(
				([threadId, thread]) => [threadId, { ...thread }],
			),
		};
	}

	restoreSnapshot(snapshot: InMemoryThreadStoreSnapshot): void {
		this.state.createdThreads = new Map(snapshot.createdThreads);
		this.state.histories = new Map(
			snapshot.histories.map(([threadId, items]) => [threadId, [...items]]),
		);
		this.state.rolloutPaths = new Map(snapshot.rolloutPaths);
		this.state.threads = new Map(
			snapshot.threads.map(([threadId, thread]) => [threadId, { ...thread }]),
		);
	}

	async createThread(params: CreateThreadParams): Promise<void> {
		this.state.calls.createThread += 1;
		const now = new Date().toISOString();
		this.state.createdThreads.set(params.thread_id, params);
		this.state.histories.set(params.thread_id, []);
		this.state.threads.set(params.thread_id, {
			archived_at: null,
			created_at: now,
			cwd: String(params.metadata.cwd ?? "/"),
			forked_from_id: params.forked_from_id ?? null,
			history: null,
			model: stringOrNull(params.metadata.model),
			model_provider: params.metadata.model_provider,
			name: null,
			preview: "",
			reasoning_effort: stringOrNull(params.metadata.reasoning_effort),
			source: params.source,
			thread_id: params.thread_id,
			thread_source: params.thread_source ?? null,
			token_usage: null,
			updated_at: now,
		});
	}

	async resumeThread(params: ResumeThreadParams): Promise<void> {
		this.state.calls.resumeThread += 1;
		if (!this.state.threads.has(params.thread_id)) {
			const now = new Date().toISOString();
			this.state.threads.set(params.thread_id, {
				archived_at: null,
				created_at: now,
				cwd: String(params.metadata.cwd ?? "/"),
				history: null,
				model: stringOrNull(params.metadata.model),
				model_provider: params.metadata.model_provider,
				preview: "",
				source: "appServer",
				thread_id: params.thread_id,
				token_usage: lastTokenInfoFromRolloutItems(params.history ?? []),
				updated_at: now,
			});
		}
		this.state.histories.set(
			params.thread_id,
			[...(params.history ?? this.state.histories.get(params.thread_id) ?? [])],
		);
		this.updateThreadTokenUsage(
			params.thread_id,
			params.history ?? this.state.histories.get(params.thread_id) ?? [],
		);
		if (params.rollout_path) {
			this.state.rolloutPaths.set(params.rollout_path, params.thread_id);
		}
	}

	async appendItems(params: AppendThreadItemsParams): Promise<void> {
		this.state.calls.appendItems += 1;
		this.history(params.thread_id).push(...params.items);
		this.updateThreadTokenUsage(params.thread_id, params.items);
		this.touch(params.thread_id);
	}

	async persistThread(threadId: ThreadId): Promise<void> {
		void threadId;
		this.state.calls.persistThread += 1;
	}

	async flushThread(threadId: ThreadId): Promise<void> {
		void threadId;
		this.state.calls.flushThread += 1;
	}

	async shutdownThread(threadId: ThreadId): Promise<void> {
		void threadId;
		this.state.calls.shutdownThread += 1;
	}

	async discardThread(threadId: ThreadId): Promise<void> {
		void threadId;
		this.state.calls.discardThread += 1;
	}

	async loadHistory(
		params: LoadThreadHistoryParams,
	): Promise<StoredThreadHistory> {
		this.state.calls.loadHistory += 1;
		return {
			items: [...this.history(params.thread_id)],
			thread_id: params.thread_id,
		};
	}

	async readThread(params: ReadThreadParams): Promise<StoredThread> {
		this.state.calls.readThread += 1;
		return this.storedThread(params.thread_id, params.include_history);
	}

	async readThreadByRolloutPath(
		params: ReadThreadByRolloutPathParams,
	): Promise<StoredThread> {
		this.state.calls.readThreadByRolloutPath += 1;
		const threadId = this.state.rolloutPaths.get(params.rollout_path);
		if (!threadId) {
			throw new Error(`Unknown rollout path: ${params.rollout_path}`);
		}
		return this.storedThread(threadId, params.include_history);
	}

	async listThreads(params: ListThreadsParams): Promise<ThreadPage> {
		this.state.calls.listThreads += 1;
		const items = Array.from(this.state.threads.values())
			.filter((thread) => params.archived || !thread.archived_at)
			.sort((left, right) =>
				params.sort_direction === "Asc"
					? left.created_at.localeCompare(right.created_at)
					: right.created_at.localeCompare(left.created_at),
			)
			.slice(0, params.page_size)
			.map((thread) => ({ ...thread, history: null }));
		return { items, next_cursor: null };
	}

	async updateThreadMetadata(
		params: UpdateThreadMetadataParams,
	): Promise<StoredThread> {
		this.state.calls.updateThreadMetadata += 1;
		const thread = this.storedThread(params.thread_id, false);
		const next: StoredThread = {
			...thread,
			name: params.patch.name ?? thread.name,
			updated_at: new Date().toISOString(),
		};
		if (params.patch.memory_mode === ThreadMemoryMode.Enabled) {
			next.preview = thread.preview;
		}
		this.state.threads.set(params.thread_id, next);
		return { ...next };
	}

	async archiveThread(params: ArchiveThreadParams): Promise<void> {
		this.state.calls.archiveThread += 1;
		const thread = this.storedThread(params.thread_id, false);
		this.state.threads.set(params.thread_id, {
			...thread,
			archived_at: new Date().toISOString(),
		});
	}

	async unarchiveThread(params: ArchiveThreadParams): Promise<StoredThread> {
		this.state.calls.unarchiveThread += 1;
		const thread = this.storedThread(params.thread_id, false);
		const next = { ...thread, archived_at: null };
		this.state.threads.set(params.thread_id, next);
		return next;
	}

	private history(threadId: ThreadId): RolloutItem[] {
		const history = this.state.histories.get(threadId);
		if (!history) {
			throw new Error(`Thread not found: ${threadId}`);
		}
		return history;
	}

	private storedThread(threadId: ThreadId, includeHistory: boolean): StoredThread {
		const thread = this.state.threads.get(threadId);
		if (!thread) {
			throw new Error(`Thread not found: ${threadId}`);
		}
		return {
			...thread,
			history: includeHistory
				? { items: [...this.history(threadId)], thread_id: threadId }
				: null,
		};
	}

	private touch(threadId: ThreadId): void {
		const thread = this.state.threads.get(threadId);
		if (thread) {
			this.state.threads.set(threadId, {
				...thread,
				updated_at: new Date().toISOString(),
			});
		}
	}

	private updateThreadTokenUsage(threadId: ThreadId, items: readonly RolloutItem[]): void {
		const info = lastTokenInfoFromRolloutItems(items);
		if (!info) {
			return;
		}
		const thread = this.state.threads.get(threadId);
		if (!thread) {
			return;
		}
		this.state.threads.set(threadId, {
			...thread,
			token_usage: info,
		});
	}
}

function emptyCalls(): InMemoryThreadStoreCalls {
	return {
		archiveThread: 0,
		appendItems: 0,
		createThread: 0,
		discardThread: 0,
		flushThread: 0,
		listThreads: 0,
		loadHistory: 0,
		persistThread: 0,
		readThread: 0,
		readThreadByRolloutPath: 0,
		resumeThread: 0,
		shutdownThread: 0,
		unarchiveThread: 0,
		updateThreadMetadata: 0,
	};
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function lastTokenInfoFromRolloutItems(items: readonly RolloutItem[]): unknown | null {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		const item = items[index];
		if (
			item?.type === "event_msg" &&
			item.payload.type === "token_count" &&
			item.payload.info
		) {
			return item.payload.info;
		}
	}
	return null;
}
