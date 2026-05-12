import {
	SteerInputErrorKind,
	asThreadId,
	type Session,
	type Submission,
	type ThreadId,
	type UserInput as CoreUserInput,
} from "../../../core/src";
import type { CollaborationMode } from "../../../core/src/config-types";
import type {
	ThreadCompactStartParams,
	ThreadResumeParams,
	ThreadStartParams,
	TurnStartParams,
	UserInput,
} from "../../../app-server-protocol/schema/typescript/v2";
import type { AppServerEvent, JSONRPCErrorError } from "../outgoing_message";
import { CodexAppServerRequestError } from "./request_errors";

export type RuntimeSession = {
	abortController: AbortController | null;
	runPromise: Promise<unknown> | null;
	session: Session;
};

export type ProcessorEmit<Context> = (
	threadId: ThreadId,
	event: AppServerEvent,
	context?: Context,
) => Promise<void>;

export type ProcessorCreateSession<Context> = (
	threadId: ThreadId,
	params:
		| ThreadStartParams
		| ThreadResumeParams
		| TurnStartParams
		| ThreadCompactStartParams,
	context?: Context,
	submission?: Submission,
) => Promise<Session>;

export type TurnStartParamsWithClientMessageId = TurnStartParams & {
	clientMessageId?: string;
};

export type TurnStartParamsWithCollaborationMode = TurnStartParams & {
	collaborationMode?: CollaborationMode;
	collaboration_mode?: CollaborationMode;
};

export function appServerUserInputToCoreUserInput(input: UserInput): CoreUserInput {
	switch (input.type) {
		case "text":
			return {
				type: "text",
				text: input.text,
				text_elements: (input.text_elements ?? []).map((element) => ({
					byte_range: element.byteRange,
					placeholder: element.placeholder ?? undefined,
				})),
			};
		case "image":
			return { type: "image", image_url: input.url };
		case "localImage":
			return { type: "local_image", path: input.path };
		case "skill":
			return { type: "skill", name: input.name, path: input.path };
		case "mention":
			return { type: "mention", name: input.name, path: input.path };
	}
}

export function threadIdFromStartParams(params: ThreadStartParams): ThreadId {
	const maybeThreadId = (params as { threadId?: unknown }).threadId;
	return asThreadId(typeof maybeThreadId === "string" ? maybeThreadId : defaultId());
}

export function defaultId(): string {
	const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
	return crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function valueOrNull<T>(value: T | null | undefined): T | null {
	return value === undefined ? null : value;
}

export function approvalPolicyString(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

export function jsonRpcError(message: string, code: number, status: number): never {
	throw new CodexAppServerRequestError(
		{ code, message } satisfies JSONRPCErrorError,
		status,
	);
}

export function steerErrorCode(kind: SteerInputErrorKind): number {
	switch (kind) {
		case SteerInputErrorKind.EmptyInput:
			return -32602;
		case SteerInputErrorKind.NoActiveTurn:
			return -32012;
		case SteerInputErrorKind.ExpectedTurnMismatch:
			return -32013;
		case SteerInputErrorKind.ActiveTurnNotSteerable:
			return -32015;
	}
}
