import { PLAN_TOOL_NAME } from "./plan";

export function create_update_plan_tool() {
	return {
		type: "function" as const,
		name: PLAN_TOOL_NAME,
		description:
			"Updates the task plan.\nProvide an optional explanation and a list of plan items, each with a step and status.\nAt most one step can be in_progress at a time.\n",
		strict: false,
		parameters: {
			type: "object",
			properties: {
				explanation: { type: "string" },
				plan: {
					type: "array",
					description: "The list of steps",
					items: {
						type: "object",
						properties: {
							step: { type: "string" },
							status: {
								type: "string",
								description: "One of: pending, in_progress, completed",
							},
						},
						required: ["step", "status"],
						additionalProperties: false,
					},
				},
			},
			required: ["plan"],
			additionalProperties: false,
		},
	};
}

export const create_plan_tool = create_update_plan_tool;
