import type { ServerNotification } from "../../../app-server-protocol/schema/typescript";
import type {
	Thread,
	ThreadTokenUsageUpdatedNotification,
	Turn,
} from "../../../app-server-protocol/schema/typescript/v2";
import { threadTokenUsageFromTokenUsageInfo } from "../../../app-server-protocol/src/protocol/event-mapping";
import type { ThreadId } from "../../../core/src/ids";
import type {
	RolloutItem,
	TokenUsageInfo,
} from "../../../core/src/protocol";
import { ThreadHistoryBuilder } from "../../../core/src/thread-history-builder";
import { appServerTurnFromCoreTurn } from "../../../app-server-protocol/src/protocol/thread-resume";

/// Identifies the turn that was active when a TokenCount record appeared.
export type TokenUsageTurnOwner = {
	id: string;
	position: number | null;
};

export function latest_token_usage_turn_id_from_rollout_items(
	rolloutItems: readonly RolloutItem[],
	turns: readonly Turn[],
): string | null {
	const builder = new ThreadHistoryBuilder();
	let tokenUsageTurnOwner: TokenUsageTurnOwner | null = null;

	for (const item of rolloutItems) {
		if (item.type === "event_msg" && item.payload.type === "token_count") {
			const turn = builder.active_turn_snapshot();
			tokenUsageTurnOwner = turn
				? {
						id: appServerTurnFromCoreTurn(turn).id,
						position: builder.active_turn_position(),
					}
				: null;
		}
		builder.handle_rollout_item(item);
	}

	if (!tokenUsageTurnOwner) {
		return null;
	}
	if (turns.some((turn) => turn.id === tokenUsageTurnOwner.id)) {
		return tokenUsageTurnOwner.id;
	}
	return tokenUsageTurnOwner.position === null
		? null
		: (turns[tokenUsageTurnOwner.position]?.id ?? null);
}

export function latest_token_usage_turn_id(thread: Thread): string {
	return (
		[...thread.turns]
			.reverse()
			.find((turn) => turn.status === "completed" || turn.status === "failed")
			?.id ??
		thread.turns.at(-1)?.id ??
		""
	);
}

export function last_token_info_from_rollout_items(
	rolloutItems: readonly RolloutItem[],
): TokenUsageInfo | null {
	for (let index = rolloutItems.length - 1; index >= 0; index -= 1) {
		const item = rolloutItems[index];
		if (
			item?.type === "event_msg" &&
			item.payload.type === "token_count" &&
			item.payload.info
		) {
			return item.payload.info;
		}
	}
	return null;
}

export function thread_token_usage_updated_notification_from_info(input: {
	thread: Thread;
	threadId: ThreadId | string;
	tokenUsageInfo: TokenUsageInfo;
	tokenUsageTurnId?: string | null;
}): ServerNotification {
	const params: ThreadTokenUsageUpdatedNotification = {
		threadId: String(input.threadId),
		turnId: input.tokenUsageTurnId ?? latest_token_usage_turn_id(input.thread),
		tokenUsage: threadTokenUsageFromTokenUsageInfo(input.tokenUsageInfo),
	};
	return {
		method: "thread/tokenUsage/updated",
		params,
	};
}

export function thread_token_usage_updated_notification_from_rollout_items(input: {
	rolloutItems: readonly RolloutItem[];
	thread: Thread;
	threadId: ThreadId | string;
}): ServerNotification | null {
	const tokenUsageInfo = last_token_info_from_rollout_items(input.rolloutItems);
	if (!tokenUsageInfo) {
		return null;
	}
	return thread_token_usage_updated_notification_from_info({
		thread: input.thread,
		threadId: input.threadId,
		tokenUsageInfo,
		tokenUsageTurnId: latest_token_usage_turn_id_from_rollout_items(
			input.rolloutItems,
			input.thread.turns,
		),
	});
}
