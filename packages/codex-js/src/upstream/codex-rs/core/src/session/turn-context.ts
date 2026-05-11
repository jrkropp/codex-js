import type { CollaborationMode } from "../config-types";
import type {
	ActivePermissionProfile,
	ApprovalsReviewer,
	AskForApproval,
	DynamicToolSpec,
	FileSystemSandboxPolicy,
	PermissionProfile,
	Personality,
	ReasoningEffortConfig,
	ReasoningSummaryConfig,
	SandboxPolicy,
	ServiceTier,
	SessionSource,
	TruncationPolicy,
	TurnContextItem,
	TurnEnvironmentSelection,
	W3cTraceContext,
	WindowsSandboxLevel,
} from "../protocol";
import type { ToolsConfig } from "../tools/spec_plan_types";
import { TurnTimingState } from "./turn-timing";
import {
	effectivePermissionProfile,
	legacySandboxPolicyFromPermissionProfile,
} from "../config/permissions";
import {
	autoCompactTokenLimit,
	effectiveContextWindow,
	modelInfoFromSlug,
	type ModelInfo,
} from "../model-provider";

export type TurnContextParams = {
	sub_id: string;
	trace?: W3cTraceContext;
	cwd: string;
	current_date?: string;
	timezone?: string;
	approval_policy: AskForApproval;
	approvals_reviewer?: ApprovalsReviewer | null;
	sandbox_policy: SandboxPolicy;
	permission_profile?: PermissionProfile | null;
	active_permission_profile?: ActivePermissionProfile | null;
	windows_sandbox_level?: WindowsSandboxLevel | null;
	model: string;
	model_info?: ModelInfo | null;
	personality?: Personality | null;
	collaboration_mode?: CollaborationMode | null;
	effort?: ReasoningEffortConfig | null;
	summary: ReasoningSummaryConfig;
	service_tier?: ServiceTier | null;
	session_source: SessionSource;
	environments: TurnEnvironmentSelection[];
	base_instructions?: string | null;
	user_instructions?: string | null;
	developer_instructions?: string | null;
	final_output_json_schema?: unknown;
	truncation_policy?: TruncationPolicy | null;
	dynamic_tools: DynamicToolSpec[];
	tools: ToolsConfig;
};

export class TurnContext {
	readonly sub_id: string;
	readonly trace_id?: string;
	readonly cwd: string;
	readonly current_date?: string;
	readonly timezone?: string;
	readonly approval_policy: AskForApproval;
	readonly approvals_reviewer?: ApprovalsReviewer | null;
	readonly sandbox_policy: SandboxPolicy;
	readonly permission_profile?: PermissionProfile | null;
	readonly active_permission_profile?: ActivePermissionProfile | null;
	readonly windows_sandbox_level?: WindowsSandboxLevel | null;
	readonly model: string;
	readonly model_info: ModelInfo;
	readonly personality?: Personality | null;
	readonly collaboration_mode?: CollaborationMode | null;
	readonly effort?: ReasoningEffortConfig | null;
	readonly summary: ReasoningSummaryConfig;
	readonly service_tier?: ServiceTier | null;
	readonly session_source: SessionSource;
	readonly environments: TurnEnvironmentSelection[];
	readonly base_instructions?: string | null;
	readonly user_instructions?: string | null;
	readonly developer_instructions?: string | null;
	readonly final_output_json_schema?: unknown;
	readonly truncation_policy?: TruncationPolicy | null;
	readonly dynamic_tools: DynamicToolSpec[];
	readonly tools: ToolsConfig;
	readonly turn_timing_state = new TurnTimingState();

	constructor(params: TurnContextParams) {
		this.sub_id = params.sub_id;
		this.trace_id = params.trace?.traceparent;
		this.cwd = params.cwd;
		this.current_date = params.current_date;
		this.timezone = params.timezone;
		this.approval_policy = params.approval_policy;
		this.approvals_reviewer = params.approvals_reviewer;
		this.sandbox_policy = params.sandbox_policy;
		this.permission_profile = params.permission_profile;
		this.active_permission_profile = params.active_permission_profile;
		this.windows_sandbox_level = params.windows_sandbox_level;
		this.model = params.model;
		this.model_info = params.model_info ?? modelInfoFromSlug(params.model);
		this.personality = params.personality;
		this.collaboration_mode = params.collaboration_mode;
		this.effort = params.effort;
		this.summary = params.summary;
		this.service_tier = params.service_tier;
		this.session_source = params.session_source;
		this.environments = params.environments;
		this.base_instructions = params.base_instructions;
		this.user_instructions = params.user_instructions;
		this.developer_instructions = params.developer_instructions;
		this.final_output_json_schema = params.final_output_json_schema;
		this.truncation_policy = params.truncation_policy;
		this.dynamic_tools = params.dynamic_tools;
		this.tools = params.tools;
	}

	toTurnContextItem(): TurnContextItem {
		const fileSystemSandboxPolicy: FileSystemSandboxPolicy | null = null;
		const permissionProfile = this.effectivePermissionProfile();
		const item: TurnContextItem = {
			turn_id: this.sub_id,
			trace_id: this.trace_id,
			cwd: this.cwd,
			current_date: this.current_date,
			timezone: this.timezone,
			approval_policy: this.approval_policy,
			sandbox_policy: this.effectiveSandboxPolicy(),
			permission_profile: permissionProfile,
			network: null,
			file_system_sandbox_policy: fileSystemSandboxPolicy,
			model: this.model,
			personality: this.personality,
			collaboration_mode: this.collaboration_mode,
			realtime_active: false,
			effort: this.effort,
			summary: this.summary,
			user_instructions: this.user_instructions,
			developer_instructions: this.developer_instructions,
			final_output_json_schema: this.final_output_json_schema,
			truncation_policy: this.truncation_policy,
		};
		if (this.windows_sandbox_level != null) {
			item.windows_sandbox_level = this.windows_sandbox_level;
		}
		return item;
	}

	effectivePermissionProfile(): PermissionProfile {
		return effectivePermissionProfile({
			permission_profile: this.permission_profile,
			sandbox_policy: this.sandbox_policy,
		});
	}

	effectiveSandboxPolicy(): SandboxPolicy {
		return legacySandboxPolicyFromPermissionProfile(
			this.effectivePermissionProfile(),
			this.cwd,
		);
	}

	model_context_window(): number | null {
		return effectiveContextWindow(this.model_info);
	}

	auto_compact_token_limit(): number | null {
		return autoCompactTokenLimit(this.model_info);
	}

	effectiveReasoningEffort(): ReasoningEffortConfig | null {
		return this.effort ?? null;
	}
}
