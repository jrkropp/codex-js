import { ThreadGoalStatus } from "../../protocol";
import {
	CREATE_GOAL_TOOL_NAME,
	GET_GOAL_TOOL_NAME,
	UPDATE_GOAL_TOOL_NAME,
} from "./goal";

export function create_get_goal_tool() {
	return {
		type: "function" as const,
		name: GET_GOAL_TOOL_NAME,
		description:
			"Get the current goal for this thread, including status, budgets, token and elapsed-time usage, and remaining token budget.",
		strict: false,
		parameters: {
			type: "object",
			properties: {},
			required: [],
			additionalProperties: false,
		},
	};
}

export function create_create_goal_tool() {
	return {
		type: "function" as const,
		name: CREATE_GOAL_TOOL_NAME,
		description:
			`Create a goal only when explicitly requested by the user or system/developer instructions; do not infer goals from ordinary tasks.
Set token_budget only when an explicit token budget is requested. Fails if a goal exists; use ${UPDATE_GOAL_TOOL_NAME} only for status.`,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				objective: {
					type: "string",
					description:
						"Required. The concrete objective to start pursuing. This starts a new active goal only when no goal is currently defined; if a goal already exists, this tool fails.",
				},
				token_budget: {
					type: "integer",
					description: "Optional positive token budget for the new active goal.",
				},
			},
			required: ["objective"],
			additionalProperties: false,
		},
	};
}

export function create_update_goal_tool() {
	return {
		type: "function" as const,
		name: UPDATE_GOAL_TOOL_NAME,
		description:
			"Update the existing goal.\nUse this tool only to mark the goal achieved.\nSet status to `complete` only when the objective has actually been achieved and no required work remains.\nDo not mark a goal complete merely because its budget is nearly exhausted or because you are stopping work.\nYou cannot use this tool to pause, resume, or budget-limit a goal; those status changes are controlled by the user or system.\nWhen marking a budgeted goal achieved with status `complete`, report the final token usage from the tool result to the user.",
		strict: false,
		parameters: {
			type: "object",
			properties: {
				status: {
					type: "string",
					enum: [ThreadGoalStatus.Complete],
					description:
						"Required. Set to complete only when the objective is achieved and no required work remains.",
				},
			},
			required: ["status"],
			additionalProperties: false,
		},
	};
}
