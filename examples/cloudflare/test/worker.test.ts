import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
	CODEX_APP_SERVER_PATH,
	CODEX_SESSION_PATH,
	webSocketUrlFromTicket,
} from "../src/shared/routes";

describe("Cloudflare Codex Worker", () => {
	it("creates one-time WebSocket tickets", async () => {
		const sessionResponse = await SELF.fetch(
			`https://example.test${CODEX_SESSION_PATH}`,
			{ method: "POST" },
		);
		expect(sessionResponse.status).toBe(200);
		const session = (await sessionResponse.json()) as {
			threadId: string;
			webSocketUrl: string;
		};
		expect(session.threadId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
		);

		const upgrade = await SELF.fetch(
			fetchUrlFromWebSocketUrl(session.webSocketUrl),
			{
				headers: { Upgrade: "websocket" },
			},
		);
		expect(upgrade.status).toBe(101);
		expect(upgrade.webSocket).toBeTruthy();
		upgrade.webSocket?.accept();
		upgrade.webSocket?.close();

		const reused = await SELF.fetch(
			fetchUrlFromWebSocketUrl(session.webSocketUrl),
			{
				headers: { Upgrade: "websocket" },
			},
		);
		expect(reused.status).toBe(401);
	});

	it("rejects missing and expired WebSocket tickets", async () => {
		const missing = await SELF.fetch(
			`https://example.test${CODEX_APP_SERVER_PATH}`,
			{ headers: { Upgrade: "websocket" } },
		);
		expect(missing.status).toBe(401);

		const sessionId = "session_expired";
		const threadId = "00000000-0000-4000-8000-000000000000";
		const ticket = `${sessionId}.expired`;
		await env.CODEX_SESSIONS.getByName(sessionId).createTicket({
			expiresAt: Date.now() - 1,
			sessionId,
			threadId,
			ticket,
		});

		const expired = await SELF.fetch(
			fetchUrlFromWebSocketUrl(
				webSocketUrlFromTicket(new Request("https://example.test/"), ticket),
			),
			{ headers: { Upgrade: "websocket" } },
		);
		expect(expired.status).toBe(401);
	});

	it("accepts app-server initialize over the Durable Object WebSocket", async () => {
		const sessionResponse = await SELF.fetch(
			`https://example.test${CODEX_SESSION_PATH}`,
			{ method: "POST" },
		);
		const session = (await sessionResponse.json()) as { webSocketUrl: string };
		const upgrade = await SELF.fetch(
			fetchUrlFromWebSocketUrl(session.webSocketUrl),
			{
				headers: { Upgrade: "websocket" },
			},
		);
		expect(upgrade.status).toBe(101);
		const socket = upgrade.webSocket;
		expect(socket).toBeTruthy();
		socket?.accept();

		const message = nextSocketMessage(socket!);
		socket?.send(
			JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					capabilities: {
						experimentalApi: true,
						optOutNotificationMethods: [],
					},
					clientInfo: {
						name: "cloudflare-example-test",
						title: "Cloudflare Example Test",
						version: "0.0.0",
					},
				},
			}),
		);

		await expect(message).resolves.toMatchObject({
			id: 1,
			result: expect.any(Object),
		});
		socket?.close();
	});
});

function nextSocketMessage(socket: WebSocket): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Timed out.")), 5_000);
		socket.addEventListener(
			"message",
			(event) => {
				clearTimeout(timeout);
				resolve(JSON.parse(String(event.data)));
			},
			{ once: true },
		);
		socket.addEventListener(
			"error",
			() => {
				clearTimeout(timeout);
				reject(new Error("WebSocket error."));
			},
			{ once: true },
		);
	});
}

function fetchUrlFromWebSocketUrl(webSocketUrl: string): string {
	const url = new URL(webSocketUrl);
	url.protocol = url.protocol === "wss:" ? "https:" : "http:";
	return url.toString();
}
