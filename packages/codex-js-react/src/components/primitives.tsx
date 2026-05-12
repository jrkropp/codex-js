import {
	createElement,
	type ReactNode,
	useCallback,
} from "react";

import { useCodexChatRuntime } from "./chat-runtime";

export function CodexThread({ children }: { children?: ReactNode }) {
	return createElement("div", { "data-codex-thread": "" }, children);
}

export function CodexMessages() {
	const runtime = useCodexChatRuntime();
	return createElement(
		"div",
		{ "data-codex-messages": "" },
		runtime.messages.map((message) =>
			createElement(
				"div",
				{ "data-role": message.role, key: message.id },
				message.parts
					.filter((part) => part.type === "text")
					.map((part) => part.text)
					.join("\n"),
			),
		),
	);
}

export function CodexComposer() {
	const runtime = useCodexChatRuntime();
	const sendMessage = useCallback(
		async (formData: FormData) => {
			const text = String(formData.get("message") ?? "");
			if (text.trim()) {
				await runtime.sendMessage({ text });
			}
		},
		[runtime],
	);
	return createElement(
		"form",
		{ action: sendMessage, "data-codex-composer": "" },
		createElement("textarea", { name: "message" }),
		createElement("button", { type: "submit" }, "Send"),
	);
}
