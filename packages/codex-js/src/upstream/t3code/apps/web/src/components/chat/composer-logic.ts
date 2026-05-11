// Portions adapted from T3 Code's composer trigger logic.
// T3 Code is MIT licensed, copyright (c) 2026 T3 Tools Inc.

import { PROJECT_MENTION_SIGIL, SKILL_MENTION_SIGIL } from "./mention-syntax";

export type ComposerTriggerKind = "path" | "skill" | "slash-command";

export type BuiltInComposerSlashCommand = "default" | "model" | "plan";

export type ComposerSlashCommand = BuiltInComposerSlashCommand | (string & {});

export type ComposerTrigger = {
	kind: ComposerTriggerKind;
	query: string;
	rangeEnd: number;
	rangeStart: number;
};

function clampCursor(text: string, cursor: number): number {
	if (!Number.isFinite(cursor)) {
		return text.length;
	}

	return Math.max(0, Math.min(text.length, Math.floor(cursor)));
}

function isWhitespace(char: string): boolean {
	return char === " " || char === "\n" || char === "\t" || char === "\r";
}

function tokenStartForCursor(text: string, cursor: number): number {
	let index = cursor - 1;

	while (index >= 0 && !isWhitespace(text[index] ?? "")) {
		index -= 1;
	}

	return index + 1;
}

export function detectComposerTrigger(
	text: string,
	cursorInput: number,
): ComposerTrigger | null {
	const cursor = clampCursor(text, cursorInput);
	const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
	const linePrefix = text.slice(lineStart, cursor);

	if (linePrefix.startsWith("/")) {
		const commandMatch = /^\/(\S*)$/.exec(linePrefix);
		if (commandMatch) {
			return {
				kind: "slash-command",
				query: commandMatch[1] ?? "",
				rangeEnd: cursor,
				rangeStart: lineStart,
			};
		}
	}

	const tokenStart = tokenStartForCursor(text, cursor);
	const token = text.slice(tokenStart, cursor);

	if (token.startsWith(SKILL_MENTION_SIGIL)) {
		return {
			kind: "skill",
			query: token.slice(SKILL_MENTION_SIGIL.length),
			rangeEnd: cursor,
			rangeStart: tokenStart,
		};
	}

	if (!token.startsWith(PROJECT_MENTION_SIGIL)) {
		return null;
	}

	return {
		kind: "path",
		query: token.slice(PROJECT_MENTION_SIGIL.length),
		rangeEnd: cursor,
		rangeStart: tokenStart,
	};
}

export function replaceTextRange(
	text: string,
	rangeStart: number,
	rangeEnd: number,
	replacement: string,
): { cursor: number; text: string } {
	const start = clampCursor(text, rangeStart);
	const end = clampCursor(text, Math.max(rangeEnd, start));
	const nextText = `${text.slice(0, start)}${replacement}${text.slice(end)}`;

	return {
		cursor: start + replacement.length,
		text: nextText,
	};
}

export function parseStandaloneComposerSlashCommand(
	text: string,
): ComposerSlashCommand | null {
	return text.trim().match(/^\/([a-z][a-z0-9-]*)$/)?.[1] ?? null;
}
