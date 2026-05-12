import type { MemoryCitation } from "./memory";
import type { UserInput } from "./protocol";

export type AgentMessageContent = {
	type: "Text";
	text: string;
};

export type UserMessageTurnItem = {
	type: "UserMessage";
	id: string;
	content: UserInput[];
};

export type HookPromptFragment = {
	text: string;
	hookRunId: string;
};

export type HookPromptTurnItem = {
	type: "HookPrompt";
	id: string;
	fragments: HookPromptFragment[];
};

export type AgentMessageTurnItem = {
	type: "AgentMessage";
	id: string;
	content: AgentMessageContent[];
	phase?: string | null;
	memory_citation?: MemoryCitation | null;
};

export type PlanTurnItem = {
	type: "Plan";
	id: string;
	text: string;
};

export type ReasoningTurnItem = {
	type: "Reasoning";
	id: string;
	summary_text: string[];
	raw_content: string[];
};

export type WebSearchAction =
	| { type: "search"; query?: string; queries?: string[] }
	| { type: "open_page"; url?: string }
	| { type: "find_in_page"; url?: string; pattern?: string }
	| { type: "other" };

export type WebSearchTurnItem = {
	type: "WebSearch";
	id: string;
	query: string;
	action: WebSearchAction;
};

export type ImageViewTurnItem = {
	type: "ImageView";
	id: string;
	path: string;
};

export type ImageGenerationTurnItem = {
	type: "ImageGeneration";
	id: string;
	status: string;
	revised_prompt?: string;
	result: string;
	saved_path?: string;
};

export type FileChange =
	| { type: "add"; content: string }
	| { type: "delete"; content: string }
	| { type: "update"; unified_diff: string; move_path: string | null };

export type PatchApplyStatus = "completed" | "failed" | "declined";

export type FileChangeTurnItem = {
	type: "FileChange";
	id: string;
	changes: Record<string, FileChange>;
	status?: PatchApplyStatus | null;
	auto_approved?: boolean;
	stdout?: string;
	stderr?: string;
};

export type CommandExecutionStatus =
	| "in_progress"
	| "completed"
	| "failed"
	| "cancelled";

export type CommandExecutionTurnItem = {
	type: "CommandExecution";
	id: string;
	command: string[];
	cwd: string;
	status: CommandExecutionStatus;
	stdout?: string;
	stderr?: string;
	exit_code?: number | null;
	duration_ms?: number | null;
};

export type McpToolCallStatus = "inProgress" | "completed" | "failed";

export type McpToolCallError = {
	message: string;
};

export type McpToolCallTurnItem = {
	type: "McpToolCall";
	id: string;
	server: string;
	tool: string;
	arguments: unknown;
	mcpAppResourceUri?: string;
	status: McpToolCallStatus;
	result?: unknown;
	error?: McpToolCallError;
	duration?: string;
};

export type DynamicToolCallStatus = "inProgress" | "completed" | "failed";

export type DynamicToolCallTurnItem = {
	type: "DynamicToolCall";
	id: string;
	namespace?: string | null;
	tool: string;
	arguments: unknown;
	status: DynamicToolCallStatus;
	content_items?: unknown[] | null;
	success?: boolean | null;
	duration?: string | null;
};

export type ContextCompactionTurnItem = {
	type: "ContextCompaction";
	id: string;
};

export type TurnItem =
	| UserMessageTurnItem
	| HookPromptTurnItem
	| AgentMessageTurnItem
	| PlanTurnItem
	| ReasoningTurnItem
	| WebSearchTurnItem
	| ImageViewTurnItem
	| ImageGenerationTurnItem
	| CommandExecutionTurnItem
	| FileChangeTurnItem
	| McpToolCallTurnItem
	| DynamicToolCallTurnItem
	| ContextCompactionTurnItem;
