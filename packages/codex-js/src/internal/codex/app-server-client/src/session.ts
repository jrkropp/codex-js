import type {
	ClientRequest,
	InitializeParams,
	InitializeResponse,
	RequestId,
} from "../../app-server-protocol/schema/typescript";
import type {
	CollaborationModeListParams,
	CollaborationModeListResponse,
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
import type {
	AppServerEvent,
	JSONRPCErrorError,
	Result,
} from "./lib";

export type CodexAppServer = {
	close?(): void;
	events?(): AsyncIterable<AppServerEvent>;
	nextEvent?(): Promise<AppServerEvent | null>;
	rejectServerRequest(
		requestId: RequestId,
		error: JSONRPCErrorError,
	): Promise<void>;
	request(request: ClientRequest): Promise<unknown>;
	requestTyped<T>(request: ClientRequest): Promise<T>;
	resolveServerRequest(requestId: RequestId, result: Result): Promise<void>;
};

export class AppServerSession {
	private nextRequestIdValue = 1;

	constructor(private readonly client: CodexAppServer) {}

	nextRequestId(): RequestId {
		const requestId = this.nextRequestIdValue;
		this.nextRequestIdValue += 1;
		return requestId;
	}

	nextEvent(): Promise<AppServerEvent | null> {
		return this.client.nextEvent?.() ?? Promise.resolve(null);
	}

	events(): AsyncIterable<AppServerEvent> | null {
		return this.client.events?.() ?? null;
	}

	requestTyped<T>(request: ClientRequest): Promise<T> {
		return this.client.requestTyped<T>(request);
	}

	initialize(params: InitializeParams = defaultInitializeParams()): Promise<InitializeResponse> {
		return this.requestTyped<InitializeResponse>({
			id: this.nextRequestId(),
			method: "initialize",
			params,
		});
	}

	threadStart(params: ThreadStartParams): Promise<ThreadStartResponse> {
		return this.requestTyped<ThreadStartResponse>({
			id: this.nextRequestId(),
			method: "thread/start",
			params,
		});
	}

	threadResume(params: ThreadResumeParams): Promise<ThreadResumeResponse> {
		return this.requestTyped<ThreadResumeResponse>({
			id: this.nextRequestId(),
			method: "thread/resume",
			params,
		});
	}

	threadList(params: ThreadListParams = {}): Promise<ThreadListResponse> {
		return this.requestTyped<ThreadListResponse>({
			id: this.nextRequestId(),
			method: "thread/list",
			params,
		});
	}

	collaborationModeList(
		params: CollaborationModeListParams = {},
	): Promise<CollaborationModeListResponse> {
		return this.requestTyped<CollaborationModeListResponse>({
			id: this.nextRequestId(),
			method: "collaborationMode/list",
			params,
		});
	}

	configMcpServerReload(): Promise<McpServerRefreshResponse> {
		return this.requestTyped<McpServerRefreshResponse>({
			id: this.nextRequestId(),
			method: "config/mcpServer/reload",
			params: undefined,
		});
	}

	mcpServerStatusList(
		params: ListMcpServerStatusParams = {},
	): Promise<ListMcpServerStatusResponse> {
		return this.requestTyped<ListMcpServerStatusResponse>({
			id: this.nextRequestId(),
			method: "mcpServerStatus/list",
			params,
		});
	}

	mcpResourceRead(params: McpResourceReadParams): Promise<McpResourceReadResponse> {
		return this.requestTyped<McpResourceReadResponse>({
			id: this.nextRequestId(),
			method: "mcpServer/resource/read",
			params,
		});
	}

	mcpServerToolCall(
		params: McpServerToolCallParams,
	): Promise<McpServerToolCallResponse> {
		return this.requestTyped<McpServerToolCallResponse>({
			id: this.nextRequestId(),
			method: "mcpServer/tool/call",
			params,
		});
	}

	mcpServerOauthLogin(
		params: McpServerOauthLoginParams,
	): Promise<McpServerOauthLoginResponse> {
		return this.requestTyped<McpServerOauthLoginResponse>({
			id: this.nextRequestId(),
			method: "mcpServer/oauth/login",
			params,
		});
	}

	threadRead(params: ThreadReadParams): Promise<ThreadReadResponse> {
		return this.requestTyped<ThreadReadResponse>({
			id: this.nextRequestId(),
			method: "thread/read",
			params,
		});
	}

	threadNameSet(params: ThreadSetNameParams): Promise<ThreadSetNameResponse> {
		return this.requestTyped<ThreadSetNameResponse>({
			id: this.nextRequestId(),
			method: "thread/name/set",
			params,
		});
	}

	threadArchive(params: ThreadArchiveParams): Promise<ThreadArchiveResponse> {
		return this.requestTyped<ThreadArchiveResponse>({
			id: this.nextRequestId(),
			method: "thread/archive",
			params,
		});
	}

	threadUnarchive(params: ThreadUnarchiveParams): Promise<ThreadUnarchiveResponse> {
		return this.requestTyped<ThreadUnarchiveResponse>({
			id: this.nextRequestId(),
			method: "thread/unarchive",
			params,
		});
	}

	threadMetadataUpdate(
		params: ThreadMetadataUpdateParams,
	): Promise<ThreadMetadataUpdateResponse> {
		return this.requestTyped<ThreadMetadataUpdateResponse>({
			id: this.nextRequestId(),
			method: "thread/metadata/update",
			params,
		});
	}

	turnStart(params: TurnStartParams): Promise<TurnStartResponse> {
		return this.requestTyped<TurnStartResponse>({
			id: this.nextRequestId(),
			method: "turn/start",
			params,
		});
	}

	turnSteer(params: TurnSteerParams): Promise<TurnSteerResponse> {
		return this.requestTyped<TurnSteerResponse>({
			id: this.nextRequestId(),
			method: "turn/steer",
			params,
		});
	}

	turnInterrupt(params: TurnInterruptParams): Promise<TurnInterruptResponse> {
		return this.requestTyped<TurnInterruptResponse>({
			id: this.nextRequestId(),
			method: "turn/interrupt",
			params,
		});
	}

	threadCompactStart(
		params: ThreadCompactStartParams,
	): Promise<ThreadCompactStartResponse> {
		return this.requestTyped<ThreadCompactStartResponse>({
			id: this.nextRequestId(),
			method: "thread/compact/start",
			params,
		});
	}

	resolveServerRequest(requestId: RequestId, result: Result): Promise<void> {
		return this.client.resolveServerRequest(requestId, result);
	}

	rejectServerRequest(
		requestId: RequestId,
		error: JSONRPCErrorError,
	): Promise<void> {
		return this.client.rejectServerRequest(requestId, error);
	}
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
