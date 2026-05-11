import type { ResponseItem, ResponseItemWire } from "../../../core/src";
import { functionCallOutputPayloadToWire } from "../../../core/src";
import type {
	ResponseCreateWsRequest,
	ResponsesApiRequest,
	ResponsesWsRequest,
} from "../common";

export type ResponsesApiWireRequest = Omit<
	ResponsesApiRequest,
	| "input"
	| "instructions"
	| "service_tier"
	| "prompt_cache_key"
	| "text"
	| "client_metadata"
> & {
	instructions?: string;
	input: ResponseItemWire[];
	service_tier?: string;
	prompt_cache_key?: string;
	text?: unknown;
	client_metadata?: Record<string, string>;
	previous_response_id?: string;
	generate?: boolean;
};

export function serializeResponsesApiRequest(
	request: ResponsesApiRequest,
): ResponsesApiWireRequest {
	const wire: ResponsesApiWireRequest = {
		model: request.model,
		...(request.instructions ? { instructions: request.instructions } : {}),
		input: request.input.map(serializeResponseItemForResponsesApi),
		tools: request.tools,
		tool_choice: request.tool_choice,
		parallel_tool_calls: request.parallel_tool_calls,
		reasoning: request.reasoning,
		store: request.store,
		stream: request.stream,
		include: request.include,
	};

	if (request.service_tier) {
		wire.service_tier = request.service_tier;
	}
	if (request.prompt_cache_key) {
		wire.prompt_cache_key = request.prompt_cache_key;
	}
	if (request.text) {
		wire.text = request.text;
	}
	if (request.client_metadata) {
		wire.client_metadata = request.client_metadata;
	}

	return wire;
}

export function serializeResponseItemForResponsesApi(
	item: ResponseItem,
): ResponseItemWire {
	switch (item.type) {
		case "message":
			return responseItemWithSkippedId(item);
		case "reasoning":
			return responseItemWithSkippedId(item);
		case "local_shell_call":
			return responseItemWithSkippedId(item);
		case "function_call":
			return responseItemWithSkippedId(item);
		case "tool_search_call":
			return responseItemWithSkippedId(item);
		case "function_call_output":
			return {
				type: "function_call_output",
				call_id: item.call_id,
				output: functionCallOutputPayloadToWire(item.output),
			};
		case "custom_tool_call":
			return responseItemWithSkippedId(item);
		case "custom_tool_call_output":
			return {
				type: "custom_tool_call_output",
				call_id: item.call_id,
				...(item.name ? { name: item.name } : {}),
				output: functionCallOutputPayloadToWire(item.output),
			};
		case "web_search_call":
			return responseItemWithSkippedId(item);
		default:
			return item;
	}
}

export function attachItemIds(
	payloadJson: unknown,
	originalItems: ResponseItem[],
): void {
	if (!isRecord(payloadJson) || !Array.isArray(payloadJson.input)) {
		return;
	}

	for (const [index, value] of payloadJson.input.entries()) {
		const item = originalItems[index];
		const id = item ? responseItemSkippedId(item) : null;
		if (!id || !isRecord(value)) {
			continue;
		}
		value.id = id;
	}
}

export function serializeResponsesWsRequest(
	request: ResponsesWsRequest,
): Record<string, unknown> {
	if (request.type === "response.processed") {
		return {
			type: request.type,
			response_id: request.response_id,
		};
	}
	return {
		type: request.type,
		...serializeResponseCreateWsRequest(request),
	};
}

function serializeResponseCreateWsRequest(
	request: ResponseCreateWsRequest,
): Record<string, unknown> {
	const wire = serializeResponsesApiRequest({
		model: request.model,
		instructions: request.instructions,
		input: request.input,
		tools: request.tools,
		tool_choice: request.tool_choice,
		parallel_tool_calls: request.parallel_tool_calls,
		reasoning: request.reasoning,
		store: request.store,
		stream: request.stream,
		include: request.include,
		...(request.service_tier ? { service_tier: request.service_tier } : {}),
		...(request.prompt_cache_key ? { prompt_cache_key: request.prompt_cache_key } : {}),
		...(request.text !== undefined ? { text: request.text } : {}),
		...(request.client_metadata ? { client_metadata: request.client_metadata } : {}),
	});
	if (request.previous_response_id) {
		wire.previous_response_id = request.previous_response_id;
	}
	if (request.generate !== undefined) {
		wire.generate = request.generate;
	}
	return wire;
}

function responseItemSkippedId(item: ResponseItem): string | null {
	switch (item.type) {
		case "message":
		case "reasoning":
		case "local_shell_call":
		case "function_call":
		case "tool_search_call":
		case "custom_tool_call":
		case "web_search_call": {
			const id = (item as { id?: unknown }).id;
			return typeof id === "string" && id.length > 0 ? id : null;
		}
		default:
			return null;
	}
}

function responseItemWithSkippedId<T extends { id?: unknown }>(
	item: T,
): Omit<T, "id"> {
	const wire = { ...item };
	delete wire.id;
	return wire;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
