import type {
	ClientRequest,
	RequestId,
	ServerNotification,
	ServerRequest,
} from "../../app-server-protocol/schema/typescript";

export type JsonRpcResult = unknown;

export type JSONRPCErrorError = {
	code: number;
	data?: unknown;
	message: string;
};

export type Result = JsonRpcResult;

export type AppServerEvent =
	| { skipped: number; type: "lagged" }
	| {
			notification: ServerNotification;
			type: "server_notification";
	  }
	| { request: ServerRequest; type: "server_request" }
	| { message: string; type: "disconnected" };

export type TypedRequestError =
	| { method: string; source: unknown; type: "transport" }
	| { method: string; source: JSONRPCErrorError; type: "server" }
	| { method: string; source: unknown; type: "deserialize" };

export type AppServerRequestHandle = {
	rejectServerRequest(
		requestId: RequestId,
		error: JSONRPCErrorError,
	): Promise<void>;
	request(request: ClientRequest): Promise<unknown>;
	requestTyped<T>(request: ClientRequest): Promise<T>;
	resolveServerRequest(requestId: RequestId, result: Result): Promise<void>;
};

export async function requestTyped<T>(
	request: ClientRequest,
	send: (request: ClientRequest) => Promise<unknown>,
): Promise<T> {
	try {
		return (await send(request)) as T;
	} catch (source) {
		if (isJsonRpcError(source)) {
			throw {
				method: request.method,
				source,
				type: "server",
			} satisfies TypedRequestError;
		}
		throw {
			method: request.method,
			source,
			type: "transport",
		} satisfies TypedRequestError;
	}
}

export function serverNotificationRequiresDelivery(
	notification: ServerNotification,
): boolean {
	return (
		notification.method === "turn/completed" ||
		notification.method === "item/completed" ||
		notification.method === "item/agentMessage/delta" ||
		notification.method === "item/plan/delta" ||
		notification.method === "item/reasoning/summaryTextDelta" ||
		notification.method === "item/reasoning/textDelta"
	);
}

export function requestMethodName(request: ClientRequest): string {
	return request.method;
}

function isJsonRpcError(value: unknown): value is JSONRPCErrorError {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as { code?: unknown }).code === "number" &&
		typeof (value as { message?: unknown }).message === "string"
	);
}

export {
	CodexAppServerClientTransportError,
	createCodexAppServerClient,
	parseCodexAppServerEvent,
	type CodexAppServerClientConnectionStatus,
	type CodexAppServerClientOptions,
} from "./remote";
export { AppServerSession, type CodexAppServer } from "./session";
export {
	PendingAppServerRequests,
	type AppServerRequestResolution,
	type ResolvedAppServerRequest,
	type UnsupportedAppServerRequest,
} from "./pending_requests";
export {
	applyServerNotificationToThreadEventStore,
	applyServerRequestToThreadEventStore,
	serverNotificationThreadTarget,
	serverRequestThreadId,
	threadEventSnapshotHasStarted,
	ThreadEventStore,
	type ServerNotificationThreadTarget,
	type ThreadBufferedEvent,
	type ThreadEventSnapshot,
	type ThreadTokenUsageSnapshot,
} from "./thread_event_store";
export {
	applyServerNotificationToRenderedThread,
	applyServerRequestToRenderedThread,
	renderThreadFromAppServerThread,
	serverNotificationToEventMsg,
	serverRequestToEventMsg,
} from "./thread_projection";
