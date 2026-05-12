import {
	BaseInstructions,
	LiveThread,
	ThreadEventPersistenceMode,
	ThreadMemoryMode,
	asThreadId,
	type CreateThreadParams,
	type DynamicToolSpec,
	type Submission,
	type ThreadId,
	type ThreadStore,
} from "../../../core/src";
import {
	SortDirection as StoreSortDirection,
	ThreadSortKey as StoreThreadSortKey,
} from "../../../core/src/thread-store/types";
import {
	buildThreadResumeResponseFromHistory,
	threadHistoryToAppServerThread,
} from "../../../app-server-protocol/src/protocol/thread-resume";
import {
	thread_token_usage_updated_notification_from_rollout_items,
} from "./token_usage_replay";
import type {
	ThreadArchiveParams,
	ThreadArchiveResponse,
	ThreadCompactStartParams,
	ThreadCompactStartResponse,
	ThreadListParams,
	ThreadListResponse,
	ThreadMetadataUpdateParams,
	ThreadMetadataUpdateResponse,
	ThreadReadParams,
	ThreadReadResponse,
	ThreadResumeParams,
	ThreadResumeResponse,
	ThreadSetNameParams,
	ThreadSetNameResponse,
	ThreadStartParams,
	ThreadStartResponse,
	ThreadUnarchiveParams,
	ThreadUnarchiveResponse,
} from "../../../app-server-protocol/schema/typescript/v2";
import type { StoredThread, StoredThreadHistory } from "../../../core/src/thread-store/types";
import type { CodexSessionTaskRunner } from "../session_task_runner";
import {
	defaultId,
	jsonRpcError,
	threadIdFromStartParams,
	type ProcessorCreateSession,
	type ProcessorEmit,
	type RuntimeSession,
} from "./common";

const THREAD_LIST_DEFAULT_LIMIT = 25;
const THREAD_LIST_MAX_LIMIT = 100;

export type ThreadRequestProcessorOptions<Context> = {
	buildCreateThreadParams?: (input: {
		context?: Context;
		params: ThreadStartParams;
		threadId: ThreadId;
	}) => CreateThreadParams | Promise<CreateThreadParams>;
	createSession: ProcessorCreateSession<Context>;
	emit: ProcessorEmit<Context>;
	resolveDynamicTools?: (input: {
		context?: Context;
		params: ThreadStartParams;
		threadId: ThreadId;
	}) => DynamicToolSpec[] | Promise<DynamicToolSpec[]>;
	sessions: Map<ThreadId, RuntimeSession>;
	store: ThreadStore;
	taskRunner: CodexSessionTaskRunner<Context>;
};

export class ThreadRequestProcessor<Context> {
	constructor(private readonly options: ThreadRequestProcessorOptions<Context>) {}

	async threadStart(
		params: ThreadStartParams,
		context?: Context,
	): Promise<ThreadStartResponse> {
		const liveThread = await this.ensureLiveThread(params, context);
		const response = await this.readThreadResponse(liveThread.threadId);
		await this.options.emit(
			liveThread.threadId,
			{
				type: "server_notification",
				notification: {
					method: "thread/started",
					params: { thread: response.thread },
				},
			},
			context,
		);
		return response;
	}

	async threadResume(
		params: ThreadResumeParams,
		context?: Context,
	): Promise<ThreadResumeResponse> {
		const threadId = asThreadId(params.threadId);
		const { history, response } = await this.readThreadResponseWithHistory(threadId);
		const replay = thread_token_usage_updated_notification_from_rollout_items({
			rolloutItems: history.items,
			thread: response.thread,
			threadId,
		});
		if (replay) {
			await this.options.emit(threadId, {
				notification: replay,
				type: "server_notification",
			}, context);
		}
		return response;
	}

	async threadCompactStart(
		params: ThreadCompactStartParams,
		context?: Context,
	): Promise<ThreadCompactStartResponse> {
		const threadId = asThreadId(params.threadId);
		let runtimeSession = this.options.sessions.get(threadId);
		if (runtimeSession?.session.activeTurn) {
			throw jsonRpcError("Wait for the active turn to finish before compacting.", -32014, 409);
		}
		const submission: Submission = {
			id: `compact-${defaultId()}`,
			op: { type: "compact" },
		};
		if (!runtimeSession) {
			const session = await this.options.createSession(threadId, params, context, submission);
			runtimeSession = {
				abortController: null,
				runPromise: null,
				session,
			};
			this.options.sessions.set(threadId, runtimeSession);
		}
		await this.options.taskRunner.startCompactTask({
			context,
			params,
			runtimeSession,
			submission,
			threadId,
		});
		return {};
	}

	async threadList(params: ThreadListParams): Promise<ThreadListResponse> {
		const pageSize = Math.max(
			1,
			Math.min(params.limit ?? THREAD_LIST_DEFAULT_LIMIT, THREAD_LIST_MAX_LIMIT),
		);
		const page = await this.options.store.listThreads({
			allowed_sources: params.sourceKinds?.length ? params.sourceKinds : [],
			archived: params.archived ?? false,
			cursor: params.cursor ?? null,
			cwd_filters: cwdFilters(params.cwd),
			model_providers: params.modelProviders ?? null,
			page_size: pageSize,
			search_term: params.searchTerm ?? null,
			sort_direction:
				params.sortDirection === "asc"
					? StoreSortDirection.Asc
					: StoreSortDirection.Desc,
			sort_key:
				params.sortKey === "updated_at"
					? StoreThreadSortKey.UpdatedAt
					: StoreThreadSortKey.CreatedAt,
			use_state_db_only: params.useStateDbOnly ?? false,
		});
		return {
			backwardsCursor: null,
			data: page.items.map((thread) =>
				threadHistoryToAppServerThread({
					history: { items: [], thread_id: thread.thread_id },
					thread,
				}),
			),
			nextCursor: page.next_cursor ?? null,
		};
	}

	async threadRead(params: ThreadReadParams): Promise<ThreadReadResponse> {
		const threadId = asThreadId(params.threadId);
		const storedThread = await this.options.store.readThread({
			thread_id: threadId,
			include_archived: true,
			include_history: params.includeTurns,
		});
		const history = params.includeTurns
			? storedThread.history ??
				(await this.options.store.loadHistory({
					thread_id: threadId,
					include_archived: true,
				}))
			: { items: [], thread_id: threadId };
		return {
			thread: threadHistoryToAppServerThread({
				history,
				thread: storedThread,
			}),
		};
	}

	async threadNameSet(
		params: ThreadSetNameParams,
		context?: Context,
	): Promise<ThreadSetNameResponse> {
		const threadId = asThreadId(params.threadId);
		const name = normalizeThreadName(params.name);
		if (!name) {
			jsonRpcError("thread name must not be empty", -32600, 400);
		}
		await this.options.store.updateThreadMetadata({
			thread_id: threadId,
			include_archived: false,
			patch: { name },
		});
		await this.options.emit(
			threadId,
			{
				type: "server_notification",
				notification: {
					method: "thread/name/updated",
					params: { threadId, threadName: name },
				},
			},
			context,
		);
		return {};
	}

	async threadArchive(
		params: ThreadArchiveParams,
		context?: Context,
	): Promise<ThreadArchiveResponse> {
		const threadId = asThreadId(params.threadId);
		await this.options.store.archiveThread({ thread_id: threadId });
		await this.options.emit(
			threadId,
			{
				type: "server_notification",
				notification: {
					method: "thread/archived",
					params: { threadId },
				},
			},
			context,
		);
		return {};
	}

	async threadUnarchive(
		params: ThreadUnarchiveParams,
		context?: Context,
	): Promise<ThreadUnarchiveResponse> {
		const threadId = asThreadId(params.threadId);
		const storedThread = await this.options.store.unarchiveThread({
			thread_id: threadId,
		});
		await this.options.emit(
			threadId,
			{
				type: "server_notification",
				notification: {
					method: "thread/unarchived",
					params: { threadId },
				},
			},
			context,
		);
		return {
			thread: threadHistoryToAppServerThread({
				history: { items: [], thread_id: threadId },
				thread: storedThread,
			}),
		};
	}

	async threadMetadataUpdate(
		params: ThreadMetadataUpdateParams,
	): Promise<ThreadMetadataUpdateResponse> {
		const threadId = asThreadId(params.threadId);
		if (
			!params.gitInfo ||
			(params.gitInfo.sha === undefined &&
				params.gitInfo.branch === undefined &&
				params.gitInfo.originUrl === undefined)
		) {
			jsonRpcError("gitInfo must include at least one field", -32600, 400);
		}
		const storedThread = await this.options.store.updateThreadMetadata({
			thread_id: threadId,
			include_archived: true,
			patch: {
				git_info: {
					branch: normalizeOptionalGitField(params.gitInfo.branch, "gitInfo.branch"),
					origin_url: normalizeOptionalGitField(
						params.gitInfo.originUrl,
						"gitInfo.originUrl",
					),
					sha: normalizeOptionalGitField(params.gitInfo.sha, "gitInfo.sha"),
				},
			},
		});
		return {
			thread: threadHistoryToAppServerThread({
				history: { items: [], thread_id: threadId },
				thread: storedThread,
			}),
		};
	}

	private async readThreadResponse(
		threadId: ThreadId,
	): Promise<ThreadStartResponse> {
		return (await this.readThreadResponseWithHistory(threadId)).response;
	}

	private async readThreadResponseWithHistory(
		threadId: ThreadId,
	): Promise<{
		history: StoredThreadHistory;
		response: ThreadStartResponse;
		thread: StoredThread;
	}> {
		const thread = await this.options.store.readThread({
			thread_id: threadId,
			include_archived: false,
			include_history: false,
		});
		const history = await this.options.store.loadHistory({
			thread_id: threadId,
			include_archived: false,
		});
		return {
			history,
			response: buildThreadResumeResponseFromHistory({ history, thread }),
			thread,
		};
	}

	private async createThreadParams(
		params: ThreadStartParams,
		context?: Context,
	): Promise<CreateThreadParams> {
		const threadId = threadIdFromStartParams(params);
		if (this.options.buildCreateThreadParams) {
			return this.options.buildCreateThreadParams({ context, params, threadId });
		}
		const dynamicTools =
			(await this.options.resolveDynamicTools?.({ context, params, threadId })) ?? [];
		return {
			base_instructions: {
				text: params.baseInstructions ?? BaseInstructions.default().text,
			},
			dynamic_tools: dynamicTools,
			event_persistence_mode: ThreadEventPersistenceMode.Limited,
			metadata: {
				cwd: params.cwd ?? "/",
				memory_mode: ThreadMemoryMode.Disabled,
				model: params.model ?? "gpt-5.5",
				model_provider: params.modelProvider ?? "openai",
			},
			source: "appServer",
			thread_id: threadId,
			thread_source:
				typeof params.threadSource === "string" ? params.threadSource : null,
		};
	}

	private async ensureLiveThread(
		params: ThreadStartParams,
		context?: Context,
	): Promise<LiveThread> {
		const createParams = await this.createThreadParams(params, context);
		validateDynamicToolSpecs(createParams.dynamic_tools);
		try {
			await this.options.store.readThread({
				thread_id: createParams.thread_id,
				include_archived: false,
				include_history: false,
			});
			return LiveThread.resume(this.options.store, {
				thread_id: createParams.thread_id,
				include_archived: false,
				metadata: createParams.metadata,
				event_persistence_mode: createParams.event_persistence_mode,
			});
		} catch {
			return LiveThread.create(this.options.store, createParams);
		}
	}
}

function validateDynamicToolSpecs(tools: readonly DynamicToolSpec[]): void {
	for (const tool of tools) {
		if (tool.defer_loading && !tool.namespace) {
			jsonRpcError(
				`Dynamic tool ${tool.name} uses defer_loading and must include a namespace.`,
				-32600,
				400,
			);
		}
		const invalidName = invalidResponsesApiToolName(tool.name)
			? tool.name
			: tool.namespace && invalidResponsesApiToolName(tool.namespace)
				? tool.namespace
				: null;
		if (invalidName) {
			jsonRpcError(
				`Dynamic tool ${invalidName} is not supported by the Responses API. Tool names and namespaces may only contain letters, numbers, underscores, and hyphens.`,
				-32600,
				400,
			);
		}
	}
}

function invalidResponsesApiToolName(value: string): boolean {
	return !/^[A-Za-z0-9_-]+$/.test(value);
}

function cwdFilters(value: ThreadListParams["cwd"]): string[] | null {
	if (typeof value === "string") {
		return [value];
	}
	if (Array.isArray(value)) {
		return value;
	}
	return null;
}

function normalizeThreadName(value: string): string | null {
	const name = value.trim().replace(/\s+/gu, " ");
	return name ? name : null;
}

function normalizeOptionalGitField(
	value: string | null | undefined,
	field: string,
): string | null | undefined {
	if (value === undefined || value === null) {
		return value;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		jsonRpcError(`${field} must not be empty`, -32600, 400);
	}
	return trimmed;
}
