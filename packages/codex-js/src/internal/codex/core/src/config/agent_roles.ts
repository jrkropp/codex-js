export type AgentRole = {
	name: string;
	description?: string | null;
	instructions?: string | null;
};

export type AgentRoles = Record<string, AgentRole>;
