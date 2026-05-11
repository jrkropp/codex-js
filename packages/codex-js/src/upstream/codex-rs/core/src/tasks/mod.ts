import type { Session } from "../session/session";
import type { TurnContext } from "../session/turn-context";
import type { UserInput } from "../protocol";

export const TaskKind = {
	Regular: "Regular",
	Compact: "Compact",
	Review: "Review",
} as const;

export type TaskKind = (typeof TaskKind)[keyof typeof TaskKind];

export type SessionTaskResult = {
	last_agent_message: string | null;
	steps?: number;
	message?: string;
};

export class SessionTaskContext {
	private readonly session: Session;

	constructor(session: Session) {
		this.session = session;
	}

	clone_session(): Session {
		return this.session;
	}
}

export type SessionTaskRunInput = {
	session: SessionTaskContext;
	ctx: TurnContext;
	input: UserInput[];
	signal?: AbortSignal;
};

export interface SessionTask {
	kind(): TaskKind;
	span_name(): string;
	records_turn_token_usage_on_span(): boolean;
	run(input: SessionTaskRunInput): Promise<SessionTaskResult>;
	abort?(input: {
		session: SessionTaskContext;
		ctx: TurnContext;
	}): Promise<void>;
}

export type RunningTask = {
	sub_id: string;
	kind: TaskKind;
	turn_context: TurnContext;
	task?: SessionTask;
	abort_controller?: AbortController;
	records_turn_token_usage_on_span?: boolean;
};
