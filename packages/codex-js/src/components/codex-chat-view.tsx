import {
	createElement,
	type ComponentPropsWithRef,
	type ReactElement,
	type ReactNode,
	type RefObject,
	useCallback,
	useRef,
	useState,
} from "react";
import type { LegendListRef } from "@legendapp/list/react";

import {
	type CodexChatLifecycleOptions,
	useCodexChatLifecycle,
} from "../hooks";
import {
	buildRequestUserInputResponse,
	ChatComposer,
	ChatView as T3ChatView,
	createComposerImageAttachments,
	type ChatComposerHandle,
	type ChatComposerRuntimeMode,
	type ChatComposerSubmitPayload,
	type ChatViewProps as T3ChatViewProps,
	type ChatViewRenderComposerControls,
	type ComposerBannerStackItem,
	type ProviderStatus,
	useComposerDraftStore,
} from "../upstream/t3code/apps/web/src";
import {
	buildPlanImplementationPrompt,
	resolvePlanFollowUpSubmission,
} from "../upstream/t3code/apps/web/src/components/chat/proposed-plan";
import { TooltipProvider } from "../upstream/t3code/apps/web/src/components/ui/tooltip";
import {
	createCodexChatRenderState,
	type CodexChatInteractionMode,
	type CodexChatPendingUserInputRenderContext,
	type CodexChatProposedPlan,
	type CodexChatPendingRequest,
	type CodexChatPendingRequestRenderContext,
	type CodexChatRenderState,
} from "./codex-chat-render-state";
export type CodexChatViewComposerProps =
	ComponentPropsWithRef<typeof ChatComposer>;
export type CodexChatComposerCommand = NonNullable<
	CodexChatViewComposerProps["composerCommands"]
>[number];
export type CodexChatComposerCommandName = CodexChatComposerCommand["name"];
export type CodexChatComposerSkill = NonNullable<
	CodexChatViewComposerProps["composerSkills"]
>[number];
export type CodexChatModelOption = NonNullable<
	CodexChatViewComposerProps["modelOptions"]
>[number];
export type CodexChatProviderStatus = ProviderStatus;
export type CodexChatRuntimeMode = ChatComposerRuntimeMode;

export type CodexChatViewManualProps = Omit<T3ChatViewProps, "composer"> & {
	composer: CodexChatViewComposerProps;
	lifecycle?: never;
};

export type CodexChatViewLifecycleProps = Omit<
	T3ChatViewProps,
	| "composer"
	| "listRef"
	| "onControlsChange"
	| "onIsAtEndChange"
	| "threadKey"
	| "timeline"
	| "title"
> & {
	composerCommands?: CodexChatViewComposerProps["composerCommands"];
	composerSkills?: CodexChatViewComposerProps["composerSkills"];
	composerDraftKey?: string;
	composerRef?: RefObject<ChatComposerHandle | null>;
	editorAriaLabel?: string;
	isEnvironmentUnavailable?: boolean;
	defaultInteractionMode?: CodexChatInteractionMode;
	defaultRuntimeMode?: CodexChatRuntimeMode;
	interactionMode?: CodexChatInteractionMode;
	listRef?: RefObject<LegendListRef | null>;
	lifecycle: CodexChatLifecycleOptions;
	mentionRefs?: CodexChatViewComposerProps["mentionRefs"];
	modelOptions?: CodexChatViewComposerProps["modelOptions"];
	placeholder?: string;
	providerStatus?: CodexChatProviderStatus | null;
	realtimeConversation?: CodexChatViewComposerProps["realtimeConversation"];
	renderBannerItems?: (
		state: CodexChatRenderState,
	) => readonly ComposerBannerStackItem[];
	renderPendingRequest?: (
		context: CodexChatPendingRequestRenderContext,
	) => ReactNode;
	renderPendingUserInput?: (
		context: CodexChatPendingUserInputRenderContext,
	) => ReactNode;
	renderTimelineExtras?: (context: { state: CodexChatRenderState }) => ReactNode;
	showInteractionModeToggle?: boolean;
	runtimeMode?: CodexChatRuntimeMode;
	showPlanToggle?: boolean;
	planSidebarLabel?: string;
	planSidebarOpen?: boolean;
	onCommand?: CodexChatViewComposerProps["onCommand"];
	onComposerError?: (message: string | null) => void;
	onControlsChange?: (controls: ChatViewRenderComposerControls | null) => void;
	onIsAtEndChange?: (isAtEnd: boolean) => void;
	onImplementProposedPlan?: (plan: CodexChatProposedPlan) => void;
	onInteractionModeChange?: (mode: CodexChatInteractionMode) => void;
	onRuntimeModeChange?: (mode: CodexChatRuntimeMode) => void;
	onTogglePlanSidebar?: () => void;
	threadKey?: string;
	title?: ReactNode;
};

export type CodexChatViewProps =
	| CodexChatViewLifecycleProps
	| CodexChatViewManualProps;

export function CodexChatView(props: CodexChatViewProps): ReactElement {
	if (isLifecycleCodexChatViewProps(props)) {
		return createElement(CodexLifecycleChatView, props);
	}
	const { composer, ...chatViewProps } = props;
	return createElement(
		TooltipProvider,
		null,
		createElement(T3ChatView, {
			...chatViewProps,
			composer: createElement(ChatComposer, composer),
		}),
	);
}

function CodexLifecycleChatView({
	actions,
	bannerItems = [],
	className,
	composerCommands,
	composerSkills,
	composerDraftKey,
	composerRef: externalComposerRef,
	defaultInteractionMode = "default",
	defaultRuntimeMode = "full-access",
	editorAriaLabel,
	headerLeading,
	interactionMode,
	isEnvironmentUnavailable = false,
	listRef: externalListRef,
	lifecycle: lifecycleOptions,
	mentionRefs,
	modelOptions,
	placeholder,
	providerStatus = null,
	realtimeConversation,
	renderBannerItems,
	renderPendingRequest,
	renderPendingUserInput,
	renderTimelineExtras,
	runtimeMode,
	showInteractionModeToggle = true,
	showPlanToggle = false,
	planSidebarLabel = "Plan",
	planSidebarOpen = false,
	subtitle,
	threadKey,
	title,
	onCommand,
	onComposerError,
	onControlsChange,
	onInteractionModeChange,
	onRuntimeModeChange,
	onTogglePlanSidebar,
	onImplementProposedPlan,
	onIsAtEndChange,
}: CodexChatViewLifecycleProps): ReactElement {
	const lifecycle = useCodexChatLifecycle(lifecycleOptions);
	const [localInteractionMode, setLocalInteractionMode] =
		useState<CodexChatInteractionMode>(defaultInteractionMode);
	const [localRuntimeMode, setLocalRuntimeMode] =
		useState<CodexChatRuntimeMode>(defaultRuntimeMode);
	const effectiveInteractionMode = interactionMode ?? localInteractionMode;
	const effectiveRuntimeMode = runtimeMode ?? localRuntimeMode;
	const setInteractionMode = useCallback(
		(nextMode: CodexChatInteractionMode) => {
			if (interactionMode === undefined) {
				setLocalInteractionMode(nextMode);
			}
			onInteractionModeChange?.(nextMode);
		},
		[interactionMode, onInteractionModeChange],
	);
	const setRuntimeMode = useCallback(
		(nextMode: CodexChatRuntimeMode) => {
			if (runtimeMode === undefined) {
				setLocalRuntimeMode(nextMode);
			}
			onRuntimeModeChange?.(nextMode);
		},
		[runtimeMode, onRuntimeModeChange],
	);
	const effectiveThreadKey = threadKey ?? String(lifecycle.threadId);
	const effectiveComposerDraftKey =
		composerDraftKey ?? `codex:${String(lifecycle.threadId)}`;
	const effectiveEditorAriaLabel = editorAriaLabel ?? "Message Codex";
	const effectivePlaceholder =
		placeholder ??
		"Ask anything, @tag files/folders, or use / to show available commands";
	const effectiveTitle = title ?? "Codex";
	const renderState = createCodexChatRenderState({
		interactionMode: effectiveInteractionMode,
		lifecycle,
		snapshot: lifecycle.threadSnapshot,
	});
	const activeProposedPlan = renderState.activeProposedPlan;
	const showPlanFollowUpPrompt =
		renderState.showPlanFollowUpPrompt && Boolean(activeProposedPlan);
	const pendingUserInput = renderState.composer.pendingUserInputAdapter;
	const pendingRequestRenderItems = renderPendingRequest
		? renderState.pendingRequests.flatMap((request) => {
				if (request.kind === "userInput") {
					return [];
				}
				const defaultNode = defaultPendingRequestNode(request);
				const node = renderPendingRequest({
					defaultNode,
					reject: (error) => rejectPendingRequest(request, error),
					request,
					resolve: (result) =>
						lifecycle.resolveServerRequest(request.requestId, result),
					state: renderState,
				});
				if (node === defaultNode) {
					return [];
				}
				return node ? [{ node, request }] : [];
			})
		: [];
	const customPendingRequestIds = new Set(
		pendingRequestRenderItems.map(({ request }) => request.requestId),
	);
	const customUserInputNode = pendingUserInput
		? renderPendingUserInput?.({
				defaultNode: null,
				reject: (error) => rejectPendingRequest(pendingUserInput, error),
				request: pendingUserInput,
				resolve: (result) =>
					lifecycle.resolveServerRequest(pendingUserInput.requestId, result),
				state: renderState,
			})
		: null;
	const timelineExtras = renderTimelineExtras?.({ state: renderState });
	const internalComposerRef = useRef<ChatComposerHandle | null>(null);
	const composerRef = externalComposerRef ?? internalComposerRef;
	const internalListRef = useRef<LegendListRef | null>(null);
	const listRef = externalListRef ?? internalListRef;
	const controlsRef = useRef<ChatViewRenderComposerControls | null>(null);
	const shouldAutoScrollRef = useRef(true);
	const [composerNotice, setComposerNotice] = useState<string | null>(null);
	const setComposerDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
	const addComposerDraftImages = useComposerDraftStore((store) => store.addImages);

	const setNotice = useCallback(
		(message: string | null) => {
			setComposerNotice(message);
			onComposerError?.(message);
		},
		[onComposerError],
	);
	const scheduleStickToBottom = useCallback(() => {
		controlsRef.current?.scheduleStickToBottom();
	}, []);
	function restoreComposer(sendContext: ChatComposerSubmitPayload) {
		const snapshot = composerRef.current?.readSnapshot();
		const composerIsEmpty = !snapshot || snapshot.value.trim().length === 0;
		if (!composerIsEmpty) {
			return;
		}

		const restoredImages = createComposerImageAttachments(sendContext.files);
		setComposerDraftPrompt(effectiveComposerDraftKey, sendContext.text);
		addComposerDraftImages(effectiveComposerDraftKey, restoredImages);
		composerRef.current?.setDraft({
			mentionBindings: sendContext.mentionBindings,
			message: sendContext.text,
		});
	}

	async function sendComposerMessage() {
		const sendContext = composerRef.current?.getSendContext();
		if (!sendContext) {
			setNotice("Composer is not ready. Try again.");
			return;
		}
		const activePlan = activeProposedPlan;
		const shouldSubmitPlanFollowUp =
			Boolean(activePlan) &&
			showPlanFollowUpPrompt &&
			sendContext.items.length === 0 &&
			sendContext.files.length === 0;
		const effectiveSendContext =
			shouldSubmitPlanFollowUp && activePlan
				? planImplementationSendContext(sendContext, activePlan)
				: sendContext;
		const submitInteractionMode =
			shouldSubmitPlanFollowUp && activePlan
				? resolvePlanFollowUpSubmission({
						draftText: sendContext.text,
						planMarkdown: activePlan.planMarkdown,
					}).interactionMode
				: effectiveInteractionMode;
		if (
			effectiveSendContext.items.length === 0 &&
			effectiveSendContext.files.length === 0
		) {
			return;
		}
		await lifecycle.sendComposerMessage(effectiveSendContext, {
			clearComposer: () => {
				composerRef.current?.clear();
				setNotice(null);
			},
			prepareForOptimisticAppend: async () => {
				shouldAutoScrollRef.current = true;
				await (controlsRef.current?.prepareForOptimisticAppend?.() ??
					listRef.current?.scrollToEnd?.({ animated: false }));
			},
			restoreComposer,
		}, { interactionMode: submitInteractionMode, runtimeMode: effectiveRuntimeMode });
		if (submitInteractionMode !== effectiveInteractionMode) {
			setInteractionMode(submitInteractionMode);
		}
	}

	const submitPendingUserInput: NonNullable<
		CodexChatViewComposerProps["onPendingRequestSubmit"]
	> = (response) => {
		const request = pendingUserInput;
		if (!request) {
			setNotice("Codex thread is not connected. Reconnect and try again.");
			return false;
		}
		void lifecycle.resolveServerRequest(request.requestId, response);
		return true;
	};
	const dismissPendingUserInput = () => {
		const request = pendingUserInput;
		if (!request) {
			return;
		}
		submitPendingUserInput(buildRequestUserInputResponse(request.pendingUserInput, {}));
	};
	function rejectPendingRequest(
		request: CodexChatPendingRequest,
		error: Parameters<CodexChatPendingRequestRenderContext["reject"]>[0] =
			"Codex server request was dismissed.",
	) {
		const jsonRpcError =
			typeof error === "string"
				? { code: -32000, message: error }
				: error;
		return lifecycle.rejectServerRequest(request.requestId, jsonRpcError);
	}
	const interrupt = useCallback(() => {
		void lifecycle.interrupt().then((accepted) => {
			if (!accepted) {
				setNotice(
					"Codex could not stop the active response. Reconnect and try again.",
				);
			}
		});
	}, [lifecycle, setNotice]);
	const handleCommand = useCallback<NonNullable<CodexChatViewComposerProps["onCommand"]>>(
		(command) => {
			if (command === "plan") {
				setInteractionMode("plan");
				return;
			}
			if (command === "default") {
				setInteractionMode("default");
				return;
			}
			if (command === "compact") {
				void lifecycle.compact().then((accepted) => {
					if (!accepted) {
						setNotice("Codex thread is not connected. Reconnect and try again.");
					}
				});
				return;
			}
			onCommand?.(command);
		},
		[lifecycle, onCommand, setInteractionMode, setNotice],
	);
	const implementProposedPlanInNewThread = useCallback(
		(plan: CodexChatProposedPlan) => {
			onImplementProposedPlan?.(plan);
		},
		[onImplementProposedPlan],
	);

	const lifecycleBannerItems: ComposerBannerStackItem[] = [...bannerItems];
	if (composerNotice) {
		lifecycleBannerItems.push({
			id: "composer-notice",
			title: "Composer needs attention",
			description: composerNotice,
			variant: "warning",
			onDismiss: () => setNotice(null),
		});
	}
	if (providerStatus && providerStatus.status !== "ready" && providerStatus.status !== "disabled") {
		const providerLabel =
			providerStatus.displayName?.trim() ||
			(providerStatus.driver
				? providerStatus.driver
						.split(/[-_\s]+/g)
						.filter(Boolean)
						.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
						.join(" ")
				: "Codex");
		const description =
			providerStatus.message ??
			(providerStatus.status === "error"
				? `${providerLabel} provider is unavailable.`
				: `${providerLabel} provider has limited availability.`);
		lifecycleBannerItems.push({
			description,
			id: "provider-status",
			title: `${providerLabel} provider status`,
			variant: providerStatus.status === "error" ? "error" : "warning",
		});
	}
	lifecycleBannerItems.push(
		...renderState.banners
			.filter(
				(banner) =>
					!banner.request ||
					!customPendingRequestIds.has(banner.request.requestId),
			)
			.map((banner) => ({
				...banner,
				action:
					banner.id === "runtime-error"
						? { label: "Reconnect", onClick: lifecycle.reconnect }
						: undefined,
			})),
	);
	lifecycleBannerItems.push(
		...pendingRequestRenderItems.map(({ node, request }) => ({
			id: `custom-pending-request:${request.requestId}`,
			title: "Codex needs input",
			description: node,
			variant: "info" as const,
		})),
	);
	if (customUserInputNode) {
		lifecycleBannerItems.push({
			id: `custom-pending-request:${pendingUserInput?.requestId ?? "user-input"}`,
			title: "Codex needs input",
			description: customUserInputNode,
			variant: "info",
		});
	}
	lifecycleBannerItems.push(...(renderBannerItems?.(renderState) ?? []));
	const effectiveActions = showInteractionModeToggle ? (
		<>
			<CodexInteractionModeToggle
				mode={effectiveInteractionMode}
				onChange={setInteractionMode}
			/>
			{actions}
		</>
	) : (
		actions
	);
	const chatView = (
		<TooltipProvider>
			<T3ChatView
				actions={effectiveActions}
				bannerItems={lifecycleBannerItems}
				className={className}
				headerLeading={headerLeading}
				listRef={listRef}
				subtitle={subtitle}
				threadKey={effectiveThreadKey}
				timeline={renderState.timeline}
				title={effectiveTitle}
				onControlsChange={(controls) => {
					controlsRef.current = controls;
					onControlsChange?.(controls);
				}}
				onIsAtEndChange={(isAtEnd) => {
					shouldAutoScrollRef.current = isAtEnd;
					onIsAtEndChange?.(isAtEnd);
				}}
				composer={
					<ChatComposer
						ref={composerRef}
						contextWindow={renderState.composer.contextWindow}
						disabled={
							Boolean(lifecycle.runtimeError) ||
							lifecycle.connectionStatus === "connecting" ||
							lifecycle.connectionStatus === "reconnecting"
						}
						draftKey={effectiveComposerDraftKey}
						editorAriaLabel={effectiveEditorAriaLabel}
						interactionMode={effectiveInteractionMode}
						isConnecting={
							lifecycle.connectionStatus === "connecting" ||
							lifecycle.connectionStatus === "reconnecting"
						}
						isEnvironmentUnavailable={isEnvironmentUnavailable}
						isRunning={lifecycle.turnRunning}
						isSending={lifecycle.isSending || lifecycle.isSendBusy}
						mentionRefs={mentionRefs ?? []}
						composerCommands={composerCommands}
						composerSkills={composerSkills}
						modelOptions={modelOptions}
						pendingUserInput={
							customUserInputNode ? null : renderState.composer.pendingUserInput
						}
						pendingRequestDisabled={lifecycle.connectionStatus !== "connected"}
						placeholder={effectivePlaceholder}
						planFollowUpTitle={activeProposedPlan?.title ?? null}
						planSidebarLabel={planSidebarLabel}
						planSidebarOpen={planSidebarOpen}
						realtimeConversation={realtimeConversation}
						runtimeMode={effectiveRuntimeMode}
						showInteractionModeToggle={showInteractionModeToggle}
						showPlanFollowUpPrompt={showPlanFollowUpPrompt}
						showPlanToggle={showPlanToggle}
						onCommand={handleCommand}
						onComposerError={setNotice}
						onImplementPlanInNewThread={
							activeProposedPlan && onImplementProposedPlan
								? () => implementProposedPlanInNewThread(activeProposedPlan)
								: undefined
						}
						onToggleInteractionMode={() =>
							setInteractionMode(
								effectiveInteractionMode === "plan" ? "default" : "plan",
							)
						}
						onRuntimeModeChange={setRuntimeMode}
						onTogglePlanSidebar={onTogglePlanSidebar}
						onPendingRequestDismiss={dismissPendingUserInput}
						onPendingRequestSubmit={submitPendingUserInput}
						onInterrupt={interrupt}
						scheduleStickToBottom={scheduleStickToBottom}
						shouldAutoScrollRef={shouldAutoScrollRef}
						onSend={() => void sendComposerMessage()}
					/>
				}
			/>
		</TooltipProvider>
	);
	if (!timelineExtras) {
		return chatView;
	}
	return (
		<>
			{chatView}
			{timelineExtras}
		</>
	);
}

export type {
	ChatComposerHandle,
	ChatComposerSubmitPayload,
	ChatViewRenderComposerControls as CodexChatViewRenderComposerControls,
};

function isLifecycleCodexChatViewProps(
	props: CodexChatViewProps,
): props is CodexChatViewLifecycleProps {
	return "lifecycle" in props && Boolean(props.lifecycle);
}

function defaultPendingRequestNode(request: CodexChatPendingRequest): ReactNode {
	if (request.kind === "permissions") {
		return null;
	}
	return `No default renderer is available for ${request.request.method}.`;
}

function CodexInteractionModeToggle({
	mode,
	onChange,
}: {
	mode: CodexChatInteractionMode;
	onChange: (mode: CodexChatInteractionMode) => void;
}): ReactElement {
	return (
		<div
			aria-label="Interaction mode"
			className="flex shrink-0 items-center rounded-md border bg-background p-0.5"
			role="group"
		>
			<button
				aria-pressed={mode === "default"}
				className={
					mode === "default"
						? "rounded px-2 py-1 font-medium text-foreground text-xs shadow-xs"
						: "rounded px-2 py-1 text-muted-foreground text-xs hover:text-foreground"
				}
				type="button"
				onClick={() => onChange("default")}
			>
				Build
			</button>
			<button
				aria-pressed={mode === "plan"}
				className={
					mode === "plan"
						? "rounded px-2 py-1 font-medium text-foreground text-xs shadow-xs"
						: "rounded px-2 py-1 text-muted-foreground text-xs hover:text-foreground"
				}
				type="button"
				onClick={() => onChange("plan")}
			>
				Plan
			</button>
		</div>
	);
}

function planImplementationSendContext(
	sendContext: ChatComposerSubmitPayload,
	plan: CodexChatProposedPlan,
): ChatComposerSubmitPayload {
	const text = buildPlanImplementationPrompt(plan.planMarkdown);
	return {
		...sendContext,
		files: [],
		items: [{ text, text_elements: [], type: "text" }],
		text,
	};
}
