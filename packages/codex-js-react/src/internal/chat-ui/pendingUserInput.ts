import type { RequestId } from "@jrkropp/codex-js/client";
import type {
	ToolRequestUserInputQuestion,
	ToolRequestUserInputResponse,
} from "@jrkropp/codex-js/client";

export type PendingUserInputQuestion = Omit<
	ToolRequestUserInputQuestion,
	"options"
> & {
	options: NonNullable<ToolRequestUserInputQuestion["options"]>;
};

export type PendingUserInput = {
	requestId: RequestId;
	threadId: string;
	turnId: string;
	itemId: string;
	questions: readonly PendingUserInputQuestion[];
};

export interface PendingUserInputDraftAnswer {
	selectedOptionLabels?: string[];
	customAnswer?: string;
}

export interface PendingUserInputProgress {
	activeDraft: PendingUserInputDraftAnswer | undefined;
	activeQuestion: PendingUserInputQuestion | null;
	answeredQuestionCount: number;
	canAdvance: boolean;
	customAnswer: string;
	isComplete: boolean;
	isLastQuestion: boolean;
	questionIndex: number;
	resolvedAnswer: string[] | null;
	selectedOptionLabels: string[];
	usingCustomAnswer: boolean;
}

export function normalizePendingUserInputQuestion(
	question: ToolRequestUserInputQuestion,
): PendingUserInputQuestion {
	return {
		...question,
		options: question.options ?? [],
	};
}

export function derivePendingUserInputProgress(
	questions: ReadonlyArray<PendingUserInputQuestion>,
	draftAnswers: Record<string, PendingUserInputDraftAnswer>,
	questionIndex: number,
): PendingUserInputProgress {
	const normalizedQuestionIndex =
		questions.length === 0
			? 0
			: Math.max(0, Math.min(questionIndex, questions.length - 1));
	const activeQuestion = questions[normalizedQuestionIndex] ?? null;
	const activeDraft = activeQuestion
		? draftAnswers[activeQuestion.id]
		: undefined;
	const selectedOptionLabels = normalizeSelectedOptionLabels(
		activeDraft?.selectedOptionLabels,
	);
	const customAnswer = activeDraft?.customAnswer ?? "";
	const resolvedAnswer = activeQuestion
		? resolvePendingUserInputAnswer(activeQuestion, activeDraft)
		: null;
	const answeredQuestionCount = countAnsweredPendingUserInputQuestions(
		questions,
		draftAnswers,
	);
	const isLastQuestion =
		questions.length === 0 ? true : normalizedQuestionIndex >= questions.length - 1;

	return {
		activeDraft,
		activeQuestion,
		answeredQuestionCount,
		canAdvance: Boolean(resolvedAnswer),
		customAnswer,
		isComplete: buildPendingUserInputAnswers(questions, draftAnswers) !== null,
		isLastQuestion,
		questionIndex: normalizedQuestionIndex,
		resolvedAnswer,
		selectedOptionLabels,
		usingCustomAnswer: customAnswer.trim().length > 0,
	};
}

export function togglePendingUserInputOptionSelection(
	optionLabel: string,
): PendingUserInputDraftAnswer {
	return {
		customAnswer: "",
		selectedOptionLabels: [optionLabel],
	};
}

export function setPendingUserInputCustomAnswer(
	draft: PendingUserInputDraftAnswer | undefined,
	customAnswer: string,
): PendingUserInputDraftAnswer {
	const selectedOptionLabels =
		customAnswer.trim().length > 0
			? undefined
			: normalizeSelectedOptionLabels(draft?.selectedOptionLabels);

	return {
		customAnswer,
		...(selectedOptionLabels && selectedOptionLabels.length > 0
			? { selectedOptionLabels }
			: {}),
	};
}

export function buildRequestUserInputResponse(
	request: PendingUserInput,
	draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): ToolRequestUserInputResponse {
	return {
		answers: Object.fromEntries(
			request.questions.map((question) => [
				question.id,
				{
					answers:
						resolvePendingUserInputAnswer(question, draftAnswers[question.id]) ?? [],
				},
			]),
		),
	};
}

export function buildPendingUserInputAnswers(
	questions: ReadonlyArray<PendingUserInputQuestion>,
	draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): Record<string, string[]> | null {
	const answers: Record<string, string[]> = {};

	for (const question of questions) {
		const answer = resolvePendingUserInputAnswer(
			question,
			draftAnswers[question.id],
		);
		if (!answer) {
			return null;
		}
		answers[question.id] = answer;
	}

	return answers;
}

export function countAnsweredPendingUserInputQuestions(
	questions: ReadonlyArray<PendingUserInputQuestion>,
	draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): number {
	return questions.reduce((count, question) => {
		return resolvePendingUserInputAnswer(question, draftAnswers[question.id])
			? count + 1
			: count;
	}, 0);
}

export function resolvePendingUserInputAnswer(
	question: PendingUserInputQuestion,
	draft: PendingUserInputDraftAnswer | undefined,
): string[] | null {
	const customAnswer = normalizeDraftAnswer(draft?.customAnswer);
	if (customAnswer) {
		return [customAnswer];
	}

	const selectedOptionLabels = normalizeSelectedOptionLabels(
		draft?.selectedOptionLabels,
	).filter((label) =>
		question.options.some((option) => option.label === label),
	);

	return selectedOptionLabels.length > 0 ? selectedOptionLabels : null;
}

function normalizeDraftAnswer(value: string | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function normalizeSelectedOptionLabels(value: string[] | undefined): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const normalized = value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);

	return Array.from(new Set(normalized));
}
