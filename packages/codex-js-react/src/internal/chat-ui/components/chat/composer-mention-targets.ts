import type { MentionBinding } from "./mention-bindings";

export type ComposerMentionTarget = {
	binding: MentionBinding;
	displayName: string;
	label: string;
	mention: string;
	path: string;
};

export function searchComposerMentionTargets(input: {
	query: string;
	targets: readonly ComposerMentionTarget[];
}): ComposerMentionTarget[] {
	const query = input.query.trim().toLowerCase();

	return input.targets
		.filter((target) => {
			if (!query) {
				return true;
			}

			return (
				target.displayName.toLowerCase().includes(query) ||
				target.mention.toLowerCase().includes(query) ||
				target.path.toLowerCase().includes(query)
			);
		})
		.slice(0, 8);
}
