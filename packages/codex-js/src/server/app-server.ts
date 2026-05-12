import {
	BaseInstructions,
	CodexAppServerConnectionSessionState,
	CodexAppServerRequestError,
	ThreadEventPersistenceMode,
	ThreadMemoryMode,
	createCodexAppServerRuntime,
	parseServerTransportPayload,
	serializeJsonRpcError,
	serializeOutgoingMessage,
	serverRequestThreadId,
	type ClientRequest,
	type CodexAppServerRuntime,
	type CodexAppServerRuntimeContext,
	type CodexAppServerRuntimeOptions,
	type CodexAppServerConnectionSnapshot,
	type ConnectionId,
	type DynamicToolCallParams,
	type JSONRPCErrorError,
	type OutgoingMessage,
	type RequestId,
	type ServerRequest,
	type ThreadId,
	type ThreadStore,
} from "../runtime";
import {
	dynamicToolResponse,
	dynamicToolSpecFromDefinition,
	findDynamicTool,
	type DefinedDynamicTool,
} from "./dynamic-tools";

let nextConnectionId = 1;

export type PendingServerRequestRecord = {
	createdAt: number;
	request: ServerRequest;
	requestId: RequestId;
	threadId: string;
};

export type PendingServerRequestStore = {
	delete(requestId: RequestId): Promise<void> | void;
	get(
		requestId: RequestId,
	):
		| Promise<PendingServerRequestRecord | null>
		| PendingServerRequestRecord
		| null;
	list(): Promise<PendingServerRequestRecord[]> | PendingServerRequestRecord[];
	put(record: PendingServerRequestRecord): Promise<void> | void;
	take(
		requestId: RequestId,
	):
		| Promise<PendingServerRequestRecord | null>
		| PendingServerRequestRecord
		| null;
};

export type CodexAppServerDefaults = {
	baseInstructions?: string;
	cwd?: string;
	model?: string;
	modelProvider?: string;
	source?: string;
	threadSource?: string | null;
};

export type CreateCodexAppServerOptions<
	Context = CodexAppServerRuntimeContext,
> = Omit<
	CodexAppServerRuntimeOptions<Context>,
	"sendOutgoingTransportMessage" | "store"
> & {
	defaults?: CodexAppServerDefaults;
	dynamicTools?: readonly DefinedDynamicTool<Context>[];
	pendingServerRequests?: PendingServerRequestStore;
	/** @deprecated Use threadStore. */
	store?: ThreadStore;
	threadStore?: ThreadStore;
};

export type CodexAppServerConnection<Context = CodexAppServerRuntimeContext> = {
	accept(message: unknown): Promise<void>;
	close(): Promise<void>;
	connectionId: ConnectionId;
	processor: ReturnType<
		CodexAppServerRuntime<Context>["createMessageProcessor"]
	>;
	snapshot(): CodexAppServerConnectionSnapshot;
};

export type CreateCodexAppServerConnectionOptions<
	Context = CodexAppServerRuntimeContext,
> = {
	connectionId?: ConnectionId;
	context?: Context;
	onSnapshot?: (
		snapshot: CodexAppServerConnectionSnapshot,
	) => void | Promise<void>;
	send(message: string): void | Promise<void>;
	snapshot?: CodexAppServerConnectionSnapshot | null;
};

export type CreatedCodexAppServer<Context = CodexAppServerRuntimeContext> =
	CodexAppServerRuntime<Context> & {
		createConnection(
			options: CreateCodexAppServerConnectionOptions<Context>,
		): CodexAppServerConnection<Context>;
		pendingServerRequests: PendingServerRequestStore;
	};

export class InMemoryPendingServerRequestStore implements PendingServerRequestStore {
	private readonly records = new Map<RequestId, PendingServerRequestRecord>();

	delete(requestId: RequestId): void {
		this.records.delete(requestId);
	}

	get(requestId: RequestId): PendingServerRequestRecord | null {
		return this.records.get(requestId) ?? null;
	}

	list(): PendingServerRequestRecord[] {
		return Array.from(this.records.values());
	}

	put(record: PendingServerRequestRecord): void {
		this.records.set(record.requestId, record);
	}

	take(requestId: RequestId): PendingServerRequestRecord | null {
		const record = this.get(requestId);
		this.delete(requestId);
		return record;
	}
}

export function createCodexAppServer<Context = CodexAppServerRuntimeContext>(
	options: CreateCodexAppServerOptions<Context>,
): CreatedCodexAppServer<Context> {
	const threadStore = options.threadStore ?? options.store;
	if (!threadStore) {
		throw new Error("createCodexAppServer requires threadStore.");
	}
	const dynamicTools = [...(options.dynamicTools ?? [])];
	const pendingServerRequests =
		options.pendingServerRequests ?? new InMemoryPendingServerRequestStore();
	const connections = new Map<
		ConnectionId,
		{ context?: Context; send(message: string): void | Promise<void> }
	>();
	const subscriptions = new Map<string, Set<ConnectionId>>();
	const runtime = createCodexAppServerRuntime<Context>({
		...options,
		store: threadStore,
		buildCreateThreadParams: async (input) => {
			const base = options.buildCreateThreadParams
				? await options.buildCreateThreadParams(input)
				: {
						base_instructions: {
							text:
								input.params.baseInstructions ??
								options.defaults?.baseInstructions ??
								BaseInstructions.default().text,
						},
						dynamic_tools: [],
						event_persistence_mode: ThreadEventPersistenceMode.Limited,
						metadata: {
							cwd: input.params.cwd ?? options.defaults?.cwd ?? "/",
							memory_mode: ThreadMemoryMode.Disabled,
							model:
								input.params.model ?? options.defaults?.model ?? "gpt-5-mini",
							model_provider:
								input.params.modelProvider ??
								options.defaults?.modelProvider ??
								"openai",
						},
						source: options.defaults?.source ?? "appServer",
						thread_id: input.threadId,
						thread_source:
							typeof input.params.threadSource === "string"
								? input.params.threadSource
								: (options.defaults?.threadSource ?? null),
					};
			const resolvedTools =
				(await options.resolveDynamicTools?.(input))?.map((tool) => tool) ?? [];
			return {
				...base,
				dynamic_tools: [
					...(base.dynamic_tools ?? []),
					...resolvedTools,
					...dynamicTools.map(dynamicToolSpecFromDefinition),
				],
			};
		},
		buildSessionConfiguration: async (input) => {
			const config = (await options.buildSessionConfiguration?.(input)) ?? {};
			return {
				...config,
				dynamic_tools: [
					...(config.dynamic_tools ?? []),
					...dynamicTools.map(dynamicToolSpecFromDefinition),
				],
			};
		},
		sendOutgoingTransportMessage: async (message, messageContext) => {
			const handled = await maybeExecuteDynamicTool({
				context: messageContext.context as Context | undefined,
				dynamicTools,
				message,
				runtime,
				threadId: messageContext.threadId,
			});
			if (handled) {
				return;
			}
			if (isServerRequest(message)) {
				const threadId =
					messageContext.threadId ?? serverRequestThreadId(message);
				if (threadId) {
					await pendingServerRequests.put({
						createdAt: Date.now(),
						request: message,
						requestId: message.id,
						threadId: String(threadId),
					});
				}
			}
			await sendToConnections({
				connectionIds: messageContext.connectionIds,
				connections,
				message,
				subscriptions,
				threadId: messageContext.threadId,
			});
		},
	});

	function createConnection(
		connectionOptions: CreateCodexAppServerConnectionOptions<Context>,
	): CodexAppServerConnection<Context> {
		const connectionId = connectionOptions.connectionId ?? nextConnectionId++;
		const session = CodexAppServerConnectionSessionState.fromSnapshot(
			connectionOptions.snapshot,
		);
		const processor = runtime.createMessageProcessor({
			connectionId,
			session,
		});
		connections.set(connectionId, {
			context: connectionOptions.context,
			send: connectionOptions.send,
		});
		if (session.initialized()) {
			runtime.connectionInitialized(connectionId);
		}

		async function persistSnapshot(): Promise<void> {
			await connectionOptions.onSnapshot?.(processor.session.snapshot());
		}

		return {
			async accept(message) {
				const parsed = parseServerTransportPayload(message);
				if (parsed.type === "invalid") {
					await connectionOptions.send(
						serializeJsonRpcError(parsed.id, parsed.error),
					);
					return;
				}
				switch (parsed.message.type) {
					case "client_request": {
						subscribeFromClientRequest(
							subscriptions,
							connectionId,
							parsed.message.request,
						);
						const outcome = await processor.processConnectionRequest(
							parsed.message.request,
							connectionOptions.context,
						);
						if (parsed.message.request.method === "initialize") {
							runtime.connectionInitialized(connectionId);
						}
						if (outcome.type === "response") {
							subscribeFromResult(subscriptions, connectionId, outcome.result);
						}
						await persistSnapshot();
						return;
					}
					case "response": {
						const pending = await pendingServerRequests.take(
							parsed.message.response.id,
						);
						if (pending) {
							await runtime.resolveServerRequest(
								{
									requestId: parsed.message.response.id,
									result: parsed.message.response.result,
									threadId: pending.threadId,
								},
								connectionOptions.context,
							);
						}
						await persistSnapshot();
						return;
					}
					case "error": {
						if (parsed.message.error.id !== null) {
							const pending = await pendingServerRequests.take(
								parsed.message.error.id,
							);
							if (pending) {
								await runtime.rejectServerRequest(
									{
										error: parsed.message.error.error,
										requestId: parsed.message.error.id,
										threadId: pending.threadId,
									},
									connectionOptions.context,
								);
							}
						}
						await persistSnapshot();
						return;
					}
					case "client_notification":
						await persistSnapshot();
						return;
				}
			},
			async close() {
				connections.delete(connectionId);
				for (const connectionIds of subscriptions.values()) {
					connectionIds.delete(connectionId);
				}
				await processor.connectionClosed();
				await runtime.connectionClosed(connectionId);
			},
			connectionId,
			processor,
			snapshot() {
				return processor.session.snapshot();
			},
		};
	}

	return Object.assign(runtime, {
		createConnection,
		pendingServerRequests,
	});
}

export function createCodexAppServerConnection<
	Context = CodexAppServerRuntimeContext,
>(
	appServer: CreatedCodexAppServer<Context>,
	options: CreateCodexAppServerConnectionOptions<Context>,
): CodexAppServerConnection<Context> {
	return appServer.createConnection(options);
}

async function maybeExecuteDynamicTool<Context>(input: {
	context?: Context;
	dynamicTools: readonly DefinedDynamicTool<Context>[];
	message: OutgoingMessage;
	runtime: CodexAppServerRuntime<Context>;
	threadId?: ThreadId;
}): Promise<boolean> {
	if (!isDynamicToolCallRequest(input.message) || !input.threadId) {
		return false;
	}
	const params = input.message.params;
	const tool = findDynamicTool(input.dynamicTools, params);
	if (!tool?.execute) {
		return false;
	}
	try {
		const result = await tool.execute(params.arguments, {
			callId: params.callId,
			context: input.context,
			namespace: params.namespace ?? null,
			params,
			threadId: params.threadId,
			tool: params.tool,
			turnId: params.turnId,
		});
		await input.runtime.resolveServerRequest(
			{
				requestId: input.message.id,
				result,
				threadId: input.threadId,
			},
			input.context,
		);
	} catch (error) {
		await input.runtime.resolveServerRequest(
			{
				requestId: input.message.id,
				result: dynamicToolResponse.error(
					error instanceof Error ? error.message : "Dynamic tool failed.",
				),
				threadId: input.threadId,
			},
			input.context,
		);
	}
	return true;
}

async function sendToConnections(input: {
	connectionIds?: ConnectionId[];
	connections: Map<
		ConnectionId,
		{ context?: unknown; send(message: string): void | Promise<void> }
	>;
	message: OutgoingMessage;
	subscriptions: Map<string, Set<ConnectionId>>;
	threadId?: ThreadId;
}): Promise<void> {
	const payload = serializeOutgoingMessage(input.message);
	const recipients = recipientConnectionIds(input);
	await Promise.all(
		recipients.map(async (connectionId) => {
			const connection = input.connections.get(connectionId);
			if (connection) {
				await connection.send(payload);
			}
		}),
	);
}

function recipientConnectionIds(input: {
	connectionIds?: ConnectionId[];
	connections: Map<ConnectionId, unknown>;
	subscriptions: Map<string, Set<ConnectionId>>;
	threadId?: ThreadId;
}): ConnectionId[] {
	if (input.connectionIds?.length) {
		return input.connectionIds;
	}
	if (input.threadId) {
		return Array.from(input.subscriptions.get(String(input.threadId)) ?? []);
	}
	return Array.from(input.connections.keys());
}

function subscribeFromClientRequest(
	subscriptions: Map<string, Set<ConnectionId>>,
	connectionId: ConnectionId,
	request: ClientRequest,
): void {
	const params = request.params as
		| { threadId?: unknown; thread_id?: unknown }
		| undefined;
	const threadId =
		typeof params?.threadId === "string"
			? params.threadId
			: typeof params?.thread_id === "string"
				? params.thread_id
				: null;
	if (threadId) {
		subscribe(subscriptions, connectionId, threadId);
	}
}

function subscribeFromResult(
	subscriptions: Map<string, Set<ConnectionId>>,
	connectionId: ConnectionId,
	result: unknown,
): void {
	const threadId = (result as { thread?: { id?: unknown } } | undefined)?.thread
		?.id;
	if (typeof threadId === "string") {
		subscribe(subscriptions, connectionId, threadId);
	}
}

function subscribe(
	subscriptions: Map<string, Set<ConnectionId>>,
	connectionId: ConnectionId,
	threadId: string,
): void {
	const connectionIds = subscriptions.get(threadId) ?? new Set<ConnectionId>();
	connectionIds.add(connectionId);
	subscriptions.set(threadId, connectionIds);
}

function isServerRequest(message: OutgoingMessage): message is ServerRequest {
	return "method" in message && "id" in message;
}

function isDynamicToolCallRequest(
	message: OutgoingMessage,
): message is ServerRequest & { params: DynamicToolCallParams } {
	return isServerRequest(message) && message.method === "item/tool/call";
}

export function jsonRpcErrorFromUnknown(error: unknown): JSONRPCErrorError {
	if (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		"message" in error &&
		typeof (error as { code?: unknown }).code === "number" &&
		typeof (error as { message?: unknown }).message === "string"
	) {
		return error as JSONRPCErrorError;
	}
	const nested = (error as { error?: unknown } | undefined)?.error;
	if (
		typeof nested === "object" &&
		nested !== null &&
		"code" in nested &&
		"message" in nested &&
		typeof (nested as { code?: unknown }).code === "number" &&
		typeof (nested as { message?: unknown }).message === "string"
	) {
		return nested as JSONRPCErrorError;
	}
	return {
		code:
			error instanceof CodexAppServerRequestError ? error.error.code : -32000,
		message: error instanceof Error ? error.message : "Codex request failed.",
	};
}
