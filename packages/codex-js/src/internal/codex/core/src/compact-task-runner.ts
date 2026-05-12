import {
	buildPromptBaseInstructions,
	buildPromptInputWithContext,
} from "./context/prompt-context";
import {
	buildCompactedHistory,
	collectUserMessages,
	SUMMARIZATION_PROMPT,
	SUMMARY_PREFIX,
	compactedThreadWarning,
} from "./compact";
import { run_post_compact_hooks } from "./hooks";
import type { ResponseItem } from "./models";
import type { RolloutItem, Submission } from "./protocol";
import type { Session } from "./session/session";
import type { TurnContext } from "./session/turn-context";
import type { ModelClient, Prompt } from "./client";
import {
	modelInputFromHistory,
	rawAssistantOutputTextFromItem,
	userInputAsResponseInput,
} from "../../codex-api/src";

export type CompactTaskResult = {
	summary: string;
	replacement_history: ResponseItem[];
};

export async function run_compact_task(params: {
	modelClient: ModelClient;
	session: Session;
	history: RolloutItem[];
	submission: Submission;
	turn?: TurnContext;
	signal?: AbortSignal;
	completeTurn?: boolean;
}): Promise<CompactTaskResult> {
	const turn = params.turn ?? (await params.session.startCompactTurn(params.submission));
	const compactionItem = {
		type: "ContextCompaction" as const,
		id: `${turn.sub_id}-context-compaction`,
	};

	try {
		await params.session.send_event(turn, {
			type: "item_started",
			item: compactionItem,
		});

		const livePromptHistory = params.session
			.clone_history()
			.for_prompt(turn.model_info.input_modalities);
		const promptHistory =
			livePromptHistory.length > 0
				? livePromptHistory
				: modelInputFromHistory(params.history);
		const summarySuffix = await runCompactionPrompt({
			modelClient: params.modelClient,
			turn,
			history: promptHistory,
			signal: params.signal,
		});
		const summaryText = `${SUMMARY_PREFIX}\n${summarySuffix || "(no summary available)"}`;
		const replacementHistory = buildCompactedHistory(
			[],
			collectUserMessages(promptHistory),
			summaryText,
		);

		await params.session.recordCompactedItem({
			message: summaryText,
			replacement_history: replacementHistory,
		});
		params.session.replace_history(replacementHistory, null);
		await params.session.send_event(turn, {
			type: "item_completed",
			item: compactionItem,
		});
		await params.session.send_event(turn, {
			type: "warning",
			message: compactedThreadWarning(),
		});
		await run_post_compact_hooks(params.session, turn, "manual");
		if (params.completeTurn ?? true) {
			await params.session.completeTurn(turn, null);
		}

		return {
			summary: summaryText,
			replacement_history: replacementHistory,
		};
	} catch (error) {
		if (!params.signal?.aborted && (params.completeTurn ?? true)) {
			await params.session.failTurn(turn, error);
		}
		throw error;
	}
}

async function runCompactionPrompt(input: {
	modelClient: ModelClient;
	turn: TurnContext;
	history: ResponseItem[];
	signal?: AbortSignal;
}): Promise<string> {
	const clientSession = input.modelClient.new_session(input.turn);
	const promptInput = [
		...input.history,
		userInputAsResponseInput([{ type: "text", text: SUMMARIZATION_PROMPT }]),
	];
	const prompt = {
		input: buildPromptInputWithContext(promptInput, input.turn),
		tools: [],
		parallel_tool_calls: false,
		base_instructions: buildPromptBaseInstructions(input.turn),
	} satisfies Prompt;
	try {
		const stream = await clientSession.stream(prompt, {
			signal: input.signal,
			turn: input.turn,
		});

		let summary = "";
		for await (const event of stream) {
			if (input.signal?.aborted) {
				break;
			}
			if (event.type === "output_text_delta") {
				continue;
			}
			if (event.type === "output_item_done") {
				const text = rawAssistantOutputTextFromItem(event.item);
				if (text) {
					summary = text;
				}
			}
		}

		return summary.trim();
	} finally {
		clientSession.release();
	}
}
