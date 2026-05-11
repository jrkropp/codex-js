import type {
	ContentItem,
	ResponseImageGenerationCallItem,
	ResponseItem,
	ResponseWebSearchCallItem,
} from "./models";
import type {
	AgentMessageTurnItem,
	HookPromptFragment,
	HookPromptTurnItem,
	ReasoningTurnItem,
	TurnItem,
	UserMessageTurnItem,
	WebSearchAction,
	WebSearchTurnItem,
} from "./items";

const CONTEXTUAL_DEVELOPER_PREFIXES = [
	"<permissions instructions>",
	"<developer_instructions>",
	"<model_switch>",
	"<collaboration_mode>",
	"<realtime_conversation>",
	"<personality_spec>",
	"<hook_additional_context>",
];

export function isContextualUserMessageContent(
	message: readonly ContentItem[],
): boolean {
	return message.some(isContextualUserFragment);
}

export function isContextualDevMessageContent(
	message: readonly ContentItem[],
): boolean {
	return message.some(isContextualDevFragment);
}

export function hasNonContextualDevMessageContent(
	message: readonly ContentItem[],
): boolean {
	return message.some((contentItem) => !isContextualDevFragment(contentItem));
}

export function parseUserMessage(
	id: string | null | undefined,
	message: readonly ContentItem[],
): UserMessageTurnItem | null {
	if (isContextualUserMessageContent(message)) {
		return null;
	}

	const content: UserMessageTurnItem["content"] = [];

	for (const [index, contentItem] of message.entries()) {
		if (contentItem.type === "input_text") {
			if (
				((isLocalImageOpenTagText(contentItem.text) ||
					isImageOpenTagText(contentItem.text)) &&
					message[index + 1]?.type === "input_image") ||
				(index > 0 &&
					(isLocalImageCloseTagText(contentItem.text) ||
						isImageCloseTagText(contentItem.text)) &&
					message[index - 1]?.type === "input_image")
			) {
				continue;
			}

			content.push({
				type: "text",
				text: contentItem.text,
				text_elements: [],
			});
			continue;
		}

		if (contentItem.type === "input_image") {
			content.push({
				type: "image",
				image_url: contentItem.image_url,
			});
		}
	}

	return {
		type: "UserMessage",
		id: id ?? "",
		content,
	};
}

export function parseAgentMessage(
	id: string | null | undefined,
	message: readonly ContentItem[],
	phase?: string | null,
): AgentMessageTurnItem {
	const content: AgentMessageTurnItem["content"] = [];

	for (const contentItem of message) {
		if (contentItem.type === "input_text" || contentItem.type === "output_text") {
			content.push({ type: "Text", text: contentItem.text });
		}
	}

	return {
		type: "AgentMessage",
		id: id ?? "",
		content,
		phase: phase ?? null,
		memory_citation: null,
	};
}

export function parseVisibleHookPromptMessage(
	id: string | null | undefined,
	message: readonly ContentItem[],
): HookPromptTurnItem | null {
	const fragments: HookPromptFragment[] = [];

	for (const contentItem of message) {
		if (contentItem.type !== "input_text") {
			return null;
		}

		const fragment = parseHookPromptFragment(contentItem.text);
		if (fragment) {
			fragments.push(fragment);
			continue;
		}

		if (isStandardContextualUserText(contentItem.text)) {
			continue;
		}

		return null;
	}

	if (fragments.length === 0) {
		return null;
	}

	return {
		type: "HookPrompt",
		id: id ?? "",
		fragments,
	};
}

export function parseTurnItem(item: ResponseItem): TurnItem | null {
	switch (item.type) {
		case "message":
			if (item.role === "user") {
				return (
					parseVisibleHookPromptMessage(item.id, item.content) ??
					parseUserMessage(item.id, item.content)
				);
			}

			if (item.role === "assistant" || !item.role) {
				return parseAgentMessage(item.id, item.content, item.phase);
			}

			return null;
		case "reasoning":
			return parseReasoningItem(item);
		case "web_search_call":
			return parseWebSearchCall(item);
		case "image_generation_call":
			return parseImageGenerationCall(item);
		default:
			return null;
	}
}

function parseReasoningItem(
	item: Extract<ResponseItem, { type: "reasoning" }>,
): ReasoningTurnItem {
	return {
		type: "Reasoning",
		id: item.id ?? "",
		summary_text: item.summary.flatMap((entry) => {
			if (typeof entry.text === "string") {
				return [entry.text];
			}
			return [];
		}),
		raw_content: (item.content ?? []).flatMap((entry) => {
			if (
				(entry.type === "reasoning_text" || entry.type === "text") &&
				typeof entry.text === "string"
			) {
				return [entry.text];
			}
			return [];
		}),
	};
}

function parseWebSearchCall(item: ResponseWebSearchCallItem): WebSearchTurnItem {
	const action = webSearchActionFromRecord(item.action);
	return {
		type: "WebSearch",
		id: item.id ?? "",
		query: webSearchActionDetail(action),
		action,
	};
}

function parseImageGenerationCall(
	item: ResponseImageGenerationCallItem,
): TurnItem {
	return {
		type: "ImageGeneration",
		id: item.id,
		status: item.status,
		revised_prompt: item.revised_prompt ?? undefined,
		result: item.result,
		saved_path: item.saved_path,
	};
}

function webSearchActionFromRecord(
	action: Record<string, unknown> | null | undefined,
): WebSearchAction {
	if (!action) {
		return { type: "other" };
	}

	if (action.type === "search") {
		return {
			type: "search",
			...(typeof action.query === "string" ? { query: action.query } : {}),
			...(Array.isArray(action.queries)
				? { queries: action.queries.filter(isString) }
				: {}),
		};
	}

	if (action.type === "open_page") {
		return {
			type: "open_page",
			...(typeof action.url === "string" ? { url: action.url } : {}),
		};
	}

	if (action.type === "find_in_page") {
		return {
			type: "find_in_page",
			...(typeof action.url === "string" ? { url: action.url } : {}),
			...(typeof action.pattern === "string" ? { pattern: action.pattern } : {}),
		};
	}

	return { type: "other" };
}

function webSearchActionDetail(action: WebSearchAction): string {
	switch (action.type) {
		case "search":
			return action.query ?? action.queries?.join(", ") ?? "";
		case "open_page":
			return action.url ?? "";
		case "find_in_page": {
			const pattern = action.pattern ?? "";
			const url = action.url ?? "";
			return pattern && url ? `'${pattern}' in ${url}` : (pattern || url);
		}
		case "other":
			return "";
	}
}

function isContextualUserFragment(contentItem: ContentItem): boolean {
	return (
		contentItem.type === "input_text" &&
		(parseHookPromptFragment(contentItem.text) !== null ||
			isStandardContextualUserText(contentItem.text))
	);
}

function isContextualDevFragment(contentItem: ContentItem): boolean {
	if (contentItem.type !== "input_text") {
		return false;
	}

	const trimmed = contentItem.text.trimStart();
	return CONTEXTUAL_DEVELOPER_PREFIXES.some((prefix) =>
		trimmed.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase(),
	);
}

function isStandardContextualUserText(text: string): boolean {
	const trimmed = text.trimStart();
	return (
		trimmed.startsWith("# AGENTS.md instructions for ") ||
		trimmed.startsWith("<environment_context>") ||
		trimmed.startsWith("<skill>") ||
		trimmed.startsWith("<user_shell_command>") ||
		trimmed.startsWith("<turn_aborted>") ||
		trimmed.startsWith("<thread_goal_budget_limit>") ||
		trimmed.startsWith("<subagent_notification>")
	);
}

function parseHookPromptFragment(text: string): HookPromptFragment | null {
	const trimmed = text.trim();
	const match = trimmed.match(
		/^<hook_prompt\s+hook_run_id=(["'])(.*?)\1>([\s\S]*)<\/hook_prompt>$/u,
	);
	if (!match) {
		return null;
	}

	const hookRunId = decodeXmlEntities(match[2] ?? "").trim();
	if (!hookRunId) {
		return null;
	}

	return {
		hookRunId,
		text: decodeXmlEntities(match[3] ?? ""),
	};
}

function isImageOpenTagText(text: string): boolean {
	return text === "<image>";
}

function isImageCloseTagText(text: string): boolean {
	return text === "</image>";
}

function isLocalImageOpenTagText(text: string): boolean {
	return text.startsWith("<image name=") && text.endsWith(">");
}

function isLocalImageCloseTagText(text: string): boolean {
	return isImageCloseTagText(text);
}

function decodeXmlEntities(value: string): string {
	return value
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", "\"")
		.replaceAll("&apos;", "'");
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}
