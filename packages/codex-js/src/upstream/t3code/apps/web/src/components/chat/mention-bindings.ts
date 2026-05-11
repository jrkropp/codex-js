import { isMentionNameChar, mentionToken } from "./mention-syntax";

export type MentionBinding = {
	mention: string;
	path: string;
};

export type MentionBindingRange = {
	binding: MentionBinding;
	range: { end: number; start: number };
};

export function normalizeMentionBindingsForText(
	text: string,
	bindings: readonly MentionBinding[],
): MentionBinding[] {
	return mentionBindingRangesForText(text, bindings).map((item) => item.binding);
}

export function mentionBindingRangesForText(
	text: string,
	bindings: readonly MentionBinding[],
): MentionBindingRange[] {
	const ranges: MentionBindingRange[] = [];
	let scanFrom = 0;

	for (const binding of bindings) {
		const token = mentionToken(binding.mention);
		const range = findNextMentionTokenRange(text, token, scanFrom);
		if (!range) {
			continue;
		}

		ranges.push({ binding, range });
		scanFrom = range.end;
	}

	return ranges;
}

export function mentionBindingsAfterReplacement(input: {
	currentBindings: readonly MentionBinding[];
	insertedBinding: MentionBinding;
	nextText: string;
	replacement: string;
	rangeEnd: number;
	rangeStart: number;
	text: string;
}): MentionBinding[] {
	const replacedRange = {
		end: Math.max(input.rangeEnd, input.rangeStart),
		start: input.rangeStart,
	};
	const delta =
		input.replacement.length - (replacedRange.end - replacedRange.start);
	const ranges = mentionBindingRangesForText(
		input.text,
		input.currentBindings,
	).filter(
		(item) =>
			item.range.end <= replacedRange.start ||
			item.range.start >= replacedRange.end,
	);
	const nextRanges = [
		...ranges.map((item) => ({
			binding: item.binding,
			start:
				item.range.start >= replacedRange.end
					? item.range.start + delta
					: item.range.start,
		})),
		{
			binding: input.insertedBinding,
			start: replacedRange.start,
		},
	].sort((left, right) => left.start - right.start);

	return normalizeMentionBindingsForText(
		input.nextText,
		nextRanges.map((item) => item.binding),
	);
}

export function findNextMentionTokenRange(
	text: string,
	token: string,
	from: number,
): { end: number; start: number } | null {
	let index = Math.max(0, from);

	while (index < text.length) {
		const start = text.indexOf(token, index);
		if (start < 0) {
			return null;
		}

		const end = start + token.length;
		if (isTokenBoundary(text, start, end)) {
			return { end, start };
		}

		index = end;
	}

	return null;
}

function isTokenBoundary(text: string, start: number, end: number): boolean {
	const before = start > 0 ? text.charCodeAt(start - 1) : null;
	const after = end < text.length ? text.charCodeAt(end) : null;

	return (
		(before === null || !isMentionNameChar(before)) &&
		(after === null || !isMentionNameChar(after))
	);
}
