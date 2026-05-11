import type { ServerNotification, ServerRequest } from "../../app-server-protocol/schema/typescript";
import type { Thread, ThreadItem } from "../../app-server-protocol/schema/typescript/v2";
import { renderableHistoryFromAppServerThread } from "../../app-server-protocol/src/protocol/thread-resume";
import {
	applyEventMsgToRenderedThread,
	renderThreadFromHistory,
	type RenderedThreadState,
} from "../../core/src/rendered-thread";
import type { EventMsg, UserInput } from "../../core/src/protocol";
import type { TurnItem } from "../../core/src/items";

export function renderThreadFromAppServerThread(
	thread: Thread,
): RenderedThreadState {
	return renderThreadFromHistory(renderableHistoryFromAppServerThread(thread));
}

export function applyServerNotificationToRenderedThread(
	state: RenderedThreadState,
	notification: ServerNotification,
): RenderedThreadState {
	if (notification.method === "serverRequest/resolved") {
		return clearPendingRequest(state, String(notification.params.requestId));
	}
	const msg = serverNotificationToEventMsg(notification);
	return msg ? applyEventMsgToRenderedThread(state, msg) : state;
}

export function applyServerRequestToRenderedThread(
	state: RenderedThreadState,
	request: ServerRequest,
): RenderedThreadState {
	const msg = serverRequestToEventMsg(request);
	return msg ? applyEventMsgToRenderedThread(state, msg) : state;
}

export function serverNotificationToEventMsg(
	notification: ServerNotification,
): EventMsg | null {
	switch (notification.method) {
		case "turn/started":
			return {
				type: "turn_started",
				turn_id: notification.params.turn.id,
				started_at: epochMillis(notification.params.turn.startedAt),
			};
		case "turn/completed":
			return notification.params.turn.status === "interrupted"
				? {
						type: "turn_aborted",
						turn_id: notification.params.turn.id,
						reason: "interrupted",
						completed_at: epochMillis(notification.params.turn.completedAt),
						duration_ms: notification.params.turn.durationMs,
					}
				: {
						type: "turn_complete",
						turn_id: notification.params.turn.id,
						completed_at: epochMillis(notification.params.turn.completedAt),
						duration_ms: notification.params.turn.durationMs,
					};
		case "item/agentMessage/delta":
			return {
				type: "agent_message_content_delta",
				thread_id: notification.params.threadId,
				turn_id: notification.params.turnId,
				item_id: notification.params.itemId,
				delta: notification.params.delta,
			};
		case "item/plan/delta":
			return {
				type: "plan_delta",
				thread_id: notification.params.threadId,
				turn_id: notification.params.turnId,
				item_id: notification.params.itemId,
				delta: notification.params.delta,
			};
		case "turn/plan/updated":
			return {
				type: "plan_update",
				explanation: notification.params.explanation,
				plan: notification.params.plan.map((step) => ({
					step: step.step,
					status:
						step.status === "inProgress" ? "in_progress" : step.status,
				})),
			};
		case "item/started": {
			const item = threadItemToCoreTurnItem(notification.params.item);
			return item
				? {
						type: "item_started",
						turn_id: notification.params.turnId,
						item,
					}
				: null;
		}
		case "item/completed": {
			const item = threadItemToCoreTurnItem(notification.params.item);
			return item
				? {
						type: "item_completed",
						turn_id: notification.params.turnId,
						item,
					}
				: null;
		}
		case "thread/compacted":
			return { type: "context_compacted" };
		case "thread/realtime/started":
			return {
				type: "realtime_conversation_started",
				realtime_session_id: notification.params.realtimeSessionId,
				version: notification.params.version,
			};
		case "thread/realtime/sdp":
			return {
				type: "realtime_conversation_sdp",
				sdp: notification.params.sdp,
			};
		case "thread/realtime/error":
			return {
				type: "realtime_conversation_realtime",
				payload: {
					type: "error",
					message: notification.params.message,
				},
			};
		case "thread/realtime/itemAdded":
			return {
				type: "realtime_conversation_realtime",
				payload: notification.params.item as never,
			};
		case "thread/realtime/closed":
			return {
				type: "realtime_conversation_closed",
				reason: notification.params.reason,
			};
		case "warning":
			return { type: "warning", message: notification.params.message };
		case "error":
			return {
				type: "error",
				message: notification.params.error.message,
				codex_error_info: notification.params.error.codexErrorInfo,
			};
		default:
			return null;
	}
}

export function serverRequestToEventMsg(request: ServerRequest): EventMsg | null {
	switch (request.method) {
		case "item/tool/requestUserInput":
			return {
				type: "request_user_input",
				call_id: String(request.id),
				turn_id: request.params.turnId,
				questions: request.params.questions.map((question) => ({
					...question,
					isOther: question.isOther ?? false,
					isSecret: question.isSecret ?? false,
					options: (question.options ?? []).map((option) => ({ ...option })),
				})),
			};
		case "item/permissions/requestApproval":
			return {
				type: "request_permissions",
				call_id: String(request.id),
				turn_id: request.params.turnId,
				reason: request.params.reason,
				cwd: request.params.cwd,
				permissions: request.params.permissions as never,
			};
		case "item/tool/call":
			return {
				type: "dynamic_tool_call_request",
				call_id: request.params.callId,
				turn_id: request.params.turnId,
				namespace: request.params.namespace,
				tool: request.params.tool,
				arguments: request.params.arguments,
			};
		default:
			return null;
	}
}

function clearPendingRequest(
	state: RenderedThreadState,
	requestId: string,
): RenderedThreadState {
	return {
		...state,
		pending_request_user_input:
			state.pending_request_user_input?.call_id === requestId
				? null
				: state.pending_request_user_input,
		pending_request_permissions:
			state.pending_request_permissions?.call_id === requestId
				? null
				: state.pending_request_permissions,
		pending_dynamic_tool_call_requests:
			state.pending_dynamic_tool_call_requests.filter(
				(request) => request.call_id !== requestId,
			),
	};
}

function threadItemToCoreTurnItem(item: ThreadItem): TurnItem | null {
	switch (item.type) {
		case "userMessage":
			return {
				type: "UserMessage",
				id: item.id,
				content: coreUserInputsFromAppServer(item.content),
			};
		case "agentMessage":
			return {
				type: "AgentMessage",
				id: item.id,
				content: [{ type: "Text", text: item.text }],
				phase: item.phase,
				memory_citation: item.memoryCitation
					? {
							entries: item.memoryCitation.entries,
							rolloutIds: item.memoryCitation.threadIds,
						}
					: null,
			};
		case "plan":
			return { type: "Plan", id: item.id, text: item.text };
		case "reasoning":
			return {
				type: "Reasoning",
				id: item.id,
				summary_text: item.summary,
				raw_content: item.content,
			};
		case "commandExecution":
			return {
				type: "CommandExecution",
				id: item.id,
				command: [item.command],
				cwd: item.cwd,
				status: coreCommandStatus(item.status),
				stdout: item.aggregatedOutput ?? undefined,
				exit_code: item.exitCode,
				duration_ms: item.durationMs,
			};
		case "fileChange":
			return {
				type: "FileChange",
				id: item.id,
				changes: {},
				status:
					item.status === "completed" || item.status === "failed" || item.status === "declined"
						? item.status
						: null,
			};
		case "dynamicToolCall":
			return {
				type: "DynamicToolCall",
				id: item.id,
				namespace: item.namespace,
				tool: item.tool,
				arguments: item.arguments,
				status: coreDynamicToolStatus(item.status),
				content_items: item.contentItems,
				success: item.success,
				duration: item.durationMs === null ? null : String(item.durationMs),
			};
		case "contextCompaction":
			return { type: "ContextCompaction", id: item.id };
		default:
			return null;
	}
}

function coreUserInputsFromAppServer(
	inputs: Extract<ThreadItem, { type: "userMessage" }>["content"],
): UserInput[] {
	return (inputs as Array<{ type: string; [key: string]: unknown }>).map((input) => {
		if (input.type === "text") {
			return {
				type: "text",
				text: String(input.text ?? ""),
				text_elements: ((input.text_elements ?? []) as Array<{
					byteRange?: { end: number; start: number };
					placeholder?: string | null;
				}>).map((element) => ({
					byte_range: element.byteRange ?? { end: 0, start: 0 },
					placeholder: element.placeholder ?? undefined,
				})),
			};
		}
		if (input.type === "image") {
			return { type: "image", image_url: String(input.url ?? "") };
		}
		if (input.type === "localImage") {
			return { type: "local_image", path: String(input.path ?? "") };
		}
		return input as UserInput;
	});
}

function epochMillis(value: number | null): number | null {
	return typeof value === "number" ? value * 1000 : null;
}

function coreCommandStatus(
	status: Extract<ThreadItem, { type: "commandExecution" }>["status"],
) {
	if (status === "completed" || status === "failed") {
		return status;
	}
	if (status === "declined") {
		return "cancelled";
	}
	return "in_progress";
}

function coreDynamicToolStatus(
	status: Extract<ThreadItem, { type: "dynamicToolCall" }>["status"],
) {
	if (status === "completed" || status === "failed") {
		return status;
	}
	return "inProgress";
}
