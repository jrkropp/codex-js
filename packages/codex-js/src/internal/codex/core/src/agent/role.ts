export class AgentPath {
	static readonly ROOT = "/root";

	private constructor(private readonly value: string) {}

	static root(): AgentPath {
		return new AgentPath(AgentPath.ROOT);
	}

	static parse(value: string): AgentPath {
		const trimmed = value.trim();
		if (!trimmed.startsWith("/")) {
			throw new Error(`agent path must be absolute: ${value}`);
		}
		return new AgentPath(trimmed.replace(/\/+$/u, "") || AgentPath.ROOT);
	}

	isRoot(): boolean {
		return this.value === AgentPath.ROOT;
	}

	toString(): string {
		return this.value;
	}
}

export const DEFAULT_ROLE_NAME = "default";

export type AgentRoleConfig = {
	name: string;
	description?: string | null;
	instructions?: string | null;
	nickname_candidates?: string[] | null;
};

const BUILTIN_ROLES: Record<string, AgentRoleConfig> = {
	default: {
		name: "default",
		description: "General-purpose Codex agent.",
		nickname_candidates: null,
	},
	explorer: {
		name: "explorer",
		description: "Read-only codebase exploration agent.",
		nickname_candidates: ["Explorer", "Scout", "Pathfinder"],
	},
	awaiter: {
		name: "awaiter",
		description: "Agent that waits for delegated work or external updates.",
		nickname_candidates: ["Awaiter", "Watcher", "Sentinel"],
	},
};

export function resolve_role_config(
	roles: Record<string, AgentRoleConfig> | null | undefined,
	role_name = DEFAULT_ROLE_NAME,
): AgentRoleConfig | null {
	return roles?.[role_name] ?? BUILTIN_ROLES[role_name] ?? null;
}

export function builtin_agent_roles(): Record<string, AgentRoleConfig> {
	return structuredClone(BUILTIN_ROLES);
}

export function default_agent_nickname_list(): string[] {
	return ["Atlas", "Beacon", "Cedar", "Delta", "Echo", "Harbor", "Iris", "Nova"];
}
