import {
	HookOutputEntryKind,
	type HookOutputEntry,
} from "../types";

export function trimmed_non_empty(text: string | null | undefined): string | null {
	const trimmed = text?.trim();
	return trimmed ? trimmed : null;
}

export function append_additional_context(
	entries: HookOutputEntry[],
	additionalContexts: string[],
	additionalContext: string,
): void {
	entries.push({
		kind: HookOutputEntryKind.Context,
		text: additionalContext,
	});
	additionalContexts.push(additionalContext);
}

export function flatten_additional_contexts(
	contexts: Iterable<readonly string[]>,
): string[] {
	return [...contexts].flatMap((context) => [...context]);
}
