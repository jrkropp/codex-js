import React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	createCodexAppServerClient,
	type ServerRequest,
	type CodexAppServer,
} from "@jrkropp/codex-js/client";
import {
	CodexChat,
	type ChatComposerHandle,
	type CodexChatComposerCommand,
	type CodexChatComposerSkill,
	type CodexChatInteractionMode,
	type CodexChatPendingRequestRenderContext,
} from "@jrkropp/codex-js/react";
import { createDefaultTurnStartParams } from "@jrkropp/codex-js/react";
import {
	billingInvoiceById,
	billingSuggestedPrompts,
	isBillingDynamicToolRequest,
	objectArguments,
	resolveBillingDynamicToolRequest,
} from "./billing-tools";
import "./styles.css";

const threadId = "00000000-0000-4000-8000-000000000146";
const apiKeyStorageKey = "codex-js:minimal-openai-api-key";
const modelStorageKey = "codex-js:minimal-openai-model";
const defaultModel = "gpt-5-mini";

function appServerWebSocketUrl(path: string): string {
	const url = new URL(path, window.location.origin);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	return url.toString();
}

function MinimalApp() {
	const [apiKey, setApiKey] = useState(() => sessionStorage.getItem(apiKeyStorageKey) ?? "");
	const [draftApiKey, setDraftApiKey] = useState(apiKey);
	const [model, setModel] = useState(() => sessionStorage.getItem(modelStorageKey) ?? defaultModel);
	const [interactionMode, setInteractionMode] =
		useState<CodexChatInteractionMode>("default");
	const [commandNotice, setCommandNotice] = useState<string | null>(null);
	const composerRef = useRef<ChatComposerHandle | null>(null);
	const hasApiKey = apiKey.trim().length > 0;
	const appServer: CodexAppServer = useMemo(
		() =>
			createCodexAppServerClient({
				url: async () => {
					const response = await fetch("/api/codex/app-server/ticket", {
						method: "POST",
						headers: {
							"x-openai-api-key": apiKey,
						},
					});
					const { ticket } = (await response.json()) as { ticket: string };
					return appServerWebSocketUrl(`/api/codex/app-server?ticket=${encodeURIComponent(ticket)}`);
				},
			}),
		[apiKey],
	);
	const handleServerRequest = useCallback(
		(request: ServerRequest) => {
			if (
				isBillingDynamicToolRequest(request) &&
				request.params.tool === "lookup_invoice"
			) {
				void appServer.resolveServerRequest(
					request.id,
					resolveBillingDynamicToolRequest(request),
				);
			}
		},
		[appServer],
	);
	const renderPendingRequest = useCallback(
		(context: CodexChatPendingRequestRenderContext) => {
			if (
				context.request.kind === "dynamicToolCall" &&
				isBillingDynamicToolRequest(context.request.request) &&
				context.request.request.params.tool === "refund_invoice"
			) {
				return <BillingRefundPanel context={context} />;
			}
			return context.defaultNode;
		},
		[],
	);
	const composerCommands = useMemo<readonly CodexChatComposerCommand[]>(
		() => [
			{
				name: "compact",
				label: "/compact",
				description: "Summarize the thread and compact context",
			},
			{
				name: "billing",
				label: "/billing",
				description: "Insert a billing-tool starter prompt",
			},
			{
				name: "new",
				label: "/new",
				description: "Start a separate chat in a host app",
				disabled: true,
				unavailableReason: "This minimal example uses one fixed thread.",
			},
			{
				name: "realtime",
				label: "/realtime",
				description: "Start realtime voice when a host provides it",
				disabled: true,
				unavailableReason: "Realtime voice is not configured in this example.",
			},
		],
		[],
	);
	const composerSkills = useMemo<readonly CodexChatComposerSkill[]>(
		() => [
			{
				name: "billing-tools",
				description: "Ask Codex to use the example billing dynamic tools",
			},
			{
				name: "plan-review",
				description: "Ask Codex to propose a plan before changing anything",
			},
		],
		[],
	);

	function saveApiKey(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const nextApiKey = draftApiKey.trim();
		if (nextApiKey) {
			sessionStorage.setItem(apiKeyStorageKey, nextApiKey);
		} else {
			sessionStorage.removeItem(apiKeyStorageKey);
		}
		sessionStorage.setItem(modelStorageKey, model.trim() || defaultModel);
		setApiKey(nextApiKey);
		setModel(model.trim() || defaultModel);
	}

	function clearApiKey() {
		sessionStorage.removeItem(apiKeyStorageKey);
		setApiKey("");
		setDraftApiKey("");
	}

	function applySuggestedPrompt(prompt: string) {
		if (prompt.toLowerCase().includes("plan")) {
			setInteractionMode("plan");
		}
		composerRef.current?.setDraft({ message: prompt });
		composerRef.current?.focusAtEnd();
	}

	function handleComposerCommand(command: string) {
		if (command === "billing") {
			applySuggestedPrompt("Use the billing tools to look up invoice INV-1001.");
			setCommandNotice("Inserted a billing-tool prompt from /billing.");
			return;
		}
		setCommandNotice(`/${command} is handled by the package or unavailable here.`);
	}

	return (
		<main className="app-shell">
			<header className="app-header">
				<div>
					<h1>Minimal Codex App Server</h1>
					<p>CodexChat + createCodexAppServerClient + createMessageProcessor</p>
				</div>
				<div className="header-actions">
					<div className="app-badge">{hasApiKey ? `OpenAI ${model}` : "Enter API key"}</div>
					{hasApiKey ? (
						<button className="ghost-button" type="button" onClick={clearApiKey}>
							Change key
						</button>
					) : null}
				</div>
			</header>
			{hasApiKey ? (
				<section className="chat-frame">
					<div className="chat-surface">
						<div className="prompt-row" aria-label="Example prompts">
							{billingSuggestedPrompts.map((prompt) => (
								<button
									className="prompt-chip"
									key={prompt}
									type="button"
									onClick={() => applySuggestedPrompt(prompt)}
								>
									{prompt}
								</button>
							))}
						</div>
						<CodexChat
							appServer={appServer}
							composerCommands={composerCommands}
							composerSkills={composerSkills}
							composerRef={composerRef}
							defaultInteractionMode="default"
							interactionMode={interactionMode}
							threadId={threadId}
							title="Minimal Codex"
							subtitle="OpenAI-backed local app server with app-owned billing tools"
							placeholder="Ask Codex anything..."
							showInteractionModeToggle
							onInteractionModeChange={setInteractionMode}
							buildThreadStartParams={({ threadId }) => ({ threadId })}
							buildTurnStartParams={(input) => ({
								...createDefaultTurnStartParams(input),
								model,
							})}
							onServerRequest={handleServerRequest}
							renderPendingRequest={renderPendingRequest}
							onCommand={handleComposerCommand}
							renderBannerItems={() =>
								commandNotice
									? [
											{
												id: "composer-command-notice",
												title: "Composer command",
												description: commandNotice,
												variant: "info",
												onDismiss: () => setCommandNotice(null),
											},
										]
									: []
							}
						/>
					</div>
				</section>
			) : (
				<section className="setup-frame">
					<form className="setup-panel" onSubmit={saveApiKey}>
						<div>
							<p className="setup-kicker">Local demo setup</p>
							<h2>Connect OpenAI</h2>
							<p>
								Enter an OpenAI API key to run the example against the Responses API.
								The key is kept in this browser session and sent only to the local Vite
								app-server endpoint.
							</p>
						</div>
						<label className="field">
							<span>OpenAI API key</span>
							<input
								autoComplete="off"
								autoFocus
								name="apiKey"
								onChange={(event) => setDraftApiKey(event.target.value)}
								placeholder="sk-..."
								type="password"
								value={draftApiKey}
							/>
						</label>
						<label className="field">
							<span>Model</span>
							<input
								name="model"
								onChange={(event) => setModel(event.target.value)}
								placeholder={defaultModel}
								type="text"
								value={model}
							/>
						</label>
						<button className="primary-button" disabled={!draftApiKey.trim()} type="submit">
							Start chat
						</button>
					</form>
				</section>
			)}
		</main>
	);
}

function BillingRefundPanel({
	context,
}: {
	context: CodexChatPendingRequestRenderContext;
}) {
	const request =
		context.request.kind === "dynamicToolCall" ? context.request.request : null;
	if (!request || !isBillingDynamicToolRequest(request)) {
		return context.defaultNode;
	}
	const args = objectArguments(request.params.arguments);
	const invoice = billingInvoiceById(args.invoiceId);
	const invoiceId = String(args.invoiceId ?? "unknown");
	const reason = String(args.reason ?? "No reason provided.");

	return (
		<div className="tool-panel">
			<div>
				<p className="tool-panel-kicker">App-owned dynamic tool</p>
				<h3>Approve refund</h3>
				<p>
					Codex requested <code>billing.refund_invoice</code>. The package owns the
					protocol request; this example app owns the business decision.
				</p>
			</div>
			<dl>
				<div>
					<dt>Invoice</dt>
					<dd>{invoiceId}</dd>
				</div>
				<div>
					<dt>Customer</dt>
					<dd>{invoice?.customer ?? "Unknown"}</dd>
				</div>
				<div>
					<dt>Amount</dt>
					<dd>{invoice?.amount ?? "Unknown"}</dd>
				</div>
				<div>
					<dt>Reason</dt>
					<dd>{reason}</dd>
				</div>
			</dl>
			<div className="tool-panel-actions">
				<button
					className="ghost-button"
					type="button"
					onClick={() => void context.reject("Refund rejected by the example app.")}
				>
					Reject
				</button>
				<button
					className="primary-button"
					type="button"
					disabled={!invoice}
					onClick={() =>
						void context.resolve(resolveBillingDynamicToolRequest(request))
					}
				>
					Approve refund
				</button>
			</div>
		</div>
	);
}

createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<MinimalApp />
	</React.StrictMode>,
);
