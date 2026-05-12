import type {
	EventMsg,
	RateLimitSnapshot,
	TokenUsage,
	TokenUsageInfo,
	UserInput,
} from "../../../core/src/protocol";
import type {
	MessagePhase,
	ServerNotification,
	ServerRequest,
} from "../../schema/typescript";
import type {
	RateLimitSnapshot as AppServerRateLimitSnapshot,
	ThreadItem,
	ThreadTokenUsage,
	Turn,
} from "../../schema/typescript/v2";
import type { MemoryCitation as AppServerMemoryCitation } from "../../schema/typescript/v2";
import type { UserInput as AppServerUserInput } from "../../schema/typescript/v2";

export type ServerRequestCoreTarget =
	| { responseId: string; type: "user_input" }
	| { callId: string; type: "request_permissions" }
	| { callId: string; type: "dynamic_tool" }
	| { requestId: string | number; serverName: string; type: "mcp_elicitation" };

export type AppServerProtocolEvent =
	| { notification: ServerNotification; type: "server_notification" }
	| {
			coreTarget?: ServerRequestCoreTarget;
			request: ServerRequest;
			type: "server_request";
	  };

export type EventMappingContext = {
	activeTurn?: Turn | null;
	threadId: string;
	terminalTurn?: Turn | null;
	turnId?: string | null;
};

type ServerRequestInput =
	| ServerRequest
	| (ServerRequest extends infer T
			? T extends { id: unknown }
				? Omit<T, "id"> & { id?: never }
				: never
			: never);

export function eventMsgToAppServerEvents(
	msg: EventMsg,
	context: EventMappingContext,
): AppServerProtocolEvent[] {
	if (msg.type === "token_count") {
		const events: AppServerProtocolEvent[] = [];
		const turnId = turnIdFromEventMsg(msg, context);
		if (msg.info) {
			events.push(
				turnId
					? notification({
							method: "thread/tokenUsage/updated",
							params: {
								threadId: context.threadId,
								turnId,
								tokenUsage: threadTokenUsageFromTokenUsageInfo(msg.info),
							},
						})
					: missingTurnIdWarning(context.threadId, msg.type),
			);
		}
		if (msg.rate_limits) {
			events.push(notification({
				method: "account/rateLimits/updated",
				params: {
					rateLimits: appServerRateLimitSnapshot(msg.rate_limits),
				},
			}));
		}
		return events;
	}
	if (msg.type === "dynamic_tool_call_request") {
		const threadId = context.threadId;
		return [
			notification({
				method: "item/started",
				params: {
					threadId,
					turnId: msg.turn_id,
					startedAtMs: msg.started_at_ms ?? Date.now(),
					item: {
						type: "dynamicToolCall",
						id: msg.call_id,
						namespace: msg.namespace ?? null,
						tool: msg.tool,
						arguments: msg.arguments as never,
						status: "inProgress",
						contentItems: null,
						success: null,
						durationMs: null,
					},
				},
			}),
			request(
				{
					method: "item/tool/call",
					params: {
						threadId,
						turnId: msg.turn_id,
						callId: msg.call_id,
						namespace: msg.namespace ?? null,
						tool: msg.tool,
						arguments: msg.arguments as never,
					},
				},
				{ type: "dynamic_tool", callId: msg.call_id },
			),
		];
	}
	if (msg.type === "agent_message") {
		return [];
	}
	return [eventMsgToAppServerEvent(msg, context)];
}

export function eventMsgToAppServerEvent(
	msg: EventMsg,
	context: EventMappingContext,
): AppServerProtocolEvent {
	const threadId = context.threadId;
	const turnId = turnIdFromEventMsg(msg, context);
	switch (msg.type) {
		case "turn_started":
			return notification({
				method: "turn/started",
				params: {
					threadId,
					turn: {
						...(context.activeTurn ?? {}),
						id: msg.turn_id,
						items: [],
						itemsView: "notLoaded",
						status: "inProgress",
						error: null,
						startedAt: epochSeconds(msg.started_at),
						completedAt: null,
						durationMs: null,
					},
				},
			});
		case "turn_complete":
			return notification({
				method: "turn/completed",
				params: {
					threadId,
					turn: completedTurnFromEvent({
						completedAt: epochSeconds(msg.completed_at),
						durationMs: msg.duration_ms ?? null,
						fallbackTurnId: msg.turn_id,
						status: "completed",
						terminalTurn: context.terminalTurn,
					}),
				},
			});
		case "turn_aborted":
			return notification({
				method: "turn/completed",
				params: {
					threadId,
					turn: completedTurnFromEvent({
						completedAt: epochSeconds(msg.completed_at ?? msg.aborted_at),
						durationMs: msg.duration_ms ?? null,
						fallbackTurnId: msg.turn_id,
						status: "interrupted",
						terminalTurn: context.terminalTurn,
					}),
				},
			});
		case "agent_message_content_delta":
			return notification({
				method: "item/agentMessage/delta",
				params: {
					threadId: msg.thread_id,
					turnId: msg.turn_id,
					itemId: msg.item_id,
					delta: msg.delta,
				},
			});
		case "plan_delta":
			return notification({
				method: "item/plan/delta",
				params: {
					threadId: msg.thread_id,
					turnId: msg.turn_id,
					itemId: msg.item_id,
					delta: msg.delta,
				},
			});
		case "plan_update":
			if (!turnId) {
				return missingTurnIdWarning(threadId, msg.type);
			}
			return notification({
				method: "turn/plan/updated",
				params: {
					threadId,
					turnId,
					explanation: msg.explanation ?? null,
					plan: msg.plan.map((step) => ({
						step: step.step,
						status:
							step.status === "in_progress" ? "inProgress" : step.status,
					})),
				},
			});
		case "item_started": {
			if (!turnId) {
				return missingTurnIdWarning(threadId, msg.type);
			}
			const item = coreTurnItemToThreadItem(msg.item);
			return item
				? notification({
						method: "item/started",
						params: {
							threadId,
							turnId: msg.turn_id ?? turnId,
							item,
							startedAtMs: Date.now(),
						},
					})
				: warning(threadId, `Unmapped Codex item_started: ${msg.item.type}`);
		}
		case "item_completed": {
			if (!turnId) {
				return missingTurnIdWarning(threadId, msg.type);
			}
			const item = coreTurnItemToThreadItem(msg.item);
			return item
				? notification({
						method: "item/completed",
						params: {
							threadId,
							turnId: msg.turn_id ?? turnId,
							item,
							completedAtMs: Date.now(),
						},
					})
				: warning(threadId, `Unmapped Codex item_completed: ${msg.item.type}`);
		}
		case "user_message":
			if (!turnId) {
				return missingTurnIdWarning(threadId, msg.type);
			}
			return notification({
				method: "item/completed",
				params: {
					threadId,
					turnId,
					completedAtMs: Date.now(),
					item: {
						type: "userMessage",
						id: `user-${turnId}`,
						content: userInputsFromUserMessage(msg),
					},
				},
			});
		case "raw_response_item":
			if (!turnId) {
				return missingTurnIdWarning(threadId, msg.type);
			}
			return notification({
				method: "rawResponseItem/completed",
				params: {
					threadId,
					turnId,
					item: msg.item as never,
				},
			});
		case "request_user_input":
			return request(
				{
					method: "item/tool/requestUserInput",
					params: {
						threadId,
						turnId: msg.turn_id,
						itemId: msg.call_id,
						questions: msg.questions.map((question) => ({
							id: question.id,
							header: question.header,
							question: question.question,
							isOther: question.isOther,
							isSecret: question.isSecret,
							options: question.options.map((option) => ({ ...option })),
						})),
					},
				},
				{ type: "user_input", responseId: msg.turn_id },
			);
		case "request_permissions":
			return request(
				{
					method: "item/permissions/requestApproval",
					params: {
						threadId,
						turnId: msg.turn_id,
						itemId: msg.call_id,
						cwd: msg.cwd ?? "",
						reason: msg.reason ?? null,
						permissions: msg.permissions as never,
					},
				},
				{ type: "request_permissions", callId: msg.call_id },
			);
		case "command_approval_request":
			if (!turnId) {
				return missingTurnIdWarning(threadId, msg.type);
			}
			return request({
				method: "item/commandExecution/requestApproval",
				params: {
					threadId,
					turnId,
					itemId: msg.call_id,
					approvalId: null,
					reason: msg.reason ?? null,
					command: msg.command.join(" "),
					cwd: msg.cwd,
					commandActions: [],
					networkApprovalContext: null,
					proposedExecpolicyAmendment: null,
					proposedNetworkPolicyAmendments: null,
				},
			});
		case "file_change_approval_request":
			if (!turnId) {
				return missingTurnIdWarning(threadId, msg.type);
			}
			return request({
				method: "item/fileChange/requestApproval",
				params: {
					threadId,
					turnId,
					itemId: msg.call_id,
					reason: msg.reason ?? null,
					grantRoot: null,
				},
			});
		case "dynamic_tool_call_request":
			return request(
				{
					method: "item/tool/call",
					params: {
						threadId,
						turnId: msg.turn_id,
						callId: msg.call_id,
						namespace: msg.namespace ?? null,
						tool: msg.tool,
						arguments: msg.arguments as never,
					},
				},
				{ type: "dynamic_tool", callId: msg.call_id },
			);
		case "dynamic_tool_call_response":
			return notification({
				method: "item/completed",
				params: {
					threadId,
					turnId: msg.turn_id,
					completedAtMs: msg.completed_at_ms ?? Date.now(),
					item: {
						type: "dynamicToolCall",
						id: msg.call_id,
						namespace: msg.namespace ?? null,
						tool: msg.tool,
						arguments: msg.arguments as never,
						status: msg.success ? "completed" : "failed",
						contentItems: msg.content_items.map((item) =>
							item.type === "inputText"
								? { type: "inputText", text: item.text }
								: { type: "inputImage", imageUrl: item.imageUrl },
						),
						success: msg.success,
						durationMs: durationMsFromString(msg.duration),
					},
				},
			});
			case "mcp_server_elicitation_request":
			return request(
				{
					method: "mcpServer/elicitation/request",
					params: {
						threadId,
						turnId: msg.turn_id,
						serverName: msg.server_name,
						...(msg.request.type === "url"
							? {
									mode: "url" as const,
									message: msg.request.message,
									_meta: msg.request.meta ?? null,
									url: msg.request.url,
									elicitationId: msg.request.elicitation_id ?? "",
								}
							: {
									mode: "form" as const,
									message: msg.request.message,
									_meta: msg.request.meta ?? null,
									requestedSchema: msg.request.requested_schema as never,
								}),
					},
				},
				{
					type: "mcp_elicitation",
					serverName: msg.server_name,
					requestId: msg.id,
				},
			);
		case "context_compacted":
			if (!turnId) {
				return missingTurnIdWarning(threadId, msg.type);
			}
			return notification({
				method: "thread/compacted",
				params: { threadId, turnId },
			});
		case "realtime_conversation_started":
			return notification({
				method: "thread/realtime/started",
				params: {
					threadId,
					realtimeSessionId: msg.realtime_session_id ?? null,
					version: msg.version,
				},
			});
		case "realtime_conversation_sdp":
			return notification({
				method: "thread/realtime/sdp",
				params: { threadId, sdp: msg.sdp },
			});
		case "realtime_conversation_realtime":
			if (
				typeof msg.payload === "object" &&
				msg.payload !== null &&
				(msg.payload as { type?: unknown }).type === "error"
			) {
				return notification({
					method: "thread/realtime/error",
					params: {
						threadId,
						message: String(
							(msg.payload as { message?: unknown }).message ??
								"Realtime conversation error.",
						),
					},
				});
			}
			return notification({
				method: "thread/realtime/itemAdded",
				params: {
					threadId,
					item: msg.payload as never,
				},
			});
		case "realtime_conversation_closed":
			return notification({
				method: "thread/realtime/closed",
				params: { threadId, reason: msg.reason ?? null },
			});
		case "warning":
			return warning(threadId, msg.message);
		case "error":
			if (!turnId) {
				return missingTurnIdWarning(threadId, msg.type);
			}
			return notification({
				method: "error",
				params: {
					threadId,
					turnId,
					willRetry: false,
					error: {
						message: msg.message,
						codexErrorInfo: null,
						additionalDetails: null,
					},
				},
			});
		default:
			return warning(threadId, `Unmapped Codex event: ${msg.type}`);
	}
}

export const eventMsgToServerProtocolEvent = eventMsgToAppServerEvent;
export const eventMsgToServerProtocolEvents = eventMsgToAppServerEvents;

export function serverRequestResolvedNotification(input: {
	requestId: string | number;
	threadId: string;
}): AppServerProtocolEvent {
	return notification({
		method: "serverRequest/resolved",
		params: {
			threadId: input.threadId,
			requestId: input.requestId,
		},
	});
}

function notification(notification: ServerNotification): AppServerProtocolEvent {
	return { notification, type: "server_notification" };
}

function request(
	request: ServerRequestInput,
	coreTarget?: ServerRequestCoreTarget,
): AppServerProtocolEvent {
	return {
		...(coreTarget ? { coreTarget } : {}),
		request: request as ServerRequest,
		type: "server_request",
	};
}

function warning(threadId: string, message: string): AppServerProtocolEvent {
	return notification({
		method: "warning",
		params: { threadId, message },
	});
}

function missingTurnIdWarning(
	threadId: string,
	eventType: string,
): AppServerProtocolEvent {
	return warning(threadId, `Codex event ${eventType} was missing a turn id.`);
}

function turnIdFromEventMsg(
	msg: EventMsg,
	context: EventMappingContext,
): string | null {
	if ("turn_id" in msg && typeof msg.turn_id === "string") {
		return msg.turn_id;
	}
	return context.turnId ?? null;
}

function epochSeconds(value: number | null | undefined): number | null {
	return typeof value === "number" ? value / 1000 : null;
}

function durationMsFromString(value: string | null | undefined): number | null {
	if (!value) {
		return null;
	}
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function completedTurnFromEvent(input: {
	completedAt: number | null;
	durationMs: number | null;
	fallbackTurnId: string;
	status: "completed" | "interrupted";
	terminalTurn?: Turn | null;
}): Turn {
	const turn =
		input.terminalTurn?.id === input.fallbackTurnId ? input.terminalTurn : null;
	return {
		id: input.fallbackTurnId,
		items: turn?.items ?? [],
		itemsView: turn?.itemsView ?? "notLoaded",
		status:
			turn?.status === "failed" && input.status === "completed"
				? "failed"
				: input.status,
		error: turn?.error ?? null,
		startedAt: turn?.startedAt ?? null,
		completedAt: input.completedAt,
		durationMs: input.durationMs,
	};
}

export function threadTokenUsageFromTokenUsageInfo(info: TokenUsageInfo): ThreadTokenUsage {
	return {
		total: appServerTokenUsageBreakdown(info.total_token_usage),
		last: appServerTokenUsageBreakdown(info.last_token_usage),
		modelContextWindow: info.model_context_window ?? null,
	};
}

function appServerTokenUsageBreakdown(usage: TokenUsage): ThreadTokenUsage["total"] {
	return {
		totalTokens: usage.total_tokens,
		inputTokens: usage.input_tokens,
		cachedInputTokens: usage.cached_input_tokens,
		outputTokens: usage.output_tokens,
		reasoningOutputTokens: usage.reasoning_output_tokens,
	};
}

function appServerRateLimitSnapshot(
	snapshot: RateLimitSnapshot,
): AppServerRateLimitSnapshot {
	return {
		limitId: valueAsStringOrNull(snapshot.limit_id),
		limitName: valueAsStringOrNull(snapshot.limit_name),
		primary: appServerRateLimitWindow(snapshot.primary),
		secondary: appServerRateLimitWindow(snapshot.secondary),
		credits: (snapshot.credits ?? null) as never,
		planType: (snapshot.plan_type ?? null) as never,
		rateLimitReachedType: (snapshot.rate_limit_reached_type ?? null) as never,
	};
}

function appServerRateLimitWindow(
	window: unknown,
): AppServerRateLimitSnapshot["primary"] {
	if (!window || typeof window !== "object") {
		return null;
	}
	const record = window as {
		reset_seconds?: unknown;
		resets_at?: unknown;
		used_percent?: unknown;
		usedPercent?: unknown;
		window_duration_mins?: unknown;
		windowDurationMins?: unknown;
	};
	const resetSeconds =
		typeof record.reset_seconds === "number" ? record.reset_seconds : null;
	const resetsAt =
		typeof record.resets_at === "number"
			? record.resets_at
			: resetSeconds === null
				? null
				: Math.floor(Date.now() / 1000) + resetSeconds;
	return {
		usedPercent: numberOrZero(record.usedPercent ?? record.used_percent),
		windowDurationMins:
			typeof record.windowDurationMins === "number"
				? record.windowDurationMins
				: typeof record.window_duration_mins === "number"
					? record.window_duration_mins
					: null,
		resetsAt,
	};
}

function numberOrZero(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function valueAsStringOrNull(value: unknown): string | null {
	return typeof value === "string" ? value : null;
}

function userInputsFromUserMessage(
	msg: Extract<EventMsg, { type: "user_message" }>,
): AppServerUserInput[] {
	const inputs: AppServerUserInput[] = [
		{
			type: "text",
			text: msg.message,
			text_elements: appServerTextElementsFromCore(msg.text_elements ?? []),
		},
	];
	for (const url of msg.images ?? []) {
		inputs.push({ type: "image", url });
	}
	for (const path of msg.local_images ?? []) {
		inputs.push({ type: "localImage", path });
	}
	return inputs;
}

function appServerUserInputsFromCore(inputs: UserInput[]): AppServerUserInput[] {
	return inputs.map((input) => {
		if (input.type === "text") {
			return {
				type: "text",
				text: input.text,
				text_elements: appServerTextElementsFromCore(input.text_elements ?? []),
			};
		}
		if (input.type === "image") {
			return { type: "image", url: input.image_url };
		}
		if (input.type === "local_image") {
			return { type: "localImage", path: input.path };
		}
		return input;
	});
}

function appServerTextElementsFromCore(
	elements: NonNullable<Extract<UserInput, { type: "text" }>["text_elements"]>,
): Extract<AppServerUserInput, { type: "text" }>["text_elements"] {
	return elements.map((element) => ({
		byteRange: element.byte_range,
		placeholder: element.placeholder ?? null,
	}));
}

function appServerMessagePhase(value: unknown): MessagePhase | null {
	return value === "commentary" || value === "final_answer" ? value : null;
}

function appServerMemoryCitationFromCore(
	citation: { entries: AppServerMemoryCitation["entries"]; rolloutIds?: string[] } | null,
): AppServerMemoryCitation | null {
	return citation
		? {
				entries: citation.entries,
				threadIds: citation.rolloutIds ?? [],
			}
		: null;
}

export function coreTurnItemToThreadItem(item: unknown): ThreadItem | null {
	if (!item || typeof item !== "object" || !("type" in item)) {
		return null;
	}
	const value = item as Record<string, unknown>;
	switch (value.type) {
		case "UserMessage":
			return {
				type: "userMessage",
				id: String(value.id ?? ""),
				content: appServerUserInputsFromCore((value.content ?? []) as UserInput[]),
			};
		case "AgentMessage":
			return {
				type: "agentMessage",
				id: String(value.id ?? ""),
				text: ((value.content as Array<{ text?: string }> | undefined) ?? [])
					.map((part) => part.text ?? "")
					.join(""),
				phase: appServerMessagePhase(value.phase),
				memoryCitation: appServerMemoryCitationFromCore(
					(value.memory_citation as never) ?? null,
				),
			};
		case "Plan":
			return {
				type: "plan",
				id: String(value.id ?? ""),
				text: String(value.text ?? ""),
			};
		case "Reasoning":
			return {
				type: "reasoning",
				id: String(value.id ?? ""),
				summary: (value.summary_text ?? []) as string[],
				content: (value.raw_content ?? []) as string[],
			};
		case "WebSearch": {
			const action = appServerWebSearchAction(value.action);
			return {
				type: "webSearch",
				id: String(value.id ?? ""),
				query:
					typeof value.query === "string"
						? value.query
						: webSearchActionDetail(action),
				action,
			};
		}
		case "CommandExecution":
			return {
				type: "commandExecution",
				id: String(value.id ?? ""),
				command: ((value.command as string[] | undefined) ?? []).join(" "),
				cwd: String(value.cwd ?? ""),
				processId: null,
				source: "agent",
				status: commandStatusToAppServer(value.status),
				commandActions: [],
				aggregatedOutput:
					[value.stdout, value.stderr].filter(Boolean).join("") || null,
				exitCode:
					typeof value.exit_code === "number" ? value.exit_code : null,
				durationMs:
					typeof value.duration_ms === "number" ? value.duration_ms : null,
			};
		case "FileChange":
			return {
				type: "fileChange",
				id: String(value.id ?? ""),
				changes: [],
				status: (value.status as never) ?? "completed",
			};
		case "DynamicToolCall":
			return {
				type: "dynamicToolCall",
				id: String(value.id ?? ""),
				namespace: (value.namespace as string | null | undefined) ?? null,
				tool: String(value.tool ?? ""),
				arguments: (value.arguments ?? null) as never,
				status: dynamicToolStatusToAppServer(value.status),
				contentItems: (value.content_items as never) ?? null,
				success: (value.success as boolean | null | undefined) ?? null,
				durationMs: durationMsFromString(value.duration as string | undefined),
			};
		case "ContextCompaction":
			return {
				type: "contextCompaction",
				id: String(value.id ?? ""),
			};
		default:
			return null;
	}
}

function appServerWebSearchAction(action: unknown) {
	if (!action || typeof action !== "object") {
		return { type: "other" as const };
	}
	const record = action as Record<string, unknown>;
	if (record.type === "search") {
		return {
			type: "search" as const,
			query: typeof record.query === "string" ? record.query : null,
			queries: Array.isArray(record.queries)
				? record.queries.filter((query): query is string => typeof query === "string")
				: null,
		};
	}
	if (record.type === "open_page" || record.type === "openPage") {
		return {
			type: "openPage" as const,
			url: typeof record.url === "string" ? record.url : null,
		};
	}
	if (record.type === "find_in_page" || record.type === "findInPage") {
		return {
			type: "findInPage" as const,
			url: typeof record.url === "string" ? record.url : null,
			pattern: typeof record.pattern === "string" ? record.pattern : null,
		};
	}
	return { type: "other" as const };
}

function webSearchActionDetail(action: ReturnType<typeof appServerWebSearchAction>): string {
	switch (action.type) {
		case "search":
			return action.query ?? action.queries?.join(", ") ?? "";
		case "openPage":
			return action.url ?? "";
		case "findInPage": {
			const pattern = action.pattern ?? "";
			const url = action.url ?? "";
			return pattern && url ? `'${pattern}' in ${url}` : (pattern || url);
		}
		case "other":
			return "";
	}
}

function commandStatusToAppServer(value: unknown): ThreadItem extends infer T
	? T extends { type: "commandExecution"; status: infer S }
		? S
		: never
	: never {
	if (value === "completed" || value === "failed") {
		return value as never;
	}
	if (value === "cancelled") {
		return "failed" as never;
	}
	return "inProgress" as never;
}

function dynamicToolStatusToAppServer(value: unknown): ThreadItem extends infer T
	? T extends { type: "dynamicToolCall"; status: infer S }
		? S
		: never
	: never {
	if (value === "completed" || value === "failed") {
		return value as never;
	}
	return "inProgress" as never;
}
