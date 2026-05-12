import type { CollaborationMode } from "../config-types";
import type { ResponseItem } from "../models";
import { ContextualUserFragment } from "./fragment";

export class CollaborationModeInstructions {
	private constructor(private readonly instructions: string) {}

	static fromCollaborationMode(
		collaborationMode: CollaborationMode | null,
	): CollaborationModeInstructions | null {
		const instructions =
			collaborationMode?.settings.developer_instructions?.trim() ?? "";
		return instructions.length > 0
			? new CollaborationModeInstructions(instructions)
			: null;
	}

	toResponseItem(): ResponseItem {
		return this.toFragment().toResponseItem();
	}

	toText(): string {
		return this.toFragment().render();
	}

	private toFragment(): ContextualUserFragment {
		return new ContextualUserFragment({
			role: "developer",
			start_marker: "<collaboration_mode>",
			end_marker: "</collaboration_mode>",
			body: () => this.instructions,
		});
	}
}
