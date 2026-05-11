import {
	FunctionCallError,
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../context";
import { ModeKind } from "../../config-types";
import type { UpdatePlanArgs } from "../../protocol";
import { ToolName } from "../tool_name";

export const PLAN_TOOL_NAME = "update_plan";

export class PlanHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(PLAN_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		const { session, turn, payload } = invocation;
		if (payload.type !== "function") {
			throw FunctionCallError.respondToModel(
				"update_plan handler received unsupported payload",
			);
		}

		if (turn.collaboration_mode?.mode === ModeKind.Plan) {
			throw FunctionCallError.respondToModel(
				"update_plan is a TODO/checklist tool and is not allowed in Plan mode",
			);
		}

		const args = parseUpdatePlanArguments(payload.arguments);
		await session.send_event(turn, {
			type: "plan_update",
			explanation: args.explanation ?? null,
			plan: args.plan,
		});
		return FunctionToolOutput.fromText("Plan updated", true);
	}
}

function parseUpdatePlanArguments(argumentsJson: string): UpdatePlanArgs {
	try {
		const parsed = JSON.parse(argumentsJson) as UpdatePlanArgs;
		if (!Array.isArray(parsed.plan)) {
			throw new Error("missing field `plan`");
		}
		for (const item of parsed.plan) {
			if (
				typeof item?.step !== "string" ||
				(item.status !== "pending" &&
					item.status !== "in_progress" &&
					item.status !== "completed")
			) {
				throw new Error("invalid plan item");
			}
		}
		return parsed;
	} catch (error) {
		throw FunctionCallError.respondToModel(
			`failed to parse function arguments: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}
