import { useCallback, useMemo, useState } from "react";

import type { ThreadEventSnapshot } from "@jrkropp/codex-js/client";

type ChatLifecycleThreadState = Pick<
	ThreadEventSnapshot,
	"activeTurnIds" | "errors" | "pendingRequests" | "turns"
>;
type ChatLifecycleConnectionStatus = ThreadEventSnapshot["connectionStatus"];

export type LocalDispatchSnapshot = {
	errorCount: number;
	itemIds: readonly string[];
	runningTurnIds: readonly string[];
	startedAt: string;
};

export function createLocalDispatchSnapshot(
	threadState: ChatLifecycleThreadState | null,
): LocalDispatchSnapshot {
	return {
		errorCount: threadState?.errors.length ?? 0,
		itemIds: threadTurnItemIds(threadState),
		runningTurnIds: [...(threadState?.activeTurnIds ?? [])],
		startedAt: new Date().toISOString(),
	};
}

export function hasServerAcknowledgedLocalDispatch(input: {
	hasPendingRequest: boolean;
	localDispatch: LocalDispatchSnapshot | null;
	runtimeError: string | null;
	threadState: ChatLifecycleThreadState | null;
}): boolean {
	const localDispatch = input.localDispatch;
	if (!localDispatch) {
		return false;
	}
	if (input.hasPendingRequest || Boolean(input.runtimeError)) {
		return true;
	}

	const runningTurnIds = input.threadState?.activeTurnIds ?? [];
	if (
		runningTurnIds.some(
			(turnId) => !localDispatch.runningTurnIds.includes(turnId),
		)
	) {
		return true;
	}

	if (
		threadTurnItemIds(input.threadState).some(
			(itemId) => !localDispatch.itemIds.includes(itemId),
		)
	) {
		return true;
	}

	return (input.threadState?.errors.length ?? 0) > localDispatch.errorCount;
}

export function useLocalDispatchState(input: {
	hasPendingRequest: boolean;
	runtimeError: string | null;
	threadState: ChatLifecycleThreadState | null;
}) {
	const [localDispatch, setLocalDispatch] =
		useState<LocalDispatchSnapshot | null>(null);

	const beginLocalDispatch = useCallback(() => {
		setLocalDispatch((current) =>
			current ?? createLocalDispatchSnapshot(input.threadState),
		);
	}, [input.threadState]);

	const resetLocalDispatch = useCallback(() => {
		setLocalDispatch(null);
	}, []);

	const serverAcknowledgedLocalDispatch = useMemo(
		() =>
			hasServerAcknowledgedLocalDispatch({
				hasPendingRequest: input.hasPendingRequest,
				localDispatch,
				runtimeError: input.runtimeError,
				threadState: input.threadState,
			}),
		[
			input.hasPendingRequest,
			input.runtimeError,
			input.threadState,
			localDispatch,
		],
	);

	return {
		beginLocalDispatch,
		isSendBusy: localDispatch !== null && !serverAcknowledgedLocalDispatch,
		localDispatch,
		localDispatchStartedAt: localDispatch?.startedAt ?? null,
		resetLocalDispatch,
		serverAcknowledgedLocalDispatch,
	};
}

export function deriveActiveWorkStartedAt(input: {
	isWorking: boolean;
	runtimeStartedAt: string | null;
	sendStartedAt: string | null;
}): string | null {
	if (!input.isWorking) {
		return null;
	}
	return input.sendStartedAt ?? input.runtimeStartedAt;
}

export function deriveAssistantStreaming(
	threadState: ChatLifecycleThreadState | null,
): boolean {
	if (!threadState || threadState.activeTurnIds.length === 0) {
		return false;
	}

	const activeTurnIds = new Set(threadState.activeTurnIds);
	return threadState.turns.some(
		(turn) =>
			activeTurnIds.has(turn.id) &&
			turn.items.some(
				(item) => item.type === "agentMessage" && item.text.length > 0,
			),
	);
}

export function deriveChatLifecycleWorkingState(input: {
	connectionStatus: ChatLifecycleConnectionStatus;
	isSendBusy: boolean;
	threadState: ChatLifecycleThreadState | null;
}): boolean {
	return (
		Boolean(input.threadState?.activeTurnIds.length) ||
		input.isSendBusy ||
		input.connectionStatus === "connecting" ||
		input.connectionStatus === "reconnecting"
	);
}

export function threadHasStarted(
	threadState: ChatLifecycleThreadState | null,
): boolean {
	return Boolean(
		threadState &&
			(threadState.turns.some((turn) => turn.items.length > 0) ||
				threadState.activeTurnIds.length > 0 ||
				threadState.errors.length > 0 ||
				threadState.pendingRequests.length > 0),
	);
}

function threadTurnItemIds(
	threadState: ChatLifecycleThreadState | null,
): string[] {
	return threadState?.turns.flatMap((turn) => turn.items.map((item) => item.id)) ?? [];
}
