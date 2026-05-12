import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { CodexChat } from "@jrkropp/codex-js-react";
import "./styles.css";

type CodexSessionResponse = {
	expiresAt: number;
	sessionId: string;
	threadId: string;
	webSocketUrl: string;
};

function App() {
	const [session, setSession] = useState<CodexSessionResponse | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		void createSession()
			.then((nextSession) => {
				if (!cancelled) {
					setSession(nextSession);
				}
			})
			.catch((sessionError: unknown) => {
				if (!cancelled) {
					setError(
						sessionError instanceof Error
							? sessionError.message
							: "Unable to create a Codex session.",
					);
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const appServer = useMemo(
		() =>
			session
				? createCodexAppServerClient({
						initializeParams: {
							capabilities: {
								experimentalApi: true,
								optOutNotificationMethods: [],
							},
							clientInfo: {
								name: "codex-js-cloudflare-example",
								title: "codex-js Cloudflare Example",
								version: "0.3.0",
							},
						},
						url: session.webSocketUrl,
					})
				: null,
		[session],
	);

	if (error) {
		return <div className="codex-shell__loading">{error}</div>;
	}

	if (!session || !appServer) {
		return (
			<div className="codex-shell__loading">Starting Codex session...</div>
		);
	}

	return (
		<div className="codex-shell">
			<header className="codex-shell__bar">
				<h1 className="codex-shell__title">codex-js on Cloudflare</h1>
				<div className="codex-shell__status">Durable Object session</div>
			</header>
			<CodexChat
				appServer={appServer}
				buildThreadStartParams={({ threadId }) => ({
					cwd: "/cloudflare-codex-example",
					model: "gpt-5-mini",
					modelProvider: "openai",
					threadId,
				})}
				threadId={session.threadId}
				title="Cloudflare Codex"
				subtitle="Worker, Durable Object, hibernating WebSocket, and server tools"
			/>
		</div>
	);
}

async function createSession(): Promise<CodexSessionResponse> {
	const response = await fetch("/api/codex/session", {
		method: "POST",
	});
	if (!response.ok) {
		throw new Error(await response.text());
	}
	return response.json() as Promise<CodexSessionResponse>;
}

createRoot(document.getElementById("root")!).render(<App />);
