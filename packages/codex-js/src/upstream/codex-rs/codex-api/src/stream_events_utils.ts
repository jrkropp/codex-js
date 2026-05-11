import type {
	ContentItem,
	EventMsg,
	FunctionCallOutputContentItem,
	FunctionCallOutputPayload,
	ResponseItem,
	RolloutItem,
	Submission,
	UserInput,
} from "../../core/src";
import {
	normalizeResponseHistory,
	reconstructHistoryFromRollout,
} from "../../core/src";
import {
	AssistantTextStreamParser,
} from "../../core/src/stream-parser";
export { responseInputToResponseItem } from "../../core/src";

export function modelInputFromHistoryAndSubmission(
	history: RolloutItem[],
	submission: Submission,
): ResponseItem[] {
	return [
		...modelInputFromHistory(history),
		...inputFromSubmission(submission),
	];
}

export function modelInputFromHistory(
	history: RolloutItem[],
): ResponseItem[] {
	return normalizeResponseHistory(reconstructHistoryFromRollout(history).history);
}

export function inputFromSubmission(
	submission: Submission,
): ResponseItem[] {
	if (
		submission.op.type !== "user_turn" &&
		submission.op.type !== "user_input" &&
		submission.op.type !== "user_input_with_turn_context"
	) {
		return [];
	}

	return [userInputAsResponseInput(submission.op.items)];
}

export function userMessageEventAsResponseInput(
	event: EventMsg & { type: "user_message" },
): ResponseItem {
	const items: UserInput[] = [
		...(event.message ? [{ type: "text" as const, text: event.message }] : []),
		...(event.images ?? []).map((imageUrl) => ({
			type: "image" as const,
			image_url: imageUrl,
		})),
	];

	return userInputAsResponseInput(items);
}

export function userInputAsResponseInput(
	items: UserInput[],
): ResponseItem {
	const content: ContentItem[] = [];

	for (const item of items) {
		if (item.type === "text") {
			content.push({ type: "input_text", text: item.text });
			continue;
		}

		if (item.type === "image") {
			content.push({ type: "input_image", image_url: item.image_url });
			continue;
		}
	}

	return {
		type: "message",
		role: "user",
		content,
	};
}

export function outputTextDeltaFromStreamEvent(
	event: unknown,
): { text: string; item_id?: string } | null {
	if (
		typeof event === "object" &&
		event !== null &&
		(event as { type?: unknown }).type === "response.output_text.delta" &&
		typeof (event as { delta?: unknown }).delta === "string"
	) {
		const itemId =
			typeof (event as { item_id?: unknown }).item_id === "string"
				? (event as { item_id: string }).item_id
				: undefined;
		return {
			text: (event as { delta: string }).delta,
			...(itemId ? { item_id: itemId } : {}),
		};
	}

	return null;
}

export type OpenAiResponseLike = {
	output?: unknown;
};

export function responseOutputItemsFromResponse(
	response: OpenAiResponseLike,
): ResponseItem[] {
	const output = Array.isArray(response.output) ? response.output : [];
	return output
		.filter(isRecord)
		.map(responseOutputItemAsResponseItem);
}

function responseOutputItemAsResponseItem(
	item: Record<string, unknown>,
): ResponseItem {
	switch (item.type) {
		case "message":
			return {
				type: "message",
				...(typeof item.id === "string" ? { id: item.id } : {}),
				role: typeof item.role === "string" ? item.role : "assistant",
				content: contentItemsFromWire(item.content),
				...(item.phase === "commentary" || item.phase === "final_answer"
					? { phase: item.phase }
					: {}),
			};
		case "reasoning":
			return {
				type: "reasoning",
				...(typeof item.id === "string" ? { id: item.id } : {}),
				summary: Array.isArray(item.summary) ? item.summary : [],
				...(Array.isArray(item.content) ? { content: item.content } : {}),
				...(typeof item.encrypted_content === "string"
					? { encrypted_content: item.encrypted_content }
					: {}),
			};
		case "local_shell_call":
			return {
				type: "local_shell_call",
				...(typeof item.call_id === "string" ? { call_id: item.call_id } : {}),
				...(typeof item.status === "string" ? { status: item.status } : {}),
				action: isRecord(item.action) ? item.action : {},
			};
		case "function_call":
			return {
				type: "function_call",
				name: typeof item.name === "string" ? item.name : "",
				...(typeof item.namespace === "string"
					? { namespace: item.namespace }
					: {}),
				arguments: typeof item.arguments === "string" ? item.arguments : "{}",
				call_id: typeof item.call_id === "string" ? item.call_id : "",
			};
		case "tool_search_call":
			return {
				type: "tool_search_call",
				...(typeof item.call_id === "string" ? { call_id: item.call_id } : {}),
				...(typeof item.status === "string" ? { status: item.status } : {}),
				execution: typeof item.execution === "string" ? item.execution : "",
				arguments: item.arguments ?? {},
			};
		case "function_call_output":
			return {
				type: "function_call_output",
				call_id: typeof item.call_id === "string" ? item.call_id : "",
				output: functionCallOutputPayloadFromWire(item.output),
			};
		case "custom_tool_call":
			return {
				type: "custom_tool_call",
				...(typeof item.status === "string" ? { status: item.status } : {}),
				call_id: typeof item.call_id === "string" ? item.call_id : "",
				name: typeof item.name === "string" ? item.name : "",
				input: typeof item.input === "string" ? item.input : "",
			};
		case "custom_tool_call_output":
			return {
				type: "custom_tool_call_output",
				call_id: typeof item.call_id === "string" ? item.call_id : "",
				...(typeof item.name === "string" ? { name: item.name } : {}),
				output: functionCallOutputPayloadFromWire(item.output),
			};
		case "tool_search_output":
			return {
				type: "tool_search_output",
				...(typeof item.call_id === "string" ? { call_id: item.call_id } : {}),
				status: typeof item.status === "string" ? item.status : "",
				execution: typeof item.execution === "string" ? item.execution : "",
				tools: Array.isArray(item.tools) ? item.tools : [],
			};
		case "web_search_call":
			return {
				type: "web_search_call",
				...(typeof item.id === "string" ? { id: item.id } : {}),
				...(typeof item.status === "string" ? { status: item.status } : {}),
				...(isRecord(item.action) ? { action: item.action } : {}),
			};
		case "image_generation_call":
			return {
				type: "image_generation_call",
				id: typeof item.id === "string" ? item.id : "",
				status: typeof item.status === "string" ? item.status : "",
				...(typeof item.revised_prompt === "string"
					? { revised_prompt: item.revised_prompt }
					: {}),
				result: typeof item.result === "string" ? item.result : "",
				...(typeof item.saved_path === "string"
					? { saved_path: item.saved_path }
					: {}),
			};
		case "compaction_summary":
		case "compaction":
			return {
				type: "compaction",
				...(typeof item.encrypted_content === "string"
					? { encrypted_content: item.encrypted_content }
					: {}),
			};
		case "context_compaction":
			return {
				type: "context_compaction",
				...(typeof item.encrypted_content === "string"
					? { encrypted_content: item.encrypted_content }
					: {}),
			};
		default:
			return { type: "other" };
	}
}

export function rawAssistantOutputTextFromItem(
	item: ResponseItem,
): string | null {
	if (item.type !== "message") {
		return null;
	}

	const content = item.content;
	const text = content
		.map((part) => textFromMessageContentPart(part))
		.filter((part) => part.length > 0)
		.join("");

	return text.length > 0 ? text : null;
}

export type ProposedPlanExtraction = {
	assistantText: string;
	planText: string | null;
};

export function extractProposedPlanFromText(text: string): ProposedPlanExtraction {
	const parser = new AssistantTextStreamParser(true);
	const parsed = parser.push_str(text);
	const finished = parser.finish();
	let planText = "";
	let sawPlanBlock = false;
	for (const segment of [...parsed.plan_segments, ...finished.plan_segments]) {
		switch (segment.type) {
			case "ProposedPlanStart":
				sawPlanBlock = true;
				planText = "";
				break;
			case "ProposedPlanDelta":
				planText += segment.text;
				break;
			case "ProposedPlanEnd":
			case "Normal":
				break;
		}
	}
	return {
		assistantText: parsed.visible_text + finished.visible_text,
		planText: sawPlanBlock ? planText : null,
	};
}

function textFromMessageContentPart(part: unknown): string {
	if (!isRecord(part)) {
		return "";
	}

	if (
		(part.type === "output_text" || part.type === "text") &&
		typeof part.text === "string"
	) {
		return part.text;
	}

	return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentItemsFromWire(content: unknown): ContentItem[] {
	if (!Array.isArray(content)) {
		return [];
	}

	return content.flatMap((item): ContentItem[] => {
		if (!isRecord(item)) {
			return [];
		}

		if (
			(item.type === "input_text" ||
				item.type === "output_text" ||
				item.type === "text") &&
			typeof item.text === "string"
		) {
			return [
				{
					type: item.type === "output_text" ? "output_text" : "input_text",
					text: item.text,
				},
			];
		}

		if (
			item.type === "input_image" &&
			typeof item.image_url === "string"
		) {
			return [
				{
					type: "input_image",
					image_url: item.image_url,
					...(typeof item.detail === "string" ? { detail: item.detail } : {}),
				},
			];
		}

		return [];
	});
}

function functionCallOutputPayloadFromWire(
	output: unknown,
): FunctionCallOutputPayload {
	if (typeof output === "string") {
		return {
			body: {
				type: "text",
				text: output,
			},
			success: null,
		};
	}

	if (Array.isArray(output)) {
		return {
			body: {
				type: "content_items",
				items: output.flatMap(functionCallOutputContentItemFromWire),
			},
			success: null,
		};
	}

	return {
		body: {
			type: "text",
			text: JSON.stringify(output ?? null),
		},
		success: null,
	};
}

function functionCallOutputContentItemFromWire(
	item: unknown,
): FunctionCallOutputContentItem[] {
	if (!isRecord(item)) {
		return [];
	}

	if (item.type === "input_text" && typeof item.text === "string") {
		return [{ type: "input_text", text: item.text }];
	}

	if (item.type === "input_image" && typeof item.image_url === "string") {
		return [
			{
				type: "input_image",
				image_url: item.image_url,
				...(typeof item.detail === "string" ? { detail: item.detail } : {}),
			},
		];
	}

	return [];
}
