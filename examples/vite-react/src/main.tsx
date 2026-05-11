import { createRoot } from "react-dom/client";
import type { CodexAppServer } from "@jrkropp/codex-js/client";
import { CodexChat, CodexChatLayout } from "@jrkropp/codex-js/react";
import {
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "@jrkropp/codex-js/shadcn";
import "./styles.css";

const appServer: CodexAppServer = {
	async rejectServerRequest() {},
	async request() {
		throw new Error("Connect this example to a Codex app server.");
	},
	async requestTyped() {
		throw new Error("Connect this example to a Codex app server.");
	},
	async resolveServerRequest() {},
};

function App() {
	return (
		<CodexChatLayout
			sidebar={
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>Workspace</SidebarGroupLabel>
						<SidebarGroupContent>App-owned sidebar content</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
			}
		>
			<CodexChat
				appServer={appServer}
				connectOnMount={false}
				threadId="00000000-0000-4000-8000-000000000001"
				title="codex-js"
				subtitle="Vite consumer example"
			/>
		</CodexChatLayout>
	);
}

createRoot(document.getElementById("root")!).render(<App />);
