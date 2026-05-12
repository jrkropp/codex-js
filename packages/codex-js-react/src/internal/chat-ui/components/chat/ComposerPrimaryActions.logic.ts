export interface PendingActionState {
	questionIndex: number;
	isLastQuestion: boolean;
	canAdvance: boolean;
	isResponding: boolean;
	isComplete: boolean;
}

export function formatPendingPrimaryActionLabel(input: {
	compact: boolean;
	isLastQuestion: boolean;
	isResponding: boolean;
	questionIndex: number;
}) {
	if (input.isResponding) {
		return "Submitting...";
	}
	if (input.compact) {
		return input.isLastQuestion ? "Submit" : "Next";
	}
	if (!input.isLastQuestion) {
		return "Next question";
	}
	return input.questionIndex > 0 ? "Submit answers" : "Submit answer";
}
