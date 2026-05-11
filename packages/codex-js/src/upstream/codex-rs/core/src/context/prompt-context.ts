import { normalizeCollaborationMode } from "../collaboration-mode-presets";
import type { ResponseItem } from "../models";
import type { BaseInstructions } from "../protocol";
import type { TurnContext } from "../session/turn-context";
import { CollaborationModeInstructions } from "./collaboration-mode-instructions";
import { buildInitialContextItems } from "./context-updates";

export function buildPromptBaseInstructions(
	turnContext: TurnContext,
): BaseInstructions {
	return {
		text: turnContext.base_instructions ?? "",
	};
}

export function buildPromptInputWithContext(
	input: ResponseItem[],
	turnContext: TurnContext,
): ResponseItem[] {
	const contextItems = buildPromptContextItems(turnContext);
	if (contextItems.length === 0) {
		return input;
	}

	const insertionIndex = lastUserMessageIndex(input);
	if (insertionIndex === -1) {
		return [...contextItems, ...input];
	}

	return [
		...input.slice(0, insertionIndex),
		...contextItems,
		...input.slice(insertionIndex),
	];
}

export function buildCollaborationModeInstructions(
	turnContext: TurnContext,
): ResponseItem | null {
	const collaborationMode = turnContext.collaboration_mode
		? normalizeCollaborationMode({
				collaborationMode: turnContext.collaboration_mode,
				model: turnContext.model,
				reasoningEffort: turnContext.effort,
		  })
		: null;
	return CollaborationModeInstructions.fromCollaborationMode(
		collaborationMode,
	)?.toResponseItem() ?? null;
}

export { CollaborationModeInstructions };

function buildPromptContextItems(turnContext: TurnContext): ResponseItem[] {
	return buildInitialContextItems(turnContext);
}

function lastUserMessageIndex(input: ResponseItem[]): number {
	for (let index = input.length - 1; index >= 0; index -= 1) {
		const item = input[index];
		if (item?.type === "message" && item.role === "user") {
			return index;
		}
	}
	return -1;
}
