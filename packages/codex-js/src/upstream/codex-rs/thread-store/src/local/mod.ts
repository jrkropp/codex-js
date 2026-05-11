import type { ThreadId } from "../../../core/src/ids";
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
	ThreadPage,
	UpdateThreadMetadataParams,
} from "../../../core/src/thread-store/types";
import { InMemoryThreadStore, type InMemoryThreadStoreSnapshot } from "../in_memory";

export type LocalThreadStoreConfig = {
	codex_home: string;
	default_model_provider_id: string;
};

type LocalThreadStoreData = InMemoryThreadStoreSnapshot & {
	version: 1;
};

export class LocalThreadStore extends InMemoryThreadStore {
	constructor(readonly config: LocalThreadStoreConfig) {
		super();
	}

	stateDb(): null {
		return null;
	}

	async createThread(params: CreateThreadParams): Promise<void> {
		await this.load();
		await super.createThread(params);
		this.attachRolloutPath(params.thread_id);
		await this.save();
	}

	async resumeThread(params: ResumeThreadParams): Promise<void> {
		await this.load();
		await super.resumeThread({
			...params,
			rollout_path: params.rollout_path ?? this.rolloutPath(params.thread_id),
		});
		this.attachRolloutPath(params.thread_id, params.rollout_path ?? undefined);
		await this.save();
	}

	async appendItems(params: AppendThreadItemsParams): Promise<void> {
		await this.load();
		await super.appendItems(params);
		await this.save();
	}

	async persistThread(threadId: ThreadId): Promise<void> {
		await this.load();
		await super.persistThread(threadId);
		await this.save();
	}

	async flushThread(threadId: ThreadId): Promise<void> {
		await this.load();
		await super.flushThread(threadId);
		await this.save();
	}

	async shutdownThread(threadId: ThreadId): Promise<void> {
		await this.load();
		await super.shutdownThread(threadId);
		await this.save();
	}

	async discardThread(threadId: ThreadId): Promise<void> {
		await this.load();
		await super.discardThread(threadId);
		await this.save();
	}

	async loadHistory(params: LoadThreadHistoryParams) {
		await this.load();
		return super.loadHistory(params);
	}

	async readThread(params: ReadThreadParams): Promise<StoredThread> {
		await this.load();
		return super.readThread(params);
	}

	async readThreadByRolloutPath(
		params: ReadThreadByRolloutPathParams,
	): Promise<StoredThread> {
		await this.load();
		return super.readThreadByRolloutPath(params);
	}

	async listThreads(params: ListThreadsParams): Promise<ThreadPage> {
		await this.load();
		return super.listThreads(params);
	}

	async updateThreadMetadata(
		params: UpdateThreadMetadataParams,
	): Promise<StoredThread> {
		await this.load();
		const thread = await super.updateThreadMetadata(params);
		await this.save();
		return thread;
	}

	async archiveThread(params: ArchiveThreadParams): Promise<void> {
		await this.load();
		await super.archiveThread(params);
		await this.save();
	}

	async unarchiveThread(params: ArchiveThreadParams): Promise<StoredThread> {
		await this.load();
		const thread = await super.unarchiveThread(params);
		await this.save();
		return thread;
	}

	liveRolloutPath(threadId: ThreadId): string {
		return this.rolloutPath(threadId);
	}

	private attachRolloutPath(threadId: ThreadId, rolloutPath?: string): void {
		const snapshot = this.snapshot();
		const path = rolloutPath ?? this.rolloutPath(threadId);
		const threads = snapshot.threads.map(
			([candidateThreadId, thread]) =>
				[
					candidateThreadId,
					candidateThreadId === threadId
						? { ...thread, rollout_path: path }
						: thread,
				] satisfies [ThreadId, StoredThread],
		);
		const rolloutPaths = new Map(snapshot.rolloutPaths);
		rolloutPaths.set(path, threadId);
		this.restoreSnapshot({
			...snapshot,
			rolloutPaths: Array.from(rolloutPaths.entries()),
			threads,
		});
	}

	private async load(): Promise<void> {
		try {
			const { readFile } = await nodeFsPromises();
			const raw = await readFile(this.storePath(), "utf8");
			const data = JSON.parse(raw) as LocalThreadStoreData;
			this.restoreSnapshot(data);
		} catch (error) {
			if ((error as { code?: unknown }).code === "ENOENT") {
				return;
			}
			throw error;
		}
	}

	private async save(): Promise<void> {
		const { mkdir, writeFile } = await nodeFsPromises();
		const path = this.storePath();
		await mkdir(dirname(path), { recursive: true });
		const data: LocalThreadStoreData = {
			version: 1,
			...this.snapshot(),
		};
		await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
	}

	private rolloutPath(threadId: ThreadId): string {
		return `${this.config.codex_home.replace(/\/+$/, "")}/sessions/${threadId}.jsonl`;
	}

	private storePath(): string {
		return `${this.config.codex_home.replace(/\/+$/, "")}/thread-store/store.json`;
	}
}

type NodeFsPromises = {
	mkdir(path: string, options: { recursive: true }): Promise<unknown>;
	readFile(path: string, encoding: "utf8"): Promise<string>;
	writeFile(path: string, data: string, encoding: "utf8"): Promise<void>;
};

async function nodeFsPromises(): Promise<NodeFsPromises> {
	const moduleName = "node:fs/promises";
	return import(moduleName) as Promise<NodeFsPromises>;
}

function dirname(path: string): string {
	const normalized = path.replace(/\/+$/, "");
	const separatorIndex = normalized.lastIndexOf("/");
	return separatorIndex <= 0 ? "/" : normalized.slice(0, separatorIndex);
}
