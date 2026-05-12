import type { ReactNode } from "react";

import {
	isCodexReasoningEffort,
	type CodexModelOption,
	type CodexReasoningEffort,
	type ProviderDriverKind,
} from "../../lib/modelSelection";
import { TraitsPicker } from "./TraitsPicker";

export type ProviderOptionSelection = {
	name: string;
	value: string;
};

export type ComposerProviderStateInput = {
	model: string;
	modelOptions: ReadonlyArray<ProviderOptionSelection> | null | undefined;
	models: ReadonlyArray<CodexModelOption>;
	prompt: string;
	provider: ProviderDriverKind;
};

export type ComposerProviderState = {
	composerFrameClassName?: string;
	composerSurfaceClassName?: string;
	modelPickerIconClassName?: string;
	modelOptionsForDispatch: ReadonlyArray<ProviderOptionSelection> | undefined;
	promptEffort: string | null;
	provider: ProviderDriverKind;
};

type TraitsRenderInput = {
	model: string;
	modelOptions: ReadonlyArray<ProviderOptionSelection> | undefined;
	models: ReadonlyArray<CodexModelOption>;
	onEffortChange?: (effort: CodexReasoningEffort) => void;
	prompt: string;
	provider: ProviderDriverKind;
};

export function getComposerProviderState(
	input: ComposerProviderStateInput,
): ComposerProviderState {
	const promptEffort =
		input.modelOptions?.find((option) => option.name === "effort")?.value ?? null;

	return {
		modelOptionsForDispatch: input.modelOptions ?? undefined,
		promptEffort,
		provider: input.provider,
	};
}

export function renderProviderTraitsMenuContent(
	_input: TraitsRenderInput,
): ReactNode {
	void _input;
	return null;
}

export function renderProviderTraitsPicker(input: TraitsRenderInput): ReactNode {
	if (!input.onEffortChange) {
		return null;
	}

	const effortValue =
		input.modelOptions?.find((option) => option.name === "effort")?.value ??
		"medium";
	const effort: CodexReasoningEffort = isCodexReasoningEffort(effortValue)
		? effortValue
		: "medium";
	return (
		<TraitsPicker
			effort={effort}
			onEffortChange={input.onEffortChange}
		/>
	);
}
