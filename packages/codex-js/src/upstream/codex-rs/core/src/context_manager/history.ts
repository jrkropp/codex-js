import type { ResponseItem } from "../models";
import type {
	BaseInstructions,
	FunctionCallOutputPayload,
	TokenUsage,
	TokenUsageInfo,
	TruncationPolicy,
	TurnContextItem,
} from "../protocol";
import {
	approx_token_count,
	approx_tokens_from_byte_count_i64,
	scale_truncation_policy,
	truncate_function_output_payload as truncateFunctionOutputPayload,
} from "../../../utils/output-truncation/src/lib";
import {
	hasNonContextualDevMessageContent,
	isContextualDevMessageContent,
	isContextualUserMessageContent,
} from "../event-mapping";
import {
	normalizeResponseHistory,
	removeCorrespondingFor,
	stripImagesWhenUnsupported,
} from "./normalize";

export type TotalTokenUsageBreakdown = {
	last_api_response_total_tokens: number;
	all_history_items_model_visible_bytes: number;
	estimated_tokens_of_items_added_since_last_successful_api_response: number;
	estimated_bytes_of_items_added_since_last_successful_api_response: number;
};

export class ContextManager {
	private items: ResponseItem[] = [];
	private history_version = 0;
	private token_info_value: TokenUsageInfo | null = emptyTokenUsageInfo();
	private reference_context_item_value: TurnContextItem | null = null;

	static new(): ContextManager {
		return new ContextManager();
	}

	clone(): ContextManager {
		const next = new ContextManager();
		next.items = structuredClone(this.items);
		next.history_version = this.history_version;
		next.token_info_value = structuredClone(this.token_info_value);
		next.reference_context_item_value = structuredClone(
			this.reference_context_item_value,
		);
		return next;
	}

	token_info(): TokenUsageInfo | null {
		return structuredClone(this.token_info_value);
	}

	tokenInfo(): TokenUsageInfo | null {
		return this.token_info();
	}

	set_token_info(info: TokenUsageInfo | null): void {
		this.token_info_value = structuredClone(info);
	}

	setTokenInfo(info: TokenUsageInfo | null): void {
		this.set_token_info(info);
	}

	set_token_usage_full(contextWindow: number): void {
		const usage = {
			input_tokens: contextWindow,
			cached_input_tokens: 0,
			output_tokens: 0,
			reasoning_output_tokens: 0,
			total_tokens: contextWindow,
		};
		this.token_info_value = {
			total_token_usage: usage,
			last_token_usage: usage,
			model_context_window: contextWindow,
		};
	}

	setTokenUsageFull(contextWindow: number): void {
		this.set_token_usage_full(contextWindow);
	}

	recordItems(
		items: Iterable<ResponseItem>,
		policy?: TruncationPolicy | null,
	): void {
		for (const item of items) {
			if (isApiMessage(item)) {
				this.items.push(processResponseItemForPrompt(item, policy));
			}
		}
	}

	record_items(
		items: Iterable<ResponseItem>,
		policy?: TruncationPolicy | null,
	): void {
		this.recordItems(items, policy);
	}

	replace(items: ResponseItem[]): void {
		this.items = structuredClone(items);
		this.history_version = this.history_version + 1;
	}

	rawItems(): ResponseItem[] {
		return structuredClone(this.items);
	}

	raw_items(): ResponseItem[] {
		return this.rawItems();
	}

	forPrompt(inputModalities?: readonly string[] | null): ResponseItem[] {
		return stripImagesWhenUnsupported(
			inputModalities,
			normalizeResponseHistory(this.items),
		);
	}

	for_prompt(inputModalities?: readonly string[] | null): ResponseItem[] {
		return this.forPrompt(inputModalities);
	}

	historyVersion(): number {
		return this.history_version;
	}

	history_version_value(): number {
		return this.historyVersion();
	}

	estimate_token_count_with_base_instructions(
		baseInstructions: BaseInstructions,
	): number {
		return (
			approx_token_count(baseInstructions.text) +
			this.items.reduce(
				(total, item) => total + estimate_item_token_count(item),
				0,
			)
		);
	}

	setReferenceContextItem(item: TurnContextItem | null): void {
		this.reference_context_item_value = structuredClone(item);
	}

	set_reference_context_item(item: TurnContextItem | null): void {
		this.setReferenceContextItem(item);
	}

	referenceContextItem(): TurnContextItem | null {
		return structuredClone(this.reference_context_item_value);
	}

	reference_context_item(): TurnContextItem | null {
		return this.referenceContextItem();
	}

	dropLastNUserTurns(numTurns: number): void {
		if (numTurns <= 0) {
			return;
		}

		const snapshot = [...this.items];
		const userPositions = userMessagePositions(snapshot);
		const firstInstructionTurnIndex = userPositions[0];
		if (firstInstructionTurnIndex === undefined) {
			this.replace(snapshot);
			return;
		}

		const cutIndex =
			numTurns >= userPositions.length
				? firstInstructionTurnIndex
				: (userPositions[userPositions.length - numTurns] ?? firstInstructionTurnIndex);
		const trimmedCutIndex = this.trim_pre_turn_context_updates(
			snapshot,
			firstInstructionTurnIndex,
			cutIndex,
		);
		this.replace(snapshot.slice(0, trimmedCutIndex));
	}

	drop_last_n_user_turns(numTurns: number): void {
		this.dropLastNUserTurns(numTurns);
	}

	removeFirstItem(): void {
		const removed = this.items.shift();
		if (removed) {
			this.items = removeCorrespondingFor(this.items, removed);
		}
	}

	remove_first_item(): void {
		this.removeFirstItem();
	}

	removeLastItem(): boolean {
		const removed = this.items.at(-1);
		if (!removed) {
			return false;
		}

		this.items = removeCorrespondingFor(this.items.slice(0, -1), removed);
		this.history_version = this.history_version + 1;
		return true;
	}

	remove_last_item(): boolean {
		return this.removeLastItem();
	}

	replaceLastTurnImages(placeholder: string): boolean {
		const index = findLastIndex(this.items, (item) => {
			return (
				item.type === "function_call_output" ||
				item.type === "custom_tool_call_output" ||
				isUserTurnBoundary(item)
			);
		});
		if (index < 0) {
			return false;
		}

		const item = this.items[index];
		if (
			!item ||
			(item.type !== "function_call_output" &&
				item.type !== "custom_tool_call_output") ||
			item.output.body.type !== "content_items"
		) {
			return false;
		}

		let replaced = false;
		const items = item.output.body.items.map((content) => {
			if (content.type !== "input_image") {
				return content;
			}
			replaced = true;
			return { type: "input_text" as const, text: placeholder };
		});
		if (!replaced) {
			return false;
		}

		this.items[index] = {
			...item,
			output: {
				...item.output,
				body: { type: "content_items", items },
			},
		};
		this.history_version = this.history_version + 1;
		return true;
	}

	replace_last_turn_images(placeholder: string): boolean {
		return this.replaceLastTurnImages(placeholder);
	}

	updateTokenInfo(
		usage: TokenUsage,
		modelContextWindow?: number | null,
	): void {
		this.token_info_value = updateTokenInfoFromUsage(
			this.token_info_value,
			usage,
			modelContextWindow ?? null,
		);
	}

	update_token_info(
		usage: TokenUsage,
		modelContextWindow?: number | null,
	): void {
		this.updateTokenInfo(usage, modelContextWindow);
	}

	getTotalTokenUsage(serverReasoningIncluded = false): number {
		const lastTokens = this.token_info_value?.last_token_usage.total_tokens ?? 0;
		const itemsAfterLastModelTokens = this.itemsAfterLastModelGeneratedItem().reduce(
			(total, item) => total + estimate_item_token_count(item),
			0,
		);
		if (serverReasoningIncluded) {
			return lastTokens + itemsAfterLastModelTokens;
		}
		return (
			lastTokens +
			this.getNonLastReasoningItemsTokens() +
			itemsAfterLastModelTokens
		);
	}

	get_total_token_usage(serverReasoningIncluded = false): number {
		return this.getTotalTokenUsage(serverReasoningIncluded);
	}

	getTotalTokenUsageBreakdown(): TotalTokenUsageBreakdown {
		const lastUsage =
			this.token_info_value?.last_token_usage ?? emptyTokenUsage();
		const itemsAfterLastModelGenerated = this.itemsAfterLastModelGeneratedItem();
		return {
			last_api_response_total_tokens: lastUsage.total_tokens,
			all_history_items_model_visible_bytes: this.items.reduce(
				(total, item) => total + estimate_response_item_model_visible_bytes(item),
				0,
			),
			estimated_tokens_of_items_added_since_last_successful_api_response:
				itemsAfterLastModelGenerated.reduce(
					(total, item) => total + estimate_item_token_count(item),
					0,
				),
			estimated_bytes_of_items_added_since_last_successful_api_response:
				itemsAfterLastModelGenerated.reduce(
					(total, item) => total + estimate_response_item_model_visible_bytes(item),
					0,
				),
		};
	}

	get_total_token_usage_breakdown(): TotalTokenUsageBreakdown {
		return this.getTotalTokenUsageBreakdown();
	}

	private getNonLastReasoningItemsTokens(): number {
		const lastUserIndex = findLastIndex(this.items, isUserTurnBoundary);
		if (lastUserIndex < 0) {
			return 0;
		}
		return this.items
			.slice(0, lastUserIndex)
			.filter(
				(item) =>
					item.type === "reasoning" && typeof item.encrypted_content === "string",
			)
			.reduce((total, item) => total + estimate_item_token_count(item), 0);
	}

	private itemsAfterLastModelGeneratedItem(): ResponseItem[] {
		const index = findLastIndex(this.items, isModelGeneratedItem);
		return this.items.slice(index < 0 ? this.items.length : index + 1);
	}

	private trim_pre_turn_context_updates(
		snapshot: ResponseItem[],
		firstInstructionTurnIndex: number,
		cutIndex: number,
	): number {
		let nextCutIndex = cutIndex;
		while (nextCutIndex > firstInstructionTurnIndex) {
			const item = snapshot[nextCutIndex - 1];
			if (
				item?.type === "message" &&
				item.role === "developer" &&
				isContextualDevMessageContent(item.content)
			) {
				if (hasNonContextualDevMessageContent(item.content)) {
					this.reference_context_item_value = null;
				}
				nextCutIndex -= 1;
				continue;
			}

			if (
				item?.type === "message" &&
				item.role === "user" &&
				isContextualUserMessageContent(item.content)
			) {
				nextCutIndex -= 1;
				continue;
			}

			break;
		}
		return nextCutIndex;
	}
}

export function processResponseItemForPrompt(
	item: ResponseItem,
	policy?: TruncationPolicy | null,
): ResponseItem {
	const policyWithSerializationBudget = scale_truncation_policy(policy, 1.2);
	switch (item.type) {
		case "function_call_output":
			return {
				...item,
				output: truncate_function_output_payload(
					item.output,
					policyWithSerializationBudget,
				),
			};
		case "custom_tool_call_output":
			return {
				...item,
				output: truncate_function_output_payload(
					item.output,
					policyWithSerializationBudget,
				),
			};
		default:
			return item;
	}
}

export function truncate_function_output_payload(
	output: FunctionCallOutputPayload,
	policy?: TruncationPolicy | null,
): FunctionCallOutputPayload {
	return truncateFunctionOutputPayload(output, policy);
}

export function isApiMessage(item: ResponseItem): boolean {
	if (item.type === "message") {
		return item.role !== "system";
	}
	return item.type !== "other";
}

export function isUserTurnBoundary(item: ResponseItem): boolean {
	return (
		item.type === "message" &&
		item.role === "user" &&
		!isContextualUserMessageContent(item.content)
	);
}

export function dropLastNUserTurns(
	items: ResponseItem[],
	numTurns: number,
): ResponseItem[] {
	if (numTurns <= 0) {
		return [...items];
	}

	let next = [...items];
	for (let remaining = numTurns; remaining > 0; remaining -= 1) {
		const index = findLastUserTurnBoundary(next);
		if (index < 0) {
			return [];
		}
		next = next.slice(0, index);
	}

	return next;
}

function findLastUserTurnBoundary(items: ResponseItem[]): number {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		if (isUserTurnBoundary(items[index] as ResponseItem)) {
			return index;
		}
	}

	return -1;
}

export function estimate_item_token_count(item: ResponseItem): number {
	return approx_tokens_from_byte_count_i64(
		estimate_response_item_model_visible_bytes(item),
	);
}

export function estimate_response_item_model_visible_bytes(
	item: ResponseItem,
): number {
	if (
		(item.type === "reasoning" ||
			item.type === "compaction" ||
			item.type === "context_compaction") &&
		typeof item.encrypted_content === "string"
	) {
		return estimateReasoningLength(item.encrypted_content.length);
	}

	return utf8ByteLength(JSON.stringify(item));
}

function estimateReasoningLength(encodedLength: number): number {
	return Math.max(0, Math.floor((encodedLength * 3) / 4) - 650);
}

function isModelGeneratedItem(item: ResponseItem): boolean {
	return (
		(item.type === "message" && item.role === "assistant") ||
		item.type === "reasoning" ||
		item.type === "function_call" ||
		item.type === "tool_search_call" ||
		item.type === "web_search_call" ||
		item.type === "image_generation_call" ||
		item.type === "custom_tool_call" ||
		item.type === "local_shell_call" ||
		item.type === "compaction" ||
		item.type === "context_compaction"
	);
}

function userMessagePositions(items: ResponseItem[]): number[] {
	return items.flatMap((item, index) =>
		isUserTurnBoundary(item) ? [index] : [],
	);
}

function findLastIndex<T>(
	items: readonly T[],
	predicate: (item: T) => boolean,
): number {
	for (let index = items.length - 1; index >= 0; index -= 1) {
		if (predicate(items[index] as T)) {
			return index;
		}
	}
	return -1;
}

function emptyTokenUsageInfo(): TokenUsageInfo {
	const usage = emptyTokenUsage();
	return {
		total_token_usage: { ...usage },
		last_token_usage: { ...usage },
		model_context_window: null,
	};
}

function emptyTokenUsage(): TokenUsage {
	return {
		input_tokens: 0,
		cached_input_tokens: 0,
		output_tokens: 0,
		reasoning_output_tokens: 0,
		total_tokens: 0,
	};
}

function updateTokenInfoFromUsage(
	current: TokenUsageInfo | null,
	usage: TokenUsage,
	modelContextWindow: number | null,
): TokenUsageInfo {
	const previousTotal = current?.total_token_usage ?? emptyTokenUsage();
	const total = {
		input_tokens: previousTotal.input_tokens + usage.input_tokens,
		cached_input_tokens:
			previousTotal.cached_input_tokens + usage.cached_input_tokens,
		output_tokens: previousTotal.output_tokens + usage.output_tokens,
		reasoning_output_tokens:
			previousTotal.reasoning_output_tokens + usage.reasoning_output_tokens,
		total_tokens: previousTotal.total_tokens + usage.total_tokens,
	};
	return {
		total_token_usage: total,
		last_token_usage: { ...usage },
		model_context_window: modelContextWindow ?? current?.model_context_window ?? null,
	};
}

function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}
