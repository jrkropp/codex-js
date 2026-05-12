import {
	normalizeRequestPermissionsArgs,
	REQUEST_PERMISSIONS_TOOL_NAME,
	type RequestPermissionsArgs,
} from "../../request_permissions";
import {
	FunctionCallError,
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../context";
import { ToolName } from "../tool_name";

export class RequestPermissionsHandler
	implements ToolHandler<FunctionToolOutput>
{
	toolName(): ToolName {
		return ToolName.plain(REQUEST_PERMISSIONS_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		const { session, turn, call_id, payload } = invocation;

		if (payload.type !== "function") {
			throw FunctionCallError.respondToModel(
				`${REQUEST_PERMISSIONS_TOOL_NAME} handler received unsupported payload`,
			);
		}

		let args: RequestPermissionsArgs;
		try {
			args = normalizeRequestPermissionsArgs(
				parseArguments<RequestPermissionsArgs>(payload.arguments),
			);
		} catch (error) {
			if (isFunctionCallError(error)) {
				throw error;
			}
			throw FunctionCallError.respondToModel(errorMessage(error));
		}
		const response = await session.request_permissions(turn, call_id, args);
		if (!response) {
			throw FunctionCallError.respondToModel(
				`${REQUEST_PERMISSIONS_TOOL_NAME} was cancelled before receiving a response`,
			);
		}

		try {
			return FunctionToolOutput.fromText(JSON.stringify(response), true);
		} catch (error) {
			throw FunctionCallError.fatal(
				`failed to serialize ${REQUEST_PERMISSIONS_TOOL_NAME} response: ${errorMessage(error)}`,
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

function isFunctionCallError(error: unknown): error is FunctionCallError {
	return (
		typeof error === "object" &&
		error !== null &&
		"kind" in error &&
		"message" in error
	);
}
