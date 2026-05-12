import type { Socket } from "node:net";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type ViteDevServer } from "vite";
import { WebSocketServer } from "ws";
import { codexJsAliases } from "../codex-js-vite-aliases";

type MinimalCodexAppServer = ReturnType<
	(typeof import("./src/minimal-app-server"))["createMinimalCodexAppServer"]
>;

type TicketRecord = {
	apiKey: string | null;
	expiresAt: number;
};

export default defineConfig({
	resolve: {
		alias: codexJsAliases,
		dedupe: ["react", "react-dom"],
	},
	server: {
		host: "localhost",
		port: 1466,
	},
	plugins: [
		tailwindcss(),
		{
			name: "minimal-codex-app-server",
			configureServer(server) {
				const wsServer = new WebSocketServer({ noServer: true });
				const appServer = createAppServerLoader(server);
				const tickets = new Map<string, TicketRecord>();

				server.middlewares.use((request, response, next) => {
					if (
						request.method !== "POST" ||
						!request.url?.startsWith("/api/codex/app-server/ticket")
					) {
						next();
						return;
					}
					const ticket = crypto.randomUUID();
					const expiresAt = Date.now() + 60_000;
					tickets.set(ticket, {
						apiKey: request.headers["x-openai-api-key"]?.toString() ?? null,
						expiresAt,
					});
					response.setHeader("content-type", "application/json");
					response.end(JSON.stringify({ expires_at: expiresAt, ticket }));
				});

				server.httpServer?.on("upgrade", (request, socket, head) => {
					const url = request.url
						? new URL(request.url, "http://localhost")
						: null;
					if (url?.pathname !== "/api/codex/app-server") {
						return;
					}
					const ticket = url.searchParams.get("ticket");
					const ticketRecord = ticket ? tickets.get(ticket) : null;
					if (
						!ticket ||
						!ticketRecord ||
						ticketRecord.expiresAt <= Date.now()
					) {
						socket.destroy();
						return;
					}
					tickets.delete(ticket);
					void appServer().then((minimalAppServer) => {
						wsServer.handleUpgrade(
							request,
							socket as Socket,
							head,
							(webSocket) => {
								const codexSocket = webSocket as unknown as MinimalWebSocket;
								const processor = minimalAppServer.createProcessor();
								const pendingServerRequestThreads = new Map<
									string | number,
									string
								>();
								const subscriptions = new Map<string, () => void>();
								const subscribeThread = (threadId: string) => {
									if (subscriptions.has(threadId)) {
										return;
									}
									subscriptions.set(
										threadId,
										minimalAppServer.subscribe(threadId, {
											send(event) {
												const message = outgoingMessageFromEvent(event);
												if (!message) {
													return;
												}
												if (event.type === "server_request") {
													pendingServerRequestThreads.set(
														event.request.id,
														threadId,
													);
												}
												codexSocket.send(JSON.stringify(message));
											},
										}),
									);
								};

								codexSocket.on("message", (message) => {
									const parsed = parseJsonMessage(message);
									if (!isJsonObject(parsed)) {
										return;
									}
									const id = parsed.id;
									if (
										(typeof id === "string" || typeof id === "number") &&
										"result" in parsed
									) {
										const threadId = pendingServerRequestThreads.get(id);
										if (threadId) {
											void minimalAppServer.resolveServerRequest(
												threadId,
												id,
												parsed.result,
											);
										}
										return;
									}
									if (
										(typeof id === "string" || typeof id === "number") &&
										isJsonObject(parsed.error)
									) {
										const threadId = pendingServerRequestThreads.get(id);
										if (threadId) {
											void minimalAppServer.rejectServerRequest(threadId, id, {
												code:
													typeof parsed.error.code === "number"
														? parsed.error.code
														: -32000,
												message:
													typeof parsed.error.message === "string"
														? parsed.error.message
														: "Request failed.",
											});
										}
										return;
									}
									if (
										typeof parsed.method !== "string" ||
										(typeof id !== "string" && typeof id !== "number")
									) {
										return;
									}
									const threadId = threadIdFromClientRequest(parsed);
									if (threadId) {
										subscribeThread(threadId);
									}
									void minimalAppServer
										.handleWithProcessor(processor, parsed as never, {
											apiKey: ticketRecord.apiKey,
										})
										.then((result) => {
											const responseThreadId = threadIdFromResponse(result);
											if (responseThreadId) {
												subscribeThread(responseThreadId);
											}
											codexSocket.send(JSON.stringify({ id, result }));
										})
										.catch((error) => {
											codexSocket.send(
												JSON.stringify({ error: jsonRpcError(error), id }),
											);
										});
								});
								codexSocket.on("close", () => {
									for (const unsubscribe of subscriptions.values()) {
										unsubscribe();
									}
									void processor.connectionClosed();
								});
							},
						);
					});
				});
			},
		},
	],
});

function createAppServerLoader(
	server: ViteDevServer,
): () => Promise<MinimalCodexAppServer> {
	let appServer: MinimalCodexAppServer | null = null;
	return async () => {
		if (appServer) {
			return appServer;
		}
		const module = await server.ssrLoadModule("/src/minimal-app-server.ts");
		appServer = module.createMinimalCodexAppServer() as MinimalCodexAppServer;
		return appServer;
	};
}

type MinimalWebSocket = {
	on(event: "close", listener: () => void): void;
	on(event: "message", listener: (message: unknown) => void): void;
	send(message: string): void;
};

function outgoingMessageFromEvent(event: {
	notification?: unknown;
	request?: { id: string | number };
	type: string;
}): unknown | null {
	if (event.type === "server_notification") {
		return event.notification ?? null;
	}
	if (event.type === "server_request") {
		return event.request ?? null;
	}
	return null;
}

function threadIdFromClientRequest(request: {
	params?: unknown;
}): string | null {
	const params = request.params as
		| { threadId?: unknown; thread_id?: unknown }
		| undefined;
	if (typeof params?.threadId === "string") {
		return params.threadId;
	}
	if (typeof params?.thread_id === "string") {
		return params.thread_id;
	}
	return null;
}

function threadIdFromResponse(response: unknown): string | null {
	const threadId = (response as { thread?: { id?: unknown } } | undefined)
		?.thread?.id;
	return typeof threadId === "string" ? threadId : null;
}

function jsonRpcError(error: unknown) {
	if (
		isJsonObject(error) &&
		typeof error.code === "number" &&
		typeof error.message === "string"
	) {
		return error;
	}
	const nested = (error as { error?: unknown } | undefined)?.error;
	if (
		isJsonObject(nested) &&
		typeof nested.code === "number" &&
		typeof nested.message === "string"
	) {
		return nested;
	}
	return {
		code: -32000,
		message: error instanceof Error ? error.message : "Codex request failed.",
	};
}

function parseJsonMessage(message: unknown): unknown {
	const text = messageToString(message);
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

function messageToString(message: unknown): string {
	if (Buffer.isBuffer(message)) {
		return message.toString("utf8");
	}
	if (message instanceof ArrayBuffer) {
		return Buffer.from(message).toString("utf8");
	}
	if (ArrayBuffer.isView(message)) {
		return Buffer.from(
			message.buffer,
			message.byteOffset,
			message.byteLength,
		).toString("utf8");
	}
	if (Array.isArray(message)) {
		return Buffer.concat(message).toString("utf8");
	}
	return String(message);
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
