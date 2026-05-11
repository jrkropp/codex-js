import type { TokenUsage } from "../../../core/src";
import type { ResponseEvent, ResponseStream } from "../common";
import {
	outputTextDeltaFromStreamEvent,
	responseOutputItemsFromResponse,
} from "../stream_events_utils";
import { ApiError, apiErrorFromResponsesEvent } from "../error";
import { parseAllRateLimits, parseRateLimitEventPayload } from "../rate_limits";

export type SpawnResponseStreamInput = {
	headers?: Headers | null;
	chunks: AsyncIterable<string>;
	idle_timeout_ms?: number | null;
	require_completed?: boolean;
};

export function spawnResponseStream(input: SpawnResponseStreamInput): ResponseStream {
	const upstreamRequestId = input.headers?.get("x-request-id") ?? null;
	return new ParsedResponseStream({
		...input,
		upstream_request_id: upstreamRequestId,
	});
}

export async function* responseEventsFromSseTextChunks(
	chunks: AsyncIterable<string>,
	options: {
		headers?: Headers | null;
		idle_timeout_ms?: number | null;
		require_completed?: boolean;
	} = {},
): AsyncGenerator<ResponseEvent> {
	yield* responseEventsFromParsedRecords(sseRecordsFromTextChunks(chunks), options);
}

class ParsedResponseStream implements ResponseStream {
	readonly upstream_request_id?: string | null;

	constructor(
		private readonly input: SpawnResponseStreamInput & {
			upstream_request_id?: string | null;
		},
	) {
		this.upstream_request_id = input.upstream_request_id ?? null;
	}

	async *[Symbol.asyncIterator](): AsyncIterator<ResponseEvent> {
		if (this.input.headers) {
			yield* headerResponseEvents(this.input.headers);
		}
		yield* responseEventsFromParsedRecords(
			sseRecordsFromTextChunks(this.input.chunks, {
				idle_timeout_ms: this.input.idle_timeout_ms,
			}),
			{
				require_completed: this.input.require_completed ?? true,
			},
		);
	}
}

function* headerResponseEvents(headers: Headers): Generator<ResponseEvent> {
	const serverModel = headers.get("openai-model");
	if (serverModel) {
		yield { type: "server_model", model: serverModel };
	}
	for (const snapshot of parseAllRateLimits(headers)) {
		yield { type: "rate_limits", rate_limits: snapshot };
	}
	const etag = headers.get("x-models-etag");
	if (etag) {
		yield { type: "models_etag", etag };
	}
	if (headers.has("x-reasoning-included")) {
		yield { type: "server_reasoning_included", reasoning_included: true };
	}
}

async function* responseEventsFromParsedRecords(
	records: AsyncIterable<Record<string, unknown>>,
	options: { require_completed?: boolean } = {},
): AsyncGenerator<ResponseEvent> {
	let completed = false;
	let lastServerModel: string | null = null;
	let responseError: ApiError | null = null;

	for await (const event of records) {
		const model = responseModelFromEvent(event);
		if (model && model !== lastServerModel) {
			yield { type: "server_model", model };
			lastServerModel = model;
		}
		const verifications = modelVerificationsFromEvent(event);
		if (verifications) {
			yield {
				type: "model_verifications",
				model_verifications: verifications,
			};
		}

		try {
			const mapped = responseEventFromRecord(event);
			if (!mapped) {
				continue;
			}
			if (mapped.type === "completed") {
				completed = true;
			}
			yield mapped;
			if (mapped.type === "completed") {
				return;
			}
		} catch (error) {
			const apiError = error instanceof ApiError ? error : ApiError.stream(String(error));
			responseError = apiError;
		}
	}

	if (options.require_completed && !completed) {
		throw responseError ?? ApiError.stream("stream closed before response.completed");
	}
}

function responseEventFromRecord(event: Record<string, unknown>): ResponseEvent | null {
	const delta = outputTextDeltaFromStreamEvent(event);
	if (delta) {
		return {
			type: "output_text_delta",
			delta: delta.text,
			...(delta.item_id ? { item_id: delta.item_id } : {}),
		};
	}

	switch (event.type) {
		case "response.created":
			return isRecord(event.response) ? { type: "created" } : null;
		case "response.output_item.added":
			return responseItemEvent("output_item_added", event);
		case "response.output_item.done":
			return responseItemEvent("output_item_done", event);
		case "response.custom_tool_call_input.delta": {
			const deltaText = typeof event.delta === "string" ? event.delta : null;
			const itemId =
				typeof event.item_id === "string"
					? event.item_id
					: typeof event.call_id === "string"
						? event.call_id
						: null;
			if (!deltaText || !itemId) {
				return null;
			}
			return {
				type: "tool_call_input_delta",
				item_id: itemId,
				call_id: typeof event.call_id === "string" ? event.call_id : null,
				delta: deltaText,
			};
		}
		case "response.reasoning_summary_text.delta": {
			const deltaText = typeof event.delta === "string" ? event.delta : null;
			const summaryIndex = numberField(event.summary_index);
			return deltaText && summaryIndex !== null
				? {
						type: "reasoning_summary_delta",
						delta: deltaText,
						summary_index: summaryIndex,
					}
				: null;
		}
		case "response.reasoning_text.delta": {
			const deltaText = typeof event.delta === "string" ? event.delta : null;
			const contentIndex = numberField(event.content_index);
			return deltaText && contentIndex !== null
				? {
						type: "reasoning_content_delta",
						delta: deltaText,
						content_index: contentIndex,
					}
				: null;
		}
		case "response.reasoning_summary_part.added": {
			const summaryIndex = numberField(event.summary_index);
			return summaryIndex !== null
				? { type: "reasoning_summary_part_added", summary_index: summaryIndex }
				: null;
		}
		case "response.completed": {
			const completed = responseCompletedEvent(event);
			if (!completed) {
				throw ApiError.stream("failed to parse ResponseCompleted");
			}
			return { type: "completed", ...completed };
		}
		case "codex.rate_limits": {
			const rateLimits = parseRateLimitEventPayload(event);
			return rateLimits ? { type: "rate_limits", rate_limits: rateLimits } : null;
		}
		case "response.failed":
			throw apiErrorFromResponsesEvent(event);
		case "response.incomplete": {
			const reason = isRecord(event.response)
				? isRecord(event.response.incomplete_details) &&
					typeof event.response.incomplete_details.reason === "string"
					? event.response.incomplete_details.reason
					: "unknown"
				: "unknown";
			throw ApiError.stream(`Incomplete response returned, reason: ${reason}`);
		}
		case "error":
			throw ApiError.stream(responseErrorMessage(event));
		default:
			return null;
	}
}

function responseItemEvent(
	type: "output_item_added" | "output_item_done",
	event: Record<string, unknown>,
): ResponseEvent | null {
	if (!isRecord(event.item)) {
		return null;
	}
	const [item] = responseOutputItemsFromResponse({
		output: [event.item],
	});
	if (!item) {
		return null;
	}
	return type === "output_item_added"
		? { type: "output_item_added", item }
		: { type: "output_item_done", item };
}

async function* sseRecordsFromTextChunks(
	chunks: AsyncIterable<string>,
	options: { idle_timeout_ms?: number | null } = {},
): AsyncGenerator<Record<string, unknown>> {
	let buffer = "";
	const iterator = chunks[Symbol.asyncIterator]();

	for (;;) {
		const next = await nextWithOptionalTimeout(iterator, options.idle_timeout_ms);
		if (next.done) {
			break;
		}
		buffer += next.value;
		buffer = buffer.replace(/\r\n/g, "\n");
		let cursor = buffer.indexOf("\n\n");
		while (cursor !== -1) {
			const frame = buffer.slice(0, cursor);
			for (const event of sseEventsFromFrame(frame)) {
				yield event;
			}
			buffer = buffer.slice(cursor + 2);
			cursor = buffer.indexOf("\n\n");
		}
	}

	for (const event of sseEventsFromFrame(buffer)) {
		yield event;
	}
}

async function nextWithOptionalTimeout<T>(
	iterator: AsyncIterator<T>,
	idleTimeoutMs?: number | null,
): Promise<IteratorResult<T>> {
	if (!idleTimeoutMs || idleTimeoutMs <= 0) {
		return iterator.next();
	}
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			iterator.next(),
			new Promise<IteratorResult<T>>((_, reject) => {
				timeout = setTimeout(
					() => reject(ApiError.stream("idle timeout waiting for SSE")),
					idleTimeoutMs,
				);
			}),
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

function* sseEventsFromFrame(frame: string): Generator<Record<string, unknown>> {
	const data = frame
		.split(/\r?\n/)
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice("data:".length).trimStart())
		.join("\n")
		.trim();

	if (!data || data === "[DONE]") {
		return;
	}

	const parsed = JSON.parse(data);
	if (isRecord(parsed)) {
		yield parsed;
	}
}

function responseCompletedEvent(event: Record<string, unknown>): {
	response_id: string;
	token_usage?: TokenUsage | null;
	end_turn?: boolean | null;
} | null {
	const response = isRecord(event.response) ? event.response : null;
	const responseId =
		typeof response?.id === "string"
			? response.id
			: typeof event.response_id === "string"
				? event.response_id
				: "";
	return {
		response_id: responseId,
		token_usage: tokenUsageFromRecord(response?.usage),
		end_turn:
			typeof response?.end_turn === "boolean"
				? response.end_turn
				: typeof event.end_turn === "boolean"
					? event.end_turn
					: null,
	};
}

function tokenUsageFromRecord(value: unknown): TokenUsage | null {
	if (!isRecord(value)) {
		return null;
	}
	const inputTokens = numberField(value.input_tokens);
	const outputTokens = numberField(value.output_tokens);
	const totalTokens = numberField(value.total_tokens);
	if (inputTokens === null || outputTokens === null || totalTokens === null) {
		return null;
	}
	const inputDetails = isRecord(value.input_tokens_details)
		? value.input_tokens_details
		: null;
	const outputDetails = isRecord(value.output_tokens_details)
		? value.output_tokens_details
		: null;
	return {
		input_tokens: inputTokens,
		cached_input_tokens: numberField(inputDetails?.cached_tokens) ?? 0,
		output_tokens: outputTokens,
		reasoning_output_tokens: numberField(outputDetails?.reasoning_tokens) ?? 0,
		total_tokens: totalTokens,
	};
}

function responseModelFromEvent(event: Record<string, unknown>): string | null {
	const response = isRecord(event.response) ? event.response : null;
	return typeof response?.model === "string" ? response.model : null;
}

function modelVerificationsFromEvent(event: Record<string, unknown>): unknown[] | null {
	const response = isRecord(event.response) ? event.response : null;
	const value =
		Array.isArray(event.model_verifications)
			? event.model_verifications
			: Array.isArray(response?.model_verifications)
				? response.model_verifications
				: null;
	return value ? [...value] : null;
}

function responseErrorMessage(event: Record<string, unknown>): string {
	if (typeof event.message === "string") {
		return event.message;
	}
	if (isRecord(event.error) && typeof event.error.message === "string") {
		return event.error.message;
	}
	return "OpenAI Responses stream failed.";
}

function numberField(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
