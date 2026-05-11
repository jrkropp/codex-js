import { ContextualUserFragment } from "../context/fragment";
import type { ResponseItem } from "../models";
import {
	HookEventName,
	HookOutputEntryKind,
	HookRunStatus,
	type HookCompletedEvent,
	type HookRunSummary,
} from "../protocol";
import {
	PermissionGrantScope,
	type RequestPermissionsResponse,
} from "../request_permissions";
import type { Session } from "../session/session";
import type { TurnContext } from "../session/turn-context";
import {
	matcher_inputs,
	select_handlers,
	select_handlers_for_matcher_inputs,
} from "./dispatcher";
import {
	completedHookRunSummary,
	runningHookRunSummary,
	type ConfiguredHookHandler,
	type HookHandlerResult,
	type PermissionRequestDecision,
	PermissionRequestDecision as PermissionRequestDecisionKind,
} from "./types";

export type HookRuntimeOutcome = {
	should_stop: boolean;
	stop_reason?: string | null;
	additional_contexts: string[];
};

export type SessionStartRequest = {
	session_id: string;
	turn_id: string;
	cwd: string;
	transcript_path?: string | null;
	model: string;
	permission_mode: string;
	source: string;
};

export type UserPromptSubmitRequest = {
	session_id: string;
	turn_id: string;
	cwd: string;
	transcript_path?: string | null;
	model: string;
	permission_mode: string;
	prompt: string;
};

export type PreToolUseRequest = {
	session_id: string;
	turn_id: string;
	cwd: string;
	transcript_path?: string | null;
	model: string;
	permission_mode: string;
	tool_name: string;
	matcher_aliases: string[];
	tool_use_id: string;
	tool_input: unknown;
};

export type PostToolUseRequest = PreToolUseRequest & {
	tool_response: unknown;
};

export type PermissionRequestRequest = PreToolUseRequest & {
	run_id_suffix: string;
};

export type CompactHookRequest = {
	session_id: string;
	turn_id: string;
	cwd: string;
	transcript_path?: string | null;
	model: string;
	trigger: "manual" | "auto";
};

export type PreToolUseOutcome = {
	hook_events: HookCompletedEvent[];
	should_block: boolean;
	block_reason?: string | null;
	additional_contexts: string[];
};

export type PostToolUseOutcome = {
	hook_events: HookCompletedEvent[];
	should_stop: boolean;
	stop_reason?: string | null;
	feedback_message?: string | null;
	additional_contexts: string[];
};

export type PermissionRequestOutcome = {
	hook_events: HookCompletedEvent[];
	decision?: PermissionRequestDecision | null;
};

export class Hooks {
	private readonly handlers: ConfiguredHookHandler[];

	constructor(handlers: readonly ConfiguredHookHandler[] = []) {
		this.handlers = [...handlers];
	}

	static empty(): Hooks {
		return new Hooks();
	}

	static withHandlersForTest(handlers: readonly ConfiguredHookHandler[]): Hooks {
		return new Hooks(handlers);
	}

	is_empty(): boolean {
		return this.handlers.length === 0;
	}

	preview_session_start(request: SessionStartRequest): HookRunSummary[] {
		return this.preview(HookEventName.SessionStart, [request.source]);
	}

	async run_session_start(
		request: SessionStartRequest,
	): Promise<PostToolUseOutcome> {
		return this.runContextInjecting(HookEventName.SessionStart, request, [
			request.source,
		]);
	}

	preview_user_prompt_submit(): HookRunSummary[] {
		return this.preview(HookEventName.UserPromptSubmit);
	}

	async run_user_prompt_submit(
		request: UserPromptSubmitRequest,
	): Promise<PostToolUseOutcome> {
		return this.runContextInjecting(HookEventName.UserPromptSubmit, request);
	}

	preview_pre_tool_use(request: PreToolUseRequest): HookRunSummary[] {
		return this.preview(
			HookEventName.PreToolUse,
			matcher_inputs(request.tool_name, request.matcher_aliases),
		);
	}

	async run_pre_tool_use(
		request: PreToolUseRequest,
	): Promise<PreToolUseOutcome> {
		const runs = await this.runMatching(
			HookEventName.PreToolUse,
			request,
			matcher_inputs(request.tool_name, request.matcher_aliases),
		);
		return {
			hook_events: runs.events,
			should_block: runs.results.some(
				(result) => result.status === HookRunStatus.Blocked || !!result.block_reason,
			),
			block_reason:
				runs.results.find((result) => result.block_reason)?.block_reason ?? null,
			additional_contexts: runs.results.flatMap(
				(result) => result.additional_contexts ?? [],
			),
		};
	}

	preview_post_tool_use(request: PostToolUseRequest): HookRunSummary[] {
		return this.preview(
			HookEventName.PostToolUse,
			matcher_inputs(request.tool_name, request.matcher_aliases),
		);
	}

	async run_post_tool_use(
		request: PostToolUseRequest,
	): Promise<PostToolUseOutcome> {
		return this.runContextInjecting(
			HookEventName.PostToolUse,
			request,
			matcher_inputs(request.tool_name, request.matcher_aliases),
		);
	}

	preview_permission_request(request: PermissionRequestRequest): HookRunSummary[] {
		return this.preview(
			HookEventName.PermissionRequest,
			matcher_inputs(request.tool_name, request.matcher_aliases),
		);
	}

	async run_permission_request(
		request: PermissionRequestRequest,
	): Promise<PermissionRequestOutcome> {
		const runs = await this.runMatching(
			HookEventName.PermissionRequest,
			request,
			matcher_inputs(request.tool_name, request.matcher_aliases),
		);
		return {
			hook_events: runs.events,
			decision:
				runs.results.find((result) => result.permission_decision)
					?.permission_decision ?? null,
		};
	}

	preview_pre_compact(request: CompactHookRequest): HookRunSummary[] {
		return this.preview(HookEventName.PreCompact, [request.trigger]);
	}

	async run_pre_compact(request: CompactHookRequest): Promise<PostToolUseOutcome> {
		return this.runContextInjecting(HookEventName.PreCompact, request, [
			request.trigger,
		]);
	}

	preview_post_compact(request: CompactHookRequest): HookRunSummary[] {
		return this.preview(HookEventName.PostCompact, [request.trigger]);
	}

	async run_post_compact(request: CompactHookRequest): Promise<PostToolUseOutcome> {
		return this.runContextInjecting(HookEventName.PostCompact, request, [
			request.trigger,
		]);
	}

	preview_stop(): HookRunSummary[] {
		return this.preview(HookEventName.Stop);
	}

	async run_stop(request: CompactHookRequest): Promise<PostToolUseOutcome> {
		return this.runContextInjecting(HookEventName.Stop, request);
	}

	private preview(
		eventName: HookEventName,
		matcherInputs: readonly string[] = [],
	): HookRunSummary[] {
		return select_handlers_for_matcher_inputs(
			this.handlers,
			eventName,
			matcherInputs,
		).map((handler) => runningHookRunSummary(handler));
	}

	private async runContextInjecting(
		eventName: HookEventName,
		request: unknown,
		matcherInputs: readonly string[] = [],
	): Promise<PostToolUseOutcome> {
		const runs = await this.runMatching(eventName, request, matcherInputs);
		return {
			hook_events: runs.events,
			should_stop: runs.results.some(
				(result) => result.status === HookRunStatus.Stopped || !!result.stop_reason,
			),
			stop_reason:
				runs.results.find((result) => result.stop_reason)?.stop_reason ?? null,
			feedback_message:
				runs.results.find((result) => result.feedback_message)
					?.feedback_message ?? null,
			additional_contexts: runs.results.flatMap(
				(result) => result.additional_contexts ?? [],
			),
		};
	}

	private async runMatching(
		eventName: HookEventName,
		request: unknown,
		matcherInputs: readonly string[] = [],
	): Promise<{ events: HookCompletedEvent[]; results: HookHandlerResult[] }> {
		const handlers =
			matcherInputs.length === 0
				? select_handlers(this.handlers, eventName)
				: select_handlers_for_matcher_inputs(
						this.handlers,
						eventName,
						matcherInputs,
					);
		const events: HookCompletedEvent[] = [];
		const results: HookHandlerResult[] = [];
		for (const handler of handlers) {
			const started = runningHookRunSummary(handler);
			const result = await Promise.resolve(handler.run?.(request) ?? {});
			const normalized = normalizeHookHandlerResult(result);
			results.push(normalized);
			events.push({
				turn_id: turnIdFromRequest(request),
				run: completedHookRunSummary(handler, normalized, {
					started_at: started.started_at,
				}),
			});
		}
		return { events, results };
	}
}

export async function run_session_start_hooks(
	session: Session,
	turnContext: TurnContext,
	source = "startup",
): Promise<boolean> {
	if (session.hooks().is_empty()) {
		return false;
	}
	const request: SessionStartRequest = {
		session_id: session.threadId,
		turn_id: turnContext.sub_id,
		cwd: turnContext.cwd,
		model: turnContext.model,
		permission_mode: turnContext.approval_policy,
		source,
	};
	const hooks = session.hooks();
	await emit_hook_started_events(
		session,
		turnContext,
		hooks.preview_session_start(request),
	);
	const outcome = await hooks.run_session_start(request);
	await emit_hook_completed_events(session, turnContext, outcome.hook_events);
	await record_additional_contexts(
		session,
		turnContext,
		outcome.additional_contexts,
	);
	return outcome.should_stop;
}

export async function run_user_prompt_submit_hooks(
	session: Session,
	turnContext: TurnContext,
	prompt: string,
): Promise<HookRuntimeOutcome> {
	if (session.hooks().is_empty()) {
		return { should_stop: false, additional_contexts: [] };
	}
	const request: UserPromptSubmitRequest = {
		session_id: session.threadId,
		turn_id: turnContext.sub_id,
		cwd: turnContext.cwd,
		model: turnContext.model,
		permission_mode: turnContext.approval_policy,
		prompt,
	};
	const hooks = session.hooks();
	await emit_hook_started_events(
		session,
		turnContext,
		hooks.preview_user_prompt_submit(),
	);
	const outcome = await hooks.run_user_prompt_submit(request);
	await emit_hook_completed_events(session, turnContext, outcome.hook_events);
	await record_additional_contexts(
		session,
		turnContext,
		outcome.additional_contexts,
	);
	return {
		should_stop: outcome.should_stop,
		stop_reason: outcome.stop_reason,
		additional_contexts: outcome.additional_contexts,
	};
}

export async function run_pre_tool_use_hooks(
	session: Session,
	turnContext: TurnContext,
	input: {
		tool_use_id: string;
		tool_name: string;
		matcher_aliases?: string[];
		tool_input: unknown;
	},
): Promise<string | null> {
	if (session.hooks().is_empty()) {
		return null;
	}
	const request: PreToolUseRequest = {
		session_id: session.threadId,
		turn_id: turnContext.sub_id,
		cwd: turnContext.cwd,
		model: turnContext.model,
		permission_mode: turnContext.approval_policy,
		tool_name: input.tool_name,
		matcher_aliases: input.matcher_aliases ?? [],
		tool_use_id: input.tool_use_id,
		tool_input: input.tool_input,
	};
	const hooks = session.hooks();
	await emit_hook_started_events(
		session,
		turnContext,
		hooks.preview_pre_tool_use(request),
	);
	const outcome = await hooks.run_pre_tool_use(request);
	await emit_hook_completed_events(session, turnContext, outcome.hook_events);
	await record_additional_contexts(
		session,
		turnContext,
		outcome.additional_contexts,
	);
	if (!outcome.should_block) {
		return null;
	}
	return `Tool call blocked by PreToolUse hook: ${outcome.block_reason ?? "blocked"}. Tool: ${input.tool_name}`;
}

export async function run_post_tool_use_hooks(
	session: Session,
	turnContext: TurnContext,
	input: {
		tool_use_id: string;
		tool_name: string;
		matcher_aliases?: string[];
		tool_input: unknown;
		tool_response: unknown;
	},
): Promise<PostToolUseOutcome> {
	if (session.hooks().is_empty()) {
		return {
			hook_events: [],
			should_stop: false,
			stop_reason: null,
			feedback_message: null,
			additional_contexts: [],
		};
	}
	const request: PostToolUseRequest = {
		session_id: session.threadId,
		turn_id: turnContext.sub_id,
		cwd: turnContext.cwd,
		model: turnContext.model,
		permission_mode: turnContext.approval_policy,
		tool_name: input.tool_name,
		matcher_aliases: input.matcher_aliases ?? [],
		tool_use_id: input.tool_use_id,
		tool_input: input.tool_input,
		tool_response: input.tool_response,
	};
	const hooks = session.hooks();
	await emit_hook_started_events(
		session,
		turnContext,
		hooks.preview_post_tool_use(request),
	);
	const outcome = await hooks.run_post_tool_use(request);
	await emit_hook_completed_events(session, turnContext, outcome.hook_events);
	await record_additional_contexts(
		session,
		turnContext,
		outcome.additional_contexts,
	);
	return outcome;
}

export async function run_permission_request_hooks(
	session: Session,
	turnContext: TurnContext,
	input: {
		run_id_suffix: string;
		tool_name: string;
		matcher_aliases?: string[];
		tool_input: unknown;
	},
): Promise<PermissionRequestDecision | null> {
	if (session.hooks().is_empty()) {
		return null;
	}
	const request: PermissionRequestRequest = {
		session_id: session.threadId,
		turn_id: turnContext.sub_id,
		cwd: turnContext.cwd,
		model: turnContext.model,
		permission_mode: turnContext.approval_policy,
		tool_name: input.tool_name,
		matcher_aliases: input.matcher_aliases ?? [],
		tool_use_id: input.run_id_suffix,
		run_id_suffix: input.run_id_suffix,
		tool_input: input.tool_input,
	};
	const hooks = session.hooks();
	await emit_hook_started_events(
		session,
		turnContext,
		hooks.preview_permission_request(request),
	);
	const outcome = await hooks.run_permission_request(request);
	await emit_hook_completed_events(session, turnContext, outcome.hook_events);
	return outcome.decision ?? null;
}

export async function run_pre_compact_hooks(
	session: Session,
	turnContext: TurnContext,
	trigger: "manual" | "auto" = "manual",
): Promise<HookRuntimeOutcome> {
	if (session.hooks().is_empty()) {
		return { should_stop: false, additional_contexts: [] };
	}
	const outcome = await run_compact_hooks(
		session,
		turnContext,
		HookEventName.PreCompact,
		trigger,
	);
	return outcome;
}

export async function run_post_compact_hooks(
	session: Session,
	turnContext: TurnContext,
	trigger: "manual" | "auto" = "manual",
): Promise<HookRuntimeOutcome> {
	if (session.hooks().is_empty()) {
		return { should_stop: false, additional_contexts: [] };
	}
	return run_compact_hooks(session, turnContext, HookEventName.PostCompact, trigger);
}

export async function run_stop_hooks(
	session: Session,
	turnContext: TurnContext,
): Promise<HookRuntimeOutcome> {
	if (session.hooks().is_empty()) {
		return { should_stop: false, additional_contexts: [] };
	}
	const request = compactHookRequest(session, turnContext, "manual");
	const hooks = session.hooks();
	await emit_hook_started_events(session, turnContext, hooks.preview_stop());
	const outcome = await hooks.run_stop(request);
	await emit_hook_completed_events(session, turnContext, outcome.hook_events);
	await record_additional_contexts(
		session,
		turnContext,
		outcome.additional_contexts,
	);
	return {
		should_stop: outcome.should_stop,
		stop_reason: outcome.stop_reason,
		additional_contexts: outcome.additional_contexts,
	};
}

export function hookAdditionalContextResponseItem(text: string): ResponseItem {
	return new ContextualUserFragment({
		role: "developer",
		start_marker: "<hook_additional_context>",
		end_marker: "</hook_additional_context>",
		body: () => `\n${text.trim()}\n`,
	}).toResponseItem();
}

export async function record_additional_contexts(
	session: Session,
	turnContext: TurnContext,
	contexts: readonly string[],
): Promise<void> {
	const items = contexts
		.map((context) => context.trim())
		.filter(Boolean)
		.map(hookAdditionalContextResponseItem);
	if (items.length === 0) {
		return;
	}
	await session.record_conversation_items(turnContext, items);
}

async function run_compact_hooks(
	session: Session,
	turnContext: TurnContext,
	eventName:
		| typeof HookEventName.PreCompact
		| typeof HookEventName.PostCompact,
	trigger: "manual" | "auto",
): Promise<HookRuntimeOutcome> {
	const request = compactHookRequest(session, turnContext, trigger);
	const hooks = session.hooks();
	const preview =
		eventName === HookEventName.PreCompact
			? hooks.preview_pre_compact(request)
			: hooks.preview_post_compact(request);
	await emit_hook_started_events(session, turnContext, preview);
	const outcome =
		eventName === HookEventName.PreCompact
			? await hooks.run_pre_compact(request)
			: await hooks.run_post_compact(request);
	await emit_hook_completed_events(session, turnContext, outcome.hook_events);
	await record_additional_contexts(
		session,
		turnContext,
		outcome.additional_contexts,
	);
	return {
		should_stop: outcome.should_stop,
		stop_reason: outcome.stop_reason,
		additional_contexts: outcome.additional_contexts,
	};
}

async function emit_hook_started_events(
	session: Session,
	turnContext: TurnContext,
	runs: readonly HookRunSummary[],
): Promise<void> {
	for (const run of runs) {
		await session.send_event(turnContext, {
			type: "hook_started",
			turn_id: turnContext.sub_id,
			run,
		});
	}
}

async function emit_hook_completed_events(
	session: Session,
	turnContext: TurnContext,
	events: readonly HookCompletedEvent[],
): Promise<void> {
	for (const event of events) {
		await session.send_event(turnContext, {
			type: "hook_completed",
			turn_id: event.turn_id ?? turnContext.sub_id,
			run: event.run,
		});
	}
}

function compactHookRequest(
	session: Session,
	turnContext: TurnContext,
	trigger: "manual" | "auto",
): CompactHookRequest {
	return {
		session_id: session.threadId,
		turn_id: turnContext.sub_id,
		cwd: turnContext.cwd,
		model: turnContext.model,
		trigger,
	};
}

function normalizeHookHandlerResult(
	result: HookHandlerResult,
): HookHandlerResult {
	const entries = [...(result.entries ?? [])];
	const additionalContexts = [...(result.additional_contexts ?? [])];
	for (const context of additionalContexts) {
		entries.push({ kind: HookOutputEntryKind.Context, text: context });
	}
	if (result.block_reason) {
		entries.push({ kind: HookOutputEntryKind.Feedback, text: result.block_reason });
	}
	if (result.stop_reason) {
		entries.push({ kind: HookOutputEntryKind.Stop, text: result.stop_reason });
	}
	return {
		...result,
		entries,
		status:
			result.status ??
			(result.block_reason
				? HookRunStatus.Blocked
				: result.stop_reason
					? HookRunStatus.Stopped
					: HookRunStatus.Completed),
		additional_contexts: additionalContexts,
	};
}

function turnIdFromRequest(request: unknown): string | null {
	return typeof request === "object" &&
		request !== null &&
		"turn_id" in request &&
		typeof request.turn_id === "string"
		? request.turn_id
		: null;
}

export function requestPermissionsResponseFromDecision(
	decision: PermissionRequestDecision | null,
): RequestPermissionsResponse | null {
	if (!decision) {
		return null;
	}
	if (decision.type === PermissionRequestDecisionKind.Allow) {
		return null;
	}
	return {
		permissions: {},
		scope: PermissionGrantScope.Turn,
		strict_auto_review: false,
	};
}
