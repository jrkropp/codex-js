import type { RequestId } from "../../../app-server-protocol/schema/typescript";
import type { JSONRPCErrorError } from "../outgoing_message";

export class CodexAppServerRequestError extends Error {
	constructor(
		readonly error: JSONRPCErrorError,
		readonly status = 400,
	) {
		super(error.message);
		this.name = "CodexAppServerRequestError";
	}
}

export function unsupportedMethodError(
	method: string,
	requestId: RequestId,
): JSONRPCErrorError {
	return {
		code: -32601,
		data: { requestId },
		message: `Unsupported Codex App Server method: ${method}`,
	};
}

export function errorToJsonRpcError(error: unknown): JSONRPCErrorError {
	if (
		typeof error === "object" &&
		error !== null &&
		typeof (error as { code?: unknown }).code === "number" &&
		typeof (error as { message?: unknown }).message === "string"
	) {
		return error as JSONRPCErrorError;
	}
	return {
		code: -32000,
		message:
			error instanceof Error
				? error.message
				: "Codex App Server request failed.",
	};
}
