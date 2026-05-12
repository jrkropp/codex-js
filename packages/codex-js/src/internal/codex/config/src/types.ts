import type {
	ActivePermissionProfile,
	ApprovalsReviewer,
	AskForApproval,
	BaseInstructions,
	DynamicToolSpec,
	PermissionProfile,
	Personality,
	ReasoningEffortConfig,
	ReasoningSummaryConfig,
	SandboxPolicy,
	ServiceTier,
	SessionSource,
	TruncationPolicy,
	TurnEnvironmentSelection,
	WindowsSandboxLevel,
} from "../../core/src/protocol";
import type { CollaborationMode } from "../../core/src/config-types";
import type {
	DefaultToolsConfigInput,
	ToolsConfig,
} from "../../core/src/tools/spec_plan_types";
import type {
	WebSearchMode,
	WebSearchToolConfig,
} from "../../app-server-protocol/schema/typescript";

export const CONFIG_TOML_FILE = "config.toml";

export type ConfigLayerSource =
	| {
			type: "Mdm";
			domain: string;
			key: string;
	  }
	| {
			type: "System";
			file: string;
	  }
	| {
			type: "User";
			file: string;
	  }
	| {
			type: "Project";
			dot_codex_folder: string;
	  }
	| {
			type: "SessionFlags";
	  }
	| {
			type: "LegacyManagedConfigTomlFromFile";
			file: string;
	  }
	| {
			type: "LegacyManagedConfigTomlFromMdm";
	  };

export type ConfigLayerMetadata = {
	name: ConfigLayerSource;
	version: string;
};

export type ConfigLayerEntry = {
	name: ConfigLayerSource;
	config: ConfigToml;
	raw_toml?: string | null;
	version: string;
	disabled_reason?: string | null;
};

export type ConfigLayerStack = {
	layers: ConfigLayerEntry[];
	startup_warnings: string[];
};

export const ConfigLayerStackOrdering = {
	LowestPrecedenceFirst: "LowestPrecedenceFirst",
	HighestPrecedenceFirst: "HighestPrecedenceFirst",
} as const;

export type ConfigLayerStackOrdering =
	(typeof ConfigLayerStackOrdering)[keyof typeof ConfigLayerStackOrdering];

export type ConfigOverrides = ConfigToml;

export type ConfigToml = {
	model?: string;
	review_model?: string;
	model_provider?: string;
	service_tier?: ServiceTier | null;
	model_reasoning_effort?: ReasoningEffortConfig | null;
	plan_mode_reasoning_effort?: ReasoningEffortConfig | null;
	model_reasoning_summary?: ReasoningSummaryConfig;
	personality?: Personality | null;
	approval_policy?: AskForApproval;
	approvals_reviewer?: ApprovalsReviewer | null;
	sandbox_policy?: SandboxPolicy | null;
	sandbox_mode?: SandboxPolicy["mode"] | null;
	default_permissions?: string | null;
	permission_profile?: PermissionProfile | null;
	active_permission_profile?: ActivePermissionProfile | null;
	windows_sandbox_level?: WindowsSandboxLevel | null;
	cwd?: string;
	instructions?: string | null;
	model_instructions_file?: string | null;
	model_instructions_file_contents?: string | null;
	base_instructions?: BaseInstructions | string | null;
	developer_instructions?: string | null;
	user_instructions?: string | null;
	collaboration_mode?: CollaborationMode | null;
	session_source?: SessionSource;
	environments?: TurnEnvironmentSelection[];
	dynamic_tools?: DynamicToolSpec[];
	final_output_json_schema?: unknown;
	truncation_policy?: TruncationPolicy | null;
	web_search?: WebSearchMode | null;
	tools?: ToolsToml | null;
	features?: FeaturesToml | null;
	profiles?: Record<string, ConfigProfile>;
	profile?: string | null;
	compact_prompt?: string | null;
	include_permissions_instructions?: boolean;
	include_environment_context?: boolean;
	include_apps_instructions?: boolean;
	include_skill_instructions?: boolean;
};

export type ConfigProfile = Omit<ConfigToml, "profiles" | "profile">;

export type ToolsToml = Omit<DefaultToolsConfigInput, "web_search"> & {
	web_search?: Partial<WebSearchToolConfig> | boolean | null;
};

export type FeaturesToml = Record<string, unknown>;

export type ResolvedConfig = Required<
	Pick<
		ConfigToml,
		| "model"
		| "model_provider"
		| "approval_policy"
		| "cwd"
		| "session_source"
	>
> &
	Omit<
		ConfigToml,
		| "model"
		| "model_provider"
		| "approval_policy"
		| "cwd"
		| "session_source"
	> & {
		base_instructions: BaseInstructions;
		base_instructions_source:
			| "config"
			| "model_instructions_file"
			| "default";
		service_tier: ServiceTier | null;
		reasoning_effort: ReasoningEffortConfig | null;
		reasoning_summary: ReasoningSummaryConfig;
		developer_instructions: string | null;
		user_instructions: string | null;
		personality: Personality | null;
		sandbox_policy: SandboxPolicy;
		permission_profile: PermissionProfile;
		active_permission_profile: ActivePermissionProfile | null;
		windows_sandbox_level: WindowsSandboxLevel | null;
		collaboration_mode: CollaborationMode;
		environments: TurnEnvironmentSelection[];
		dynamic_tools: DynamicToolSpec[];
		final_output_json_schema?: unknown;
		truncation_policy: TruncationPolicy | null;
		web_search_mode: WebSearchMode;
		tools: ToolsConfig;
		startup_warnings: string[];
	};

export function createConfigLayerStack(
	layers: ConfigLayerEntry[] = [],
	startup_warnings: string[] = [],
): ConfigLayerStack {
	return { layers, startup_warnings };
}

export type LoaderOverrides = {
	ignore_user_config?: boolean;
	ignore_managed_requirements?: boolean;
	ignore_user_and_project_exec_policy_rules?: boolean;
};
