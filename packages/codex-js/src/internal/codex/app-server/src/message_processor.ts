import type {
	ClientInfo,
	ClientRequest,
	InitializeParams,
	InitializeResponse,
	RequestId,
} from "../../app-server-protocol/schema/typescript";
import {
	clientRequestExperimentalReason,
	clientRequestSerializationScope,
} from "../../app-server-protocol/src/protocol";
import { builtinCollaborationModePresets } from "../../core/src/collaboration-mode-presets";
import type { CollaborationModeMask as CoreCollaborationModeMask } from "../../core/src/config-types";
import type {
	CollaborationModeListParams,
	CollaborationModeListResponse,
	CollaborationModeMask,
	ListMcpServerStatusParams,
	ListMcpServerStatusResponse,
	McpResourceReadParams,
	McpResourceReadResponse,
	McpServerOauthLoginParams,
	McpServerOauthLoginResponse,
	McpServerRefreshResponse,
	McpServerToolCallParams,
	McpServerToolCallResponse,
	ThreadArchiveParams,
	ThreadArchiveResponse,
	ThreadCompactStartParams,
	ThreadCompactStartResponse,
	ThreadListParams,
	ThreadListResponse,
	ThreadMetadataUpdateParams,
	ThreadMetadataUpdateResponse,
	ThreadReadParams,
	ThreadReadResponse,
	ThreadResumeParams,
	ThreadResumeResponse,
	ThreadSetNameParams,
	ThreadSetNameResponse,
	ThreadStartParams,
	ThreadStartResponse,
	ThreadUnarchiveParams,
	ThreadUnarchiveResponse,
	TurnInterruptParams,
	TurnInterruptResponse,
	TurnStartParams,
	TurnStartResponse,
	TurnSteerParams,
	TurnSteerResponse,
} from "../../app-server-protocol/schema/typescript/v2";
import {
	CodexAppServerRequestError,
	unsupportedMethodError,
} from "./request_processors/request_errors";
import {
	ConnectionRpcGate,
	ConnectionRpcGateClosedError,
} from "./connection_rpc_gate";
import {
	RequestSerializationQueues,
	requestSerializationQueueKeyFromScope,
} from "./request_serialization";
import type {
	ConnectionId,
	ConnectionRequestId,
	JSONRPCErrorError,
	OutgoingMessageSender,
} from "./outgoing_message";

export type CodexAppServerRequestContext = {
	connectionId: ConnectionId;
	outgoing: OutgoingMessageSender;
	requestId: ConnectionRequestId;
	session: CodexAppServerConnectionSessionState;
};

export type CodexAppServerMethodHandlers<Context = unknown> = {
	collaborationModeList?(
		params: CollaborationModeListParams,
		context?: Context,
	): Promise<CollaborationModeListResponse>;
	initialize?(
		params: InitializeParams,
		context?: Context,
		session?: CodexAppServerConnectionSessionState,
	): Promise<InitializeResponse>;
	configMcpServerReload?(
		params: undefined,
		context?: Context,
	): Promise<McpServerRefreshResponse>;
	mcpResourceRead?(
		params: McpResourceReadParams,
		context?: Context,
		request?: CodexAppServerRequestContext,
	): Promise<McpResourceReadResponse | CodexAppServerDeferredResponse>;
	mcpServerOauthLogin?(
		params: McpServerOauthLoginParams,
		context?: Context,
	): Promise<McpServerOauthLoginResponse>;
	mcpServerStatusList?(
		params: ListMcpServerStatusParams,
		context?: Context,
		request?: CodexAppServerRequestContext,
	): Promise<ListMcpServerStatusResponse | CodexAppServerDeferredResponse>;
	mcpServerToolCall?(
		params: McpServerToolCallParams,
		context?: Context,
		request?: CodexAppServerRequestContext,
	): Promise<McpServerToolCallResponse | CodexAppServerDeferredResponse>;
	threadArchive?(
		params: ThreadArchiveParams,
		context?: Context,
	): Promise<ThreadArchiveResponse>;
	threadCompactStart(
		params: ThreadCompactStartParams,
		context?: Context,
	): Promise<ThreadCompactStartResponse>;
	threadList?(
		params: ThreadListParams,
		context?: Context,
	): Promise<ThreadListResponse>;
	threadMetadataUpdate?(
		params: ThreadMetadataUpdateParams,
		context?: Context,
	): Promise<ThreadMetadataUpdateResponse>;
	threadNameSet?(
		params: ThreadSetNameParams,
		context?: Context,
	): Promise<ThreadSetNameResponse>;
	threadRead?(
		params: ThreadReadParams,
		context?: Context,
	): Promise<ThreadReadResponse>;
	threadResume(
		params: ThreadResumeParams,
		context?: Context,
	): Promise<ThreadResumeResponse>;
	threadStart(
		params: ThreadStartParams,
		context?: Context,
	): Promise<ThreadStartResponse>;
	threadUnarchive?(
		params: ThreadUnarchiveParams,
		context?: Context,
	): Promise<ThreadUnarchiveResponse>;
	turnInterrupt(
		params: TurnInterruptParams,
		context?: Context,
	): Promise<TurnInterruptResponse>;
	turnStart(
		params: TurnStartParams,
		context?: Context,
	): Promise<TurnStartResponse>;
	turnSteer(
		params: TurnSteerParams,
		context?: Context,
	): Promise<TurnSteerResponse>;
};

export type InitializedConnectionSessionState = {
	appServerClientName: string;
	clientVersion: string;
	experimentalApiEnabled: boolean;
	optedOutNotificationMethods: ReadonlySet<string>;
};

export type CodexAppServerConnectionSnapshot = {
	initialized: InitializedConnectionSessionSnapshot | null;
};

export type InitializedConnectionSessionSnapshot = {
	appServerClientName: string;
	clientVersion: string;
	experimentalApiEnabled: boolean;
	optedOutNotificationMethods: string[];
};

export class CodexAppServerConnectionSessionState {
	readonly rpcGate = new ConnectionRpcGate();
	private initializedState: InitializedConnectionSessionState | null = null;

	constructor(initializedState?: InitializedConnectionSessionState | null) {
		this.initializedState = initializedState ?? null;
	}

	initialized(): boolean {
		return this.initializedState !== null;
	}

	initialize(state: InitializedConnectionSessionState): void {
		if (this.initializedState) {
			throw invalidRequest("Already initialized");
		}
		this.initializedState = state;
	}

	experimentalApiEnabled(): boolean {
		return this.initializedState?.experimentalApiEnabled ?? false;
	}

	optedOutNotificationMethods(): ReadonlySet<string> {
		return this.initializedState?.optedOutNotificationMethods ?? new Set();
	}

	appServerClientName(): string | null {
		return this.initializedState?.appServerClientName ?? null;
	}

	clientVersion(): string | null {
		return this.initializedState?.clientVersion ?? null;
	}

	snapshot(): CodexAppServerConnectionSnapshot {
		return {
			initialized: this.initializedState
				? {
						appServerClientName: this.initializedState.appServerClientName,
						clientVersion: this.initializedState.clientVersion,
						experimentalApiEnabled:
							this.initializedState.experimentalApiEnabled,
						optedOutNotificationMethods: Array.from(
							this.initializedState.optedOutNotificationMethods,
						),
					}
				: null,
		};
	}

	static fromSnapshot(
		snapshot?: CodexAppServerConnectionSnapshot | null,
	): CodexAppServerConnectionSessionState {
		if (!snapshot?.initialized) {
			return new CodexAppServerConnectionSessionState();
		}
		return new CodexAppServerConnectionSessionState({
			appServerClientName: snapshot.initialized.appServerClientName,
			clientVersion: snapshot.initialized.clientVersion,
			experimentalApiEnabled: snapshot.initialized.experimentalApiEnabled,
			optedOutNotificationMethods: new Set(
				snapshot.initialized.optedOutNotificationMethods,
			),
		});
	}
}

export type CodexAppServerMessageProcessorOptions<Context = unknown> = {
	connectionId?: ConnectionId;
	handlers: CodexAppServerMethodHandlers<Context>;
	initializeResponse?: InitializeResponse | (() => InitializeResponse);
	outgoing?: OutgoingMessageSender;
	requestSerializationQueues?: RequestSerializationQueues;
	session?: CodexAppServerConnectionSessionState;
};

export type CodexAppServerConnectionRequestOutcome =
	| { result: unknown; type: "response" }
	| { type: "deferred" }
	| { error: JSONRPCErrorError; type: "error" };

export type CodexAppServerDeferredResponse = {
	readonly __codexAppServerDeferredResponse: true;
};

const CODEX_APP_SERVER_DEFERRED_RESPONSE: CodexAppServerDeferredResponse = {
	__codexAppServerDeferredResponse: true,
};

export function codexAppServerDeferredResponse(): CodexAppServerDeferredResponse {
	return CODEX_APP_SERVER_DEFERRED_RESPONSE;
}

export class CodexAppServerMessageProcessor<Context = unknown> {
	readonly connectionId: ConnectionId;
	readonly requestSerializationQueues: RequestSerializationQueues;
	readonly session: CodexAppServerConnectionSessionState;
	private readonly handlers: CodexAppServerMethodHandlers<Context>;
	private readonly initializeResponse:
		| InitializeResponse
		| (() => InitializeResponse)
		| undefined;
	private readonly outgoing: OutgoingMessageSender | undefined;

	constructor(options: CodexAppServerMessageProcessorOptions<Context>) {
		this.connectionId = options.connectionId ?? defaultConnectionId();
		this.handlers = options.handlers;
		this.initializeResponse = options.initializeResponse;
		this.outgoing = options.outgoing;
		this.requestSerializationQueues =
			options.requestSerializationQueues ?? new RequestSerializationQueues();
		this.session =
			options.session ?? new CodexAppServerConnectionSessionState();
	}

	async processClientRequest(
		request: ClientRequest,
		context?: Context,
	): Promise<unknown> {
		if (request.method === "initialize") {
			return this.initialize(request.params, context);
		}
		if (!this.session.initialized()) {
			throw invalidRequest("Not initialized");
		}
		const experimentalReason = clientRequestExperimentalReason(request);
		if (experimentalReason && !this.session.experimentalApiEnabled()) {
			throw invalidRequest(experimentalRequiredMessage(experimentalReason));
		}

		const scope = clientRequestSerializationScope(request);
		const run = () =>
			this.session.rpcGate.run(() =>
				this.handleInitializedClientRequest(request, context),
			);
		try {
			if (!scope) {
				return await run();
			}
			return await this.requestSerializationQueues.enqueue(
				requestSerializationQueueKeyFromScope(this.connectionId, scope),
				run,
			);
		} catch (error) {
			if (error instanceof ConnectionRpcGateClosedError) {
				throw new CodexAppServerRequestError(
					{
						code: -32000,
						message: error.message,
					},
					499,
				);
			}
			throw error;
		}
	}

	async processConnectionRequest(
		request: ClientRequest,
		context?: Context,
	): Promise<CodexAppServerConnectionRequestOutcome> {
		if (!this.outgoing) {
			const result = await this.processClientRequest(request, context);
			return { result, type: "response" };
		}
		const requestId = this.connectionRequestId(request.id);
		this.outgoing.registerRequestContext({
			connectionId: requestId.connectionId,
			requestId: requestId.requestId,
		});
		try {
			const result = await this.processClientRequest(request, context);
			if (isCodexAppServerDeferredResponse(result)) {
				return { type: "deferred" };
			}
			await this.outgoing.sendResponse(requestId, result);
			return { result, type: "response" };
		} catch (error) {
			const responseError =
				error instanceof CodexAppServerRequestError
					? error.error
					: {
							code: -32000,
							message:
								error instanceof Error
									? error.message
									: "Codex App Server request failed.",
						};
			await this.outgoing.sendError(requestId, responseError);
			return { error: responseError, type: "error" };
		}
	}

	async shutdown(): Promise<void> {
		await this.session.rpcGate.shutdown();
	}

	connectionClosed(): Promise<void> {
		this.outgoing?.connectionClosed(this.connectionId);
		return this.shutdown();
	}

	private async initialize(
		params: InitializeParams,
		context?: Context,
	): Promise<InitializeResponse> {
		validateClientInfo(params.clientInfo);
		const capabilities = params.capabilities;
		this.session.initialize({
			appServerClientName: params.clientInfo.name,
			clientVersion: params.clientInfo.version,
			experimentalApiEnabled: capabilities?.experimentalApi ?? false,
			optedOutNotificationMethods: new Set(
				capabilities?.optOutNotificationMethods ?? [],
			),
		});
		if (this.handlers.initialize) {
			return this.handlers.initialize(params, context, this.session);
		}
		return this.defaultInitializeResponse();
	}

	private async handleInitializedClientRequest(
		request: ClientRequest,
		context?: Context,
	): Promise<unknown> {
		switch (request.method) {
			case "thread/start":
				return this.handlers.threadStart(request.params, context);
			case "thread/resume":
				return this.handlers.threadResume(request.params, context);
			case "thread/list":
				if (this.handlers.threadList) {
					return this.handlers.threadList(request.params, context);
				}
				break;
			case "thread/read":
				if (this.handlers.threadRead) {
					return this.handlers.threadRead(request.params, context);
				}
				break;
			case "thread/name/set":
				if (this.handlers.threadNameSet) {
					return this.handlers.threadNameSet(request.params, context);
				}
				break;
			case "thread/archive":
				if (this.handlers.threadArchive) {
					return this.handlers.threadArchive(request.params, context);
				}
				break;
			case "thread/unarchive":
				if (this.handlers.threadUnarchive) {
					return this.handlers.threadUnarchive(request.params, context);
				}
				break;
			case "thread/metadata/update":
				if (this.handlers.threadMetadataUpdate) {
					return this.handlers.threadMetadataUpdate(request.params, context);
				}
				break;
			case "turn/start":
				return this.handlers.turnStart(request.params, context);
			case "turn/steer":
				return this.handlers.turnSteer(request.params, context);
			case "turn/interrupt":
				return this.handlers.turnInterrupt(request.params, context);
			case "thread/compact/start":
				return this.handlers.threadCompactStart(request.params, context);
			case "collaborationMode/list":
				if (this.handlers.collaborationModeList) {
					return this.handlers.collaborationModeList(request.params, context);
				}
				return {
					data: builtinCollaborationModePresets().map(
						appServerCollaborationModeMask,
					),
				};
			case "config/mcpServer/reload":
				if (this.handlers.configMcpServerReload) {
					return this.handlers.configMcpServerReload(request.params, context);
				}
				break;
			case "mcpServerStatus/list":
				if (this.handlers.mcpServerStatusList) {
					return this.handlers.mcpServerStatusList(
						request.params,
						context,
						this.requestContext(request.id),
					);
				}
				break;
			case "mcpServer/resource/read":
				if (this.handlers.mcpResourceRead) {
					return this.handlers.mcpResourceRead(
						request.params,
						context,
						this.requestContext(request.id),
					);
				}
				break;
			case "mcpServer/tool/call":
				if (this.handlers.mcpServerToolCall) {
					return this.handlers.mcpServerToolCall(
						request.params,
						context,
						this.requestContext(request.id),
					);
				}
				break;
			case "mcpServer/oauth/login":
				if (this.handlers.mcpServerOauthLogin) {
					return this.handlers.mcpServerOauthLogin(request.params, context);
				}
				break;
		}
		throw new CodexAppServerRequestError(
			unsupportedMethodError(request.method, request.id),
			404,
		);
	}

	private defaultInitializeResponse(): InitializeResponse {
		const response =
			typeof this.initializeResponse === "function"
				? this.initializeResponse()
				: this.initializeResponse;
		return (
			response ?? {
				codexHome: "/",
				platformFamily: platformFamily(),
				platformOs: platformOs(),
				userAgent: "codex-js",
			}
		);
	}

	private connectionRequestId(requestId: RequestId): ConnectionRequestId {
		return {
			connectionId: this.connectionId,
			requestId,
		};
	}

	private requestContext(
		requestId: RequestId,
	): CodexAppServerRequestContext | undefined {
		if (!this.outgoing) {
			return undefined;
		}
		return {
			connectionId: this.connectionId,
			outgoing: this.outgoing,
			requestId: this.connectionRequestId(requestId),
			session: this.session,
		};
	}
}

function isCodexAppServerDeferredResponse(
	value: unknown,
): value is CodexAppServerDeferredResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as CodexAppServerDeferredResponse)
			.__codexAppServerDeferredResponse === true
	);
}

function validateClientInfo(clientInfo: ClientInfo): void {
	if (!clientInfo.name || /[\r\n]/u.test(clientInfo.name)) {
		throw invalidRequest(
			`Invalid clientInfo.name: '${clientInfo.name}'. Must be a valid HTTP header value.`,
		);
	}
}

function invalidRequest(message: string): CodexAppServerRequestError {
	return new CodexAppServerRequestError(
		{ code: -32600, message } satisfies JSONRPCErrorError,
		400,
	);
}

function experimentalRequiredMessage(reason: string): string {
	return `Experimental API capability is required for ${reason}.`;
}

function defaultConnectionId(): number {
	return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

function platformFamily(): string {
	const navigatorPlatform = (
		globalThis as { navigator?: { platform?: string } }
	).navigator?.platform;
	if (navigatorPlatform?.toLowerCase().includes("win")) {
		return "windows";
	}
	return "unix";
}

function platformOs(): string {
	const navigatorPlatform = (
		globalThis as { navigator?: { platform?: string } }
	).navigator?.platform?.toLowerCase();
	if (navigatorPlatform?.includes("mac")) {
		return "macos";
	}
	if (navigatorPlatform?.includes("win")) {
		return "windows";
	}
	if (navigatorPlatform?.includes("linux")) {
		return "linux";
	}
	return "unknown";
}

function appServerCollaborationModeMask(
	mask: CoreCollaborationModeMask,
): CollaborationModeMask {
	return {
		name: mask.name,
		mode: mask.mode ?? null,
		model: mask.model ?? null,
		reasoning_effort:
			mask.reasoning_effort === undefined
				? null
				: (mask.reasoning_effort as CollaborationModeMask["reasoning_effort"]),
	};
}
