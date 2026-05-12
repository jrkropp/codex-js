import type { RequestUserInputResponse } from "../request_user_input";
import type {
	McpRequestId,
	McpServerElicitationResponse,
} from "../mcp";
import type {
	RequestPermissionProfile,
	RequestPermissionsResponse,
} from "../request_permissions";
import { Mailbox, type InterAgentCommunication } from "../agent/mod";
import { PermissionGrantStore } from "../tools/orchestrator";
import type { DynamicToolResponse, TokenUsage, UserInput } from "../protocol";
import type { TurnContext } from "../session/turn-context";
import type { RunningTask, TaskKind } from "../tasks/mod";

export const MailboxDeliveryPhase = {
	CurrentTurn: "CurrentTurn",
	NextTurn: "NextTurn",
} as const;

export type MailboxDeliveryPhase =
	(typeof MailboxDeliveryPhase)[keyof typeof MailboxDeliveryPhase];

export type PendingUserInput = {
	resolve(response: RequestUserInputResponse | null): void;
};

export type PendingDynamicTool = {
	resolve(response: DynamicToolResponse | null): void;
};

export type PendingRequestPermissions = {
	resolve(response: RequestPermissionsResponse | null): void;
};

export type PendingMcpElicitation = {
	resolve(response: McpServerElicitationResponse | null): void;
};

export type RunningTaskPlaceholder = {
	sub_id: string;
	kind: TaskKind;
	turn_context: TurnContext;
};

export type RemovedTask = {
	active_turn_is_empty: boolean;
	task: RunningTask;
};

export const emptyTokenUsage: TokenUsage = {
	input_tokens: 0,
	cached_input_tokens: 0,
	output_tokens: 0,
	reasoning_output_tokens: 0,
	total_tokens: 0,
};

export class TurnState {
	private readonly pending_user_input = new Map<string, PendingUserInput>();
	private readonly pending_dynamic_tools = new Map<string, PendingDynamicTool>();
	private readonly pending_request_permissions = new Map<
		string,
		PendingRequestPermissions
	>();
	private readonly pending_mcp_elicitations = new Map<
		string,
		PendingMcpElicitation
	>();
	private pending_input: UserInput[] = [];
	private readonly mailbox = new Mailbox();
	private mailbox_delivery_phase: MailboxDeliveryPhase =
		MailboxDeliveryPhase.CurrentTurn;
	private readonly permission_grants = new PermissionGrantStore();

	tool_calls = 0;
	has_memory_citation = false;
	token_usage_at_turn_start: TokenUsage = { ...emptyTokenUsage };

	insertPendingUserInput(
		key: string,
		pending: PendingUserInput,
	): PendingUserInput | undefined {
		const previous = this.pending_user_input.get(key);
		this.pending_user_input.set(key, pending);
		return previous;
	}

	removePendingUserInput(key: string): PendingUserInput | undefined {
		const pending = this.pending_user_input.get(key);
		this.pending_user_input.delete(key);
		return pending;
	}

	insertPendingDynamicTool(
		key: string,
		pending: PendingDynamicTool,
	): PendingDynamicTool | undefined {
		const previous = this.pending_dynamic_tools.get(key);
		this.pending_dynamic_tools.set(key, pending);
		return previous;
	}

	removePendingDynamicTool(key: string): PendingDynamicTool | undefined {
		const pending = this.pending_dynamic_tools.get(key);
		this.pending_dynamic_tools.delete(key);
		return pending;
	}

	insertPendingRequestPermissions(
		key: string,
		pending: PendingRequestPermissions,
	): PendingRequestPermissions | undefined {
		const previous = this.pending_request_permissions.get(key);
		this.pending_request_permissions.set(key, pending);
		return previous;
	}

	removePendingRequestPermissions(
		key: string,
	): PendingRequestPermissions | undefined {
		const pending = this.pending_request_permissions.get(key);
		this.pending_request_permissions.delete(key);
		return pending;
	}

	insertPendingMcpElicitation(
		serverName: string,
		id: McpRequestId,
		pending: PendingMcpElicitation,
	): PendingMcpElicitation | undefined {
		const key = mcpElicitationKey(serverName, id);
		const previous = this.pending_mcp_elicitations.get(key);
		this.pending_mcp_elicitations.set(key, pending);
		return previous;
	}

	removePendingMcpElicitation(
		serverName: string,
		id: McpRequestId,
	): PendingMcpElicitation | undefined {
		const key = mcpElicitationKey(serverName, id);
		const pending = this.pending_mcp_elicitations.get(key);
		this.pending_mcp_elicitations.delete(key);
		return pending;
	}

	recordPermissionGrant(response: RequestPermissionsResponse): void {
		this.permission_grants.record(response);
	}

	grantedPermissions(): RequestPermissionProfile[] {
		return this.permission_grants.all();
	}

	strictAutoReviewEnabled(): boolean {
		return this.permission_grants.strictAutoReviewEnabled();
	}

	pushPendingInput(input: UserInput): void {
		this.pending_input.push(input);
	}

	prependPendingInput(input: UserInput[]): void {
		if (input.length === 0) {
			return;
		}

		this.pending_input = [...input, ...this.pending_input];
	}

	takePendingInput(): UserInput[] {
		const pending = this.pending_input;
		this.pending_input = [];
		return pending;
	}

	hasPendingInput(): boolean {
		return this.pending_input.length > 0;
	}

	clearPending(): void {
		this.pending_user_input.clear();
		this.pending_dynamic_tools.clear();
		this.pending_request_permissions.clear();
		this.pending_mcp_elicitations.clear();
		this.pending_input = [];
		this.permission_grants.clear();
	}

	cancelPending(): void {
		for (const pending of this.pending_user_input.values()) {
			pending.resolve(null);
		}
		for (const pending of this.pending_dynamic_tools.values()) {
			pending.resolve(null);
		}
		for (const pending of this.pending_request_permissions.values()) {
			pending.resolve(null);
		}
		for (const pending of this.pending_mcp_elicitations.values()) {
			pending.resolve(null);
		}
		this.clearPending();
		this.mailbox.drain();
	}

	sendMailboxMessage(
		communication: Omit<InterAgentCommunication, "seq">,
	): number {
		return this.mailbox.send(communication);
	}

	drainMailbox(): InterAgentCommunication[] {
		return this.mailbox.drain();
	}

	hasMailboxPending(): boolean {
		return this.mailbox.has_pending();
	}

	hasMailboxPendingTriggerTurn(): boolean {
		return this.mailbox.has_pending_trigger_turn();
	}

	acceptMailboxDeliveryForCurrentTurn(): void {
		this.setMailboxDeliveryPhase(MailboxDeliveryPhase.CurrentTurn);
	}

	acceptsMailboxDeliveryForCurrentTurn(): boolean {
		return this.mailbox_delivery_phase === MailboxDeliveryPhase.CurrentTurn;
	}

	setMailboxDeliveryPhase(phase: MailboxDeliveryPhase): void {
		this.mailbox_delivery_phase = phase;
	}
}

function mcpElicitationKey(serverName: string, id: McpRequestId): string {
	return `${serverName}:${typeof id}:${String(id)}`;
}

export class ActiveTurn {
	private readonly tasks = new Map<string, RunningTask>();
	readonly turn_state = new TurnState();

	addTask(task: RunningTask): void {
		this.tasks.set(task.sub_id, task);
	}

	removeTask(sub_id: string): RemovedTask | undefined {
		const task = this.tasks.get(sub_id);
		if (!task) {
			return undefined;
		}

		this.tasks.delete(sub_id);
		return {
			active_turn_is_empty: this.tasks.size === 0,
			task,
		};
	}

	drainTasks(): RunningTask[] {
		const tasks = [...this.tasks.values()];
		this.tasks.clear();
		return tasks;
	}

	firstTask(): RunningTask | null {
		return this.tasks.values().next().value ?? null;
	}

	hasTask(sub_id: string): boolean {
		return this.tasks.has(sub_id);
	}

	clearPending(): void {
		this.turn_state.clearPending();
	}

	cancelPending(): void {
		this.turn_state.cancelPending();
	}

	get size(): number {
		return this.tasks.size;
	}
}
