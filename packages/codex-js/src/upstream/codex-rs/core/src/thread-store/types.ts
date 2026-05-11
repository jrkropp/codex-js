import type { BaseInstructions, DynamicToolSpec, RolloutItem } from "../protocol";
import type { ThreadId } from "../ids";
import type { ThreadMemoryMode } from "../memory";

export const ThreadEventPersistenceMode = {
	Limited: "Limited",
	Extended: "Extended",
} as const;

export type ThreadEventPersistenceMode =
	(typeof ThreadEventPersistenceMode)[keyof typeof ThreadEventPersistenceMode];

export const ThreadSortKey = {
	CreatedAt: "CreatedAt",
	UpdatedAt: "UpdatedAt",
} as const;

export type ThreadSortKey = (typeof ThreadSortKey)[keyof typeof ThreadSortKey];

export const SortDirection = {
	Asc: "Asc",
	Desc: "Desc",
} as const;

export type SortDirection = (typeof SortDirection)[keyof typeof SortDirection];

export type ThreadPersistenceMetadata = {
	cwd?: string | null;
	model_provider: string;
	memory_mode: ThreadMemoryMode;
	[key: string]: unknown;
};

export type CreateThreadParams = {
	thread_id: ThreadId;
	forked_from_id?: ThreadId | null;
	source: string;
	thread_source?: string | null;
	base_instructions: BaseInstructions;
	dynamic_tools: DynamicToolSpec[];
	metadata: ThreadPersistenceMetadata;
	event_persistence_mode: ThreadEventPersistenceMode;
};

export type ResumeThreadParams = {
	thread_id: ThreadId;
	rollout_path?: string | null;
	history?: RolloutItem[] | null;
	include_archived: boolean;
	metadata: ThreadPersistenceMetadata;
	event_persistence_mode: ThreadEventPersistenceMode;
};

export type AppendThreadItemsParams = {
	thread_id: ThreadId;
	items: RolloutItem[];
};

export type LoadThreadHistoryParams = {
	thread_id: ThreadId;
	include_archived: boolean;
};

export type StoredThreadHistory = {
	thread_id: ThreadId;
	items: RolloutItem[];
};

export type ReadThreadParams = {
	thread_id: ThreadId;
	include_archived: boolean;
	include_history: boolean;
};

export type ReadThreadByRolloutPathParams = {
	rollout_path: string;
	include_archived: boolean;
	include_history: boolean;
};

export type ListThreadsParams = {
	page_size: number;
	cursor?: string | null;
	sort_key: ThreadSortKey;
	sort_direction: SortDirection;
	allowed_sources: string[];
	model_providers?: string[] | null;
	cwd_filters?: string[] | null;
	archived: boolean;
	search_term?: string | null;
	use_state_db_only: boolean;
};

export type ThreadPage = {
	items: StoredThread[];
	next_cursor?: string | null;
};

export type StoredThread = {
	thread_id: ThreadId;
	rollout_path?: string | null;
	forked_from_id?: ThreadId | null;
	preview: string;
	name?: string | null;
	model_provider: string;
	model?: string | null;
	reasoning_effort?: string | null;
	created_at: string;
	updated_at: string;
	archived_at?: string | null;
	cwd: string;
	cli_version?: string;
	source: string;
	thread_source?: string | null;
	agent_nickname?: string | null;
	agent_role?: string | null;
	agent_path?: string | null;
	git_info?: unknown;
	approval_mode?: string;
	sandbox_policy?: unknown;
	token_usage?: unknown;
	first_user_message?: string | null;
	history?: StoredThreadHistory | null;
};

export type OptionalStringPatch = string | null | undefined;

export type GitInfoPatch = {
	sha?: OptionalStringPatch;
	branch?: OptionalStringPatch;
	origin_url?: OptionalStringPatch;
};

export type ThreadMetadataPatch = {
	name?: string;
	memory_mode?: ThreadMemoryMode;
	git_info?: GitInfoPatch;
};

export type UpdateThreadMetadataParams = {
	thread_id: ThreadId;
	patch: ThreadMetadataPatch;
	include_archived: boolean;
};

export type ArchiveThreadParams = {
	thread_id: ThreadId;
};
