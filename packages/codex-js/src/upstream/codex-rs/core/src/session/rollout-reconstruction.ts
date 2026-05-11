import type {
	ResponseItem,
	RolloutItem,
	TurnContextItem,
} from "../protocol";
import { ContextManager } from "../context_manager/history";

export type PreviousTurnSettings = {
	model?: string | null;
	realtime_active?: boolean | null;
};

export type RolloutReconstruction = {
	history: ResponseItem[];
	previous_turn_settings: PreviousTurnSettings | null;
	reference_context_item: TurnContextItem | null;
};

export function reconstructHistoryFromRollout(
	rolloutItems: RolloutItem[],
): RolloutReconstruction {
	const history = new ContextManager();
	let previous_turn_settings: PreviousTurnSettings | null = null;
	let reference_context_item: TurnContextItem | null = null;

	for (const item of rolloutItems) {
		switch (item.type) {
			case "response_item":
				history.recordItems([item.payload]);
				break;
			case "compacted":
				if (item.payload.replacement_history) {
					history.replace(item.payload.replacement_history);
				} else {
					history.replace(buildLegacyCompactedHistory(item.payload.message));
				}
				reference_context_item = null;
				break;
			case "event_msg":
				if (item.payload.type === "thread_rolled_back") {
					history.dropLastNUserTurns(item.payload.num_turns);
				}
				break;
			case "turn_context":
				previous_turn_settings = {
					model: item.payload.model,
					realtime_active: item.payload.realtime_active ?? null,
				};
				reference_context_item = item.payload;
				break;
			case "session_meta":
				break;
		}
	}

	return {
		history: history.rawItems(),
		previous_turn_settings,
		reference_context_item,
	};
}

function buildLegacyCompactedHistory(message: string): ResponseItem[] {
	return [
		{
			type: "message",
			role: "user",
			content: [{ type: "input_text", text: message }],
		},
	];
}
