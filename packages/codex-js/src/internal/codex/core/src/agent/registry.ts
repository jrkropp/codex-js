import type { ThreadId } from "../ids";
import { AgentPath } from "./role";

export type AgentMetadata = {
	agent_id?: ThreadId | null;
	agent_path?: AgentPath | null;
	agent_nickname?: string | null;
	agent_role?: string | null;
	last_task_message?: string | null;
};

export type LiveAgent = {
	thread_id: ThreadId;
	metadata: AgentMetadata;
	status: AgentStatus;
};

export type ListedAgent = {
	agent_name: string;
	agent_status: AgentStatus;
	last_task_message?: string | null;
};

export const AgentStatus = {
	Running: "running",
	Completed: "completed",
	Failed: "failed",
	Closed: "closed",
	Cancelled: "cancelled",
} as const;

export type AgentStatus = (typeof AgentStatus)[keyof typeof AgentStatus];

export class AgentRegistry {
	private readonly agent_tree = new Map<string, AgentMetadata>();
	private readonly used_agent_nicknames = new Set<string>();
	private total_count = 0;
	private nickname_reset_count = 0;

	reserve_spawn_slot(max_threads?: number | null): SpawnReservation {
		if (max_threads != null && this.total_count >= max_threads) {
			throw new Error(`agent thread limit reached: ${max_threads}`);
		}
		this.total_count += 1;
		return new SpawnReservation(this);
	}

	release_spawned_thread(thread_id: ThreadId): void {
		for (const [key, metadata] of this.agent_tree.entries()) {
			if (metadata.agent_id === thread_id) {
				this.agent_tree.delete(key);
				if (!metadata.agent_path?.isRoot()) {
					this.total_count = Math.max(0, this.total_count - 1);
				}
				return;
			}
		}
	}

	release_spawn_slot(): void {
		this.total_count = Math.max(0, this.total_count - 1);
	}

	register_root_thread(thread_id: ThreadId): void {
		if (!this.agent_tree.has(AgentPath.ROOT)) {
			this.agent_tree.set(AgentPath.ROOT, {
				agent_id: thread_id,
				agent_path: AgentPath.root(),
			});
		}
	}

	agent_id_for_path(agent_path: AgentPath): ThreadId | null {
		return this.agent_tree.get(agent_path.toString())?.agent_id ?? null;
	}

	agent_metadata_for_thread(thread_id: ThreadId): AgentMetadata | null {
		return (
			[...this.agent_tree.values()].find(
				(metadata) => metadata.agent_id === thread_id,
			) ?? null
		);
	}

	live_agents(): AgentMetadata[] {
		return [...this.agent_tree.values()].filter(
			(metadata) => metadata.agent_id && !metadata.agent_path?.isRoot(),
		);
	}

	update_last_task_message(thread_id: ThreadId, last_task_message: string): void {
		const metadata = this.agent_metadata_for_thread(thread_id);
		if (metadata) {
			metadata.last_task_message = last_task_message;
		}
	}

	register_spawned_thread(agent_metadata: AgentMetadata): void {
		if (!agent_metadata.agent_id) {
			return;
		}
		const key =
			agent_metadata.agent_path?.toString() ?? `thread:${agent_metadata.agent_id}`;
		this.agent_tree.set(key, agent_metadata);
		if (agent_metadata.agent_nickname) {
			this.used_agent_nicknames.add(agent_metadata.agent_nickname);
		}
	}

	reserve_agent_nickname(
		names: readonly string[],
		preferred?: string | null,
	): string | null {
		if (preferred) {
			this.used_agent_nicknames.add(preferred);
			return preferred;
		}
		if (names.length === 0) {
			return null;
		}
		const available = names
			.map((name) => format_agent_nickname(name, this.nickname_reset_count))
			.filter((name) => !this.used_agent_nicknames.has(name));
		const selected = available[0] ?? this.reset_and_select_nickname(names);
		this.used_agent_nicknames.add(selected);
		return selected;
	}

	reserve_agent_path(agent_path: AgentPath): void {
		const key = agent_path.toString();
		if (this.agent_tree.has(key)) {
			throw new Error(`agent path \`${key}\` already exists`);
		}
		this.agent_tree.set(key, { agent_path });
	}

	private reset_and_select_nickname(names: readonly string[]): string {
		this.used_agent_nicknames.clear();
		this.nickname_reset_count += 1;
		return format_agent_nickname(names[0] ?? "agent", this.nickname_reset_count);
	}
}

export class SpawnReservation {
	private active = true;
	constructor(private readonly registry: AgentRegistry) {}

	commit(metadata: AgentMetadata): void {
		if (!this.active) {
			return;
		}
		this.active = false;
		this.registry.register_spawned_thread(metadata);
	}

	release(): void {
		if (!this.active) {
			return;
		}
		this.active = false;
		this.registry.release_spawn_slot();
	}
}

export function next_thread_spawn_depth(session_source: unknown): number {
	const depth =
		typeof session_source === "object" &&
		session_source !== null &&
		"depth" in session_source &&
		typeof (session_source as { depth?: unknown }).depth === "number"
			? (session_source as { depth: number }).depth
			: 0;
	return Math.max(0, depth) + 1;
}

export function exceeds_thread_spawn_depth_limit(
	depth: number,
	max_depth: number,
): boolean {
	return depth > max_depth;
}

function format_agent_nickname(name: string, reset_count: number): string {
	if (reset_count === 0) {
		return name;
	}
	const value = reset_count + 1;
	const suffix =
		value % 100 >= 11 && value % 100 <= 13
			? "th"
			: value % 10 === 1
				? "st"
				: value % 10 === 2
					? "nd"
					: value % 10 === 3
						? "rd"
						: "th";
	return `${name} the ${value}${suffix}`;
}
