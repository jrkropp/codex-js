import {
	Session,
	asThreadId,
	type CreateThreadParams,
	type DynamicToolSpec,
	type Event,
	type McpConnectionManager,
	type SessionConfiguration,
	type Submission,
	type ThreadId,
	type ThreadStore,
} from "../../core/src";
import { type ModelClient } from "../../core/src";
import type {
	AppServerEvent,
	JSONRPCErrorError,
	Result,
} from "../../app-server-client/src/lib";
import {
	OutgoingMessageSender,
	outgoingMessageToAppServerEvent,
	type ConnectionId,
	type OutgoingMessage,
} from "./outgoing_message";
import {
	McpRequestProcessor,
	ThreadRequestProcessor,
	TurnRequestProcessor,
	type RuntimeSession,
} from "./request_processors";
import {
	isServerRequestResponseSubmission,
	submissionFromServerRequestError,
	submissionFromServerRequestResult,
	type ServerRequestResponseTarget,
} from "./server_request_response";
import { CodexSessionFactory } from "./session_factory";
import { CodexSessionTaskRunner } from "./session_task_runner";
import { ThreadStateManager } from "./thread_state";
import { RequestSerializationQueues } from "./request_serialization";
import {
	apply_bespoke_event_handling,
	serverRequestResolvedNotification,
	type AppServerProtocolEvent,
	type ServerRequestCoreTarget,
} from "./bespoke_event_handling";
import type {
	ThreadCompactStartParams,
	McpServerOauthLoginParams,
	McpServerOauthLoginResponse,
	ThreadResumeParams,
	ThreadStartParams,
	TurnStartParams,
} from "../../app-server-protocol/schema/typescript/v2";
import {
	CodexAppServerConnectionSessionState,
	CodexAppServerMessageProcessor,
	type CodexAppServerMethodHandlers,
} from "./message_processor";
import type {
	InitializeParams,
	InitializeResponse,
} from "../../app-server-protocol/schema/typescript";

export type CodexAppServerRuntimeContext = unknown;

export type CodexAppServerEventSink<Context = CodexAppServerRuntimeContext> = (
	event: AppServerEvent,
	context: {
		context?: Context;
		threadId: ThreadId;
	},
) => Promise<void> | void;

export type CodexAppServerOutgoingSink<Context = CodexAppServerRuntimeContext> = (
	message: OutgoingMessage,
	context: {
		connectionIds?: ConnectionId[];
		context?: Context;
		threadId?: ThreadId;
	},
) => Promise<void> | void;

export type CodexAppServerRuntimeOptions<Context = CodexAppServerRuntimeContext> = {
	buildCreateThreadParams?: (input: {
		context?: Context;
		params: ThreadStartParams;
		threadId: ThreadId;
	}) => CreateThreadParams | Promise<CreateThreadParams>;
	buildSessionConfiguration?: (input: {
		context?: Context;
		params: ThreadStartParams | ThreadResumeParams | TurnStartParams | ThreadCompactStartParams;
		thread: Awaited<ReturnType<ThreadStore["readThread"]>>;
	}) => Partial<SessionConfiguration> | Promise<Partial<SessionConfiguration>>;
	createModelClient: (input: {
		context?: Context;
		session: Session;
		threadId: ThreadId;
	}) => ModelClient | Promise<ModelClient>;
	modelClientCacheKey?: (input: {
		context?: Context;
		session: Session;
		threadId: ThreadId;
	}) => string | null | undefined;
	mcpConnectionManager?: McpConnectionManager | null;
	mcpServerOauthLogin?: (input: {
		context?: Context;
		params: McpServerOauthLoginParams;
	}) => McpServerOauthLoginResponse | Promise<McpServerOauthLoginResponse>;
	reloadMcpServers?: (input: { context?: Context }) => void | Promise<void>;
	createSession?: (input: {
		context?: Context;
		eventSink: (event: Event) => void;
		params: ThreadStartParams | ThreadResumeParams | TurnStartParams | ThreadCompactStartParams;
		submission?: Submission;
		threadId: ThreadId;
	}) => Session | Promise<Session>;
	eventSink?: CodexAppServerEventSink<Context>;
	onRuntimeError?: (error: unknown, context: { context?: Context; threadId?: ThreadId }) => void;
	runInBackground?: (promise: Promise<unknown>, context: { context?: Context; threadId: ThreadId }) => void;
	runConnectionBackground?: (promise: Promise<unknown>, context: { context?: Context }) => void;
	sendOutgoingMessage?: CodexAppServerEventSink<Context>;
	sendOutgoingTransportMessage?: CodexAppServerOutgoingSink<Context>;
	resolveDynamicTools?: (input: {
		context?: Context;
		params: ThreadStartParams;
		threadId: ThreadId;
	}) => DynamicToolSpec[] | Promise<DynamicToolSpec[]>;
	store: ThreadStore;
};

export type CodexAppServerRuntime<Context = CodexAppServerRuntimeContext> = {
	connectionClosed(connectionId: number): Promise<void>;
	connectionInitialized(connectionId: number): void;
	createMessageProcessor(input: {
		connectionId: ConnectionId;
		initialize?: (
			params: InitializeParams,
			context?: Context,
			session?: CodexAppServerConnectionSessionState,
		) => Promise<InitializeResponse>;
		initializeResponse?: InitializeResponse | (() => InitializeResponse);
		session?: CodexAppServerConnectionSessionState;
	}): CodexAppServerMessageProcessor<Context>;
	methodHandlers: CodexAppServerMethodHandlers<Context>;
	rejectServerRequest(
		params: { error: JSONRPCErrorError; requestId: string | number; threadId: ThreadId | string },
		context?: Context,
	): Promise<void>;
	resolveServerRequest(
		params: { requestId: string | number; result: Result; threadId: ThreadId | string },
		context?: Context,
	): Promise<void>;
};

export function createCodexAppServerRuntime<Context = CodexAppServerRuntimeContext>(
	options: CodexAppServerRuntimeOptions<Context>,
): CodexAppServerRuntime<Context> {
	const sessions = new Map<ThreadId, RuntimeSession>();
	const serverRequestTargets = new Map<string, ServerRequestCoreTarget>();
	const threadStateManager = new ThreadStateManager();
	const requestSerializationQueues = new RequestSerializationQueues();
	const sendOutgoingMessage = options.sendOutgoingMessage ?? options.eventSink;
	const outgoing = new OutgoingMessageSender({
		send: async (message, messageContext) => {
			if (options.sendOutgoingTransportMessage) {
				await options.sendOutgoingTransportMessage(message, {
					connectionIds: messageContext.connectionIds,
					context: messageContext.context as Context | undefined,
					threadId: messageContext.threadId,
				});
				return;
			}
			const event = outgoingMessageToAppServerEvent(message);
			if (event && sendOutgoingMessage) {
				await sendOutgoingMessage(event, {
					context: messageContext.context as Context | undefined,
					threadId: messageContext.threadId ?? threadIdFromAppServerEvent(event),
				});
			}
		},
	});

	async function emit(
		threadId: ThreadId,
		event: AppServerEvent | AppServerProtocolEvent,
		context?: Context,
	): Promise<void> {
		if (event.type === "server_notification") {
			await outgoing.sendServerNotification(event.notification, context, threadId);
			return;
		}
		if (event.type === "server_request") {
			const handle = outgoing.sendRequestWithHandle(
				event.request,
				threadId,
				context,
			);
			const coreTarget = "coreTarget" in event ? event.coreTarget : undefined;
			if (coreTarget) {
				serverRequestTargets.set(
					serverRequestTargetKey(threadId, handle.request.id),
					coreTarget,
				);
			}
			void handle.result.catch((error) => {
				options.onRuntimeError?.(error, { context, threadId });
			});
			return;
		}
		await sendOutgoingMessage?.(event, { context, threadId });
	}

	function emitCoreEvent(threadId: ThreadId, event: Event, context?: Context): void {
		if (event.msg.type === "session_configured") {
			return;
		}
		const threadState = threadStateManager.threadState(threadId);
		const tracked = threadState.trackCurrentTurnEvent(event.id, event.msg);
		const protocolEvents = apply_bespoke_event_handling(event.msg, {
			activeTurn: tracked.activeTurn,
			terminalTurn: tracked.terminalTurn,
			threadId,
			turnId:
				"turn_id" in event.msg && typeof event.msg.turn_id === "string"
					? event.msg.turn_id
					: event.id,
		});
		for (const protocolEvent of protocolEvents) {
			void emit(threadId, protocolEvent, context);
		}
	}

	const sessionFactory = new CodexSessionFactory({
		buildSessionConfiguration: options.buildSessionConfiguration,
		createSession: options.createSession,
		emitCoreEvent,
		mcpConnectionManager: options.mcpConnectionManager,
		store: options.store,
	});
	const createSession = (
		threadId: ThreadId,
		params: ThreadStartParams | ThreadResumeParams | TurnStartParams | ThreadCompactStartParams,
		context?: Context,
		submission?: Submission,
	): Promise<Session> =>
		sessionFactory.createSession({ context, params, submission, threadId });
	const taskRunner = new CodexSessionTaskRunner({
		createModelClient: options.createModelClient,
		modelClientCacheKey: options.modelClientCacheKey,
		onRuntimeError: options.onRuntimeError,
		runInBackground: options.runInBackground,
		store: options.store,
	});

	const threadProcessor = new ThreadRequestProcessor({
		buildCreateThreadParams: options.buildCreateThreadParams,
		createSession,
		emit,
		resolveDynamicTools: options.resolveDynamicTools,
		sessions,
		store: options.store,
		taskRunner,
	});
	const turnProcessor = new TurnRequestProcessor({
		createSession,
		onRuntimeError: options.onRuntimeError,
		sessions,
		taskRunner,
	});
	const mcpProcessor = new McpRequestProcessor({
		mcpConnectionManager: options.mcpConnectionManager,
		mcpServerOauthLogin: options.mcpServerOauthLogin,
		reloadMcpServers: options.reloadMcpServers,
		runInBackground: options.runConnectionBackground,
		store: options.store,
	});

	const methodHandlers: CodexAppServerMethodHandlers<Context> = {
		configMcpServerReload: (params, context) =>
			mcpProcessor.mcpServerRefresh(params, context),
		mcpResourceRead: (params, context, request) =>
			mcpProcessor.mcpResourceRead(params, context, request),
		mcpServerOauthLogin: (params, context) =>
			mcpProcessor.mcpServerOauthLogin(params, context),
		mcpServerStatusList: (params, context, request) =>
			mcpProcessor.mcpServerStatusList(params, context, request),
		mcpServerToolCall: (params, context, request) =>
			mcpProcessor.mcpServerToolCall(params, context, request),
		threadStart: (params, context) => threadProcessor.threadStart(params, context),
		threadResume: (params, context) => threadProcessor.threadResume(params, context),
		threadList: (params) => threadProcessor.threadList(params),
		threadRead: (params) => threadProcessor.threadRead(params),
		threadNameSet: (params, context) =>
			threadProcessor.threadNameSet(params, context),
		threadArchive: (params, context) =>
			threadProcessor.threadArchive(params, context),
		threadUnarchive: (params, context) =>
			threadProcessor.threadUnarchive(params, context),
		threadMetadataUpdate: (params) =>
			threadProcessor.threadMetadataUpdate(params),
		threadCompactStart: (params, context) =>
			threadProcessor.threadCompactStart(params, context),
		turnStart: (params, context) => turnProcessor.turnStart(params, context),
		turnSteer: (params, context) => turnProcessor.turnSteer(params, context),
		turnInterrupt: (params) => turnProcessor.turnInterrupt(params),
	};

	function createMessageProcessor(input: {
		connectionId: ConnectionId;
		initialize?: (
			params: InitializeParams,
			context?: Context,
			session?: CodexAppServerConnectionSessionState,
		) => Promise<InitializeResponse>;
		initializeResponse?: InitializeResponse | (() => InitializeResponse);
		session?: CodexAppServerConnectionSessionState;
	}): CodexAppServerMessageProcessor<Context> {
		return new CodexAppServerMessageProcessor<Context>({
			connectionId: input.connectionId,
			handlers: input.initialize
				? { ...methodHandlers, initialize: input.initialize }
				: methodHandlers,
			initializeResponse: input.initializeResponse,
			outgoing,
			requestSerializationQueues,
			session: input.session,
		});
	}

	async function resolveServerRequest(
		params: { requestId: string | number; result: Result; threadId: ThreadId | string },
	): Promise<void> {
		const threadId = asThreadId(String(params.threadId));
		const targetKey = serverRequestTargetKey(threadId, params.requestId);
		const request = outgoing.pendingRequestsForThread(threadId).find(
			(candidate) => candidate.id === params.requestId,
		) ?? null;
		if (!request) {
			serverRequestTargets.delete(targetKey);
		}
		const target = request
			? serverRequestResponseTarget(serverRequestTargets.get(targetKey) ?? null)
			: null;
		const submission = submissionFromServerRequestResult({
			request,
			requestId: params.requestId,
			result: params.result,
			target,
		});
		await submitServerRequestResponse(threadId, submission);
		serverRequestTargets.delete(targetKey);
		await outgoing.notifyClientResponse(params.requestId, params.result);
		await emit(threadId, serverRequestResolvedNotification({
			requestId: params.requestId,
			threadId,
		}));
	}

	async function connectionClosed(connectionId: number): Promise<void> {
		const emptyThreadIds = threadStateManager.removeConnection(connectionId);
		outgoing.connectionClosed(connectionId);
		for (const threadId of emptyThreadIds) {
			threadStateManager.removeThreadState(threadId);
		}
	}

	function connectionInitialized(connectionId: number): void {
		threadStateManager.connectionInitialized(connectionId);
	}

	async function rejectServerRequest(
		params: { error: JSONRPCErrorError; requestId: string | number; threadId: ThreadId | string },
	): Promise<void> {
		const threadId = asThreadId(String(params.threadId));
		const targetKey = serverRequestTargetKey(threadId, params.requestId);
		const request = outgoing.pendingRequestsForThread(threadId).find(
			(candidate) => candidate.id === params.requestId,
		) ?? null;
		if (!request) {
			serverRequestTargets.delete(targetKey);
		}
		const target = request
			? serverRequestResponseTarget(serverRequestTargets.get(targetKey) ?? null)
			: null;
		const submission = submissionFromServerRequestError({
			error: params.error,
			request,
			requestId: params.requestId,
			target,
		});
		await submitServerRequestResponse(threadId, submission);
		serverRequestTargets.delete(targetKey);
		await outgoing.notifyClientError(params.requestId, params.error);
		await emit(threadId, serverRequestResolvedNotification({
			requestId: params.requestId,
			threadId,
		}));
	}

	async function submitServerRequestResponse(
		threadId: ThreadId,
		submission: Submission,
	): Promise<void> {
		if (!isServerRequestResponseSubmission(submission)) {
			throw new Error("Only server-request response submissions can be routed through CodexAppServerRuntime.");
		}
		const runtimeSession = sessions.get(threadId);
		if (!runtimeSession) {
			throw new Error("Codex thread has no active turn for this server request response.");
		}
		await runtimeSession.session.submit_with_id(submission);
	}

	return {
		connectionClosed,
		connectionInitialized,
		createMessageProcessor,
		methodHandlers,
		rejectServerRequest,
		resolveServerRequest,
	};
}

function serverRequestTargetKey(threadId: ThreadId, requestId: string | number): string {
	return `${threadId}:${String(requestId)}`;
}

function serverRequestResponseTarget(
	target: ServerRequestCoreTarget | null,
): ServerRequestResponseTarget | null {
	if (!target) {
		return null;
	}
	return target;
}

function threadIdFromAppServerEvent(event: AppServerEvent): ThreadId {
	if (event.type === "server_notification") {
		const threadId = (event.notification.params as { threadId?: unknown }).threadId;
		if (typeof threadId === "string") {
			return asThreadId(threadId);
		}
	}
	if (event.type === "server_request") {
		const threadId = (event.request.params as { threadId?: unknown }).threadId;
		if (typeof threadId === "string") {
			return asThreadId(threadId);
		}
	}
	return asThreadId("00000000-0000-4000-8000-000000000000");
}
