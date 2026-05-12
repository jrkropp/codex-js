import type {
	ClientRequest,
	RequestId,
} from "../../schema/typescript";

export type ClientRequestSerializationScope =
	| { key: string; type: "global" }
	| { threadId: string; type: "thread" }
	| { path: string; type: "threadPath" }
	| { processId: string; type: "commandExecProcess" }
	| { processHandle: string; type: "process" }
	| { sessionId: string; type: "fuzzyFileSearchSession" }
	| { watchId: string; type: "fsWatch" }
	| { serverName: string; type: "mcpOauth" };

export function clientRequestId(request: ClientRequest): RequestId {
	return request.id;
}

export function clientRequestMethod(request: ClientRequest): string {
	return request.method;
}

export function clientRequestExperimentalReason(
	request: ClientRequest | { method: string; params?: unknown },
): string | null {
	return (
		EXPERIMENTAL_METHOD_REASONS[request.method] ??
		clientRequestParamExperimentalReason(request.method, objectParams(request.params))
	);
}

export function clientRequestSerializationScope(
	request: ClientRequest | { method: string; params?: unknown },
): ClientRequestSerializationScope | null {
	const params = objectParams(request.params);
	switch (request.method) {
		case "thread/resume":
		case "thread/fork":
			return threadOrPathScope(params, "threadId", "path");
		case "thread/archive":
		case "thread/unsubscribe":
		case "thread/increment_elicitation":
		case "thread/decrement_elicitation":
		case "thread/name/set":
		case "thread/goal/set":
		case "thread/goal/get":
		case "thread/goal/clear":
		case "thread/metadata/update":
		case "thread/memoryMode/set":
		case "thread/unarchive":
		case "thread/compact/start":
		case "thread/shellCommand":
		case "thread/approveGuardianDeniedAction":
		case "thread/backgroundTerminals/clean":
		case "thread/rollback":
		case "thread/read":
		case "thread/inject_items":
		case "turn/start":
		case "turn/steer":
		case "turn/interrupt":
		case "thread/realtime/start":
		case "thread/realtime/appendAudio":
		case "thread/realtime/appendText":
		case "thread/realtime/stop":
		case "review/start":
		case "mcpServer/tool/call":
			return threadScope(params, "threadId", "thread_id");
		case "memory/reset":
			return globalScope("memory");
		case "skills/list":
		case "hooks/list":
		case "marketplace/add":
		case "marketplace/remove":
		case "marketplace/upgrade":
		case "plugin/list":
		case "plugin/read":
		case "plugin/skill/read":
		case "plugin/share/save":
		case "plugin/share/updateTargets":
		case "plugin/share/list":
		case "plugin/share/delete":
		case "skills/config/write":
		case "plugin/install":
		case "plugin/uninstall":
		case "experimentalFeature/list":
		case "experimentalFeature/enablement/set":
		case "windowsSandbox/readiness":
		case "config/read":
		case "externalAgentConfig/detect":
		case "externalAgentConfig/import":
		case "config/value/write":
		case "config/batchWrite":
		case "configRequirements/read":
			return globalScope("config");
		case "device/key/create":
		case "device/key/public":
		case "device/key/sign":
			return globalScope("device-key");
		case "mcpServer/oauth/login":
			return mcpOauthScope(params, "name");
		case "config/mcpServer/reload":
		case "mcpServerStatus/list":
			return globalScope("mcp-registry");
		case "mcpServer/resource/read":
			return optionalThreadScope(params, "threadId", "thread_id");
		case "windowsSandbox/setupStart":
			return globalScope("windows-sandbox-setup");
		case "account/login/start":
		case "account/login/cancel":
		case "account/logout":
		case "account/sendAddCreditsNudgeEmail":
		case "account/read":
		case "getAuthStatus":
			return globalScope("account-auth");
		case "command/exec":
			return optionalCommandExecProcessScope(params, "processId", "process_id");
		case "command/exec/write":
		case "command/exec/terminate":
		case "command/exec/resize":
			return commandExecProcessScope(params, "processId", "process_id");
		case "process/spawn":
		case "process/writeStdin":
		case "process/kill":
		case "process/resizePty":
			return processHandleScope(params, "processHandle", "process_handle");
		case "fuzzyFileSearch/sessionStart":
		case "fuzzyFileSearch/sessionUpdate":
		case "fuzzyFileSearch/sessionStop":
			return fuzzySessionScope(params, "sessionId", "session_id");
		case "fs/watch":
		case "fs/unwatch":
			return fsWatchScope(params, "watchId", "watch_id");
		default:
			return null;
	}
}

const EXPERIMENTAL_METHOD_REASONS: Record<string, string> = {
	"collaborationMode/list": "collaborationMode/list",
	"fuzzyFileSearch/sessionStart": "fuzzyFileSearch/sessionStart",
	"fuzzyFileSearch/sessionStop": "fuzzyFileSearch/sessionStop",
	"fuzzyFileSearch/sessionUpdate": "fuzzyFileSearch/sessionUpdate",
	"memory/reset": "memory/reset",
	"mock/experimentalMethod": "mock/experimentalMethod",
	"process/kill": "process/kill",
	"process/resizePty": "process/resizePty",
	"process/spawn": "process/spawn",
	"process/writeStdin": "process/writeStdin",
	"thread/backgroundTerminals/clean": "thread/backgroundTerminals/clean",
	"thread/decrement_elicitation": "thread/decrement_elicitation",
	"thread/goal/clear": "thread/goal/clear",
	"thread/goal/get": "thread/goal/get",
	"thread/goal/set": "thread/goal/set",
	"thread/increment_elicitation": "thread/increment_elicitation",
	"thread/memoryMode/set": "thread/memoryMode/set",
	"thread/realtime/appendAudio": "thread/realtime/appendAudio",
	"thread/realtime/appendText": "thread/realtime/appendText",
	"thread/realtime/listVoices": "thread/realtime/listVoices",
	"thread/realtime/start": "thread/realtime/start",
	"thread/realtime/stop": "thread/realtime/stop",
	"thread/turns/list": "thread/turns/list",
};

function clientRequestParamExperimentalReason(
	method: string,
	params: Record<string, unknown>,
): string | null {
	switch (method) {
		case "thread/start":
			return (
				granularApprovalReason(params) ??
				presentFieldReason(params, "thread/start.permissions", "permissions") ??
				presentFieldReason(params, "thread/start.environments", "environments") ??
				presentFieldReason(params, "thread/start.dynamicTools", "dynamicTools", "dynamic_tools") ??
				presentFieldReason(params, "thread/start.mockExperimentalField", "mockExperimentalField", "mock_experimental_field") ??
				truthyFieldReason(params, "thread/start.experimentalRawEvents", "experimentalRawEvents", "experimental_raw_events") ??
				truthyFieldReason(params, "thread/start.persistFullHistory", "persistExtendedHistory", "persist_extended_history")
			);
		case "thread/resume":
			return (
				presentFieldReason(params, "thread/resume.history", "history") ??
				presentFieldReason(params, "thread/resume.path", "path") ??
				granularApprovalReason(params) ??
				presentFieldReason(params, "thread/resume.permissions", "permissions") ??
				truthyFieldReason(params, "thread/resume.excludeTurns", "excludeTurns", "exclude_turns") ??
				truthyFieldReason(params, "thread/resume.persistFullHistory", "persistExtendedHistory", "persist_extended_history")
			);
		case "thread/fork":
			return (
				presentFieldReason(params, "thread/fork.path", "path") ??
				granularApprovalReason(params) ??
				presentFieldReason(params, "thread/fork.permissions", "permissions") ??
				truthyFieldReason(params, "thread/fork.excludeTurns", "excludeTurns", "exclude_turns") ??
				truthyFieldReason(params, "thread/fork.persistFullHistory", "persistExtendedHistory", "persist_extended_history")
			);
		case "turn/start":
			return (
				presentFieldReason(params, "turn/start.responsesapiClientMetadata", "responsesapiClientMetadata", "responsesapi_client_metadata") ??
				presentFieldReason(params, "turn/start.environments", "environments") ??
				granularApprovalReason(params) ??
				presentFieldReason(params, "turn/start.permissions", "permissions") ??
				presentFieldReason(params, "turn/start.collaborationMode", "collaborationMode", "collaboration_mode")
			);
		case "turn/steer":
			return presentFieldReason(params, "turn/steer.responsesapiClientMetadata", "responsesapiClientMetadata", "responsesapi_client_metadata");
		case "command/exec":
			return presentFieldReason(params, "command/exec.permissionProfile", "permissionProfile", "permission_profile");
		case "account/login/start":
			return params.type === "chatgptAuthTokens"
				? "account/login/start.chatgptAuthTokens"
				: null;
		default:
			return null;
	}
}

function granularApprovalReason(params: Record<string, unknown>): string | null {
	const approvalPolicy = params.approvalPolicy ?? params.approval_policy;
	return isRecord(approvalPolicy) && "granular" in approvalPolicy
		? "askForApproval.granular"
		: null;
}

function presentFieldReason(
	params: Record<string, unknown>,
	reason: string,
	...fields: string[]
): string | null {
	for (const field of fields) {
		if (params[field] !== undefined && params[field] !== null) {
			return reason;
		}
	}
	return null;
}

function truthyFieldReason(
	params: Record<string, unknown>,
	reason: string,
	...fields: string[]
): string | null {
	for (const field of fields) {
		if (params[field] === true) {
			return reason;
		}
	}
	return null;
}

function objectParams(value: unknown): Record<string, unknown> {
	return typeof value === "object" && value !== null
		? (value as Record<string, unknown>)
		: {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function globalScope(key: string): ClientRequestSerializationScope {
	return { key, type: "global" };
}

function threadScope(
	params: Record<string, unknown>,
	...fields: string[]
): ClientRequestSerializationScope | null {
	const threadId = stringField(params, ...fields);
	return threadId ? { threadId, type: "thread" } : null;
}

function optionalThreadScope(
	params: Record<string, unknown>,
	...fields: string[]
): ClientRequestSerializationScope | null {
	return threadScope(params, ...fields);
}

function threadOrPathScope(
	params: Record<string, unknown>,
	threadField: string,
	pathField: string,
): ClientRequestSerializationScope | null {
	const threadId = stringField(params, threadField);
	if (threadId) {
		return { threadId, type: "thread" };
	}
	const path = stringField(params, pathField);
	if (path) {
		return { path, type: "threadPath" };
	}
	return threadId === "" ? { threadId, type: "thread" } : null;
}

function optionalCommandExecProcessScope(
	params: Record<string, unknown>,
	...fields: string[]
): ClientRequestSerializationScope | null {
	const processId = stringField(params, ...fields);
	return processId ? { processId, type: "commandExecProcess" } : null;
}

function commandExecProcessScope(
	params: Record<string, unknown>,
	...fields: string[]
): ClientRequestSerializationScope | null {
	const processId = stringField(params, ...fields);
	return processId ? { processId, type: "commandExecProcess" } : null;
}

function processHandleScope(
	params: Record<string, unknown>,
	...fields: string[]
): ClientRequestSerializationScope | null {
	const processHandle = stringField(params, ...fields);
	return processHandle ? { processHandle, type: "process" } : null;
}

function fuzzySessionScope(
	params: Record<string, unknown>,
	...fields: string[]
): ClientRequestSerializationScope | null {
	const sessionId = stringField(params, ...fields);
	return sessionId ? { sessionId, type: "fuzzyFileSearchSession" } : null;
}

function fsWatchScope(
	params: Record<string, unknown>,
	...fields: string[]
): ClientRequestSerializationScope | null {
	const watchId = stringField(params, ...fields);
	return watchId ? { watchId, type: "fsWatch" } : null;
}

function mcpOauthScope(
	params: Record<string, unknown>,
	...fields: string[]
): ClientRequestSerializationScope | null {
	const serverName = stringField(params, ...fields);
	return serverName ? { serverName, type: "mcpOauth" } : null;
}

function stringField(
	params: Record<string, unknown>,
	...fields: string[]
): string | null {
	for (const field of fields) {
		const value = params[field];
		if (typeof value === "string") {
			return value;
		}
	}
	return null;
}
