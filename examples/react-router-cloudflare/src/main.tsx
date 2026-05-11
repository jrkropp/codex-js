import { createRoot } from "react-dom/client";
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { CodexChat } from "@jrkropp/codex-js/react";
import "./styles.css";

function appServerUrl() {
	const url = new URL("/api/codex/app-server", window.location.origin);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	return url.toString();
}

const appServer = createCodexAppServerClient({
	url: appServerUrl,
});

function App() {
	return (
		<CodexChat
			appServer={appServer}
			connectOnMount={false}
			threadId="00000000-0000-4000-8000-000000000002"
			title="React Router + Cloudflare"
			subtitle="Host routes own tickets, credentials, storage, and tools"
		/>
	);
}

createRoot(document.getElementById("root")!).render(<App />);
