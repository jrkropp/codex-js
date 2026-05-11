import type {
	AgentMessageTurnItem,
	TurnItem,
	UserMessageTurnItem,
} from "./items";
import { parseTurnItem } from "./event-mapping";
import type {
	DynamicToolCallRequest,
	EventMsg,
	ImageGenerationEndEventMsg,
	ResponseItem,
	RolloutItem,
	UserInput,
	UserMessageEventMsg,
} from "./protocol";

export type TurnStatus =
	| "completed"
	| "interrupted"
	| "failed"
	| "in_progress";

export type TurnItemsView = "not_loaded" | "summary" | "full";

export type TurnError = {
	message: string;
	codex_error_info?: unknown | null;
	additional_details?: string | null;
};

export type Turn = {
	id: string;
	items: TurnItem[];
	items_view: TurnItemsView;
	status: TurnStatus;
	error: TurnError | null;
	started_at: number | null;
	completed_at: number | null;
	duration_ms: number | null;
};

export type PendingTurn = Turn & {
	opened_explicitly: boolean;
};

type InternalTurn = Turn & {
	opened_explicitly: boolean;
};

export class ThreadHistoryBuilder {
	private turns: InternalTurn[] = [];
	private next_item_index = 1;

	static fromTurns(turns: readonly Turn[]): ThreadHistoryBuilder {
		const builder = new ThreadHistoryBuilder();
		builder.turns = turns.map((turn) => ({
			...cloneTurn(turn),
			opened_explicitly: true,
		}));
		builder.next_item_index = nextItemIndexFromTurns(turns);
		return builder;
	}

	handle_rollout_item(item: RolloutItem, index = this.next_item_index): void {
		if (item.type === "event_msg") {
			this.handle_event(item.payload, `rollout-${index}`);
			return;
		}

		if (item.type === "response_item") {
			this.handle_response_item(item.payload, `response-${index}`);
			return;
		}

		if (item.type === "compacted") {
			this.append_to_current_turn({
				type: "ContextCompaction",
				id: `compacted-${index}`,
			});
		}
	}

	handle_event(event: EventMsg, eventId = `event-${this.next_item_index}`): void {
		switch (event.type) {
			case "turn_started":
				this.open_explicit_turn(event.turn_id);
				if (event.started_at !== undefined && event.started_at !== null) {
					const turn = this.turn_by_id(event.turn_id);
					if (turn) {
						turn.started_at = event.started_at;
					}
				}
				return;
			case "turn_complete":
				this.complete_turn(event.turn_id, {
					status: "completed",
					completed_at: event.completed_at ?? null,
					duration_ms: event.duration_ms ?? null,
				});
				return;
			case "turn_aborted":
				this.complete_turn(event.turn_id, {
					status: "interrupted",
					completed_at: event.completed_at ?? event.aborted_at ?? null,
					duration_ms: event.duration_ms ?? null,
				});
				return;
			case "user_message":
				this.append_user_message(userMessageTurnItem(event, userMessageId(eventId)), {
					replaceDuplicate: true,
				});
				return;
			case "agent_message":
				this.upsert_agent_message({
					type: "AgentMessage",
					id: agentMessageId(eventId),
					content: [{ type: "Text", text: event.message }],
					phase: event.phase ?? null,
					memory_citation: event.memory_citation ?? null,
				});
				return;
			case "item_started":
				this.upsert_item_in_turn(event.turn_id, event.item, {
					started: true,
				});
				return;
			case "item_completed":
				this.upsert_item_in_turn(event.turn_id, completedItem(event.item));
				return;
			case "agent_message_content_delta":
				this.apply_agent_message_delta(event.item_id, event.delta);
				return;
			case "plan_delta":
				this.apply_plan_delta(event.item_id, event.delta);
				return;
			case "exec_command_begin":
				this.upsert_item_in_turn(event.turn_id, {
					type: "CommandExecution",
					id: event.call_id,
					command: event.command,
					cwd: event.cwd,
					status: "in_progress",
				});
				return;
			case "exec_command_output_delta":
				this.apply_exec_command_output_delta(event);
				return;
			case "exec_command_end":
				this.apply_exec_command_end(event);
				return;
			case "patch_apply_updated":
				this.upsert_item_in_current_or_existing_turn(event.call_id, {
					type: "FileChange",
					id: event.call_id,
					changes: event.changes,
					status: event.status ?? null,
					auto_approved: false,
					stdout: event.stdout ?? "",
					stderr: event.stderr ?? "",
				});
				return;
			case "dynamic_tool_call_request":
				this.upsert_item_in_turn(event.turn_id, dynamicToolRequestTurnItem(event));
				return;
			case "dynamic_tool_call_response":
				this.upsert_item_in_turn(event.turn_id, {
					type: "DynamicToolCall",
					id: event.call_id,
					namespace: event.namespace ?? null,
					tool: event.tool,
					arguments: event.arguments,
					status: event.success ? "completed" : "failed",
					content_items: event.content_items,
					success: event.success,
					duration: event.duration,
				});
				return;
			case "mcp_tool_call_progress":
				this.upsert_item_in_turn(event.turn_id, {
					type: "McpToolCall",
					id: event.call_id,
					server: event.server_name,
					tool: event.tool_name,
					arguments: {},
					status: "inProgress",
					result: event.progress ?? event.message ?? null,
				});
				return;
			case "image_generation_end":
				this.upsert_item_in_current_or_existing_turn(
					event.call_id,
					imageGenerationTurnItem(event, eventId),
				);
				return;
			case "error": {
				const turn = this.active_turn();
				if (turn) {
					turn.status = "failed";
					turn.error = {
						message: event.message,
						codex_error_info: event.codex_error_info ?? null,
					};
				}
				return;
			}
			default:
				return;
		}
	}

	handle_response_item(item: ResponseItem, id: string): void {
		const turnItem = parseTurnItem(item);
		if (!turnItem) {
			return;
		}

		const itemWithFallbackId =
			turnItem.id.length > 0 ? turnItem : { ...turnItem, id };

		if (itemWithFallbackId.type === "AgentMessage") {
			this.upsert_agent_message(itemWithFallbackId);
			return;
		}

		if (itemWithFallbackId.type === "UserMessage") {
			this.append_user_message(itemWithFallbackId, {
				replaceDuplicate: false,
			});
			return;
		}

		this.append_to_current_turn(itemWithFallbackId);
	}

	active_turn_snapshot(): Turn | null {
		const turn = this.active_turn();
		return turn ? stripInternalTurn(turn) : null;
	}

	active_turn_position(): number | null {
		const turn = this.active_turn();
		return turn ? this.turns.indexOf(turn) : null;
	}

	finish(): Turn[] {
		return this.turns.map(stripInternalTurn);
	}

	has_active_turn(): boolean {
		return this.active_turn() !== null;
	}

	reset(): void {
		this.turns = [];
		this.next_item_index = 1;
	}

	private open_explicit_turn(turnId: string): void {
		const existing = this.turns.find((turn) => turn.id === turnId);
		if (existing) {
			existing.status = "in_progress";
			existing.opened_explicitly = true;
			return;
		}
		this.turns.push(newTurn(turnId, true));
	}

	private complete_turn(
		turnId: string,
		input: {
			status: TurnStatus;
			completed_at: number | null;
			duration_ms: number | null;
		},
	): void {
		const turn = this.turn_by_id(turnId) ?? this.ensure_turn(turnId, true);
		turn.status = input.status;
		turn.completed_at = input.completed_at;
		turn.duration_ms = input.duration_ms;
	}

	private append_user_message(
		item: UserMessageTurnItem,
		options: { replaceDuplicate: boolean },
	): void {
		const active = this.active_turn();
		if (!active || (!active.opened_explicitly && active.items.length > 0)) {
			this.turns.push(newTurn(`turn-${this.turns.length + 1}`, false));
		}
		const turn = this.active_turn() ?? this.ensure_turn();
		const lastItem = turn.items.at(-1);
		if (
			lastItem?.type === "UserMessage" &&
			userMessageFingerprint(lastItem) === userMessageFingerprint(item)
		) {
			if (options.replaceDuplicate) {
				turn.items[turn.items.length - 1] = item;
			}
			return;
		}
		turn.items.push(item);
	}

	private upsert_agent_message(item: AgentMessageTurnItem): void {
		const turn = this.ensure_turn();
		const lastItem = turn.items.at(-1);
		if (item.phase === "streaming") {
			if (lastItem?.type === "AgentMessage" && lastItem.phase === "streaming") {
				turn.items[turn.items.length - 1] = { ...item, id: lastItem.id };
				return;
			}
			turn.items.push({ ...item, id: `streaming-${item.id}` });
			return;
		}
		if (lastItem?.type === "AgentMessage" && lastItem.phase === "streaming") {
			turn.items[turn.items.length - 1] = { ...item, id: lastItem.id };
			return;
		}
		if (
			lastItem?.type === "AgentMessage" &&
			agentMessageText(lastItem) === agentMessageText(item)
		) {
			turn.items[turn.items.length - 1] = { ...item, id: lastItem.id };
			return;
		}
		turn.items.push(item);
	}

	private upsert_item_in_turn(
		turnId: string | null | undefined,
		item: TurnItem,
		options: { started?: boolean } = {},
	): void {
		const turn = turnId ? this.ensure_turn(turnId, true) : this.ensure_turn();
		upsertItem(turn, options.started ? startedItem(item) : item);
	}

	private upsert_item_in_current_or_existing_turn(
		itemId: string,
		item: TurnItem,
	): void {
		const existingTurn = this.turns.find((turn) =>
			turn.items.some((candidate) => candidate.id === itemId),
		);
		upsertItem(existingTurn ?? this.ensure_turn(), item);
	}

	private append_to_current_turn(item: TurnItem): void {
		this.ensure_turn().items.push(item);
	}

	private apply_agent_message_delta(itemId: string, delta: string): void {
		const existing = this.find_item(itemId);
		if (!existing || existing.item.type !== "AgentMessage") {
			this.append_to_current_turn({
				type: "AgentMessage",
				id: itemId,
				content: [{ type: "Text", text: delta }],
				phase: "streaming",
				memory_citation: null,
			});
			return;
		}
		const item = existing.item;
		const lastContent = item.content.at(-1);
		const nextContent =
			lastContent?.type === "Text"
				? [
						...item.content.slice(0, -1),
						{ type: "Text" as const, text: `${lastContent.text}${delta}` },
					]
				: [...item.content, { type: "Text" as const, text: delta }];
		existing.turn.items[existing.index] = {
			...item,
			content: nextContent,
			phase: "streaming",
		};
	}

	private apply_plan_delta(itemId: string, delta: string): void {
		const existing = this.find_item(itemId);
		if (!existing || existing.item.type !== "Plan") {
			this.append_to_current_turn({ type: "Plan", id: itemId, text: delta });
			return;
		}
		existing.turn.items[existing.index] = {
			...existing.item,
			text: `${existing.item.text}${delta}`,
		};
	}

	private apply_exec_command_output_delta(
		msg: Extract<EventMsg, { type: "exec_command_output_delta" }>,
	): void {
		const existing = this.find_item(msg.call_id);
		if (!existing || existing.item.type !== "CommandExecution") {
			return;
		}
		existing.turn.items[existing.index] = {
			...existing.item,
			stdout:
				msg.stream === "stdout"
					? `${existing.item.stdout ?? ""}${msg.chunk}`
					: existing.item.stdout,
			stderr:
				msg.stream === "stderr"
					? `${existing.item.stderr ?? ""}${msg.chunk}`
					: existing.item.stderr,
		};
	}

	private apply_exec_command_end(
		msg: Extract<EventMsg, { type: "exec_command_end" }>,
	): void {
		const existing = this.find_item(msg.call_id);
		const item =
			existing?.item.type === "CommandExecution" ? existing.item : null;
		const turn = msg.turn_id
			? this.ensure_turn(msg.turn_id, true)
			: existing?.turn ?? this.ensure_turn();
		upsertItem(turn, {
			type: "CommandExecution",
			id: msg.call_id,
			command: item?.command ?? [],
			cwd: item?.cwd ?? "",
			status:
				msg.status === "completed"
					? "completed"
					: msg.status === "cancelled"
						? "cancelled"
						: "failed",
			stdout: msg.stdout ?? msg.output?.stdout.text ?? item?.stdout ?? "",
			stderr: msg.stderr ?? msg.output?.stderr.text ?? item?.stderr ?? "",
			exit_code: msg.exit_code,
			duration_ms: msg.duration_ms ?? msg.output?.duration_ms ?? null,
		});
	}

	private ensure_turn(id?: string, explicit = false): InternalTurn {
		if (id) {
			const existing = this.turn_by_id(id);
			if (existing) {
				return existing;
			}
			const turn = newTurn(id, explicit);
			this.turns.push(turn);
			return turn;
		}
		const active = this.active_turn();
		if (active) {
			return active;
		}
		const turn = newTurn(`turn-${this.turns.length + 1}`, false);
		this.turns.push(turn);
		return turn;
	}

	private active_turn(): InternalTurn | null {
		for (let index = this.turns.length - 1; index >= 0; index -= 1) {
			const turn = this.turns[index];
			if (turn?.status === "in_progress") {
				return turn;
			}
		}
		return null;
	}

	private turn_by_id(id: string): InternalTurn | null {
		return this.turns.find((turn) => turn.id === id) ?? null;
	}

	private find_item(
		itemId: string,
	): { turn: InternalTurn; item: TurnItem; index: number } | null {
		for (const turn of this.turns) {
			const index = turn.items.findIndex((item) => item.id === itemId);
			if (index !== -1) {
				return { turn, item: turn.items[index] as TurnItem, index };
			}
		}
		return null;
	}
}

export function buildTurnsFromRolloutItems(
	items: readonly RolloutItem[],
): Turn[] {
	const builder = new ThreadHistoryBuilder();
	for (const [index, item] of items.entries()) {
		builder.handle_rollout_item(item, index);
	}
	return builder.finish();
}

export function applyEventToThreadHistoryBuilder(
	builder: ThreadHistoryBuilder,
	event: EventMsg,
	eventId?: string,
): ThreadHistoryBuilder {
	builder.handle_event(event, eventId);
	return builder;
}

export function flattenTurnsToTurnItems(turns: readonly Turn[]): TurnItem[] {
	return turns.flatMap((turn) => turn.items);
}

export function applyEventToTurns(
	turns: readonly Turn[],
	event: EventMsg,
	eventId?: string,
): Turn[] {
	const builder = ThreadHistoryBuilder.fromTurns(turns);
	builder.handle_event(event, eventId);
	return builder.finish();
}

export function applyResponseItemToTurns(
	turns: readonly Turn[],
	item: ResponseItem,
	id: string,
): Turn[] {
	const builder = ThreadHistoryBuilder.fromTurns(turns);
	builder.handle_response_item(item, id);
	return builder.finish();
}

export function appendCompactionTurnToTurns(
	turns: readonly Turn[],
	id: string,
): Turn[] {
	const builder = ThreadHistoryBuilder.fromTurns(turns);
	builder.handle_rollout_item({ type: "compacted", payload: { message: "" } }, 0);
	const next = builder.finish();
	const last = next.at(-1);
	if (last?.items.at(-1)?.type === "ContextCompaction") {
		last.items[last.items.length - 1] = { type: "ContextCompaction", id };
	}
	return next;
}

function newTurn(id: string, openedExplicitly: boolean): InternalTurn {
	return {
		id,
		items: [],
		items_view: "full",
		status: "in_progress",
		error: null,
		started_at: null,
		completed_at: null,
		duration_ms: null,
		opened_explicitly: openedExplicitly,
	};
}

function stripInternalTurn(turn: InternalTurn): Turn {
	const { opened_explicitly, ...publicTurn } = turn;
	void opened_explicitly;
	return cloneTurn(publicTurn);
}

function cloneTurn(turn: Turn): Turn {
	return {
		...turn,
		items: turn.items.map((item) => structuredClone(item)),
		error: turn.error ? { ...turn.error } : null,
	};
}

function nextItemIndexFromTurns(turns: readonly Turn[]): number {
	return (
		turns.reduce((count, turn) => count + turn.items.length, 0) + 1
	);
}

function upsertItem(turn: InternalTurn, item: TurnItem): void {
	const index = turn.items.findIndex((candidate) => candidate.id === item.id);
	if (index === -1) {
		turn.items.push(item);
		return;
	}
	turn.items[index] = item;
}

function startedItem(item: TurnItem): TurnItem {
	return item.type === "AgentMessage"
		? { ...item, phase: item.phase ?? "streaming" }
		: item;
}

function completedItem(item: TurnItem): TurnItem {
	return item.type === "AgentMessage"
		? { ...item, phase: item.phase ?? null }
		: item;
}

function dynamicToolRequestTurnItem(
	request: DynamicToolCallRequest,
): TurnItem {
	return {
		type: "DynamicToolCall",
		id: request.call_id,
		namespace: request.namespace ?? null,
		tool: request.tool,
		arguments: request.arguments,
		status: "inProgress",
		content_items: null,
		success: null,
		duration: null,
	};
}

function userMessageId(eventId: string): string {
	return `user-${eventId}`;
}

function agentMessageId(eventId: string): string {
	return `agent-${eventId}`;
}

function userMessageTurnItem(
	msg: UserMessageEventMsg,
	id: string,
): UserMessageTurnItem {
	return {
		type: "UserMessage",
		id,
		content: userInputFromUserMessage(msg),
	};
}

function userInputFromUserMessage(msg: UserMessageEventMsg): UserInput[] {
	const items: UserInput[] = [];
	if (msg.message.length > 0) {
		items.push({
			type: "text",
			text: msg.message,
			text_elements: msg.text_elements,
		});
	}
	for (const imageUrl of msg.images ?? []) {
		items.push({ type: "image", image_url: imageUrl });
	}
	for (const path of msg.local_images ?? []) {
		items.push({ type: "local_image", path });
	}
	return items;
}

function imageGenerationTurnItem(
	msg: ImageGenerationEndEventMsg,
	id: string,
): TurnItem {
	return {
		type: "ImageGeneration",
		id: msg.call_id || id,
		status: msg.status,
		revised_prompt: msg.revised_prompt,
		result: msg.result,
		saved_path: msg.saved_path,
	};
}

function agentMessageText(item: AgentMessageTurnItem): string {
	return item.content.map((part) => part.text).join("");
}

function userMessageFingerprint(item: UserMessageTurnItem): string {
	return item.content
		.map((content) => {
			if (content.type === "text") {
				return `text:${content.text}`;
			}
			if (content.type === "image") {
				return `image:${content.image_url}`;
			}
			if (content.type === "local_image") {
				return `local_image:${content.path}`;
			}
			if (content.type === "skill") {
				return `skill:${content.name}:${content.path}`;
			}
			return `mention:${content.name}:${content.path}`;
		})
		.join("\n");
}
