import type {
	RequestId,
	ServerNotification,
	ServerRequest,
} from "../../app-server-protocol/schema/typescript";

export type JSONRPCErrorError = {
	code: number;
	data?: unknown;
	message: string;
};

export type Result = unknown;

export type ConnectionId = number;

export type OutgoingResponse = {
	id: RequestId;
	result: Result;
};

export type OutgoingError = {
	error: JSONRPCErrorError;
	id: RequestId;
};

export type OutgoingMessage =
	| ServerRequest
	| ServerNotification
	| OutgoingResponse
	| OutgoingError;

export type QueuedOutgoingMessage = {
	message: OutgoingMessage;
	writeComplete?: () => void;
};

export const codexReference = {
	crate: "app-server-transport",
	referencePath: "app-server-transport/src/outgoing_message.rs",
	reason: "transport-level outgoing message types ported to TypeScript",
	status: "implemented",
} as const;
