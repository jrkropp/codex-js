import type { Socket } from "node:net";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv, type ViteDevServer } from "vite";
import { WebSocketServer } from "ws";
import { codexJsAliases } from "../codex-js-vite-aliases";
import {
	CODEX_APP_SERVER_PATH,
	CODEX_SESSION_PATH,
	CODEX_STATUS_PATH,
	NODE_LOCAL_THREAD_ID,
	webSocketUrlFromTicket,
	type CodexSessionResponse,
	type CodexStatusResponse,
} from "./src/shared/routes";

const DEFAULT_MODEL = "gpt-5-mini";
const SESSION_TICKET_TTL_MS = 60_000;

type AppServerModule = typeof import("./src/server/app-server");
type LocalCodexAppServer = ReturnType<
	AppServerModule["createLocalCodexAppServer"]
>;

type TicketRecord = {
	expiresAt: number;
};

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const openAiApiKey = env.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
	const model = env.OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;

	return {
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
				name: "node-local-codex-app-server",
				configureServer(server) {
					const wsServer = new WebSocketServer({ noServer: true });
					const loadAppServer = createAppServerLoader(server, {
						apiKey: openAiApiKey,
						model,
					});
					const tickets = new Map<string, TicketRecord>();

					server.middlewares.use((request, response, next) => {
						const url = request.url
							? new URL(request.url, "http://localhost")
							: null;
						if (
							request.method === "GET" &&
							url?.pathname === CODEX_STATUS_PATH
						) {
							sendJson(response, {
								configured: Boolean(openAiApiKey.trim()),
								model,
								threadId: NODE_LOCAL_THREAD_ID,
							} satisfies CodexStatusResponse);
							return;
						}
						if (
							request.method === "POST" &&
							url?.pathname === CODEX_SESSION_PATH
						) {
							if (!openAiApiKey.trim()) {
								sendJson(
									response,
									{
										error:
											"Set OPENAI_API_KEY in examples/node-local/.env.local and restart the dev server.",
									},
									500,
								);
								return;
							}
							const ticket = crypto.randomUUID();
							const expiresAt = Date.now() + SESSION_TICKET_TTL_MS;
							tickets.set(ticket, { expiresAt });
							sendJson(response, {
								expiresAt,
								threadId: NODE_LOCAL_THREAD_ID,
								webSocketUrl: webSocketUrlFromTicket(
									`http://${request.headers.host ?? "localhost:1466"}`,
									ticket,
								),
							} satisfies CodexSessionResponse);
							return;
						}
						next();
					});

					server.httpServer?.on("upgrade", (request, socket, head) => {
						const url = request.url
							? new URL(request.url, "http://localhost")
							: null;
						if (url?.pathname !== CODEX_APP_SERVER_PATH) {
							return;
						}
						const ticket = url.searchParams.get("ticket");
						const ticketRecord = ticket ? tickets.get(ticket) : null;
						if (
							!ticket ||
							!ticketRecord ||
							ticketRecord.expiresAt <= Date.now()
						) {
							rejectUpgrade(socket as Socket);
							return;
						}
						tickets.delete(ticket);
						void loadAppServer().then((loaded) => {
							wsServer.handleUpgrade(
								request,
								socket as Socket,
								head,
								(webSocket) => {
									loaded.connectWebSocket({
										appServer: loaded.appServer,
										socket: webSocket as unknown as Parameters<
											AppServerModule["connectLocalCodexWebSocket"]
										>[0]["socket"],
									});
								},
							);
						});
					});
				},
			},
		],
	};
});

function createAppServerLoader(
	server: ViteDevServer,
	options: { apiKey: string; model: string },
): () => Promise<{
	appServer: LocalCodexAppServer;
	connectWebSocket: AppServerModule["connectLocalCodexWebSocket"];
}> {
	let loaded: {
		appServer: LocalCodexAppServer;
		connectWebSocket: AppServerModule["connectLocalCodexWebSocket"];
	} | null = null;
	return async () => {
		if (loaded) {
			return loaded;
		}
		const module = (await server.ssrLoadModule(
			"/src/server/app-server.ts",
		)) as AppServerModule;
		loaded = {
			appServer: module.createLocalCodexAppServer(options),
			connectWebSocket: module.connectLocalCodexWebSocket,
		};
		return loaded;
	};
}

function sendJson(
	response: {
		end(body: string): void;
		setHeader(name: string, value: string): void;
		statusCode: number;
	},
	value: unknown,
	status = 200,
): void {
	response.statusCode = status;
	response.setHeader("cache-control", "no-store");
	response.setHeader("content-type", "application/json");
	response.end(JSON.stringify(value));
}

function rejectUpgrade(socket: Socket): void {
	socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
	socket.destroy();
}
