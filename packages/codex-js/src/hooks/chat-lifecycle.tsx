import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import {
	AppServerSession,
	asThreadId,
	type AppServerEvent,
	type JSONRPCErrorError,
	type Result,
	type RequestId,
	type ServerNotification,
	type ServerRequest,
	type StoredThread,
	type Thread,
	ThreadEventStore,
	threadEventSnapshotHasStarted,
	type ThreadEventSnapshot,
	type ThreadId,
	type ThreadStartParams,
	type TurnStartParams,
	type UserInput as ProtocolUserInput,
} from "../runtime";
import type { CodexAppServer, ThreadReader } from "./thread-reader";
import {
	buildOptimisticUserMessageTurnItem,
	type ChatComposerSubmitPayload,
} from "../upstream/t3code/apps/web/src";
import type { CollaborationMode } from "../upstream/codex-rs/core/src/config-types";
import type { UserMessageTurnItem } from "../upstream/codex-rs/core/src/items";
import { thread_token_usage_updated_notification_from_rollout_items } from "../upstream/codex-rs/app-server/src/request_processors/token_usage_replay";
import {
	deriveActiveWorkStartedAt,
	deriveAssistantStreaming,
	deriveChatLifecycleWorkingState,
	useLocalDispatchState,
} from "./lifecycle";

export type CodexChatLifecycleBuildThreadStartParamsInput = {
	threadId: ThreadId;
};

export type CodexChatLifecycleThreadStartParams = ThreadStartParams & {
	threadId?: ThreadId | string;
};

export type CodexChatLifecycleBuildTurnStartParamsInput = {
	clientMessageId: string;
	imageUrls: string[];
	interactionMode?: "default" | "plan";
	runtimeMode?: "approval-required" | "auto-accept-edits" | "full-access";
	sendContext: ChatComposerSubmitPayload;
	threadId: ThreadId;
};

export type CodexChatLifecycleTurnStartParams = TurnStartParams & {
	collaborationMode?: CollaborationMode;
	collaboration_mode?: CollaborationMode;
	clientMessageId?: string;
};

export type CodexChatLifecycleSendControls = {
	clearComposer: () => void;
	prepareForOptimisticAppend: () => Promise<void>;
	restoreComposer: (sendContext: ChatComposerSubmitPayload) => void;
};

export type CodexChatLifecycleSendOptions = {
	interactionMode?: "default" | "plan";
	runtimeMode?: "approval-required" | "auto-accept-edits" | "full-access";
};

export type CodexChatLifecycleOptions = {
	buildThreadStartParams?: (
		input: CodexChatLifecycleBuildThreadStartParamsInput,
	) => CodexChatLifecycleThreadStartParams;
	buildTurnStartParams?: (
		input: CodexChatLifecycleBuildTurnStartParamsInput,
	) => CodexChatLifecycleTurnStartParams;
	connectOnMount?: boolean;
	initialState?: ThreadEventSnapshot | null;
	isRecoverableConnectionError?: (error: Error) => boolean;
	onActiveThread?: (thread: StoredThread | null) => void;
	onRuntimeError?: (error: Error) => void;
	onServerRequest?: (request: ServerRequest) => void;
	onState?: (state: ThreadEventSnapshot | null) => void;
	onSubmittedUserMessage?: (state: ThreadEventSnapshot) => void;
	onThreadListChanged?: () => void;
	onThreadStarted?: (state: ThreadEventSnapshot) => void;
	appServer: CodexAppServer;
	threadReader?: ThreadReader;
	threadId: ThreadId | string;
};

export function createDefaultThreadStartParams({
	threadId,
}: CodexChatLifecycleBuildThreadStartParamsInput): CodexChatLifecycleThreadStartParams {
	return { threadId };
}

export function createDefaultTurnStartParams({
	clientMessageId,
	imageUrls,
	interactionMode = "default",
	runtimeMode,
	sendContext,
	threadId,
}: CodexChatLifecycleBuildTurnStartParamsInput): CodexChatLifecycleTurnStartParams {
	const collaborationMode =
		interactionMode === "plan"
			? ({
					mode: "plan",
					settings: {
						model: sendContext.model,
						reasoning_effort: sendContext.effort ?? null,
						developer_instructions: null,
					},
				} satisfies CollaborationMode)
			: undefined;
	return {
		clientMessageId,
		...(collaborationMode ? { collaborationMode } : {}),
		...runtimeModeToTurnPolicy(runtimeMode),
		effort: sendContext.effort,
		input: [
			...sendContext.items.map(composerUserInputToProtocolUserInput),
			...imageUrls.map((url): ProtocolUserInput => ({ type: "image", url })),
		],
		model: sendContext.model,
		threadId,
	};
}

function runtimeModeToTurnPolicy(
	runtimeMode: CodexChatLifecycleBuildTurnStartParamsInput["runtimeMode"],
): Pick<CodexChatLifecycleTurnStartParams, "approvalPolicy" | "sandboxPolicy"> {
	if (runtimeMode === "approval-required") {
		return {
			approvalPolicy: "on-request",
			sandboxPolicy: {
				type: "workspaceWrite",
				writableRoots: [],
				networkAccess: false,
				excludeTmpdirEnvVar: false,
				excludeSlashTmp: false,
			},
		};
	}
	if (runtimeMode === "auto-accept-edits") {
		return {
			approvalPolicy: "on-failure",
			sandboxPolicy: {
				type: "workspaceWrite",
				writableRoots: [],
				networkAccess: false,
				excludeTmpdirEnvVar: false,
				excludeSlashTmp: false,
			},
		};
	}
	if (runtimeMode === "full-access") {
		return {
			approvalPolicy: "never",
			sandboxPolicy: { type: "dangerFullAccess" },
		};
	}
	return {};
}

export type CodexChatLifecycle = {
	activeThread: StoredThread | null;
	activeWorkStartedAt: string | null;
	assistantStreaming: boolean;
	compact: () => Promise<boolean>;
	connectionStatus: ThreadEventSnapshot["connectionStatus"] | "idle";
	interrupt: () => Promise<boolean>;
	isSendBusy: boolean;
	isSending: boolean;
	isWorking: boolean;
	pendingPermissionRequestActive: boolean;
	pendingUserInputActive: boolean;
	reconnect: () => void;
	runtimeError: string | null;
	sendComposerMessage: (
		sendContext: ChatComposerSubmitPayload,
		controls: CodexChatLifecycleSendControls,
		options?: CodexChatLifecycleSendOptions,
	) => Promise<void>;
	resolveServerRequest: (
		requestId: RequestId,
		response: Result,
	) => Promise<boolean>;
	rejectServerRequest: (
		requestId: RequestId,
		error: JSONRPCErrorError,
	) => Promise<boolean>;
	threadSnapshot: ThreadEventSnapshot | null;
	threadId: ThreadId;
	turnRunning: boolean;
	visibleOptimisticUserMessages: readonly UserMessageTurnItem[];
};

type OptimisticUserMessage = {
	item: UserMessageTurnItem;
	threadId: ThreadId;
};

type PendingComposerSend = {
	optimisticItemId: string;
	restore: (() => void) | null;
	serverUserMessageAcknowledged: boolean;
	targetThreadId: ThreadId;
};

type ThreadRuntimeError = {
	message: string;
	threadId: ThreadId;
};

export function useCodexChatLifecycle(
	options: CodexChatLifecycleOptions,
): CodexChatLifecycle {
	const threadId = useMemo(() => normalizeThreadId(options.threadId), [options.threadId]);
	const [threadSnapshot, setThreadSnapshot] = useState<ThreadEventSnapshot | null>(
		options.initialState?.thread?.id === threadId ? options.initialState : null,
	);
	const [activeThread, setActiveThread] = useState<StoredThread | null>(null);
	const [runtimeError, setRuntimeError] = useState<ThreadRuntimeError | null>(null);
	const [isSending, setIsSending] = useState(false);
	const [reconnectToken, setReconnectToken] = useState(0);
	const [optimisticUserMessages, setOptimisticUserMessages] = useState<
		OptimisticUserMessage[]
	>([]);
	const [activeRuntimeStartedAt, setActiveRuntimeStartedAt] = useState<string | null>(
		null,
	);
	const activeRuntimeStartedAtRef = useRef<string | null>(null);
	const localDispatchStartedAtRef = useRef<string | null>(null);
	const pendingComposerSendRef = useRef<PendingComposerSend | null>(null);
	const sendInFlightRef = useRef(false);
	const threadStoreRef = useRef<ThreadEventStore | null>(
		options.initialState?.thread?.id === threadId
			? ThreadEventStore.fromThread(options.initialState.thread)
			: null,
	);
	const threadSnapshotRef = useRef<ThreadEventSnapshot | null>(threadSnapshot);
	const activeEventsIteratorRef = useRef<AsyncIterator<AppServerEvent> | null>(null);
	const lifecycleGenerationRef = useRef(0);
	const lifecycleKeyRef = useRef<string | null>(null);
	const subscriptionAbortRef = useRef<AbortController | null>(null);
	const appServerSession = useMemo(
		() => new AppServerSession(options.appServer),
		[options.appServer],
	);
	const lifecycleKey = `${threadId}:${options.connectOnMount === false ? "draft" : "server"}`;
	if (lifecycleKeyRef.current !== lifecycleKey) {
		lifecycleKeyRef.current = lifecycleKey;
		lifecycleGenerationRef.current += 1;
	}
	const visibleRuntimeError =
		runtimeError?.threadId === threadId ? runtimeError.message : null;

	const closeActiveSubscription = useCallback(() => {
		subscriptionAbortRef.current?.abort();
		subscriptionAbortRef.current = null;
		const iterator = activeEventsIteratorRef.current;
		activeEventsIteratorRef.current = null;
		void iterator?.return?.();
	}, []);

	const visibleOptimisticUserMessages = useMemo(
		() =>
			optimisticUserMessages
				.filter((message) => message.threadId === threadId)
				.map((message) => message.item),
		[optimisticUserMessages, threadId],
	);
	const setProtocolConnectionStatus = useCallback(
		(status: ThreadEventSnapshot["connectionStatus"]) => {
			const store = threadStoreRef.current;
			if (!store) {
				return;
			}
			const snapshot = store.setConnectionStatus(status);
			threadSnapshotRef.current = snapshot;
			setThreadSnapshot(snapshot);
		},
		[],
	);
	const hasPendingRequest =
		Boolean(threadSnapshot?.pendingRequests.length);
	const {
		beginLocalDispatch,
		isSendBusy,
		localDispatchStartedAt,
		resetLocalDispatch,
		serverAcknowledgedLocalDispatch,
	} = useLocalDispatchState({
		hasPendingRequest,
		runtimeError: visibleRuntimeError,
		threadState: threadSnapshot,
	});

	useEffect(() => {
		threadSnapshotRef.current = threadSnapshot;
		options.onState?.(threadSnapshot);
	}, [options, threadSnapshot]);

	useEffect(() => {
		activeRuntimeStartedAtRef.current = activeRuntimeStartedAt;
	}, [activeRuntimeStartedAt]);

	useEffect(() => {
		localDispatchStartedAtRef.current = localDispatchStartedAt;
	}, [localDispatchStartedAt]);

	const removeOptimisticUserMessage = useCallback((itemId: string) => {
		setOptimisticUserMessages((current) =>
			current.filter((message) => message.item.id !== itemId),
		);
	}, []);

	const restorePendingComposerSend = useCallback(() => {
		const pendingComposerSend = pendingComposerSendRef.current;
		if (!pendingComposerSend) {
			return;
		}
		removeOptimisticUserMessage(pendingComposerSend.optimisticItemId);
		pendingComposerSend.restore?.();
	}, [removeOptimisticUserMessage]);

	const handleRuntimeError = useCallback(
		(error: Error) => {
			options.onRuntimeError?.(error);
			if (
				options.isRecoverableConnectionError?.(error) &&
				!pendingComposerSendRef.current
			) {
				resetLocalDispatch();
				setActiveRuntimeStartedAt(null);
				setIsSending(false);
				setProtocolConnectionStatus("error");
				return;
			}

			setRuntimeError({ message: error.message, threadId });
			if (pendingComposerSendRef.current) {
				if (!pendingComposerSendRef.current.serverUserMessageAcknowledged) {
					restorePendingComposerSend();
				}
				pendingComposerSendRef.current = null;
				sendInFlightRef.current = false;
				setIsSending(false);
				resetLocalDispatch();
				setActiveRuntimeStartedAt(null);
			}
			setProtocolConnectionStatus("error");
		},
		[
			options,
			resetLocalDispatch,
			restorePendingComposerSend,
			setProtocolConnectionStatus,
			threadId,
		],
	);

	const handleSubmittedUserMessage = useCallback(
		(state: ThreadEventSnapshot) => {
			const pendingComposerSend = pendingComposerSendRef.current;
			if (pendingComposerSend) {
				pendingComposerSendRef.current = {
					...pendingComposerSend,
					serverUserMessageAcknowledged: true,
				};
			}
			sendInFlightRef.current = false;
			setIsSending(false);
			options.onThreadListChanged?.();
			options.onSubmittedUserMessage?.(state);
			pendingComposerSendRef.current = null;
		},
		[options],
	);

	const handleThreadStarted = useCallback(
		(state: ThreadEventSnapshot) => {
			const runtimeStartedAt =
				activeRuntimeStartedAtRef.current ??
				localDispatchStartedAtRef.current ??
				new Date().toISOString();
			setActiveRuntimeStartedAt((current) => current ?? runtimeStartedAt);
			if (pendingComposerSendRef.current) {
				pendingComposerSendRef.current = null;
				sendInFlightRef.current = false;
				setIsSending(false);
				options.onThreadListChanged?.();
			}
			options.onThreadStarted?.(state);
		},
		[options],
	);

	const applyServerNotification = useCallback(
		(notification: ServerNotification) => {
			const store = threadStoreRef.current;
			if (!store) {
				return;
			}
			const next = store.applyNotification(notification);
			threadSnapshotRef.current = next;
			setThreadSnapshot(next);
			if (
				notification.method === "item/completed" &&
				notification.params.item.type === "userMessage"
			) {
				window.setTimeout(() => handleSubmittedUserMessage(next), 0);
			}
			if (threadEventSnapshotHasStarted(next)) {
				window.setTimeout(() => handleThreadStarted(next), 0);
			}
		},
		[handleSubmittedUserMessage, handleThreadStarted],
	);
	const applyServerRequest = useCallback(
		(request: ServerRequest) => {
			const store = threadStoreRef.current;
			if (!store) {
				return;
			}
			const next = store.applyRequest(request);
			threadSnapshotRef.current = next;
			setThreadSnapshot(next);
		},
		[],
	);

	const connectThread = useCallback(
		async (input: { force?: boolean } = {}) => {
			const generation = lifecycleGenerationRef.current;
			const isCurrentLifecycle = (abortController: AbortController) =>
				!abortController.signal.aborted &&
				lifecycleGenerationRef.current === generation;
			closeActiveSubscription();
			const abortController = new AbortController();
			subscriptionAbortRef.current = abortController;
			try {
				setRuntimeError(null);
				let resumeThread: Thread | null = null;
				if (options.buildThreadStartParams) {
					const response = await appServerSession.threadStart(
						options.buildThreadStartParams({ threadId }),
					);
					resumeThread = response.thread;
				} else {
					const response = await appServerSession.threadResume({ threadId });
					resumeThread = response.thread;
				}
				if (!isCurrentLifecycle(abortController)) {
					return;
				}
				const currentSnapshot = threadSnapshotRef.current;
				const handoffSnapshot =
					currentSnapshot?.thread?.id === threadId &&
					threadEventSnapshotHasStarted(currentSnapshot)
						? currentSnapshot
						: options.initialState?.thread?.id === threadId
							? options.initialState
							: null;
				const shouldDeferVisibleResumeSnapshot =
					Boolean(pendingComposerSendRef.current) &&
					!handoffSnapshot &&
					currentSnapshot === null;
				const handoffWorkStartedAt =
					activeRuntimeStartedAtRef.current ?? localDispatchStartedAtRef.current;
				if (handoffWorkStartedAt) {
					setActiveRuntimeStartedAt((current) => current ?? handoffWorkStartedAt);
				}
				if (!handoffSnapshot) {
					threadStoreRef.current = ThreadEventStore.fromThread(resumeThread);
				}
				const storedThread = options.threadReader
					? await options.threadReader.readThread({
							thread_id: threadId,
							include_archived: false,
							include_history: false,
						})
					: storedThreadFromAppServerThread(resumeThread);
				const tokenUsageReplay = options.threadReader
					? await storedTokenUsageReplayNotification({
							thread: resumeThread,
							threadId,
							threadReader: options.threadReader,
						})
					: null;
				if (!isCurrentLifecycle(abortController)) {
					return;
				}
				setActiveThread(storedThread);
				options.onActiveThread?.(storedThread);
				const store = threadStoreRef.current ?? ThreadEventStore.fromThread(resumeThread);
				threadStoreRef.current = store;
				if (tokenUsageReplay) {
					store.applyNotification(tokenUsageReplay);
				}
				const nextSnapshot = store.setConnectionStatus(
					input.force ? "reconnecting" : "connecting",
				);
				if (!shouldDeferVisibleResumeSnapshot) {
					threadSnapshotRef.current = nextSnapshot;
					setThreadSnapshot(nextSnapshot);
					if (threadEventSnapshotHasStarted(nextSnapshot)) {
						window.setTimeout(() => handleThreadStarted(nextSnapshot), 0);
					}
				}
				const events = appServerSession.events();
				if (!events) {
					setProtocolConnectionStatus("connected");
					return;
				}
				if (shouldDeferVisibleResumeSnapshot) {
					store.setConnectionStatus("connected");
				} else {
					setProtocolConnectionStatus("connected");
				}
				const iterator = events[Symbol.asyncIterator]();
				activeEventsIteratorRef.current = iterator;
				void (async () => {
					try {
						while (true) {
							const result = await iterator.next();
							if (!isCurrentLifecycle(abortController)) {
								return;
							}
							if (result.done) {
								break;
							}
							applyAppServerEvent(result.value, {
								applyServerNotification,
								applyServerRequest,
								onServerRequest: options.onServerRequest,
							});
						}
						if (isCurrentLifecycle(abortController)) {
							setProtocolConnectionStatus("closed");
						}
					} catch (error) {
						if (isCurrentLifecycle(abortController)) {
							handleRuntimeError(
								error instanceof Error
									? error
									: new Error("Codex chat connection failed."),
							);
						}
					} finally {
						if (activeEventsIteratorRef.current === iterator) {
							activeEventsIteratorRef.current = null;
						}
					}
				})();
			} catch (error) {
				if (isCurrentLifecycle(abortController)) {
					handleRuntimeError(
						error instanceof Error
							? error
							: new Error("Codex chat could not connect."),
					);
				}
			}
		},
		[
			appServerSession,
			applyServerNotification,
			applyServerRequest,
			closeActiveSubscription,
			handleRuntimeError,
			handleThreadStarted,
			options,
			setProtocolConnectionStatus,
			threadId,
		],
	);

	useEffect(() => {
		if (options.connectOnMount === false) {
			closeActiveSubscription();
			setActiveThread(null);
			options.onActiveThread?.(null);
			setRuntimeError(null);
			if (!pendingComposerSendRef.current) {
				setActiveRuntimeStartedAt(null);
				threadStoreRef.current = null;
				threadSnapshotRef.current = null;
				setThreadSnapshot(null);
				setIsSending(false);
			}
			return;
		}
		void connectThread({ force: reconnectToken > 0 });
		return () => {
			closeActiveSubscription();
		};
	}, [closeActiveSubscription, connectThread, options, options.connectOnMount, reconnectToken]);

	useEffect(() => {
		if (!threadSnapshot?.turns.length || optimisticUserMessages.length === 0) {
			return;
		}

		const serverUserMessages = threadSnapshot.turns.flatMap((turn) =>
			turn.items.flatMap((item) =>
				item.type === "userMessage"
					? [
							{
								contentFingerprint: protocolUserInputFingerprint(item.content),
								id: item.id,
							},
						]
					: [],
			),
		);
		const serverUserMessageIds = new Set(
			serverUserMessages.map((message) => message.id),
		);
		const serverUserMessageFingerprints = new Set(
			serverUserMessages.map((message) => message.contentFingerprint),
		);
		const acknowledgedOptimisticIds = optimisticUserMessages.flatMap((message) => {
			if (message.threadId !== threadId) {
				return [];
			}
			if (serverUserMessageIds.has(message.item.id)) {
				return [message.item.id];
			}
			return serverUserMessageFingerprints.has(
				coreUserInputFingerprint(message.item.content),
			)
				? [message.item.id]
				: [];
		});
		if (acknowledgedOptimisticIds.length === 0) {
			return;
		}

		const timerId = window.setTimeout(() => {
			setOptimisticUserMessages((current) =>
				current.filter(
					(message) => !acknowledgedOptimisticIds.includes(message.item.id),
				),
			);
		}, 0);

		return () => window.clearTimeout(timerId);
	}, [optimisticUserMessages, threadId, threadSnapshot?.turns]);

	useEffect(() => {
		const timerId = window.setTimeout(() => {
			setOptimisticUserMessages((current) => {
				const next = current.filter((message) => message.threadId === threadId);
				return next.length === current.length ? current : next;
			});
		}, 0);

		return () => window.clearTimeout(timerId);
	}, [threadId]);

	useEffect(() => {
		if (!serverAcknowledgedLocalDispatch) {
			return;
		}
		const timerId = window.setTimeout(() => {
			resetLocalDispatch();
			sendInFlightRef.current = false;
			setIsSending(false);
		}, 0);
		return () => window.clearTimeout(timerId);
	}, [resetLocalDispatch, serverAcknowledgedLocalDispatch]);

	const connectionStatus = threadSnapshot?.connectionStatus ?? "idle";
	const turnRunning = Boolean(threadSnapshot?.activeTurnIds.length);
	const assistantStreaming = deriveAssistantStreaming(threadSnapshot);
	const isWorking = deriveChatLifecycleWorkingState({
		connectionStatus,
		isSendBusy,
		threadState: threadSnapshot,
	});
	const activeWorkStartedAt = deriveActiveWorkStartedAt({
		isWorking,
		runtimeStartedAt: activeRuntimeStartedAt,
		sendStartedAt: localDispatchStartedAt,
	});

	useEffect(() => {
		if (isWorking || activeRuntimeStartedAt === null) {
			return;
		}
		const timerId = window.setTimeout(() => {
			setActiveRuntimeStartedAt(null);
		}, 0);
		return () => window.clearTimeout(timerId);
	}, [activeRuntimeStartedAt, isWorking]);

	const resolveServerRequest = useCallback(
		async (requestId: RequestId, response: Result): Promise<boolean> => {
			try {
				await appServerSession.resolveServerRequest(requestId, response);
				return true;
			} catch (error) {
				setRuntimeError({
					message:
						error instanceof Error
							? error.message
							: "Codex server-request response failed.",
					threadId,
				});
				return false;
			}
		},
		[appServerSession, threadId],
	);
	const rejectServerRequest = useCallback(
		async (
			requestId: RequestId,
			error: JSONRPCErrorError,
		): Promise<boolean> => {
			try {
				await appServerSession.rejectServerRequest(requestId, error);
				return true;
			} catch (rejectError) {
				setRuntimeError({
					message:
						rejectError instanceof Error
							? rejectError.message
							: "Codex server-request rejection failed.",
					threadId,
				});
				return false;
			}
		},
		[appServerSession, threadId],
	);

	const sendComposerMessage = useCallback(
		async (
			sendContext: ChatComposerSubmitPayload,
			controls: CodexChatLifecycleSendControls,
			sendOptions: CodexChatLifecycleSendOptions = {},
		) => {
			if (sendInFlightRef.current || isSending || isSendBusy) {
				return;
			}
			if (sendContext.items.length === 0 && sendContext.files.length === 0) {
				return;
			}

			sendInFlightRef.current = true;
			setIsSending(true);
			beginLocalDispatch();
			try {
				const imageUrls = await Promise.all(sendContext.files.map(fileToDataUrl));
				const clientMessageId = defaultId();
				const turnStartParams = (
					options.buildTurnStartParams ?? createDefaultTurnStartParams
				)({
					clientMessageId,
					imageUrls,
					interactionMode: sendOptions.interactionMode,
					runtimeMode: sendOptions.runtimeMode,
					sendContext,
					threadId,
				});
				const optimisticItemId = optimisticUserMessageIdForClientMessageId(
					clientMessageId,
				);
				const optimisticMessage = buildOptimisticUserMessageTurnItem({
					id: optimisticItemId,
					imageUrls,
					items: sendContext.items,
				});
				pendingComposerSendRef.current = {
					optimisticItemId,
					restore: () => controls.restoreComposer(sendContext),
					serverUserMessageAcknowledged: false,
					targetThreadId: threadId,
				};
				await controls.prepareForOptimisticAppend();
				setOptimisticUserMessages((current) => [
					...current.filter((message) => message.item.id !== optimisticItemId),
					{ item: optimisticMessage, threadId },
				]);
				controls.clearComposer();
				options.onThreadListChanged?.();
				if (options.connectOnMount === false || !threadSnapshotRef.current) {
					await connectThread({ force: true });
				}
				const activeTurnId = currentActiveTurnId(threadSnapshotRef.current);
				if (activeTurnId) {
					await appServerSession.turnSteer({
						expectedTurnId: activeTurnId,
						input: turnStartParams.input,
						threadId,
					});
				} else {
					await appServerSession.turnStart(turnStartParams);
				}
			} catch (error) {
				restorePendingComposerSend();
				pendingComposerSendRef.current = null;
				sendInFlightRef.current = false;
				resetLocalDispatch();
				setActiveRuntimeStartedAt(null);
				setIsSending(false);
				setRuntimeError({
					message:
						error instanceof Error ? error.message : "Codex could not send the message.",
					threadId,
				});
			}
		},
		[
			beginLocalDispatch,
			appServerSession,
			connectThread,
			isSendBusy,
			isSending,
			options,
			resetLocalDispatch,
			restorePendingComposerSend,
			threadId,
		],
	);

	const interrupt = useCallback(async () => {
		const turnId = currentActiveTurnId(threadSnapshotRef.current);
		if (!turnId) {
			setRuntimeError({
				message: "Codex has no active response to stop.",
				threadId,
			});
			return false;
		}
		try {
			await appServerSession.turnInterrupt({ threadId, turnId });
		} catch (error) {
			setRuntimeError({
				message:
					error instanceof Error
						? error.message
						: "Codex could not stop the active response.",
				threadId,
			});
			return false;
		}
		if (pendingComposerSendRef.current) {
			removeOptimisticUserMessage(pendingComposerSendRef.current.optimisticItemId);
		}
		pendingComposerSendRef.current = null;
		sendInFlightRef.current = false;
		resetLocalDispatch();
		setActiveRuntimeStartedAt(null);
		setIsSending(false);
		return true;
	}, [appServerSession, removeOptimisticUserMessage, resetLocalDispatch, threadId]);

	const compact = useCallback(async () => {
		if (turnRunning || isSending || isSendBusy) {
			setRuntimeError({
				message: "Wait for the current response to finish before compacting.",
				threadId,
			});
			return false;
		}
		try {
			await appServerSession.threadCompactStart({ threadId });
			return true;
		} catch (error) {
			setRuntimeError({
				message: error instanceof Error ? error.message : "Codex compact failed.",
				threadId,
			});
			return false;
		}
	}, [appServerSession, isSendBusy, isSending, threadId, turnRunning]);

	const reconnect = useCallback(() => {
		closeActiveSubscription();
		if (pendingComposerSendRef.current) {
			removeOptimisticUserMessage(pendingComposerSendRef.current.optimisticItemId);
		}
		pendingComposerSendRef.current = null;
		sendInFlightRef.current = false;
		setIsSending(false);
		resetLocalDispatch();
		setActiveRuntimeStartedAt(null);
		setRuntimeError(null);
		setProtocolConnectionStatus("reconnecting");
		setReconnectToken((current) => current + 1);
	}, [
		closeActiveSubscription,
		removeOptimisticUserMessage,
		resetLocalDispatch,
		setProtocolConnectionStatus,
	]);

	return {
		activeThread,
		activeWorkStartedAt,
		assistantStreaming,
		compact,
		connectionStatus,
		interrupt,
		isSendBusy,
		isSending,
		isWorking,
		pendingPermissionRequestActive: Boolean(
			threadSnapshot?.pendingRequests.some(
				(request) => request.method === "item/permissions/requestApproval",
			),
		),
		pendingUserInputActive: Boolean(
			threadSnapshot?.pendingRequests.some(
				(request) => request.method === "item/tool/requestUserInput",
			),
		),
		reconnect,
		rejectServerRequest,
		runtimeError: visibleRuntimeError,
		sendComposerMessage,
		resolveServerRequest,
		threadSnapshot,
		threadId,
		turnRunning,
		visibleOptimisticUserMessages,
	};
}

function normalizeThreadId(threadId: ThreadId | string): ThreadId {
	return typeof threadId === "string" ? asThreadId(threadId) : threadId;
}

function optimisticUserMessageIdForClientMessageId(clientMessageId: string): string {
	return `user-${clientMessageId}`;
}

function fileToDataUrl(file: File): Promise<string> {
	const blob = new Blob([file], { type: file.type || "image/png" });

	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
		reader.readAsDataURL(blob);
	});
}

function defaultId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function currentActiveTurnId(snapshot: ThreadEventSnapshot | null): string | null {
	return snapshot?.activeTurnIds.at(-1) ?? null;
}

function protocolUserInputFingerprint(items: readonly ProtocolUserInput[]): string {
	return JSON.stringify(items.map(protocolUserInputFingerprintPart));
}

function protocolUserInputFingerprintPart(item: ProtocolUserInput) {
	switch (item.type) {
		case "text":
			return { text: item.text, type: "text" };
		case "image":
			return { type: "image", url: item.url };
		case "localImage":
			return { path: item.path, type: "localImage" };
		case "skill":
			return { name: item.name, path: item.path, type: "skill" };
		case "mention":
			return { name: item.name, path: item.path, type: "mention" };
	}
}

function coreUserInputFingerprint(
	items: readonly UserMessageTurnItem["content"][number][],
): string {
	return JSON.stringify(items.map(coreUserInputFingerprintPart));
}

function coreUserInputFingerprintPart(
	item: UserMessageTurnItem["content"][number],
) {
	switch (item.type) {
		case "text":
			return { text: item.text, type: "text" };
		case "image":
			return { type: "image", url: item.image_url };
		case "local_image":
			return { path: item.path, type: "localImage" };
		case "skill":
			return { name: item.name, path: item.path, type: "skill" };
		case "mention":
			return { name: item.name, path: item.path, type: "mention" };
	}
}

function composerUserInputToProtocolUserInput(
	item: ChatComposerSubmitPayload["items"][number],
): ProtocolUserInput {
	switch (item.type) {
		case "text":
			return {
				text: item.text,
				text_elements: (item.text_elements ?? []).map((element) => ({
					byteRange: element.byte_range,
					placeholder: element.placeholder ?? null,
				})),
				type: "text",
			};
		case "image":
			return { type: "image", url: item.image_url };
		case "local_image":
			return { path: item.path, type: "localImage" };
		case "skill":
			return { name: item.name, path: item.path, type: "skill" };
		case "mention":
			return { name: item.name, path: item.path, type: "mention" };
	}
}

async function storedTokenUsageReplayNotification(input: {
	thread: Thread;
	threadId: ThreadId;
	threadReader: ThreadReader;
}): Promise<ServerNotification | null> {
	try {
		const history = await input.threadReader.loadHistory({
			thread_id: input.threadId,
			include_archived: false,
		});
		return thread_token_usage_updated_notification_from_rollout_items({
			rolloutItems: history.items,
			thread: input.thread,
			threadId: input.threadId,
		});
	} catch {
		return null;
	}
}

function storedThreadFromAppServerThread(thread: Thread): StoredThread {
	return {
		thread_id: asThreadId(thread.id),
		rollout_path: thread.path ?? null,
		forked_from_id: thread.forkedFromId ? asThreadId(thread.forkedFromId) : null,
		preview: thread.preview,
		name: thread.name,
		model_provider: thread.modelProvider,
		model: null,
		reasoning_effort: null,
		created_at: new Date(thread.createdAt * 1000).toISOString(),
		updated_at: new Date(thread.updatedAt * 1000).toISOString(),
		archived_at: null,
		cwd: thread.cwd,
		cli_version: thread.cliVersion,
		source: typeof thread.source === "string" ? thread.source : "custom",
		thread_source: typeof thread.threadSource === "string" ? thread.threadSource : null,
		agent_nickname: thread.agentNickname,
		agent_role: thread.agentRole,
		git_info: thread.gitInfo,
		history: null,
	};
}

function applyAppServerEvent(
	event: AppServerEvent,
	handlers: {
		applyServerNotification: (notification: ServerNotification) => void;
		applyServerRequest: (request: ServerRequest) => void;
		onServerRequest?: (request: ServerRequest) => void;
	},
) {
	switch (event.type) {
		case "server_notification":
			handlers.applyServerNotification(event.notification);
			return;
		case "server_request":
			handlers.applyServerRequest(event.request);
			handlers.onServerRequest?.(event.request);
			return;
		case "disconnected":
			throw new Error(event.message);
		case "lagged":
			return;
	}
}
