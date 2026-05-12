import {
	CodexAppServerRequestError,
	InMemoryThreadStore,
	createCodexAppServer,
	createCodexAppServerConnection,
	createModelClient,
	jsonRpcErrorFromUnknown,
	type CodexAppServerConnection,
	type CreatedCodexAppServer,
	type ModelClient,
} from "@jrkropp/codex-js/server";
import { billingDynamicTools } from "./billing-tools";

const DEFAULT_CWD = "/node-local-codex-example";
const DEFAULT_MODEL = "gpt-5-mini";

export type LocalCodexAppServerOptions = {
	apiKey?: string | null;
	createModelClient?: (input: { threadId: string }) => ModelClient;
	fetch?: typeof fetch;
	model?: string | null;
};

export type LocalCodexAppServer = CreatedCodexAppServer;

export type LocalCodexWebSocket = {
	close(): void;
	on(event: "close", listener: () => void): void;
	on(event: "error", listener: (error: unknown) => void): void;
	on(event: "message", listener: (message: unknown) => void): void;
	send(message: string): void;
};

export function createLocalCodexAppServer(
	options: LocalCodexAppServerOptions = {},
): LocalCodexAppServer {
	const threadStore = new InMemoryThreadStore();
	const apiKey = options.apiKey?.trim() ?? "";
	const model = options.model?.trim() || DEFAULT_MODEL;

	return createCodexAppServer({
		threadStore,
		createModelClient({ threadId }) {
			if (options.createModelClient) {
				return options.createModelClient({ threadId: String(threadId) });
			}
			if (!apiKey) {
				throw new CodexAppServerRequestError(
					{
						code: -32001,
						message:
							"Set OPENAI_API_KEY in examples/node-local/.env.local and restart the dev server.",
					},
					401,
				);
			}
			return createModelClient({
				apiKey,
				fetch: options.fetch,
				installationId: "codex-js-node-local-example",
				sessionId: String(threadId),
				threadId,
			});
		},
		modelClientCacheKey: ({ threadId }) =>
			`${String(threadId)}:${apiKey ? "configured" : "missing"}`,
		dynamicTools: billingDynamicTools,
		defaults: {
			baseInstructions:
				"You are Codex running inside the local Node codex-js example. Be concise and helpful. Use the billing tools when the user asks about sample invoices or refunds. In Plan mode, ask focused questions with request_user_input when more direction is needed, and place final proposed plans inside <proposed_plan> and </proposed_plan> tags.",
			cwd: DEFAULT_CWD,
			model,
			modelProvider: "openai",
			source: "appServer",
			threadSource: "node-local",
		},
	});
}

export function connectLocalCodexWebSocket(input: {
	appServer: LocalCodexAppServer;
	socket: LocalCodexWebSocket;
}): CodexAppServerConnection {
	const connection = createCodexAppServerConnection(input.appServer, {
		send(message) {
			input.socket.send(message);
		},
	});

	input.socket.on("message", (message) => {
		void connection.accept(message).catch((error) => {
			input.socket.send(
				JSON.stringify({
					error: jsonRpcErrorFromUnknown(error),
					id: null,
					jsonrpc: "2.0",
				}),
			);
		});
	});
	input.socket.on("close", () => {
		void connection.close();
	});
	input.socket.on("error", () => {
		void connection.close();
	});

	return connection;
}
