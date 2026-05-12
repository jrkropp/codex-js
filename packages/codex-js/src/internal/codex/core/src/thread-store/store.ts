import type { ThreadId } from "../ids";
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
} from "./types";

export interface ThreadStore {
	createThread(params: CreateThreadParams): Promise<void>;
	resumeThread(params: ResumeThreadParams): Promise<void>;
	appendItems(params: AppendThreadItemsParams): Promise<void>;
	persistThread(threadId: ThreadId): Promise<void>;
	flushThread(threadId: ThreadId): Promise<void>;
	shutdownThread(threadId: ThreadId): Promise<void>;
	discardThread(threadId: ThreadId): Promise<void>;
	loadHistory(params: LoadThreadHistoryParams): Promise<StoredThreadHistory>;
	readThread(params: ReadThreadParams): Promise<StoredThread>;
	readThreadByRolloutPath?(
		params: ReadThreadByRolloutPathParams,
	): Promise<StoredThread>;
	listThreads(params: ListThreadsParams): Promise<ThreadPage>;
	updateThreadMetadata(params: UpdateThreadMetadataParams): Promise<StoredThread>;
	archiveThread(params: ArchiveThreadParams): Promise<void>;
	unarchiveThread(params: ArchiveThreadParams): Promise<StoredThread>;
}
