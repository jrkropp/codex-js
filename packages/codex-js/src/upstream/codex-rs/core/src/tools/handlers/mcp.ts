import {
	mcpToolCallableName,
	mcpToolCallableNamespace,
	type McpToolInfo,
} from "../../mcp";
import {
	FunctionCallError,
	McpToolOutput,
	type ToolHandler,
	type ToolInvocation,
	ToolKind,
	type ToolPayload,
} from "../context";
import { ToolName, type ToolNameInput } from "../tool_name";

export class McpToolHandler implements ToolHandler<McpToolOutput> {
	private readonly name: ToolName;

	constructor(readonly tool: McpToolInfo) {
		this.name = ToolName.namespaced(
			mcpToolCallableNamespace(tool),
			mcpToolCallableName(tool),
		);
	}

	toolName(): ToolNameInput {
		return this.name;
	}

	kind(): ToolKind {
		return ToolKind.Mcp;
	}

	matchesKind(payload: ToolPayload): boolean {
		return payload.type === "mcp";
	}

	preToolUsePayload(invocation: ToolInvocation) {
		return {
			tool_name: this.name.display(),
			tool_input: mcpArgumentsFromPayload(invocation.payload),
		};
	}

	postToolUsePayload(invocation: ToolInvocation, result: McpToolOutput) {
		return {
			tool_name: this.name.display(),
			tool_use_id: invocation.call_id,
			tool_input: mcpArgumentsFromPayload(invocation.payload),
			tool_response: result.result,
		};
	}

	async handle(invocation: ToolInvocation): Promise<McpToolOutput> {
		try {
			const startedAt = Date.now();
			const toolInput = mcpArgumentsFromPayload(invocation.payload);
			const response = await invocation.session.call_tool(invocation.turn, {
				thread_id: invocation.session.threadId,
				call_id: invocation.call_id,
				server_name: this.tool.server_name,
				tool_name: this.tool.name,
				arguments: toolInput,
			});
			return new McpToolOutput(
				response.output,
				toolInput,
				Math.max(0, Date.now() - startedAt),
				true,
				invocation.turn.truncation_policy,
			);
		} catch (error) {
			throw FunctionCallError.respondToModel(
				error instanceof Error
					? error.message
					: `MCP tool is unavailable: ${this.name.display()}`,
			);
		}
	}
}

export function mcpArgumentsFromPayload(payload: ToolPayload): unknown {
	if (payload.type === "mcp") {
		return parseJsonOrRaw(payload.raw_arguments);
	}
	if (payload.type === "function") {
		return parseJsonOrRaw(payload.arguments);
	}
	return {};
}

function parseJsonOrRaw(value: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}
