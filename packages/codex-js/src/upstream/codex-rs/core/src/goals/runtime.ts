import {
	ThreadGoalStatus,
	validateThreadGoalObjective,
	type ResponseItem,
	type ThreadGoal,
	type TokenUsageInfo,
} from "../protocol";
import type { ThreadId } from "../ids";
import { renderCoreTemplate } from "../templates";
import {
	ThreadGoalAccountingMode,
	type CreateGoalRequest,
	type GoalRuntimeApplyResult,
	type GoalRuntimeEvent,
	type GoalToolOutput,
	type GoalTurnAccountingSnapshot,
	type SetGoalRequest,
	type ThreadGoalStore,
} from "./types";

export class GoalRuntimeState {
	private readonly turn_snapshots = new Map<string, GoalTurnAccountingSnapshot>();
	private budget_limit_reported_goal_id: string | null = null;

	constructor(
		private readonly params: {
			thread_id: ThreadId;
			store?: ThreadGoalStore | null;
			now?: () => number;
		},
	) {}

	async get_thread_goal(): Promise<ThreadGoal | null> {
		return this.params.store?.getThreadGoal(this.params.thread_id) ?? null;
	}

	async create_thread_goal(request: CreateGoalRequest): Promise<ThreadGoal> {
		const objective = request.objective.trim();
		validateThreadGoalObjective(objective);
		validateTokenBudget(request.token_budget);
		const store = this.require_store();
		const existing = await store.getThreadGoal(this.params.thread_id);
		if (existing) {
			throw new Error(
				"cannot create a new goal because this thread already has a goal; use update_goal only when the existing goal is complete",
			);
		}
		this.budget_limit_reported_goal_id = null;
		return store.insertThreadGoal({
			thread_id: this.params.thread_id,
			objective,
			status: ThreadGoalStatus.Active,
			token_budget: request.token_budget ?? null,
		});
	}

	async set_thread_goal(request: SetGoalRequest): Promise<ThreadGoal> {
		const store = this.require_store();
		const existing = await store.getThreadGoal(this.params.thread_id);
		if (request.objective !== undefined && request.objective !== null) {
			const objective = request.objective.trim();
			validateThreadGoalObjective(objective);
			validateTokenBudget(request.token_budget);
			const status = request.status ?? ThreadGoalStatus.Active;
			if (
				existing &&
				existing.status !== ThreadGoalStatus.Complete &&
				existing.objective === objective
			) {
				return store.updateThreadGoal({
					thread_id: this.params.thread_id,
					update: {
						status,
						token_budget: request.token_budget ?? existing.token_budget ?? null,
					},
				});
			}
			this.budget_limit_reported_goal_id = null;
			return store.replaceThreadGoal({
				thread_id: this.params.thread_id,
				objective,
				status,
				token_budget: request.token_budget ?? null,
			});
		}

		if (!existing) {
			throw new Error("cannot update goal because this thread has no goal");
		}
		return store.updateThreadGoal({
			thread_id: this.params.thread_id,
			update: {
				status: request.status ?? undefined,
				token_budget:
					request.token_budget === undefined ? undefined : request.token_budget,
			},
		});
	}

	async update_thread_goal_complete(): Promise<ThreadGoal> {
		const store = this.require_store();
		return store.updateThreadGoal({
			thread_id: this.params.thread_id,
			update: { status: ThreadGoalStatus.Complete },
		});
	}

	async clear_thread_goal(): Promise<void> {
		this.turn_snapshots.clear();
		this.budget_limit_reported_goal_id = null;
		await this.require_store().deleteThreadGoal(this.params.thread_id);
	}

	async apply(event: GoalRuntimeEvent): Promise<GoalRuntimeApplyResult> {
		if (!this.params.store) {
			return {};
		}
		switch (event.type) {
			case "turn_started":
				this.mark_thread_goal_turn_started(event.turn_id, event.total_tokens);
				return {};
			case "tool_completed":
				if (event.tool_name === UPDATE_GOAL_TOOL_NAME) {
					return {};
				}
				return this.account_thread_goal_progress(event.turn_id, event.total_tokens);
			case "tool_completed_goal":
				return this.account_thread_goal_progress(event.turn_id, event.total_tokens);
			case "turn_finished":
				return this.finish_thread_goal_turn(event.turn_id, event.total_tokens);
			case "task_aborted":
				return this.handle_thread_goal_task_abort(event.turn_id, event.total_tokens);
			case "thread_resumed":
				return {};
		}
	}

	async budget_limit_steering_items(): Promise<ResponseItem[]> {
		const goal = await this.get_thread_goal();
		if (!goal || goal.status !== ThreadGoalStatus.BudgetLimited) {
			return [];
		}
		return [budget_limit_steering_item(goal)];
	}

	format_tool_output(goal: ThreadGoal | null): GoalToolOutput {
		return {
			goal,
			remaining_token_budget: remainingTokenBudget(goal),
		};
	}

	private mark_thread_goal_turn_started(turnId: string, totalTokens: number): void {
		const now = this.now();
		this.turn_snapshots.set(turnId, {
			total_tokens: totalTokens,
			started_at_ms: now,
			last_accounted_total_tokens: totalTokens,
			last_accounted_at_ms: now,
		});
	}

	private async finish_thread_goal_turn(
		turnId: string,
		totalTokens: number,
	): Promise<GoalRuntimeApplyResult> {
		const result = await this.account_thread_goal_progress(turnId, totalTokens);
		this.turn_snapshots.delete(turnId);
		return result;
	}

	private async handle_thread_goal_task_abort(
		turnId: string,
		totalTokens: number,
	): Promise<GoalRuntimeApplyResult> {
		await this.account_thread_goal_progress(turnId, totalTokens);
		this.turn_snapshots.delete(turnId);
		const goal = await this.params.store?.pauseActiveThreadGoal(this.params.thread_id);
		return { goal_updated: goal ?? null };
	}

	private async account_thread_goal_progress(
		turnId: string,
		totalTokens: number,
	): Promise<GoalRuntimeApplyResult> {
		const snapshot = this.turn_snapshots.get(turnId);
		if (!snapshot || !this.params.store) {
			return {};
		}
		const now = this.now();
		const tokensDelta = Math.max(0, totalTokens - snapshot.last_accounted_total_tokens);
		const secondsDelta = Math.max(
			0,
			Math.floor((now - snapshot.last_accounted_at_ms) / 1000),
		);
		if (tokensDelta === 0 && secondsDelta === 0) {
			return {};
		}
		snapshot.last_accounted_total_tokens = totalTokens;
		snapshot.last_accounted_at_ms = now;
		const outcome = await this.params.store.accountThreadGoalUsage({
			thread_id: this.params.thread_id,
			tokens_used_delta: tokensDelta,
			time_used_seconds_delta: secondsDelta,
			mode: ThreadGoalAccountingMode.ActiveOnly,
		});
		if (outcome.type !== "updated" || !outcome.goal) {
			return {};
		}
		if (
			outcome.goal.status === ThreadGoalStatus.BudgetLimited &&
			this.budget_limit_reported_goal_id === outcome.goal.thread_id
		) {
			return {};
		}
		if (outcome.goal.status === ThreadGoalStatus.BudgetLimited) {
			this.budget_limit_reported_goal_id = outcome.goal.thread_id;
		}
		return { goal_updated: outcome.goal };
	}

	private require_store(): ThreadGoalStore {
		if (!this.params.store) {
			throw new Error("thread goals are unavailable for this session");
		}
		return this.params.store;
	}

	private now(): number {
		return this.params.now?.() ?? Date.now();
	}
}

export function totalTokensFromTokenUsageInfo(
	info: TokenUsageInfo | null,
): number {
	return info?.total_token_usage.total_tokens ?? 0;
}

export function goalToolOutput(goal: ThreadGoal | null): GoalToolOutput {
	return {
		goal,
		remaining_token_budget: remainingTokenBudget(goal),
	};
}

export function remainingTokenBudget(goal: ThreadGoal | null): number | null {
	if (!goal || goal.token_budget == null) {
		return null;
	}
	return Math.max(0, goal.token_budget - goal.tokens_used);
}

export function budget_limit_prompt(goal: ThreadGoal): string {
	const remaining = remainingTokenBudget(goal);
	return renderCoreTemplate("goals/budget_limit.md", {
		objective: goal.objective,
		time_used_seconds: goal.time_used_seconds,
		tokens_used: goal.tokens_used,
		token_budget: goal.token_budget ?? "none",
		remaining_token_budget: remaining ?? "unknown",
	});
}

export function budget_limit_steering_item(goal: ThreadGoal): ResponseItem {
	return {
		type: "message",
		role: "user",
		content: [
			{
				type: "input_text",
				text: `<thread_goal_budget_limit>\n${budget_limit_prompt(goal)}\n</thread_goal_budget_limit>`,
			},
		],
	};
}

function validateTokenBudget(value: number | null | undefined): void {
	if (value == null) {
		return;
	}
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error("goal token_budget must be a positive integer");
	}
}

const UPDATE_GOAL_TOOL_NAME = "update_goal";
