export const CODEX_SESSION_PATH = "/api/codex/session";
export const CODEX_APP_SERVER_PATH = "/api/codex/app-server";

export function webSocketUrlFromTicket(
	request: Request,
	ticket: string,
): string {
	const url = new URL(CODEX_APP_SERVER_PATH, request.url);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("ticket", ticket);
	return url.toString();
}
