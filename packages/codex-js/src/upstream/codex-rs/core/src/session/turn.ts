import type { ResponseItem } from "../models";
import type { RolloutItem, Submission } from "../protocol";
import type { Session } from "./session";
import type { TurnContext } from "./turn-context";
import {
	buildPromptBaseInstructions,
	buildPromptInputWithContext,
} from "../context/prompt-context";
import { run_compact_task } from "../compact-task-runner";
import { ToolCallRuntime } from "../tools/parallel";
import { ToolRouter } from "../tools/router";
import {
	handle_output_item_done,
	PlanModeStreamState,
	type InFlightFuture,
} from "../stream_events_utils";
import type { ModelClient, ModelClientSessionHandle, Prompt } from "../client";
import { userInputAsResponseInput } from "../../../codex-api/src";

export type RunTurnParams = {
	modelClient: ModelClient;
	session: Session;
	turn: TurnContext;
	history: RolloutItem[];
	submission: Submission;
	signal?: AbortSignal;
	completeTurn?: boolean;
};

export type SamplingRequestResult = {
	turn: TurnContext;
	modelInput: ResponseItem[];
	lastAgentMessage: string | null;
	steps: number;
};

export async function runTurn(
	params: RunTurnParams,
): Promise<SamplingRequestResult> {
	await maybeRunPreSamplingAutoCompact(params);
	const mcpTools = await params.session.list_mcp_tools();
	const toolRouter = ToolRouter.from_config({
		dynamic_tools: params.turn.dynamic_tools,
		mcp_tools: mcpTools,
		tools_config: params.turn.tools,
	});
	const toolRuntime = new ToolCallRuntime({
		router: toolRouter,
		session: params.session,
		turn: params.turn,
	});
	const clientSession = params.modelClient.new_session(params.turn);

	try {
		return await run_sampling_request({
			session: params.session,
			turn: params.turn,
			router: toolRouter,
			toolRuntime,
			clientSession,
			input: [
				...params.session
					.clone_history()
					.for_prompt(params.turn.model_info.input_modalities),
				...(await params.session.thread_goal_steering_items()),
			],
			signal: params.signal,
			completeTurn: params.completeTurn,
			includePromptContext: false,
		});
	} finally {
		clientSession.release();
	}
}

async function maybeRunPreSamplingAutoCompact(
	params: RunTurnParams,
): Promise<RolloutItem[]> {
	const autoCompactLimit = params.turn.auto_compact_token_limit() ?? Number.POSITIVE_INFINITY;
	if (params.session.get_total_token_usage() < autoCompactLimit) {
		return params.history;
	}
	const compacted = await run_compact_task({
		modelClient: params.modelClient,
		session: params.session,
		history: params.history,
		submission: params.submission,
		turn: params.turn,
		signal: params.signal,
		completeTurn: false,
	});
	return compacted.replacement_history.map((payload) => ({
		type: "response_item",
		payload,
	}));
}

export async function run_sampling_request(params: {
	session: Session;
	turn: TurnContext;
	router: ToolRouter;
	toolRuntime?: ToolCallRuntime;
	clientSession: ModelClientSessionHandle;
	input: ResponseItem[];
	maxSteps?: number;
	signal?: AbortSignal;
	completeTurn?: boolean;
	includePromptContext?: boolean;
}): Promise<SamplingRequestResult> {
	const maxSteps = params.maxSteps ?? 8;
	let modelInput = [...params.input];
	let lastAgentMessage: string | null = null;
	let steps = 0;
	const toolRuntime =
		params.toolRuntime ??
		new ToolCallRuntime({
			router: params.router,
			session: params.session,
			turn: params.turn,
		});

	try {
		while (steps < maxSteps) {
			steps += 1;
			if (params.signal?.aborted) {
				break;
			}
			const prompt = build_prompt(
				modelInput,
				params.router,
				params.turn,
				params.includePromptContext ?? true,
			);
			if (steps === 1) {
				await params.clientSession.prewarm_websocket(prompt, {
					signal: params.signal,
					turn: params.turn,
				});
			}
			const stream = await params.clientSession.stream(prompt, {
				signal: params.signal,
				turn: params.turn,
			});
			const toolOutputFutures: InFlightFuture[] = [];
			let needsFollowUp = false;
			let streamedItemId: string | null = null;
			const planModeStream = isPlanModeTurn(params.turn)
				? new PlanModeStreamState({
						session: params.session,
						turn: params.turn,
					})
				: null;

			for await (let event of stream) {
				if (event.type === "output_text_delta") {
					params.session.markFirstToken(params.turn);
					if (planModeStream) {
						const assistantDelta = await planModeStream.pushDelta(event.delta);
						if (!assistantDelta) {
							continue;
						}
						event = {
							...event,
							delta: assistantDelta,
						};
					}
					if (!streamedItemId) {
						streamedItemId = event.item_id ?? `assistant-${params.turn.sub_id}`;
						await params.session.send_event(params.turn, {
							type: "item_started",
							item: {
								type: "AgentMessage",
								id: streamedItemId,
								content: [],
								phase: "streaming",
								memory_citation: null,
							},
						});
					}
					await params.session.send_event(params.turn, {
						type: "agent_message_content_delta",
						thread_id: params.session.threadId,
						turn_id: params.turn.sub_id,
						item_id: streamedItemId,
						delta: event.delta,
					});
					continue;
				}

				if (event.type === "completed") {
					if (event.token_usage !== undefined) {
						await params.session.update_token_usage_info(
							params.turn,
							event.token_usage,
						);
					}
					continue;
				}

				if (event.type === "rate_limits") {
					await params.session.update_rate_limits(
						params.turn,
						event.rate_limits,
					);
					continue;
				}

				if (event.type !== "output_item_done") {
					continue;
				}

				const result = await handle_output_item_done({
					session: params.session,
					turn_context: params.turn,
					tool_runtime: toolRuntime,
					plan_mode_stream: planModeStream,
					streamed_item_id: streamedItemId,
					signal: params.signal,
				}, event.item);
				streamedItemId = result.streamed_item_id ?? streamedItemId;
				if (result.last_agent_message) {
					lastAgentMessage = result.last_agent_message;
				}
				needsFollowUp = needsFollowUp || result.needs_follow_up;
				if (result.tool_future) {
					toolOutputFutures.push(result.tool_future);
				}
			}

			await Promise.all(toolOutputFutures);
			const pendingInput = await params.session.get_pending_input();
			modelInput = [
				...params.session
					.clone_history()
					.for_prompt(params.turn.model_info.input_modalities),
				...(pendingInput.length > 0
					? [userInputAsResponseInput(pendingInput)]
					: []),
			];

			if (!needsFollowUp && pendingInput.length === 0) {
				break;
			}
		}
	} catch (error) {
		if (params.signal?.aborted) {
			return {
				turn: params.turn,
				modelInput,
				lastAgentMessage,
				steps,
			};
		}
		if (params.completeTurn ?? true) {
			await params.session.failTurn(params.turn, error);
		}
		throw error;
	}

	if (params.signal?.aborted) {
		return {
			turn: params.turn,
			modelInput,
			lastAgentMessage,
			steps,
		};
	}

	if (params.completeTurn ?? true) {
		await params.session.completeTurn(params.turn, lastAgentMessage);
	}

	return {
		turn: params.turn,
		modelInput,
		lastAgentMessage,
		steps,
	};
}

function build_prompt(
	input: ResponseItem[],
	router: ToolRouter,
	turnContext: TurnContext,
	includePromptContext: boolean,
): Prompt {
	return {
		input: includePromptContext
			? buildPromptInputWithContext(input, turnContext)
			: input,
		tools: router.model_visible_specs(),
		parallel_tool_calls: false,
		base_instructions: buildPromptBaseInstructions(turnContext),
	};
}

function isPlanModeTurn(turnContext: TurnContext): boolean {
	return turnContext.collaboration_mode?.mode === "plan";
}
