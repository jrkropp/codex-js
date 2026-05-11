import {
	BaseInstructions,
	LiveThread,
	Session,
	ThreadEventPersistenceMode,
	ThreadMemoryMode,
	defaultSessionConfiguration,
	type Event,
	type McpConnectionManager,
	type SessionConfiguration,
	type Submission,
	type ThreadId,
	type ThreadStore,
} from "../../core/src";
import type {
	ThreadCompactStartParams,
	ThreadResumeParams,
	ThreadStartParams,
	TurnStartParams,
} from "../../app-server-protocol/schema/typescript/v2";
import {
	approvalPolicyString,
	valueOrNull,
} from "./request_processors/common";

export type CodexSessionRequestParams =
	| ThreadStartParams
	| ThreadResumeParams
	| TurnStartParams
	| ThreadCompactStartParams;

export type CodexSessionFactoryOptions<Context = unknown> = {
	buildSessionConfiguration?: (input: {
		context?: Context;
		params: CodexSessionRequestParams;
		thread: Awaited<ReturnType<ThreadStore["readThread"]>>;
	}) => Partial<SessionConfiguration> | Promise<Partial<SessionConfiguration>>;
	createSession?: (input: {
		context?: Context;
		eventSink: (event: Event) => void;
		params: CodexSessionRequestParams;
		submission?: Submission;
		threadId: ThreadId;
	}) => Session | Promise<Session>;
	emitCoreEvent: (threadId: ThreadId, event: Event, context?: Context) => void;
	mcpConnectionManager?: McpConnectionManager | null;
	store: ThreadStore;
};

export class CodexSessionFactory<Context = unknown> {
	constructor(private readonly options: CodexSessionFactoryOptions<Context>) {}

	createSession = async (input: {
		context?: Context;
		params: CodexSessionRequestParams;
		submission?: Submission;
		threadId: ThreadId;
	}): Promise<Session> => {
		const eventSink = (event: Event) =>
			this.options.emitCoreEvent(input.threadId, event, input.context);
		if (this.options.createSession) {
			return this.options.createSession({ ...input, eventSink });
		}
		const thread = await this.options.store.readThread({
			thread_id: input.threadId,
			include_archived: false,
			include_history: false,
		});
		const history = await this.options.store.loadHistory({
			thread_id: input.threadId,
			include_archived: false,
		});
		const overrides = await this.options.buildSessionConfiguration?.({
			context: input.context,
			params: input.params,
			thread,
		});
		const configuration = defaultSessionConfiguration({
			approval_policy:
				"approvalPolicy" in input.params
					? approvalPolicyString(input.params.approvalPolicy) ?? "never"
					: "never",
			approvals_reviewer:
				"approvalsReviewer" in input.params
					? valueOrNull(input.params.approvalsReviewer) ?? "user"
					: "user",
			base_instructions: { text: "" },
			cwd:
				"cwd" in input.params
					? valueOrNull(input.params.cwd) ?? thread.cwd
					: thread.cwd,
			developer_instructions:
				"developerInstructions" in input.params
					? (input.params.developerInstructions ?? null)
					: null,
			model:
				"model" in input.params
					? valueOrNull(input.params.model) ?? thread.model ?? "gpt-5.5"
					: thread.model ?? "gpt-5.5",
			provider:
				"modelProvider" in input.params
					? (valueOrNull(input.params.modelProvider) ?? thread.model_provider)
					: thread.model_provider,
			reasoning_effort: "effort" in input.params ? input.params.effort ?? null : null,
			service_tier:
				"serviceTier" in input.params
					? valueOrNull(input.params.serviceTier) ?? null
					: null,
			session_source: "appServer",
			...(overrides ?? {}),
		});
		if (!configuration.base_instructions.text) {
			configuration.base_instructions = {
				text:
					"baseInstructions" in input.params && input.params.baseInstructions
						? input.params.baseInstructions
						: BaseInstructions.default().text,
			};
		}
		return new Session({
			threadId: input.threadId,
			configuration,
			liveThread: await LiveThread.resume(this.options.store, {
				thread_id: input.threadId,
				include_archived: false,
				metadata: {
					cwd: thread.cwd,
					memory_mode: ThreadMemoryMode.Disabled,
					model_provider: thread.model_provider,
				},
				event_persistence_mode: ThreadEventPersistenceMode.Limited,
			}),
			initialHistory: history.items,
			rolloutPath: thread.rollout_path ?? null,
			forkedFromId: thread.forked_from_id ?? null,
			threadName: thread.name ?? null,
			threadSource: thread.thread_source ?? null,
			eventSink,
			mcpConnectionManager: this.options.mcpConnectionManager,
		});
	};
}
