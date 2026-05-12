export * from "./permissions";
export * from "./managed_features";
export * from "./network_proxy_spec";
export * from "./agent_roles";

import type { ResolvedConfig } from "../../../config/src";
export { resolve_web_search_mode_for_turn } from "../../../config/src";

export function tools_config_from_config(config: ResolvedConfig) {
	return config.tools;
}
