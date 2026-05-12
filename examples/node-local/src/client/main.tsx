import {
	StrictMode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
	createCodexAppServerClient,
	type CodexAppServer,
} from "@jrkropp/codex-js/client";
import {
	CodexChat,
	createDefaultTurnStartParams,
	type ChatComposerHandle,
	type CodexChatComposerCommand,
	type CodexChatComposerSkill,
	type CodexChatInteractionMode,
	type CodexChatPendingRequestRenderContext,
} from "@jrkropp/codex-js-react";
import {
	billingInvoiceById,
	billingSuggestedPrompts,
	isBillingDynamicToolRequest,
	objectArguments,
	resolveRefundInvoiceRequest,
} from "../shared/billing";
import {
	CODEX_SESSION_PATH,
	CODEX_STATUS_PATH,
	type CodexSessionResponse,
	type CodexStatusResponse,
} from "../shared/routes";
import "./styles.css";

type AppStatus =
	| { kind: "loading" }
	| { kind: "ready"; model: string; threadId: string }
	| { kind: "missing-key"; model: string; threadId: string }
	| { kind: "error"; message: string };

function NodeLocalApp() {
	const [status, setStatus] = useState<AppStatus>({ kind: "loading" });
	const [interactionMode, setInteractionMode] =
		useState<CodexChatInteractionMode>("default");
	const [commandNotice, setCommandNotice] = useState<string | null>(null);
	const composerRef = useRef<ChatComposerHandle | null>(null);
	const appServer: CodexAppServer = useMemo(
		() =>
			createCodexAppServerClient({
				url: createSessionWebSocketUrl,
			}),
		[],
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
				unavailableReason: "This local example uses one fixed thread.",
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

	useEffect(() => {
		let cancelled = false;
		void fetch(CODEX_STATUS_PATH)
			.then(async (response) => {
				if (!response.ok) {
					throw new Error(`Status request failed with ${response.status}.`);
				}
				return (await response.json()) as CodexStatusResponse;
			})
			.then((nextStatus) => {
				if (cancelled) {
					return;
				}
				setStatus(
					nextStatus.configured
						? {
								kind: "ready",
								model: nextStatus.model,
								threadId: nextStatus.threadId,
							}
						: {
								kind: "missing-key",
								model: nextStatus.model,
								threadId: nextStatus.threadId,
							},
				);
			})
			.catch((error) => {
				if (!cancelled) {
					setStatus({
						kind: "error",
						message:
							error instanceof Error
								? error.message
								: "Unable to load the local app-server status.",
					});
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	function applySuggestedPrompt(prompt: string) {
		if (prompt.toLowerCase().includes("plan")) {
			setInteractionMode("plan");
		}
		composerRef.current?.setDraft({ message: prompt });
		composerRef.current?.focusAtEnd();
	}

	function handleComposerCommand(command: string) {
		if (command === "billing") {
			applySuggestedPrompt(
				"Use the billing tools to look up invoice INV-1001.",
			);
			setCommandNotice("Inserted a billing-tool prompt from /billing.");
			return;
		}
		setCommandNotice(
			`/${command} is handled by the package or unavailable here.`,
		);
	}

	return (
		<main className="app-shell">
			<header className="app-header">
				<div>
					<h1>codex-js Node Local</h1>
					<p>Vite dev server + app-server connection + server-side tools</p>
				</div>
				<div className="header-actions">
					<div className="app-badge">{statusLabel(status)}</div>
				</div>
			</header>
			{status.kind === "ready" ? (
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
							composerRef={composerRef}
							composerSkills={composerSkills}
							defaultInteractionMode="default"
							interactionMode={interactionMode}
							threadId={status.threadId}
							title="Node Local"
							subtitle="OpenAI-backed local app-server with app-owned billing tools"
							placeholder="Ask Codex anything..."
							showInteractionModeToggle
							onInteractionModeChange={setInteractionMode}
							buildThreadStartParams={({ threadId }) => ({ threadId })}
							buildTurnStartParams={(input) => ({
								...createDefaultTurnStartParams(input),
								model: status.model,
							})}
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
					<div className="setup-panel">
						<p className="setup-kicker">Local demo setup</p>
						<h2>{setupTitle(status)}</h2>
						<p>{setupMessage(status)}</p>
						{status.kind === "missing-key" ? (
							<pre className="setup-code">
								<code>OPENAI_API_KEY=sk-...</code>
							</pre>
						) : null}
					</div>
				</section>
			)}
		</main>
	);
}

async function createSessionWebSocketUrl(): Promise<string> {
	const response = await fetch(CODEX_SESSION_PATH, { method: "POST" });
	const body = (await response.json()) as
		| CodexSessionResponse
		| { error?: string };
	if (!response.ok) {
		throw new Error(
			"error" in body && body.error
				? body.error
				: `Session request failed with ${response.status}.`,
		);
	}
	if (!("webSocketUrl" in body)) {
		throw new Error("Session response did not include a WebSocket URL.");
	}
	return body.webSocketUrl;
}

function statusLabel(status: AppStatus): string {
	switch (status.kind) {
		case "ready":
			return `OpenAI ${status.model}`;
		case "missing-key":
			return "Missing OPENAI_API_KEY";
		case "error":
			return "App-server error";
		case "loading":
			return "Loading";
	}
}

function setupTitle(status: AppStatus): string {
	switch (status.kind) {
		case "missing-key":
			return "Set the server-side OpenAI key";
		case "error":
			return "App-server unavailable";
		case "loading":
		case "ready":
			return "Starting app-server";
	}
}

function setupMessage(status: AppStatus): string {
	if (status.kind === "missing-key") {
		return "Create examples/node-local/.env.local with the key below, then restart pnpm dev:node-local. The browser never receives the key.";
	}
	if (status.kind === "error") {
		return status.message;
	}
	return "Checking the local app-server configuration.";
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
				<p className="tool-panel-kicker">Client-resolved dynamic tool</p>
				<h3>Approve refund</h3>
				<p>
					Codex requested <code>billing.refund_invoice</code>. The app-server
					keeps the request pending until this UI resolves it.
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
					onClick={() =>
						void context.reject("Refund rejected by the example app.")
					}
				>
					Reject
				</button>
				<button
					className="primary-button"
					type="button"
					disabled={!invoice}
					onClick={() =>
						void context.resolve(resolveRefundInvoiceRequest(request))
					}
				>
					Approve refund
				</button>
			</div>
		</div>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<NodeLocalApp />
	</StrictMode>,
);
