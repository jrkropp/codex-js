import type {
	BaseInstructions,
	RateLimitSnapshot,
	ResponseItem,
	ToolSpec,
	TokenUsage,
} from "../../core/src";

export const WS_REQUEST_HEADER_TRACEPARENT_CLIENT_METADATA_KEY =
	"ws_request_header_traceparent";
export const WS_REQUEST_HEADER_TRACESTATE_CLIENT_METADATA_KEY =
	"ws_request_header_tracestate";

export type Prompt = {
	input: ResponseItem[];
	tools: ToolSpec[];
	parallel_tool_calls: boolean;
	base_instructions: BaseInstructions;
};

export type ResponseEvent =
	| {
			type: "created";
	  }
	| {
			type: "output_text_delta";
			item_id?: string;
			delta: string;
	  }
	| {
			type: "tool_call_input_delta";
			item_id: string;
			call_id?: string | null;
			delta: string;
	  }
	| {
			type: "reasoning_summary_delta";
			delta: string;
			summary_index: number;
	  }
	| {
			type: "reasoning_content_delta";
			delta: string;
			content_index: number;
	  }
	| {
			type: "reasoning_summary_part_added";
			summary_index: number;
	  }
	| {
			type: "output_item_added";
			item: ResponseItem;
	  }
	| {
			type: "output_item_done";
			item: ResponseItem;
	  }
	| {
			type: "server_model";
			model: string;
	  }
	| {
			type: "model_verifications";
			model_verifications: unknown[];
	  }
	| {
			type: "server_reasoning_included";
			reasoning_included: boolean;
	  }
	| {
			type: "completed";
			response_id: string;
			token_usage?: TokenUsage | null;
			end_turn?: boolean | null;
	  }
	| {
			type: "rate_limits";
			rate_limits: RateLimitSnapshot;
	  }
	| {
			type: "models_etag";
			etag: string;
	  };

export type ResponseStream = AsyncIterable<ResponseEvent> & {
	upstream_request_id?: string | null;
};

export type TurnState = {
	get(): string | null;
	set(value: string): void;
};

export type ResponsesApiRequest = {
	model: string;
	instructions: string;
	input: ResponseItem[];
	tools: unknown[];
	tool_choice: string;
	parallel_tool_calls: boolean;
	reasoning: unknown | null;
	store: boolean;
	stream: true;
	include: string[];
	service_tier?: string;
	prompt_cache_key?: string;
	text?: unknown;
	client_metadata?: Record<string, string>;
};

export type ResponseCreateWsRequest = Omit<ResponsesApiRequest, "stream"> & {
	stream: true;
	previous_response_id?: string;
	generate?: boolean;
};

export type ResponseProcessedWsRequest = {
	response_id: string;
};

export type ResponsesWsRequest =
	| ({ type: "response.create" } & ResponseCreateWsRequest)
	| ({ type: "response.processed" } & ResponseProcessedWsRequest);

export type W3cTraceContext = {
	traceparent?: string | null;
	tracestate?: string | null;
};

export function responseCreateWsRequestFromResponsesApiRequest(
	request: ResponsesApiRequest,
): ResponseCreateWsRequest {
	const response: ResponseCreateWsRequest = {
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
	};
	if (request.service_tier) {
		response.service_tier = request.service_tier;
	}
	if (request.prompt_cache_key) {
		response.prompt_cache_key = request.prompt_cache_key;
	}
	if (request.text !== undefined) {
		response.text = request.text;
	}
	if (request.client_metadata) {
		response.client_metadata = request.client_metadata;
	}
	return response;
}

export function response_create_client_metadata(
	client_metadata: Record<string, string> | null | undefined,
	trace?: W3cTraceContext | null,
): Record<string, string> | undefined {
	const metadata = { ...(client_metadata ?? {}) };
	if (trace?.traceparent) {
		metadata[WS_REQUEST_HEADER_TRACEPARENT_CLIENT_METADATA_KEY] = trace.traceparent;
	}
	if (trace?.tracestate) {
		metadata[WS_REQUEST_HEADER_TRACESTATE_CLIENT_METADATA_KEY] = trace.tracestate;
	}
	return Object.keys(metadata).length > 0 ? metadata : undefined;
}
