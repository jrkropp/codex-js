import { parseTurnItem } from "./event-mapping";
import type { ResponseItem } from "./models";
import type { UserMessageTurnItem } from "./items";
import { loadCoreTemplate } from "./templates";

export const SUMMARIZATION_PROMPT = loadCoreTemplate("compact/prompt.md");

export const SUMMARY_PREFIX = loadCoreTemplate("compact/summary_prefix.md");

const COMPACT_USER_MESSAGE_MAX_TOKENS = 20_000;

export function compactedThreadWarning(): string {
	return "Heads up: Long threads and multiple compactions can cause the model to be less accurate. Start a new thread when possible to keep threads small and targeted.";
}

export function contentItemsToText(
	content: readonly ResponseItemMessageContent[],
): string | null {
	const pieces = content.flatMap((item) => {
		if (
			(item.type === "input_text" || item.type === "output_text") &&
			item.text.length > 0
		) {
			return [item.text];
		}
		return [];
	});

	return pieces.length > 0 ? pieces.join("\n") : null;
}

export function collectUserMessages(items: readonly ResponseItem[]): string[] {
	return items.flatMap((item) => {
		const turnItem = parseTurnItem(item);
		if (turnItem?.type !== "UserMessage") {
			return [];
		}

		const message = userMessageText(turnItem);
		return message && !isSummaryMessage(message) ? [message] : [];
	});
}

export function isSummaryMessage(message: string): boolean {
	return message.startsWith(`${SUMMARY_PREFIX}\n`);
}

export function buildCompactedHistory(
	initialContext: ResponseItem[],
	userMessages: readonly string[],
	summaryText: string,
): ResponseItem[] {
	const history = [...initialContext];
	const selectedMessages = selectRecentUserMessages(
		userMessages,
		COMPACT_USER_MESSAGE_MAX_TOKENS,
	);

	for (const message of selectedMessages) {
		history.push(userMessageResponseItem(message));
	}

	history.push(
		userMessageResponseItem(summaryText.trim() || "(no summary available)"),
	);

	return history;
}

function selectRecentUserMessages(
	userMessages: readonly string[],
	maxTokens: number,
): string[] {
	if (maxTokens <= 0) {
		return [];
	}

	const selected: string[] = [];
	let remaining = maxTokens;

	for (let index = userMessages.length - 1; index >= 0; index -= 1) {
		const message = userMessages[index] ?? "";
		const tokens = approxTokenCount(message);
		if (tokens <= remaining) {
			selected.push(message);
			remaining -= tokens;
			continue;
		}

		if (remaining > 0) {
			selected.push(truncateTextToApproxTokens(message, remaining));
		}
		break;
	}

	return selected.reverse();
}

function userMessageText(item: UserMessageTurnItem): string | null {
	const pieces = item.content.flatMap((content) =>
		content.type === "text" && content.text.length > 0 ? [content.text] : [],
	);
	return pieces.length > 0 ? pieces.join("\n") : null;
}

function userMessageResponseItem(text: string): ResponseItem {
	return {
		type: "message",
		role: "user",
		content: [{ type: "input_text", text }],
	};
}

function approxTokenCount(text: string): number {
	return Math.ceil(new TextEncoder().encode(text).byteLength / 4);
}

function truncateTextToApproxTokens(text: string, maxTokens: number): string {
	const maxBytes = Math.max(0, maxTokens * 4);
	const encoder = new TextEncoder();
	if (encoder.encode(text).byteLength <= maxBytes) {
		return text;
	}

	let next = "";
	for (const char of text) {
		const candidate = `${next}${char}`;
		if (encoder.encode(candidate).byteLength > maxBytes) {
			break;
		}
		next = candidate;
	}

	return `${next}\n...${Math.max(1, approxTokenCount(text) - maxTokens)} tokens truncated...`;
}

type ResponseItemMessageContent = Extract<
	ResponseItem,
	{ type: "message" }
>["content"][number];
