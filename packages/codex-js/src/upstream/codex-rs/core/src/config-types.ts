export const ModeKind = {
	Plan: "plan",
	Default: "default",
} as const;

export type ModeKind = (typeof ModeKind)[keyof typeof ModeKind];

export type ReasoningEffort = string;

export type CollaborationModeSettings = {
	model: string;
	reasoning_effort: ReasoningEffort | null;
	developer_instructions: string | null;
};

export type CollaborationMode = {
	mode: ModeKind;
	settings: CollaborationModeSettings;
};

export type CollaborationModeMask = {
	name: string;
	mode?: ModeKind | null;
	model?: string | null;
	reasoning_effort?: ReasoningEffort | null | undefined;
	developer_instructions?: string | null | undefined;
};

export const TUI_VISIBLE_COLLABORATION_MODES = [
	ModeKind.Default,
	ModeKind.Plan,
] as const satisfies readonly ModeKind[];

export function allowsRequestUserInput(mode: ModeKind): boolean {
	return mode === ModeKind.Plan;
}

export function modeDisplayName(mode: ModeKind): string {
	switch (mode) {
		case ModeKind.Plan:
			return "Plan";
		case ModeKind.Default:
			return "Default";
	}
}

export function collaborationModeWithUpdates(
	collaborationMode: CollaborationMode,
	model?: string | null,
	effort?: ReasoningEffort | null | undefined,
	developerInstructions?: string | null | undefined,
): CollaborationMode {
	return {
		mode: collaborationMode.mode,
		settings: {
			model: model ?? collaborationMode.settings.model,
			reasoning_effort:
				effort === undefined
					? collaborationMode.settings.reasoning_effort
					: effort,
			developer_instructions:
				developerInstructions === undefined
					? collaborationMode.settings.developer_instructions
					: developerInstructions,
		},
	};
}

export function applyCollaborationModeMask(
	collaborationMode: CollaborationMode,
	mask: CollaborationModeMask,
): CollaborationMode {
	return {
		mode: mask.mode ?? collaborationMode.mode,
		settings: {
			model: mask.model ?? collaborationMode.settings.model,
			reasoning_effort:
				mask.reasoning_effort === undefined
					? collaborationMode.settings.reasoning_effort
					: mask.reasoning_effort,
			developer_instructions:
				mask.developer_instructions === undefined
					? collaborationMode.settings.developer_instructions
					: mask.developer_instructions,
		},
	};
}

export function collaborationModeForModel(
	model: string,
	effort?: ReasoningEffort | null,
	mode: ModeKind = ModeKind.Default,
	developerInstructions: string | null = null,
): CollaborationMode {
	return {
		mode,
		settings: {
			model,
			reasoning_effort: effort ?? null,
			developer_instructions: developerInstructions,
		},
	};
}
