import {
	ThreadMemoryMode,
	type AppendThreadItemsParams,
	type ArchiveThreadParams,
	type CreateThreadParams,
	type ListThreadsParams,
	type LoadThreadHistoryParams,
	type ReadThreadByRolloutPathParams,
	type ReadThreadParams,
	type ResumeThreadParams,
	type RolloutItem,
	type StoredThread,
	type StoredThreadHistory,
	type ThreadId,
	type ThreadPage,
	type ThreadStore,
	type UpdateThreadMetadataParams,
} from "@jrkropp/codex-js/server";

type SqlStorage = DurableObjectStorage["sql"];

type ThreadRow = {
	history_json: string;
	thread_id: string;
	thread_json: string;
};

export class DurableObjectThreadStore implements ThreadStore {
	constructor(private readonly sql: SqlStorage) {}

	createSchema(): void {
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS threads (
				thread_id TEXT PRIMARY KEY,
				thread_json TEXT NOT NULL,
				history_json TEXT NOT NULL
			)
		`);
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS rollout_paths (
				rollout_path TEXT PRIMARY KEY,
				thread_id TEXT NOT NULL
			)
		`);
	}

	async createThread(params: CreateThreadParams): Promise<void> {
		const now = new Date().toISOString();
		const thread: StoredThread = {
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
		};
		this.writeThread(thread, []);
	}

	async resumeThread(params: ResumeThreadParams): Promise<void> {
		const existing = this.readThreadRow(params.thread_id);
		if (!existing) {
			const now = new Date().toISOString();
			this.writeThread(
				{
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
				},
				params.history ?? [],
			);
		} else if (params.history) {
			const thread = parseThread(existing.thread_json);
			this.writeThread(
				{
					...thread,
					token_usage: lastTokenInfoFromRolloutItems(params.history),
					updated_at: new Date().toISOString(),
				},
				params.history,
			);
		}
		if (params.rollout_path) {
			this.sql.exec(
				"INSERT OR REPLACE INTO rollout_paths (rollout_path, thread_id) VALUES (?, ?)",
				params.rollout_path,
				params.thread_id,
			);
		}
	}

	async appendItems(params: AppendThreadItemsParams): Promise<void> {
		const row = this.requireThreadRow(params.thread_id);
		const thread = parseThread(row.thread_json);
		const history = parseHistory(row.history_json);
		history.push(...params.items);
		this.writeThread(
			{
				...thread,
				preview:
					thread.preview || firstUserPreview(params.items) || thread.preview,
				token_usage:
					lastTokenInfoFromRolloutItems(params.items) ?? thread.token_usage,
				updated_at: new Date().toISOString(),
			},
			history,
		);
	}

	async persistThread(threadId: ThreadId): Promise<void> {
		void threadId;
	}

	async flushThread(threadId: ThreadId): Promise<void> {
		void threadId;
	}

	async shutdownThread(threadId: ThreadId): Promise<void> {
		void threadId;
	}

	async discardThread(threadId: ThreadId): Promise<void> {
		void threadId;
	}

	async loadHistory(
		params: LoadThreadHistoryParams,
	): Promise<StoredThreadHistory> {
		const row = this.requireReadableThreadRow(
			params.thread_id,
			params.include_archived,
		);
		return {
			items: parseHistory(row.history_json),
			thread_id: params.thread_id,
		};
	}

	async readThread(params: ReadThreadParams): Promise<StoredThread> {
		return this.storedThread(
			params.thread_id,
			params.include_archived,
			params.include_history,
		);
	}

	async readThreadByRolloutPath(
		params: ReadThreadByRolloutPathParams,
	): Promise<StoredThread> {
		const row = this.sql
			.exec<{
				thread_id: string;
			}>("SELECT thread_id FROM rollout_paths WHERE rollout_path = ?", params.rollout_path)
			.one();
		if (!row) {
			throw new Error(`Unknown rollout path: ${params.rollout_path}`);
		}
		return this.storedThread(
			row.thread_id as ThreadId,
			params.include_archived,
			params.include_history,
		);
	}

	async listThreads(params: ListThreadsParams): Promise<ThreadPage> {
		const rows = this.sql
			.exec<ThreadRow>(
				"SELECT thread_id, thread_json, history_json FROM threads",
			)
			.toArray();
		const items = rows
			.map((row) => parseThread(row.thread_json))
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
		const row = this.requireReadableThreadRow(
			params.thread_id,
			params.include_archived,
		);
		const thread = parseThread(row.thread_json);
		const history = parseHistory(row.history_json);
		const next: StoredThread = {
			...thread,
			git_info: params.patch.git_info ?? thread.git_info,
			name: params.patch.name ?? thread.name,
			updated_at: new Date().toISOString(),
		};
		if (params.patch.memory_mode === ThreadMemoryMode.Enabled) {
			next.preview = thread.preview;
		}
		this.writeThread(next, history);
		return { ...next };
	}

	async archiveThread(params: ArchiveThreadParams): Promise<void> {
		const row = this.requireThreadRow(params.thread_id);
		const thread = parseThread(row.thread_json);
		this.writeThread(
			{ ...thread, archived_at: new Date().toISOString() },
			parseHistory(row.history_json),
		);
	}

	async unarchiveThread(params: ArchiveThreadParams): Promise<StoredThread> {
		const row = this.requireThreadRow(params.thread_id);
		const thread = parseThread(row.thread_json);
		const next = { ...thread, archived_at: null };
		this.writeThread(next, parseHistory(row.history_json));
		return next;
	}

	private storedThread(
		threadId: ThreadId,
		includeArchived: boolean,
		includeHistory: boolean,
	): StoredThread {
		const row = this.requireReadableThreadRow(threadId, includeArchived);
		const thread = parseThread(row.thread_json);
		return {
			...thread,
			history: includeHistory
				? { items: parseHistory(row.history_json), thread_id: threadId }
				: null,
		};
	}

	private readThreadRow(threadId: ThreadId): ThreadRow | null {
		const rows = this.sql
			.exec<ThreadRow>(
				"SELECT thread_id, thread_json, history_json FROM threads WHERE thread_id = ?",
				threadId,
			)
			.toArray();
		return rows[0] ?? null;
	}

	private requireThreadRow(threadId: ThreadId): ThreadRow {
		const row = this.readThreadRow(threadId);
		if (!row) {
			throw new Error(`Thread not found: ${threadId}`);
		}
		return row;
	}

	private requireReadableThreadRow(
		threadId: ThreadId,
		includeArchived: boolean,
	): ThreadRow {
		const row = this.requireThreadRow(threadId);
		const thread = parseThread(row.thread_json);
		if (thread.archived_at && !includeArchived) {
			throw new Error(`Thread is archived: ${threadId}`);
		}
		return row;
	}

	private writeThread(thread: StoredThread, history: RolloutItem[]): void {
		this.sql.exec(
			"INSERT OR REPLACE INTO threads (thread_id, thread_json, history_json) VALUES (?, ?, ?)",
			thread.thread_id,
			JSON.stringify({ ...thread, history: null }),
			JSON.stringify(history),
		);
	}
}

function parseThread(value: string): StoredThread {
	return JSON.parse(value) as StoredThread;
}

function parseHistory(value: string): RolloutItem[] {
	return JSON.parse(value) as RolloutItem[];
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function lastTokenInfoFromRolloutItems(
	items: readonly RolloutItem[],
): unknown | null {
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

function firstUserPreview(items: readonly RolloutItem[]): string | null {
	for (const item of items) {
		if (item?.type !== "event_msg" || item.payload.type !== "user_message") {
			continue;
		}
		const text = item.payload.message.trim();
		if (text) {
			return text.slice(0, 160);
		}
	}
	return null;
}
