import type {
	RequestId,
	ServerRequest,
} from "../../app-server-protocol/schema/typescript";
import type {
	DynamicToolCallResponse,
	McpServerElicitationRequestResponse,
	PermissionsRequestApprovalResponse,
	ToolRequestUserInputResponse,
} from "../../app-server-protocol/schema/typescript/v2";
import type { Submission } from "../../core/src/protocol";
import { coreDynamicToolResponseFromAppServerResponse } from "./dynamic_tools";
import type { JSONRPCErrorError } from "../../app-server-client/src/lib";

export type ServerRequestResponseTarget =
	| { responseId: string; type: "user_input" }
	| { callId: string; type: "request_permissions" }
	| { callId: string; type: "dynamic_tool" }
	| { requestId: string | number; serverName: string; type: "mcp_elicitation" };

export function submissionFromServerRequestResult(input: {
	request: ServerRequest | null;
	requestId: RequestId;
	result: unknown;
	target?: ServerRequestResponseTarget | null;
}): Submission {
	const target = input.target ?? targetFromServerRequest(input.request);
	const request = input.request;
	if (isSubmissionOp(input.result)) {
		throw unsupportedServerRequestResponse(request);
	}
	if (target?.type === "request_permissions") {
		return {
			id: `server-request-response-${String(input.requestId)}`,
			op: {
				id: target.callId,
				response: corePermissionsResponse(
					input.result as PermissionsRequestApprovalResponse,
				),
				type: "request_permissions_response",
			},
		};
	}
	if (target?.type === "dynamic_tool") {
		return {
			id: `server-request-response-${String(input.requestId)}`,
			op: {
				id: target.callId,
				response: coreDynamicToolResponse(input.result as DynamicToolCallResponse),
				type: "dynamic_tool_response",
			},
		};
	}
	if (target?.type === "mcp_elicitation") {
		return {
			id: `server-request-response-${String(input.requestId)}`,
			op: {
				id: target.requestId,
				response: coreMcpElicitationResponse(
					input.result as McpServerElicitationRequestResponse,
				),
				server_name: target.serverName,
				type: "mcp_server_elicitation_response",
			},
		};
	}
	if (target?.type === "user_input") {
		return {
			id: `server-request-response-${String(input.requestId)}`,
			op: {
				id: target.responseId,
				response: coreToolRequestUserInputResponse(
					input.result as ToolRequestUserInputResponse,
				),
				type: "user_input_answer",
			},
		};
	}
	throw unsupportedServerRequestResponse(request);
}

function coreDynamicToolResponse(response: DynamicToolCallResponse) {
	return coreDynamicToolResponseFromAppServerResponse(response);
}

function corePermissionsResponse(response: PermissionsRequestApprovalResponse) {
	return {
		permissions: response.permissions as never,
		scope: response.scope as never,
		strict_auto_review: response.strictAutoReview,
	};
}

function coreMcpElicitationResponse(
	response: McpServerElicitationRequestResponse,
) {
	return {
		action: response.action,
		content: response.content ?? undefined,
		meta: response._meta ?? undefined,
	};
}

export function submissionFromServerRequestError(input: {
	error: JSONRPCErrorError;
	request: ServerRequest | null;
	requestId: RequestId;
	target?: ServerRequestResponseTarget | null;
}): Submission {
	const target = input.target ?? targetFromServerRequest(input.request);
	const requestId = String(input.requestId);
	if (target?.type === "dynamic_tool") {
		return {
			id: `server-request-rejection-${requestId}`,
			op: {
				id: target.callId,
				response: {
					content_items: [
						{
							text: input.error.message,
							type: "inputText",
						},
					],
					success: false,
				},
				type: "dynamic_tool_response",
			},
		};
	}
	if (target?.type === "request_permissions") {
		return {
			id: `server-request-rejection-${requestId}`,
			op: {
				id: target.callId,
				response: {
					permissions: {},
				},
				type: "request_permissions_response",
			},
		};
	}
	if (target?.type === "user_input") {
		return {
			id: `server-request-rejection-${requestId}`,
			op: {
				id: target.responseId,
				response: { answers: {} },
				type: "user_input_answer",
			},
		};
	}
	if (target?.type === "mcp_elicitation") {
		return {
			id: `server-request-rejection-${requestId}`,
			op: {
				id: target.requestId,
				response: {
					action: "cancel",
					content: undefined,
					meta: undefined,
				},
				server_name: target.serverName,
				type: "mcp_server_elicitation_response",
			},
		};
	}
	throw unsupportedServerRequestResponse(input.request);
}

function coreToolRequestUserInputResponse(
	response: ToolRequestUserInputResponse,
) {
	const answers: Record<string, { answers: string[] }> = {};
	for (const [key, value] of Object.entries(response.answers)) {
		if (value) {
			answers[key] = value;
		}
	}
	return { answers };
}

export function isServerRequestResponseSubmission(
	submission: Submission,
): boolean {
	return (
		submission.op.type === "dynamic_tool_response" ||
		submission.op.type === "mcp_server_elicitation_response" ||
		submission.op.type === "request_permissions_response" ||
		submission.op.type === "user_input_answer"
	);
}

function isSubmissionOp(value: unknown): value is Submission["op"] {
	return (
		typeof value === "object" &&
		value !== null &&
		"type" in value &&
		typeof (value as { type?: unknown }).type === "string" &&
		isServerRequestResponseSubmission({ id: "response", op: value as Submission["op"] })
	);
}

function targetFromServerRequest(
	request: ServerRequest | null,
): ServerRequestResponseTarget | null {
	if (!request) {
		return null;
	}
	switch (request.method) {
		case "item/tool/requestUserInput":
			return {
				type: "user_input",
				responseId: request.params.turnId,
			};
		case "item/permissions/requestApproval":
			return {
				type: "request_permissions",
				callId: request.params.itemId,
			};
			case "item/tool/call":
				return { type: "dynamic_tool", callId: request.params.callId };
		case "mcpServer/elicitation/request":
			return "elicitationId" in request.params
				? {
						type: "mcp_elicitation",
						serverName: request.params.serverName,
						requestId: request.params.elicitationId,
					}
				: null;
		default:
			return null;
	}
}

function unsupportedServerRequestResponse(request: ServerRequest | null): never {
	throw new Error(
		`Unsupported Codex server-request response: ${request?.method ?? "unknown"}`,
	);
}
