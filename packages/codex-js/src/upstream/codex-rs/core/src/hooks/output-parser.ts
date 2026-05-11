import {
	HookOutputEntryKind,
	HookRunStatus,
	type HookHandlerResult,
	type HookOutputEntry,
} from "./types";

export type UniversalHookOutput = {
	continue_processing?: boolean;
	stop_reason?: string | null;
	suppress_output?: boolean;
	system_message?: string | null;
};

export function looks_like_json(text: string): boolean {
	const trimmed = text.trim();
	return trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function parse_hook_handler_json(stdout: string): HookHandlerResult | null {
	const trimmed = stdout.trim();
	if (!trimmed) {
		return { status: HookRunStatus.Completed };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) {
		return null;
	}

	const entries: HookOutputEntry[] = [];
	const universal = isRecord(parsed.universal) ? parsed.universal : {};
	const systemMessage = stringOrNull(universal.system_message);
	if (systemMessage) {
		entries.push({ kind: HookOutputEntryKind.Warning, text: systemMessage });
	}

	const additionalContext =
		stringOrNull(parsed.additional_context) ??
		(isRecord(parsed.hook_specific_output)
			? stringOrNull(parsed.hook_specific_output.additional_context)
			: null);
	if (additionalContext) {
		entries.push({ kind: HookOutputEntryKind.Context, text: additionalContext });
	}

	const continueProcessing = universal.continue_processing !== false;
	const stopReason = stringOrNull(universal.stop_reason);
	if (!continueProcessing) {
		if (stopReason) {
			entries.push({ kind: HookOutputEntryKind.Stop, text: stopReason });
		}
		return {
			status: HookRunStatus.Stopped,
			entries,
			stop_reason: stopReason,
			additional_contexts: additionalContext ? [additionalContext] : [],
		};
	}

	const reason = stringOrNull(parsed.reason);
	if (parsed.decision === "block" && reason) {
		entries.push({ kind: HookOutputEntryKind.Feedback, text: reason });
		return {
			status: HookRunStatus.Blocked,
			entries,
			block_reason: reason,
			stop_reason: reason,
			additional_contexts: additionalContext ? [additionalContext] : [],
		};
	}

	return {
		status: HookRunStatus.Completed,
		entries,
		additional_contexts: additionalContext ? [additionalContext] : [],
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stringOrNull(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value : null;
}
