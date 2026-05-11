import {
	CodexAppServerRequestError,
	InMemoryThreadStore,
	ThreadEventPersistenceMode,
	ThreadMemoryMode,
	CodexAppServerMessageProcessor,
	createCodexAppServerRuntime,
	createModelClient,
	type AppServerEvent,
	type ClientRequest,
	type JSONRPCErrorError,
	type ModelClient,
	type RequestId,
	type Result,
} from "@jrkropp/codex-js/server";
import { billingDynamicTools } from "./billing-tools";

export type MinimalCodexEventSocket = {
	close?: () => void;
	send(event: AppServerEvent): void;
};

export type MinimalCodexAppServerContext = {
	apiKey?: string | null;
};

export type MinimalCodexAppServerOptions = {
	createModelClient?: (input: {
		context?: MinimalCodexAppServerContext;
		threadId: string;
	}) => ModelClient;
	fetch?: typeof fetch;
};

export type MinimalCodexAppServer = {
	eventsForThread(threadId: string): readonly AppServerEvent[];
	handle(
		request: ClientRequest,
		context?: MinimalCodexAppServerContext,
	): Promise<unknown>;
	processor: CodexAppServerMessageProcessor<MinimalCodexAppServerContext>;
	rejectServerRequest(
		threadId: string,
		requestId: RequestId,
		error: JSONRPCErrorError,
		context?: MinimalCodexAppServerContext,
	): Promise<void>;
	resolveServerRequest(
		threadId: string,
		requestId: RequestId,
		response: Result,
		context?: MinimalCodexAppServerContext,
	): Promise<void>;
	subscribe(threadId: string, socket: MinimalCodexEventSocket): () => void;
};

export function createMinimalCodexAppServer(
	options: MinimalCodexAppServerOptions = {},
): MinimalCodexAppServer {
	const store = new InMemoryThreadStore();
	const eventLog = new Map<string, AppServerEvent[]>();
	const subscribers = new Map<string, Set<MinimalCodexEventSocket>>();
	const runtime = createCodexAppServerRuntime<MinimalCodexAppServerContext>({
		store,
		createModelClient({ context, threadId }) {
			if (options.createModelClient) {
				return options.createModelClient({ context, threadId: String(threadId) });
			}
			const apiKey = context?.apiKey?.trim();
			if (!apiKey) {
				throw new CodexAppServerRequestError(
					{
						code: -32001,
						message: "Enter an OpenAI API key to send a message.",
					},
					401,
				);
			}
				return createModelClient({
					apiKey,
					fetch: options.fetch,
					installationId: "minimal-app-server",
					sessionId: String(threadId),
					threadId,
				});
		},
		modelClientCacheKey: ({ context, threadId }) =>
			`${threadId}:${context?.apiKey ? "api-key" : "missing-key"}`,
		sendOutgoingMessage(event, { threadId }) {
			const key = String(threadId);
			const events = eventLog.get(key) ?? [];
			events.push(event);
			eventLog.set(key, events);
			for (const socket of subscribers.get(key) ?? []) {
				socket.send(event);
			}
		},
		buildCreateThreadParams({ params, threadId }) {
			return {
				base_instructions: {
					text:
						params.baseInstructions ??
						"You are Codex running inside the minimal codex-js example. Be concise and helpful. Use the billing tools when the user asks about sample invoices or refunds. In Plan mode, ask focused questions with request_user_input when more direction is needed, and place final proposed plans inside <proposed_plan> and </proposed_plan> tags.",
				},
				dynamic_tools: [...billingDynamicTools],
				event_persistence_mode: ThreadEventPersistenceMode.Limited,
				metadata: {
					cwd: params.cwd ?? "/minimal-codex-example",
					memory_mode: ThreadMemoryMode.Disabled,
					model: params.model ?? "gpt-5-mini",
					model_provider: params.modelProvider ?? "openai",
				},
				source: "appServer",
				thread_id: threadId,
				thread_source:
					typeof params.threadSource === "string" ? params.threadSource : null,
			};
		},
		buildSessionConfiguration() {
			return {
				collaboration_mode: {
					mode: "default",
					settings: {
						developer_instructions: null,
						model: "gpt-5-mini",
						reasoning_effort: null,
					},
				},
				dynamic_tools: [...billingDynamicTools],
			};
		},
	});
	const processor = runtime.createMessageProcessor({ connectionId: 0 });

	return {
		eventsForThread(threadId) {
			return eventLog.get(threadId) ?? [];
		},
		handle(request, context) {
			return processor.processClientRequest(request, context);
		},
		processor,
		rejectServerRequest(threadId, requestId, error, context) {
			return runtime.rejectServerRequest({ error, requestId, threadId }, context);
		},
		resolveServerRequest(threadId, requestId, response, context) {
			return runtime.resolveServerRequest(
				{ requestId, result: response, threadId },
				context,
			);
		},
		subscribe(threadId, socket) {
			const sockets = subscribers.get(threadId) ?? new Set<MinimalCodexEventSocket>();
			sockets.add(socket);
			subscribers.set(threadId, sockets);
			for (const event of eventLog.get(threadId) ?? []) {
				socket.send(event);
			}
			return () => {
				sockets.delete(socket);
				if (sockets.size === 0) {
					subscribers.delete(threadId);
				}
			};
		},
	};
}
