import { ModeKind, type CollaborationMode } from "./config-types";
import type { ToolSpec } from "./tools/tool_spec";

export const REQUEST_USER_INPUT_TOOL_NAME = "request_user_input";

export type RequestUserInputQuestionOption = {
	label: string;
	description: string;
};

export type RequestUserInputQuestion = {
	id: string;
	header: string;
	question: string;
	isOther?: boolean;
	isSecret?: boolean;
	options?: RequestUserInputQuestionOption[];
};

export type NormalizedRequestUserInputQuestion = {
	id: string;
	header: string;
	question: string;
	isOther: boolean;
	isSecret: boolean;
	options: RequestUserInputQuestionOption[];
};

export type RequestUserInputArgs = {
	questions: RequestUserInputQuestion[];
};

export type NormalizedRequestUserInputArgs = {
	questions: NormalizedRequestUserInputQuestion[];
};

export type RequestUserInputAnswer = {
	answers: string[];
};

export type RequestUserInputResponse = {
	answers: Record<string, RequestUserInputAnswer>;
};

export type RequestUserInputEvent = {
	/** Responses API call id for the associated tool call, if available. */
	call_id: string;
	/** Turn id that this request belongs to. */
	turn_id: string;
	questions: NormalizedRequestUserInputQuestion[];
};

export function normalizeRequestUserInputArgs(
	args: RequestUserInputArgs,
): NormalizedRequestUserInputArgs {
	return {
		questions: args.questions.map((question) => {
			const options = question.options;
			if (!options || options.length === 0) {
				throw new Error(
					"request_user_input requires non-empty options for every question",
				);
			}

			return {
				...question,
				isOther: true,
				isSecret: question.isSecret ?? false,
				options: options.map((option) => ({ ...option })),
			};
		}),
	};
}

export function requestUserInputAvailableModes(): ModeKind[] {
	return [ModeKind.Plan];
}

export function createRequestUserInputTool(description: string): ToolSpec {
	return {
		type: "function",
		name: REQUEST_USER_INPUT_TOOL_NAME,
		description,
		strict: false,
		parameters: {
			type: "object",
			properties: {
				questions: {
					type: "array",
					description: "Questions to show the user. Prefer 1 and do not exceed 3",
					items: {
						type: "object",
						properties: {
							id: {
								type: "string",
								description: "Stable identifier for mapping answers (snake_case).",
							},
							header: {
								type: "string",
								description:
									"Short header label shown in the UI (12 or fewer chars).",
							},
							question: {
								type: "string",
								description: "Single-sentence prompt shown to the user.",
							},
							options: {
								type: "array",
								description:
									'Provide 2-3 mutually exclusive choices. Put the recommended option first and suffix its label with "(Recommended)". Do not include an "Other" option in this list; the client will add a free-form "Other" option automatically.',
								items: {
									type: "object",
									properties: {
										label: {
											type: "string",
											description: "User-facing label (1-5 words).",
										},
										description: {
											type: "string",
											description:
												"One short sentence explaining impact/tradeoff if selected.",
										},
									},
									required: ["label", "description"],
									additionalProperties: false,
								},
							},
						},
						required: ["id", "header", "question", "options"],
						additionalProperties: false,
					},
				},
			},
			required: ["questions"],
			additionalProperties: false,
		},
	};
}

export function requestUserInputUnavailableMessage(
	mode: CollaborationMode["mode"],
	availableModes: readonly ModeKind[],
): string | null {
	if (availableModes.includes(mode)) {
		return null;
	}

	return `request_user_input is unavailable in ${modeDisplayName(mode)} mode`;
}

export function requestUserInputToolDescription(
	availableModes: readonly ModeKind[],
): string {
	return `Request user input for one to three short questions and wait for the response. This tool is only available in ${formatAllowedModes(availableModes)}.`;
}

function formatAllowedModes(availableModes: readonly ModeKind[]): string {
	const modeNames = availableModes.map(modeDisplayName);

	if (modeNames.length === 0) {
		return "no modes";
	}

	if (modeNames.length === 1) {
		return `${modeNames[0]} mode`;
	}

	if (modeNames.length === 2) {
		return `${modeNames[0]} or ${modeNames[1]} mode`;
	}

	return `modes: ${modeNames.join(",")}`;
}

function modeDisplayName(mode: ModeKind): string {
	switch (mode) {
		case ModeKind.Plan:
			return "Plan";
		case ModeKind.Default:
			return "Default";
	}
}
