import {
	HookEventName,
	HookExecutionMode,
	HookHandlerType,
	HookOutputEntryKind,
	HookRunStatus,
	HookScope,
	HookSource,
	type HookCompletedEvent,
	type HookOutputEntry,
	type HookRunSummary,
	type HookStartedEvent,
} from "../protocol";

export {
	HookEventName,
	HookExecutionMode,
	HookHandlerType,
	HookOutputEntryKind,
	HookRunStatus,
	HookScope,
	HookSource,
	type HookCompletedEvent,
	type HookOutputEntry,
	type HookRunSummary,
	type HookStartedEvent,
};

export const HOOK_EVENT_NAMES = [
	"PreToolUse",
	"PermissionRequest",
	"PostToolUse",
	"PreCompact",
	"PostCompact",
	"SessionStart",
	"UserPromptSubmit",
	"Stop",
] as const;

export const HOOK_EVENT_NAMES_WITH_MATCHERS = [
	"PreToolUse",
	"PermissionRequest",
	"PostToolUse",
	"PreCompact",
	"PostCompact",
	"SessionStart",
] as const;

export type ConfiguredHookHandler = {
	event_name: HookEventName;
	matcher?: string | null;
	name?: string | null;
	status_message?: string | null;
	source_path?: string | null;
	source?: HookSource;
	display_order?: number;
	run?: (request: unknown) => Promise<HookHandlerResult> | HookHandlerResult;
};

export type HookHandlerResult = {
	status?: HookRunStatus;
	entries?: HookOutputEntry[];
	additional_contexts?: string[];
	block_reason?: string | null;
	stop_reason?: string | null;
	feedback_message?: string | null;
	permission_decision?: PermissionRequestDecision | null;
};

export const PermissionRequestDecision = {
	Allow: "allow",
	Deny: "deny",
} as const;

export type PermissionRequestDecision =
	| { type: typeof PermissionRequestDecision.Allow }
	| { type: typeof PermissionRequestDecision.Deny; message?: string | null };

export function runningHookRunSummary(
	handler: ConfiguredHookHandler,
	now = Date.now(),
): HookRunSummary {
	return {
		id: hookRunId(handler),
		event_name: handler.event_name,
		handler_type: HookHandlerType.Command,
		execution_mode: HookExecutionMode.Sync,
		scope: scopeForHookEvent(handler.event_name),
		source_path: handler.source_path ?? "<codex-assistant-hooks>",
		source: handler.source ?? HookSource.Unknown,
		display_order: handler.display_order ?? 0,
		status: HookRunStatus.Running,
		status_message: handler.status_message ?? null,
		started_at: Math.floor(now / 1000),
		completed_at: null,
		duration_ms: null,
		entries: [],
	};
}

export function completedHookRunSummary(
	handler: ConfiguredHookHandler,
	result: HookHandlerResult,
	input: { started_at: number; completed_at?: number },
): HookRunSummary {
	const completedAt = input.completed_at ?? Date.now();
	return {
		...runningHookRunSummary(handler, input.started_at * 1000),
		status: result.status ?? HookRunStatus.Completed,
		completed_at: Math.floor(completedAt / 1000),
		duration_ms: Math.max(0, completedAt - input.started_at * 1000),
		entries: result.entries ?? [],
	};
}

export function hookRunId(handler: ConfiguredHookHandler): string {
	const label = hookEventNameLabel(handler.event_name);
	return `${label}:${handler.display_order ?? 0}:${handler.source_path ?? "<codex-assistant-hooks>"}`;
}

export function scopeForHookEvent(eventName: HookEventName): HookScope {
	return eventName === HookEventName.SessionStart ? HookScope.Thread : HookScope.Turn;
}

function hookEventNameLabel(eventName: HookEventName): string {
	return eventName.replaceAll("_", "-");
}
