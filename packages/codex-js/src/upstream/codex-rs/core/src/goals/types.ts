import type { ThreadId } from "../ids";
import type { ResponseItem, ThreadGoal, ThreadGoalStatus } from "../protocol";

export type ThreadGoalUpdate = {
	status?: ThreadGoalStatus;
	token_budget?: number | null;
	expected_goal_id?: string | null;
};

export const ThreadGoalAccountingMode = {
	ActiveStatusOnly: "active_status_only",
	ActiveOnly: "active_only",
	ActiveOrComplete: "active_or_complete",
	ActiveOrStopped: "active_or_stopped",
} as const;

export type ThreadGoalAccountingMode =
	(typeof ThreadGoalAccountingMode)[keyof typeof ThreadGoalAccountingMode];

export type ThreadGoalAccountingOutcome =
	| { type: "updated"; goal: ThreadGoal }
	| { type: "unchanged"; goal: ThreadGoal | null };

export type ThreadGoalStore = {
	getThreadGoal(threadId: ThreadId): Promise<ThreadGoal | null>;
	replaceThreadGoal(params: {
		thread_id: ThreadId;
		objective: string;
		status: ThreadGoalStatus;
		token_budget?: number | null;
	}): Promise<ThreadGoal>;
	insertThreadGoal(params: {
		thread_id: ThreadId;
		objective: string;
		status: ThreadGoalStatus;
		token_budget?: number | null;
	}): Promise<ThreadGoal>;
	updateThreadGoal(params: {
		thread_id: ThreadId;
		update: ThreadGoalUpdate;
	}): Promise<ThreadGoal>;
	pauseActiveThreadGoal(threadId: ThreadId): Promise<ThreadGoal | null>;
	deleteThreadGoal(threadId: ThreadId): Promise<void>;
	accountThreadGoalUsage(params: {
		thread_id: ThreadId;
		tokens_used_delta?: number;
		time_used_seconds_delta?: number;
		mode?: ThreadGoalAccountingMode;
	}): Promise<ThreadGoalAccountingOutcome>;
};

export type GoalRuntimeEvent =
	| { type: "turn_started"; turn_id: string; total_tokens: number }
	| { type: "tool_completed"; turn_id: string; tool_name: string; total_tokens: number }
	| { type: "tool_completed_goal"; turn_id: string; total_tokens: number }
	| { type: "turn_finished"; turn_id: string; total_tokens: number }
	| { type: "task_aborted"; turn_id: string; total_tokens: number }
	| { type: "thread_resumed" };

export type GoalRuntimeApplyResult = {
	goal_updated?: ThreadGoal | null;
};

export type GoalTurnAccountingSnapshot = {
	total_tokens: number;
	started_at_ms: number;
	last_accounted_total_tokens: number;
	last_accounted_at_ms: number;
};

export type CreateGoalRequest = {
	objective: string;
	token_budget?: number | null;
};

export type SetGoalRequest = {
	objective?: string | null;
	status?: ThreadGoalStatus | null;
	token_budget?: number | null;
};

export type GoalToolOutput = {
	goal: ThreadGoal | null;
	remaining_token_budget: number | null;
};

export type GoalSteeringItem = ResponseItem;
