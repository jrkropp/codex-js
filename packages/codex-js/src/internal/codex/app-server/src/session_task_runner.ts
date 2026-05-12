import {
	CompactTask,
	RegularTask,
	type Session,
	type Submission,
	type ThreadId,
	type ThreadStore,
	type TurnContext,
	type UserInput,
} from "../../core/src";
import type { ModelClient } from "../../core/src";
import type {
	ThreadCompactStartParams,
	TurnStartParams,
} from "../../app-server-protocol/schema/typescript/v2";
import { run_compact_task } from "../../core/src/compact-task-runner";
import { runTurn } from "../../core/src/session/turn";
import type { RuntimeSession } from "./request_processors/common";

export type CodexSessionTaskRunnerCreateModelClientInput<Context> = {
	context?: Context;
	session: Session;
	threadId: ThreadId;
};

export type CodexSessionTaskRunnerOptions<Context> = {
	createModelClient: (
		input: CodexSessionTaskRunnerCreateModelClientInput<Context>,
	) => ModelClient | Promise<ModelClient>;
	modelClientCacheKey?: (
		input: CodexSessionTaskRunnerCreateModelClientInput<Context>,
	) => string | null | undefined;
	onRuntimeError?: (error: unknown, context: { context?: Context; threadId?: ThreadId }) => void;
	runInBackground?: (
		promise: Promise<unknown>,
		context: { context?: Context; threadId: ThreadId },
	) => void;
	store: ThreadStore;
};

export class CodexSessionTaskRunner<Context> {
	private readonly modelClients = new Map<string, ModelClient>();

	constructor(private readonly options: CodexSessionTaskRunnerOptions<Context>) {}

	async startRegularTask(input: {
		context?: Context;
		items: UserInput[];
		params: TurnStartParams;
		runtimeSession: RuntimeSession;
		submission: Submission;
		threadId: ThreadId;
	}): Promise<TurnContext> {
		const turn = await input.runtimeSession.session.startTurn(input.submission);
		const history = await this.options.store.loadHistory({
			thread_id: input.threadId,
			include_archived: false,
		});
		const abortController = new AbortController();
		const modelClient = await this.modelClient({
			context: input.context,
			session: input.runtimeSession.session,
			threadId: input.threadId,
		});
		const task = RegularTask.new({
			history: history.items,
			submission: input.submission,
			run_turn: async (taskInput) => {
				const result = await runTurn({
					history: taskInput.history,
					modelClient,
					session: taskInput.session,
					signal: taskInput.signal,
					submission: taskInput.submission,
					turn: taskInput.turn,
				});
				return {
					last_agent_message: result.lastAgentMessage,
					steps: result.steps,
				};
			},
		});

		this.spawnTask({
			abortController,
			context: input.context,
			input: input.items,
			runtimeSession: input.runtimeSession,
			task,
			threadId: input.threadId,
			turn,
		});
		return turn;
	}

	async startCompactTask(input: {
		context?: Context;
		params: ThreadCompactStartParams;
		runtimeSession: RuntimeSession;
		submission: Submission;
		threadId: ThreadId;
	}): Promise<TurnContext> {
		const history = await this.options.store.loadHistory({
			thread_id: input.threadId,
			include_archived: false,
		});
		const abortController = new AbortController();
		const turn = await input.runtimeSession.session.startCompactTurn(input.submission);
		const modelClient = await this.modelClient({
			context: input.context,
			session: input.runtimeSession.session,
			threadId: input.threadId,
		});
		const task = new CompactTask({
			history: history.items,
			submission: input.submission,
			run_compact_task: async (taskInput) => {
				const result = await run_compact_task({
					modelClient,
					session: taskInput.session,
					history: taskInput.history,
					submission: taskInput.submission,
					turn: taskInput.turn,
					signal: taskInput.signal,
					completeTurn: false,
				});
				return {
					last_agent_message: null,
					steps: 1,
					message: result.summary,
				};
			},
		});

		this.spawnTask({
			abortController,
			context: input.context,
			input: [],
			runtimeSession: input.runtimeSession,
			task,
			threadId: input.threadId,
			turn,
		});
		return turn;
	}

	private spawnTask(input: {
		abortController: AbortController;
		context?: Context;
		input: UserInput[];
		runtimeSession: RuntimeSession;
		task: CompactTask | RegularTask;
		threadId: ThreadId;
		turn: TurnContext;
	}): void {
		input.runtimeSession.abortController = input.abortController;
		input.runtimeSession.runPromise = input.runtimeSession.session
			.spawn_task({
				abortController: input.abortController,
				input: input.input,
				task: input.task,
				turnContext: input.turn,
			})
			.catch((error) => {
				this.options.onRuntimeError?.(error, {
					context: input.context,
					threadId: input.threadId,
				});
			})
			.finally(() => {
				input.runtimeSession.abortController = null;
				input.runtimeSession.runPromise = null;
			});
		this.options.runInBackground?.(input.runtimeSession.runPromise, {
			context: input.context,
			threadId: input.threadId,
		});
	}

	private async modelClient(
		input: CodexSessionTaskRunnerCreateModelClientInput<Context>,
	): Promise<ModelClient> {
		const cacheKey = this.options.modelClientCacheKey?.(input) ?? String(input.threadId);
		const existing = this.modelClients.get(cacheKey);
		if (existing) {
			return existing;
		}
		const created = await this.options.createModelClient(input);
		this.modelClients.set(cacheKey, created);
		return created;
	}
}
