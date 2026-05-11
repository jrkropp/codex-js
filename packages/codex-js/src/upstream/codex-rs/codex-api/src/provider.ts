import type { ProviderRuntimeConfig } from "../../core/src";

export function responsesUrlWithQuery(runtime: ProviderRuntimeConfig): string {
	if (!runtime.query_params || Object.keys(runtime.query_params).length === 0) {
		return runtime.responses_url;
	}
	const url = new URL(runtime.responses_url);
	for (const [key, value] of Object.entries(runtime.query_params)) {
		url.searchParams.set(key, value);
	}
	return url.toString();
}

export function websocketUrlForPath(
	runtime: ProviderRuntimeConfig,
	path: string,
): string {
	const base = runtime.base_url.replace(/\/+$/, "");
	const normalizedPath = path.replace(/^\/+/, "");
	const url = new URL(
		normalizedPath ? `${base}/${normalizedPath}` : runtime.base_url,
	);
	if (runtime.query_params) {
		for (const [key, value] of Object.entries(runtime.query_params)) {
			url.searchParams.set(key, value);
		}
	}
	if (url.protocol === "https:") {
		url.protocol = "wss:";
	} else if (url.protocol === "http:") {
		url.protocol = "ws:";
	}
	return url.toString();
}

export function providerRequestHeaders(input: {
	api_key: string;
	runtime: ProviderRuntimeConfig;
	originator: string;
	user_agent: string;
	chatgpt_account_id?: string | null;
	fedramp?: boolean;
	extra_headers?: HeadersInit;
}): Headers {
	const headers = new Headers({
		authorization: `Bearer ${input.api_key}`,
		"content-type": "application/json",
		accept: "text/event-stream",
		...input.runtime.headers,
		originator: input.originator,
		"user-agent": input.user_agent,
	});

	if (input.chatgpt_account_id) {
		headers.set("ChatGPT-Account-ID", input.chatgpt_account_id);
	}
	if (input.fedramp) {
		headers.set("X-OpenAI-Fedramp", "true");
	}
	if (input.extra_headers) {
		for (const [key, value] of new Headers(input.extra_headers)) {
			headers.set(key, value);
		}
	}

	return headers;
}

export function providerWebsocketHeaders(input: {
	api_key: string;
	runtime: ProviderRuntimeConfig;
	originator: string;
	user_agent: string;
	chatgpt_account_id?: string | null;
	fedramp?: boolean;
	extra_headers?: HeadersInit;
	default_headers?: HeadersInit;
}): Headers {
	const headers = new Headers({
		...input.runtime.headers,
		originator: input.originator,
		"user-agent": input.user_agent,
	});
	if (input.default_headers) {
		for (const [key, value] of new Headers(input.default_headers)) {
			if (!headers.has(key)) {
				headers.set(key, value);
			}
		}
	}
	if (input.extra_headers) {
		for (const [key, value] of new Headers(input.extra_headers)) {
			headers.set(key, value);
		}
	}
	headers.set("authorization", `Bearer ${input.api_key}`);
	if (input.chatgpt_account_id) {
		headers.set("ChatGPT-Account-ID", input.chatgpt_account_id);
	}
	if (input.fedramp) {
		headers.set("X-OpenAI-Fedramp", "true");
	}
	headers.set("Upgrade", "websocket");
	return headers;
}
