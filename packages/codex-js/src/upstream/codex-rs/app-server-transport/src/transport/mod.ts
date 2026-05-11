import type {
	ClientNotification,
	ClientRequest,
	RequestId,
	ServerNotification,
	ServerRequest,
} from "../../../app-server-protocol/schema/typescript";
import type {
	ConnectionId,
	JSONRPCErrorError,
	OutgoingMessage,
	OutgoingResponse,
	QueuedOutgoingMessage,
	Result,
} from "../outgoing_message";

export type ConnectionOrigin =
	| "stdio"
	| "inProcess"
	| "webSocket"
	| "remoteControl";

export type JSONRPCRequest = {
	id: RequestId;
	method: string;
	params?: unknown;
};

export type JSONRPCNotification = {
	method: string;
	params?: unknown;
};

export type JSONRPCResponse = {
	id: RequestId;
	result: Result;
};

export type JSONRPCError = {
	error: JSONRPCErrorError;
	id: RequestId | null;
};

export type JSONRPCMessage =
	| JSONRPCRequest
	| JSONRPCNotification
	| JSONRPCResponse
	| JSONRPCError;

export type TransportEvent =
	| {
			connectionId: ConnectionId;
			origin: ConnectionOrigin;
			type: "connection_opened";
	  }
	| { connectionId: ConnectionId; type: "connection_closed" }
	| {
			connectionId: ConnectionId;
			message: JSONRPCMessage;
			type: "incoming_message";
	  };

export type ParsedServerTransportMessage =
	| { request: ClientRequest; type: "client_request" }
	| { notification: ClientNotification; type: "client_notification" }
	| { response: JSONRPCResponse; type: "response" }
	| { error: JSONRPCError; type: "error" };

export type ParsedClientTransportMessage =
	| { request: ServerRequest; type: "server_request" }
	| { notification: ServerNotification; type: "server_notification" }
	| { response: JSONRPCResponse; type: "response" }
	| { error: JSONRPCError; type: "error" };

export type ParsedTransportPayload<T> =
	| { message: T; type: "ok" }
	| { error: JSONRPCErrorError; id: RequestId | null; type: "invalid" };

export function parseJsonRpcTransportPayload(
	payload: string | ArrayBuffer | ArrayBufferView | unknown,
): ParsedTransportPayload<JSONRPCMessage> {
	let value: unknown;
	if (typeof payload === "string") {
		try {
			value = JSON.parse(payload);
		} catch {
			return {
				error: jsonRpcParseError("Parse error"),
				id: null,
				type: "invalid",
			};
		}
	} else if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
		const bytes = payload instanceof ArrayBuffer
			? new Uint8Array(payload)
			: new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
		try {
			value = JSON.parse(new TextDecoder().decode(bytes));
		} catch {
			return {
				error: jsonRpcParseError("Parse error"),
				id: null,
				type: "invalid",
			};
		}
	} else {
		value = payload;
	}

	return parseJsonRpcMessage(value);
}

export function parseJsonRpcMessage(
	value: unknown,
): ParsedTransportPayload<JSONRPCMessage> {
	if (!isRecord(value)) {
		return {
			error: jsonRpcInvalidRequestError("Invalid JSON-RPC message"),
			id: null,
			type: "invalid",
		};
	}

	const candidateId = requestIdFromValue(value.id);
	const id = candidateId ?? null;
	if (typeof value.method === "string") {
		if (candidateId !== null) {
			return {
				message: jsonRpcRequest(value.method, candidateId, value.params),
				type: "ok",
			};
		}
		if (Object.prototype.hasOwnProperty.call(value, "id")) {
			return {
				error: jsonRpcInvalidRequestError("Invalid JSON-RPC request id"),
				id: null,
				type: "invalid",
			};
		}
		return {
			message: jsonRpcNotification(value.method, value.params),
			type: "ok",
		};
	}

	if (Object.prototype.hasOwnProperty.call(value, "error")) {
		if (!isJsonRpcErrorError(value.error)) {
			return {
				error: jsonRpcInvalidRequestError("Invalid JSON-RPC error object"),
				id,
				type: "invalid",
			};
		}
		return {
			message: { error: value.error, id },
			type: "ok",
		};
	}

	if (Object.prototype.hasOwnProperty.call(value, "result")) {
		if (candidateId === null) {
			return {
				error: jsonRpcInvalidRequestError("Invalid JSON-RPC response id"),
				id: null,
				type: "invalid",
			};
		}
		return {
			message: { id: candidateId, result: value.result },
			type: "ok",
		};
	}

	return {
		error: jsonRpcInvalidRequestError("Invalid JSON-RPC message"),
		id,
		type: "invalid",
	};
}

export function parseServerTransportPayload(
	payload: string | ArrayBuffer | ArrayBufferView | unknown,
): ParsedTransportPayload<ParsedServerTransportMessage> {
	const parsed = parseJsonRpcTransportPayload(payload);
	if (parsed.type === "invalid") {
		return parsed;
	}
	return {
		message: serverTransportMessage(parsed.message),
		type: "ok",
	};
}

export function parseClientTransportPayload(
	payload: string | ArrayBuffer | ArrayBufferView | unknown,
): ParsedTransportPayload<ParsedClientTransportMessage> {
	const parsed = parseJsonRpcTransportPayload(payload);
	if (parsed.type === "invalid") {
		return parsed;
	}
	return {
		message: clientTransportMessage(parsed.message),
		type: "ok",
	};
}

export function serializeOutgoingMessage(message: OutgoingMessage): string {
	return JSON.stringify(message);
}

export function serializeJsonRpcResponse(
	id: RequestId,
	result: Result,
): string {
	return serializeOutgoingMessage({ id, result } satisfies OutgoingResponse);
}

export function serializeJsonRpcError(
	id: RequestId | null,
	error: JSONRPCErrorError,
): string {
	return JSON.stringify({ error, id } satisfies JSONRPCError);
}

export function queuedOutgoingMessage(
	message: OutgoingMessage,
	writeComplete?: () => void,
): QueuedOutgoingMessage {
	return { message, writeComplete };
}

export function jsonRpcParseError(message: string): JSONRPCErrorError {
	return { code: -32700, message };
}

export function jsonRpcInvalidRequestError(message: string): JSONRPCErrorError {
	return { code: -32600, message };
}

export function jsonRpcInternalError(message: string): JSONRPCErrorError {
	return { code: -32603, message };
}

function serverTransportMessage(
	message: JSONRPCMessage,
): ParsedServerTransportMessage {
	if (isRequest(message)) {
		return { request: message as ClientRequest, type: "client_request" };
	}
	if (isNotification(message)) {
		return {
			notification: message as ClientNotification,
			type: "client_notification",
		};
	}
	if (isError(message)) {
		return { error: message, type: "error" };
	}
	return { response: message, type: "response" };
}

function clientTransportMessage(
	message: JSONRPCMessage,
): ParsedClientTransportMessage {
	if (isRequest(message)) {
		return { request: message as ServerRequest, type: "server_request" };
	}
	if (isNotification(message)) {
		return {
			notification: message as ServerNotification,
			type: "server_notification",
		};
	}
	if (isError(message)) {
		return { error: message, type: "error" };
	}
	return { response: message, type: "response" };
}

function jsonRpcRequest(
	method: string,
	id: RequestId,
	params: unknown,
): JSONRPCRequest {
	return params === undefined ? { id, method } : { id, method, params };
}

function jsonRpcNotification(
	method: string,
	params: unknown,
): JSONRPCNotification {
	return params === undefined ? { method } : { method, params };
}

function isRequest(message: JSONRPCMessage): message is JSONRPCRequest {
	return (
		typeof (message as { method?: unknown }).method === "string" &&
		Object.prototype.hasOwnProperty.call(message, "id")
	);
}

function isNotification(
	message: JSONRPCMessage,
): message is JSONRPCNotification {
	return (
		typeof (message as { method?: unknown }).method === "string" &&
		!Object.prototype.hasOwnProperty.call(message, "id")
	);
}

function isError(message: JSONRPCMessage): message is JSONRPCError {
	return Object.prototype.hasOwnProperty.call(message, "error");
}

function requestIdFromValue(value: unknown): RequestId | null {
	return typeof value === "string" || typeof value === "number" ? value : null;
}

function isJsonRpcErrorError(value: unknown): value is JSONRPCErrorError {
	return (
		isRecord(value) &&
		typeof value.code === "number" &&
		typeof value.message === "string"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
