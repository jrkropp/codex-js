import type {
	RequestId,
	ServerRequest,
} from "../../app-server-protocol/schema/typescript";
import type {
	CommandExecutionRequestApprovalResponse,
	DynamicToolCallResponse,
	FileChangeRequestApprovalResponse,
	McpServerElicitationRequestResponse,
	PermissionsRequestApprovalResponse,
	ToolRequestUserInputResponse,
} from "../../app-server-protocol/schema/typescript/v2";
import type { Result } from "./lib";

export type AppServerRequestResolution = {
	requestId: RequestId;
	result: Result;
};

export type UnsupportedAppServerRequest = {
	message: string;
	requestId: RequestId;
};

export type ResolvedAppServerRequest =
	| { id: string; type: "exec_approval" }
	| { id: string; type: "file_change_approval" }
	| { id: string; type: "permissions_approval" }
	| { itemId: string; type: "user_input" }
	| { requestId: RequestId; serverName: string; type: "mcp_elicitation" }
	| { callId: string; type: "dynamic_tool_call" };

type PendingUserInputRequest = {
	itemId: string;
	requestId: RequestId;
};

type McpRequestKey = `${string}:${string | number}`;

export class PendingAppServerRequests {
	private readonly dynamicToolCalls = new Map<string, RequestId>();
	private readonly execApprovals = new Map<string, RequestId>();
	private readonly fileChangeApprovals = new Map<string, RequestId>();
	private readonly mcpRequests = new Map<McpRequestKey, RequestId>();
	private readonly permissionsApprovals = new Map<string, RequestId>();
	private readonly userInputs = new Map<string, PendingUserInputRequest[]>();

	clear(): void {
		this.dynamicToolCalls.clear();
		this.execApprovals.clear();
		this.fileChangeApprovals.clear();
		this.mcpRequests.clear();
		this.permissionsApprovals.clear();
		this.userInputs.clear();
	}

	noteServerRequest(request: ServerRequest): UnsupportedAppServerRequest | null {
		switch (request.method) {
			case "item/commandExecution/requestApproval": {
				const id = request.params.approvalId ?? request.params.itemId;
				this.execApprovals.set(id, request.id);
				return null;
			}
			case "item/fileChange/requestApproval":
				this.fileChangeApprovals.set(request.params.itemId, request.id);
				return null;
			case "item/permissions/requestApproval":
				this.permissionsApprovals.set(request.params.itemId, request.id);
				return null;
			case "item/tool/requestUserInput": {
				const queue = this.userInputs.get(request.params.turnId) ?? [];
				queue.push({
					itemId: request.params.itemId,
					requestId: request.id,
				});
				this.userInputs.set(request.params.turnId, queue);
				return null;
			}
			case "mcpServer/elicitation/request":
				this.mcpRequests.set(
					mcpRequestKey(request.params.serverName, request.id),
					request.id,
				);
				return null;
			case "item/tool/call":
				this.dynamicToolCalls.set(request.params.callId, request.id);
				return null;
			default:
				return {
					message: `Unsupported Codex app-server request: ${request.method}`,
					requestId: request.id,
				};
		}
	}

	takeCommandExecutionApprovalResolution(
		id: string,
		response: CommandExecutionRequestApprovalResponse,
	): AppServerRequestResolution | null {
		return takeMapResolution(this.execApprovals, id, response);
	}

	takeFileChangeApprovalResolution(
		id: string,
		response: FileChangeRequestApprovalResponse,
	): AppServerRequestResolution | null {
		return takeMapResolution(this.fileChangeApprovals, id, response);
	}

	takePermissionsApprovalResolution(
		id: string,
		response: PermissionsRequestApprovalResponse,
	): AppServerRequestResolution | null {
		return takeMapResolution(this.permissionsApprovals, id, response);
	}

	takeDynamicToolCallResolution(
		callId: string,
		response: DynamicToolCallResponse,
	): AppServerRequestResolution | null {
		return takeMapResolution(this.dynamicToolCalls, callId, response);
	}

	takeUserInputResolution(
		turnId: string,
		response: ToolRequestUserInputResponse,
	): AppServerRequestResolution | null {
		const pending = this.popUserInputRequestForTurn(turnId);
		return pending ? { requestId: pending.requestId, result: response } : null;
	}

	takeMcpElicitationResolution(
		serverName: string,
		requestId: RequestId,
		response: McpServerElicitationRequestResponse,
	): AppServerRequestResolution | null {
		return takeMapResolution(
			this.mcpRequests,
			mcpRequestKey(serverName, requestId),
			response,
		);
	}

	resolveNotification(requestId: RequestId): ResolvedAppServerRequest | null {
		const execApproval = removeValue(this.execApprovals, requestId);
		if (execApproval) {
			return { id: execApproval, type: "exec_approval" };
		}
		const fileChangeApproval = removeValue(
			this.fileChangeApprovals,
			requestId,
		);
		if (fileChangeApproval) {
			return { id: fileChangeApproval, type: "file_change_approval" };
		}
		const permissionsApproval = removeValue(
			this.permissionsApprovals,
			requestId,
		);
		if (permissionsApproval) {
			return { id: permissionsApproval, type: "permissions_approval" };
		}
		const userInput = this.removeUserInputRequest(requestId);
		if (userInput) {
			return { itemId: userInput.itemId, type: "user_input" };
		}
		const dynamicToolCall = removeValue(this.dynamicToolCalls, requestId);
		if (dynamicToolCall) {
			return { callId: dynamicToolCall, type: "dynamic_tool_call" };
		}
		const mcpRequest = removeValue(this.mcpRequests, requestId);
		if (mcpRequest) {
			const [serverName] = mcpRequest.split(":");
			return { requestId, serverName, type: "mcp_elicitation" };
		}
		return null;
	}

	containsServerRequest(request: ServerRequest): boolean {
		return this.requestIds().some((requestId) => requestId === request.id);
	}

	private requestIds(): RequestId[] {
		return [
			...this.execApprovals.values(),
			...this.fileChangeApprovals.values(),
			...this.permissionsApprovals.values(),
			...this.dynamicToolCalls.values(),
			...this.mcpRequests.values(),
			...Array.from(this.userInputs.values()).flatMap((queue) =>
				queue.map((request) => request.requestId),
			),
		];
	}

	private popUserInputRequestForTurn(
		turnId: string,
	): PendingUserInputRequest | null {
		const queue = this.userInputs.get(turnId);
		const pending = queue?.shift() ?? null;
		if (queue && queue.length === 0) {
			this.userInputs.delete(turnId);
		}
		return pending;
	}

	private removeUserInputRequest(
		requestId: RequestId,
	): PendingUserInputRequest | null {
		for (const [turnId, queue] of this.userInputs) {
			const index = queue.findIndex((pending) => pending.requestId === requestId);
			if (index === -1) {
				continue;
			}
			const [pending] = queue.splice(index, 1);
			if (queue.length === 0) {
				this.userInputs.delete(turnId);
			}
			return pending ?? null;
		}
		return null;
	}
}

function takeMapResolution<K>(
	map: Map<K, RequestId>,
	key: K,
	result: Result,
): AppServerRequestResolution | null {
	const requestId = map.get(key);
	if (requestId === undefined) {
		return null;
	}
	map.delete(key);
	return { requestId, result };
}

function removeValue<K>(map: Map<K, RequestId>, value: RequestId): K | null {
	for (const [key, current] of map) {
		if (current === value) {
			map.delete(key);
			return key;
		}
	}
	return null;
}

function mcpRequestKey(
	serverName: string,
	requestId: RequestId,
): McpRequestKey {
	return `${serverName}:${requestId}`;
}
