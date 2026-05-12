import { ContextualUserFragment } from "./fragment";

export class UserInstructions extends ContextualUserFragment {
	constructor(params: { directory: string; text: string }) {
		super({
			role: "user",
			start_marker: "# AGENTS.md instructions for ",
			end_marker: "</INSTRUCTIONS>",
			body: () => `${params.directory}\n\n<INSTRUCTIONS>\n${params.text}\n`,
		});
	}
}
