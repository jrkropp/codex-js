import type { CollaborationMode } from "./config-types";
import type { ThreadId } from "./ids";
import type { TurnItem } from "./items";
import type { FileChange } from "./items";
import type { ExecToolCallOutput } from "./exec-output";
import type {
	MemoryCitation,
	ThreadMemoryMode,
	ThreadMemoryModeSessionMetaValue,
} from "./memory";
import type {
	RequestUserInputEvent,
	RequestUserInputResponse,
} from "./request_user_input";
import type {
	RequestPermissionsEvent,
	RequestPermissionsResponse,
} from "./request_permissions";
import type {
	McpServerElicitationRequestEvent,
	McpServerElicitationResponseOp,
	McpServerOauthLoginCompletedEvent,
	McpServerStatusUpdatedEvent,
	McpToolCallProgressEvent,
} from "./mcp";
import type {
	DynamicToolCallRequest,
	DynamicToolCallResponseEvent,
	DynamicToolResponse,
	DynamicToolSpec,
} from "./protocol/dynamic_tools";
import type { TextElement, UserInput } from "./protocol/user_input";
import type { ResponseItem } from "./models";

export type {
	DynamicToolCallOutputContentItem,
	DynamicToolCallRequest,
	DynamicToolCallResponseEvent,
	DynamicToolResponse,
	DynamicToolSpec,
} from "./protocol/dynamic_tools";
export {
	dynamicToolSpecFromWire,
	dynamicToolSpecToWire,
} from "./protocol/dynamic_tools";
export type {
	ByteRange,
	MentionInput,
	TextElement,
	UserInput,
} from "./protocol/user_input";
export type {
	ContentItem,
	FunctionCallOutputBody,
	FunctionCallOutputContentItem,
	FunctionCallOutputPayload,
	MessagePhase,
	ResponseInputItem,
	ResponseItem,
	ResponseItemWire,
} from "./models";
export {
	functionCallOutputPayloadToWire,
	responseInputToResponseItem,
} from "./models";

export type W3cTraceContext = {
	traceparent?: string;
	tracestate?: string;
};

export type Submission = {
	id: string;
	op: Op;
	trace?: W3cTraceContext;
};

export type BaseInstructions = {
	text: string;
};

export const BASE_INSTRUCTIONS_DEFAULT = `You are Codex, based on GPT-5. You are running as a coding agent in the Codex CLI on a user's computer.

## General

- Prefer to be concise, direct, and useful.
- When asked to modify code, inspect the repository first and follow existing patterns.
- Do not make unrelated changes.
- If you run commands or edit files, summarize what changed and how you verified it.`;

export const BaseInstructions = {
	default(): BaseInstructions {
		return { text: BASE_INSTRUCTIONS_DEFAULT };
	},
};
export type TokenUsage = {
	input_tokens: number;
	cached_input_tokens: number;
	output_tokens: number;
	reasoning_output_tokens: number;
	total_tokens: number;
};

export type TokenUsageInfo = {
	total_token_usage: TokenUsage;
	last_token_usage: TokenUsage;
	model_context_window?: number | null;
};

export type RateLimitWindow = {
	remaining?: number | null;
	limit?: number | null;
	reset_seconds?: number | null;
	[key: string]: unknown;
};

export type RateLimitSnapshot = {
	limit_id?: string | null;
	primary?: RateLimitWindow | null;
	secondary?: RateLimitWindow | null;
	credits?: Record<string, unknown> | null;
	plan_type?: string | null;
	[key: string]: unknown;
};
export type SessionSource = string;
export type ReasoningEffortConfig = string;
export type ReasoningSummaryConfig = string;
export type AskForApproval = string;
export type ApprovalsReviewer = string;
export type SandboxPolicy = Record<string, unknown>;
export type PermissionProfile = Record<string, unknown>;
export type ActivePermissionProfile = Record<string, unknown>;
export type PermissionProfileBuiltinName =
	| ":read-only"
	| ":workspace"
	| ":danger-no-sandbox";
export type WindowsSandboxLevel = string;
export type ServiceTier = string;
export type Personality = string;
export type TurnEnvironmentSelection = {
	environment_id: string;
	cwd: string;
};
export type TurnContextNetworkItem = {
	allowed_domains: string[];
	denied_domains: string[];
};
export type FileSystemSandboxPolicy = Record<string, unknown>;
export type TruncationPolicy = Record<string, unknown>;
export type GitInfo = Record<string, unknown>;
export type McpInvocation = Record<string, unknown>;

export type UserTurnOp = {
	type: "user_turn";
	items: UserInput[];
	cwd: string;
	approval_policy: AskForApproval;
	approvals_reviewer?: ApprovalsReviewer | null;
	sandbox_policy: SandboxPolicy;
	permission_profile?: PermissionProfile | null;
	model: string;
	effort?: ReasoningEffortConfig;
	summary?: ReasoningSummaryConfig;
	service_tier?: ServiceTier | null;
	final_output_json_schema?: unknown;
	collaboration_mode?: CollaborationMode;
	personality?: Personality;
	environments?: TurnEnvironmentSelection[];
};

export type UserInputOp = {
	type: "user_input";
	items: UserInput[];
	environments?: TurnEnvironmentSelection[];
	final_output_json_schema?: unknown;
	responsesapi_client_metadata?: Record<string, string>;
};

export type UserInputWithTurnContextOp = {
	type: "user_input_with_turn_context";
	items: UserInput[];
	final_output_json_schema?: unknown;
	responsesapi_client_metadata?: Record<string, string>;
	cwd?: string;
	approval_policy?: AskForApproval;
	approvals_reviewer?: ApprovalsReviewer;
	sandbox_policy?: SandboxPolicy;
	permission_profile?: PermissionProfile;
	active_permission_profile?: ActivePermissionProfile;
	windows_sandbox_level?: WindowsSandboxLevel;
	model?: string;
	effort?: ReasoningEffortConfig | null;
	summary?: ReasoningSummaryConfig;
	service_tier?: ServiceTier | null;
	collaboration_mode?: CollaborationMode;
	personality?: Personality;
	environments?: TurnEnvironmentSelection[];
};

export type OverrideTurnContextOp = {
	type: "override_turn_context";
	cwd?: string;
	approval_policy?: AskForApproval;
	approvals_reviewer?: ApprovalsReviewer | null;
	sandbox_policy?: SandboxPolicy;
	permission_profile?: PermissionProfile | null;
	active_permission_profile?: ActivePermissionProfile | null;
	windows_sandbox_level?: WindowsSandboxLevel;
	model?: string;
	effort?: ReasoningEffortConfig | null;
	summary?: ReasoningSummaryConfig;
	service_tier?: ServiceTier | null;
	collaboration_mode?: CollaborationMode;
	personality?: Personality | null;
	environments?: TurnEnvironmentSelection[];
};

export type UserInputAnswerOp = {
	type: "user_input_answer";
	id: string;
	response: RequestUserInputResponse;
};

export type RequestPermissionsResponseOp = {
	type: "request_permissions_response";
	id: string;
	response: RequestPermissionsResponse;
};

export type DynamicToolResponseOp = {
	type: "dynamic_tool_response";
	id: string;
	response: DynamicToolResponse;
};

export type RealtimeOutputModality = "text" | "audio";

export type RealtimeVoice =
	| "alloy"
	| "arbor"
	| "ash"
	| "ballad"
	| "breeze"
	| "cedar"
	| "coral"
	| "cove"
	| "echo"
	| "ember"
	| "juniper"
	| "maple"
	| "marin"
	| "sage"
	| "shimmer"
	| "sol"
	| "spruce"
	| "vale"
	| "verse";

export type RealtimeVoicesList = {
	v1: RealtimeVoice[];
	v2: RealtimeVoice[];
	default_v1: RealtimeVoice;
	default_v2: RealtimeVoice;
};

export const RealtimeVoicesList = {
	builtin(): RealtimeVoicesList {
		return {
			v1: [
				"juniper",
				"maple",
				"spruce",
				"ember",
				"vale",
				"breeze",
				"arbor",
				"sol",
				"cove",
			],
			v2: [
				"alloy",
				"ash",
				"ballad",
				"coral",
				"echo",
				"sage",
				"shimmer",
				"verse",
				"marin",
				"cedar",
			],
			default_v1: "cove",
			default_v2: "marin",
		};
	},
};

export type ConversationStartTransport =
	| {
			type: "websocket";
	  }
	| {
			type: "webrtc";
			sdp: string;
	  };

export type ConversationStartParams = {
	output_modality: RealtimeOutputModality;
	prompt?: string | null;
	realtime_session_id?: string | null;
	transport?: ConversationStartTransport | null;
	voice?: RealtimeVoice | null;
};

export type RealtimeAudioFrame = {
	data: string;
	sample_rate: number;
	num_channels: number;
	samples_per_channel?: number | null;
	item_id?: string | null;
};

export type RealtimeTranscriptDelta = {
	delta: string;
};

export type RealtimeTranscriptDone = {
	text: string;
};

export type RealtimeTranscriptEntry = {
	role: string;
	text: string;
};

export type RealtimeHandoffRequested = {
	handoff_id: string;
	item_id: string;
	input_transcript: string;
	active_transcript: RealtimeTranscriptEntry[];
};

export type RealtimeNoopRequested = {
	call_id: string;
	item_id: string;
};

export type RealtimeInputAudioSpeechStarted = {
	item_id?: string | null;
};

export type RealtimeResponseLifecycle = {
	response_id?: string | null;
};

export type RealtimeEvent =
	| {
			type: "session_updated";
			realtime_session_id: string;
			instructions?: string | null;
	  }
	| ({
			type: "input_audio_speech_started";
	  } & RealtimeInputAudioSpeechStarted)
	| ({
			type: "input_transcript_delta";
	  } & RealtimeTranscriptDelta)
	| ({
			type: "input_transcript_done";
	  } & RealtimeTranscriptDone)
	| ({
			type: "output_transcript_delta";
	  } & RealtimeTranscriptDelta)
	| ({
			type: "output_transcript_done";
	  } & RealtimeTranscriptDone)
	| ({
			type: "audio_out";
	  } & RealtimeAudioFrame)
	| ({
			type: "response_created";
	  } & RealtimeResponseLifecycle)
	| ({
			type: "response_cancelled";
	  } & RealtimeResponseLifecycle)
	| ({
			type: "response_done";
	  } & RealtimeResponseLifecycle)
	| {
			type: "conversation_item_added";
			item: unknown;
	  }
	| {
			type: "conversation_item_done";
			item_id: string;
	  }
	| ({
			type: "handoff_requested";
	  } & RealtimeHandoffRequested)
	| ({
			type: "noop_requested";
	  } & RealtimeNoopRequested)
	| {
			type: "error";
			message: string;
	  };

export type ConversationAudioParams = {
	frame: RealtimeAudioFrame;
};

export type ConversationTextParams = {
	text: string;
};

export type ThreadRealtimeStartParams = ConversationStartParams & {
	thread_id: ThreadId;
};

export type ThreadRealtimeStartResponse = Record<never, never>;

export type ThreadRealtimeAppendAudioParams = ConversationAudioParams & {
	thread_id: ThreadId;
};

export type ThreadRealtimeAppendAudioResponse = Record<never, never>;

export type ThreadRealtimeAppendTextParams = ConversationTextParams & {
	thread_id: ThreadId;
};

export type ThreadRealtimeAppendTextResponse = Record<never, never>;

export type ThreadRealtimeStopParams = {
	thread_id: ThreadId;
};

export type ThreadRealtimeStopResponse = Record<never, never>;

export type ThreadRealtimeListVoicesParams = Record<never, never>;

export type ThreadRealtimeListVoicesResponse = {
	voices: RealtimeVoicesList;
};

export type RealtimeConversationStartOp = {
	type: "realtime_conversation_start";
} & ConversationStartParams;

export type RealtimeConversationAudioOp = {
	type: "realtime_conversation_audio";
} & ConversationAudioParams;

export type RealtimeConversationTextOp = {
	type: "realtime_conversation_text";
} & ConversationTextParams;

export type RealtimeConversationCloseOp = {
	type: "realtime_conversation_close";
};

export type RealtimeConversationListVoicesOp = {
	type: "realtime_conversation_list_voices";
};

export type AgentPathWire = string;

export const AgentStatusWire = {
	Running: "running",
	Completed: "completed",
	Failed: "failed",
	Closed: "closed",
	Cancelled: "cancelled",
} as const;

export type AgentStatusWire =
	(typeof AgentStatusWire)[keyof typeof AgentStatusWire];

export type SubAgentSource =
	| {
			type: "thread_spawn";
			parent_thread_id: ThreadId;
			depth: number;
			agent_path?: AgentPathWire | null;
			agent_role?: string | null;
	  }
	| {
			type: "other";
			value: string;
	  };

export type InterAgentCommunicationWire = {
	author: AgentPathWire;
	recipient: AgentPathWire;
	items?: unknown[];
	content: string;
	trigger_turn: boolean;
	seq?: number;
};

export type CollabAgentRef = {
	thread_id?: ThreadId | null;
	agent_path?: AgentPathWire | null;
	agent_nickname?: string | null;
	agent_role?: string | null;
};

export type CollabAgentSpawnBeginEvent = {
	turn_id: string;
	call_id: string;
	task?: string | null;
};

export type CollabAgentSpawnEndEvent = {
	turn_id: string;
	call_id: string;
	agent?: CollabAgentRef | null;
	error?: string | null;
};

export type CollabAgentInteractionBeginEvent = {
	turn_id: string;
	call_id: string;
	target: CollabAgentRef;
};

export type CollabAgentInteractionEndEvent = {
	turn_id: string;
	call_id: string;
	target: CollabAgentRef;
	error?: string | null;
};

export type CollabWaitingBeginEvent = {
	turn_id: string;
	call_id: string;
	targets: CollabAgentRef[];
};

export type CollabWaitingEndEvent = {
	turn_id: string;
	call_id: string;
	statuses?: Record<string, AgentStatusWire>;
	error?: string | null;
};

export type CollabResumeBeginEvent = {
	turn_id: string;
	call_id: string;
	target: CollabAgentRef;
};

export type CollabResumeEndEvent = CollabAgentInteractionEndEvent;

export type CollabCloseBeginEvent = CollabAgentInteractionBeginEvent;

export type CollabCloseEndEvent = CollabAgentInteractionEndEvent;

export type CompactOp = {
	type: "compact";
};

export type SetThreadNameOp = {
	type: "set_thread_name";
	name: string;
};

export type SetThreadMemoryModeOp = {
	type: "set_thread_memory_mode";
	mode: ThreadMemoryMode;
};

export type ThreadRollbackOp = {
	type: "thread_rollback";
	num_turns: number;
};

export type InterruptOp = {
	type: "interrupt";
};

export type ShutdownOp = {
	type: "shutdown";
};

export type Op =
	| UserTurnOp
	| UserInputOp
	| UserInputWithTurnContextOp
	| OverrideTurnContextOp
	| UserInputAnswerOp
	| RequestPermissionsResponseOp
	| DynamicToolResponseOp
	| McpServerElicitationResponseOp
	| RealtimeConversationStartOp
	| RealtimeConversationAudioOp
	| RealtimeConversationTextOp
	| RealtimeConversationCloseOp
	| RealtimeConversationListVoicesOp
	| CompactOp
	| SetThreadNameOp
	| SetThreadMemoryModeOp
	| ThreadRollbackOp
	| InterruptOp
	| ShutdownOp;

export type ErrorEvent = {
	message: string;
	codex_error_info?: unknown;
};

export type WarningEvent = {
	message: string;
};

export type TurnStartedEvent = {
	turn_id: string;
	started_at?: number | null;
	model_context_window?: number | null;
	collaboration_mode_kind?: CollaborationMode["mode"];
};

export type TurnCompleteEvent = {
	turn_id: string;
	last_agent_message?: string | null;
	completed_at?: number | null;
	duration_ms?: number | null;
	time_to_first_token_ms?: number | null;
};

export type TurnAbortReason = "interrupted";

export type TurnAbortedEvent = {
	turn_id: string;
	reason: TurnAbortReason;
	aborted_at?: number | null;
	completed_at?: number | null;
	duration_ms?: number | null;
};

export type AgentMessageEvent = {
	message: string;
	phase?: string | null;
	memory_citation?: MemoryCitation | null;
};

export type UserMessageEvent = {
	message: string;
	images?: string[] | null;
	local_images?: string[];
	text_elements?: TextElement[];
};

export type RawResponseItemEvent = {
	item: ResponseItem;
};

export type ItemStartedEvent = {
	turn_id?: string;
	item: TurnItem;
};

export type ItemCompletedEvent = {
	turn_id?: string;
	item: TurnItem;
};

export type ExecCommandStatus = "completed" | "failed" | "cancelled";

export type ExecCommandBeginEvent = {
	call_id: string;
	process_id?: string | null;
	turn_id: string;
	started_at_ms: number;
	command: string[];
	cwd: string;
	parsed_cmd?: unknown[] | null;
	source?: string | null;
	interaction_input?: string | null;
};

export type ExecCommandOutputDeltaEvent = {
	call_id: string;
	turn_id?: string;
	stream: "stdout" | "stderr";
	chunk: string;
};

export type TerminalInteractionEvent = {
	call_id: string;
	process_id?: string | null;
	stdin: string;
};

export type ExecCommandEndEvent = {
	call_id: string;
	turn_id?: string;
	process_id?: string | null;
	completed_at_ms: number;
	exit_code: number;
	status: ExecCommandStatus;
	duration_ms?: number | null;
	stdout?: string | null;
	stderr?: string | null;
	output?: ExecToolCallOutput | null;
};

export type PatchApplyUpdatedEvent = {
	call_id: string;
	turn_id?: string;
	changes: Record<string, FileChange>;
	status?: "completed" | "failed" | "declined" | null;
	stdout?: string | null;
	stderr?: string | null;
};

export type CommandApprovalRequestEvent = {
	call_id: string;
	command: string[];
	cwd: string;
	reason?: string | null;
};

export type FileChangeApprovalRequestEvent = {
	call_id: string;
	changes: Record<string, FileChange>;
	reason?: string | null;
};

export type AgentMessageContentDeltaEvent = {
	thread_id: string;
	turn_id: string;
	item_id: string;
	delta: string;
};

export type PlanDeltaEvent = {
	thread_id: string;
	turn_id: string;
	item_id: string;
	delta: string;
};

export type UpdatePlanStepStatus = "pending" | "in_progress" | "completed";

export type UpdatePlanStep = {
	step: string;
	status: UpdatePlanStepStatus;
};

export type UpdatePlanArgs = {
	explanation?: string | null;
	plan: UpdatePlanStep[];
};

export type ImageGenerationBeginEvent = {
	call_id: string;
};

export type ImageGenerationEndEvent = {
	call_id: string;
	status: string;
	revised_prompt?: string;
	result: string;
	saved_path?: string;
};

export type ContextCompactedEvent = Record<never, never>;

export type ThreadRolledBackEvent = {
	num_turns: number;
};

export type TokenCountEvent = {
	info?: TokenUsageInfo | null;
	rate_limits?: RateLimitSnapshot | null;
};

export const ThreadGoalStatus = {
	Active: "active",
	Paused: "paused",
	BudgetLimited: "budgetLimited",
	Complete: "complete",
} as const;

export type ThreadGoalStatus =
	(typeof ThreadGoalStatus)[keyof typeof ThreadGoalStatus];

export const MAX_THREAD_GOAL_OBJECTIVE_CHARS = 4_000;

export function validateThreadGoalObjective(value: string): void {
	if (value.length === 0) {
		throw new Error("goal objective must not be empty");
	}
	if ([...value].length > MAX_THREAD_GOAL_OBJECTIVE_CHARS) {
		throw new Error(
			`goal objective must be at most ${MAX_THREAD_GOAL_OBJECTIVE_CHARS} characters`,
		);
	}
}

export type ThreadGoal = {
	thread_id: ThreadId;
	objective: string;
	status: ThreadGoalStatus;
	token_budget?: number | null;
	tokens_used: number;
	time_used_seconds: number;
	created_at: number;
	updated_at: number;
};

export type ThreadGoalUpdatedEvent = {
	thread_id: ThreadId;
	turn_id?: string | null;
	goal: ThreadGoal;
};

export type McpToolCallBeginEvent = {
	call_id: string;
	invocation: McpInvocation;
	mcp_app_resource_uri?: string;
};

export type McpToolCallEndEvent = {
	call_id: string;
	invocation: McpInvocation;
	mcp_app_resource_uri?: string;
	duration: string;
	result: unknown;
};

export type McpToolCallProgressEventMsg = {
	type: "mcp_tool_call_progress";
} & McpToolCallProgressEvent;

export type McpServerStatusUpdatedEventMsg = {
	type: "mcp_server_status_updated";
} & McpServerStatusUpdatedEvent;

export type McpServerOauthLoginCompletedEventMsg = {
	type: "mcp_server_oauth_login_completed";
} & McpServerOauthLoginCompletedEvent;

export type McpServerElicitationRequestEventMsg = {
	type: "mcp_server_elicitation_request";
} & McpServerElicitationRequestEvent;

export const HookEventName = {
	PreToolUse: "pre_tool_use",
	PermissionRequest: "permission_request",
	PostToolUse: "post_tool_use",
	PreCompact: "pre_compact",
	PostCompact: "post_compact",
	SessionStart: "session_start",
	UserPromptSubmit: "user_prompt_submit",
	Stop: "stop",
} as const;

export type HookEventName = (typeof HookEventName)[keyof typeof HookEventName];

export const HookHandlerType = {
	Command: "command",
	Prompt: "prompt",
	Agent: "agent",
} as const;

export type HookHandlerType =
	(typeof HookHandlerType)[keyof typeof HookHandlerType];

export const HookExecutionMode = {
	Sync: "sync",
	Async: "async",
} as const;

export type HookExecutionMode =
	(typeof HookExecutionMode)[keyof typeof HookExecutionMode];

export const HookScope = {
	Thread: "thread",
	Turn: "turn",
} as const;

export type HookScope = (typeof HookScope)[keyof typeof HookScope];

export const HookSource = {
	System: "system",
	User: "user",
	Project: "project",
	Mdm: "mdm",
	SessionFlags: "session_flags",
	Plugin: "plugin",
	CloudRequirements: "cloud_requirements",
	LegacyManagedConfigFile: "legacy_managed_config_file",
	LegacyManagedConfigMdm: "legacy_managed_config_mdm",
	Unknown: "unknown",
} as const;

export type HookSource = (typeof HookSource)[keyof typeof HookSource];

export const HookTrustStatus = {
	Managed: "managed",
	Untrusted: "untrusted",
	Trusted: "trusted",
	Modified: "modified",
} as const;

export type HookTrustStatus =
	(typeof HookTrustStatus)[keyof typeof HookTrustStatus];

export const HookRunStatus = {
	Running: "running",
	Completed: "completed",
	Failed: "failed",
	Blocked: "blocked",
	Stopped: "stopped",
} as const;

export type HookRunStatus = (typeof HookRunStatus)[keyof typeof HookRunStatus];

export const HookOutputEntryKind = {
	Warning: "warning",
	Stop: "stop",
	Feedback: "feedback",
	Context: "context",
	Error: "error",
} as const;

export type HookOutputEntryKind =
	(typeof HookOutputEntryKind)[keyof typeof HookOutputEntryKind];

export type HookOutputEntry = {
	kind: HookOutputEntryKind;
	text: string;
};

export type HookRunSummary = {
	id: string;
	event_name: HookEventName;
	handler_type: HookHandlerType;
	execution_mode: HookExecutionMode;
	scope: HookScope;
	source_path: string;
	source: HookSource;
	display_order: number;
	status: HookRunStatus;
	status_message?: string | null;
	started_at: number;
	completed_at?: number | null;
	duration_ms?: number | null;
	entries: HookOutputEntry[];
};

export type HookStartedEvent = {
	turn_id?: string | null;
	run: HookRunSummary;
};

export type HookCompletedEvent = {
	turn_id?: string | null;
	run: HookRunSummary;
};

export type RealtimeConversationVersion = "v1" | "v2";

export type RealtimeConversationStartedEvent = {
	realtime_session_id?: string | null;
	version: RealtimeConversationVersion;
};

export type RealtimeConversationRealtimeEvent = {
	payload: RealtimeEvent;
};

export type RealtimeConversationClosedEvent = {
	reason?: string | null;
};

export type RealtimeConversationSdpEvent = {
	sdp: string;
};

export type RealtimeConversationListVoicesResponseEvent = {
	voices: RealtimeVoicesList;
};

/** Codex Rust variant: `TurnStarted`; v1 wire value: `turn_started`. */
export type TurnStartedEventMsg = {
	type: "turn_started";
} & TurnStartedEvent;

/** Codex Rust variant: `TurnComplete`; v1 wire value: `turn_complete`. */
export type TurnCompleteEventMsg = {
	type: "turn_complete";
} & TurnCompleteEvent;

/** Codex Rust variant: `TurnAborted`; v1 wire value: `turn_aborted`. */
export type TurnAbortedEventMsg = {
	type: "turn_aborted";
} & TurnAbortedEvent;

export type AgentMessageEventMsg = {
	type: "agent_message";
} & AgentMessageEvent;

export type UserMessageEventMsg = {
	type: "user_message";
} & UserMessageEvent;

export type RawResponseItemEventMsg = {
	type: "raw_response_item";
} & RawResponseItemEvent;

export type ItemStartedEventMsg = {
	type: "item_started";
} & ItemStartedEvent;

export type ItemCompletedEventMsg = {
	type: "item_completed";
} & ItemCompletedEvent;

export type ExecCommandBeginEventMsg = {
	type: "exec_command_begin";
} & ExecCommandBeginEvent;

export type ExecCommandOutputDeltaEventMsg = {
	type: "exec_command_output_delta";
} & ExecCommandOutputDeltaEvent;

export type TerminalInteractionEventMsg = {
	type: "terminal_interaction";
} & TerminalInteractionEvent;

export type ExecCommandEndEventMsg = {
	type: "exec_command_end";
} & ExecCommandEndEvent;

export type PatchApplyUpdatedEventMsg = {
	type: "patch_apply_updated";
} & PatchApplyUpdatedEvent;

export type CommandApprovalRequestEventMsg = {
	type: "command_approval_request";
} & CommandApprovalRequestEvent;

export type FileChangeApprovalRequestEventMsg = {
	type: "file_change_approval_request";
} & FileChangeApprovalRequestEvent;

export type AgentMessageContentDeltaEventMsg = {
	type: "agent_message_content_delta";
} & AgentMessageContentDeltaEvent;

/** Codex Rust variant: `PlanDelta`; v1 wire value: `plan_delta`. */
export type PlanDeltaEventMsg = {
	type: "plan_delta";
} & PlanDeltaEvent;

export type PlanUpdateEventMsg = {
	type: "plan_update";
} & UpdatePlanArgs;

export type RequestUserInputEventMsg = {
	type: "request_user_input";
} & RequestUserInputEvent;

export type RequestPermissionsEventMsg = {
	type: "request_permissions";
} & RequestPermissionsEvent;

export type DynamicToolCallRequestEventMsg = {
	type: "dynamic_tool_call_request";
} & DynamicToolCallRequest;

export type DynamicToolCallResponseEventMsg = {
	type: "dynamic_tool_call_response";
} & DynamicToolCallResponseEvent;

export type ImageGenerationBeginEventMsg = {
	type: "image_generation_begin";
} & ImageGenerationBeginEvent;

export type ImageGenerationEndEventMsg = {
	type: "image_generation_end";
} & ImageGenerationEndEvent;

export type ContextCompactedEventMsg = {
	type: "context_compacted";
} & ContextCompactedEvent;

export type ThreadRolledBackEventMsg = {
	type: "thread_rolled_back";
} & ThreadRolledBackEvent;

export type TokenCountEventMsg = {
	type: "token_count";
} & TokenCountEvent;

export type ThreadGoalUpdatedEventMsg = {
	type: "thread_goal_updated";
} & ThreadGoalUpdatedEvent;

export type WarningEventMsg = {
	type: "warning";
} & WarningEvent;

export type ErrorEventMsg = {
	type: "error";
} & ErrorEvent;

export type HookStartedEventMsg = {
	type: "hook_started";
} & HookStartedEvent;

export type HookCompletedEventMsg = {
	type: "hook_completed";
} & HookCompletedEvent;

export type RealtimeConversationStartedEventMsg = {
	type: "realtime_conversation_started";
} & RealtimeConversationStartedEvent;

export type RealtimeConversationRealtimeEventMsg = {
	type: "realtime_conversation_realtime";
} & RealtimeConversationRealtimeEvent;

export type RealtimeConversationClosedEventMsg = {
	type: "realtime_conversation_closed";
} & RealtimeConversationClosedEvent;

export type RealtimeConversationSdpEventMsg = {
	type: "realtime_conversation_sdp";
} & RealtimeConversationSdpEvent;

export type RealtimeConversationListVoicesResponseEventMsg = {
	type: "realtime_conversation_list_voices_response";
} & RealtimeConversationListVoicesResponseEvent;

export type SessionConfiguredEvent = {
	session_id: string;
	thread_id: ThreadId;
	forked_from_id?: ThreadId | null;
	thread_source?: string | null;
	thread_name?: string | null;
	model: string;
	model_provider_id: string;
	service_tier?: ServiceTier | null;
	approval_policy: AskForApproval;
	approvals_reviewer?: ApprovalsReviewer | null;
	permission_profile: PermissionProfile;
	active_permission_profile?: ActivePermissionProfile | null;
	cwd: string;
	reasoning_effort?: ReasoningEffortConfig | null;
	initial_messages?: EventMsg[] | null;
	network_proxy?: unknown | null;
	rollout_path?: string | null;
};

export type SessionConfiguredEventMsg = {
	type: "session_configured";
} & SessionConfiguredEvent;

export type EventMsg =
	| SessionConfiguredEventMsg
	| TurnStartedEventMsg
	| TurnCompleteEventMsg
	| TurnAbortedEventMsg
	| AgentMessageEventMsg
	| UserMessageEventMsg
	| RawResponseItemEventMsg
	| ItemStartedEventMsg
	| ItemCompletedEventMsg
	| ExecCommandBeginEventMsg
	| ExecCommandOutputDeltaEventMsg
	| TerminalInteractionEventMsg
	| ExecCommandEndEventMsg
	| PatchApplyUpdatedEventMsg
	| CommandApprovalRequestEventMsg
	| FileChangeApprovalRequestEventMsg
	| AgentMessageContentDeltaEventMsg
	| PlanDeltaEventMsg
	| PlanUpdateEventMsg
	| RequestUserInputEventMsg
	| RequestPermissionsEventMsg
	| DynamicToolCallRequestEventMsg
	| DynamicToolCallResponseEventMsg
	| McpToolCallProgressEventMsg
	| McpServerStatusUpdatedEventMsg
	| McpServerOauthLoginCompletedEventMsg
	| McpServerElicitationRequestEventMsg
	| ImageGenerationBeginEventMsg
	| ImageGenerationEndEventMsg
	| ContextCompactedEventMsg
	| ThreadRolledBackEventMsg
	| TokenCountEventMsg
	| ThreadGoalUpdatedEventMsg
	| WarningEventMsg
	| HookStartedEventMsg
	| HookCompletedEventMsg
	| RealtimeConversationStartedEventMsg
	| RealtimeConversationRealtimeEventMsg
	| RealtimeConversationClosedEventMsg
	| RealtimeConversationSdpEventMsg
	| RealtimeConversationListVoicesResponseEventMsg
	| ErrorEventMsg;

export type SessionMeta = {
	id: ThreadId;
	forked_from_id?: ThreadId | null;
	timestamp: string;
	cwd: string;
	originator: string;
	cli_version: string;
	source: SessionSource;
	agent_nickname?: string | null;
	agent_role?: string | null;
	agent_path?: string | null;
	model_provider: string | null;
	base_instructions: BaseInstructions | null;
	dynamic_tools?: DynamicToolSpec[] | null;
	memory_mode?: ThreadMemoryModeSessionMetaValue | null;
};

export type SessionMetaLine = SessionMeta & {
	git?: GitInfo | null;
};

export type CompactedItem = {
	message: string;
	replacement_history?: ResponseItem[];
};

export type TurnContextItem = {
	turn_id?: string;
	trace_id?: string;
	cwd: string;
	current_date?: string;
	timezone?: string;
	approval_policy: AskForApproval;
	sandbox_policy: SandboxPolicy;
	permission_profile?: PermissionProfile | null;
	windows_sandbox_level?: WindowsSandboxLevel | null;
	network?: TurnContextNetworkItem | null;
	file_system_sandbox_policy?: FileSystemSandboxPolicy | null;
	model: string;
	personality?: Personality | null;
	collaboration_mode?: CollaborationMode | null;
	realtime_active?: boolean | null;
	effort?: ReasoningEffortConfig | null;
	summary: ReasoningSummaryConfig;
	user_instructions?: string | null;
	developer_instructions?: string | null;
	final_output_json_schema?: unknown;
	truncation_policy?: TruncationPolicy | null;
};

export type SessionMetaRolloutItem = {
	type: "session_meta";
	payload: SessionMetaLine;
};

export type ResponseRolloutItem = {
	type: "response_item";
	payload: ResponseItem;
};

export type CompactedRolloutItem = {
	type: "compacted";
	payload: CompactedItem;
};

export type TurnContextRolloutItem = {
	type: "turn_context";
	payload: TurnContextItem;
};

export type EventMsgRolloutItem = {
	type: "event_msg";
	payload: EventMsg;
};

export type RolloutItem =
	| SessionMetaRolloutItem
	| ResponseRolloutItem
	| CompactedRolloutItem
	| TurnContextRolloutItem
	| EventMsgRolloutItem;
