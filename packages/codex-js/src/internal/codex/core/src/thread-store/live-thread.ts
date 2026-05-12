import type { ThreadId } from "../ids";
import type { ThreadMemoryMode } from "../memory";
import type { RolloutItem } from "../protocol";
import type {
	CreateThreadParams,
	ReadThreadParams,
	ResumeThreadParams,
	StoredThread,
	StoredThreadHistory,
	ThreadMetadataPatch,
	UpdateThreadMetadataParams,
} from "./types";
import type { ThreadStore } from "./store";

export class LiveThread {
	private constructor(
		readonly threadId: ThreadId,
		private readonly threadStore: ThreadStore,
	) {}

	static async create(
		threadStore: ThreadStore,
		params: CreateThreadParams,
	): Promise<LiveThread> {
		await threadStore.createThread(params);
		return new LiveThread(params.thread_id, threadStore);
	}

	static async resume(
		threadStore: ThreadStore,
		params: ResumeThreadParams,
	): Promise<LiveThread> {
		await threadStore.resumeThread(params);
		return new LiveThread(params.thread_id, threadStore);
	}

	async appendItems(items: RolloutItem[]): Promise<void> {
		await this.threadStore.appendItems({
			thread_id: this.threadId,
			items,
		});
	}

	async persist(): Promise<void> {
		await this.threadStore.persistThread(this.threadId);
	}

	async flush(): Promise<void> {
		await this.threadStore.flushThread(this.threadId);
	}

	async shutdown(): Promise<void> {
		await this.threadStore.shutdownThread(this.threadId);
	}

	async discard(): Promise<void> {
		await this.threadStore.discardThread(this.threadId);
	}

	async loadHistory(includeArchived: boolean): Promise<StoredThreadHistory> {
		return this.threadStore.loadHistory({
			thread_id: this.threadId,
			include_archived: includeArchived,
		});
	}

	async readThread(
		includeArchived: boolean,
		includeHistory: boolean,
	): Promise<StoredThread> {
		const params: ReadThreadParams = {
			thread_id: this.threadId,
			include_archived: includeArchived,
			include_history: includeHistory,
		};
		return this.threadStore.readThread(params);
	}

	async updateMemoryMode(
		mode: ThreadMemoryMode,
		includeArchived: boolean,
	): Promise<void> {
		const params: UpdateThreadMetadataParams = {
			thread_id: this.threadId,
			patch: {
				memory_mode: mode,
			},
			include_archived: includeArchived,
		};
		await this.threadStore.updateThreadMetadata(params);
	}

	async updateMetadata(
		patch: ThreadMetadataPatch,
		includeArchived: boolean,
	): Promise<StoredThread> {
		return this.threadStore.updateThreadMetadata({
			thread_id: this.threadId,
			patch,
			include_archived: includeArchived,
		});
	}

	async localRolloutPath(): Promise<string | null> {
		return null;
	}
}

export class LiveThreadInitGuard {
	private liveThread: LiveThread | null;

	constructor(liveThread?: LiveThread | null) {
		this.liveThread = liveThread ?? null;
	}

	asRef(): LiveThread | null {
		return this.liveThread;
	}

	commit(): void {
		this.liveThread = null;
	}

	async discard(): Promise<void> {
		const liveThread = this.liveThread;
		if (!liveThread) {
			return;
		}

		this.liveThread = null;
		try {
			await liveThread.discard();
		} catch {
			// Match Codex's initialization guard: discard failures are reported there,
			// but they do not re-own the live thread or fail guard cleanup.
		}
	}
}
