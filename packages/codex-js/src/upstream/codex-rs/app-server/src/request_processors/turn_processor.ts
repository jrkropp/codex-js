import {
	SteerInputError,
	asThreadId,
	type Submission,
	type ThreadId,
} from "../../../core/src";
import { normalizeCollaborationMode } from "../../../core/src/collaboration-mode-presets";
import type {
	TurnInterruptParams,
	TurnInterruptResponse,
	TurnStartParams,
	TurnStartResponse,
	TurnSteerParams,
	TurnSteerResponse,
} from "../../../app-server-protocol/schema/typescript/v2";
import type { CodexSessionTaskRunner } from "../session_task_runner";
import {
	appServerUserInputToCoreUserInput,
	approvalPolicyString,
	defaultId,
	jsonRpcError,
	steerErrorCode,
	valueOrNull,
	type ProcessorCreateSession,
	type RuntimeSession,
	type TurnStartParamsWithClientMessageId,
	type TurnStartParamsWithCollaborationMode,
} from "./common";

export type TurnRequestProcessorOptions<Context> = {
	createSession: ProcessorCreateSession<Context>;
	onRuntimeError?: (error: unknown, context: { context?: Context; threadId?: ThreadId }) => void;
	sessions: Map<ThreadId, RuntimeSession>;
	taskRunner: CodexSessionTaskRunner<Context>;
};

export class TurnRequestProcessor<Context> {
	constructor(private readonly options: TurnRequestProcessorOptions<Context>) {}

	async turnStart(
		params: TurnStartParams,
		context?: Context,
	): Promise<TurnStartResponse> {
		const threadId = asThreadId(params.threadId);
		const input = params.input.map(appServerUserInputToCoreUserInput);
		const collaborationModeInput =
			(params as TurnStartParamsWithCollaborationMode).collaborationMode ??
			(params as TurnStartParamsWithCollaborationMode).collaboration_mode;
		const collaborationMode = collaborationModeInput
			? normalizeCollaborationMode({
					collaborationMode: collaborationModeInput,
					model: valueOrNull(params.model) ?? "gpt-5.5",
					reasoningEffort: valueOrNull(params.effort) ?? null,
				})
			: undefined;
		const submission: Submission = {
			id:
				(params as TurnStartParamsWithClientMessageId).clientMessageId ??
				defaultId(),
			op: {
				type: "user_input_with_turn_context",
				items: input,
				cwd: valueOrNull(params.cwd) ?? undefined,
				approval_policy: approvalPolicyString(params.approvalPolicy) ?? undefined,
				approvals_reviewer: valueOrNull(params.approvalsReviewer) ?? undefined,
				sandbox_policy: valueOrNull(params.sandboxPolicy) ?? undefined,
				model: valueOrNull(params.model) ?? undefined,
				effort: valueOrNull(params.effort) ?? undefined,
				summary: valueOrNull(params.summary) ?? undefined,
				service_tier: valueOrNull(params.serviceTier) ?? undefined,
				collaboration_mode: collaborationMode,
				personality: valueOrNull(params.personality) ?? undefined,
				final_output_json_schema: valueOrNull(params.outputSchema) ?? undefined,
			},
		};
		const runtimeSession = await this.sessionForTurn(threadId, params, submission, context);
		if (runtimeSession.session.activeTurn) {
			throw jsonRpcError("A Codex turn is already active for this thread.", -32011, 409);
		}
		const turn = await this.options.taskRunner.startRegularTask({
			context,
			items: input,
			params,
			runtimeSession,
			submission,
			threadId,
		});
		return {
			turn: {
				id: turn.sub_id,
				items: [],
				itemsView: "notLoaded",
				status: "inProgress",
				error: null,
				startedAt: Math.floor(Date.now() / 1000),
				completedAt: null,
				durationMs: null,
			},
		};
	}

	async turnSteer(
		params: TurnSteerParams,
		context?: Context,
	): Promise<TurnSteerResponse> {
		const threadId = asThreadId(params.threadId);
		const runtimeSession = this.options.sessions.get(threadId);
		if (!runtimeSession) {
			throw jsonRpcError("No active Codex turn is available for steering.", -32012, 409);
		}
		try {
			const turnId = await runtimeSession.session.steer_input(
				params.input.map(appServerUserInputToCoreUserInput),
				params.expectedTurnId,
			);
			return { turnId };
		} catch (error) {
			if (error instanceof SteerInputError) {
				throw jsonRpcError(error.message, steerErrorCode(error.kind), 409);
			}
			this.options.onRuntimeError?.(error, { context, threadId });
			throw error;
		}
	}

	async turnInterrupt(params: TurnInterruptParams): Promise<TurnInterruptResponse> {
		const threadId = asThreadId(params.threadId);
		const runtimeSession = this.options.sessions.get(threadId);
		if (!runtimeSession?.session.activeTurn) {
			return {};
		}
		const activeTask = runtimeSession.session.activeTurn.firstTask();
		if (activeTask && activeTask.sub_id !== params.turnId) {
			throw jsonRpcError(
				`Expected active turn ${params.turnId}, but current active turn is ${activeTask.sub_id}.`,
				-32013,
				409,
			);
		}
		runtimeSession.abortController?.abort();
		await runtimeSession.session.abortActiveTurn("interrupted");
		return {};
	}

	private async sessionForTurn(
		threadId: ThreadId,
		params: TurnStartParams,
		submission: Submission,
		context?: Context,
	): Promise<RuntimeSession> {
		const existing = this.options.sessions.get(threadId);
		if (existing) {
			return existing;
		}
		const session = await this.options.createSession(threadId, params, context, submission);
		const runtimeSession: RuntimeSession = {
			abortController: null,
			runPromise: null,
			session,
		};
		this.options.sessions.set(threadId, runtimeSession);
		return runtimeSession;
	}
}
