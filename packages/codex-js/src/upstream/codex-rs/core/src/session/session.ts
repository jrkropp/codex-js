import { ModeKind, type CollaborationMode } from "../config-types";
import {
	ConfigLayerEntry_new,
	merge_config_layers,
	type ConfigOverrides,
	type ResolvedConfig,
} from "../../../config/src";
import type { ThreadId } from "../ids";
import type { LiveThread } from "../thread-store/live-thread";
import type { ThreadMemoryMode } from "../memory";
import type {
	ActivePermissionProfile,
	ApprovalsReviewer,
	AskForApproval,
	BaseInstructions,
	ContentItem,
	DynamicToolResponse,
	DynamicToolSpec,
	EventMsg,
	Op,
	PermissionProfile,
	Personality,
	RateLimitSnapshot,
	ReasoningEffortConfig,
	ReasoningSummaryConfig,
	ResponseItem,
	RolloutItem,
	SandboxPolicy,
	ServiceTier,
	SessionSource,
	Submission,
	TextElement,
	TokenUsage,
	TokenUsageInfo,
	TurnContextItem,
	ThreadGoal,
	TruncationPolicy,
	TurnEnvironmentSelection,
	UserInput,
	UserInputOp,
	UserInputWithTurnContextOp,
	UserTurnOp,
	WindowsSandboxLevel,
	CompactedItem,
} from "../protocol";
import {
	GoalRuntimeState,
	type CreateGoalRequest,
	type ThreadGoalStore,
} from "../goals";
import {
	Hooks,
	requestPermissionsResponseFromDecision,
	run_permission_request_hooks,
	run_post_compact_hooks,
	run_pre_compact_hooks,
	run_session_start_hooks,
	run_stop_hooks,
	run_user_prompt_submit_hooks,
} from "../hooks";
import { AgentControl } from "../agent/mod";
import {
	ActiveTurn,
	type PendingDynamicTool,
	type PendingRequestPermissions,
	type PendingUserInput,
} from "../state/turn";
import { SessionState } from "../state/session";
import {
	SessionTaskContext,
	TaskKind,
	type RunningTask,
	type SessionTask,
	type SessionTaskResult,
} from "../tasks/mod";
import type {
	NormalizedRequestUserInputArgs,
	RequestUserInputResponse,
} from "../request_user_input";
import {
	PermissionGrantScope,
	emptyRequestPermissionsResponse,
	type RequestPermissionProfile,
	type RequestPermissionsArgs,
	type RequestPermissionsResponse,
} from "../request_permissions";
import { TurnContext } from "./turn-context";
import {
	buildCompactedHistory,
	compactedThreadWarning,
	SUMMARY_PREFIX,
} from "../compact";
import {
	buildInitialContextItems,
	buildSettingsUpdateItems,
} from "../context/context-updates";
import { turnAbortedResponseItem } from "../context/turn-aborted";
import {
	effectivePermissionProfile,
	legacySandboxPolicyFromPermissionProfile,
} from "../config/permissions";
import { resolve_web_search_mode_for_turn } from "../config/mod";
import {
	applySessionSettingsUpdate,
	sessionSettingsUpdateFromUserInput,
	sessionSettingsUpdateFromUserInputWithTurnContext,
	sessionSettingsUpdateFromOverrideTurnContext,
	sessionSettingsUpdateFromUserTurn,
	type SessionSettingsUpdate,
	SessionSettingsUpdateError,
} from "./session-settings";
import {
	reconstructHistoryFromRollout,
	type PreviousTurnSettings,
} from "./rollout-reconstruction";
import {
	PermissionGrantStore,
	normalizeRequestPermissionsResponseForCwd,
} from "../tools/orchestrator";
import type { ToolsConfig } from "../tools/spec_plan_types";
import {
	EmptyMcpConnectionManager,
	type McpConnectionManager,
	type McpResourceListParams,
	type McpResourceListResponse,
	type McpResourceReadParams,
	type McpResourceReadResponse,
	type McpResourceTemplateListResponse,
	type McpRuntimeEnvironment,
	type McpServerElicitationRequest,
	type McpServerElicitationResponse,
	type McpServerRefreshConfig,
	type McpServerToolCallParams,
	type McpServerToolCallResponse,
	type McpServerStatus,
	type McpToolInfo,
	type McpRequestId,
} from "../mcp";
import {
	get_model_instructions,
	modelInfoFromSlug,
	type ModelInfo,
} from "../model-provider";

export type Event = {
	id: string;
	msg: EventMsg;
};

export type SessionConfiguration = {
	provider: string;
	model: string;
	model_info?: ModelInfo | null;
	collaboration_mode: CollaborationMode;
	reasoning_effort?: ReasoningEffortConfig | null;
	reasoning_summary: ReasoningSummaryConfig;
	service_tier?: ServiceTier | null;
	base_instructions: BaseInstructions;
	developer_instructions?: string | null;
	user_instructions?: string | null;
	personality?: Personality | null;
	cwd: string;
	approval_policy: AskForApproval;
	approvals_reviewer?: ApprovalsReviewer | null;
	sandbox_policy: SandboxPolicy;
	permission_profile: PermissionProfile;
	active_permission_profile?: ActivePermissionProfile | null;
	windows_sandbox_level?: WindowsSandboxLevel | null;
	environments: TurnEnvironmentSelection[];
	session_source: SessionSource;
	dynamic_tools: DynamicToolSpec[];
	tools: ToolsConfig;
	final_output_json_schema?: unknown;
	truncation_policy?: TruncationPolicy | null;
};

export type SessionParams = {
	threadId: ThreadId;
	configuration: SessionConfiguration;
	liveThread?: LiveThread | null;
	idGenerator?: () => string;
	eventSink?: (event: Event) => void;
	now?: () => number;
	initialHistory?: RolloutItem[] | null;
	rolloutPath?: string | null;
	forkedFromId?: ThreadId | null;
	threadName?: string | null;
	threadSource?: string | null;
	hooks?: Hooks;
	threadGoalStore?: ThreadGoalStore | null;
	mcpConnectionManager?: McpConnectionManager | null;
	agentControl?: AgentControl | null;
};

export type SessionConfigurationFromConfigOptions = {
	previous_base_instructions?: BaseInstructions | null;
	model_info?: ModelInfo | null;
};

export const SteerInputErrorKind = {
	EmptyInput: "empty_input",
	NoActiveTurn: "no_active_turn",
	ExpectedTurnMismatch: "expected_turn_mismatch",
	ActiveTurnNotSteerable: "active_turn_not_steerable",
} as const;

export type SteerInputErrorKind =
	(typeof SteerInputErrorKind)[keyof typeof SteerInputErrorKind];

export class SteerInputError extends Error {
	private constructor(
		readonly kind: SteerInputErrorKind,
		message: string,
		readonly input: UserInput[] = [],
	) {
		super(message);
		this.name = "SteerInputError";
	}

	static emptyInput(): SteerInputError {
		return new SteerInputError(
			SteerInputErrorKind.EmptyInput,
			"Cannot steer empty input.",
		);
	}

	static noActiveTurn(input: UserInput[]): SteerInputError {
		return new SteerInputError(
			SteerInputErrorKind.NoActiveTurn,
			"No active turn is available for steered input.",
			input,
		);
	}

	static expectedTurnMismatch(input: {
		expected: string;
		actual: string;
		items: UserInput[];
	}): SteerInputError {
		return new SteerInputError(
			SteerInputErrorKind.ExpectedTurnMismatch,
			`Expected active turn ${input.expected}, but current active turn is ${input.actual}.`,
			input.items,
		);
	}

	static activeTurnNotSteerable(input: {
		kind: TaskKind;
		items: UserInput[];
	}): SteerInputError {
		return new SteerInputError(
			SteerInputErrorKind.ActiveTurnNotSteerable,
			`Active ${input.kind} turn is not steerable.`,
			input.items,
		);
	}
}

const defaultCollaborationMode: CollaborationMode = {
	mode: ModeKind.Default,
	settings: {
		model: "gpt-5.5",
		reasoning_effort: null,
		developer_instructions: null,
	},
};

const DEFAULT_CONFIG_LAYER = ConfigLayerEntry_new({ type: "System", file: "" }, {
	model: "gpt-5.5",
	model_provider: "openai",
	collaboration_mode: defaultCollaborationMode,
	model_reasoning_effort: null,
	model_reasoning_summary: "auto",
	service_tier: null,
	developer_instructions: null,
	user_instructions: null,
	personality: null,
	cwd: "",
	approval_policy: "never",
	approvals_reviewer: null,
	session_source: "test",
	environments: [],
	dynamic_tools: [],
	tools: {},
	truncation_policy: null,
});

function defaultIdGenerator(): string {
	return typeof crypto !== "undefined" && "randomUUID" in crypto
		? crypto.randomUUID()
		: fallbackRandomId();
}

function defaultNow(): number {
	return Date.now();
}

function normalizeSessionConfiguration(
	configuration: SessionConfiguration,
): SessionConfiguration {
	const permissionProfile = sessionConfigurationPermissionProfile(configuration);
	return {
		...configuration,
		permission_profile: permissionProfile,
		sandbox_policy: legacySandboxPolicyFromPermissionProfile(
			permissionProfile,
			configuration.cwd,
		),
	};
}

export function defaultSessionConfiguration(
	overrides: Partial<SessionConfiguration> = {},
): SessionConfiguration {
	const configuration = session_configuration_from_config(
		merge_config_layers(
			{ layers: [DEFAULT_CONFIG_LAYER], startup_warnings: [] },
			sessionConfigurationOverridesToConfig(overrides),
		),
	);
	return {
		...configuration,
		model_info:
			overrides.model_info !== undefined
				? overrides.model_info
				: configuration.model_info,
	};
}

export function session_configuration_from_config(
	config: ResolvedConfig,
	options: SessionConfigurationFromConfigOptions = {},
): SessionConfiguration {
	return normalizeSessionConfiguration({
		provider: config.model_provider,
		model: config.model,
		model_info: options.model_info ?? modelInfoFromSlug(config.model),
		collaboration_mode: config.collaboration_mode,
		reasoning_effort: config.reasoning_effort,
		reasoning_summary: config.reasoning_summary,
		service_tier: config.service_tier,
		base_instructions: resolve_session_base_instructions(config, options),
		developer_instructions: config.developer_instructions,
		user_instructions: config.user_instructions,
		personality: config.personality,
		cwd: config.cwd,
		approval_policy: config.approval_policy,
		approvals_reviewer: config.approvals_reviewer,
		sandbox_policy: config.sandbox_policy,
		permission_profile: config.permission_profile,
		active_permission_profile: config.active_permission_profile,
		windows_sandbox_level: config.windows_sandbox_level,
		environments: config.environments,
		session_source: config.session_source,
		dynamic_tools: config.dynamic_tools,
		tools: config.tools,
		final_output_json_schema: config.final_output_json_schema,
		truncation_policy: config.truncation_policy,
	});
}

export function resolve_session_base_instructions(
	config: ResolvedConfig,
	options: SessionConfigurationFromConfigOptions = {},
): BaseInstructions {
	if (config.base_instructions_source !== "default") {
		return config.base_instructions;
	}
	if (options.previous_base_instructions?.text) {
		return options.previous_base_instructions;
	}
	const modelInfo = options.model_info ?? modelInfoFromSlug(config.model);
	return {
		text: get_model_instructions(modelInfo, config.personality),
	};
}

function sessionConfigurationOverridesToConfig(
	overrides: Partial<SessionConfiguration>,
): ConfigOverrides {
	return {
		model: overrides.model,
		model_provider: overrides.provider,
		collaboration_mode: overrides.collaboration_mode,
		model_reasoning_effort: overrides.reasoning_effort,
		model_reasoning_summary: overrides.reasoning_summary,
		service_tier: overrides.service_tier,
		instructions: overrides.base_instructions?.text,
		developer_instructions: overrides.developer_instructions,
		user_instructions: overrides.user_instructions,
		personality: overrides.personality,
		cwd: overrides.cwd,
		approval_policy: overrides.approval_policy,
		approvals_reviewer: overrides.approvals_reviewer,
		sandbox_policy: overrides.sandbox_policy,
		permission_profile: overrides.permission_profile,
		active_permission_profile: overrides.active_permission_profile,
		windows_sandbox_level: overrides.windows_sandbox_level,
		environments: overrides.environments,
		session_source: overrides.session_source,
		dynamic_tools: overrides.dynamic_tools,
		tools: overrides.tools,
		final_output_json_schema: overrides.final_output_json_schema,
		truncation_policy: overrides.truncation_policy,
	};
}

export function sessionConfigurationPermissionProfile(
	configuration: SessionConfiguration,
): PermissionProfile {
	return effectivePermissionProfile({
		permission_profile: configuration.permission_profile,
		sandbox_policy: configuration.sandbox_policy,
	});
}

export function sessionConfigurationActivePermissionProfile(
	configuration: SessionConfiguration,
): ActivePermissionProfile | null {
	return configuration.active_permission_profile ?? null;
}

export function sessionConfigurationSandboxPolicy(
	configuration: SessionConfiguration,
): SandboxPolicy {
	return legacySandboxPolicyFromPermissionProfile(
		sessionConfigurationPermissionProfile(configuration),
		configuration.cwd,
	);
}

export function turn_context_from_config(
	config: ResolvedConfig,
	submissionId: string,
	trace?: Submission["trace"],
): TurnContext {
	return new TurnContext({
		sub_id: submissionId,
		trace,
		cwd: config.cwd,
		approval_policy: config.approval_policy,
		approvals_reviewer: config.approvals_reviewer,
		sandbox_policy: config.sandbox_policy,
		permission_profile: config.permission_profile,
		active_permission_profile: config.active_permission_profile,
		windows_sandbox_level: config.windows_sandbox_level,
		model: config.model,
		model_info: modelInfoFromSlug(config.model),
		personality: config.personality,
		collaboration_mode: config.collaboration_mode,
		effort: config.reasoning_effort,
		summary: config.reasoning_summary,
		service_tier: config.service_tier,
		session_source: config.session_source,
		environments: config.environments,
		base_instructions: resolve_session_base_instructions(config).text,
		user_instructions: config.user_instructions,
		developer_instructions: config.developer_instructions,
		final_output_json_schema: config.final_output_json_schema,
		truncation_policy: config.truncation_policy,
		dynamic_tools: config.dynamic_tools,
		tools: toolsConfigForTurn(config.tools, config.permission_profile),
	});
}

export class Session {
	readonly threadId: ThreadId;
	readonly emittedEvents: Event[] = [];
	private readonly liveThread: LiveThread | null;
	private readonly idGenerator: () => string;
	private readonly eventSink?: (event: Event) => void;
	private readonly now: () => number;
	private configuration: SessionConfiguration;
	private readonly rolloutPath: string | null;
	private readonly forkedFromId: ThreadId | null;
	private readonly threadName: string | null;
	private readonly threadSource: string | null;
	private readonly initialMessages: EventMsg[] | null;
	private readonly hook_runtime: Hooks;
	private readonly agent_control: AgentControl;
	private readonly goal_runtime: GoalRuntimeState;
	private readonly mcp_connection_manager: McpConnectionManager;
	private readonly state: SessionState;
	private sessionConfiguredSent = false;
	private sessionStartHooksRan = false;
	private readonly idle_pending_input: UserInput[] = [];
	private readonly session_permission_grants = new PermissionGrantStore();
	activeTurn: ActiveTurn | null = null;

	constructor(params: SessionParams) {
		this.threadId = params.threadId;
		this.configuration = normalizeSessionConfiguration(params.configuration);
		this.liveThread = params.liveThread ?? null;
		this.idGenerator = params.idGenerator ?? defaultIdGenerator;
		this.eventSink = params.eventSink;
		this.now = params.now ?? defaultNow;
		const initialHistory = params.initialHistory ?? [];
		const reconstructed = reconstructHistoryFromRollout(initialHistory);
		this.state = new SessionState({
			session_configuration: this.configuration,
			previous_turn_settings: reconstructed.previous_turn_settings,
			reference_context_item: reconstructed.reference_context_item,
			token_info: last_token_info_from_rollout(initialHistory),
		});
		this.state.replace_history(
			reconstructed.history,
			reconstructed.reference_context_item,
		);
		this.rolloutPath = params.rolloutPath ?? null;
		this.forkedFromId = params.forkedFromId ?? null;
		this.threadName = params.threadName ?? null;
		this.threadSource = params.threadSource ?? null;
		this.initialMessages = initialMessagesFromRollout(initialHistory);
		this.hook_runtime = params.hooks ?? Hooks.empty();
		this.agent_control = params.agentControl ?? AgentControl.empty();
		this.mcp_connection_manager =
			params.mcpConnectionManager ?? EmptyMcpConnectionManager.instance;
		this.goal_runtime = new GoalRuntimeState({
			thread_id: this.threadId,
			store: params.threadGoalStore ?? null,
			now: this.now,
		});
	}

	private get token_info(): TokenUsageInfo | null {
		return this.state.token_info();
	}

	private set token_info(info: TokenUsageInfo | null) {
		this.state.set_token_info(info);
	}

	private get latest_rate_limits(): RateLimitSnapshot | null {
		return this.state.latest_rate_limits();
	}

	private set latest_rate_limits(snapshot: RateLimitSnapshot | null) {
		this.state.set_latest_rate_limits(snapshot);
	}

	private get reference_context_item(): TurnContextItem | null {
		return this.state.reference_context_item();
	}

	private set reference_context_item(item: TurnContextItem | null) {
		this.state.set_reference_context_item(item);
	}

	private get previous_turn_settings(): PreviousTurnSettings | null {
		return this.state.previous_turn_settings();
	}

	private set previous_turn_settings(settings: PreviousTurnSettings | null) {
		this.state.set_previous_turn_settings(settings);
	}

	async submit(op: Op): Promise<string> {
		const id = this.idGenerator();
		await this.submit_with_id({ id, op });
		return id;
	}

	async submit_with_id(submission: Submission): Promise<void> {
		switch (submission.op.type) {
			case "user_turn":
			case "user_input":
			case "user_input_with_turn_context":
				await this.userInputOrTurn(submission);
				return;
			case "override_turn_context":
				await this.overrideTurnContext(submission);
				return;
			case "user_input_answer":
				this.notifyUserInputResponse(
					submission.op.id,
					submission.op.response,
				);
				return;
			case "request_permissions_response":
				this.notify_request_permissions_response(
					submission.op.id,
					submission.op.response,
				);
				return;
			case "mcp_server_elicitation_response":
				await this.resolve_elicitation(
					submission.op.server_name,
					submission.op.id,
					submission.op.response,
				);
				return;
			case "dynamic_tool_response":
				this.notify_dynamic_tool_response(
					submission.op.id,
					submission.op.response,
				);
				return;
				case "realtime_conversation_start":
			case "realtime_conversation_audio":
			case "realtime_conversation_text":
			case "realtime_conversation_close":
			case "realtime_conversation_list_voices":
				return;
			case "set_thread_name":
				await this.liveThread?.updateMetadata(
					{ name: submission.op.name },
					false,
				);
				return;
			case "set_thread_memory_mode":
				await this.setThreadMemoryMode(submission.op.mode);
				return;
			case "compact":
				await this.compactWithoutModel(submission);
				return;
			case "thread_rollback":
				await this.threadRollback(submission);
				return;
			case "interrupt":
				await this.interrupt();
				return;
			case "shutdown":
				await this.shutdown();
				return;
			default:
				submission.op satisfies never;
				return;
		}
	}

	insertPendingUserInput(key: string, pending: PendingUserInput): void {
		if (!this.activeTurn) {
			this.activeTurn = new ActiveTurn();
		}

		this.activeTurn.turn_state.insertPendingUserInput(key, pending);
	}

	insertPendingDynamicTool(key: string, pending: PendingDynamicTool): void {
		if (!this.activeTurn) {
			this.activeTurn = new ActiveTurn();
		}

		this.activeTurn.turn_state.insertPendingDynamicTool(key, pending);
	}

	insertPendingRequestPermissions(
		key: string,
		pending: PendingRequestPermissions,
	): void {
		if (!this.activeTurn) {
			this.activeTurn = new ActiveTurn();
		}

		this.activeTurn.turn_state.insertPendingRequestPermissions(key, pending);
	}

	async steer_input(
		input: UserInput[],
		expected_turn_id?: string | null,
	): Promise<string> {
		if (input.length === 0) {
			throw SteerInputError.emptyInput();
		}

		const activeTask = this.activeTurn?.firstTask();
		if (!activeTask) {
			throw SteerInputError.noActiveTurn(input);
		}

		if (expected_turn_id && expected_turn_id !== activeTask.sub_id) {
			throw SteerInputError.expectedTurnMismatch({
				expected: expected_turn_id,
				actual: activeTask.sub_id,
				items: input,
			});
		}

		if (activeTask.kind !== "Regular") {
			throw SteerInputError.activeTurnNotSteerable({
				kind: activeTask.kind,
				items: input,
			});
		}

		for (const item of input) {
			this.activeTurn?.turn_state.pushPendingInput(item);
		}
		this.activeTurn?.turn_state.acceptMailboxDeliveryForCurrentTurn();
		return activeTask.sub_id;
	}

	async inject_response_items(input: UserInput[]): Promise<boolean> {
		if (!this.activeTurn) {
			return false;
		}

		for (const item of input) {
			this.activeTurn.turn_state.pushPendingInput(item);
		}
		return true;
	}

	async prepend_pending_input(input: UserInput[]): Promise<boolean> {
		if (!this.activeTurn) {
			return false;
		}

		this.activeTurn.turn_state.prependPendingInput(input);
		return true;
	}

	async get_pending_input(): Promise<UserInput[]> {
		return this.activeTurn?.turn_state.takePendingInput() ?? [];
	}

	async has_pending_input(): Promise<boolean> {
		return (
			this.activeTurn?.turn_state.hasPendingInput() ??
			this.idle_pending_input.length > 0
		);
	}

	async queue_response_items_for_next_turn(items: UserInput[]): Promise<void> {
		this.idle_pending_input.push(...items);
	}

	async take_queued_response_items_for_next_turn(): Promise<UserInput[]> {
		return this.idle_pending_input.splice(0);
	}

	collaboration_mode(): CollaborationMode {
		return this.configuration.collaboration_mode;
	}

	granted_session_permissions(): RequestPermissionProfile[] {
		return this.session_permission_grants.all();
	}

	hooks(): Hooks {
		return this.hook_runtime;
	}

	agentControl(): AgentControl {
		return this.agent_control;
	}

	async configure_session(
		initialMessages: EventMsg[] | null = this.initialMessages,
	): Promise<void> {
		if (this.sessionConfiguredSent) {
			return;
		}
		this.sessionConfiguredSent = true;
		await this.send_event_raw({
			id: "0",
			msg: {
				type: "session_configured",
				session_id: this.threadId,
				thread_id: this.threadId,
				forked_from_id: this.forkedFromId,
				thread_source: this.threadSource,
				thread_name: this.threadName,
				model: this.configuration.model,
				model_provider_id: this.configuration.provider,
				service_tier: this.configuration.service_tier,
				approval_policy: this.configuration.approval_policy,
				approvals_reviewer: this.configuration.approvals_reviewer,
				permission_profile: sessionConfigurationPermissionProfile(
					this.configuration,
				),
				active_permission_profile:
					sessionConfigurationActivePermissionProfile(this.configuration),
				cwd: this.configuration.cwd,
				reasoning_effort: this.configuration.reasoning_effort,
				initial_messages: initialMessages,
				network_proxy: null,
				rollout_path: this.rolloutPath,
			},
		});
	}

	strict_auto_review_enabled_for_turn(): boolean {
		return this.activeTurn?.turn_state.strictAutoReviewEnabled() ?? false;
	}

	async request_user_input(
		turnContext: TurnContext,
		callId: string,
		args: NormalizedRequestUserInputArgs,
	): Promise<RequestUserInputResponse | null> {
		if (!this.activeTurn) {
			return null;
		}

		const response = new Promise<RequestUserInputResponse | null>((resolve) => {
			this.activeTurn?.turn_state.insertPendingUserInput(turnContext.sub_id, {
				resolve,
			});
		});

		await this.send_event(turnContext, {
			type: "request_user_input",
			call_id: callId,
			turn_id: turnContext.sub_id,
			questions: args.questions,
		});

		return response;
	}

	async request_permissions(
		turnContext: TurnContext,
		callId: string,
		args: RequestPermissionsArgs,
	): Promise<RequestPermissionsResponse | null> {
		if (!this.activeTurn) {
			return null;
		}

		if (turnContext.approval_policy === "never") {
			return emptyRequestPermissionsResponse();
		}

		const hookDecision = await run_permission_request_hooks(
			this,
			turnContext,
			{
				run_id_suffix: callId,
				tool_name: "request_permissions",
				tool_input: args,
			},
		);
		const hookResponse = requestPermissionsResponseFromDecision(hookDecision);
		if (hookResponse) {
			return hookResponse;
		}

		const response = new Promise<RequestPermissionsResponse | null>((resolve) => {
			this.activeTurn?.turn_state.insertPendingRequestPermissions(callId, {
				resolve,
			});
		});

		await this.send_event(turnContext, {
			type: "request_permissions",
			call_id: callId,
			turn_id: turnContext.sub_id,
			reason: args.reason ?? null,
			permissions: args.permissions,
			cwd: turnContext.cwd,
		});

		const resolved = await response;
		if (!resolved) {
			return null;
		}

		return this.record_granted_request_permissions(turnContext, resolved);
	}

	async refresh_mcp_servers_now(
		turnContext: TurnContext,
		config: McpServerRefreshConfig,
		environment: McpRuntimeEnvironment = { cwd: turnContext.cwd },
	): Promise<void> {
		await this.mcp_connection_manager.refresh_mcp_servers_now(
			config,
			environment,
		);
		for (const status of await this.mcp_connection_manager.list_server_statuses()) {
			await this.send_event(turnContext, {
				type: "mcp_server_status_updated",
				status,
			});
		}
	}

	async refresh_mcp_servers_if_requested(
		turnContext: TurnContext,
		config?: McpServerRefreshConfig | null,
	): Promise<void> {
		if (!config) {
			return;
		}

		await this.refresh_mcp_servers_now(turnContext, config);
	}

	async list_mcp_server_statuses(): Promise<McpServerStatus[]> {
		return this.mcp_connection_manager.list_server_statuses();
	}

	async list_mcp_tools(): Promise<McpToolInfo[]> {
		return this.mcp_connection_manager.list_tools();
	}

	async list_resources(
		params: McpResourceListParams,
	): Promise<McpResourceListResponse> {
		return this.mcp_connection_manager.list_resources(params);
	}

	async list_resource_templates(
		params: McpResourceListParams,
	): Promise<McpResourceTemplateListResponse> {
		return this.mcp_connection_manager.list_resource_templates(params);
	}

	async read_resource(
		_paramsTurnContext: TurnContext | null,
		params: McpResourceReadParams,
	): Promise<McpResourceReadResponse> {
		return this.mcp_connection_manager.read_resource(params);
	}

	async call_tool(
		turnContext: TurnContext,
		params: McpServerToolCallParams,
	): Promise<McpServerToolCallResponse> {
		const startedAt = this.now();
		const callId = params.call_id ?? `${params.server_name}.${params.tool_name}`;
		await this.send_event(turnContext, {
			type: "item_started",
			turn_id: turnContext.sub_id,
			item: {
				type: "McpToolCall",
				id: callId,
				server: params.server_name,
				tool: params.tool_name,
				arguments: params.arguments ?? {},
				status: "inProgress",
			},
		});
		try {
			const response = await this.mcp_connection_manager.call_tool(params);
			await this.send_event(turnContext, {
				type: "item_completed",
				turn_id: turnContext.sub_id,
				item: {
					type: "McpToolCall",
					id: callId,
					server: params.server_name,
					tool: params.tool_name,
					arguments: params.arguments ?? {},
					status: "completed",
					result: response.output,
					duration: `${this.now() - startedAt}ms`,
				},
			});
			return response;
		} catch (error) {
			const message = errorMessage(error);
			await this.send_event(turnContext, {
				type: "item_completed",
				turn_id: turnContext.sub_id,
				item: {
					type: "McpToolCall",
					id: callId,
					server: params.server_name,
					tool: params.tool_name,
					arguments: params.arguments ?? {},
					status: "failed",
					error: { message },
					duration: `${this.now() - startedAt}ms`,
				},
			});
			throw error;
		}
	}

	async resolve_mcp_tool_info(toolName: string): Promise<McpToolInfo | null> {
		const separator = toolName.indexOf(".");
		if (separator <= 0 || separator >= toolName.length - 1) {
			return null;
		}
		return this.mcp_connection_manager.resolve_tool_info(
			toolName.slice(0, separator),
			toolName.slice(separator + 1),
		);
	}

	async request_mcp_server_elicitation(
		turnContext: TurnContext,
		serverName: string,
		id: McpRequestId,
		request: McpServerElicitationRequest,
	): Promise<McpServerElicitationResponse | null> {
		if (!this.activeTurn) {
			return null;
		}

		const response = new Promise<McpServerElicitationResponse | null>(
			(resolve) => {
				this.activeTurn?.turn_state.insertPendingMcpElicitation(
					serverName,
					id,
					{ resolve },
				);
			},
		);

		await this.send_event(turnContext, {
			type: "mcp_server_elicitation_request",
			turn_id: turnContext.sub_id,
			server_name: serverName,
			id,
			request,
		});

		return response;
	}

	async request_dynamic_tool(
		turnContext: TurnContext,
		callId: string,
		toolName: string,
		argumentsValue: unknown,
	): Promise<DynamicToolResponse | null> {
		if (!this.activeTurn) {
			return null;
		}

		const startedAt = this.now();
		const { namespace, tool } = parseDynamicToolName(toolName);
		const response = new Promise<DynamicToolResponse | null>((resolve) => {
			this.activeTurn?.turn_state.insertPendingDynamicTool(callId, {
				resolve,
			});
		});

		await this.send_event(turnContext, {
			type: "dynamic_tool_call_request",
			call_id: callId,
			turn_id: turnContext.sub_id,
			started_at_ms: startedAt,
			namespace,
			tool,
			arguments: argumentsValue,
		});

		const resolved = await response;
		if (!resolved) {
			await this.send_event(turnContext, {
				type: "dynamic_tool_call_response",
				call_id: callId,
				turn_id: turnContext.sub_id,
				completed_at_ms: this.now(),
				namespace,
				tool,
				arguments: argumentsValue,
				content_items: [],
				success: false,
				error: "dynamic tool call was cancelled",
				duration: `${Math.max(0, this.now() - startedAt)}ms`,
			});
			return null;
		}

		await this.send_event(turnContext, {
			type: "dynamic_tool_call_response",
			call_id: callId,
			turn_id: turnContext.sub_id,
			completed_at_ms: this.now(),
			namespace,
			tool,
			arguments: argumentsValue,
			content_items: resolved.content_items,
			success: resolved.success,
			error: null,
			duration: `${Math.max(0, this.now() - startedAt)}ms`,
		});

		return resolved;
	}

	async startTurn(submission: Submission): Promise<TurnContext> {
		await this.configure_session();
		const { items, turnContext } = await this.createTurnContext(submission);
		await this.start_task({
			turnContext,
			kind: TaskKind.Regular,
		});
		if (!this.sessionStartHooksRan) {
			this.sessionStartHooksRan = true;
			await run_session_start_hooks(this, turnContext);
		}

		const promptHookOutcome = await run_user_prompt_submit_hooks(
			this,
			turnContext,
			userInputPromptText(items),
		);
		if (promptHookOutcome.should_stop) {
			await this.send_event(turnContext, {
				type: "error",
				message:
					promptHookOutcome.stop_reason ??
					"User prompt stopped by UserPromptSubmit hook.",
			});
			await this.completeTurn(turnContext, null);
			throw new Error(
				promptHookOutcome.stop_reason ??
					"User prompt stopped by UserPromptSubmit hook.",
			);
		}

		await this.record_context_updates_and_set_reference_context_item(turnContext);
		await this.send_event(turnContext, userMessageEventFromInput(items));
		await this.recordResponseItem(turnContext, userInputAsResponseItem(items));
		this.previous_turn_settings = {
			model: turnContext.model,
			realtime_active: false,
		};

		return turnContext;
	}

	async startCompactTurn(submission: Submission): Promise<TurnContext> {
		if (submission.op.type !== "compact") {
			throw new Error(`Cannot start compact turn for Op: ${submission.op.type}`);
		}
		if (this.activeTurn) {
			throw new Error("Cannot compact thread while a turn is active.");
		}
		await this.configure_session();

		const turnContext = await this.new_default_turn_with_sub_id(
			submission.id,
			submission.trace,
		);
		await this.start_task({
			turnContext,
			kind: TaskKind.Compact,
		});
		const preCompact = await run_pre_compact_hooks(this, turnContext, "manual");
		if (preCompact.should_stop) {
			await this.send_event(turnContext, {
				type: "error",
				message:
					preCompact.stop_reason ?? "Compaction stopped by PreCompact hook.",
			});
			await this.completeTurn(turnContext, null);
			throw new Error(
				preCompact.stop_reason ?? "Compaction stopped by PreCompact hook.",
			);
		}

		return turnContext;
	}

	async start_task(input: {
		turnContext: TurnContext;
		task?: SessionTask;
		kind?: TaskKind;
		abortController?: AbortController;
	}): Promise<RunningTask> {
		const activeTurn = this.activeTurn ?? new ActiveTurn();
		this.activeTurn = activeTurn;
		const kind = input.task?.kind() ?? input.kind ?? TaskKind.Regular;
		const task: RunningTask = {
			sub_id: input.turnContext.sub_id,
			kind,
			turn_context: input.turnContext,
			task: input.task,
			abort_controller: input.abortController,
			records_turn_token_usage_on_span:
				input.task?.records_turn_token_usage_on_span() ?? false,
		};
		activeTurn.addTask(task);
		const startedAt = input.turnContext.turn_timing_state.markTurnStarted(
			this.now(),
		);

		await this.send_event(input.turnContext, {
			type: "turn_started",
			turn_id: input.turnContext.sub_id,
			started_at: startedAt,
			model_context_window: input.turnContext.model_context_window(),
			collaboration_mode_kind: input.turnContext.collaboration_mode?.mode,
		});
		await this.goal_runtime.apply({
			type: "turn_started",
			turn_id: input.turnContext.sub_id,
			total_tokens: this.get_total_token_usage(),
		});

		return task;
	}

	async spawn_task(input: {
		turnContext: TurnContext;
		task: SessionTask;
		input: UserInput[];
		abortController?: AbortController;
	}): Promise<SessionTaskResult> {
		const abortController = input.abortController ?? new AbortController();
		if (this.activeTurn?.hasTask(input.turnContext.sub_id)) {
			this.activeTurn.addTask({
				sub_id: input.turnContext.sub_id,
				kind: input.task.kind(),
				turn_context: input.turnContext,
				task: input.task,
				abort_controller: abortController,
				records_turn_token_usage_on_span:
					input.task.records_turn_token_usage_on_span(),
			});
		} else {
			await this.start_task({
				turnContext: input.turnContext,
				task: input.task,
				abortController,
			});
		}
		try {
			const result = await input.task.run({
				session: new SessionTaskContext(this),
				ctx: input.turnContext,
				input: input.input,
				signal: abortController.signal,
			});
			if (!abortController.signal.aborted) {
				await this.on_task_finished(input.turnContext, result);
			}
			return result;
		} catch (error) {
			if (!abortController.signal.aborted) {
				await this.failTurn(input.turnContext, error);
			}
			throw error;
		}
	}

	async recordCompactedItem(item: CompactedItem): Promise<void> {
		await this.persist_rollout_items([
			{
				type: "compacted",
				payload: item,
			},
		]);
	}

	record_into_history(
		turnContext: TurnContext,
		items: readonly ResponseItem[],
	): void {
		this.state.record_items(items, turnContext.truncation_policy);
	}

	async record_conversation_items(
		turnContext: TurnContext,
		items: readonly ResponseItem[],
	): Promise<void> {
		this.record_into_history(turnContext, items);
		await this.persist_rollout_items(
			items.map((item) => ({
				type: "response_item",
				payload: item,
			})),
		);
		for (const item of items) {
			await this.send_event_raw({
				id: turnContext.sub_id,
				msg: {
					type: "raw_response_item",
					item,
				},
			});
		}
	}

	async completeTurn(
		turnContext: TurnContext,
		lastAgentMessage?: string | null,
	): Promise<void> {
		await this.on_task_finished(turnContext, {
			last_agent_message: lastAgentMessage ?? null,
		});
	}

	async on_task_finished(
		turnContext: TurnContext,
		result: SessionTaskResult,
	): Promise<void> {
		const removed = this.activeTurn?.removeTask(turnContext.sub_id);
		if (removed?.active_turn_is_empty) {
			this.activeTurn?.cancelPending();
		}
		const timing = turnContext.turn_timing_state.completedAtAndDuration(
			this.now(),
		);
		await this.send_thread_goal_update_if_needed(
			turnContext,
			await this.goal_runtime.apply({
				type: "turn_finished",
				turn_id: turnContext.sub_id,
				total_tokens: this.get_total_token_usage(),
			}),
		);
		await this.send_event(turnContext, {
			type: "turn_complete",
			turn_id: turnContext.sub_id,
			last_agent_message: result.last_agent_message,
			completed_at: timing.completed_at,
			duration_ms: timing.duration_ms,
			time_to_first_token_ms: timing.time_to_first_token_ms,
		});
		this.activeTurn =
			this.activeTurn && this.activeTurn.size > 0 ? this.activeTurn : null;
	}

	async failTurn(turnContext: TurnContext, error: unknown): Promise<void> {
		const message = errorMessage(error);
		this.activeTurn?.removeTask(turnContext.sub_id);
		this.activeTurn?.cancelPending();
		await this.send_event(turnContext, {
			type: "error",
			message,
		});
		const timing = turnContext.turn_timing_state.completedAtAndDuration(
			this.now(),
		);
		await this.send_thread_goal_update_if_needed(
			turnContext,
			await this.goal_runtime.apply({
				type: "turn_finished",
				turn_id: turnContext.sub_id,
				total_tokens: this.get_total_token_usage(),
			}),
		);
		await this.send_event(turnContext, {
			type: "turn_complete",
			turn_id: turnContext.sub_id,
			last_agent_message: null,
			completed_at: timing.completed_at,
			duration_ms: timing.duration_ms,
			time_to_first_token_ms: timing.time_to_first_token_ms,
		});
		this.activeTurn =
			this.activeTurn && this.activeTurn.size > 0 ? this.activeTurn : null;
	}

	async abortActiveTurn(reason: "interrupted" = "interrupted"): Promise<void> {
		await this.abort_all_tasks(reason);
	}

	async abort_all_tasks(reason: "interrupted" = "interrupted"): Promise<void> {
		const activeTurn = this.activeTurn;
		if (!activeTurn) {
			return;
		}

		const tasks = activeTurn.drainTasks();
		activeTurn.cancelPending();
		this.activeTurn = null;

		for (const task of tasks) {
			await run_stop_hooks(this, task.turn_context);
			task.abort_controller?.abort();
			await task.task?.abort?.({
				session: new SessionTaskContext(this),
				ctx: task.turn_context,
			});
			await this.persist_rollout_items([
				{
					type: "response_item",
					payload: turnAbortedResponseItem(),
				},
			]);
			const timing = task.turn_context.turn_timing_state.completedAtAndDuration(
				this.now(),
			);
			await this.send_thread_goal_update_if_needed(
				task.turn_context,
				await this.goal_runtime.apply({
					type: "task_aborted",
					turn_id: task.sub_id,
					total_tokens: this.get_total_token_usage(),
				}),
			);
			await this.send_event(task.turn_context, {
				type: "turn_aborted",
				turn_id: task.sub_id,
				reason,
				aborted_at: timing.completed_at,
				completed_at: timing.completed_at,
				duration_ms: timing.duration_ms,
			});
		}
	}

	markFirstToken(turnContext: TurnContext): void {
		turnContext.turn_timing_state.markFirstToken(this.now());
	}

	async update_token_usage_info(
		turnContext: TurnContext,
		tokenUsage?: TokenUsage | null,
	): Promise<void> {
		if (tokenUsage) {
			this.state.update_token_info_from_usage(
				tokenUsage,
				turnContext.model_context_window(),
			);
		}
		await this.send_token_count_event(turnContext);
	}

	async update_rate_limits(
		turnContext: TurnContext,
		newRateLimits: RateLimitSnapshot,
	): Promise<void> {
		this.state.set_rate_limits(newRateLimits);
		await this.send_token_count_event(turnContext);
	}

	token_usage_info(): TokenUsageInfo | null {
		return this.token_info;
	}

	clone_history() {
		return this.state.clone_history();
	}

	replace_history(
		items: ResponseItem[],
		referenceContextItem: TurnContextItem | null = this.reference_context_item,
	): void {
		this.state.replace_history(items, referenceContextItem);
	}

	async replace_compacted_history(
		turnContext: TurnContext,
		items: ResponseItem[],
		referenceContextItem: TurnContextItem | null = null,
	): Promise<void> {
		this.replace_history(items, referenceContextItem);
		await this.recordCompactedItem({
			message: "",
			replacement_history: items,
		});
		await this.persist_rollout_items([
			{
				type: "turn_context",
				payload: turnContext.toTurnContextItem(),
			},
		]);
	}

	get_total_token_usage_breakdown() {
		return this.state.get_total_token_usage_breakdown();
	}

	get_total_token_usage(): number {
		return this.state.get_total_token_usage();
	}

	async get_thread_goal(): Promise<ThreadGoal | null> {
		return this.goal_runtime.get_thread_goal();
	}

	async create_thread_goal(
		turnContext: TurnContext,
		request: CreateGoalRequest,
	): Promise<ThreadGoal> {
		const goal = await this.goal_runtime.create_thread_goal(request);
		await this.send_thread_goal_updated(turnContext, goal);
		return goal;
	}

	async update_thread_goal_complete(turnContext: TurnContext): Promise<ThreadGoal> {
		const goal = await this.goal_runtime.update_thread_goal_complete();
		await this.send_thread_goal_updated(turnContext, goal);
		return goal;
	}

	async note_tool_completed(turnContext: TurnContext, toolName: string): Promise<void> {
		await this.send_thread_goal_update_if_needed(
			turnContext,
			await this.goal_runtime.apply({
				type: toolName === "update_goal" ? "tool_completed_goal" : "tool_completed",
				turn_id: turnContext.sub_id,
				tool_name: toolName,
				total_tokens: this.get_total_token_usage(),
			}),
		);
	}

	async thread_goal_steering_items(): Promise<ResponseItem[]> {
		return this.goal_runtime.budget_limit_steering_items();
	}

	latest_rate_limit_snapshot(): RateLimitSnapshot | null {
		return this.latest_rate_limits;
	}

	private async send_token_count_event(turnContext: TurnContext): Promise<void> {
		await this.send_event(turnContext, {
			type: "token_count",
			info: this.token_info,
			rate_limits: this.latest_rate_limits,
		});
	}

	private async send_thread_goal_update_if_needed(
		turnContext: TurnContext,
		result: { goal_updated?: ThreadGoal | null },
	): Promise<void> {
		if (result.goal_updated) {
			await this.send_thread_goal_updated(turnContext, result.goal_updated);
		}
	}

	private async send_thread_goal_updated(
		turnContext: TurnContext,
		goal: ThreadGoal,
	): Promise<void> {
		await this.send_event(turnContext, {
			type: "thread_goal_updated",
			thread_id: this.threadId,
			turn_id: turnContext.sub_id,
			goal,
		});
	}

	private async userInputOrTurn(submission: Submission): Promise<void> {
		try {
			const turnContext = await this.startTurn(submission);
			await this.completeTurn(turnContext);
		} catch (error) {
			if (error instanceof SessionSettingsUpdateError) {
				await this.send_event_raw({
					id: submission.id,
					msg: {
						type: "error",
						message: error.message,
						codex_error_info: "bad_request",
					},
				});
				return;
			}
			throw error;
		}
	}

	private async createTurnContext(submission: Submission): Promise<{
		items: UserInput[];
		turnContext: TurnContext;
	}> {
		const op = submission.op;
		if (
			op.type !== "user_turn" &&
			op.type !== "user_input" &&
			op.type !== "user_input_with_turn_context"
		) {
			throw new Error(`Cannot create TurnContext for Op: ${op.type}`);
		}

		const { items, updates } = this.sessionSettingsUpdateFromOp(op);
		const turnContext = await this.new_turn_with_sub_id(
			submission.id,
			updates,
			submission.trace,
		);

		return {
			items,
			turnContext,
		};
	}

	async new_turn_with_sub_id(
		submissionId: string,
		updates: SessionSettingsUpdate,
		trace?: Submission["trace"],
	): Promise<TurnContext> {
		this.configuration = applySessionSettingsUpdate(
			this.configuration,
			updates,
		);
		return this.turnContextFromConfiguration(
			submissionId,
			trace,
			updates.final_output_json_schema,
			updates.environments,
		);
	}

	async new_default_turn_with_sub_id(
		submissionId: string,
		trace?: Submission["trace"],
	): Promise<TurnContext> {
		return this.turnContextFromConfiguration(submissionId, trace);
	}

	turn_context_from_config(
		config: ResolvedConfig,
		submissionId: string,
		trace?: Submission["trace"],
	): TurnContext {
		return turn_context_from_config(config, submissionId, trace);
	}

	private turnContextFromConfiguration(
		submissionId: string,
		trace?: Submission["trace"],
		finalOutputJsonSchema = this.configuration.final_output_json_schema,
		environments = this.configuration.environments,
	): TurnContext {
		return new TurnContext({
			sub_id: submissionId,
			trace,
			cwd: this.configuration.cwd,
			approval_policy: this.configuration.approval_policy,
			approvals_reviewer: this.configuration.approvals_reviewer,
			sandbox_policy: sessionConfigurationSandboxPolicy(this.configuration),
			permission_profile: sessionConfigurationPermissionProfile(
				this.configuration,
			),
			active_permission_profile: this.configuration.active_permission_profile,
			windows_sandbox_level: this.configuration.windows_sandbox_level,
			model: this.configuration.model,
			model_info:
				this.configuration.model_info ?? modelInfoFromSlug(this.configuration.model),
			personality: this.configuration.personality,
			collaboration_mode: this.configuration.collaboration_mode,
			effort: this.configuration.reasoning_effort,
			summary: this.configuration.reasoning_summary,
			service_tier: this.configuration.service_tier,
			session_source: this.configuration.session_source,
			environments,
			base_instructions: this.configuration.base_instructions.text,
			user_instructions: this.configuration.user_instructions,
			developer_instructions: this.configuration.developer_instructions,
			final_output_json_schema: finalOutputJsonSchema,
			truncation_policy: this.configuration.truncation_policy,
			dynamic_tools: this.configuration.dynamic_tools,
			tools: toolsConfigForTurn(
				this.configuration.tools,
				sessionConfigurationPermissionProfile(this.configuration),
			),
		});
	}

	private async overrideTurnContext(submission: Submission): Promise<void> {
		if (submission.op.type !== "override_turn_context") {
			return;
		}
		await this.configure_session();

		if (this.activeTurn) {
			await this.send_event_raw({
				id: submission.id,
				msg: {
					type: "error",
					message: "Cannot override turn context while a turn is active.",
					codex_error_info: "bad_request",
				},
			});
			return;
		}

		try {
			this.configuration = applySessionSettingsUpdate(
				this.configuration,
				sessionSettingsUpdateFromOverrideTurnContext(
					submission.op,
					this.configuration,
				),
			);
		} catch (error) {
			await this.send_event_raw({
				id: submission.id,
				msg: {
					type: "error",
					message: errorMessage(error),
					codex_error_info: "bad_request",
				},
			});
		}
	}

	private sessionSettingsUpdateFromOp(
		op: UserTurnOp | UserInputOp | UserInputWithTurnContextOp,
	): {
		items: UserInput[];
		updates: SessionSettingsUpdate;
	} {
		switch (op.type) {
			case "user_turn":
				return {
					items: op.items,
					updates: sessionSettingsUpdateFromUserTurn(op),
				};
			case "user_input_with_turn_context":
				return {
					items: op.items,
					updates: sessionSettingsUpdateFromUserInputWithTurnContext(
						op,
						this.configuration,
					),
				};
			case "user_input":
				return {
					items: op.items,
					updates: sessionSettingsUpdateFromUserInput(op),
				};
		}
	}

	private notifyUserInputResponse(
		id: string,
		response: RequestUserInputResponse,
	): void {
		const pending = this.activeTurn?.turn_state.removePendingUserInput(id);
		if (!pending) {
			return;
		}

		pending.resolve(response);
	}

	notify_request_permissions_response(
		callId: string,
		response: RequestPermissionsResponse,
	): void {
		const pending =
			this.activeTurn?.turn_state.removePendingRequestPermissions(callId);
		if (!pending) {
			return;
		}

		pending.resolve(response);
	}

	async resolve_elicitation(
		serverName: string,
		id: McpRequestId,
		response: McpServerElicitationResponse,
	): Promise<void> {
		const pending =
			this.activeTurn?.turn_state.removePendingMcpElicitation(serverName, id);
		if (pending) {
			pending.resolve(response);
			return;
		}

		await this.mcp_connection_manager.resolve_elicitation(
			serverName,
			id,
			response,
		);
	}

	private record_granted_request_permissions(
		turnContext: TurnContext,
		response: RequestPermissionsResponse,
	): RequestPermissionsResponse {
		const normalized = normalizeRequestPermissionsResponseForCwd(
			response,
			turnContext.cwd,
		);
		if (
			(normalized.scope ?? PermissionGrantScope.Turn) ===
			PermissionGrantScope.Session
		) {
			this.session_permission_grants.record(normalized);
		} else {
			this.activeTurn?.turn_state.recordPermissionGrant(normalized);
		}
		return normalized;
	}

	notify_dynamic_tool_response(
		callId: string,
		response: DynamicToolResponse,
	): void {
		const pending = this.activeTurn?.turn_state.removePendingDynamicTool(callId);
		if (!pending) {
			return;
		}

		pending.resolve(response);
	}

	private async setThreadMemoryMode(mode: ThreadMemoryMode): Promise<void> {
		if (!this.liveThread) {
			return;
		}

		await this.liveThread.persist();
		await this.liveThread.flush();
		await this.liveThread.updateMemoryMode(mode, false);
		await this.liveThread.flush();
	}

	private async shutdown(): Promise<void> {
		this.activeTurn?.cancelPending();
		this.activeTurn = null;
		await this.mcp_connection_manager.shutdown();
		await this.liveThread?.shutdown();
	}

	private async interrupt(): Promise<void> {
		await this.abortActiveTurn("interrupted");
	}

	private async threadRollback(submission: Submission): Promise<void> {
		if (submission.op.type !== "thread_rollback") {
			return;
		}

		if (this.activeTurn) {
			await this.send_event_raw({
				id: submission.id,
				msg: {
					type: "error",
					message: "Cannot roll back thread while a turn is active.",
				},
			});
			return;
		}

		if (submission.op.num_turns <= 0) {
			await this.send_event_raw({
				id: submission.id,
				msg: {
					type: "error",
					message: "Cannot roll back zero thread turns.",
				},
			});
			return;
		}

		this.state.history.drop_last_n_user_turns(submission.op.num_turns);
		await this.send_event_raw({
			id: submission.id,
			msg: {
				type: "thread_rolled_back",
				num_turns: submission.op.num_turns,
			},
		});
	}

	private async compactWithoutModel(submission: Submission): Promise<void> {
		if (this.activeTurn) {
			await this.send_event_raw({
				id: submission.id,
				msg: {
					type: "error",
					message: "Cannot compact thread while a turn is active.",
				},
			});
			return;
		}

		const turnContext = await this.startCompactTurn(submission);
		const item = {
			type: "ContextCompaction" as const,
			id: `${turnContext.sub_id}-context-compaction`,
		};
		await this.send_event(turnContext, { type: "item_started", item });
		const summaryText = `${SUMMARY_PREFIX}\n(no summary available)`;
		const replacement_history = buildCompactedHistory([], [], summaryText);
		this.replace_history(replacement_history, null);
		await this.recordCompactedItem({
			message: summaryText,
			replacement_history,
		});
		await this.send_event(turnContext, { type: "item_completed", item });
		await this.send_event(turnContext, {
			type: "warning",
			message: compactedThreadWarning(),
		});
		await run_post_compact_hooks(this, turnContext, "manual");
		await this.completeTurn(turnContext, null);
	}

	async send_event(turnContext: TurnContext, msg: EventMsg): Promise<void> {
		await this.send_event_raw({
			id: turnContext.sub_id,
			msg,
		});
	}

	async recordResponseItem(
		turnContext: TurnContext,
		item: ResponseItem,
	): Promise<void> {
		await this.record_conversation_items(turnContext, [item]);
	}

	async record_context_updates_and_set_reference_context_item(
		turnContext: TurnContext,
	): Promise<void> {
		const contextItems = this.reference_context_item
			? buildSettingsUpdateItems(
					this.reference_context_item,
					this.previous_turn_settings,
					turnContext,
				)
			: buildInitialContextItems(turnContext);

		for (const item of contextItems) {
			await this.recordResponseItem(turnContext, item);
		}

		const turnContextItem = turnContext.toTurnContextItem();
		await this.persist_rollout_items([
			{
				type: "turn_context",
				payload: turnContextItem,
			},
		]);
		this.reference_context_item = turnContextItem;
	}

	async send_event_raw(event: Event): Promise<void> {
		if (!isLiveOnlyEventMsg(event.msg)) {
			await this.persist_rollout_items([
				{
					type: "event_msg",
					payload: event.msg,
				},
			]);
		}
		this.deliver_event_raw(event);
	}

	private deliver_event_raw(event: Event): void {
		this.emittedEvents.push(event);
		this.eventSink?.(event);
	}

	private async persist_rollout_items(items: RolloutItem[]): Promise<void> {
		await this.liveThread?.appendItems(items);
	}
}

function toolsConfigForTurn(
	tools: ToolsConfig,
	permissionProfile: PermissionProfile,
): ToolsConfig {
	return {
		...tools,
		web_search_mode: resolve_web_search_mode_for_turn({
			permission_profile: permissionProfile,
			web_search_mode: tools.web_search_mode ?? "cached",
		}),
	};
}

function fallbackRandomId(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
		const random = Math.floor(Math.random() * 16);
		const value = char === "x" ? random : (random & 0x3) | 0x8;
		return value.toString(16);
	});
}

function userMessageEventFromInput(items: UserInput[]): EventMsg {
	let message = "";
	const images: string[] = [];
	const localImages: string[] = [];
	const textElements: TextElement[] = [];

	for (const item of items) {
		switch (item.type) {
			case "text":
				if (message.length > 0) {
					message += "\n";
				}
				appendTextElements(textElements, item.text_elements, utf8ByteLength(message));
				message += item.text;
				break;
			case "image":
				images.push(item.image_url);
				break;
			case "local_image":
				localImages.push(item.path);
				break;
			case "skill":
			case "mention":
				break;
		}
	}

	return {
		type: "user_message",
		message,
		images: images.length > 0 ? images : null,
		local_images: localImages,
		text_elements: textElements,
	};
}

function userInputPromptText(items: UserInput[]): string {
	return items
		.filter((item): item is UserInput & { type: "text" } => item.type === "text")
		.map((item) => item.text)
		.join("\n");
}

function userInputAsResponseItem(items: UserInput[]): ResponseItem {
	const content: ContentItem[] = [];

	for (const item of items) {
		switch (item.type) {
			case "text":
				content.push({ type: "input_text", text: item.text });
				break;
			case "image":
				content.push({ type: "input_image", image_url: item.image_url });
				break;
			case "local_image":
			case "skill":
			case "mention":
				break;
		}
	}

	return {
		type: "message",
		role: "user",
		content,
	};
}

function appendTextElements(
	target: TextElement[],
	elements: TextElement[] | undefined,
	byteOffset: number,
) {
	if (!elements?.length) {
		return;
	}

	for (const element of elements) {
		target.push({
			...element,
			byte_range: {
				start: element.byte_range.start + byteOffset,
				end: element.byte_range.end + byteOffset,
			},
		});
	}
}

function utf8ByteLength(text: string): number {
	return new TextEncoder().encode(text).length;
}

function last_token_info_from_rollout(
	rolloutItems: readonly RolloutItem[],
): TokenUsageInfo | null {
	for (let index = rolloutItems.length - 1; index >= 0; index -= 1) {
		const item = rolloutItems[index];
		if (
			item?.type === "event_msg" &&
			item.payload.type === "token_count" &&
			item.payload.info
		) {
			return item.payload.info;
		}
	}
	return null;
}

function initialMessagesFromRollout(
	rolloutItems: readonly RolloutItem[],
): EventMsg[] | null {
	const messages = rolloutItems
		.filter((item) => item.type === "event_msg")
		.map((item) => item.payload)
		.filter((msg) => msg.type !== "session_configured");
	return messages.length > 0 ? messages : null;
}

function parseDynamicToolName(toolName: string): {
	namespace: string | null;
	tool: string;
} {
	const separatorIndex = toolName.indexOf(".");
	if (separatorIndex <= 0 || separatorIndex === toolName.length - 1) {
		return {
			namespace: null,
			tool: toolName,
		};
	}

	return {
		namespace: toolName.slice(0, separatorIndex),
		tool: toolName.slice(separatorIndex + 1),
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isLiveOnlyEventMsg(msg: EventMsg): boolean {
	return (
		msg.type === "item_started" ||
		msg.type === "plan_delta" ||
		msg.type === "agent_message_content_delta" ||
		(msg.type === "item_completed" && msg.item.type !== "Plan")
	);
}
