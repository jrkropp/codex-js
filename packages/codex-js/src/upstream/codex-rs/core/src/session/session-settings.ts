import {
	collaborationModeForModel,
	collaborationModeWithUpdates,
	type CollaborationMode,
} from "../config-types";
import { normalizeCollaborationMode } from "../collaboration-mode-presets";
import type {
	ActivePermissionProfile,
	ApprovalsReviewer,
	AskForApproval,
	PermissionProfile,
	Personality,
	ReasoningEffortConfig,
	ReasoningSummaryConfig,
	SandboxPolicy,
	ServiceTier,
	TurnEnvironmentSelection,
	UserInputOp,
	UserInputWithTurnContextOp,
	UserTurnOp,
	OverrideTurnContextOp,
	WindowsSandboxLevel,
} from "../protocol";
import type { SessionConfiguration } from "./session";
import {
	effectivePermissionProfile,
	legacySandboxPolicyFromPermissionProfile,
} from "../config/permissions";
import { modelInfoFromSlug } from "../model-provider";

export type SessionSettingsUpdate = {
	cwd?: string;
	approval_policy?: AskForApproval;
	approvals_reviewer?: ApprovalsReviewer | null;
	sandbox_policy?: SandboxPolicy;
	permission_profile?: PermissionProfile | null;
	active_permission_profile?: ActivePermissionProfile | null;
	windows_sandbox_level?: WindowsSandboxLevel | null;
	model?: string;
	effort?: ReasoningEffortConfig | null;
	summary?: ReasoningSummaryConfig;
	service_tier?: ServiceTier | null;
	collaboration_mode?: CollaborationMode;
	personality?: Personality | null;
	environments?: TurnEnvironmentSelection[];
	persist_environments?: boolean;
	final_output_json_schema?: unknown;
};

export class SessionSettingsUpdateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "SessionSettingsUpdateError";
	}
}

export function sessionSettingsUpdateFromUserTurn(
	op: UserTurnOp,
): SessionSettingsUpdate {
	return {
		cwd: op.cwd,
		approval_policy: op.approval_policy,
		approvals_reviewer: op.approvals_reviewer ?? null,
		sandbox_policy: op.sandbox_policy,
		permission_profile: op.permission_profile ?? null,
		active_permission_profile: null,
		model: op.model,
		effort: op.effort ?? null,
		summary: op.summary,
		service_tier: op.service_tier ?? null,
		final_output_json_schema: op.final_output_json_schema,
		collaboration_mode: normalizeCollaborationMode({
			collaborationMode:
				op.collaboration_mode ?? collaborationModeForModel(op.model, op.effort),
			model: op.model,
			reasoningEffort: op.effort ?? null,
		}),
		personality: op.personality ?? null,
		environments: op.environments,
		persist_environments: op.environments !== undefined,
	};
}

export function sessionSettingsUpdateFromUserInput(
	op: UserInputOp,
): SessionSettingsUpdate {
	return {
		environments: op.environments,
		persist_environments: false,
		final_output_json_schema: op.final_output_json_schema,
	};
}

export function sessionSettingsUpdateFromUserInputWithTurnContext(
	op: UserInputWithTurnContextOp,
	current: SessionConfiguration,
): SessionSettingsUpdate {
	const collaboration_mode =
		op.collaboration_mode ??
		(op.model || "effort" in op
			? collaborationModeWithModelUpdates(
					current.collaboration_mode,
					op.model ?? current.model,
					"effort" in op ? op.effort : current.reasoning_effort,
				)
			: undefined);
	const model = op.model ?? current.model;
	const effort = "effort" in op ? op.effort : current.reasoning_effort;

	return {
		cwd: op.cwd,
		approval_policy: op.approval_policy,
		approvals_reviewer: op.approvals_reviewer,
		sandbox_policy: op.sandbox_policy,
		permission_profile: op.permission_profile,
		active_permission_profile: op.active_permission_profile,
		windows_sandbox_level: op.windows_sandbox_level,
		model: op.model,
		effort: "effort" in op ? op.effort : undefined,
		summary: op.summary,
		service_tier: "service_tier" in op ? op.service_tier : undefined,
		final_output_json_schema: op.final_output_json_schema,
		collaboration_mode: collaboration_mode
			? normalizeCollaborationMode({
					collaborationMode: collaboration_mode,
					model,
					reasoningEffort: effort ?? null,
			  })
			: undefined,
		personality: op.personality,
		environments: op.environments,
		persist_environments: false,
	};
}

export function sessionSettingsUpdateFromOverrideTurnContext(
	op: OverrideTurnContextOp,
	current: SessionConfiguration,
): SessionSettingsUpdate {
	const collaboration_mode =
		op.collaboration_mode ??
		(op.model || "effort" in op
			? collaborationModeWithModelUpdates(
					current.collaboration_mode,
					op.model ?? current.model,
					"effort" in op ? op.effort : current.reasoning_effort,
				)
			: undefined);
	const model = op.model ?? current.model;
	const effort = "effort" in op ? op.effort : current.reasoning_effort;

	return {
		cwd: op.cwd,
		approval_policy: op.approval_policy,
		approvals_reviewer: op.approvals_reviewer,
		sandbox_policy: op.sandbox_policy,
		permission_profile: op.permission_profile,
		active_permission_profile: op.active_permission_profile,
		windows_sandbox_level: op.windows_sandbox_level,
		model: op.model,
		effort: "effort" in op ? op.effort : undefined,
		summary: op.summary,
		service_tier: "service_tier" in op ? op.service_tier : undefined,
		collaboration_mode: collaboration_mode
			? normalizeCollaborationMode({
					collaborationMode: collaboration_mode,
					model,
					reasoningEffort: effort ?? null,
			  })
			: undefined,
		personality: op.personality,
		environments: op.environments,
		persist_environments: op.environments !== undefined,
	};
}

export function applySessionSettingsUpdate(
	configuration: SessionConfiguration,
	updates: SessionSettingsUpdate,
): SessionConfiguration {
	const next: SessionConfiguration = { ...configuration };

	if (updates.cwd !== undefined) {
		if (updates.cwd.trim().length === 0) {
			throw new SessionSettingsUpdateError("cwd cannot be empty.");
		}
		next.cwd = updates.cwd;
	}
	if (updates.model !== undefined) {
		if (updates.model.trim().length === 0) {
			throw new SessionSettingsUpdateError("model cannot be empty.");
		}
		next.model = updates.model;
		next.model_info = modelInfoFromSlug(updates.model);
	}
	if (updates.collaboration_mode !== undefined) {
		next.collaboration_mode = normalizeCollaborationMode({
			collaborationMode: updates.collaboration_mode,
			model: next.model,
			reasoningEffort: updates.effort ?? next.reasoning_effort,
		});
	}
	if (updates.effort !== undefined) {
		next.reasoning_effort = updates.effort;
	}
	if (updates.summary !== undefined) {
		next.reasoning_summary = updates.summary;
	}
	if (updates.service_tier !== undefined) {
		next.service_tier = updates.service_tier;
	}
	if (updates.personality !== undefined) {
		next.personality = updates.personality;
	}
	if (updates.approval_policy !== undefined) {
		next.approval_policy = updates.approval_policy;
	}
	if (updates.approvals_reviewer !== undefined) {
		next.approvals_reviewer = updates.approvals_reviewer;
	}
	if (updates.permission_profile !== undefined) {
		next.permission_profile = effectivePermissionProfile({
			permission_profile: updates.permission_profile,
			sandbox_policy: updates.sandbox_policy ?? next.sandbox_policy,
		});
		next.sandbox_policy = legacySandboxPolicyFromPermissionProfile(
			next.permission_profile,
			next.cwd,
		);
		next.active_permission_profile = updates.active_permission_profile ?? null;
	} else if (updates.sandbox_policy !== undefined) {
		next.permission_profile = effectivePermissionProfile({
			permission_profile: null,
			sandbox_policy: updates.sandbox_policy,
		});
		next.sandbox_policy = legacySandboxPolicyFromPermissionProfile(
			next.permission_profile,
			next.cwd,
		);
		next.active_permission_profile = null;
	}
	if (updates.active_permission_profile !== undefined) {
		next.active_permission_profile = updates.active_permission_profile;
	}
	if (updates.windows_sandbox_level !== undefined) {
		next.windows_sandbox_level = updates.windows_sandbox_level;
	}
	if (updates.persist_environments && updates.environments !== undefined) {
		next.environments = updates.environments;
	}

	return next;
}

function collaborationModeWithModelUpdates(
	collaborationMode: CollaborationMode | null | undefined,
	model: string,
	effort?: ReasoningEffortConfig | null,
): CollaborationMode {
	const current = collaborationMode ?? collaborationModeForModel(model, effort);
	return collaborationModeWithUpdates(current, model, effort ?? null);
}
