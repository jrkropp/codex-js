import type { PermissionProfile } from "../protocol";
import type { Session } from "../session/session";
import type { TurnContext } from "../session/turn-context";

export const ToolErrorKind = {
	Rejected: "rejected",
	Unavailable: "unavailable",
	Failed: "failed",
} as const;

export type ToolErrorKind = (typeof ToolErrorKind)[keyof typeof ToolErrorKind];

export class ToolError extends Error {
	constructor(
		readonly kind: ToolErrorKind,
		message: string,
	) {
		super(message);
		this.name = "ToolError";
	}

	static rejected(message: string): ToolError {
		return new ToolError(ToolErrorKind.Rejected, message);
	}

	static unavailable(message: string): ToolError {
		return new ToolError(ToolErrorKind.Unavailable, message);
	}

	static failed(message: string): ToolError {
		return new ToolError(ToolErrorKind.Failed, message);
	}
}

export type SandboxAttempt = {
	sandbox: "none" | "read-only" | "workspace-write";
	permissions?: PermissionProfile | null;
};

export type ToolCtx = {
	session: Session;
	turn: TurnContext;
	call_id: string;
	signal?: AbortSignal;
};

export interface Sandboxable {
	sandbox_preference(): "auto" | "none";
	escalate_on_failure?(): boolean;
}

export interface Approvable<TRequest> {
	approval_keys(request: TRequest): unknown[];
}

export interface ToolRuntime<TRequest, TOutput> {
	run(
		request: TRequest,
		attempt: SandboxAttempt,
		ctx: ToolCtx,
	): Promise<TOutput>;
}
