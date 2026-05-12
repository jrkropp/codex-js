import { CodexSessionObject } from "./codex-session-object";
import {
	CODEX_APP_SERVER_PATH,
	CODEX_SESSION_PATH,
	webSocketUrlFromTicket,
} from "../shared/routes";

const SESSION_TICKET_TTL_MS = 60_000;

export { CodexSessionObject };

type CodexSessionResponse = {
	expiresAt: number;
	sessionId: string;
	threadId: string;
	webSocketUrl: string;
};

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		if (request.method === "POST" && url.pathname === CODEX_SESSION_PATH) {
			return createSession(request, env);
		}
		if (url.pathname === CODEX_APP_SERVER_PATH) {
			const ticket = url.searchParams.get("ticket");
			const sessionId = sessionIdFromTicket(ticket);
			if (!ticket || !sessionId) {
				return new Response("Missing or malformed WebSocket ticket.", {
					status: 401,
				});
			}
			return env.CODEX_SESSIONS.getByName(sessionId).fetch(request);
		}
		return new Response("Not found.", { status: 404 });
	},
};

async function createSession(request: Request, env: Env): Promise<Response> {
	const sessionId = `session_${crypto.randomUUID()}`;
	const threadId = crypto.randomUUID();
	const ticketSecret = randomToken();
	const ticket = `${sessionId}.${ticketSecret}`;
	const expiresAt = Date.now() + SESSION_TICKET_TTL_MS;

	await env.CODEX_SESSIONS.getByName(sessionId).createTicket({
		expiresAt,
		sessionId,
		threadId,
		ticket,
	});

	return Response.json(
		{
			expiresAt,
			sessionId,
			threadId,
			webSocketUrl: webSocketUrlFromTicket(request, ticket),
		} satisfies CodexSessionResponse,
		{
			headers: {
				"Cache-Control": "no-store",
			},
		},
	);
}

function sessionIdFromTicket(ticket: string | null): string | null {
	const [sessionId, secret, ...rest] = ticket?.split(".") ?? [];
	if (!sessionId || !secret || rest.length > 0) {
		return null;
	}
	return sessionId;
}

function randomToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replaceAll("+", "-")
		.replaceAll("/", "_")
		.replace(/=+$/u, "");
}
