import {
	HookEventName,
	type ConfiguredHookHandler,
} from "./types";

export function select_handlers(
	handlers: readonly ConfiguredHookHandler[],
	eventName: HookEventName,
	matcherInput?: string | null,
): ConfiguredHookHandler[] {
	const matcherInputs = matcherInput ? [matcherInput] : [];
	return select_handlers_for_matcher_inputs(handlers, eventName, matcherInputs);
}

export function select_handlers_for_matcher_inputs(
	handlers: readonly ConfiguredHookHandler[],
	eventName: HookEventName,
	matcherInputs: readonly string[],
): ConfiguredHookHandler[] {
	return handlers
		.filter((handler) => handler.event_name === eventName)
		.filter((handler) => {
			if (!hookEventUsesMatcher(eventName)) {
				return true;
			}
			if (matcherInputs.length === 0) {
				return matches_matcher(handler.matcher, null);
			}
			return matcherInputs.some((input) =>
				matches_matcher(handler.matcher, input),
			);
		});
}

export function matches_matcher(
	matcher: string | null | undefined,
	input: string | null,
): boolean {
	if (matcher === undefined || matcher === null) {
		return true;
	}
	if (matcher === "" || matcher === "*") {
		return true;
	}
	if (isExactMatcher(matcher)) {
		return input
			? matcher.split("|").some((candidate) => candidate === input)
			: false;
	}

	if (!input) {
		return false;
	}
	try {
		return new RegExp(matcher).test(input);
	} catch {
		return false;
	}
}

export function matcher_inputs(
	toolName: string,
	matcherAliases: readonly string[] = [],
): string[] {
	return [toolName, ...matcherAliases];
}

function hookEventUsesMatcher(eventName: HookEventName): boolean {
	return (
		eventName === HookEventName.PreToolUse ||
		eventName === HookEventName.PermissionRequest ||
		eventName === HookEventName.PostToolUse ||
		eventName === HookEventName.PreCompact ||
		eventName === HookEventName.PostCompact ||
		eventName === HookEventName.SessionStart
	);
}

function isExactMatcher(matcher: string): boolean {
	return /^[A-Za-z0-9_|]+$/u.test(matcher);
}
