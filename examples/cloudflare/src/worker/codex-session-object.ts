import { DurableObject } from "cloudflare:workers";
import {
	CodexAppServerRequestError,
	createCodexAppServer,
	createModelClient,
	jsonRpcErrorFromUnknown,
	type CodexAppServerConnection,
	type CodexAppServerConnectionSnapshot,
	type CreatedCodexAppServer,
	type ThreadId,
} from "@jrkropp/codex-js/server";
import { cloudflareExampleTools } from "./tools";
import { DurableObjectPendingServerRequestStore } from "./pending-store";
import { DurableObjectThreadStore } from "./thread-store";

const TICKET_TTL_MS = 60_000;
const DEFAULT_MODEL = "gpt-5-mini";
const DEFAULT_CWD = "/cloudflare-codex-example";

type SqlStorage = DurableObjectStorage["sql"];

type ConnectionContext = {
	env: Env;
	sessionId: string;
	threadId: ThreadId;
};

type SocketAttachment = {
	connectionId: number;
	sessionId: string;
	threadId: ThreadId;
};

type TicketRecord = {
	expires_at: number;
	session_id: string;
	thread_id: string;
	ticket_hash: string;
};

type SnapshotRecord = {
	connection_id: number;
	snapshot_json: string;
	updated_at: number;
};

export type CreateCodexTicketInput = {
	expiresAt: number;
	sessionId: string;
	threadId: string;
	ticket: string;
};

export class CodexSessionObject extends DurableObject<Env> {
	private readonly pendingServerRequests: DurableObjectPendingServerRequestStore;
	private readonly threadStore: DurableObjectThreadStore;
	private appServer: CreatedCodexAppServer<ConnectionContext> | null = null;
	private readonly connections = new Map<
		WebSocket,
		CodexAppServerConnection<ConnectionContext>
	>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.threadStore = new DurableObjectThreadStore(ctx.storage.sql);
		this.pendingServerRequests = new DurableObjectPendingServerRequestStore(
			ctx.storage.sql,
		);
		ctx.blockConcurrencyWhile(async () => {
			this.createSchema(ctx.storage.sql);
			this.threadStore.createSchema();
			this.pendingServerRequests.createSchema();
			this.restoreHibernatedSockets();
		});
	}

	async createTicket(input: CreateCodexTicketInput): Promise<void> {
		const expiresAt = Math.min(input.expiresAt, Date.now() + TICKET_TTL_MS);
		this.ctx.storage.sql.exec(
			"INSERT OR REPLACE INTO websocket_tickets (ticket_hash, session_id, thread_id, expires_at) VALUES (?, ?, ?, ?)",
			await ticketHash(input.ticket),
			input.sessionId,
			input.threadId,
			expiresAt,
		);
		this.deleteExpiredTickets();
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("Expected WebSocket upgrade.", { status: 426 });
		}
		const url = new URL(request.url);
		const ticket = url.searchParams.get("ticket");
		if (!ticket) {
			return new Response("Missing WebSocket ticket.", { status: 401 });
		}
		const consumedTicket = await this.consumeTicket(ticket);
		if (!consumedTicket) {
			return new Response("Invalid or expired WebSocket ticket.", {
				status: 401,
			});
		}

		const webSocketPair = new WebSocketPair();
		const [client, server] = Object.values(webSocketPair) as [
			WebSocket,
			WebSocket,
		];
		const attachment: SocketAttachment = {
			connectionId: randomConnectionId(),
			sessionId: consumedTicket.session_id,
			threadId: consumedTicket.thread_id as ThreadId,
		};
		this.ctx.acceptWebSocket(server);
		this.attachSocket(server, attachment, null);

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(
		socket: WebSocket,
		message: string | ArrayBuffer,
	): Promise<void> {
		if (typeof message !== "string") {
			socket.send(
				JSON.stringify({
					error: {
						code: -32600,
						message: "Codex app-server transport expects string JSON frames.",
					},
					id: null,
					jsonrpc: "2.0",
				}),
			);
			return;
		}
		const connection = this.connectionForSocket(socket);
		await connection.accept(message);
	}

	async webSocketClose(
		socket: WebSocket,
		_code: number,
		_reason: string,
		_wasClean: boolean,
	): Promise<void> {
		const attachment = readAttachment(socket);
		const connection = this.connections.get(socket);
		this.connections.delete(socket);
		if (attachment) {
			this.deleteConnectionSnapshot(attachment.connectionId);
		}
		await connection?.close();
	}

	async webSocketError(socket: WebSocket, error: unknown): Promise<void> {
		const connection = this.connections.get(socket);
		this.connections.delete(socket);
		await connection?.close();
		try {
			socket.close(
				1011,
				error instanceof Error ? error.message : "Socket error.",
			);
		} catch {
			// The runtime may already have closed the socket.
		}
	}

	private codexAppServer(): CreatedCodexAppServer<ConnectionContext> {
		if (this.appServer) {
			return this.appServer;
		}
		this.appServer = createCodexAppServer<ConnectionContext>({
			createModelClient: ({ context, threadId }) => {
				if (!this.env.OPENAI_API_KEY) {
					throw new CodexAppServerRequestError({
						code: -32000,
						message:
							"OPENAI_API_KEY is not configured. Run `wrangler secret put OPENAI_API_KEY`.",
					});
				}
				return createModelClient({
					apiKey: this.env.OPENAI_API_KEY,
					baseUrl: this.env.OPENAI_BASE_URL,
					fetch: fetch.bind(globalThis),
					installationId: "codex-js-cloudflare-example",
					sessionId: context?.sessionId ?? String(threadId),
					threadId,
				});
			},
			defaults: {
				cwd: DEFAULT_CWD,
				model: DEFAULT_MODEL,
				modelProvider: "openai",
				source: "appServer",
				threadSource: "cloudflare",
			},
			dynamicTools: cloudflareExampleTools,
			onRuntimeError: (error) => {
				console.error(
					JSON.stringify({ error: jsonRpcErrorFromUnknown(error) }),
				);
			},
			pendingServerRequests: this.pendingServerRequests,
			runConnectionBackground: (promise) => {
				this.ctx.waitUntil(promise);
			},
			runInBackground: (promise) => {
				this.ctx.waitUntil(promise);
			},
			threadStore: this.threadStore,
		});
		return this.appServer;
	}

	private attachSocket(
		socket: WebSocket,
		attachment: SocketAttachment,
		snapshot: CodexAppServerConnectionSnapshot | null,
	): CodexAppServerConnection<ConnectionContext> {
		socket.serializeAttachment(attachment);
		const connection = this.codexAppServer().createConnection({
			connectionId: attachment.connectionId,
			context: {
				env: this.env,
				sessionId: attachment.sessionId,
				threadId: attachment.threadId,
			},
			onSnapshot: (nextSnapshot) => {
				this.writeConnectionSnapshot(attachment.connectionId, nextSnapshot);
				socket.serializeAttachment(attachment);
			},
			send: (payload) => {
				socket.send(payload);
			},
			snapshot,
		});
		this.connections.set(socket, connection);
		return connection;
	}

	private connectionForSocket(
		socket: WebSocket,
	): CodexAppServerConnection<ConnectionContext> {
		const existing = this.connections.get(socket);
		if (existing) {
			return existing;
		}
		const attachment = readAttachment(socket);
		if (!attachment) {
			throw new Error("WebSocket is missing a Codex app-server attachment.");
		}
		return this.attachSocket(
			socket,
			attachment,
			this.readConnectionSnapshot(attachment.connectionId),
		);
	}

	private restoreHibernatedSockets(): void {
		for (const socket of this.ctx.getWebSockets()) {
			const attachment = readAttachment(socket);
			if (!attachment) {
				continue;
			}
			this.attachSocket(
				socket,
				attachment,
				this.readConnectionSnapshot(attachment.connectionId),
			);
		}
	}

	private createSchema(sql: SqlStorage): void {
		sql.exec(`
			CREATE TABLE IF NOT EXISTS websocket_tickets (
				ticket_hash TEXT PRIMARY KEY,
				session_id TEXT NOT NULL,
				thread_id TEXT NOT NULL,
				expires_at INTEGER NOT NULL
			)
		`);
		sql.exec(`
			CREATE TABLE IF NOT EXISTS connection_snapshots (
				connection_id INTEGER PRIMARY KEY,
				snapshot_json TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			)
		`);
	}

	private async consumeTicket(ticket: string): Promise<TicketRecord | null> {
		const hash = await ticketHash(ticket);
		const rows = this.ctx.storage.sql
			.exec<TicketRecord>(
				"SELECT ticket_hash, session_id, thread_id, expires_at FROM websocket_tickets WHERE ticket_hash = ?",
				hash,
			)
			.toArray();
		this.ctx.storage.sql.exec(
			"DELETE FROM websocket_tickets WHERE ticket_hash = ?",
			hash,
		);
		const row = rows[0] ?? null;
		if (!row || row.expires_at < Date.now()) {
			return null;
		}
		return row;
	}

	private deleteExpiredTickets(): void {
		this.ctx.storage.sql.exec(
			"DELETE FROM websocket_tickets WHERE expires_at < ?",
			Date.now(),
		);
	}

	private readConnectionSnapshot(
		connectionId: number,
	): CodexAppServerConnectionSnapshot | null {
		const rows = this.ctx.storage.sql
			.exec<SnapshotRecord>(
				"SELECT connection_id, snapshot_json, updated_at FROM connection_snapshots WHERE connection_id = ?",
				connectionId,
			)
			.toArray();
		const row = rows[0];
		return row
			? (JSON.parse(row.snapshot_json) as CodexAppServerConnectionSnapshot)
			: null;
	}

	private writeConnectionSnapshot(
		connectionId: number,
		snapshot: CodexAppServerConnectionSnapshot,
	): void {
		this.ctx.storage.sql.exec(
			"INSERT OR REPLACE INTO connection_snapshots (connection_id, snapshot_json, updated_at) VALUES (?, ?, ?)",
			connectionId,
			JSON.stringify(snapshot),
			Date.now(),
		);
	}

	private deleteConnectionSnapshot(connectionId: number): void {
		this.ctx.storage.sql.exec(
			"DELETE FROM connection_snapshots WHERE connection_id = ?",
			connectionId,
		);
	}
}

function readAttachment(socket: WebSocket): SocketAttachment | null {
	const attachment = socket.deserializeAttachment();
	if (
		typeof attachment !== "object" ||
		attachment === null ||
		!Number.isInteger(
			(attachment as { connectionId?: unknown }).connectionId,
		) ||
		typeof (attachment as { sessionId?: unknown }).sessionId !== "string" ||
		typeof (attachment as { threadId?: unknown }).threadId !== "string"
	) {
		return null;
	}
	return attachment as SocketAttachment;
}

function randomConnectionId(): number {
	const bytes = new Uint32Array(1);
	crypto.getRandomValues(bytes);
	return bytes[0] || 1;
}

async function ticketHash(ticket: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(ticket),
	);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}
