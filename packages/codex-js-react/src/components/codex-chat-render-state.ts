import type { ReactNode } from "react";

import type {
	CoreTurnItem as T3TurnItem,
	CoreUserInput,
	CoreUserMessageTurnItem as UserMessageTurnItem,
	DynamicToolCallRequest,
	JSONRPCErrorError,
	RequestId,
	RequestPermissionsEvent,
	Result,
	ServerRequest,
	ThreadHistoryTurn as T3Turn,
	ThreadHistoryTurnStatus as T3TurnStatus,
	ThreadEventSnapshot,
	ThreadItem,
	Turn,
	UserInput as AppServerUserInput,
} from "@jrkropp/codex-js/client";
import type { MessagesTimelineProps } from "../internal/chat-ui/components/chat/MessagesTimeline";
import {
	normalizePendingUserInputQuestion,
	type PendingUserInput,
} from "../internal/chat-ui/pendingUserInput";
import { proposedPlanTitle } from "../internal/chat-ui/components/chat/proposed-plan";
import {
	deriveContextWindowSnapshotFromTokenUsage,
	type ContextWindowSnapshot,
} from "../internal/chat-ui/lib/contextWindow";

export type CodexChatInteractionMode = "default" | "plan";

export type CodexChatProposedPlan = {
	id: string;
	planMarkdown: string;
	title: string | null;
	turnId: string;
};

export type CodexChatPendingUserInputRequest = {
	kind: "userInput";
	itemId: string;
	pendingUserInput: PendingUserInput;
	request: Extract<ServerRequest, { method: "item/tool/requestUserInput" }>;
	requestId: RequestId;
	threadId: string;
	turnId: string;
};

export type CodexChatPendingPermissionRequest = {
	kind: "permissions";
	composerRequest: RequestPermissionsEvent;
	request: Extract<ServerRequest, { method: "item/permissions/requestApproval" }>;
	requestId: RequestId;
	threadId: string;
	turnId: string | null;
};

export type CodexChatPendingDynamicToolCallRequest = {
	kind: "dynamicToolCall";
	compatRequest: DynamicToolCallRequest;
	request: Extract<ServerRequest, { method: "item/tool/call" }>;
	requestId: RequestId;
	threadId: string;
	turnId: string | null;
};

export type CodexChatPendingMcpElicitationRequest = {
	kind: "mcpElicitation";
	request: Extract<ServerRequest, { method: "mcpServer/elicitation/request" }>;
	requestId: RequestId;
	threadId: string | null;
	turnId: string | null;
};

export type CodexChatPendingCommandApprovalRequest = {
	kind: "commandApproval";
	request: Extract<ServerRequest, { method: "item/commandExecution/requestApproval" }>;
	requestId: RequestId;
	threadId: string;
	turnId: string | null;
};

export type CodexChatPendingFileChangeApprovalRequest = {
	kind: "fileChangeApproval";
	request: Extract<ServerRequest, { method: "item/fileChange/requestApproval" }>;
	requestId: RequestId;
	threadId: string;
	turnId: string | null;
};

export type CodexChatPendingAuthRefreshRequest = {
	kind: "chatgptAuthTokensRefresh";
	request: Extract<ServerRequest, { method: "account/chatgptAuthTokens/refresh" }>;
	requestId: RequestId;
	threadId: null;
	turnId: null;
};

export type CodexChatPendingApplyPatchApprovalRequest = {
	kind: "applyPatchApproval";
	request: Extract<ServerRequest, { method: "applyPatchApproval" }>;
	requestId: RequestId;
	threadId: string;
	turnId: null;
};

export type CodexChatPendingExecCommandApprovalRequest = {
	kind: "execCommandApproval";
	request: Extract<ServerRequest, { method: "execCommandApproval" }>;
	requestId: RequestId;
	threadId: string;
	turnId: null;
};

export type CodexChatPendingRequest =
	| CodexChatPendingApplyPatchApprovalRequest
	| CodexChatPendingAuthRefreshRequest
	| CodexChatPendingCommandApprovalRequest
	| CodexChatPendingDynamicToolCallRequest
	| CodexChatPendingExecCommandApprovalRequest
	| CodexChatPendingFileChangeApprovalRequest
	| CodexChatPendingMcpElicitationRequest
	| CodexChatPendingPermissionRequest
	| CodexChatPendingUserInputRequest;

export type CodexChatRenderLifecycleState = {
	activeWorkStartedAt: string | null;
	isWorking: boolean;
	runtimeError: string | null;
	visibleOptimisticUserMessages: readonly UserMessageTurnItem[];
};

export type CodexChatPendingRequestRenderContext = {
	defaultNode: ReactNode;
	reject: (message?: string | JSONRPCErrorError) => Promise<boolean>;
	request: CodexChatPendingRequest;
	resolve: (result: Result) => Promise<boolean>;
	state: CodexChatRenderState;
};

export type CodexChatPendingUserInputRenderContext = {
	defaultNode: ReactNode;
	reject: (message?: string | JSONRPCErrorError) => Promise<boolean>;
	request: CodexChatPendingUserInputRequest;
	resolve: (result: Result) => Promise<boolean>;
	state: CodexChatRenderState;
};

export type CodexChatRenderStateInput = {
	interactionMode?: CodexChatInteractionMode;
	lifecycle?: Partial<CodexChatRenderLifecycleState>;
	snapshot: ThreadEventSnapshot | null;
};

export type CodexChatRenderState = {
	activeProposedPlan: CodexChatProposedPlan | null;
	activeTurnStartedAt: string | null;
	banners: CodexChatRenderBanner[];
	composer: CodexChatComposerRenderState;
	errors: string[];
	interactionMode: CodexChatInteractionMode;
	items: T3TurnItem[];
	isWorking: boolean;
	optimisticUserMessages: readonly UserMessageTurnItem[];
	pending_dynamic_tool_call_requests: DynamicToolCallRequest[];
	pendingRequests: readonly CodexChatPendingRequest[];
	pendingPermissionRequest: CodexChatPendingPermissionRequest | null;
	pendingUserInputRequest: CodexChatPendingUserInputRequest | null;
	runtimeError: string | null;
	running_turn_ids: string[];
	showPlanFollowUpPrompt: boolean;
	timeline: Omit<
		MessagesTimelineProps,
		"listRef" | "onImageExpand" | "onIsAtEndChange"
	>;
	turns: T3Turn[];
	warnings: string[];
};

export type CodexChatComposerRenderState = {
	contextWindow: ContextWindowSnapshot | null;
	pendingUserInput: PendingUserInput | null;
	pendingUserInputAdapter: CodexChatPendingUserInputRequest | null;
};

export type CodexChatRenderBanner = {
	description?: string;
	id: string;
	request?: CodexChatPendingRequest;
	title: string;
	tone?: "destructive";
	variant: "error" | "info" | "success" | "warning";
};

export function createCodexChatRenderState({
	interactionMode = "default",
	lifecycle,
	snapshot,
}: CodexChatRenderStateInput): CodexChatRenderState {
	const activeTurnIds = new Set(snapshot?.activeTurnIds ?? []);
	const turns = (snapshot?.turns ?? []).map((turn) =>
		t3TurnFromAppServerTurn(turn, activeTurnIds.has(turn.id)),
	);
	const pendingRequests = (snapshot?.pendingRequests ?? []).map(codexChatPendingRequest);
	const pendingDynamicToolCallRequests = pendingRequests.flatMap((request) =>
		request.kind === "dynamicToolCall" ? [request.compatRequest] : [],
	);
	const pendingPermissionRequest =
		pendingRequests.find((request) => request.kind === "permissions") ?? null;
	const pendingUserInputRequest =
		pendingRequests.find((request) => request.kind === "userInput") ?? null;
	const activeTurnStartedAt = lifecycle?.activeWorkStartedAt ?? null;
	const errors = snapshot?.errors ?? [];
	const isWorking = lifecycle?.isWorking ?? false;
	const optimisticUserMessages = lifecycle?.visibleOptimisticUserMessages ?? [];
	const runtimeError = lifecycle?.runtimeError ?? null;
	const warnings = snapshot?.warnings ?? [];
	const activeProposedPlan = findActiveProposedPlan(snapshot);
	const contextWindow = deriveContextWindowSnapshotFromTokenUsage({
		tokenUsage: snapshot?.tokenUsage?.tokenUsage,
		updatedAt: snapshot?.tokenUsage?.updatedAt,
	});
	const banners = defaultRenderBanners({
		pendingRequests,
		runtimeError,
	});
	return {
		activeProposedPlan,
		activeTurnStartedAt,
		banners,
		composer: {
			contextWindow,
			pendingUserInput: pendingUserInputRequest?.pendingUserInput ?? null,
			pendingUserInputAdapter: pendingUserInputRequest,
		},
		errors,
		interactionMode,
		items: turns.flatMap((turn) => turn.items),
		isWorking,
		optimisticUserMessages,
		pending_dynamic_tool_call_requests: pendingDynamicToolCallRequests,
		pendingRequests,
		pendingPermissionRequest,
		pendingUserInputRequest,
		runtimeError,
		running_turn_ids: snapshot?.activeTurnIds ?? [],
		showPlanFollowUpPrompt:
			interactionMode === "plan" &&
			Boolean(activeProposedPlan) &&
			!isWorking &&
			!pendingUserInputRequest,
		timeline: {
			activeTurnStartedAt,
			errors,
			isWorking,
			optimisticUserMessages,
			runtimeError,
			turns,
			warnings,
		},
		turns,
		warnings,
	};
}

function findActiveProposedPlan(
	snapshot: ThreadEventSnapshot | null,
): CodexChatProposedPlan | null {
	if (!snapshot) {
		return null;
	}
	for (const turn of [...snapshot.turns].reverse()) {
		for (const item of [...turn.items].reverse()) {
			if (item.type !== "plan" || item.text.trim().length === 0) {
				continue;
			}
			return {
				id: `${turn.id}:${item.id}`,
				planMarkdown: item.text,
				title: proposedPlanTitle(item.text),
				turnId: turn.id,
			};
		}
	}
	return null;
}

function codexChatPendingRequest(request: ServerRequest): CodexChatPendingRequest {
	switch (request.method) {
		case "item/tool/requestUserInput":
			return {
				kind: "userInput",
				itemId: request.params.itemId,
				pendingUserInput: pendingUserInputFromServerRequest(request),
				request,
				requestId: request.id,
				threadId: request.params.threadId,
				turnId: request.params.turnId,
			};
		case "item/permissions/requestApproval":
			return {
				kind: "permissions",
				composerRequest: requestPermissionsFromServerRequest(request),
				request,
				requestId: request.id,
				threadId: request.params.threadId,
				turnId: request.params.turnId,
			};
		case "item/tool/call":
			return {
				kind: "dynamicToolCall",
				compatRequest: {
					arguments: request.params.arguments,
					call_id: request.params.callId,
					namespace: request.params.namespace,
					tool: request.params.tool,
					turn_id: request.params.turnId,
				},
				request,
				requestId: request.id,
				threadId: request.params.threadId,
				turnId: request.params.turnId,
			};
		case "mcpServer/elicitation/request":
			return {
				kind: "mcpElicitation",
				request,
				requestId: request.id,
				threadId: request.params.threadId,
				turnId: request.params.turnId,
			};
		case "item/commandExecution/requestApproval":
			return {
				kind: "commandApproval",
				request,
				requestId: request.id,
				threadId: request.params.threadId,
				turnId: request.params.turnId,
			};
		case "item/fileChange/requestApproval":
			return {
				kind: "fileChangeApproval",
				request,
				requestId: request.id,
				threadId: request.params.threadId,
				turnId: request.params.turnId,
			};
		case "account/chatgptAuthTokens/refresh":
			return {
				kind: "chatgptAuthTokensRefresh",
				request,
				requestId: request.id,
				threadId: null,
				turnId: null,
			};
		case "applyPatchApproval":
			return {
				kind: "applyPatchApproval",
				request,
				requestId: request.id,
				threadId: request.params.conversationId,
				turnId: null,
			};
		case "execCommandApproval":
			return {
				kind: "execCommandApproval",
				request,
				requestId: request.id,
				threadId: request.params.conversationId,
				turnId: null,
			};
	}
}

function defaultRenderBanners({
	pendingRequests,
	runtimeError,
}: {
	pendingRequests: readonly CodexChatPendingRequest[];
	runtimeError: string | null;
}): CodexChatRenderBanner[] {
	const banners: CodexChatRenderBanner[] = [];
	if (runtimeError) {
		banners.push({
			id: "runtime-error",
			title: "Codex connection interrupted",
			description: runtimeError,
			variant: "error",
			tone: "destructive",
		});
	}
	for (const request of pendingRequests) {
		if (request.kind === "userInput" || request.kind === "dynamicToolCall") {
			continue;
		}
		if (request.kind === "permissions") {
			banners.push({
				id: `request-permissions:${request.requestId}`,
				request,
				title: "Permissions requested",
				description:
					"Codex requested extra permissions. Approval controls are not available yet, so the request was denied for this turn.",
				variant: "warning",
			});
			continue;
		}
		banners.push({
			id: `server-request:${request.requestId}`,
			request,
			title: "Codex needs input",
			description: `No default renderer is available for ${request.request.method}.`,
			variant: "warning",
		});
	}
	return banners;
}

function t3TurnFromAppServerTurn(turn: Turn, isActive: boolean): T3Turn {
	return {
		completed_at: epochMillis(turn.completedAt),
		duration_ms: turn.durationMs,
		error: turn.error
			? {
					additional_details: turn.error.additionalDetails,
					codex_error_info: turn.error.codexErrorInfo,
					message: turn.error.message,
				}
			: null,
		id: turn.id,
		items: turn.items.flatMap((item) => t3TurnItemFromThreadItem(item, isActive)),
		items_view: turn.itemsView === "notLoaded" ? "not_loaded" : turn.itemsView,
		started_at: epochMillis(turn.startedAt),
		status: t3TurnStatusFromAppServer(turn.status),
	};
}

function t3TurnItemFromThreadItem(
	item: ThreadItem,
	turnIsActive: boolean,
): T3TurnItem[] {
	switch (item.type) {
		case "userMessage":
			return [
				{
					content: item.content.map(coreUserInputFromAppServer),
					id: item.id,
					type: "UserMessage",
				},
			];
		case "agentMessage":
			return [
				{
					content: [{ text: item.text, type: "Text" }],
					id: item.id,
					memory_citation: item.memoryCitation
						? {
								entries: item.memoryCitation.entries,
								rolloutIds: item.memoryCitation.threadIds,
							}
						: null,
					phase:
						turnIsActive && item.text.trim().length > 0
							? "streaming"
							: item.phase,
					type: "AgentMessage",
				},
			];
		case "plan":
			return [{ id: item.id, text: item.text, type: "Plan" }];
		case "reasoning":
			return [
				{
					id: item.id,
					raw_content: item.content,
					summary_text: item.summary,
					type: "Reasoning",
				},
			];
		case "commandExecution":
			return [
				{
					command: [item.command],
					cwd: item.cwd,
					duration_ms: item.durationMs,
					exit_code: item.exitCode,
					id: item.id,
					status:
						item.status === "inProgress"
							? "in_progress"
							: item.status === "declined"
								? "cancelled"
								: item.status,
					stdout: item.aggregatedOutput ?? "",
					type: "CommandExecution",
				},
			];
		case "fileChange":
			return [
				{
					auto_approved: false,
					changes: {},
					id: item.id,
					status:
						item.status === "completed" ||
						item.status === "failed" ||
						item.status === "declined"
							? item.status
							: null,
					stderr: "",
					stdout: "",
					type: "FileChange",
				},
			];
		case "dynamicToolCall":
			return [
				{
					arguments: item.arguments,
					content_items: item.contentItems,
					duration: item.durationMs === null ? null : String(item.durationMs),
					id: item.id,
					namespace: item.namespace,
					status: item.status,
					success: item.success,
					tool: item.tool,
					type: "DynamicToolCall",
				},
			];
		case "contextCompaction":
			return [{ id: item.id, type: "ContextCompaction" }];
		default:
			return [];
	}
}

function pendingUserInputFromServerRequest(
	request: Extract<ServerRequest, { method: "item/tool/requestUserInput" }>,
): PendingUserInput {
	return {
		itemId: request.params.itemId,
		questions: request.params.questions.map((question) => {
			const normalized = normalizePendingUserInputQuestion(question);
			return {
				...normalized,
				options: normalized.options.map((option) => ({ ...option })),
			};
		}),
		requestId: request.id,
		threadId: request.params.threadId,
		turnId: request.params.turnId,
	};
}

function requestPermissionsFromServerRequest(
	request: Extract<ServerRequest, { method: "item/permissions/requestApproval" }>,
): RequestPermissionsEvent {
	return {
		call_id: String(request.id),
		cwd: request.params.cwd,
		permissions: request.params.permissions as never,
		reason: request.params.reason,
		turn_id: request.params.turnId,
	};
}

function coreUserInputFromAppServer(input: AppServerUserInput): CoreUserInput {
	if (input.type === "image") {
		return { image_url: input.url, type: "image" };
	}
	if (input.type === "localImage") {
		return { path: input.path, type: "local_image" };
	}
	if (input.type === "text") {
		return {
			text: input.text,
			text_elements: input.text_elements.map((element) => ({
				byte_range: element.byteRange,
				placeholder: element.placeholder ?? undefined,
			})),
			type: "text",
		};
	}
	return {
		text: input.name,
		text_elements: [],
		type: "text",
	};
}

function t3TurnStatusFromAppServer(status: Turn["status"]): T3TurnStatus {
	return status === "inProgress" ? "in_progress" : status;
}

function epochMillis(value: number | null | undefined): number | null {
	return typeof value === "number" ? value * 1000 : null;
}
