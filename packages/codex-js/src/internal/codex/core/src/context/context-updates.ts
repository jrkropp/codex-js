import type { ResponseItem, TurnContextItem } from "../protocol";
import type { TurnContext } from "../session/turn-context";
import type { PreviousTurnSettings } from "../session/rollout-reconstruction";
import { get_model_instructions } from "../model-provider";
import { normalizeCollaborationMode } from "../collaboration-mode-presets";
import type { CollaborationMode } from "../config-types";
import { ContextualUserFragment } from "./fragment";
import { EnvironmentContext } from "./environment-context";
import { PermissionsInstructions } from "./permissions-instructions";
import { CollaborationModeInstructions } from "./collaboration-mode-instructions";

export class ModelSwitchInstructions extends ContextualUserFragment {
	constructor(text: string) {
		super({
			role: "developer",
			start_marker: "<model_switch>",
			end_marker: "</model_switch>",
			body: () => text,
		});
	}
}

export function buildInitialContextItems(turnContext: TurnContext): ResponseItem[] {
	const developerSections = [
		PermissionsInstructions.fromTurnContext(turnContext).render(),
		turnContext.developer_instructions?.trim() ?? "",
		CollaborationModeInstructions.fromCollaborationMode(
			normalizedCollaborationMode(turnContext),
		)?.toText() ?? "",
	].filter((section) => section.trim().length > 0);
	const contextualUserSections = [
		turnContext.user_instructions?.trim()
			? renderUserInstructions(turnContext.cwd, turnContext.user_instructions.trim())
			: "",
		EnvironmentContext.fromTurnContext(turnContext).render(),
	].filter((section) => section.trim().length > 0);

	return [
		...buildTextMessage("developer", developerSections),
		...buildTextMessage("user", contextualUserSections),
	];
}

export function buildSettingsUpdateItems(
	previous: TurnContextItem | null | undefined,
	previousTurnSettings: PreviousTurnSettings | null | undefined,
	next: TurnContext,
): ResponseItem[] {
	const developerSections = [
		buildModelInstructionsUpdateItem(previousTurnSettings, next),
		buildPermissionsUpdateItem(previous, next),
		buildCollaborationModeUpdateItem(previous, next),
	].filter((section): section is string => Boolean(section?.trim()));
	const contextualUserSections = [
		buildEnvironmentUpdateItem(previous, next),
	].filter((section): section is string => Boolean(section?.trim()));

	return [
		...buildTextMessage("developer", developerSections),
		...buildTextMessage("user", contextualUserSections),
	];
}

export function buildModelInstructionsUpdateItem(
	previousTurnSettings: PreviousTurnSettings | null | undefined,
	next: TurnContext,
): string | null {
	if (!previousTurnSettings || previousTurnSettings.model === next.model) {
		return null;
	}
	const instructions = get_model_instructions(next.model_info, next.personality);
	return instructions.trim()
		? new ModelSwitchInstructions(instructions).render()
		: null;
}

function buildPermissionsUpdateItem(
	previous: TurnContextItem | null | undefined,
	next: TurnContext,
): string | null {
	if (!previous) {
		return null;
	}
	if (
		JSON.stringify(previous.permission_profile ?? null) ===
			JSON.stringify(next.effectivePermissionProfile()) &&
		previous.approval_policy === next.approval_policy
	) {
		return null;
	}
	return PermissionsInstructions.fromTurnContext(next).render();
}

function buildCollaborationModeUpdateItem(
	previous: TurnContextItem | null | undefined,
	next: TurnContext,
): string | null {
	if (!previous) {
		return null;
	}
	const nextCollaborationMode = normalizedCollaborationMode(next);
	if (
		JSON.stringify(previous.collaboration_mode ?? null) ===
		JSON.stringify(nextCollaborationMode ?? null)
	) {
		return null;
	}
	return CollaborationModeInstructions.fromCollaborationMode(
		nextCollaborationMode,
	)?.toText() ?? null;
}

function buildEnvironmentUpdateItem(
	previous: TurnContextItem | null | undefined,
	next: TurnContext,
): string | null {
	if (!previous) {
		return null;
	}
	const previousEnvironment = EnvironmentContext.fromTurnContextItem(previous).render();
	const nextEnvironment = EnvironmentContext.fromTurnContext(next).render();
	return previousEnvironment === nextEnvironment ? null : nextEnvironment;
}

function buildTextMessage(role: string, textSections: string[]): ResponseItem[] {
	if (textSections.length === 0) {
		return [];
	}
	return [
		{
			type: "message",
			role,
			content: textSections.map((text) => ({ type: "input_text", text })),
		},
	];
}

function renderUserInstructions(directory: string, text: string): string {
	return `# AGENTS.md instructions for ${directory}\n\n<INSTRUCTIONS>\n${text}\n</INSTRUCTIONS>`;
}

function normalizedCollaborationMode(
	turnContext: TurnContext,
): CollaborationMode | null {
	if (!turnContext.collaboration_mode) {
		return null;
	}
	return normalizeCollaborationMode({
		collaborationMode: turnContext.collaboration_mode,
		model: turnContext.model,
		reasoningEffort: turnContext.effort,
	});
}
