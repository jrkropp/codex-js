import type { CoreTextElement as TextElement } from "@jrkropp/codex-js/client";

import {
	findNextMentionTokenRange,
	type MentionBinding,
} from "./mention-bindings";
import {
	LEGACY_PROJECT_MENTION_SIGIL,
	PROJECT_MENTION_SIGIL,
	isMentionNameChar,
	mentionToken,
} from "./mention-syntax";

export type LinkedMention = {
	mention: string;
	path: string;
};

export type DecodedHistoryText = {
	mentions: LinkedMention[];
	text: string;
};

export type LinkedMentionRange = {
	end: number;
	mention: string;
	path: string;
	placeholder: string;
	start: number;
};

export function encodeHistoryMentions(
	text: string,
	bindings: readonly MentionBinding[],
): string {
	const ranges = mentionRangesForEncoding(text, bindings);
	if (ranges.length === 0) {
		return text;
	}

	let encoded = "";
	let lastIndex = 0;

	for (const range of ranges) {
		encoded += text.slice(lastIndex, range.start);
		encoded += `[${mentionToken(range.binding.mention)}](${range.binding.path})`;
		lastIndex = range.end;
	}

	encoded += text.slice(lastIndex);

	return encoded;
}

export function decodeHistoryMentions(text: string): DecodedHistoryText {
	const mentions: LinkedMention[] = [];
	let decoded = "";
	let lastIndex = 0;

	for (const link of findLinkedMentions(text)) {
		decoded += text.slice(lastIndex, link.start);
		decoded += link.placeholder;
		mentions.push({
			mention: link.mention,
			path: link.path,
		});
		lastIndex = link.end;
	}

	decoded += text.slice(lastIndex);

	return { mentions, text: decoded };
}

export function findLinkedMentions(text: string): LinkedMentionRange[] {
	const links: LinkedMentionRange[] = [];
	let cursor = 0;

	while (cursor < text.length) {
		const start = text.indexOf("[", cursor);
		if (start < 0) {
			break;
		}

		const link = parseLinkedToolMention(text, start);
		if (link) {
			links.push(link);
			cursor = link.end;
			continue;
		}

		cursor = start + 1;
	}

	return links;
}

export function parseLinkedToolMention(
	text: string,
	start: number,
): LinkedMentionRange | null {
	if (text[start] !== "[") {
		return null;
	}

	const labelStart = start + 1;
		const sigil = text[labelStart];
		if (
			sigil !== PROJECT_MENTION_SIGIL &&
			sigil !== LEGACY_PROJECT_MENTION_SIGIL
		) {
			return null;
		}

	let labelEnd = labelStart + 1;
	while (labelEnd < text.length && text[labelEnd] !== "]") {
		const code = text.charCodeAt(labelEnd);
		if (!isMentionNameChar(code)) {
			return null;
		}
		labelEnd += 1;
	}

	if (
		labelEnd === labelStart + 1 ||
		text[labelEnd] !== "]" ||
		text[labelEnd + 1] !== "("
	) {
		return null;
	}

	const pathStart = labelEnd + 2;
	const pathEnd = text.indexOf(")", pathStart);
	if (pathEnd < 0) {
		return null;
	}

	const path = text.slice(pathStart, pathEnd);
	if (!isToolMentionPath(path)) {
		return null;
	}

	const mention = text.slice(labelStart + 1, labelEnd);
	const placeholder = mentionToken(mention);

	return {
		end: pathEnd + 1,
		mention,
		path,
		placeholder,
		start,
	};
}

export function linkedMentionTextElements(text: string): TextElement[] {
	return findLinkedMentions(text).map((link) => ({
		byte_range: {
			start: utf8ByteLength(text.slice(0, link.start)),
			end: utf8ByteLength(text.slice(0, link.end)),
		},
		placeholder: link.placeholder,
	}));
}

function mentionRangesForEncoding(
	text: string,
	bindings: readonly MentionBinding[],
): { binding: MentionBinding; end: number; start: number }[] {
	const ranges: { binding: MentionBinding; end: number; start: number }[] = [];
	let scanFrom = 0;

	for (const binding of bindings) {
		const token = mentionToken(binding.mention);
		const range = findNextMentionTokenRange(text, token, scanFrom);
		if (!range) {
			continue;
		}

		ranges.push({ binding, ...range });
		scanFrom = range.end;
	}

	return ranges;
}

function isToolMentionPath(path: string): boolean {
	return (
		path.startsWith("app://") ||
		path.startsWith("mcp://") ||
		path.startsWith("plugin://") ||
		path.startsWith("skill://") ||
		path.endsWith("/SKILL.md")
	);
}

function utf8ByteLength(text: string): number {
	return new TextEncoder().encode(text).length;
}
