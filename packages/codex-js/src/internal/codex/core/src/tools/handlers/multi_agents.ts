import {
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../context";
import { ToolName } from "../tool_name";

export const SPAWN_AGENT_TOOL_NAME = "spawn_agent";
export const SEND_INPUT_TOOL_NAME = "send_input";
export const WAIT_AGENT_TOOL_NAME = "wait_agent";
export const CLOSE_AGENT_TOOL_NAME = "close_agent";
export const RESUME_AGENT_TOOL_NAME = "resume_agent";
export const LIST_AGENTS_TOOL_NAME = "list_agents";
export const SEND_MESSAGE_TOOL_NAME = "send_message";
export const FOLLOWUP_TASK_TOOL_NAME = "followup_task";

const MULTI_AGENT_UNAVAILABLE =
	"multi-agent execution is unavailable in this Codex assistant runtime; a Worker-backed agent executor is required.";

export class SpawnAgentHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(SPAWN_AGENT_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		parseFunctionArgs(invocation);
		return FunctionToolOutput.fromText(MULTI_AGENT_UNAVAILABLE, false);
	}
}

export class SendInputHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(SEND_INPUT_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		parseFunctionArgs(invocation);
		return FunctionToolOutput.fromText(MULTI_AGENT_UNAVAILABLE, false);
	}
}

export class WaitAgentHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(WAIT_AGENT_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		parseFunctionArgs(invocation);
		return FunctionToolOutput.fromText(MULTI_AGENT_UNAVAILABLE, false);
	}
}

export class CloseAgentHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(CLOSE_AGENT_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		parseFunctionArgs(invocation);
		return FunctionToolOutput.fromText(MULTI_AGENT_UNAVAILABLE, false);
	}
}

export class ResumeAgentHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(RESUME_AGENT_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		parseFunctionArgs(invocation);
		return FunctionToolOutput.fromText(MULTI_AGENT_UNAVAILABLE, false);
	}
}

export class ListAgentsHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(LIST_AGENTS_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		parseFunctionArgs(invocation);
		return FunctionToolOutput.fromText(
			JSON.stringify({ agents: invocation.session.agentControl().list_agents() }),
			true,
		);
	}
}

export class SendMessageHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(SEND_MESSAGE_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		parseFunctionArgs(invocation);
		return FunctionToolOutput.fromText(MULTI_AGENT_UNAVAILABLE, false);
	}
}

export class FollowupTaskHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(FOLLOWUP_TASK_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		parseFunctionArgs(invocation);
		return FunctionToolOutput.fromText(MULTI_AGENT_UNAVAILABLE, false);
	}
}

function parseFunctionArgs(invocation: ToolInvocation): unknown {
	if (invocation.payload.type !== "function") {
		return {};
	}
	try {
		return JSON.parse(invocation.payload.arguments || "{}");
	} catch {
		return {};
	}
}
