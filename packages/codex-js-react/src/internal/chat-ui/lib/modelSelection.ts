import {
	defaultModelsManager,
	resolveReasoningEffortForModel,
	type ModelPreset,
} from "@jrkropp/codex-js/client";

export type CodexModelOption = {
	slug: string;
	name: string;
	shortName?: string;
	subProvider?: string;
	description: string;
};

export type ProviderDriverKind = "codex" | (string & {});

export type ProviderInstanceId = string;

export type ProviderInstanceEntry = {
	accentColor?: string;
	continuationGroupKey?: string;
	displayName: string;
	driverKind: ProviderDriverKind;
	instanceId: ProviderInstanceId;
	isAvailable: boolean;
	snapshot: { message?: string | null };
	status: "ready" | "warning" | "error" | "disabled" | "loading";
};

export type CodexReasoningEffort = "low" | "medium" | "high" | "xhigh";

export type CodexReasoningEffortOption = {
	value: CodexReasoningEffort;
	label: string;
	description: string;
};

export const defaultCodexModel = "gpt-5.5";
export const defaultCodexReasoningEffort =
	defaultModelsManager().default_reasoning_effort(
		defaultCodexModel,
	) as CodexReasoningEffort;

export const codexModelOptions: readonly CodexModelOption[] =
	defaultModelsManager()
		.list_models()
		.data.map(modelPresetToOption);

export const defaultCodexProviderInstance: ProviderInstanceEntry = {
	displayName: "Codex",
	driverKind: "codex",
	instanceId: "codex",
	isAvailable: true,
	snapshot: {},
	status: "ready",
};

export const codexReasoningEffortOptions: readonly CodexReasoningEffortOption[] = [
	{
		value: "low",
		label: "Low",
		description: "Fast responses with lighter reasoning.",
	},
	{
		value: "medium",
		label: "Medium",
		description: "Balanced speed and reasoning depth.",
	},
	{
		value: "high",
		label: "High",
		description: "Deeper reasoning for complex planning.",
	},
	{
		value: "xhigh",
		label: "Extra high",
		description: "Maximum reasoning depth for hard tasks.",
	},
];

export function resolveCodexModelOption(model: string): CodexModelOption {
	return (
		codexModelOptions.find((option) => option.slug === model) ??
		codexModelOptions[0] ?? {
			slug: model,
			name: model,
			description: "Custom Codex model.",
		}
	);
}

export function resolveCodexReasoningEffortOption(
	effort: string,
): CodexReasoningEffortOption {
	return (
		codexReasoningEffortOptions.find((option) => option.value === effort) ??
		codexReasoningEffortOptions[1] ??
		({
			value: defaultCodexReasoningEffort,
			label: "Medium",
			description: "Balanced speed and reasoning depth.",
		} satisfies CodexReasoningEffortOption)
	);
}

export function isCodexReasoningEffort(
	value: string,
): value is CodexReasoningEffort {
	return codexReasoningEffortOptions.some((option) => option.value === value);
}

export function resolveCodexReasoningEffortForModel(
	model: string,
	effort: string | null | undefined,
): CodexReasoningEffort {
	return resolveReasoningEffortForModel(model, effort) as CodexReasoningEffort;
}

function modelPresetToOption(model: ModelPreset): CodexModelOption {
	return {
		slug: model.model,
		name: model.display_name,
		shortName: model.display_name.replace(/^GPT-/, ""),
		subProvider: "OpenAI",
		description: model.description,
	};
}
