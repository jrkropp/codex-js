import type { RolloutItem, Submission } from "../protocol";
import type { Session } from "../session/session";
import type { TurnContext } from "../session/turn-context";
import {
	TaskKind,
	type SessionTask,
	type SessionTaskResult,
	type SessionTaskRunInput,
} from "./mod";

export type RegularTaskRunner = (input: {
	session: Session;
	turn: TurnContext;
	history: RolloutItem[];
	submission: Submission;
	signal?: AbortSignal;
}) => Promise<SessionTaskResult>;

export type RegularTaskParams = {
	history: RolloutItem[];
	submission: Submission;
	run_turn: RegularTaskRunner;
};

export class RegularTask implements SessionTask {
	private readonly history: RolloutItem[];
	private readonly submission: Submission;
	private readonly run_turn: RegularTaskRunner;

	constructor(params: RegularTaskParams) {
		this.history = params.history;
		this.submission = params.submission;
		this.run_turn = params.run_turn;
	}

	static new(params: RegularTaskParams): RegularTask {
		return new RegularTask(params);
	}

	kind(): TaskKind {
		return TaskKind.Regular;
	}

	span_name(): string {
		return "session_task.turn";
	}

	records_turn_token_usage_on_span(): boolean {
		return true;
	}

	async run(input: SessionTaskRunInput): Promise<SessionTaskResult> {
		const session = input.session.clone_session();
		return await this.run_turn({
			session,
			turn: input.ctx,
			history: this.history,
			submission: this.submission,
			signal: input.signal,
		});
	}
}
