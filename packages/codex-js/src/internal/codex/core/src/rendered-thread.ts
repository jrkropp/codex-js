import type { ThreadId } from "./ids";
import type {
	DynamicToolCallRequest,
	EventMsg,
	RolloutItem,
} from "./protocol";
import type { RequestPermissionsEvent } from "./request_permissions";
import type { RequestUserInputEvent } from "./request_user_input";
import type { StoredThreadHistory } from "./thread-store";
import {
	applyEventToTurns,
	applyResponseItemToTurns,
	appendCompactionTurnToTurns,
	flattenTurnsToTurnItems,
	type Turn,
} from "./thread-history-builder";
import type { TurnItem } from "./items";

export type RenderedThreadConnectionStatus =
	| "idle"
	| "connecting"
	| "connected"
	| "reconnecting"
	| "closed"
	| "error";

export type RenderedThreadState = {
	thread_id: ThreadId;
	turns: Turn[];
	items: TurnItem[];
	pending_request_user_input: RequestUserInputEvent | null;
	pending_request_permissions: RequestPermissionsEvent | null;
	pending_dynamic_tool_call_requests: DynamicToolCallRequest[];
	running_turn_ids: string[];
	warnings: string[];
	errors: string[];
	last_history_fingerprint: string | null;
	connection_status: RenderedThreadConnectionStatus;
};

export type ApplyEventOptions = {
	event_id?: string;
};

export function createRenderedThreadState(
	threadId: ThreadId,
): RenderedThreadState {
	return {
		thread_id: threadId,
		turns: [],
		items: [],
		pending_request_user_input: null,
		pending_request_permissions: null,
		pending_dynamic_tool_call_requests: [],
		running_turn_ids: [],
		warnings: [],
		errors: [],
		last_history_fingerprint: null,
		connection_status: "idle",
	};
}

export function renderThreadFromHistory(
	history: StoredThreadHistory,
): RenderedThreadState {
	let state = createRenderedThreadState(history.thread_id);

	for (const [index, item] of history.items.entries()) {
		state = applyRolloutItemToRenderedThread(state, item, index);
	}

	return {
		...state,
		running_turn_ids: [],
		last_history_fingerprint: fingerprintRolloutItems(history.items),
	};
}

export function applyRolloutItemToRenderedThread(
	state: RenderedThreadState,
	item: RolloutItem,
	index = state.items.length,
): RenderedThreadState {
	if (item.type === "event_msg") {
		return applyEventMsgToRenderedThread(state, item.payload, {
			event_id: `rollout-${index}`,
		});
	}

	if (item.type === "response_item") {
		return withTurns(
			state,
			applyResponseItemToTurns(state.turns, item.payload, `response-${index}`),
		);
	}

	if (item.type === "compacted") {
		return withTurns(
			state,
			appendCompactionTurnToTurns(state.turns, `compacted-${index}`),
		);
	}

	return state;
}

export function applyEventMsgToRenderedThread(
	state: RenderedThreadState,
	msg: EventMsg,
	options: ApplyEventOptions = {},
): RenderedThreadState {
	const eventId = options.event_id ?? `event-${state.items.length}`;
	const hadActiveTurn = hasActiveTurn(state.turns);
	const next = withTurns(state, applyEventToTurns(state.turns, msg, eventId));

	switch (msg.type) {
		case "turn_started":
			return {
				...next,
				running_turn_ids: addUnique(next.running_turn_ids, msg.turn_id),
			};
		case "turn_complete":
			return clearPendingForTurn(
				{
					...next,
					running_turn_ids: next.running_turn_ids.filter(
						(turnId) => turnId !== msg.turn_id,
					),
				},
				msg.turn_id,
			);
		case "turn_aborted":
			return clearPendingForTurn(
				{
					...next,
					running_turn_ids: next.running_turn_ids.filter(
						(turnId) => turnId !== msg.turn_id,
					),
				},
				msg.turn_id,
			);
		case "request_user_input":
			return {
				...next,
				pending_request_user_input: {
					call_id: msg.call_id,
					turn_id: msg.turn_id,
					questions: msg.questions.map((question) => ({
						...question,
						options: question.options.map((option) => ({ ...option })),
					})),
				},
			};
		case "request_permissions":
			return {
				...next,
				pending_request_permissions: {
					call_id: msg.call_id,
					turn_id: msg.turn_id,
					reason: msg.reason ?? null,
					permissions: JSON.parse(JSON.stringify(msg.permissions)) as RequestPermissionsEvent["permissions"],
					cwd: msg.cwd ?? null,
				},
			};
		case "dynamic_tool_call_request":
			return {
				...next,
				pending_dynamic_tool_call_requests: upsertDynamicToolCallRequest(
					next.pending_dynamic_tool_call_requests,
					msg,
				),
			};
		case "dynamic_tool_call_response":
			return {
				...next,
				pending_dynamic_tool_call_requests:
					next.pending_dynamic_tool_call_requests.filter(
						(request) => request.call_id !== msg.call_id,
					),
			};
		case "warning":
			return {
				...next,
				warnings: [...next.warnings, msg.message],
			};
		case "error":
			return hadActiveTurn
				? next
				: {
						...next,
						errors: [...next.errors, msg.message],
					};
		default:
			return next;
	}
}

export function setRenderedThreadConnectionStatus(
	state: RenderedThreadState,
	connectionStatus: RenderedThreadConnectionStatus,
): RenderedThreadState {
	return {
		...state,
		connection_status: connectionStatus,
	};
}

export function fingerprintRolloutItems(items: readonly RolloutItem[]): string {
	const last = items.at(-1);
	return `${items.length}:${hashString(JSON.stringify(last ?? null))}`;
}

function withTurns(
	state: RenderedThreadState,
	turns: readonly Turn[],
): RenderedThreadState {
	const nextTurns = turns.map((turn) => ({
		...turn,
		items: turn.items.map((item) => structuredClone(item)),
		error: turn.error ? { ...turn.error } : null,
	}));
	return {
		...state,
		turns: nextTurns,
		items: flattenTurnsToTurnItems(nextTurns),
	};
}

function clearPendingForTurn(
	state: RenderedThreadState,
	turnId: string,
): RenderedThreadState {
	return {
		...state,
		pending_request_user_input:
			state.pending_request_user_input?.turn_id === turnId
				? null
				: state.pending_request_user_input,
		pending_dynamic_tool_call_requests:
			state.pending_dynamic_tool_call_requests.filter(
				(request) => request.turn_id !== turnId,
			),
		pending_request_permissions:
			state.pending_request_permissions?.turn_id === turnId
				? null
				: state.pending_request_permissions,
	};
}

function upsertDynamicToolCallRequest(
	requests: DynamicToolCallRequest[],
	request: DynamicToolCallRequest,
): DynamicToolCallRequest[] {
	return [
		...requests.filter((item) => item.call_id !== request.call_id),
		{
			call_id: request.call_id,
			turn_id: request.turn_id,
			started_at_ms: request.started_at_ms,
			namespace: request.namespace ?? null,
			tool: request.tool,
			arguments: request.arguments,
		},
	];
}

function hasActiveTurn(turns: readonly Turn[]): boolean {
	return turns.some((turn) => turn.status === "in_progress");
}

function addUnique(values: string[], value: string): string[] {
	return values.includes(value) ? values : [...values, value];
}

function hashString(value: string): string {
	let hash = 0;

	for (let index = 0; index < value.length; index += 1) {
		hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
	}

	return hash.toString(16);
}
