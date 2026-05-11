export type ApiErrorCode =
	| "transport"
	| "api"
	| "stream"
	| "context_window_exceeded"
	| "quota_exceeded"
	| "usage_not_included"
	| "retryable"
	| "rate_limit"
	| "invalid_request"
	| "cyber_policy"
	| "server_overloaded";

export class ApiError extends Error {
	readonly code: ApiErrorCode;
	readonly status?: number;
	readonly delay_ms?: number | null;

	constructor(input: {
		code: ApiErrorCode;
		message: string;
		status?: number;
		delay_ms?: number | null;
	}) {
		super(input.message);
		this.name = "ApiError";
		this.code = input.code;
		this.status = input.status;
		this.delay_ms = input.delay_ms ?? null;
	}

	static transport(message: string): ApiError {
		return new ApiError({ code: "transport", message });
	}

	static api(status: number, message: string): ApiError {
		return new ApiError({ code: "api", status, message });
	}

	static stream(message: string): ApiError {
		return new ApiError({ code: "stream", message });
	}

	static retryable(message: string, delay_ms?: number | null): ApiError {
		return new ApiError({ code: "retryable", message, delay_ms });
	}
}

export function apiErrorFromResponsePayload(
	status: number,
	payload: unknown,
): ApiError {
	const error = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
	const message =
		typeof error?.message === "string" && error.message.trim()
			? error.message
			: `OpenAI Responses request failed with HTTP ${status}.`;
	const code = typeof error?.code === "string" ? error.code : null;

	if (code === "context_length_exceeded") {
		return new ApiError({ code: "context_window_exceeded", message });
	}
	if (code === "insufficient_quota") {
		return new ApiError({ code: "quota_exceeded", message });
	}
	if (code === "usage_not_included") {
		return new ApiError({ code: "usage_not_included", message });
	}
	if (code === "invalid_prompt") {
		return new ApiError({ code: "invalid_request", message });
	}
	if (code === "cyber_policy") {
		return new ApiError({
			code: "cyber_policy",
			message:
				message ||
				"This request has been flagged for possible cybersecurity risk.",
		});
	}
	if (code === "server_is_overloaded" || code === "slow_down") {
		return new ApiError({ code: "server_overloaded", message });
	}
	if (code === "rate_limit_exceeded") {
		return new ApiError({
			code: "retryable",
			message,
			delay_ms: retryAfterDelayMs(message),
		});
	}

	return ApiError.api(status, message);
}

export function apiErrorFromResponsesEvent(event: Record<string, unknown>): ApiError {
	const response = isRecord(event.response) ? event.response : null;
	const error = isRecord(response?.error) ? response.error : null;
	if (!error) {
		return ApiError.stream(`${String(event.type ?? "response.failed")} event received`);
	}
	return apiErrorFromResponsePayload(200, { error });
}

export function apiErrorFromUnknown(error: unknown): ApiError {
	if (error instanceof ApiError) {
		return error;
	}
	if (error instanceof Error) {
		return ApiError.transport(error.message);
	}
	return ApiError.transport(String(error));
}

export function htmlChallengeApiError(): ApiError {
	return ApiError.stream(
		[
			"ChatGPT backend returned an HTML challenge instead of a Codex response stream.",
			"This matches Codex's native-client-only Cloudflare cookie path and cannot be completed by the current Worker runtime.",
			"Use an OpenAI API key, or a ChatGPT account whose token can be exchanged for OpenAI API access.",
		].join(" "),
	);
}

export function isRetryableApiError(error: ApiError): boolean {
	return (
		error.code === "transport" ||
		error.code === "retryable" ||
		error.code === "server_overloaded" ||
		(error.code === "api" && !!error.status && error.status >= 500)
	);
}

function retryAfterDelayMs(message: string): number | null {
	const match = /try again in\s*(\d+(?:\.\d+)?)\s*(s|ms|seconds?)/iu.exec(message);
	if (!match) {
		return null;
	}
	const value = Number.parseFloat(match[1] ?? "");
	if (!Number.isFinite(value)) {
		return null;
	}
	const unit = (match[2] ?? "").toLowerCase();
	return unit === "ms" ? Math.round(value) : Math.round(value * 1000);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
