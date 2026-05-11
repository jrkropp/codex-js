import {
	createContext,
	createElement,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";

import {
	asThreadId,
	type ThreadEventSnapshot,
} from "../runtime";
import type {
	CodexAppServer,
	ThreadId,
	ThreadReader,
} from "../hooks";
import type { ChatComposerSubmitPayload } from "../upstream/t3code/apps/web/src";
import {
	defaultCodexModel,
	defaultCodexReasoningEffort,
} from "../upstream/t3code/apps/web/src/lib/modelSelection";
import type { UserInput as CoreUserInput } from "../upstream/codex-rs/core/src/protocol";
import { useCodexChatLifecycle } from "../hooks/chat-lifecycle";
import {
	createCodexChatRenderState,
	type CodexChatRenderState,
} from "./codex-chat-render-state";

export type MessagePart =
	| { type: "text"; text: string }
	| { type: "image"; url: string }
	| { type: "file"; name?: string; url: string }
	| { type: "tool-call"; input: unknown; name: string; toolCallId: string }
	| { type: "tool-result"; output: unknown; toolCallId: string };

export type ChatMessage = {
	id: string;
	metadata?: Record<string, unknown>;
	parts: MessagePart[];
	role: "assistant" | "system" | "user";
};

export type ChatRuntimeStatus =
	| "error"
	| "idle"
	| "loading"
	| "ready"
	| "streaming"
	| "submitting";

export type SendMessageInput = {
	files?: FileList | File[] | MessagePart[];
	metadata?: Record<string, unknown>;
	text?: string;
};

export type ChatRuntime = {
	error: Error | null;
	messages: ChatMessage[];
	sendMessage(input: SendMessageInput): Promise<void>;
	setThread(threadId: ThreadId | string | null): void;
	status: ChatRuntimeStatus;
	stop(): Promise<void>;
	threadId: ThreadId | string | null;
	threadSnapshot: ThreadEventSnapshot | null;
	threadState: CodexChatRenderState | null;
};

export type CodexChatRuntimeOptions = {
	appServer: CodexAppServer;
	threadReader?: ThreadReader;
	threadId?: ThreadId | string;
};

const CodexChatContext = createContext<ChatRuntime | null>(null);

export type CodexChatProviderProps = CodexChatRuntimeOptions & {
	children?: ReactNode;
};

export function CodexChatProvider({
	appServer,
	children,
	threadReader,
	threadId,
}: CodexChatProviderProps) {
	const runtime = useCodexChat({ appServer, threadReader, threadId });
	return createElement(
		CodexChatContext.Provider,
		{ value: runtime },
		children,
	);
}

export function useCodexChatRuntime(): ChatRuntime {
	const runtime = useContext(CodexChatContext);
	if (!runtime) {
		throw new Error("useCodexChatRuntime must be used inside CodexChatProvider.");
	}
	return runtime;
}

export function useCodexChat(options: CodexChatRuntimeOptions): ChatRuntime {
	const [activeThreadId, setActiveThreadId] = useState<
		ThreadId | string | null
	>(options.threadId ?? null);
	const normalizedThreadId = useMemo(
		() =>
			activeThreadId
				? normalizeThreadId(activeThreadId)
				: asThreadId("00000000-0000-4000-8000-000000000000"),
		[activeThreadId],
	);
	const lifecycle = useCodexChatLifecycle({
		appServer: options.appServer,
		connectOnMount: activeThreadId !== null,
		threadId: normalizedThreadId,
		threadReader: options.threadReader,
	});
	const threadState = useMemo(
		() =>
			createCodexChatRenderState({
				lifecycle,
				snapshot: lifecycle.threadSnapshot,
			}),
		[lifecycle],
	);
	const error = lifecycle.runtimeError ? new Error(lifecycle.runtimeError) : null;

	return {
		error,
		messages: messagesFromRenderState(threadState),
		async sendMessage(input) {
			if (!activeThreadId) {
				throw new Error("Cannot send a Codex chat message without a thread.");
			}
			const sendContext = sendContextFromMessageInput(input);
			await lifecycle.sendComposerMessage(sendContext, {
				clearComposer: () => {},
				prepareForOptimisticAppend: async () => {},
				restoreComposer: () => {},
			});
		},
		setThread(nextThreadId) {
			setActiveThreadId(nextThreadId);
		},
		status: chatRuntimeStatus(lifecycle, activeThreadId !== null),
		async stop() {
			await lifecycle.interrupt();
		},
		threadId: activeThreadId,
		threadSnapshot: lifecycle.threadSnapshot,
		threadState,
	};
}

function chatRuntimeStatus(
	lifecycle: ReturnType<typeof useCodexChatLifecycle>,
	hasThread: boolean,
): ChatRuntimeStatus {
	if (!hasThread) {
		return "idle";
	}
	if (lifecycle.runtimeError) {
		return "error";
	}
	if (
		lifecycle.connectionStatus === "connecting" ||
		lifecycle.connectionStatus === "reconnecting"
	) {
		return "loading";
	}
	if (lifecycle.isSending || lifecycle.isSendBusy) {
		return "submitting";
	}
	if (lifecycle.turnRunning || lifecycle.assistantStreaming) {
		return "streaming";
	}
	return "ready";
}

function sendContextFromMessageInput(input: SendMessageInput): ChatComposerSubmitPayload {
	const text = input.text?.trim() ?? "";
	const files = messageInputFiles(input.files);
	const fileParts =
		input.files && !isFileList(input.files) && !isFileArray(input.files)
			? input.files
			: [];
	const items: ChatComposerSubmitPayload["items"] = [
		...(text
			? [{
					text,
					text_elements: [],
					type: "text" as const,
				}]
			: []),
		...fileParts.flatMap(messagePartToComposerItem),
	];
	return {
		effort: defaultCodexReasoningEffort,
		files,
		items,
		mentionBindings: [],
		model: defaultCodexModel,
		text,
	};
}

function messageInputFiles(
	files: SendMessageInput["files"],
): ChatComposerSubmitPayload["files"] {
	if (!files) {
		return [];
	}
	if (isFileList(files)) {
		return Array.from(files);
	}
	if (isFileArray(files)) {
		return files;
	}
	return [];
}

function messagePartToComposerItem(
	part: MessagePart,
): ChatComposerSubmitPayload["items"] {
	if (part.type === "image") {
		return [{ image_url: part.url, type: "image" }];
	}
	if (part.type === "file") {
		return [{ path: part.url, type: "local_image" }];
	}
	return [];
}

function isFileList(files: SendMessageInput["files"]): files is FileList {
	return typeof FileList !== "undefined" && files instanceof FileList;
}

function isFileArray(files: SendMessageInput["files"]): files is File[] {
	return (
		typeof File !== "undefined" &&
		Array.isArray(files) &&
		files.every((file) => file instanceof File)
	);
}

function messagesFromRenderState(threadState: CodexChatRenderState): ChatMessage[] {
	return threadState.items.flatMap((item): ChatMessage[] => {
		if (item.type === "UserMessage") {
			return [
				{
					id: item.id,
					parts: item.content.flatMap(userInputToMessageParts),
					role: "user",
				},
			];
		}
		if (item.type === "AgentMessage") {
			return [
				{
					id: item.id,
					parts: item.content.map((part) => ({
						type: "text",
						text: part.text,
					})),
					role: "assistant",
				},
			];
		}
		return [];
	});
}

function userInputToMessageParts(input: CoreUserInput): MessagePart[] {
	if (input.type === "text") {
		return [{ type: "text", text: input.text }];
	}
	if (input.type === "image") {
		return [{ type: "image", url: input.image_url }];
	}
	if (input.type === "local_image") {
		return [{ type: "file", url: input.path }];
	}
	return [];
}

function normalizeThreadId(threadId: ThreadId | string): ThreadId {
	return typeof threadId === "string" ? asThreadId(threadId) : threadId;
}
