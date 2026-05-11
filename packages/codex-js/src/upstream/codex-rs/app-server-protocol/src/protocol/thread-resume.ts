import type {
	Thread,
	ThreadItem,
	ThreadResumeResponse,
	Turn,
} from "../../schema/typescript/v2";
import type { StoredThread, StoredThreadHistory } from "../../../core/src/thread-store";
import { renderThreadFromHistory } from "../../../core/src/rendered-thread";
import type { Turn as CoreTurn } from "../../../core/src/thread-history-builder";
import type { ThreadId } from "../../../core/src/ids";
import type { TurnItem as CoreTurnItem } from "../../../core/src/items";
import type { UserInput as CoreUserInput } from "../../../core/src/protocol";
import { coreTurnItemToThreadItem } from "./event-mapping";

export type ThreadResumeSnapshotInput = {
	history: StoredThreadHistory;
	thread: StoredThread;
};

export function buildThreadResumeResponseFromHistory(
	input: ThreadResumeSnapshotInput,
): ThreadResumeResponse {
	const thread = threadHistoryToAppServerThread(input);
	return {
		thread,
		model: input.thread.model ?? "gpt-5.4",
		modelProvider: input.thread.model_provider,
		serviceTier: null,
		cwd: input.thread.cwd,
		instructionSources: [],
		approvalPolicy: approvalPolicyFromStoredThread(input.thread),
		approvalsReviewer: "user",
		sandbox: sandboxPolicyFromStoredThread(input.thread),
		reasoningEffort: reasoningEffortFromStoredThread(input.thread),
	};
}

export function threadHistoryToAppServerThread(
	input: ThreadResumeSnapshotInput,
): Thread {
	const rendered = renderThreadFromHistory(input.history);
	return {
		id: input.thread.thread_id,
		sessionId: input.thread.rollout_path ?? input.thread.thread_id,
		forkedFromId: input.thread.forked_from_id ?? null,
		preview: input.thread.preview,
		ephemeral: false,
		modelProvider: input.thread.model_provider,
		createdAt: epochSecondsFromIso(input.thread.created_at),
		updatedAt: epochSecondsFromIso(input.thread.updated_at),
		status: { type: "idle" },
		path: input.thread.rollout_path ?? null,
		cwd: input.thread.cwd,
		cliVersion: input.thread.cli_version ?? "",
		source: sessionSourceFromStoredThread(input.thread.source),
		threadSource: threadSourceFromStoredThread(input.thread.thread_source),
		agentNickname: input.thread.agent_nickname ?? null,
		agentRole: input.thread.agent_role ?? null,
		gitInfo: gitInfoFromStoredThread(input.thread.git_info),
		name: input.thread.name ?? null,
		turns: rendered.turns.map(appServerTurnFromCoreTurn),
	};
}

export function renderableHistoryFromAppServerThread(
	thread: Thread,
): StoredThreadHistory {
	return {
		thread_id: thread.id as ThreadId,
		items: thread.turns.flatMap((turn) => {
			const items = [
				{
					type: "event_msg" as const,
					payload: {
						type: "turn_started" as const,
						turn_id: turn.id,
						started_at:
							typeof turn.startedAt === "number"
								? turn.startedAt * 1000
								: undefined,
					},
				},
				...turn.items
					.map((item) => rolloutItemFromThreadItem(item, turn.id))
					.filter((item) => item !== null),
			];
			if (turn.status === "inProgress") {
				return items;
			}
			return [
				...items,
				{
					type: "event_msg" as const,
					payload:
						turn.status === "interrupted"
							? {
									type: "turn_aborted" as const,
									turn_id: turn.id,
									reason: "interrupted",
									completed_at:
										typeof turn.completedAt === "number"
											? turn.completedAt * 1000
											: undefined,
									duration_ms: turn.durationMs,
								}
							: {
									type: "turn_complete" as const,
									turn_id: turn.id,
									completed_at:
										typeof turn.completedAt === "number"
											? turn.completedAt * 1000
											: undefined,
									duration_ms: turn.durationMs,
								},
				},
			];
		}),
	};
}

export function appServerTurnFromCoreTurn(turn: CoreTurn): Turn {
	return {
		id: turn.id,
		items: turn.items
			.map(coreTurnItemToThreadItem)
			.filter((item): item is ThreadItem => item !== null),
		itemsView: turn.items_view === "not_loaded" ? "notLoaded" : turn.items_view,
		status: coreTurnStatusToAppServer(turn.status),
		error: turn.error
			? {
					message: turn.error.message,
					codexErrorInfo: (turn.error.codex_error_info ?? null) as never,
					additionalDetails: turn.error.additional_details ?? null,
				}
			: null,
		startedAt: epochSeconds(turn.started_at),
		completedAt: epochSeconds(turn.completed_at),
		durationMs: turn.duration_ms,
	};
}

function rolloutItemFromThreadItem(item: ThreadItem, turnId: string) {
	const coreItem = coreTurnItemFromThreadItem(item);
	if (!coreItem) {
		return null;
	}
	return {
		type: "event_msg" as const,
		payload: {
			type: "item_completed" as const,
			turn_id: turnId,
			item: coreItem,
		},
	};
}

function coreTurnItemFromThreadItem(item: ThreadItem): CoreTurnItem | null {
	switch (item.type) {
		case "userMessage":
			return {
				type: "UserMessage",
				id: item.id,
				content: item.content.map((input) => {
					if (input.type === "image") {
						return { type: "image", image_url: input.url };
					}
					if (input.type === "localImage") {
						return { type: "local_image", path: input.path };
					}
					if (input.type !== "text") {
						return {
							type: "text",
							text: input.name,
							text_elements: [],
						};
					}
					return {
						type: "text",
						text: input.text,
						text_elements: input.text_elements.map((element) => ({
							byte_range: element.byteRange,
							placeholder: element.placeholder ?? undefined,
						})),
					};
				}) as CoreUserInput[],
			};
		case "agentMessage":
			return {
				type: "AgentMessage",
				id: item.id,
				content: [{ type: "Text", text: item.text }],
				phase: item.phase,
				memory_citation: item.memoryCitation
					? {
							entries: item.memoryCitation.entries,
							rolloutIds: item.memoryCitation.threadIds,
						}
					: null,
			};
		case "plan":
			return { type: "Plan", id: item.id, text: item.text };
		case "reasoning":
			return {
				type: "Reasoning",
				id: item.id,
				summary_text: item.summary,
				raw_content: item.content,
			};
		case "webSearch":
			return {
				type: "WebSearch",
				id: item.id,
				query: item.query,
				action: coreWebSearchActionFromAppServer(item.action),
			};
		case "commandExecution":
			return {
				type: "CommandExecution",
				id: item.id,
				command: [item.command],
				cwd: item.cwd,
				status: coreCommandStatusFromAppServer(item.status),
				stdout: item.aggregatedOutput ?? "",
				exit_code: item.exitCode,
				duration_ms: item.durationMs,
			};
		case "fileChange":
			return {
				type: "FileChange",
				id: item.id,
				changes: {},
				status:
					item.status === "completed" ||
					item.status === "failed" ||
					item.status === "declined"
						? item.status
						: null,
				auto_approved: false,
				stdout: "",
				stderr: "",
			};
		case "dynamicToolCall":
			return {
				type: "DynamicToolCall",
				id: item.id,
				namespace: item.namespace,
				tool: item.tool,
				arguments: item.arguments,
				status: item.status,
				content_items: item.contentItems ?? [],
				success: item.success,
				duration: item.durationMs === null ? null : String(item.durationMs),
			};
		case "contextCompaction":
			return { type: "ContextCompaction", id: item.id };
		default:
			return null;
	}
}

function coreWebSearchActionFromAppServer(
	action: Extract<ThreadItem, { type: "webSearch" }>["action"],
): CoreTurnItem extends infer T
	? T extends { type: "WebSearch"; action: infer A }
		? A
		: never
	: never {
	if (!action) {
		return { type: "other" } as never;
	}
	switch (action.type) {
		case "search":
			return {
				type: "search",
				...(action.query ? { query: action.query } : {}),
				...(action.queries ? { queries: action.queries } : {}),
			} as never;
		case "openPage":
			return {
				type: "open_page",
				...(action.url ? { url: action.url } : {}),
			} as never;
		case "findInPage":
			return {
				type: "find_in_page",
				...(action.url ? { url: action.url } : {}),
				...(action.pattern ? { pattern: action.pattern } : {}),
			} as never;
		case "other":
			return { type: "other" } as never;
	}
}

function coreTurnStatusToAppServer(status: CoreTurn["status"]): Turn["status"] {
	if (status === "in_progress") {
		return "inProgress";
	}
	return status;
}

function coreCommandStatusFromAppServer(status: Extract<ThreadItem, { type: "commandExecution" }>["status"]) {
	if (status === "declined") {
		return "failed";
	}
	return status === "inProgress" ? "in_progress" : status;
}

function epochSeconds(value: number | null | undefined): number | null {
	return typeof value === "number" ? value / 1000 : null;
}

function epochSecondsFromIso(value: string): number {
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
}

function sessionSourceFromStoredThread(source: string): Thread["source"] {
	if (source === "cli" || source === "vscode" || source === "exec" || source === "unknown") {
		return source;
	}
	if (source === "appServer" || source === "app-server") {
		return "appServer";
	}
	return { custom: source };
}

function threadSourceFromStoredThread(source: string | null | undefined): Thread["threadSource"] {
	if (source === "user" || source === "subagent" || source === "memory_consolidation") {
		return source;
	}
	return null;
}

function gitInfoFromStoredThread(gitInfo: unknown): Thread["gitInfo"] {
	if (!gitInfo || typeof gitInfo !== "object") {
		return null;
	}
	const value = gitInfo as Record<string, unknown>;
	return {
		sha: typeof value.sha === "string" ? value.sha : typeof value.commit_hash === "string" ? value.commit_hash : null,
		branch: typeof value.branch === "string" ? value.branch : null,
		originUrl:
			typeof value.originUrl === "string"
				? value.originUrl
				: typeof value.repository_url === "string"
					? value.repository_url
					: null,
	};
}

function approvalPolicyFromStoredThread(thread: StoredThread): ThreadResumeResponse["approvalPolicy"] {
	if (
		thread.approval_mode === "untrusted" ||
		thread.approval_mode === "on-failure" ||
		thread.approval_mode === "on-request" ||
		thread.approval_mode === "never"
	) {
		return thread.approval_mode;
	}
	return "on-request";
}

function sandboxPolicyFromStoredThread(thread: StoredThread): ThreadResumeResponse["sandbox"] {
	if (thread.sandbox_policy && typeof thread.sandbox_policy === "object") {
		return thread.sandbox_policy as ThreadResumeResponse["sandbox"];
	}
	if (thread.sandbox_policy === "read-only") {
		return { type: "readOnly", networkAccess: false };
	}
	return { type: "dangerFullAccess" };
}

function reasoningEffortFromStoredThread(
	thread: StoredThread,
): ThreadResumeResponse["reasoningEffort"] {
	if (
		thread.reasoning_effort === "none" ||
		thread.reasoning_effort === "minimal" ||
		thread.reasoning_effort === "low" ||
		thread.reasoning_effort === "medium" ||
		thread.reasoning_effort === "high" ||
		thread.reasoning_effort === "xhigh"
	) {
		return thread.reasoning_effort;
	}
	return null;
}
