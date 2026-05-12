import type { RolloutItem, Submission } from "../protocol";
import type { Session } from "../session/session";
import type { TurnContext } from "../session/turn-context";
import {
	TaskKind,
	type SessionTask,
	type SessionTaskResult,
	type SessionTaskRunInput,
} from "./mod";

export type CompactTaskRunner = (input: {
	session: Session;
	turn: TurnContext;
	history: RolloutItem[];
	submission: Submission;
	signal?: AbortSignal;
}) => Promise<SessionTaskResult>;

export type CompactTaskParams = {
	history: RolloutItem[];
	submission: Submission;
	run_compact_task: CompactTaskRunner;
};

export class CompactTask implements SessionTask {
	private readonly history: RolloutItem[];
	private readonly submission: Submission;
	private readonly run_compact_task: CompactTaskRunner;

	constructor(params: CompactTaskParams) {
		this.history = params.history;
		this.submission = params.submission;
		this.run_compact_task = params.run_compact_task;
	}

	kind(): TaskKind {
		return TaskKind.Compact;
	}

	span_name(): string {
		return "session_task.compact";
	}

	records_turn_token_usage_on_span(): boolean {
		return false;
	}

	async run(input: SessionTaskRunInput): Promise<SessionTaskResult> {
		return await this.run_compact_task({
			session: input.session.clone_session(),
			turn: input.ctx,
			history: this.history,
			submission: this.submission,
			signal: input.signal,
		});
	}
}
