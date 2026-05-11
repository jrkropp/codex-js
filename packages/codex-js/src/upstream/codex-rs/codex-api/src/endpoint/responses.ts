import type { ProviderRuntimeConfig, SessionSource } from "../../../core/src";
import type { ResponsesApiRequest, ResponseStream, TurnState } from "../common";
import {
	ApiError,
	apiErrorFromResponsePayload,
	apiErrorFromUnknown,
	htmlChallengeApiError,
	isRetryableApiError,
} from "../error";
import { providerRequestHeaders, responsesUrlWithQuery } from "../provider";
import { serializeResponsesApiRequest } from "../requests/responses";
import { spawnResponseStream } from "../sse/responses";

export type Compression = "none" | "zstd";

export type ResponsesOptions = {
	signal?: AbortSignal;
	thread_id?: string | null;
	session_id?: string | null;
	session_source?: SessionSource | string | null;
	extra_headers?: HeadersInit;
	compression?: Compression;
	turn_state?: TurnState | null;
};

export type ResponsesClientInput = {
	api_key: string;
	runtime: ProviderRuntimeConfig;
	originator: string;
	user_agent: string;
	chatgpt_account_id?: string | null;
	fedramp?: boolean;
	fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
};

export class ResponsesClient {
	private readonly fetcher: (
		input: RequestInfo | URL,
		init?: RequestInit,
	) => Promise<Response>;

	constructor(private readonly input: ResponsesClientInput) {
		const providedFetch = input.fetch;
		this.fetcher = providedFetch
			? (request, init) => providedFetch(request, init)
			: (request, init) => fetch(request, init);
	}

	async stream_request(
		request: ResponsesApiRequest,
		options: ResponsesOptions = {},
	): Promise<ResponseStream> {
		const body = JSON.stringify(serializeResponsesApiRequest(request));
		const headers = providerRequestHeaders({
			api_key: this.input.api_key,
			runtime: this.input.runtime,
			originator: this.input.originator,
			user_agent: this.input.user_agent,
			chatgpt_account_id: this.input.chatgpt_account_id ?? null,
			fedramp: this.input.fedramp ?? false,
			extra_headers: {
				...Object.fromEntries(new Headers(options.extra_headers).entries()),
				...sessionHeaders(options),
				...turnStateHeaders(options),
			},
		});
		const url = responsesUrlWithQuery(this.input.runtime);
		const maxRetries = Math.max(0, this.input.runtime.request_max_retries ?? 0);
		let lastError: ApiError | null = null;

		for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
			if (options.signal?.aborted) {
				throw ApiError.transport("OpenAI Responses request was aborted.");
			}
			try {
				const response = await this.fetcher(url, {
					method: "POST",
					headers,
					body,
					signal: options.signal,
				});
				if (!response.ok) {
					const error = await apiErrorFromHttpResponse(response);
					if (attempt < maxRetries && isRetryableApiError(error)) {
						lastError = error;
						continue;
					}
					throw error;
				}
				if (isHtmlResponse(response)) {
					throw htmlChallengeApiError();
				}
				if (!response.body) {
					throw ApiError.stream("OpenAI Responses stream did not include a body.");
				}
				const turnState = response.headers.get("x-codex-turn-state");
				if (turnState) {
					options.turn_state?.set(turnState);
				}
				return spawnResponseStream({
					headers: response.headers,
					chunks: readableStreamTextChunks(response.body),
					idle_timeout_ms: this.input.runtime.stream_idle_timeout_ms,
					require_completed: true,
				});
			} catch (error) {
				const apiError = apiErrorFromUnknown(error);
				if (
					attempt < maxRetries &&
					isRetryableApiError(apiError) &&
					!options.signal?.aborted
				) {
					lastError = apiError;
					continue;
				}
				throw apiError;
			}
		}

		throw lastError ?? ApiError.transport("OpenAI Responses request failed.");
	}

	async streamRequest(
		request: ResponsesApiRequest,
		options: ResponsesOptions = {},
	): Promise<ResponseStream> {
		return this.stream_request(request, options);
	}
}

async function apiErrorFromHttpResponse(response: Response): Promise<ApiError> {
	const body = await response.text();
	if (!body) {
		return ApiError.api(
			response.status,
			`OpenAI Responses request failed with HTTP ${response.status}.`,
		);
	}
	if (isHtmlBody(response, body)) {
		return htmlChallengeApiError();
	}
	try {
		return apiErrorFromResponsePayload(response.status, JSON.parse(body));
	} catch {
		return ApiError.api(response.status, body);
	}
}

function sessionHeaders(options: ResponsesOptions): Record<string, string> {
	const headers: Record<string, string> = {};
	if (options.thread_id) {
		headers["x-client-request-id"] = options.thread_id;
	}
	if (options.session_id) {
		headers.session_id = options.session_id;
	}
	if (options.session_source) {
		headers["x-openai-subagent"] = String(options.session_source);
	}
	return headers;
}

function turnStateHeaders(options: ResponsesOptions): Record<string, string> {
	const value = options.turn_state?.get();
	return value ? { "x-codex-turn-state": value } : {};
}

function isHtmlResponse(response: Response): boolean {
	return (response.headers.get("content-type") ?? "").includes("text/html");
}

function isHtmlBody(response: Response, body: string): boolean {
	return (
		isHtmlResponse(response) ||
		/^\s*<!doctype html|^\s*<html[\s>]/iu.test(body)
	);
}

async function* readableStreamTextChunks(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();

	for (;;) {
		const { done, value } = await reader.read();
		if (value) {
			yield decoder.decode(value, { stream: !done });
		}
		if (done) {
			const tail = decoder.decode();
			if (tail) {
				yield tail;
			}
			break;
		}
	}
}
