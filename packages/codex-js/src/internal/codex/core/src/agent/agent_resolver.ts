import type { ThreadId } from "../ids";
import { AgentPath } from "./role";
import type { AgentRegistry } from "./registry";

export function resolve_agent_target(
	registry: AgentRegistry,
	target: string,
): ThreadId | null {
	if (target.startsWith("/")) {
		return registry.agent_id_for_path(AgentPath.parse(target));
	}
	return target as ThreadId;
}
