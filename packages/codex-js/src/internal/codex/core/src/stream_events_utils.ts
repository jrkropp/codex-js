import type { AgentMessageTurnItem, TurnItem } from "./items";
import type { FunctionCallOutputPayload, ResponseItem } from "./models";
import type { Session } from "./session/session";
import type { TurnContext } from "./session/turn-context";
import type { ToolCallRuntime } from "./tools/parallel";
import { ToolRouter } from "./tools/router";
import { parseTurnItem } from "./event-mapping";
import {
	extractProposedPlanFromText,
	rawAssistantOutputTextFromItem,
	responseInputToResponseItem,
} from "../../codex-api/src";
import {
	AssistantTextStreamParser,
	type ProposedPlanSegment,
} from "./stream-parser";

export async function record_completed_response_item(
	session: Session,
	turnContext: TurnContext,
	item: ResponseItem,
): Promise<void> {
	await session.record_conversation_items(turnContext, [item]);
}

export type InFlightFuture = Promise<ResponseItem>;

export type OutputItemResult = {
	last_agent_message: string | null;
	needs_follow_up: boolean;
	tool_future: InFlightFuture | null;
	streamed_item_id?: string | null;
};

export type HandleOutputCtx = {
	session: Session;
	turn_context: TurnContext;
	tool_runtime: ToolCallRuntime;
	plan_mode_stream: PlanModeStreamState | null;
	streamed_item_id: string | null;
	signal?: AbortSignal;
};

export async function handle_output_item_done(
	ctx: HandleOutputCtx,
	item: ResponseItem,
): Promise<OutputItemResult> {
	const missingLocalShellOutput = missing_local_shell_call_output(item);
	if (missingLocalShellOutput) {
		await record_completed_response_item(ctx.session, ctx.turn_context, item);
		await ctx.session.record_conversation_items(ctx.turn_context, [
			missingLocalShellOutput,
		]);
		return {
			last_agent_message: null,
			needs_follow_up: true,
			tool_future: null,
			streamed_item_id: ctx.streamed_item_id,
		};
	}

	const toolCall = await ToolRouter.build_tool_call(ctx.session, item);
	if (toolCall) {
		await record_completed_response_item(ctx.session, ctx.turn_context, item);
		return {
			last_agent_message: null,
			needs_follow_up: true,
			tool_future: ctx.tool_runtime
				.handle_tool_call(toolCall, ctx.signal)
				.then(async (toolOutput) => {
					const toolOutputItem = responseInputToResponseItem(toolOutput);
					await record_completed_response_item(
						ctx.session,
						ctx.turn_context,
						toolOutputItem,
					);
					return toolOutputItem;
				}),
			streamed_item_id: ctx.streamed_item_id,
		};
	}

	return handle_non_tool_response_item(ctx, item);
}

export async function handle_non_tool_response_item(
	ctx: HandleOutputCtx,
	item: ResponseItem,
): Promise<OutputItemResult> {
	const rawAgentMessage = rawAssistantOutputTextFromItem(item);
	const finalizedOutput = ctx.plan_mode_stream
		? await ctx.plan_mode_stream.completeFromFinalText(rawAgentMessage ?? "")
		: { assistantText: rawAgentMessage, planText: null };
	const agentMessage = normalizedAssistantMessage(finalizedOutput.assistantText);
	let streamedItemId = ctx.streamed_item_id;

	if (agentMessage) {
		const itemId =
			streamedItemId ??
			responseItemId(item, `${ctx.turn_context.sub_id}-agent-message`);
		const turnItem = agentMessageTurnItem(item, itemId, agentMessage);
		if (!streamedItemId) {
			await ctx.session.send_event(ctx.turn_context, {
				type: "item_started",
				item: agentMessageTurnItem(item, itemId, ""),
			});
		}
		await ctx.session.send_event(ctx.turn_context, {
			type: "item_completed",
			item: turnItem,
		});
		await record_completed_response_item(ctx.session, ctx.turn_context, item);
		return {
			last_agent_message: agentMessage,
			needs_follow_up: false,
			tool_future: null,
			streamed_item_id: null,
		};
	}

	if (streamedItemId && finalizedOutput.planText) {
		streamedItemId = null;
	}

	const turnItem = parsedNonAgentTurnItem(
		item,
		`${ctx.turn_context.sub_id}-${item.type}`,
	);
	if (turnItem) {
		await ctx.session.send_event(ctx.turn_context, {
			type: "item_started",
			item: startedTurnItem(turnItem),
		});
		await ctx.session.send_event(ctx.turn_context, {
			type: "item_completed",
			item: turnItem,
		});
	}

	await record_completed_response_item(ctx.session, ctx.turn_context, item);

	return {
		last_agent_message: null,
		needs_follow_up: false,
		tool_future: null,
		streamed_item_id: streamedItemId,
	};
}

export function last_assistant_message_from_item(
	item: ResponseItem,
	planMode: boolean,
): string | null {
	const raw = rawAssistantOutputTextFromItem(item);
	if (!raw) {
		return null;
	}
	const text = planMode ? extractProposedPlanFromText(raw).assistantText : raw;
	return normalizedAssistantMessage(text);
}

function missing_local_shell_call_output(item: ResponseItem): ResponseItem | null {
	if (
		item.type !== "local_shell_call" ||
		(typeof item.call_id === "string" && item.call_id.length > 0)
	) {
		return null;
	}

	const output: FunctionCallOutputPayload = {
		body: {
			type: "text",
			text: "LocalShellCall without call_id or id",
		},
		success: false,
	};
	return {
		type: "function_call_output",
		call_id: "",
		output,
	};
}

function normalizedAssistantMessage(text: string | null): string | null {
	const normalized = text?.trim();
	return normalized ? normalized : null;
}

function responseItemId(item: ResponseItem, fallbackId: string): string {
	return "id" in item && typeof item.id === "string" && item.id.length > 0
		? item.id
		: fallbackId;
}

function agentMessageTurnItem(
	item: ResponseItem,
	id: string,
	text: string,
): AgentMessageTurnItem {
	return {
		type: "AgentMessage",
		id,
		content: text.length > 0 ? [{ type: "Text", text }] : [],
		phase: item.type === "message" ? item.phase ?? null : null,
		memory_citation: null,
	};
}

function parsedNonAgentTurnItem(item: ResponseItem, fallbackId: string): TurnItem | null {
	const turnItem = parseTurnItem(item);
	if (!turnItem || turnItem.type === "AgentMessage") {
		return null;
	}

	return turnItem.id.length > 0 ? turnItem : { ...turnItem, id: fallbackId };
}

function startedTurnItem(item: TurnItem): TurnItem {
	if (item.type !== "ImageGeneration") {
		return item;
	}
	return {
		...item,
		status: "in_progress",
		revised_prompt: undefined,
		result: "",
		saved_path: undefined,
	};
}

export class PlanModeStreamState {
	private readonly itemId: string;
	private readonly parser = new AssistantTextStreamParser(true);
	private emittedPlanText = "";
	private planItemStarted = false;

	constructor(
		private readonly params: {
			session: Session;
			turn: TurnContext;
		},
	) {
		this.itemId = `${params.turn.sub_id}-plan`;
	}

	async pushDelta(delta: string): Promise<string> {
		const parsed = this.parser.push_str(delta);
		await this.emitPlanSegments(parsed.plan_segments);
		return parsed.visible_text;
	}

	async completeFromFinalText(text: string): Promise<{
		assistantText: string | null;
		planText: string | null;
	}> {
		const extracted = extractProposedPlanFromText(text);
		if (extracted.planText === null) {
			return {
				assistantText: extracted.assistantText,
				planText: null,
			};
		}

		await this.emitRemainingPlanDelta(extracted.planText);
		await this.params.session.send_event(this.params.turn, {
			type: "item_completed",
			item: {
				type: "Plan",
				id: this.itemId,
				text: extracted.planText,
			},
		});

		return {
			assistantText: extracted.assistantText,
			planText: extracted.planText,
		};
	}

	private async emitPlanSegments(
		segments: readonly ProposedPlanSegment[],
	): Promise<void> {
		for (const segment of segments) {
			switch (segment.type) {
				case "ProposedPlanStart":
					await this.startPlanItem();
					break;
				case "ProposedPlanDelta":
					await this.emitPlanDelta(segment.text);
					break;
				case "ProposedPlanEnd":
				case "Normal":
					break;
			}
		}
	}

	private async emitRemainingPlanDelta(planText: string): Promise<void> {
		if (planText.startsWith(this.emittedPlanText)) {
			await this.emitPlanDelta(planText.slice(this.emittedPlanText.length));
			return;
		}

		if (!this.planItemStarted) {
			await this.startPlanItem();
		}
	}

	private async emitPlanDelta(delta: string): Promise<void> {
		if (!delta) {
			return;
		}

		await this.startPlanItem();
		this.emittedPlanText += delta;
		await this.params.session.send_event(this.params.turn, {
			type: "plan_delta",
			thread_id: this.params.session.threadId,
			turn_id: this.params.turn.sub_id,
			item_id: this.itemId,
			delta,
		});
	}

	private async startPlanItem(): Promise<void> {
		if (this.planItemStarted) {
			return;
		}

		this.planItemStarted = true;
		await this.params.session.send_event(this.params.turn, {
			type: "item_started",
			item: {
				type: "Plan",
				id: this.itemId,
				text: "",
			},
		});
	}
}
