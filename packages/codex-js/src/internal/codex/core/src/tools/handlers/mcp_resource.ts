import {
	FunctionCallError,
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
	type ToolPayload,
} from "../context";
import { ToolName } from "../tool_name";

export const LIST_MCP_RESOURCES_TOOL_NAME = "list_mcp_resources";
export const LIST_MCP_RESOURCE_TEMPLATES_TOOL_NAME =
	"list_mcp_resource_templates";
export const READ_MCP_RESOURCE_TOOL_NAME = "read_mcp_resource";

type ParsedArguments = Record<string, unknown> | null;

abstract class McpResourceHandler
	implements ToolHandler<FunctionToolOutput>
{
	abstract toolName(): ToolName;
	abstract handleFunctionCall(invocation: ToolInvocation): Promise<FunctionToolOutput>;

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		if (invocation.payload.type !== "function") {
			throw FunctionCallError.respondToModel(
				`${this.toolName().display()} handler received unsupported payload`,
			);
		}
		return this.handleFunctionCall(invocation);
	}
}

export class ListMcpResourcesHandler extends McpResourceHandler {
	toolName(): ToolName {
		return ToolName.plain(LIST_MCP_RESOURCES_TOOL_NAME);
	}

	async handleFunctionCall(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		const args = parseOptionalObjectArguments(invocation.payload);
		const server = normalize_optional_string(readString(args, "server"));
		const cursor = normalize_optional_string(readString(args, "cursor"));
		if (!server && cursor) {
			throw FunctionCallError.respondToModel(
				"cursor can only be used when a server is specified",
			);
		}

		const mcpInvocation = {
			server: server ?? "codex",
			tool: LIST_MCP_RESOURCES_TOOL_NAME,
			arguments: args,
		};
		await emit_mcp_resource_call_begin(invocation, mcpInvocation);
		const startedAt = Date.now();
		try {
			const result = await invocation.session.list_resources({
				thread_id: invocation.session.threadId,
				server_name: server,
				cursor,
			});
			const payload = {
				...(server ? { server } : {}),
				resources: result.resources.map((resource) =>
					"server" in resource ? resource : { server, ...resource },
				),
				...(result.next_cursor ? { nextCursor: result.next_cursor } : {}),
			};
			const output = serialize_function_output(payload);
			await emit_mcp_resource_call_end(invocation, mcpInvocation, startedAt, {
				success: true,
				result: output.intoText(),
			});
			return output;
		} catch (error) {
			await emit_mcp_resource_call_end(invocation, mcpInvocation, startedAt, {
				success: false,
				error: errorMessage(error),
			});
			throw toRespondToModel("resources/list failed", error);
		}
	}
}

export class ListMcpResourceTemplatesHandler extends McpResourceHandler {
	toolName(): ToolName {
		return ToolName.plain(LIST_MCP_RESOURCE_TEMPLATES_TOOL_NAME);
	}

	async handleFunctionCall(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		const args = parseOptionalObjectArguments(invocation.payload);
		const server = normalize_optional_string(readString(args, "server"));
		const cursor = normalize_optional_string(readString(args, "cursor"));
		if (!server && cursor) {
			throw FunctionCallError.respondToModel(
				"cursor can only be used when a server is specified",
			);
		}

		const mcpInvocation = {
			server: server ?? "codex",
			tool: LIST_MCP_RESOURCE_TEMPLATES_TOOL_NAME,
			arguments: args,
		};
		await emit_mcp_resource_call_begin(invocation, mcpInvocation);
		const startedAt = Date.now();
		try {
			const result = await invocation.session.list_resource_templates({
				thread_id: invocation.session.threadId,
				server_name: server,
				cursor,
			});
			const payload = {
				...(server ? { server } : {}),
				resourceTemplates: result.resource_templates.map((template) =>
					"server" in template ? template : { server, ...template },
				),
				...(result.next_cursor ? { nextCursor: result.next_cursor } : {}),
			};
			const output = serialize_function_output(payload);
			await emit_mcp_resource_call_end(invocation, mcpInvocation, startedAt, {
				success: true,
				result: output.intoText(),
			});
			return output;
		} catch (error) {
			await emit_mcp_resource_call_end(invocation, mcpInvocation, startedAt, {
				success: false,
				error: errorMessage(error),
			});
			throw toRespondToModel("resources/templates/list failed", error);
		}
	}
}

export class ReadMcpResourceHandler extends McpResourceHandler {
	toolName(): ToolName {
		return ToolName.plain(READ_MCP_RESOURCE_TOOL_NAME);
	}

	async handleFunctionCall(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		const args = parseRequiredObjectArguments(invocation.payload);
		const server = normalize_required_string("server", readString(args, "server"));
		const uri = normalize_required_string("uri", readString(args, "uri"));
		const mcpInvocation = {
			server,
			tool: READ_MCP_RESOURCE_TOOL_NAME,
			arguments: args,
		};
		await emit_mcp_resource_call_begin(invocation, mcpInvocation);
		const startedAt = Date.now();
		try {
			const result = await invocation.session.read_resource(invocation.turn, {
				thread_id: invocation.session.threadId,
				server_name: server,
				uri,
			});
			const output = serialize_function_output({
				server,
				uri,
				contents: result.contents,
			});
			await emit_mcp_resource_call_end(invocation, mcpInvocation, startedAt, {
				success: true,
				result: output.intoText(),
			});
			return output;
		} catch (error) {
			await emit_mcp_resource_call_end(invocation, mcpInvocation, startedAt, {
				success: false,
				error: errorMessage(error),
			});
			throw toRespondToModel("resources/read failed", error);
		}
	}
}

function parseOptionalObjectArguments(payload: ToolPayload): ParsedArguments {
	if (payload.type !== "function") {
		return null;
	}
	const raw = payload.arguments.trim();
	if (!raw || raw === "null") {
		return null;
	}
	const parsed = parseJson(raw);
	if (parsed === null) {
		return null;
	}
	if (!isRecord(parsed)) {
		throw FunctionCallError.respondToModel(
			"failed to parse function arguments: expected object",
		);
	}
	return parsed;
}

function parseRequiredObjectArguments(payload: ToolPayload): Record<string, unknown> {
	const parsed = parseOptionalObjectArguments(payload);
	if (!parsed) {
		throw FunctionCallError.respondToModel(
			"failed to parse function arguments: expected value",
		);
	}
	return parsed;
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch (error) {
		throw FunctionCallError.respondToModel(
			`failed to parse function arguments: ${errorMessage(error)}`,
		);
	}
}

function readString(args: ParsedArguments, key: string): string | null {
	const value = args?.[key];
	return typeof value === "string" ? value : null;
}

function normalize_optional_string(value: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : null;
}

function normalize_required_string(field: string, value: string | null): string {
	const normalized = normalize_optional_string(value);
	if (!normalized) {
		throw FunctionCallError.respondToModel(`${field} must be provided`);
	}
	return normalized;
}

function serialize_function_output(payload: unknown): FunctionToolOutput {
	try {
		return FunctionToolOutput.fromText(JSON.stringify(payload), true);
	} catch (error) {
		throw FunctionCallError.respondToModel(
			`failed to serialize MCP resource response: ${errorMessage(error)}`,
		);
	}
}

async function emit_mcp_resource_call_begin(
	invocation: ToolInvocation,
	mcpInvocation: { server: string; tool: string; arguments: ParsedArguments },
): Promise<void> {
	await invocation.session.send_event(invocation.turn, {
		type: "item_started",
		turn_id: invocation.turn.sub_id,
		item: {
			type: "McpToolCall",
			id: invocation.call_id,
			server: mcpInvocation.server,
			tool: mcpInvocation.tool,
			arguments: mcpInvocation.arguments ?? {},
			status: "inProgress",
		},
	});
}

async function emit_mcp_resource_call_end(
	invocation: ToolInvocation,
	mcpInvocation: { server: string; tool: string; arguments: ParsedArguments },
	startedAt: number,
	result:
		| { success: true; result: string }
		| { success: false; error: string },
): Promise<void> {
	await invocation.session.send_event(invocation.turn, {
		type: "item_completed",
		turn_id: invocation.turn.sub_id,
		item: {
			type: "McpToolCall",
			id: invocation.call_id,
			server: mcpInvocation.server,
			tool: mcpInvocation.tool,
			arguments: mcpInvocation.arguments ?? {},
			status: result.success ? "completed" : "failed",
			...(result.success ? { result: result.result } : { error: { message: result.error } }),
			duration: `${Math.max(0, Date.now() - startedAt)}ms`,
		},
	});
}

function toRespondToModel(prefix: string, error: unknown): FunctionCallError {
	if (error instanceof FunctionCallError) {
		return error;
	}
	return FunctionCallError.respondToModel(`${prefix}: ${errorMessage(error)}`);
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
