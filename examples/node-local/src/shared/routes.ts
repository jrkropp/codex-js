export const CODEX_APP_SERVER_PATH = "/api/codex/app-server";
export const CODEX_SESSION_PATH = "/api/codex/session";
export const CODEX_STATUS_PATH = "/api/codex/status";
export const NODE_LOCAL_THREAD_ID = "00000000-0000-4000-8000-000000000146";

export type CodexSessionResponse = {
	expiresAt: number;
	threadId: string;
	webSocketUrl: string;
};

export type CodexStatusResponse = {
	configured: boolean;
	model: string;
	threadId: string;
};

export function webSocketUrlFromTicket(origin: string, ticket: string): string {
	const url = new URL(CODEX_APP_SERVER_PATH, origin);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("ticket", ticket);
	return url.toString();
}
