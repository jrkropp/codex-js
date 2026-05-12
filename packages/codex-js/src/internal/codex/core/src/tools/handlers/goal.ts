import { goalToolOutput, type CreateGoalRequest } from "../../goals";
import { ThreadGoalStatus } from "../../protocol";
import {
	FunctionCallError,
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../context";
import { ToolName } from "../tool_name";

export const GET_GOAL_TOOL_NAME = "get_goal";
export const CREATE_GOAL_TOOL_NAME = "create_goal";
export const UPDATE_GOAL_TOOL_NAME = "update_goal";

export class GetGoalHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(GET_GOAL_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		if (invocation.payload.type !== "function") {
			throw FunctionCallError.respondToModel("get_goal handler received unsupported payload");
		}
		return FunctionToolOutput.fromText(
			JSON.stringify(goalToolOutput(await invocation.session.get_thread_goal())),
			true,
		);
	}
}

export class CreateGoalHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(CREATE_GOAL_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		if (invocation.payload.type !== "function") {
			throw FunctionCallError.respondToModel("create_goal handler received unsupported payload");
		}
		const args = parseArguments<CreateGoalRequest>(invocation.payload.arguments);
		const goal = await invocation.session.create_thread_goal(invocation.turn, {
			objective: String(args.objective ?? ""),
			token_budget: args.token_budget ?? null,
		});
		return FunctionToolOutput.fromText(JSON.stringify(goalToolOutput(goal)), true);
	}
}

export class UpdateGoalHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(UPDATE_GOAL_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		if (invocation.payload.type !== "function") {
			throw FunctionCallError.respondToModel("update_goal handler received unsupported payload");
		}
		const args = parseArguments<{ status?: unknown }>(invocation.payload.arguments);
		if (args.status !== ThreadGoalStatus.Complete) {
			throw FunctionCallError.respondToModel(
				"update_goal can only mark the existing goal complete; pause, resume, and budget-limited status changes are controlled by the user or system",
			);
		}
		const goal = await invocation.session.update_thread_goal_complete(invocation.turn);
		return FunctionToolOutput.fromText(JSON.stringify(goalToolOutput(goal)), true);
	}
}

function parseArguments<T>(argumentsJson: string): T {
	try {
		return JSON.parse(argumentsJson) as T;
	} catch (error) {
		throw FunctionCallError.respondToModel(
			`failed to parse function arguments: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}
