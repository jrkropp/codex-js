import { CheckIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef } from "react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type {
	PendingUserInput,
	PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
export {
	buildRequestUserInputResponse,
	derivePendingUserInputProgress,
	setPendingUserInputCustomAnswer,
	togglePendingUserInputOptionSelection,
	type PendingUserInputDraftAnswer,
	type PendingUserInputProgress,
} from "../../pendingUserInput";
import { derivePendingUserInputProgress } from "../../pendingUserInput";

export function ComposerPendingUserInputPanel({
	answers,
	disabled = false,
	isResponding = false,
	questionIndex,
	request,
	onAdvance,
	onDismiss,
	onToggleOption,
}: {
	answers: Record<string, PendingUserInputDraftAnswer>;
	disabled?: boolean;
	isResponding?: boolean;
	questionIndex: number;
	request: PendingUserInput | null;
	onAdvance: () => void;
	onDismiss: () => void;
	onToggleOption: (questionId: string, optionLabel: string) => void;
}) {
	if (!request || request.questions.length === 0) {
		return null;
	}

	return (
		<ComposerPendingUserInputCard
			key={String(request.requestId)}
			answers={answers}
			disabled={disabled}
			isResponding={isResponding}
			questionIndex={questionIndex}
			request={request}
			onAdvance={onAdvance}
			onDismiss={onDismiss}
			onToggleOption={onToggleOption}
		/>
	);
}

const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
	answers,
	disabled,
	isResponding,
	questionIndex,
	request,
	onAdvance,
	onDismiss,
	onToggleOption,
}: {
	answers: Record<string, PendingUserInputDraftAnswer>;
	disabled: boolean;
	isResponding: boolean;
	questionIndex: number;
	request: PendingUserInput;
	onAdvance: () => void;
	onDismiss: () => void;
	onToggleOption: (questionId: string, optionLabel: string) => void;
}) {
	const progress = derivePendingUserInputProgress(
		request.questions,
		answers,
		questionIndex,
	);
	const activeQuestion = progress.activeQuestion;
	const autoAdvanceTimerRef = useRef<number | null>(null);
	const onAdvanceRef = useRef(onAdvance);

	useEffect(() => {
		onAdvanceRef.current = onAdvance;
	}, [onAdvance]);

	useEffect(() => {
		return () => {
			if (autoAdvanceTimerRef.current !== null) {
				window.clearTimeout(autoAdvanceTimerRef.current);
			}
		};
	}, []);

	const selectOption = useCallback(
		(questionId: string, optionLabel: string) => {
			if (disabled || isResponding) {
				return;
			}
			onToggleOption(questionId, optionLabel);
			if (autoAdvanceTimerRef.current !== null) {
				window.clearTimeout(autoAdvanceTimerRef.current);
			}
			autoAdvanceTimerRef.current = window.setTimeout(() => {
				autoAdvanceTimerRef.current = null;
				onAdvanceRef.current();
			}, 200);
		},
		[disabled, isResponding, onToggleOption],
	);

	useEffect(() => {
		if (!activeQuestion || disabled || isResponding) {
			return;
		}
		const question = activeQuestion;

		function handleKeyDown(event: KeyboardEvent) {
			if (event.metaKey || event.ctrlKey || event.altKey) {
				return;
			}
			const target = event.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement
			) {
				return;
			}
			if (
				target instanceof HTMLElement &&
				target.closest('[contenteditable]:not([contenteditable="false"])')
			) {
				return;
			}

			const digit = Number.parseInt(event.key, 10);
			if (Number.isNaN(digit) || digit < 1 || digit > 9) {
				return;
			}
			const optionIndex = digit - 1;
			const option = question.options[optionIndex];
			if (!option) {
				return;
			}
			event.preventDefault();
			selectOption(question.id, option.label);
		}

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [activeQuestion, disabled, isResponding, selectOption]);

	if (!activeQuestion) {
		return null;
	}

	return (
		<div className="border-b px-4 py-3 sm:px-5">
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 items-center gap-2">
					{request.questions.length > 1 ? (
						<span className="flex h-5 items-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground/60">
							{progress.questionIndex + 1}/{request.questions.length}
						</span>
					) : null}
					<span className="truncate text-[11px] font-semibold tracking-widest text-muted-foreground/50 uppercase">
						{activeQuestion.header}
					</span>
				</div>
				<span className="text-muted-foreground text-xs">
					{progress.answeredQuestionCount} of {request.questions.length}
				</span>
			</div>
			<p className="mt-1.5 text-foreground/90 text-sm">
				{activeQuestion.question}
			</p>
			<div className="mt-3 space-y-1">
				{activeQuestion.options.map((option, index) => {
					const isSelected = progress.selectedOptionLabels.includes(option.label);
					const shortcutKey = index < 9 ? index + 1 : null;
					return (
						<button
							key={`${activeQuestion.id}:${option.label}`}
							type="button"
							disabled={disabled || isResponding}
							title={option.description}
							className={cn(
								"group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all duration-150",
								isSelected
									? "border-primary/40 bg-primary/8 text-foreground"
									: "border-transparent bg-muted/20 text-foreground/80 hover:border-border/40 hover:bg-muted/40",
								(disabled || isResponding) && "cursor-not-allowed opacity-50",
							)}
							onClick={() => selectOption(activeQuestion.id, option.label)}
						>
							{shortcutKey !== null ? (
								<kbd
									className={cn(
										"flex size-5 shrink-0 items-center justify-center rounded text-[11px] font-medium tabular-nums transition-colors duration-150",
										isSelected
											? "bg-primary/20 text-primary"
											: "bg-muted/40 text-muted-foreground/50 group-hover:bg-muted/60 group-hover:text-muted-foreground/70",
									)}
								>
									{shortcutKey}
								</kbd>
							) : null}
							<div className="min-w-0 flex-1">
								<span className="text-sm font-medium">{option.label}</span>
								{option.description && option.description !== option.label ? (
									<span className="ml-2 text-muted-foreground/55 text-xs">
										{option.description}
									</span>
								) : null}
							</div>
							{isSelected ? (
								<CheckIcon className="size-3.5 shrink-0 text-primary" />
							) : null}
						</button>
					);
				})}
			</div>
			<div className="mt-3 flex items-center justify-end">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={disabled || isResponding}
					onClick={onDismiss}
				>
					Dismiss
				</Button>
			</div>
		</div>
	);
});
