import { CODEX_CHATGPT_OAUTH_ORIGINATOR } from "./auth";
import {
	createModelProvider,
	createOpenAiModelProviderInfo,
	type ModelProvider,
	type ProviderRuntimeConfig,
} from "./model-provider";
import type { ResponseItem } from "./protocol";
import { create_tools_json_for_responses_api } from "./tools/tool_spec";
import type { TurnContext } from "./session/turn-context";
import type { ThreadId } from "./ids";
import type {
	Prompt,
	ResponseCreateWsRequest,
	ResponsesApiRequest,
	ResponseStream,
	TurnState,
} from "../../codex-api/src/common";
import {
	response_create_client_metadata,
	responseCreateWsRequestFromResponsesApiRequest,
} from "../../codex-api/src/common";
import {
	ResponsesClient,
	type ResponsesOptions,
} from "../../codex-api/src/endpoint/responses";
import {
	ResponsesWebsocketClient,
	type ResponsesWebsocketConnection,
} from "../../codex-api/src/endpoint/responses_websocket";
import { ApiError, isRetryableApiError } from "../../codex-api/src/error";

export { ResponsesClient } from "../../codex-api/src/endpoint/responses";
export type {
	ResponsesClientInput,
	ResponsesOptions,
} from "../../codex-api/src/endpoint/responses";
export {
	ResponsesWebsocketClient,
	ResponsesWebsocketConnection,
} from "../../codex-api/src/endpoint/responses_websocket";
export type { ResponsesWebsocketClientInput } from "../../codex-api/src/endpoint/responses_websocket";
export type {
	Prompt,
	ResponseCreateWsRequest,
	ResponseEvent,
	ResponseProcessedWsRequest,
	ResponsesApiRequest,
	ResponseStream,
	ResponsesWsRequest,
} from "../../codex-api/src/common";

export const OPENAI_BETA_HEADER = "OpenAI-Beta";
export const X_CODEX_INSTALLATION_ID_HEADER = "x-codex-installation-id";
export const X_CODEX_TURN_STATE_HEADER = "x-codex-turn-state";
export const X_CODEX_TURN_METADATA_HEADER = "x-codex-turn-metadata";
export const X_CODEX_PARENT_THREAD_ID_HEADER = "x-codex-parent-thread-id";
export const X_CODEX_WINDOW_ID_HEADER = "x-codex-window-id";
export const X_OPENAI_SUBAGENT_HEADER = "x-openai-subagent";
export const X_RESPONSESAPI_INCLUDE_TIMING_METRICS_HEADER =
	"x-responsesapi-include-timing-metrics";
export const RESPONSES_WEBSOCKETS_V2_BETA_HEADER_VALUE =
	"responses_websockets=2026-02-06";

export const CHATGPT_CODEX_RESPONSES_URL =
	"https://chatgpt.com/backend-api/codex/responses";
export const CODEX_USER_AGENT =
	`${CODEX_CHATGPT_OAUTH_ORIGINATOR}/0.128.0 (Mac OS 15.7.3; arm64) dumb`;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type CreateModelClientInput = {
	apiKey: string;
	baseUrl?: string;
	chatgptAccountId?: string | null;
	fedramp?: boolean;
	fetch?: FetchLike;
	provider?: ModelProvider;
	sessionId: string;
	threadId: ThreadId | string;
	installationId: string;
	includeTimingMetrics?: boolean;
	betaFeaturesHeader?: string | null;
};

export type ModelClientSessionHandle = {
	prewarm_websocket(
		prompt: Prompt,
		options?: {
			signal?: AbortSignal;
			turn?: TurnContext;
			turn_metadata_header?: string | null;
		},
	): Promise<void>;
	send_response_processed(response_id: string): Promise<void>;
	stream(
		prompt: Prompt,
		options?: {
			signal?: AbortSignal;
			turn?: TurnContext;
			turn_metadata_header?: string | null;
		},
	): Promise<ResponseStream>;
	release(): void;
};

export type ModelClient = {
	new_session(turn?: TurnContext): ModelClientSessionHandle;
	responses_websocket_enabled(): boolean;
	force_http_fallback(): boolean;
};

export function createModelClient(input: CreateModelClientInput): ModelClient {
	return new CodexModelClient(input);
}

type LastResponse = {
	response_id: string;
	items_added: ResponseItem[];
};

type WebsocketSession = {
	connection: ResponsesWebsocketConnection | null;
	last_request: ResponsesApiRequest | null;
	last_response: LastResponse | null;
	connection_reused: boolean;
};

function defaultWebsocketSession(): WebsocketSession {
	return {
		connection: null,
		last_request: null,
		last_response: null,
		connection_reused: false,
	};
}

class CodexModelClient implements ModelClient {
	private readonly provider: ModelProvider;
	private readonly runtime: ProviderRuntimeConfig;
	private readonly apiKey: string;
	private readonly chatgptAccountId: string | null;
	private readonly fedramp: boolean;
	private readonly fetcher?: FetchLike;
	private readonly sessionId: string;
	private readonly threadId: string;
	private readonly installationId: string;
	private readonly includeTimingMetrics: boolean;
	private readonly betaFeaturesHeader: string | null;
	private disableWebsockets = false;
	private windowGeneration = 0;
	private cachedWebsocketSession: WebsocketSession = defaultWebsocketSession();

	constructor(input: CreateModelClientInput) {
		this.provider =
			input.provider ??
			createModelProvider({
				info: createOpenAiModelProviderInfo(
					input.baseUrl && !input.baseUrl.endsWith("/responses")
						? input.baseUrl
						: null,
				),
			});
		this.runtime = {
			...this.provider.runtime_config(null),
			...(input.baseUrl?.endsWith("/responses")
				? {
						responses_url: input.baseUrl,
						base_url: input.baseUrl.replace(/\/responses\/?$/, ""),
					}
				: {}),
		};
		this.apiKey = input.apiKey;
		this.chatgptAccountId = input.chatgptAccountId?.trim() || null;
		this.fedramp = input.fedramp ?? false;
		this.fetcher = input.fetch;
		this.threadId = String(input.threadId);
		this.sessionId = input.sessionId;
		this.installationId = input.installationId;
		this.includeTimingMetrics = input.includeTimingMetrics ?? false;
		this.betaFeaturesHeader = input.betaFeaturesHeader ?? null;
	}

	new_session(turn?: TurnContext): ModelClientSession {
		return new ModelClientSession(this, turn, this.take_cached_websocket_session());
	}

	responses_websocket_enabled(): boolean {
		return (
			this.runtime.supports_websockets &&
			!this.disableWebsockets &&
			!!this.apiKey.trim()
		);
	}

	force_http_fallback(): boolean {
		const activated = this.responses_websocket_enabled();
		this.disableWebsockets = true;
		this.store_cached_websocket_session(defaultWebsocketSession());
		return activated;
	}

	set_window_generation(windowGeneration: number): void {
		this.windowGeneration = windowGeneration;
		this.store_cached_websocket_session(defaultWebsocketSession());
	}

	advance_window_generation(): void {
		this.windowGeneration += 1;
		this.store_cached_websocket_session(defaultWebsocketSession());
	}

	current_window_id(): string {
		return `${this.threadId}:${this.windowGeneration}`;
	}

	stream_max_retries(): number {
		return this.runtime.stream_max_retries;
	}

	websocket_connect_timeout_ms(): number {
		return this.runtime.websocket_connect_timeout_ms;
	}

	take_cached_websocket_session(): WebsocketSession {
		const session = this.cachedWebsocketSession;
		this.cachedWebsocketSession = defaultWebsocketSession();
		return session;
	}

	store_cached_websocket_session(websocketSession: WebsocketSession): void {
		this.cachedWebsocketSession = websocketSession;
	}

		build_responses_request(prompt: Prompt, turn: TurnContext): ResponsesApiRequest {
			const reasoning = turn.effort ? { effort: turn.effort } : null;
			const request: ResponsesApiRequest = {
				model: turn.model,
				instructions: prompt.base_instructions.text,
				input: prompt.input,
			tools: create_tools_json_for_responses_api(prompt.tools),
			tool_choice: "auto",
			parallel_tool_calls: prompt.parallel_tool_calls,
			reasoning,
				store: false,
				stream: true,
				include: reasoning ? ["reasoning.encrypted_content"] : [],
				prompt_cache_key: this.threadId,
				client_metadata: {
					[X_CODEX_INSTALLATION_ID_HEADER]: this.installationId,
				},
			};
			if (turn.service_tier) {
				request.service_tier = turn.service_tier;
			}
			return request;
		}

	build_responses_options(
		turn: TurnContext,
		turnState: TurnState,
		turnMetadataHeader?: string | null,
	): ResponsesOptions {
		return {
			session_id: this.sessionId,
			thread_id: this.threadId,
			session_source: turn.session_source,
			extra_headers: this.build_responses_headers(turn, turnState, turnMetadataHeader),
			turn_state: turnState,
		};
	}

	build_websocket_headers(
		turn: TurnContext,
		turnState: TurnState,
		turnMetadataHeader?: string | null,
	): Headers {
		const headers = this.build_responses_headers(
			turn,
			turnState,
			turnMetadataHeader,
		);
		headers.set("x-client-request-id", this.threadId);
		headers.set("session_id", this.sessionId);
		headers.set(OPENAI_BETA_HEADER, RESPONSES_WEBSOCKETS_V2_BETA_HEADER_VALUE);
		if (this.includeTimingMetrics) {
			headers.set(X_RESPONSESAPI_INCLUDE_TIMING_METRICS_HEADER, "true");
		}
		return headers;
	}

	build_ws_client_metadata(
		turn: TurnContext,
		turnMetadataHeader?: string | null,
	): Record<string, string> {
		const metadata: Record<string, string> = {
			[X_CODEX_INSTALLATION_ID_HEADER]: this.installationId,
			[X_CODEX_WINDOW_ID_HEADER]: this.current_window_id(),
		};
		const subagent = subagent_header_value(turn.session_source);
		if (subagent) {
			metadata[X_OPENAI_SUBAGENT_HEADER] = subagent;
		}
		const parentThreadId = parent_thread_id_header_value(turn.session_source);
		if (parentThreadId) {
			metadata[X_CODEX_PARENT_THREAD_ID_HEADER] = parentThreadId;
		}
		if (turnMetadataHeader) {
			metadata[X_CODEX_TURN_METADATA_HEADER] = turnMetadataHeader;
		}
		return metadata;
	}

	new_responses_client(): ResponsesClient {
		return new ResponsesClient({
			api_key: this.apiKey,
			runtime: this.runtime,
			originator: CODEX_CHATGPT_OAUTH_ORIGINATOR,
			user_agent: CODEX_USER_AGENT,
			chatgpt_account_id: this.chatgptAccountId,
			fedramp: this.fedramp,
			fetch: this.fetcher,
		});
	}

	new_responses_websocket_client(): ResponsesWebsocketClient {
		return new ResponsesWebsocketClient({
			api_key: this.apiKey,
			runtime: this.runtime,
			originator: CODEX_CHATGPT_OAUTH_ORIGINATOR,
			user_agent: CODEX_USER_AGENT,
			chatgpt_account_id: this.chatgptAccountId,
			fedramp: this.fedramp,
			fetch: this.fetcher,
		});
	}

	private build_responses_headers(
		turn: TurnContext,
		turnState: TurnState,
		turnMetadataHeader?: string | null,
	): Headers {
		const headers = new Headers();
		if (this.betaFeaturesHeader) {
			headers.set("x-codex-beta-features", this.betaFeaturesHeader);
		}
		const state = turnState.get();
		if (state) {
			headers.set(X_CODEX_TURN_STATE_HEADER, state);
		}
		if (turnMetadataHeader) {
			headers.set(X_CODEX_TURN_METADATA_HEADER, turnMetadataHeader);
		}
		const subagent = subagent_header_value(turn.session_source);
		if (subagent) {
			headers.set(X_OPENAI_SUBAGENT_HEADER, subagent);
		}
		const parentThreadId = parent_thread_id_header_value(turn.session_source);
		if (parentThreadId) {
			headers.set(X_CODEX_PARENT_THREAD_ID_HEADER, parentThreadId);
		}
		headers.set(X_CODEX_WINDOW_ID_HEADER, this.current_window_id());
		return headers;
	}
}

export class ModelClientSession {
	private readonly turnState = new StickyTurnState();
	private released = false;

	constructor(
		private readonly client: CodexModelClient,
		private readonly turn?: TurnContext,
		private websocketSession: WebsocketSession = defaultWebsocketSession(),
	) {}

	async prewarm_websocket(
		prompt: Prompt,
		options: {
			signal?: AbortSignal;
			turn?: TurnContext;
			turn_metadata_header?: string | null;
		} = {},
	): Promise<void> {
		if (!this.client.responses_websocket_enabled()) {
			return;
		}
		if (this.websocketSession.last_request) {
			return;
		}
		const turn = options.turn ?? this.turn;
		if (!turn) {
			throw new Error("ModelClientSession requires a TurnContext.");
		}
		try {
			const stream = await this.stream_responses_websocket(prompt, turn, {
				...options,
				warmup: true,
			});
			if (stream === "fallback_to_http") {
				this.try_switch_fallback_transport();
				return;
			}
			for await (const event of stream) {
				if (options.signal?.aborted || event.type === "completed") {
					break;
				}
			}
		} catch (error) {
			if (isRetryableApiError(apiErrorFromUnknown(error))) {
				this.try_switch_fallback_transport();
				return;
			}
			throw error;
		}
	}

	async send_response_processed(response_id: string): Promise<void> {
		if (!this.websocketSession.connection) {
			return;
		}
		try {
			await this.websocketSession.connection.send_response_processed(response_id);
		} catch {
			// Codex treats response.processed as best effort.
		}
	}

	async stream(
		prompt: Prompt,
		options: {
			signal?: AbortSignal;
			turn?: TurnContext;
			turn_metadata_header?: string | null;
		} = {},
	): Promise<ResponseStream> {
			const turn = options.turn ?? this.turn;
			if (!turn) {
				throw new Error("ModelClientSession requires a TurnContext.");
		}
		if (this.client.responses_websocket_enabled()) {
			const stream = await this.stream_responses_websocket(prompt, turn, options);
			if (stream !== "fallback_to_http") {
				return stream;
			}
			this.try_switch_fallback_transport();
		}
		return this.stream_responses_api(prompt, turn, options);
	}

	release(): void {
		if (this.released) {
			return;
			}
			this.released = true;
			this.client.store_cached_websocket_session(this.websocketSession);
		}

	private async stream_responses_api(
		prompt: Prompt,
		turn: TurnContext,
		options: { signal?: AbortSignal; turn_metadata_header?: string | null },
	): Promise<ResponseStream> {
		const client = this.codex_client();
		const request = client.build_responses_request(prompt, turn);
		const responsesOptions = client.build_responses_options(
			turn,
			this.turnState,
			options.turn_metadata_header,
		);
		return client
			.new_responses_client()
			.stream_request(request, { ...responsesOptions, signal: options.signal });
	}

	private async stream_responses_websocket(
		prompt: Prompt,
		turn: TurnContext,
		options: {
			signal?: AbortSignal;
			turn_metadata_header?: string | null;
			warmup?: boolean;
		},
	): Promise<ResponseStream | "fallback_to_http"> {
		const client = this.codex_client();
		const request = client.build_responses_request(prompt, turn);
		const wsPayload = responseCreateWsRequestFromResponsesApiRequest(request);
		wsPayload.client_metadata = response_create_client_metadata(
			client.build_ws_client_metadata(turn, options.turn_metadata_header),
			turn.trace_id ? { traceparent: turn.trace_id } : null,
		);
		if (options.warmup) {
			wsPayload.generate = false;
		}

		const maxAttempts = Math.max(
			1,
			client.stream_max_retries() + 1,
		);
		for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
			if (options.signal?.aborted) {
				throw ApiError.transport("OpenAI Responses websocket was aborted.");
			}
			try {
				const connection = await this.websocket_connection(
					turn,
					options.turn_metadata_header,
				);
				const wsRequest = this.prepare_websocket_request(wsPayload, request);
				this.websocketSession.last_request = request;
				const stream = await connection.stream_request(
					{ type: "response.create", ...wsRequest },
					this.websocketSession.connection_reused,
				);
				return trackLastResponse(stream, (lastResponse) => {
					this.websocketSession.last_response = lastResponse;
				});
			} catch (error) {
				const apiError = apiErrorFromUnknown(error);
				if (apiError.status === 426) {
					return "fallback_to_http";
				}
				this.reset_websocket_session();
				if (
					attempt + 1 < maxAttempts &&
					isRetryableApiError(apiError) &&
					!options.signal?.aborted
				) {
					continue;
				}
				return "fallback_to_http";
			}
		}
		return "fallback_to_http";
	}

	private async websocket_connection(
		turn: TurnContext,
		turnMetadataHeader?: string | null,
	): Promise<ResponsesWebsocketConnection> {
		const client = this.codex_client();
		const needsNew =
			!this.websocketSession.connection ||
			(await this.websocketSession.connection.is_closed());
		if (!needsNew) {
			this.websocketSession.connection_reused = true;
			return this.websocketSession.connection as ResponsesWebsocketConnection;
		}

		this.websocketSession.last_request = null;
		this.websocketSession.last_response = null;
		const timeoutMs = client.websocket_connect_timeout_ms();
		const connection = await withTimeout<ResponsesWebsocketConnection>(
			client.new_responses_websocket_client().connect(
				client.build_websocket_headers(
					turn,
					this.turnState,
					turnMetadataHeader,
				),
				defaultHeaders(),
				this.turnState,
			),
			timeoutMs,
			"timeout connecting to websocket",
		);
		this.websocketSession.connection = connection;
		this.websocketSession.connection_reused = false;
		return connection;
	}

	private codex_client(): CodexModelClient {
			return this.client;
		}

	private prepare_websocket_request(
		payload: ResponseCreateWsRequest,
		request: ResponsesApiRequest,
	): ResponseCreateWsRequest {
		const lastResponse = this.websocketSession.last_response;
		const incrementalItems = lastResponse
			? this.get_incremental_items(request, lastResponse, true)
			: null;
		if (!lastResponse || !incrementalItems || !lastResponse.response_id) {
			return payload;
		}
		return {
			...payload,
			previous_response_id: lastResponse.response_id,
			input: incrementalItems,
		};
	}

	private get_incremental_items(
		request: ResponsesApiRequest,
		lastResponse: LastResponse,
		allowEmptyDelta: boolean,
	): ResponseItem[] | null {
		const previousRequest = this.websocketSession.last_request;
		if (!previousRequest) {
			return null;
		}
		const previousWithoutInput = { ...previousRequest, input: [] };
		const requestWithoutInput = { ...request, input: [] };
		if (JSON.stringify(previousWithoutInput) !== JSON.stringify(requestWithoutInput)) {
			return null;
		}
		const baseline = [...previousRequest.input, ...lastResponse.items_added];
		if (
			startsWithResponseItems(request.input, baseline) &&
			(allowEmptyDelta || baseline.length < request.input.length)
		) {
			return request.input.slice(baseline.length);
		}
		return null;
	}

	private reset_websocket_session(): void {
		this.websocketSession.connection?.close();
		this.websocketSession = defaultWebsocketSession();
	}

	private try_switch_fallback_transport(): boolean {
		const activated = this.client.force_http_fallback();
		this.reset_websocket_session();
		return activated;
	}
}

class StickyTurnState implements TurnState {
	private value: string | null = null;

	get(): string | null {
		return this.value;
	}

	set(value: string): void {
		if (!this.value && value) {
			this.value = value;
		}
	}
}

function trackLastResponse(
	stream: ResponseStream,
	onLastResponse: (lastResponse: LastResponse) => void,
): ResponseStream {
	return {
		upstream_request_id: stream.upstream_request_id,
		async *[Symbol.asyncIterator]() {
			const itemsAdded: ResponseItem[] = [];
			for await (const event of stream) {
				if (event.type === "output_item_done") {
					itemsAdded.push(event.item);
				}
				if (event.type === "completed") {
					onLastResponse({
						response_id: event.response_id,
						items_added: [...itemsAdded],
					});
				}
				yield event;
			}
		},
	};
}

function startsWithResponseItems(
	items: ResponseItem[],
	prefix: ResponseItem[],
): boolean {
	if (prefix.length > items.length) {
		return false;
	}
	return prefix.every((item, index) => JSON.stringify(item) === JSON.stringify(items[index]));
}

async function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	message: string,
): Promise<T> {
	if (!timeoutMs || timeoutMs <= 0) {
		return promise;
	}
	let timeout: ReturnType<typeof setTimeout> | null = null;
	try {
		return await Promise.race([
			promise,
			new Promise<T>((_, reject) => {
				timeout = setTimeout(() => reject(ApiError.transport(message)), timeoutMs);
			}),
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

function defaultHeaders(): Headers {
	return new Headers();
}

function apiErrorFromUnknown(error: unknown): ApiError {
	if (error instanceof ApiError) {
		return error;
	}
	if (error instanceof Error) {
		return ApiError.transport(error.message);
	}
	return ApiError.transport(String(error));
}

function subagent_header_value(sessionSource: unknown): string | null {
	if (!isRecord(sessionSource)) {
		return null;
	}
	if (sessionSource.type === "SubAgent" && typeof sessionSource.kind === "string") {
		return sessionSource.kind;
	}
	if (typeof sessionSource.type === "string" && sessionSource.type.includes("Memory")) {
		return "memory_consolidation";
	}
	return null;
}

function parent_thread_id_header_value(sessionSource: unknown): string | null {
	if (!isRecord(sessionSource)) {
		return null;
	}
	const parentThreadId = sessionSource.parent_thread_id ?? sessionSource.parentThreadId;
	return typeof parentThreadId === "string" ? parentThreadId : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
