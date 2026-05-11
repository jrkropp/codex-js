import {
	normalizeRequestUserInputArgs,
	REQUEST_USER_INPUT_TOOL_NAME,
	requestUserInputUnavailableMessage,
	type RequestUserInputArgs,
} from "../../request_user_input";
import {
	FunctionCallError,
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../context";
import { ToolName } from "../tool_name";
import type { ModeKind } from "../../config-types";

export type RequestUserInputHandlerParams = {
	available_modes: ModeKind[];
};

export class RequestUserInputHandler
	implements ToolHandler<FunctionToolOutput>
{
	constructor(private readonly params: RequestUserInputHandlerParams) {}

	toolName(): ToolName {
		return ToolName.plain(REQUEST_USER_INPUT_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		const { session, turn, call_id, payload } = invocation;

		if (payload.type !== "function") {
			throw FunctionCallError.respondToModel(
				`${REQUEST_USER_INPUT_TOOL_NAME} handler received unsupported payload`,
			);
		}

		if (is_non_root_agent(turn.session_source)) {
			throw FunctionCallError.respondToModel(
				"request_user_input can only be used by the root thread",
			);
		}

		const mode = session.collaboration_mode().mode;
		const unavailableMessage = requestUserInputUnavailableMessage(
			mode,
			this.params.available_modes,
		);
		if (unavailableMessage) {
			throw FunctionCallError.respondToModel(unavailableMessage);
		}

		const args = normalizeRequestUserInputArgs(
			parseArguments<RequestUserInputArgs>(payload.arguments),
		);
		const response = await session.request_user_input(turn, call_id, args);
		if (!response) {
			throw FunctionCallError.respondToModel(
				`${REQUEST_USER_INPUT_TOOL_NAME} was cancelled before receiving a response`,
			);
		}

		try {
			return FunctionToolOutput.fromText(JSON.stringify(response), true);
		} catch (error) {
			throw FunctionCallError.fatal(
				`failed to serialize ${REQUEST_USER_INPUT_TOOL_NAME} response: ${errorMessage(error)}`,
			);
		}
	}
}

function parseArguments<T>(argumentsJson: string): T {
	try {
		return JSON.parse(argumentsJson) as T;
	} catch (error) {
		throw FunctionCallError.respondToModel(
			`failed to parse function arguments: ${errorMessage(error)}`,
		);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function is_non_root_agent(session_source: unknown): boolean {
	if (typeof session_source === "string") {
		return session_source === "thread_spawn" || session_source === "sub_agent";
	}
	if (typeof session_source !== "object" || session_source === null) {
		return false;
	}
	const source = session_source as Record<string, unknown>;
	return (
		source.type === "thread_spawn" ||
		"sub_agent" in source ||
		("parent_thread_id" in source && "depth" in source)
	);
}
