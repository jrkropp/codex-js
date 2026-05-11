import type {
	RequestId,
	ServerNotification,
	ServerRequest,
} from "../../app-server-protocol/schema/typescript";
import type {
	ConnectionId,
	JSONRPCErrorError,
	OutgoingMessage,
	Result,
} from "../../app-server-transport/src/outgoing_message";
import type { ThreadId } from "../../core/src/ids";

export type {
	ConnectionId,
	JSONRPCErrorError,
	OutgoingError,
	OutgoingMessage,
	OutgoingResponse,
	QueuedOutgoingMessage,
	Result,
} from "../../app-server-transport/src/outgoing_message";

export type AppServerEvent =
	| { notification: ServerNotification; type: "server_notification" }
	| { request: ServerRequest; type: "server_request" }
	| { skipped: number; type: "lagged" }
	| { message: string; type: "disconnected" };

export type ConnectionRequestId = {
	connectionId: ConnectionId;
	requestId: RequestId;
};

export type RequestContext = {
	connectionId: ConnectionId;
	requestId: RequestId;
};

type PendingCallbackEntry = {
	callback: (result: PendingCallbackResult) => void;
	connectionIds: ConnectionId[] | null;
	request: ServerRequest;
	threadId: ThreadId | null;
};

type PendingCallbackResult =
	| { result: Result; type: "ok" }
	| { error: JSONRPCErrorError; type: "error" };

export type OutgoingServerRequestHandle = {
	request: ServerRequest;
	result: Promise<Result>;
};

export type OutgoingMessageSenderOptions = {
	send: (
		message: OutgoingMessage,
		context: {
			connectionIds?: ConnectionId[];
			context?: unknown;
			threadId?: ThreadId;
		},
	) => Promise<void> | void;
};

export class OutgoingMessageSender {
	private nextServerRequestId = 0;
	private readonly requestIdToCallback = new Map<RequestId, PendingCallbackEntry>();
	private readonly requestContexts = new Map<string, RequestContext>();
	private readonly sendMessage: OutgoingMessageSenderOptions["send"];

	constructor(options: OutgoingMessageSenderOptions) {
		this.sendMessage = options.send;
	}

	threadScoped(threadId: ThreadId): ThreadScopedOutgoingMessageSender {
		return new ThreadScopedOutgoingMessageSender(this, threadId, []);
	}

	threadScopedForConnections(
		threadId: ThreadId,
		connectionIds: ConnectionId[],
	): ThreadScopedOutgoingMessageSender {
		return new ThreadScopedOutgoingMessageSender(this, threadId, connectionIds);
	}

	async sendServerNotification(
		notification: ServerNotification,
		context?: unknown,
		threadId?: ThreadId,
		connectionIds?: ConnectionId[],
	): Promise<void> {
		await this.sendMessage(notification, {
			connectionIds,
			context,
			threadId: serverNotificationThreadId(notification) ?? threadId,
		});
	}

	async sendRequest(
		request: ServerRequest,
		threadId: ThreadId | null = serverRequestThreadId(request),
		context?: unknown,
		connectionIds?: ConnectionId[],
	): Promise<Result> {
		return this.sendRequestWithHandle(request, threadId, context, connectionIds).result;
	}

	sendRequestWithHandle(
		request: ServerRequest,
		threadId: ThreadId | null = serverRequestThreadId(request),
		context?: unknown,
		connectionIds?: ConnectionId[],
	): OutgoingServerRequestHandle {
		const requestWithId = request.id === undefined
			? ({ ...request, id: this.nextRequestId() } as ServerRequest)
			: request;
		let rejectResult: (error: unknown) => void = () => {};
		const result = new Promise<Result>((resolve, reject) => {
			rejectResult = reject;
			this.requestIdToCallback.set(requestWithId.id, {
				callback: (entry) => {
					if (entry.type === "ok") {
						resolve(entry.result);
						return;
					}
					reject(entry.error);
				},
				connectionIds: connectionIds ?? null,
				request: requestWithId,
				threadId,
			});
		});
		void Promise.resolve(
			this.sendMessage(requestWithId, {
				connectionIds,
				context,
				threadId: threadId ?? undefined,
			}),
		).catch((error) => {
			this.requestIdToCallback.delete(requestWithId.id);
			rejectResult(error);
		});
		return { request: requestWithId, result };
	}

	registerRequestContext(requestContext: RequestContext): void {
		this.requestContexts.set(connectionRequestKey(requestContext), requestContext);
	}

	requestContext(requestId: ConnectionRequestId): RequestContext | null {
		return this.requestContexts.get(connectionRequestKey(requestId)) ?? null;
	}

	async sendResponse(
		requestId: ConnectionRequestId,
		result: Result,
		context?: unknown,
	): Promise<void> {
		this.requestContexts.delete(connectionRequestKey(requestId));
		await this.sendMessage(
			{ id: requestId.requestId, result },
			{ connectionIds: [requestId.connectionId], context },
		);
	}

	async sendError(
		requestId: ConnectionRequestId,
		error: JSONRPCErrorError,
		context?: unknown,
	): Promise<void> {
		this.requestContexts.delete(connectionRequestKey(requestId));
		await this.sendMessage(
			{ error, id: requestId.requestId },
			{ connectionIds: [requestId.connectionId], context },
		);
	}

	async notifyClientResponse(id: RequestId, result: Result): Promise<void> {
		const entry = this.takeRequestCallback(id);
		entry?.callback({ result, type: "ok" });
	}

	async notifyClientError(
		id: RequestId,
		error: JSONRPCErrorError,
	): Promise<void> {
		const entry = this.takeRequestCallback(id);
		entry?.callback({ error, type: "error" });
	}

	cancelRequest(id: RequestId): boolean {
		return this.takeRequestCallback(id) !== null;
	}

	connectionClosed(connectionId: ConnectionId): void {
		for (const [requestKey, requestContext] of this.requestContexts) {
			if (requestContext.connectionId === connectionId) {
				this.requestContexts.delete(requestKey);
			}
		}
	}

	cancelRequestsForThread(
		threadId: ThreadId,
		error?: JSONRPCErrorError,
	): void {
		for (const [requestId, entry] of this.requestIdToCallback) {
			if (entry.threadId !== threadId) {
				continue;
			}
			this.requestIdToCallback.delete(requestId);
			if (error) {
				entry.callback({ error, type: "error" });
			}
		}
	}

	pendingRequestsForThread(threadId: ThreadId): ServerRequest[] {
		return Array.from(this.requestIdToCallback.values())
			.filter((entry) => entry.threadId === threadId)
			.map((entry) => entry.request)
			.sort((left, right) => String(left.id).localeCompare(String(right.id)));
	}

	private nextRequestId(): RequestId {
		const id = this.nextServerRequestId;
		this.nextServerRequestId += 1;
		return id;
	}

	private takeRequestCallback(id: RequestId): PendingCallbackEntry | null {
		const entry = this.requestIdToCallback.get(id) ?? null;
		this.requestIdToCallback.delete(id);
		return entry;
	}
}

export class ThreadScopedOutgoingMessageSender {
	constructor(
		private readonly outgoing: OutgoingMessageSender,
		private readonly threadId: ThreadId,
		private readonly connectionIds: ConnectionId[] = [],
	) {}

	sendRequest(request: ServerRequest, context?: unknown): Promise<Result> {
		return this.outgoing.sendRequest(
			request,
			this.threadId,
			context,
			this.connectionIds.length > 0 ? this.connectionIds : undefined,
		);
	}

	sendServerNotification(
		notification: ServerNotification,
		context?: unknown,
	): Promise<void> {
		return this.outgoing.sendServerNotification(
			notification,
			context,
			this.threadId,
			this.connectionIds.length > 0 ? this.connectionIds : undefined,
		);
	}

	sendResponse(
		requestId: ConnectionRequestId,
		result: Result,
		context?: unknown,
	): Promise<void> {
		return this.outgoing.sendResponse(requestId, result, context);
	}

	sendError(
		requestId: ConnectionRequestId,
		error: JSONRPCErrorError,
		context?: unknown,
	): Promise<void> {
		return this.outgoing.sendError(requestId, error, context);
	}

	abortPendingServerRequests(error?: JSONRPCErrorError): void {
		this.outgoing.cancelRequestsForThread(this.threadId, error);
	}

	pendingRequests(): ServerRequest[] {
		return this.outgoing.pendingRequestsForThread(this.threadId);
	}
}

export function outgoingMessageToAppServerEvent(
	message: OutgoingMessage,
): AppServerEvent | null {
	if (isServerNotification(message)) {
		return {
			notification: message,
			type: "server_notification",
		};
	}
	if (isServerRequest(message)) {
		return { request: message, type: "server_request" };
	}
	return null;
}

function serverNotificationThreadId(notification: ServerNotification): ThreadId | null {
	const params = notification.params as { threadId?: unknown } | undefined;
	if (typeof params?.threadId === "string") {
		return params.threadId as ThreadId;
	}
	const thread = (params as { thread?: { id?: unknown } } | undefined)?.thread;
	if (typeof thread?.id === "string") {
		return thread.id as ThreadId;
	}
	const turn = (params as { turn?: { threadId?: unknown } } | undefined)?.turn;
	if (typeof turn?.threadId === "string") {
		return turn.threadId as ThreadId;
	}
	return null;
}

function serverRequestThreadId(request: ServerRequest): ThreadId | null {
	const params = request.params as { threadId?: unknown } | undefined;
	return typeof params?.threadId === "string" ? (params.threadId as ThreadId) : null;
}

function connectionRequestKey(requestId: ConnectionRequestId): string {
	return `${requestId.connectionId}:${String(requestId.requestId)}`;
}

function isServerRequest(message: OutgoingMessage): message is ServerRequest {
	return (
		typeof (message as { method?: unknown }).method === "string" &&
		Object.prototype.hasOwnProperty.call(message, "id")
	);
}

function isServerNotification(
	message: OutgoingMessage,
): message is ServerNotification {
	return (
		typeof (message as { method?: unknown }).method === "string" &&
		!Object.prototype.hasOwnProperty.call(message, "id")
	);
}
