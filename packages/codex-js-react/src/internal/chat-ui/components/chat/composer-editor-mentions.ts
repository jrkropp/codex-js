import type { CoreUserInput as UserInput } from "@jrkropp/codex-js/client";

import {
	type MentionBinding,
	normalizeMentionBindingsForText,
} from "./mention-bindings";
import {
	decodeHistoryMentions,
	encodeHistoryMentions,
	linkedMentionTextElements,
} from "./mention-codec";

export type ComposerPromptSnapshot = {
	mentionBindings: MentionBinding[];
	text: string;
	textElements: ReturnType<typeof linkedMentionTextElements>;
};

export function createComposerPromptSnapshot(
	text: string,
	mentionBindings: readonly MentionBinding[] = [],
): ComposerPromptSnapshot {
	const normalizedBindings = normalizeMentionBindingsForText(text, mentionBindings);

	return {
		mentionBindings: normalizedBindings,
		text,
		textElements: linkedMentionTextElements(
			encodeHistoryMentions(text, normalizedBindings),
		),
	};
}

export type PrefilledComposerState = {
	mentionBindings?: MentionBinding[];
	message: string;
};

export function prefillComposerState(
	input: PrefilledComposerState,
): ComposerPromptSnapshot {
	const decoded = decodeHistoryMentions(input.message.trim());
	const mentionBindings = [
		...decoded.mentions,
		...(input.mentionBindings ?? []),
	];

	return createComposerPromptSnapshot(decoded.text, mentionBindings);
}

export function composerSnapshotUserInputItems(
	snapshot: ComposerPromptSnapshot,
): UserInput[] {
	const text = snapshot.text.trim();
	if (!text) {
		return [];
	}

	const mentionBindings = normalizeMentionBindingsForText(
		text,
		snapshot.mentionBindings,
	);
	const encodedText = encodeHistoryMentions(text, mentionBindings);
	const textElements = linkedMentionTextElements(encodedText);

	return [
		{
			type: "text",
			text: encodedText,
			...(textElements.length > 0 ? { text_elements: textElements } : {}),
		},
	];
}
