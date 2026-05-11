import type { ThreadId } from "../ids";
import type { ResponseItem, RolloutItem } from "../protocol";
import { Mailbox, type InterAgentCommunication } from "./mailbox";
import { AgentPath } from "./role";
import {
	AgentRegistry,
	AgentStatus,
	type LiveAgent,
	type ListedAgent,
	type AgentMetadata,
} from "./registry";

export const SpawnAgentForkMode = {
	FullHistory: "full_history",
	LastNTurns: "last_n_turns",
} as const;

export type SpawnAgentForkMode =
	| { type: typeof SpawnAgentForkMode.FullHistory }
	| { type: typeof SpawnAgentForkMode.LastNTurns; turns: number };

export type SpawnAgentOptions = {
	fork_parent_spawn_call_id?: string | null;
	fork_mode?: SpawnAgentForkMode | null;
	environments?: unknown[] | null;
};

export type AgentControlExecutor = {
	spawn_agent?(input: {
		initial_operation: unknown;
		session_source?: unknown;
		options?: SpawnAgentOptions;
	}): Promise<LiveAgent>;
	send_input?(input: { target: ThreadId; message?: string | null; items?: unknown[] | null; interrupt?: boolean }): Promise<unknown>;
	wait_agent?(input: { targets: ThreadId[]; timeout_ms?: number | null }): Promise<unknown>;
	close_agent?(input: { target: ThreadId }): Promise<unknown>;
	resume_agent?(input: { id: ThreadId }): Promise<unknown>;
};

export class AgentControl {
	readonly registry: AgentRegistry;
	readonly mailbox: Mailbox;

	constructor(private readonly executor: AgentControlExecutor | null = null) {
		this.registry = new AgentRegistry();
		this.mailbox = new Mailbox();
	}

	static empty(): AgentControl {
		return new AgentControl();
	}

	async spawn_agent_with_metadata(input: {
		initial_operation: unknown;
		session_source?: unknown;
		options?: SpawnAgentOptions;
	}): Promise<LiveAgent> {
		if (!this.executor?.spawn_agent) {
			throw new Error("multi-agent spawning is unavailable in this Codex assistant runtime");
		}
		return this.executor.spawn_agent(input);
	}

	async send_input(input: {
		target: ThreadId;
		message?: string | null;
		items?: unknown[] | null;
		interrupt?: boolean;
	}): Promise<unknown> {
		if (!this.executor?.send_input) {
			throw new Error("multi-agent messaging is unavailable in this Codex assistant runtime");
		}
		return this.executor.send_input(input);
	}

	async wait_agent(input: {
		targets: ThreadId[];
		timeout_ms?: number | null;
	}): Promise<unknown> {
		if (!this.executor?.wait_agent) {
			throw new Error("multi-agent waiting is unavailable in this Codex assistant runtime");
		}
		return this.executor.wait_agent(input);
	}

	async close_agent(input: { target: ThreadId }): Promise<unknown> {
		if (!this.executor?.close_agent) {
			throw new Error("multi-agent close is unavailable in this Codex assistant runtime");
		}
		return this.executor.close_agent(input);
	}

	async resume_agent(input: { id: ThreadId }): Promise<unknown> {
		if (!this.executor?.resume_agent) {
			throw new Error("multi-agent resume is unavailable in this Codex assistant runtime");
		}
		return this.executor.resume_agent(input);
	}

	list_agents(): ListedAgent[] {
		return this.registry.live_agents().map((metadata) => ({
			agent_name:
				metadata.agent_path?.toString() ??
				metadata.agent_nickname ??
				metadata.agent_id ??
				"unknown",
			agent_status: AgentStatus.Running,
			last_task_message: metadata.last_task_message ?? null,
		}));
	}

	send_mail(communication: Omit<InterAgentCommunication, "seq">): number {
		return this.mailbox.send(communication);
	}
}

export type { AgentMetadata, LiveAgent, ListedAgent };
export { AgentPath };

export function keep_forked_rollout_item(item: RolloutItem): boolean {
	switch (item.type) {
		case "response_item":
			return keep_forked_response_item(item.payload);
		case "turn_context":
			return false;
		case "compacted":
		case "event_msg":
		case "session_meta":
			return true;
	}
}

function keep_forked_response_item(item: ResponseItem): boolean {
	if (item.type === "message") {
		if (item.role === "system" || item.role === "developer" || item.role === "user") {
			return true;
		}
		return item.role === "assistant" && item.phase === "final_answer";
	}
	return false;
}
