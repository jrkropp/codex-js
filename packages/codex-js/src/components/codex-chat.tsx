import { createElement } from "react";

import {
	type CodexChatLifecycleOptions,
	createDefaultTurnStartParams,
} from "../hooks";
import type {
	CodexAppServer,
	ThreadId,
	ThreadReader,
} from "../hooks";
import {
	CodexChatView,
	type CodexChatViewLifecycleProps,
} from "./codex-chat-view";

type CodexChatLifecyclePassthroughProps = Pick<
	CodexChatLifecycleOptions,
	| "buildThreadStartParams"
	| "buildTurnStartParams"
	| "connectOnMount"
	| "initialState"
	| "isRecoverableConnectionError"
	| "onActiveThread"
	| "onRuntimeError"
	| "onServerRequest"
	| "onState"
	| "onSubmittedUserMessage"
	| "onThreadListChanged"
	| "onThreadStarted"
>;

export type CodexChatProps = Omit<
	CodexChatViewLifecycleProps,
	"lifecycle"
> &
	CodexChatLifecyclePassthroughProps & {
		appServer: CodexAppServer;
		threadId: ThreadId | string;
		threadReader?: ThreadReader;
	};

export function CodexChat({
	appServer,
	buildThreadStartParams,
	buildTurnStartParams,
	connectOnMount,
	initialState,
	isRecoverableConnectionError,
	onActiveThread,
	onRuntimeError,
	onServerRequest,
	onState,
	onSubmittedUserMessage,
	onThreadListChanged,
	onThreadStarted,
	threadId,
	threadReader,
	...viewProps
}: CodexChatProps) {
	const lifecycle: CodexChatLifecycleOptions = {
		appServer,
		buildThreadStartParams,
		buildTurnStartParams: buildTurnStartParams ?? createDefaultTurnStartParams,
		connectOnMount,
		initialState,
		isRecoverableConnectionError,
		onActiveThread,
		onRuntimeError,
		onServerRequest,
		onState,
		onSubmittedUserMessage,
		onThreadListChanged,
		onThreadStarted,
		threadId,
		threadReader,
	};
	return createElement(CodexChatView, {
		...viewProps,
		lifecycle,
	});
}
