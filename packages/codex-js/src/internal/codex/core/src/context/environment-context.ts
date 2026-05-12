import type { TurnContext } from "../session/turn-context";
import type { TurnContextItem } from "../protocol";
import { ContextualUserFragment } from "./fragment";

export const ENVIRONMENT_CONTEXT_OPEN_TAG = "<environment_context>";
export const ENVIRONMENT_CONTEXT_CLOSE_TAG = "</environment_context>";

export type EnvironmentContextEnvironment = {
	id?: string;
	cwd: string;
	shell: string;
};

export type NetworkContext = {
	allowed_domains: string[];
	denied_domains: string[];
};

export class EnvironmentContext extends ContextualUserFragment {
	constructor(params: {
		environments: EnvironmentContextEnvironment[];
		current_date?: string | null;
		timezone?: string | null;
		network?: NetworkContext | null;
	}) {
		super({
			role: "user",
			start_marker: ENVIRONMENT_CONTEXT_OPEN_TAG,
			end_marker: ENVIRONMENT_CONTEXT_CLOSE_TAG,
			body: () => renderEnvironmentContextBody(params),
		});
	}

	static fromTurnContext(turnContext: TurnContext): EnvironmentContext {
		const environments =
			turnContext.environments.length > 0
				? turnContext.environments.map((environment) => ({
						id: environment.environment_id,
						cwd: environment.cwd,
						shell:
							"shell" in environment && typeof environment.shell === "string"
								? environment.shell
								: "zsh",
					}))
				: [
						{
							cwd: turnContext.cwd,
							shell: "zsh",
						},
					];

		return new EnvironmentContext({
			environments,
			current_date: turnContext.current_date,
			timezone: turnContext.timezone,
		});
	}

	static fromTurnContextItem(item: TurnContextItem): EnvironmentContext {
		return new EnvironmentContext({
			environments: [
				{
					cwd: item.cwd,
					shell: "zsh",
				},
			],
			current_date: item.current_date,
			timezone: item.timezone,
		});
	}
}

function renderEnvironmentContextBody(params: {
	environments: EnvironmentContextEnvironment[];
	current_date?: string | null;
	timezone?: string | null;
	network?: NetworkContext | null;
}): string {
	const lines: string[] = [];
	const environments = params.environments;

	if (environments.length === 1) {
		const environment = environments[0];
		if (environment) {
			lines.push(`  <cwd>${environment.cwd}</cwd>`);
			lines.push(`  <shell>${environment.shell}</shell>`);
		}
	} else if (environments.length > 1) {
		lines.push("  <environments>");
		for (const environment of environments) {
			lines.push(`    <environment id="${environment.id ?? ""}">`);
			lines.push(`      <cwd>${environment.cwd}</cwd>`);
			lines.push(`      <shell>${environment.shell}</shell>`);
			lines.push("    </environment>");
		}
		lines.push("  </environments>");
	}

	if (params.current_date) {
		lines.push(`  <current_date>${params.current_date}</current_date>`);
	}
	if (params.timezone) {
		lines.push(`  <timezone>${params.timezone}</timezone>`);
	}
	if (params.network) {
		lines.push('  <network enabled="true">');
		for (const allowed of params.network.allowed_domains) {
			lines.push(`    <allowed>${allowed}</allowed>`);
		}
		for (const denied of params.network.denied_domains) {
			lines.push(`    <denied>${denied}</denied>`);
		}
		lines.push("  </network>");
	}

	return `\n${lines.join("\n")}\n`;
}
