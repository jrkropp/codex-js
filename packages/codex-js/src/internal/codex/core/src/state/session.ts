import { ContextManager, type TotalTokenUsageBreakdown } from "../context_manager/history";
import type {
	RateLimitSnapshot,
	ResponseItem,
	TokenUsage,
	TokenUsageInfo,
	TruncationPolicy,
	TurnContextItem,
} from "../protocol";
import type { PreviousTurnSettings } from "../session/rollout-reconstruction";
import type { SessionConfiguration } from "../session/session";

export type SessionStateParams = {
	session_configuration: SessionConfiguration;
	history?: ContextManager | null;
	latest_rate_limits?: RateLimitSnapshot | null;
	server_reasoning_included?: boolean;
	previous_turn_settings?: PreviousTurnSettings | null;
	reference_context_item?: TurnContextItem | null;
	token_info?: TokenUsageInfo | null;
};

export class SessionState {
	readonly session_configuration: SessionConfiguration;
	readonly history: ContextManager;
	private latest_rate_limits_value: RateLimitSnapshot | null;
	private server_reasoning_included_value: boolean;
	private previous_turn_settings_value: PreviousTurnSettings | null;

	constructor(params: SessionStateParams) {
		this.session_configuration = params.session_configuration;
		this.history = params.history?.clone() ?? ContextManager.new();
		this.latest_rate_limits_value = structuredClone(
			params.latest_rate_limits ?? null,
		);
		this.server_reasoning_included_value =
			params.server_reasoning_included ?? false;
		this.previous_turn_settings_value = structuredClone(
			params.previous_turn_settings ?? null,
		);
		if (params.reference_context_item !== undefined) {
			this.history.set_reference_context_item(params.reference_context_item);
		}
		if (params.token_info !== undefined) {
			this.history.set_token_info(params.token_info);
		}
	}

	record_items(
		items: Iterable<ResponseItem>,
		policy?: TruncationPolicy | null,
	): void {
		this.history.record_items(items, policy);
	}

	previous_turn_settings(): PreviousTurnSettings | null {
		return structuredClone(this.previous_turn_settings_value);
	}

	set_previous_turn_settings(value: PreviousTurnSettings | null): void {
		this.previous_turn_settings_value = structuredClone(value);
	}

	clone_history(): ContextManager {
		return this.history.clone();
	}

	replace_history(
		items: ResponseItem[],
		referenceContextItem: TurnContextItem | null,
	): void {
		this.history.replace(items);
		this.history.set_reference_context_item(referenceContextItem);
	}

	set_token_info(info: TokenUsageInfo | null): void {
		this.history.set_token_info(info);
	}

	set_reference_context_item(item: TurnContextItem | null): void {
		this.history.set_reference_context_item(item);
	}

	reference_context_item(): TurnContextItem | null {
		return this.history.reference_context_item();
	}

	update_token_info_from_usage(
		usage: TokenUsage,
		modelContextWindow?: number | null,
	): void {
		this.history.update_token_info(usage, modelContextWindow ?? null);
	}

	token_info(): TokenUsageInfo | null {
		return this.history.token_info();
	}

	set_rate_limits(snapshot: RateLimitSnapshot): void {
		this.latest_rate_limits_value = merge_rate_limit_fields(
			this.latest_rate_limits_value,
			snapshot,
		);
	}

	set_latest_rate_limits(snapshot: RateLimitSnapshot | null): void {
		this.latest_rate_limits_value = structuredClone(snapshot);
	}

	latest_rate_limits(): RateLimitSnapshot | null {
		return structuredClone(this.latest_rate_limits_value);
	}

	token_info_and_rate_limits(): [TokenUsageInfo | null, RateLimitSnapshot | null] {
		return [this.token_info(), this.latest_rate_limits()];
	}

	set_token_usage_full(contextWindow: number): void {
		this.history.set_token_usage_full(contextWindow);
	}

	get_total_token_usage(serverReasoningIncluded?: boolean): number {
		return this.history.get_total_token_usage(
			serverReasoningIncluded ?? this.server_reasoning_included_value,
		);
	}

	get_total_token_usage_breakdown(): TotalTokenUsageBreakdown {
		return this.history.get_total_token_usage_breakdown();
	}

	set_server_reasoning_included(included: boolean): void {
		this.server_reasoning_included_value = included;
	}

	server_reasoning_included(): boolean {
		return this.server_reasoning_included_value;
	}
}

function merge_rate_limit_fields(
	previous: RateLimitSnapshot | null,
	snapshot: RateLimitSnapshot,
): RateLimitSnapshot {
	const next = structuredClone(snapshot);
	if (next.limit_id === undefined || next.limit_id === null) {
		next.limit_id = "codex";
	}
	if (next.credits === undefined && previous?.credits !== undefined) {
		next.credits = structuredClone(previous.credits);
	}
	if (next.plan_type === undefined && previous?.plan_type !== undefined) {
		next.plan_type = previous.plan_type;
	}
	return next;
}
