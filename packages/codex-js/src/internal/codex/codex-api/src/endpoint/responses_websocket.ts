import type { ProviderRuntimeConfig } from "../../../core/src";
import type {
	ResponseEvent,
	ResponseStream,
	ResponsesWsRequest,
	TurnState,
} from "../common";
import { ApiError } from "../error";
import { providerWebsocketHeaders, websocketUrlForPath } from "../provider";
import { serializeResponsesWsRequest } from "../requests/responses";
import { responseEventsFromSseTextChunks } from "../sse/responses";

const X_CODEX_TURN_STATE_HEADER = "x-codex-turn-state";
const X_MODELS_ETAG_HEADER = "x-models-etag";
const X_REASONING_INCLUDED_HEADER = "x-reasoning-included";
const OPENAI_MODEL_HEADER = "openai-model";
const WEBSOCKET_CONNECTION_LIMIT_REACHED_CODE =
	"websocket_connection_limit_reached";
const WEBSOCKET_CONNECTION_LIMIT_REACHED_MESSAGE =
	"Responses websocket connection limit reached (60 minutes). Create a new websocket connection to continue.";

type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;
type WorkerWebSocket = WebSocket & {
	accept?: (options?: unknown) => void;
	binaryType?: "arraybuffer" | "blob";
};
type WebSocketUpgradeResponse = Response & {
	webSocket?: WorkerWebSocket | null;
};

export type ResponsesWebsocketClientInput = {
	api_key: string;
	runtime: ProviderRuntimeConfig;
	originator: string;
	user_agent: string;
	chatgpt_account_id?: string | null;
	fedramp?: boolean;
	fetch?: FetchLike;
};

export class WsStream {
	private readonly queued: Array<MessageEvent | CloseEvent | ErrorEvent> = [];
	private readonly waiters: Array<{
		resolve: (event: MessageEvent | CloseEvent | ErrorEvent) => void;
		reject: (error: Error) => void;
	}> = [];
	private closed = false;

	constructor(private readonly socket: WorkerWebSocket) {
		this.socket.binaryType = "arraybuffer";
		this.socket.addEventListener("message", (event) => this.push(event));
		this.socket.addEventListener("close", (event) => {
			this.closed = true;
			this.push(event);
		});
		this.socket.addEventListener("error", (event) => {
			this.closed = true;
			this.push(event as ErrorEvent);
		});
		this.socket.accept?.();
	}

	is_closed(): boolean {
		return this.closed || this.socket.readyState === 3;
	}

	send(message: string): void {
		if (this.is_closed()) {
			throw ApiError.stream("websocket connection is closed");
		}
		this.socket.send(message);
	}

	close(): void {
		this.closed = true;
		try {
			this.socket.close();
		} catch {
			// Closing an already-closed Worker WebSocket may throw in some test shims.
		}
	}

	async next(
		timeoutMs?: number | null,
	): Promise<MessageEvent | CloseEvent | ErrorEvent> {
		const queued = this.queued.shift();
		if (queued) {
			return queued;
		}
		if (this.closed) {
			return closeLikeEvent();
		}

		let timeout: ReturnType<typeof setTimeout> | null = null;
		try {
			return await Promise.race([
				new Promise<MessageEvent | CloseEvent | ErrorEvent>(
					(resolve, reject) => {
						this.waiters.push({ resolve, reject });
					},
				),
				new Promise<MessageEvent | CloseEvent | ErrorEvent>((_, reject) => {
					if (timeoutMs && timeoutMs > 0) {
						timeout = setTimeout(
							() =>
								reject(ApiError.stream("idle timeout waiting for websocket")),
							timeoutMs,
						);
					}
				}),
			]);
		} finally {
			if (timeout) {
				clearTimeout(timeout);
			}
		}
	}

	private push(event: MessageEvent | CloseEvent | ErrorEvent): void {
		const waiter = this.waiters.shift();
		if (waiter) {
			waiter.resolve(event);
			return;
		}
		this.queued.push(event);
	}
}

export class ResponsesWebsocketConnection {
	private lock: Promise<void> = Promise.resolve();
	private streamClosed = false;

	constructor(
		private readonly input: {
			stream: WsStream;
			idle_timeout_ms?: number | null;
			server_reasoning_included?: boolean;
			models_etag?: string | null;
			server_model?: string | null;
		},
	) {}

	async is_closed(): Promise<boolean> {
		return this.streamClosed || this.input.stream.is_closed();
	}

	async send_response_processed(response_id: string): Promise<void> {
		await this.withExclusiveStream(async () => {
			sendWebsocketRequest(
				this.input.stream,
				{ type: "response.processed", response_id },
				this.input.idle_timeout_ms,
			);
		});
	}

	async stream_request(
		request: ResponsesWsRequest,
		connection_reused: boolean,
	): Promise<ResponseStream> {
		const connection = this;
		const stream = new WebsocketResponseStream(async function* () {
			yield* connection.initialEvents();
			yield* await connection.withExclusiveStream(async function* () {
				sendWebsocketRequest(
					connection.input.stream,
					request,
					connection.input.idle_timeout_ms,
					connection_reused,
				);
				yield* connection.runWebsocketResponseStream();
			});
		});
		return stream;
	}

	close(): void {
		this.streamClosed = true;
		this.input.stream.close();
	}

	private async *initialEvents(): AsyncGenerator<ResponseEvent> {
		if (this.input.server_model) {
			yield { type: "server_model", model: this.input.server_model };
		}
		if (this.input.models_etag) {
			yield { type: "models_etag", etag: this.input.models_etag };
		}
		if (this.input.server_reasoning_included) {
			yield { type: "server_reasoning_included", reasoning_included: true };
		}
	}

	private async *runWebsocketResponseStream(): AsyncGenerator<ResponseEvent> {
		for (;;) {
			const event = await this.input.stream.next(this.input.idle_timeout_ms);
			if (isCloseEvent(event)) {
				this.streamClosed = true;
				throw ApiError.stream(
					"websocket closed by server before response.completed",
				);
			}
			if (isErrorEvent(event)) {
				this.streamClosed = true;
				throw ApiError.stream("websocket error before response.completed");
			}
			const data = (event as MessageEvent).data;
			if (typeof data !== "string") {
				throw ApiError.stream("unexpected binary websocket event");
			}
			const wrappedError = mapWrappedWebsocketErrorEvent(data);
			if (wrappedError) {
				throw wrappedError;
			}
			let completed = false;
			for await (const responseEvent of responseEventsFromWebsocketText(data)) {
				if (responseEvent.type === "completed") {
					completed = true;
				}
				yield responseEvent;
			}
			if (completed) {
				return;
			}
		}
	}

	private async withExclusiveStream<T>(
		work: () => T | Promise<T>,
	): Promise<Awaited<T>>;
	private async withExclusiveStream<T>(
		work: () => AsyncIterable<T>,
	): Promise<AsyncIterable<T>>;
	private async withExclusiveStream<T>(
		work: () => T | Promise<T> | AsyncIterable<T>,
	): Promise<Awaited<T> | AsyncIterable<T>> {
		const previous = this.lock;
		let release!: () => void;
		this.lock = new Promise<void>((resolve) => {
			release = resolve;
		});
		await previous;

		const result = work();
		if (isAsyncIterable(result)) {
			const releaseWhenDone = release;
			return (async function* () {
				try {
					yield* result;
				} finally {
					releaseWhenDone();
				}
			})();
		}
		try {
			return await result;
		} finally {
			release();
		}
	}
}

export class ResponsesWebsocketClient {
	private readonly fetcher: FetchLike;

	constructor(private readonly input: ResponsesWebsocketClientInput) {
		this.fetcher = input.fetch ?? ((request, init) => fetch(request, init));
	}

	async connect(
		extra_headers: HeadersInit = {},
		default_headers: HeadersInit = {},
		turn_state?: TurnState | null,
	): Promise<ResponsesWebsocketConnection> {
		const url = websocketUrlForPath(this.input.runtime, "responses");
		const headers = providerWebsocketHeaders({
			api_key: this.input.api_key,
			runtime: this.input.runtime,
			originator: this.input.originator,
			user_agent: this.input.user_agent,
			chatgpt_account_id: this.input.chatgpt_account_id ?? null,
			fedramp: this.input.fedramp ?? false,
			extra_headers,
			default_headers,
		});

		const response = (await this.fetcher(url, {
			headers,
		})) as WebSocketUpgradeResponse;
		if (!response.webSocket) {
			if (!response.ok) {
				throw await apiErrorFromWebsocketHandshake(response);
			}
			throw ApiError.stream("server did not accept websocket");
		}

		const turnStateValue = response.headers.get(X_CODEX_TURN_STATE_HEADER);
		if (turnStateValue) {
			turn_state?.set(turnStateValue);
		}

		return new ResponsesWebsocketConnection({
			stream: new WsStream(response.webSocket),
			idle_timeout_ms: this.input.runtime.stream_idle_timeout_ms,
			server_reasoning_included: response.headers.has(
				X_REASONING_INCLUDED_HEADER,
			),
			models_etag: response.headers.get(X_MODELS_ETAG_HEADER),
			server_model: response.headers.get(OPENAI_MODEL_HEADER),
		});
	}
}

class WebsocketResponseStream implements ResponseStream {
	readonly upstream_request_id = null;

	constructor(private readonly iterator: () => AsyncGenerator<ResponseEvent>) {}

	[Symbol.asyncIterator](): AsyncIterator<ResponseEvent> {
		return this.iterator();
	}
}

async function apiErrorFromWebsocketHandshake(
	response: Response,
): Promise<ApiError> {
	const body = await response.text().catch(() => "");
	return ApiError.api(
		response.status,
		body || `OpenAI Responses websocket failed with HTTP ${response.status}.`,
	);
}

function sendWebsocketRequest(
	stream: WsStream,
	request: ResponsesWsRequest,
	_idleTimeoutMs?: number | null,
	_connectionReused = false,
): void {
	stream.send(JSON.stringify(serializeResponsesWsRequest(request)));
}

async function* responseEventsFromWebsocketText(
	text: string,
): AsyncGenerator<ResponseEvent> {
	yield* responseEventsFromSseTextChunks(singleSseFrame(text), {
		require_completed: false,
	});
}

async function* singleSseFrame(text: string): AsyncGenerator<string> {
	yield `data: ${text}\n\n`;
}

function mapWrappedWebsocketErrorEvent(payload: string): ApiError | null {
	const event = parseWrappedWebsocketErrorEvent(payload);
	if (!event) {
		return null;
	}
	const code = event.error?.code;
	if (code === WEBSOCKET_CONNECTION_LIMIT_REACHED_CODE) {
		return ApiError.retryable(
			event.error?.message || WEBSOCKET_CONNECTION_LIMIT_REACHED_MESSAGE,
		);
	}
	if (typeof event.status === "number" && event.status >= 400) {
		return ApiError.api(
			event.status,
			event.error?.message ||
				`OpenAI Responses websocket error ${event.status}.`,
		);
	}
	return null;
}

function parseWrappedWebsocketErrorEvent(payload: string): {
	type?: unknown;
	status?: number;
	error?: { code?: string | null; message?: string | null };
} | null {
	try {
		const parsed = JSON.parse(payload);
		if (!isRecord(parsed) || parsed.type !== "error") {
			return null;
		}
		const error = isRecord(parsed.error) ? parsed.error : {};
		return {
			type: parsed.type,
			status:
				typeof parsed.status === "number"
					? parsed.status
					: typeof parsed.status_code === "number"
						? parsed.status_code
						: undefined,
			error: {
				code: typeof error.code === "string" ? error.code : null,
				message: typeof error.message === "string" ? error.message : null,
			},
		};
	} catch {
		return null;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function closeLikeEvent(): CloseEvent {
	if (typeof CloseEvent !== "undefined") {
		return new CloseEvent("close", {
			code: 1006,
			reason: "websocket closed",
		});
	}
	return {
		type: "close",
		code: 1006,
		reason: "websocket closed",
	} as CloseEvent;
}

function isCloseEvent(
	event: MessageEvent | CloseEvent | ErrorEvent,
): event is CloseEvent {
	return event.type === "close";
}

function isErrorEvent(
	event: MessageEvent | CloseEvent | ErrorEvent,
): event is ErrorEvent {
	return event.type === "error";
}

function isAsyncIterable<T>(value: unknown): value is AsyncIterable<T> {
	return (
		typeof value === "object" && value !== null && Symbol.asyncIterator in value
	);
}
