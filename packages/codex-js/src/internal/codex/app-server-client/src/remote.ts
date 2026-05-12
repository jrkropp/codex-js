import type {
	ClientRequest,
	InitializeParams,
	RequestId,
	ServerNotification,
	ServerRequest,
} from "../../app-server-protocol/schema/typescript";
import type {
	AppServerEvent,
	JSONRPCErrorError,
	Result,
} from "./lib";
import { requestTyped as requestTypedWithErrors } from "./lib";
import type { CodexAppServer } from "./session";
import {
	parseClientTransportPayload,
	serializeJsonRpcError,
	serializeJsonRpcResponse,
} from "../../app-server-transport/src/transport/mod";

export type CodexAppServerClientConnectionStatus =
	| "connecting"
	| "connected"
	| "closed"
	| "error";

export type CodexAppServerClientOptions = {
	WebSocket?: typeof WebSocket;
	initializeParams?: InitializeParams | (() => InitializeParams | Promise<InitializeParams>);
	onConnectionStatus?: (status: CodexAppServerClientConnectionStatus) => void;
	parseEvent?: (value: unknown) => AppServerEvent | null;
	url: string | (() => string | Promise<string>);
};

export class CodexAppServerClientTransportError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		readonly body?: unknown,
	) {
		super(message);
		this.name = "CodexAppServerClientTransportError";
	}
}

export function createCodexAppServerClient(
	options: CodexAppServerClientOptions,
): CodexAppServer {
	let socket: WebSocket | null = null;
	let openPromise: Promise<WebSocket> | null = null;
	let initializePromise: Promise<unknown> | null = null;
	let initialized = false;
	const pendingRequests = new Map<
		RequestId,
		{ reject: (error: unknown) => void; resolve: (result: unknown) => void }
	>();
	const eventQueue = createEventQueue<AppServerEvent>();

	async function ensureOpenSocket(): Promise<WebSocket> {
		const openState = 1;
		if (socket?.readyState === openState) {
			return socket;
		}
		openPromise ??= openSocket();
		return openPromise;
	}

	async function ensureInitialized(): Promise<void> {
		if (initialized) {
			return;
		}
		initializePromise ??= sendClientRequest({
			id: 0,
			method: "initialize",
			params: await resolveInitializeParams(options.initializeParams),
		});
		await initializePromise;
		initialized = true;
	}

	async function request(request: ClientRequest): Promise<unknown> {
		if (request.method !== "initialize") {
			await ensureInitialized();
			return sendClientRequest(request);
		}
		const result = await sendClientRequest(request);
		initialized = true;
		return result;
	}

	async function sendClientRequest(request: ClientRequest): Promise<unknown> {
		const websocket = await ensureOpenSocket();
		return new Promise((resolve, reject) => {
			pendingRequests.set(request.id, { reject, resolve });
			try {
				websocket.send(JSON.stringify(request));
			} catch (error) {
				pendingRequests.delete(request.id);
				reject(error);
			}
		});
	}

	async function sendClientResponse(
		requestId: RequestId,
		result: Result,
	): Promise<void> {
		const websocket = await ensureOpenSocket();
		websocket.send(serializeJsonRpcResponse(requestId, result));
	}

	async function sendClientError(
		requestId: RequestId,
		error: JSONRPCErrorError,
	): Promise<void> {
		const websocket = await ensureOpenSocket();
		websocket.send(serializeJsonRpcError(requestId, error));
	}

	async function openSocket(): Promise<WebSocket> {
		options.onConnectionStatus?.("connecting");
		eventQueue.reopen();
		const WebSocketCtor = options.WebSocket ?? WebSocket;
		const websocketUrl = await resolveUrl(options.url);
		return new Promise((resolve, reject) => {
			let settled = false;
			const nextSocket = new WebSocketCtor(websocketUrl);
			socket = nextSocket;
			nextSocket.addEventListener("open", () => {
				settled = true;
				options.onConnectionStatus?.("connected");
				resolve(nextSocket);
			});
			nextSocket.addEventListener("message", (message) => {
				handleSocketMessage(message.data);
			});
			nextSocket.addEventListener("close", () => {
				const error = new CodexAppServerClientTransportError(
					"Codex app-server WebSocket closed.",
				);
				closeSocketState(error);
				eventQueue.push({ message: "closed", type: "disconnected" });
				eventQueue.close();
				options.onConnectionStatus?.("closed");
				if (!settled) {
					reject(error);
				}
			});
			nextSocket.addEventListener("error", () => {
				const error = new CodexAppServerClientTransportError(
					"Codex app-server WebSocket failed.",
				);
				closeSocketState(error);
				eventQueue.fail(error);
				options.onConnectionStatus?.("error");
				if (!settled) {
					reject(error);
				}
			});
		});
	}

	function handleSocketMessage(value: unknown): void {
		const parsed = parseClientTransportPayload(value);
		if (parsed.type === "invalid") {
			const event = options.parseEvent?.(value);
			if (event) {
				eventQueue.push(event);
			}
			return;
		}
		const message = parsed.message;
		switch (message.type) {
			case "response": {
				const pending = pendingRequests.get(message.response.id);
				if (!pending) {
					return;
				}
				pendingRequests.delete(message.response.id);
				pending.resolve(message.response.result);
				return;
			}
			case "error": {
				if (message.error.id === null) {
					eventQueue.fail(message.error.error);
					return;
				}
				const pending = pendingRequests.get(message.error.id);
				if (!pending) {
					return;
				}
				pendingRequests.delete(message.error.id);
				pending.reject(message.error.error);
				return;
			}
			case "server_notification":
				eventQueue.push({
					notification: message.notification,
					type: "server_notification",
				});
				return;
			case "server_request":
				eventQueue.push({ request: message.request, type: "server_request" });
				return;
		}
	}

	function closeSocketState(error: unknown): void {
		socket = null;
		openPromise = null;
		initializePromise = null;
		initialized = false;
		for (const pending of pendingRequests.values()) {
			pending.reject(error);
		}
		pendingRequests.clear();
	}

	function close(): void {
		const currentSocket = socket;
		closeSocketState(
			new CodexAppServerClientTransportError(
				"Codex app-server WebSocket closed.",
			),
		);
		eventQueue.close();
		if (currentSocket && currentSocket.readyState !== 3) {
			currentSocket.close();
		}
	}

	return {
		close,
		events() {
			void ensureInitialized().catch((error) => eventQueue.fail(error));
			return eventQueue.iterable();
		},
		request,
		requestTyped<T>(clientRequest: ClientRequest): Promise<T> {
			return requestTypedWithErrors<T>(clientRequest, request);
		},
		rejectServerRequest(requestId: RequestId, error: JSONRPCErrorError) {
			return sendClientError(requestId, error);
		},
		resolveServerRequest(requestId: RequestId, result: Result) {
			return sendClientResponse(requestId, result);
		},
	};
}

export function parseCodexAppServerEvent(value: unknown): AppServerEvent | null {
	const parsed = parseClientTransportPayload(value);
	if (parsed.type === "ok") {
		switch (parsed.message.type) {
			case "server_notification":
				return {
					notification: parsed.message.notification,
					type: "server_notification",
				};
			case "server_request":
				return { request: parsed.message.request, type: "server_request" };
			case "error":
			case "response":
				return null;
		}
	}
	if (typeof value !== "string") {
		return appServerEventFromParsed(value);
	}
	try {
		return appServerEventFromParsed(JSON.parse(value) as unknown);
	} catch {
		return null;
	}
}

async function resolveInitializeParams(
	params: CodexAppServerClientOptions["initializeParams"],
): Promise<InitializeParams> {
	if (typeof params === "function") {
		return params();
	}
	return params ?? defaultInitializeParams();
}

async function resolveUrl(
	url: CodexAppServerClientOptions["url"],
): Promise<string> {
	return typeof url === "function" ? await url() : url;
}

function defaultInitializeParams(): InitializeParams {
	return {
		capabilities: {
			experimentalApi: false,
			optOutNotificationMethods: [],
		},
		clientInfo: {
			name: "codex-js",
			title: null,
			version: "0.0.0",
		},
	};
}

function appServerEventFromParsed(value: unknown): AppServerEvent | null {
	if (isObject(value) && typeof value.type === "string") {
		if (
			value.type === "server_notification" ||
			value.type === "server_request" ||
			value.type === "lagged" ||
			value.type === "disconnected"
		) {
			return value as AppServerEvent;
		}
	}
	if (isObject(value) && typeof value.method === "string" && "params" in value) {
		if ("id" in value) {
			return { request: value as ServerRequest, type: "server_request" };
		}
		return {
			notification: value as ServerNotification,
			type: "server_notification",
		};
	}
	return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function createEventQueue<T>() {
	const values: T[] = [];
	type Waiter = {
		reject: (error: unknown) => void;
		resolve: (value: IteratorResult<T>) => void;
		settled: boolean;
	};
	const waiters: Waiter[] = [];
	let closed = false;
	let failure: unknown = null;

	return {
		close() {
			closed = true;
			for (const waiter of waiters.splice(0)) {
				waiter.settled = true;
				waiter.resolve({ done: true, value: undefined });
			}
		},
		fail(error: unknown) {
			failure = error;
			for (const waiter of waiters.splice(0)) {
				waiter.settled = true;
				waiter.reject(error);
			}
		},
		push(value: T) {
			while (waiters.length > 0) {
				const waiter = waiters.shift() as Waiter;
				if (waiter.settled) {
					continue;
				}
				waiter.settled = true;
				waiter.resolve({ done: false, value });
				return;
			}
			values.push(value);
		},
		reopen() {
			values.splice(0);
			closed = false;
			failure = null;
		},
		iterable(options: { onReturn?: () => void } = {}): AsyncIterable<T> {
			return {
				[Symbol.asyncIterator]() {
					let active = true;
					let pendingWaiter: Waiter | null = null;
					return {
						next() {
							if (!active) {
								return Promise.resolve({ done: true, value: undefined });
							}
							if (failure) {
								return Promise.reject(failure);
							}
							if (values.length > 0) {
								return Promise.resolve({
									done: false,
									value: values.shift() as T,
								});
							}
							if (closed) {
								return Promise.resolve({ done: true, value: undefined });
							}
							return new Promise<IteratorResult<T>>((resolve, reject) => {
								const waiter = { reject, resolve, settled: false };
								pendingWaiter = waiter;
								waiters.push(waiter);
							});
						},
						return() {
							options.onReturn?.();
							active = false;
							if (pendingWaiter && !pendingWaiter.settled) {
								pendingWaiter.settled = true;
								const index = waiters.indexOf(pendingWaiter);
								if (index !== -1) {
									waiters.splice(index, 1);
								}
								pendingWaiter.resolve({ done: true, value: undefined });
							}
							return Promise.resolve({ done: true, value: undefined });
						},
					};
				},
			};
		},
	};
}
