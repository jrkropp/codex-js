import {
	BotIcon,
	ListTodoIcon,
	type LucideIcon,
	LockIcon,
	LockOpenIcon,
	PenLineIcon,
	XIcon,
} from "lucide-react";
import {
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ClipboardEvent,
	type DragEvent,
	type MutableRefObject,
} from "react";

import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Separator } from "../ui/separator";
import { cn } from "../../lib/utils";
import type { UserInput } from "../../../../../../codex-rs/core/src";
import type {
	CodexModelOption,
	CodexReasoningEffort,
} from "../../lib/modelSelection";
import type { ToolRequestUserInputResponse } from "../../../../../../codex-rs/app-server-protocol/schema/typescript/v2";

import {
	buildRequestUserInputResponse,
	derivePendingUserInputProgress,
	setPendingUserInputCustomAnswer,
	togglePendingUserInputOptionSelection,
	type PendingUserInput,
	type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import { ComposerPendingUserInputPanel } from "./ComposerPendingUserInputPanel";
import {
	composerSnapshotUserInputItems,
	createComposerPromptSnapshot,
	prefillComposerState,
	type ComposerPromptSnapshot,
} from "./composer-editor-mentions";
import {
	replaceTextRange,
	type ComposerSlashCommand,
	type ComposerTrigger,
} from "./composer-logic";
import { searchSlashCommandItems } from "./composerSlashCommandSearch";
import {
	ComposerCommandMenu,
	type ComposerCommandItem,
} from "./ComposerCommandMenu";
import { resolveComposerMenuActiveItemId } from "./composerMenuHighlight";
import { CompactComposerControlsMenu } from "./CompactComposerControlsMenu";
import {
	shouldUseCompactComposerFooter,
	shouldUseCompactComposerPrimaryActions,
} from "./composer-footer-layout";
import {
	ComposerPromptEditor,
	type ComposerPromptEditorHandle,
} from "../ComposerPromptEditor";
import type { MentionBinding } from "./mention-bindings";
import {
	type ComposerMentionTarget,
	searchComposerMentionTargets,
} from "./composer-mention-targets";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { TraitsPicker } from "./TraitsPicker";
import { ContextWindowMeter } from "./ContextWindowMeter";
import type { ContextWindowSnapshot } from "../../lib/contextWindow";
import {
	buildExpandedImagePreview,
	createComposerImageAttachments,
	persistComposerDraftAttachments,
	validateComposerImageFiles,
	type ExpandedImagePreview,
} from "./composer-image-attachments";
import { ExpandedImageDialog } from "./ExpandedImageDialog";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";
import { ComposerPlanFollowUpBanner } from "./ComposerPlanFollowUpBanner";
import type { PendingActionState } from "./ComposerPrimaryActions.logic";
import type { RealtimeConversationUiState } from "./composer-realtime-conversation.logic";
import { deriveComposerSendState } from "./composer-send-state.logic";
import {
	resolveDraftEffort,
	resolveDraftModel,
	useComposerDraftStore,
	useComposerThreadDraft,
	type ComposerDraftKey,
} from "./composer-draft.client";

export type ChatComposerSubmitPayload = {
	files: File[];
	effort: CodexReasoningEffort;
	items: UserInput[];
	mentionBindings: MentionBinding[];
	model: string;
	text: string;
};

export type ChatComposerInteractionMode = "default" | "plan";

export type ChatComposerRuntimeMode =
	| "approval-required"
	| "auto-accept-edits"
	| "full-access";

export type ChatComposerCommand = {
	description: string;
	disabled?: boolean;
	group?: string;
	label?: string;
	name: ComposerSlashCommand;
	unavailableReason?: string;
};

export type ChatComposerSkill = {
	description?: string;
	disabled?: boolean;
	label?: string;
	name: string;
	unavailableReason?: string;
};

export type ChatComposerHandle = {
	clear: () => void;
	focusAt: (cursor: number) => void;
	focusAtEnd: () => void;
	getSendContext: () => ChatComposerSubmitPayload;
	insertTextAtCursor: (
		text: string,
		options?: { source?: "manual" | "realtime" },
	) => void;
	insertRecordingMeterPlaceholder: (text: string) => string;
	readSnapshot: () => {
		cursor: number;
		expandedCursor: number;
		value: string;
	};
	removeRecordingMeterPlaceholder: (id: string) => void;
	replaceRecordingMeterPlaceholder: (id: string, text: string) => void;
	resetCursorState: (options?: {
		cursor?: number;
		detectTrigger?: boolean;
		prompt?: string;
	}) => void;
	setDraft: (draft: { mentionBindings?: MentionBinding[]; message: string }) => void;
	submit: () => void;
	updateRecordingMeterInPlace: (id: string, text: string) => boolean;
};

const composerFooterHasWideActions = true;
const defaultComposerPlaceholder =
	"Ask anything, @tag files/folders, or use / to show available commands";

const runtimeModeConfig: Record<
	ChatComposerRuntimeMode,
	{ description: string; icon: LucideIcon; label: string }
> = {
	"approval-required": {
		description: "Ask before commands and file changes.",
		icon: LockIcon,
		label: "Supervised",
	},
	"auto-accept-edits": {
		description: "Auto-approve edits, ask before other actions.",
		icon: PenLineIcon,
		label: "Auto-accept edits",
	},
	"full-access": {
		description: "Allow commands and edits without prompts.",
		icon: LockOpenIcon,
		label: "Full access",
	},
};

const runtimeModeOptions = Object.keys(
	runtimeModeConfig,
) as ChatComposerRuntimeMode[];

function isChatComposerRuntimeMode(
	value: string,
): value is ChatComposerRuntimeMode {
	return runtimeModeOptions.includes(value as ChatComposerRuntimeMode);
}

function noopAction() {}

function noopRuntimeModeChange() {}

const ComposerFooterModeControls = memo(function ComposerFooterModeControls({
	interactionMode,
	onRuntimeModeChange,
	onToggleInteractionMode,
	onTogglePlanSidebar,
	planSidebarLabel,
	planSidebarOpen,
	runtimeMode,
	showInteractionModeToggle,
	showPlanToggle,
}: {
	interactionMode: ChatComposerInteractionMode;
	onRuntimeModeChange: (mode: ChatComposerRuntimeMode) => void;
	onToggleInteractionMode: () => void;
	onTogglePlanSidebar: () => void;
	planSidebarLabel: string;
	planSidebarOpen: boolean;
	runtimeMode: ChatComposerRuntimeMode;
	showInteractionModeToggle: boolean;
	showPlanToggle: boolean;
}) {
	const runtimeModeOption = runtimeModeConfig[runtimeMode];
	const RuntimeModeIcon = runtimeModeOption.icon;

	return (
		<>
			<Separator orientation="vertical" className="mx-0.5 hidden h-4 sm:block" />

			{showInteractionModeToggle ? (
				<>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="shrink-0 whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:px-3"
						title={
							interactionMode === "plan"
								? "Plan mode - click to return to normal build mode"
								: "Default mode - click to enter plan mode"
						}
						onClick={onToggleInteractionMode}
					>
						<BotIcon aria-hidden="true" />
						<span className="sr-only sm:not-sr-only">
							{interactionMode === "plan" ? "Plan" : "Build"}
						</span>
					</Button>

					<Separator
						orientation="vertical"
						className="mx-0.5 hidden h-4 sm:block"
					/>
				</>
			) : null}

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="font-medium text-muted-foreground/70 hover:text-foreground/80"
						aria-label="Runtime mode"
						title={runtimeModeOption.description}
					>
						<RuntimeModeIcon className="size-4" aria-hidden="true" />
						<span>{runtimeModeOption.label}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-72">
					<DropdownMenuLabel>Runtime mode</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={runtimeMode}
						onValueChange={(value) => {
							if (isChatComposerRuntimeMode(value)) {
								onRuntimeModeChange(value);
							}
						}}
					>
						{runtimeModeOptions.map((mode) => {
							const option = runtimeModeConfig[mode];
							const OptionIcon = option.icon;
							return (
								<DropdownMenuRadioItem key={mode} value={mode}>
									<div className="grid min-w-0 gap-0.5">
										<span className="inline-flex items-center gap-1.5 font-medium text-foreground">
											<OptionIcon className="size-3.5 shrink-0 text-muted-foreground" />
											{option.label}
										</span>
										<span className="text-muted-foreground text-xs leading-4">
											{option.description}
										</span>
									</div>
								</DropdownMenuRadioItem>
							);
						})}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>

			{showPlanToggle ? (
				<>
					<Separator
						orientation="vertical"
						className="mx-0.5 hidden h-4 sm:block"
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className={cn(
							"shrink-0 whitespace-nowrap px-2 sm:px-3",
							planSidebarOpen
								? "text-blue-400 hover:text-blue-300"
								: "text-muted-foreground/70 hover:text-foreground/80",
						)}
						title={
							planSidebarOpen
								? `Hide ${planSidebarLabel.toLowerCase()} sidebar`
								: `Show ${planSidebarLabel.toLowerCase()} sidebar`
						}
						onClick={onTogglePlanSidebar}
					>
						<ListTodoIcon aria-hidden="true" />
						<span className="sr-only sm:not-sr-only">{planSidebarLabel}</span>
					</Button>
				</>
			) : null}
		</>
	);
});

export const ChatComposer = forwardRef<
	ChatComposerHandle,
	{
		className?: string;
		disabled?: boolean;
		draftKey: ComposerDraftKey;
		editorAriaLabel?: string;
		isConnecting?: boolean;
		isEnvironmentUnavailable?: boolean;
		isRunning?: boolean;
		isSending?: boolean;
		interactionMode?: ChatComposerInteractionMode;
		contextWindow?: ContextWindowSnapshot | null;
		mentionRefs: ComposerMentionTarget[];
		modelOptions?: readonly CodexModelOption[];
		pendingUserInput?: PendingUserInput | null;
		pendingRequestDisabled?: boolean;
		placeholder?: string;
		planFollowUpTitle?: string | null;
		planSidebarLabel?: string;
		planSidebarOpen?: boolean;
		realtimeConversation?: RealtimeConversationUiState | null;
		runtimeMode?: ChatComposerRuntimeMode;
		showPlanFollowUpPrompt?: boolean;
		showInteractionModeToggle?: boolean;
		showPlanToggle?: boolean;
		composerCommands?: readonly ChatComposerCommand[];
		composerSkills?: readonly ChatComposerSkill[];
		onCommand?: (command: ComposerSlashCommand) => void;
		onComposerError?: (message: string) => void;
		onImplementPlanInNewThread?: () => void;
		onRuntimeModeChange?: (mode: ChatComposerRuntimeMode) => void;
		onToggleInteractionMode?: () => void;
		onTogglePlanSidebar?: () => void;
		onPendingRequestDismiss?: () => void;
		onPendingRequestSubmit?: (
			response: ToolRequestUserInputResponse,
		) => boolean | void;
		onInterrupt: () => void;
		scheduleStickToBottom?: () => void;
		shouldAutoScrollRef?: MutableRefObject<boolean>;
		onSend: () => void | Promise<void>;
	}
>(function ChatComposer(
	{
		className,
		disabled = false,
		draftKey,
		editorAriaLabel = "Message Codex",
		isConnecting = false,
		isEnvironmentUnavailable = false,
		isRunning = false,
		isSending = false,
		interactionMode = "default",
		contextWindow = null,
		mentionRefs,
		modelOptions,
		onComposerError,
		onCommand,
		onRuntimeModeChange,
		onToggleInteractionMode,
		onTogglePlanSidebar,
		onPendingRequestDismiss,
		onPendingRequestSubmit,
		onInterrupt,
		onSend,
		pendingUserInput = null,
		pendingRequestDisabled = false,
		placeholder = defaultComposerPlaceholder,
		planFollowUpTitle = null,
		planSidebarLabel = "Plan",
		planSidebarOpen = false,
		runtimeMode = "full-access",
		showPlanFollowUpPrompt = false,
		showInteractionModeToggle = true,
		showPlanToggle = false,
		composerCommands = defaultAppComposerCommands,
		composerSkills = [],
		scheduleStickToBottom,
		shouldAutoScrollRef,
		onImplementPlanInNewThread,
	},
	ref,
) {
	const editorRef = useRef<ComposerPromptEditorHandle | null>(null);
	const composerFormRef = useRef<HTMLFormElement | null>(null);
	const composerSurfaceRef = useRef<HTMLDivElement | null>(null);
	const composerBlurFrameRef = useRef<number | null>(null);
	const composerFormHeightRef = useRef(0);
	const dragDepthRef = useRef(0);
	const pendingEditorSyncKeyRef = useRef<string | null>(null);
	const syncedEditorDraftKeyRef = useRef<ComposerDraftKey | null>(null);
	const [expandedImagePreview, setExpandedImagePreview] =
		useState<ExpandedImagePreview | null>(null);
	const [isComposerFocused, setIsComposerFocused] = useState(false);
	const [isDragOverComposer, setIsDragOverComposer] = useState(false);
	const [isMobileViewport, setIsMobileViewport] = useState(false);
	const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
	const [isComposerFooterCompact, setIsComposerFooterCompact] = useState(false);
	const [
		isComposerPrimaryActionsCompact,
		setIsComposerPrimaryActionsCompact,
	] = useState(false);
	const [respondingPendingRequestKey, setRespondingPendingRequestKey] =
		useState<string | null>(null);
	const [snapshot, setSnapshot] = useState<ComposerPromptSnapshot>({
		mentionBindings: [],
		text: "",
		textElements: [],
	});
	const draft = useComposerThreadDraft(draftKey);
	const ensureDraft = useComposerDraftStore((store) => store.ensureDraft);
	const addDraftImages = useComposerDraftStore((store) => store.addImages);
	const clearComposerContent = useComposerDraftStore(
		(store) => store.clearComposerContent,
	);
	const favoriteModels = useComposerDraftStore((store) => store.favoriteModels);
	const removeDraftImage = useComposerDraftStore((store) => store.removeImage);
	const setDraftEffort = useComposerDraftStore((store) => store.setEffort);
	const setDraftFavoriteModels = useComposerDraftStore(
		(store) => store.setFavoriteModels,
	);
	const setDraftModel = useComposerDraftStore((store) => store.setModel);
	const setDraftPrompt = useComposerDraftStore((store) => store.setPrompt);
	const syncDraftPersistedImages = useComposerDraftStore(
		(store) => store.syncPersistedImages,
	);
	const attachments = draft.images;
	const model = resolveDraftModel(draft);
	const effort = resolveDraftEffort(draft, model);
	const pendingUserInputKey = pendingUserInput
		? String(pendingUserInput.requestId)
		: null;
	const [pendingAnswersByRequestKey, setPendingAnswersByRequestKey] = useState<
		Record<string, Record<string, PendingUserInputDraftAnswer>>
	>({});
	const [pendingQuestionIndexByRequestKey, setPendingQuestionIndexByRequestKey] =
		useState<Record<string, number>>({});
	const [trigger, setTrigger] = useState<ComposerTrigger | null>(null);
	const items = useComposerCommandItems({
		composerCommands,
		composerSkills,
		mentionRefs,
		trigger,
	});
	const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
	const [highlightedSearchKey, setHighlightedSearchKey] = useState<string | null>(null);
	const currentSearchKey = trigger
		? `${trigger.kind}:${trigger.query}`
		: null;
	const activeItemId = resolveComposerMenuActiveItemId({
		currentSearchKey,
		highlightedItemId,
		highlightedSearchKey,
		items,
	});

	const hasSendableContent =
		snapshot.text.trim().length > 0 || attachments.length > 0;
	const effectiveHasSendableContent =
		hasSendableContent || showPlanFollowUpPrompt;
	const sendState = deriveComposerSendState({
		disabled,
		hasSendableContent: effectiveHasSendableContent,
		isConnecting,
		isEnvironmentUnavailable,
		isRunning,
		isSending,
	});
	const pendingAnswers = useMemo(
		() =>
			pendingUserInputKey && pendingAnswersByRequestKey[pendingUserInputKey]
				? pendingAnswersByRequestKey[pendingUserInputKey]
				: {},
		[pendingAnswersByRequestKey, pendingUserInputKey],
	);
	const pendingQuestionIndex =
		pendingUserInputKey && pendingQuestionIndexByRequestKey[pendingUserInputKey]
			? pendingQuestionIndexByRequestKey[pendingUserInputKey]
			: 0;
	const pendingInputProgress = pendingUserInput
		? derivePendingUserInputProgress(
				pendingUserInput.questions,
				pendingAnswers,
				pendingQuestionIndex,
			)
		: null;
	const pendingAction = pendingInputProgress
		? ({
				questionIndex: pendingInputProgress.questionIndex,
				isLastQuestion: pendingInputProgress.isLastQuestion,
				canAdvance: pendingInputProgress.canAdvance,
				isResponding: respondingPendingRequestKey === pendingUserInputKey,
				isComplete: pendingInputProgress.isComplete,
			} satisfies PendingActionState)
		: null;
	const activePendingQuestionId = pendingInputProgress?.activeQuestion?.id ?? null;
	const isComposerCollapsedMobile = isMobileViewport && !isComposerFocused;
	const showCollapsedMobilePromptRow =
		isComposerCollapsedMobile && pendingUserInput === null;
	const collapsedComposerText = pendingUserInput
		? pendingInputProgress?.customAnswer ?? ""
		: snapshot.text.trim();

	useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 639px)");
		const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
		updateViewport();
		mediaQuery.addEventListener("change", updateViewport);
		return () => mediaQuery.removeEventListener("change", updateViewport);
	}, []);

	useEffect(() => {
		const ensuredDraft = ensureDraft(draftKey);
		const timerId = window.setTimeout(() => {
			setExpandedImagePreview(null);
			setRespondingPendingRequestKey(null);
			editorRef.current?.setTextContentWithMentionBindings({
				mentionBindings: [],
				text: ensuredDraft.prompt,
			});
			setSnapshot(createComposerPromptSnapshot(ensuredDraft.prompt));
			syncedEditorDraftKeyRef.current = draftKey;
		}, 0);
		return () => window.clearTimeout(timerId);
	}, [draftKey, ensureDraft]);

	useEffect(() => {
		if (isMobileViewport) {
			const frameId = window.requestAnimationFrame(() => {
				setIsComposerFocused(false);
			});
			return () => window.cancelAnimationFrame(frameId);
		}
	}, [draftKey, isMobileViewport]);

	useEffect(() => {
		if (syncedEditorDraftKeyRef.current !== draftKey) {
			return;
		}

		let cancelled = false;
		void (async () => {
			const images = await persistComposerDraftAttachments(attachments);
			if (cancelled) {
				return;
			}
			syncDraftPersistedImages(draftKey, images);
		})();

		return () => {
			cancelled = true;
		};
	}, [attachments, draftKey, syncDraftPersistedImages]);

	useEffect(() => {
		return () => {
			if (composerBlurFrameRef.current !== null) {
				window.cancelAnimationFrame(composerBlurFrameRef.current);
			}
		};
	}, []);

	useEffect(() => {
		if (!isMobileViewport || !isComposerFocused) {
			return;
		}

		function handlePointerDown(event: PointerEvent) {
			if (
				event.target instanceof Node &&
				composerSurfaceRef.current?.contains(event.target)
			) {
				return;
			}
			setIsComposerFocused(false);
		}

		document.addEventListener("pointerdown", handlePointerDown, true);
		return () => document.removeEventListener("pointerdown", handlePointerDown, true);
	}, [isComposerFocused, isMobileViewport]);

	useEffect(() => {
		if (!pendingUserInputKey || !activePendingQuestionId) {
			if (!pendingUserInputKey && pendingEditorSyncKeyRef.current !== null) {
				editorRef.current?.clear();
			}
			pendingEditorSyncKeyRef.current = null;
			return;
		}

		const syncKey = `${pendingUserInputKey}:${activePendingQuestionId}`;
		if (pendingEditorSyncKeyRef.current === syncKey) {
			return;
		}
		pendingEditorSyncKeyRef.current = syncKey;
		editorRef.current?.setTextContentWithMentionBindings({
			mentionBindings: [],
			text: pendingInputProgress?.customAnswer ?? "",
		});
	}, [activePendingQuestionId, pendingInputProgress?.customAnswer, pendingUserInputKey]);

	useLayoutEffect(() => {
		const composerForm = composerFormRef.current;
		if (!composerForm) {
			return;
		}

		const measureCompactness = () => {
			const width = composerForm.clientWidth;
			const footerCompact = shouldUseCompactComposerFooter(width, {
				hasWideActions: composerFooterHasWideActions,
			});
			const primaryActionsCompact =
				footerCompact &&
				shouldUseCompactComposerPrimaryActions(width, {
					hasWideActions: composerFooterHasWideActions,
				});
			return { footerCompact, primaryActionsCompact };
		};

		const initialCompactness = measureCompactness();
		composerFormHeightRef.current = composerForm.getBoundingClientRect().height;
		setIsComposerFooterCompact(initialCompactness.footerCompact);
		setIsComposerPrimaryActionsCompact(
			initialCompactness.primaryActionsCompact,
		);

		if (typeof ResizeObserver === "undefined") {
			return;
		}

		const observer = new ResizeObserver(() => {
			const nextCompactness = measureCompactness();
			const nextHeight = composerForm.getBoundingClientRect().height;
			const previousHeight = composerFormHeightRef.current;
			composerFormHeightRef.current = nextHeight;
			setIsComposerFooterCompact((current) =>
				current === nextCompactness.footerCompact
					? current
					: nextCompactness.footerCompact,
			);
			setIsComposerPrimaryActionsCompact((current) =>
				current === nextCompactness.primaryActionsCompact
					? current
					: nextCompactness.primaryActionsCompact,
			);
			if (previousHeight > 0 && Math.abs(nextHeight - previousHeight) >= 0.5) {
				if (shouldAutoScrollRef && !shouldAutoScrollRef.current) {
					return;
				}
				scheduleStickToBottom?.();
			}
		});
		observer.observe(composerForm);
		return () => observer.disconnect();
	}, [
		attachments.length,
		isComposerCollapsedMobile,
		pendingAction?.isLastQuestion,
		pendingAction?.questionIndex,
		pendingUserInputKey,
		scheduleStickToBottom,
		shouldAutoScrollRef,
		sendState.isRunning,
		sendState.isSendBusy,
	]);

	const advancePendingUserInput = useCallback(() => {
		if (
			!pendingUserInput ||
			!pendingUserInputKey ||
			pendingRequestDisabled ||
			!pendingInputProgress?.canAdvance
		) {
			return;
		}
		if (!pendingInputProgress.isLastQuestion) {
			setPendingQuestionIndexByRequestKey((current) => ({
				...current,
				[pendingUserInputKey]: pendingInputProgress.questionIndex + 1,
			}));
			return;
		}
		if (!pendingInputProgress.isComplete) {
			return;
		}
		setRespondingPendingRequestKey(pendingUserInputKey);
		const accepted = onPendingRequestSubmit?.(
			buildRequestUserInputResponse(pendingUserInput, pendingAnswers),
		);
		if (accepted === false) {
			setRespondingPendingRequestKey(null);
		}
	}, [
		onPendingRequestSubmit,
		pendingAnswers,
		pendingInputProgress,
		pendingUserInput,
		pendingRequestDisabled,
		pendingUserInputKey,
	]);

	const submitComposer = useCallback(() => {
		if (pendingUserInput) {
			advancePendingUserInput();
			return;
		}
		if (sendState.sendDisabled) {
			return;
		}
		void onSend();
	}, [advancePendingUserInput, onSend, pendingUserInput, sendState.sendDisabled]);

	useImperativeHandle(
		ref,
		() => ({
			clear() {
				editorRef.current?.clear();
				setSnapshot(createComposerPromptSnapshot(""));
				clearComposerContent(draftKey);
				setExpandedImagePreview(null);
			},
			focusAt(cursor) {
				editorRef.current?.focusAt(cursor);
			},
			focusAtEnd() {
				editorRef.current?.focusAtEnd();
			},
			getSendContext() {
				const current = editorRef.current?.readSnapshot() ?? snapshot;
				return {
					effort,
					files: attachments.map((attachment) => attachment.file),
					items: composerSnapshotUserInputItems(current),
					mentionBindings: current.mentionBindings,
					model,
					text: current.text.trim(),
				};
			},
			insertTextAtCursor(text, options) {
				editorRef.current?.insertTextAtCursor(text, options);
				const current = editorRef.current?.readSnapshot();
				if (current) {
					setDraftPrompt(draftKey, current.text);
				}
			},
			insertRecordingMeterPlaceholder(text) {
				return editorRef.current?.insertRecordingMeterPlaceholder(text) ?? "";
			},
			readSnapshot() {
				const current = editorRef.current?.readSnapshot() ?? snapshot;
				return {
					cursor: current.text.length,
					expandedCursor: current.text.length,
					value: current.text,
				};
			},
			removeRecordingMeterPlaceholder(id) {
				editorRef.current?.removeRecordingMeterPlaceholder(id);
			},
			replaceRecordingMeterPlaceholder(id, text) {
				editorRef.current?.replaceRecordingMeterPlaceholder(id, text);
				const current = editorRef.current?.readSnapshot();
				if (current) {
					setDraftPrompt(draftKey, current.text);
				}
			},
			resetCursorState(options) {
				if (options?.prompt !== undefined) {
					editorRef.current?.setTextContentWithMentionBindings({
						mentionBindings: snapshot.mentionBindings,
						text: options.prompt,
					});
					setDraftPrompt(draftKey, options.prompt);
				}
				if (typeof options?.cursor === "number") {
					editorRef.current?.focusAt(options.cursor);
				}
				if (options?.detectTrigger === false) {
					setTrigger(null);
				}
			},
			setDraft(draft) {
				const state = prefillComposerState(draft);
				setDraftPrompt(draftKey, state.text);
				editorRef.current?.setTextContentWithMentionBindings({
					mentionBindings: state.mentionBindings,
					text: state.text,
				});
				editorRef.current?.focusAtEnd();
			},
			submit: submitComposer,
			updateRecordingMeterInPlace(id, text) {
				return editorRef.current?.updateRecordingMeterInPlace(id, text) ?? false;
			},
		}),
		[
			attachments,
			clearComposerContent,
			draftKey,
			effort,
			model,
			setDraftPrompt,
			snapshot,
			submitComposer,
		],
	);

	function addImageAttachments(files: Iterable<File>) {
		const validation = validateComposerImageFiles({
			currentCount: attachments.length,
			files,
		});
		if (validation.error) {
			onComposerError?.(validation.error);
		}
		const nextAttachments = createComposerImageAttachments(validation.accepted);
		if (nextAttachments.length === 0) {
			return;
		}
		addDraftImages(draftKey, nextAttachments);
		scheduleStickToBottom?.();
	}

	function removeImageAttachment(attachmentId: string) {
		removeDraftImage(draftKey, attachmentId);
		setExpandedImagePreview(null);
	}

	function expandImageAttachment(attachmentId: string) {
		const preview = buildExpandedImagePreview(attachments, attachmentId);
		if (preview) {
			setExpandedImagePreview(preview);
		}
	}

	function handleComposerDragEnter(event: DragEvent<HTMLDivElement>) {
		if (!Array.from(event.dataTransfer.types).includes("Files")) {
			return;
		}
		event.preventDefault();
		dragDepthRef.current += 1;
		setIsDragOverComposer(true);
	}

	function handleComposerDragOver(event: DragEvent<HTMLDivElement>) {
		if (!Array.from(event.dataTransfer.types).includes("Files")) {
			return;
		}
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
		setIsDragOverComposer(true);
	}

	function handleComposerDragLeave(event: DragEvent<HTMLDivElement>) {
		if (!Array.from(event.dataTransfer.types).includes("Files")) {
			return;
		}
		event.preventDefault();
		const nextTarget = event.relatedTarget;
		if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
			return;
		}
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
		if (dragDepthRef.current === 0) {
			setIsDragOverComposer(false);
		}
	}

	function handleComposerDrop(event: DragEvent<HTMLDivElement>) {
		if (!event.dataTransfer.files.length) {
			return;
		}
		event.preventDefault();
		dragDepthRef.current = 0;
		setIsDragOverComposer(false);
		addImageAttachments(Array.from(event.dataTransfer.files));
	}

	function handleComposerPaste(event: ClipboardEvent<HTMLDivElement>) {
		const files = Array.from(event.clipboardData.files);
		if (files.length === 0) {
			return;
		}
		const imageFiles = files.filter((file) => file.type.startsWith("image/"));
		if (imageFiles.length === 0) {
			return;
		}
		event.preventDefault();
		addImageAttachments(imageFiles);
	}

	function selectCommandItem(item: ComposerCommandItem) {
		if ("disabled" in item && item.disabled) {
			onComposerError?.(
				item.unavailableReason ??
					`${item.label} is not available in this chat.`,
			);
			return;
		}

		if (item.type === "path") {
			editorRef.current?.insertMention(item.mention, trigger);
			setTrigger(null);
			return;
		}

		if (item.type === "skill") {
			const current = editorRef.current?.readSnapshot() ?? snapshot;
			const range =
				trigger?.kind === "skill"
					? { end: trigger.rangeEnd, start: trigger.rangeStart }
					: { end: current.text.length, start: current.text.length };
			const next = replaceTextRange(
				current.text,
				range.start,
				range.end,
				`$${item.name} `,
			);
			editorRef.current?.setTextContentWithMentionBindings({
				mentionBindings: current.mentionBindings,
				text: next.text,
			});
			editorRef.current?.focusAt(next.cursor);
			setDraftPrompt(draftKey, next.text);
			setTrigger(null);
			return;
		}

		if (item.command === "model") {
			clearActiveCommandTrigger();
			setIsModelPickerOpen(true);
		} else {
			clearActiveCommandTrigger();
			if (!onCommand) {
				onComposerError?.(`${item.label} is not handled by this chat.`);
				return;
			}
			onCommand(item.command);
		}
	}

	function setActiveCommandItemId(itemId: string | null) {
		setHighlightedItemId(itemId);
		setHighlightedSearchKey(currentSearchKey);
	}

	function clearActiveCommandTrigger() {
		const current = editorRef.current?.readSnapshot() ?? snapshot;
		const activeTrigger = trigger;
		if (!activeTrigger || activeTrigger.kind !== "slash-command") {
			setTrigger(null);
			return;
		}
		const next = replaceTextRange(
			current.text,
			activeTrigger.rangeStart,
			activeTrigger.rangeEnd,
			"",
		);
		editorRef.current?.setTextContentWithMentionBindings({
			mentionBindings: current.mentionBindings,
			text: next.text,
		});
		editorRef.current?.focusAt(next.cursor);
		setDraftPrompt(draftKey, next.text);
		setHighlightedItemId(null);
		setTrigger(null);
	}

	function handleEditorSubmit() {
		const selectedItem = activeItemId
			? items.find((item) => item.id === activeItemId)
			: null;
		if (trigger && selectedItem) {
			selectCommandItem(selectedItem);
			return;
		}

		submitComposer();
	}

	function handleEditorCommandKey(
		key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab",
		event: KeyboardEvent,
	): boolean {
		if (key === "Tab" && event.shiftKey) {
			onToggleInteractionMode?.();
			return Boolean(onToggleInteractionMode);
		}
		if (!trigger) {
			if (key === "Enter" && !event.shiftKey) {
				submitComposer();
				return true;
			}
			return false;
		}
		if (key === "ArrowDown" || key === "ArrowUp") {
			if (items.length === 0) {
				return true;
			}
			const currentIndex = items.findIndex((item) => item.id === activeItemId);
			const normalizedIndex =
				currentIndex >= 0 ? currentIndex : key === "ArrowDown" ? -1 : 0;
			const offset = key === "ArrowDown" ? 1 : -1;
			const nextIndex =
				(normalizedIndex + offset + items.length) % items.length;
			setActiveCommandItemId(items[nextIndex]?.id ?? null);
			return true;
		}
		if (key === "Enter" || key === "Tab") {
			const selectedItem = activeItemId
				? items.find((item) => item.id === activeItemId)
				: null;
			if (selectedItem) {
				selectCommandItem(selectedItem);
				return true;
			}
		}
		return false;
	}

	function handleEditorSnapshotChange(nextSnapshot: ComposerPromptSnapshot) {
		setSnapshot(nextSnapshot);
		if (!pendingUserInputKey) {
			setDraftPrompt(draftKey, nextSnapshot.text);
		}
		if (!pendingUserInputKey || !activePendingQuestionId) {
			return;
		}
		setPendingAnswersByRequestKey((current) => {
			const currentAnswers = current[pendingUserInputKey] ?? {};
			return {
				...current,
				[pendingUserInputKey]: {
					...currentAnswers,
					[activePendingQuestionId]: setPendingUserInputCustomAnswer(
						currentAnswers[activePendingQuestionId],
						nextSnapshot.text,
					),
				},
			};
		});
	}

	function previousPendingQuestion() {
		if (!pendingUserInputKey || !pendingInputProgress) {
			return;
		}
		setPendingQuestionIndexByRequestKey((current) => ({
			...current,
			[pendingUserInputKey]: Math.max(pendingInputProgress.questionIndex - 1, 0),
		}));
	}

	function expandMobileComposer() {
		setIsComposerFocused(true);
		window.requestAnimationFrame(() => editorRef.current?.focusAtEnd());
	}

	function scheduleComposerCollapseCheck() {
		if (composerBlurFrameRef.current !== null) {
			window.cancelAnimationFrame(composerBlurFrameRef.current);
		}
		composerBlurFrameRef.current = window.requestAnimationFrame(() => {
			composerBlurFrameRef.current = null;
			if (!isMobileViewport) {
				return;
			}
			const activeElement = document.activeElement;
			if (
				activeElement instanceof HTMLElement &&
				composerSurfaceRef.current?.contains(activeElement)
			) {
				return;
			}
			setIsComposerFocused(false);
		});
	}

	const togglePendingOption = useCallback((questionId: string, optionLabel: string) => {
		if (!pendingUserInputKey || pendingRequestDisabled) {
			return;
		}
		setPendingAnswersByRequestKey((current) => {
			const currentAnswers = current[pendingUserInputKey] ?? {};
			return {
				...current,
				[pendingUserInputKey]: {
					...currentAnswers,
					[questionId]: togglePendingUserInputOptionSelection(
						optionLabel,
					),
				},
			};
		});
	}, [pendingRequestDisabled, pendingUserInputKey]);

	return (
		<form
			ref={composerFormRef}
			className={cn("mx-auto w-full min-w-0 max-w-208", className)}
			data-chat-composer-form="true"
			onSubmit={(event) => {
				event.preventDefault();
				submitComposer();
			}}
		>
			{trigger ? (
				<div className="absolute bottom-full left-3 z-20 mb-2 w-[min(34rem,calc(100vw-2rem))]">
					<ComposerCommandMenu
						activeItemId={activeItemId}
						items={items}
						triggerKind={trigger.kind}
						onHighlightedItemChange={setActiveCommandItemId}
						onSelect={selectCommandItem}
					/>
				</div>
			) : null}

			<div
				className="group rounded-[22px] p-px transition-colors duration-200"
				onDragEnter={handleComposerDragEnter}
				onDragOver={handleComposerDragOver}
				onDragLeave={handleComposerDragLeave}
				onDrop={handleComposerDrop}
				onPaste={handleComposerPaste}
			>
				<div
					ref={composerSurfaceRef}
					className={cn(
						"rounded-[20px] border bg-card transition-colors duration-200 has-focus-visible:border-ring/45",
						isDragOverComposer
							? "border-primary/70 bg-accent/30"
							: "border-border",
						disabled && "opacity-75",
					)}
					data-chat-composer-mobile-collapsed={
						isComposerCollapsedMobile ? "true" : "false"
					}
					onFocusCapture={(event) => {
						if (
							isComposerCollapsedMobile &&
							event.target instanceof HTMLElement &&
							event.target.closest('[data-chat-composer-collapsed-controls="true"]')
						) {
							return;
						}
						if (composerBlurFrameRef.current !== null) {
							window.cancelAnimationFrame(composerBlurFrameRef.current);
							composerBlurFrameRef.current = null;
						}
						setIsComposerFocused(true);
					}}
					onBlurCapture={scheduleComposerCollapseCheck}
				>
					<ComposerPendingUserInputPanel
						answers={pendingAnswers}
						disabled={pendingRequestDisabled}
						isResponding={respondingPendingRequestKey === pendingUserInputKey}
						questionIndex={pendingQuestionIndex}
						request={pendingUserInput}
						onAdvance={advancePendingUserInput}
						onDismiss={() => {
							onPendingRequestDismiss?.();
						}}
						onToggleOption={togglePendingOption}
					/>

					{showPlanFollowUpPrompt && !pendingUserInput ? (
						<div className="rounded-t-[19px] border-b border-border/65 bg-muted/20">
							<ComposerPlanFollowUpBanner planTitle={planFollowUpTitle} />
						</div>
					) : null}

					{isComposerCollapsedMobile && pendingUserInput ? (
						<div
							className="border-b px-3 pb-3 sm:px-4"
							data-chat-composer-collapsed-controls="true"
						>
							<div
								className="flex min-w-0 items-center gap-2 rounded-lg border border-border/55 bg-background/55 p-1.5 pl-3 transition-colors hover:bg-background/80"
								data-chat-composer-mobile-pending-compact="true"
							>
								<button
									type="button"
									className={cn(
										"min-w-0 flex-1 truncate bg-transparent py-1.5 text-left text-sm",
										collapsedComposerText
											? "text-foreground"
											: "text-muted-foreground/60",
									)}
									aria-label="Write custom answer"
									onPointerDown={(event) => event.preventDefault()}
									onClick={expandMobileComposer}
								>
									{collapsedComposerText || "Write custom answer"}
								</button>
								<div data-chat-composer-mobile-pending-actions="true">
											<ComposerPrimaryActions
												compact
												disabled={pendingRequestDisabled}
												hasSendableContent={false}
												isConnecting={sendState.isConnecting}
												isEnvironmentUnavailable={sendState.isEnvironmentUnavailable}
												isRunning={false}
												isSending={sendState.isSendBusy}
												pendingAction={pendingAction}
										preserveComposerFocusOnPointerDown
											onInterrupt={onInterrupt}
											onImplementPlanInNewThread={onImplementPlanInNewThread}
										onPreviousPendingQuestion={previousPendingQuestion}
									/>
								</div>
							</div>
						</div>
					) : null}

					{showCollapsedMobilePromptRow ? (
						<div className="flex items-center justify-between gap-2 px-3 py-2">
							<button
								type="button"
								className={cn(
									"min-w-0 flex-1 truncate bg-transparent p-0 text-left text-[14px] focus:outline-none",
									collapsedComposerText
										? "text-foreground"
										: "text-muted-foreground/35",
								)}
								aria-label="Expand composer"
								onPointerDown={(event) => event.preventDefault()}
								onClick={expandMobileComposer}
							>
								{collapsedComposerText || "Ask anything..."}
							</button>
								<ComposerPrimaryActions
									compact
									disabled={disabled}
									hasSendableContent={sendState.hasSendableContent}
									isConnecting={sendState.isConnecting}
									isEnvironmentUnavailable={sendState.isEnvironmentUnavailable}
									isRunning={sendState.isRunning}
									isSending={sendState.isSendBusy}
								pendingAction={null}
								preserveComposerFocusOnPointerDown
									onInterrupt={onInterrupt}
									onImplementPlanInNewThread={onImplementPlanInNewThread}
								onPreviousPendingQuestion={previousPendingQuestion}
							/>
						</div>
					) : null}

					<div
						className={cn(
							"relative px-3 pb-2 pt-3.5 sm:px-4 sm:pt-4",
							isComposerCollapsedMobile && "hidden",
						)}
					>
						{attachments.length > 0 ? (
							<div className="mb-3 flex flex-wrap gap-2">
								{attachments.map((attachment) => (
									<div
										key={attachment.id}
										className="relative h-16 w-16 overflow-hidden rounded-lg border border-border/80 bg-background"
										style={{ height: 64, position: "relative", width: 64 }}
									>
										{attachment.previewUrl ? (
											<button
												type="button"
												className="h-full w-full cursor-zoom-in"
												style={{ inset: 0, position: "absolute", zIndex: 0 }}
												aria-label={`Preview ${attachment.name}`}
												onClick={() => expandImageAttachment(attachment.id)}
											>
												<img
													src={attachment.previewUrl}
													alt={attachment.name}
													className="h-full w-full object-cover"
												/>
											</button>
										) : (
											<div className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-muted-foreground/70">
												{attachment.name}
											</div>
										)}
										<Button
											type="button"
											variant="ghost"
											size="icon-xs"
											className="absolute right-1 top-1 z-10 bg-background/80 hover:bg-background/90"
											style={{
												height: 24,
												pointerEvents: "auto",
												position: "absolute",
												right: 4,
												top: 4,
												width: 24,
												zIndex: 3,
											}}
											aria-label={`Remove ${attachment.name}`}
											onClick={() => removeImageAttachment(attachment.id)}
										>
											<XIcon aria-hidden="true" />
										</Button>
									</div>
								))}
							</div>
						) : null}

						<ComposerPromptEditor
							ref={editorRef}
							ariaLabel={editorAriaLabel}
							disabled={disabled}
							placeholder={
								pendingUserInput
									? "Type your own answer, or leave this blank to use the selected option"
									: placeholder
							}
							onSnapshotChange={handleEditorSnapshotChange}
							onCommandKey={handleEditorCommandKey}
							onSubmit={handleEditorSubmit}
							onTriggerChange={setTrigger}
						/>
					</div>

					{isComposerCollapsedMobile ? null : (
						<div
							className={cn(
								"flex min-w-0 flex-nowrap items-center justify-between gap-2 overflow-visible px-2.5 pb-2.5",
								isComposerFooterCompact ? "gap-1.5" : "gap-2 sm:gap-0",
							)}
							data-chat-composer-footer="true"
							data-chat-composer-footer-compact={
								isComposerFooterCompact ? "true" : "false"
							}
						>
							<div className="-m-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
								<ProviderModelPicker
									compact={isComposerFooterCompact}
									disabled={Boolean(pendingUserInput) || disabled}
									favoriteModels={favoriteModels}
									model={model}
									modelOptions={modelOptions}
									open={isModelPickerOpen}
									onFavoriteModelsChange={setDraftFavoriteModels}
									onModelChange={(nextModel) => setDraftModel(draftKey, nextModel)}
									onOpenChange={setIsModelPickerOpen}
								/>
								{isComposerFooterCompact ? (
									<CompactComposerControlsMenu
										activePlan={showPlanToggle}
										disabled={Boolean(pendingUserInput) || disabled}
										effort={effort}
										interactionMode={interactionMode}
										planSidebarLabel={planSidebarLabel}
										planSidebarOpen={planSidebarOpen}
										runtimeMode={runtimeMode}
										showInteractionModeToggle={showInteractionModeToggle}
										onEffortChange={(nextEffort) =>
											setDraftEffort(draftKey, nextEffort)
										}
										onRuntimeModeChange={onRuntimeModeChange}
										onToggleInteractionMode={onToggleInteractionMode}
										onTogglePlanSidebar={onTogglePlanSidebar}
									/>
								) : (
									<>
										<Separator
											orientation="vertical"
											className="mx-0.5 hidden h-4 sm:block"
										/>
										<TraitsPicker
											disabled={Boolean(pendingUserInput) || disabled}
											effort={effort}
											onEffortChange={(nextEffort) =>
												setDraftEffort(draftKey, nextEffort)
											}
										/>
										<ComposerFooterModeControls
											interactionMode={interactionMode}
											planSidebarLabel={planSidebarLabel}
											planSidebarOpen={planSidebarOpen}
											runtimeMode={runtimeMode}
											showInteractionModeToggle={showInteractionModeToggle}
											showPlanToggle={showPlanToggle}
											onRuntimeModeChange={
												onRuntimeModeChange ?? noopRuntimeModeChange
											}
											onToggleInteractionMode={
												onToggleInteractionMode ?? noopAction
											}
											onTogglePlanSidebar={onTogglePlanSidebar ?? noopAction}
										/>
									</>
								)}
							</div>
							<div
								className="flex shrink-0 flex-nowrap items-center justify-end gap-2"
								data-chat-composer-actions="right"
								data-chat-composer-primary-actions-compact={
									isComposerPrimaryActionsCompact ? "true" : "false"
								}
							>
								<ComposerFooterPrimaryActions
									compact={isComposerPrimaryActionsCompact}
									contextWindow={contextWindow}
									disabled={pendingUserInput ? pendingRequestDisabled : disabled}
									hasSendableContent={sendState.hasSendableContent}
									isConnecting={sendState.isConnecting}
									isEnvironmentUnavailable={sendState.isEnvironmentUnavailable}
									isRunning={sendState.isRunning}
									isSending={sendState.isSendBusy}
									pendingAction={pendingAction}
									promptHasText={snapshot.text.trim().length > 0}
									preserveComposerFocusOnPointerDown={isMobileViewport}
									showPlanFollowUpPrompt={showPlanFollowUpPrompt}
									onInterrupt={onInterrupt}
									onImplementPlanInNewThread={onImplementPlanInNewThread}
									onPreviousPendingQuestion={previousPendingQuestion}
								/>
							</div>
						</div>
					)}
				</div>
			</div>
			{expandedImagePreview ? (
				<ExpandedImageDialog
					preview={expandedImagePreview}
					onClose={() => setExpandedImagePreview(null)}
				/>
			) : null}
		</form>
	);
});

const ComposerFooterPrimaryActions = memo(function ComposerFooterPrimaryActions({
	compact,
	contextWindow,
	disabled,
	hasSendableContent,
	isConnecting,
	isEnvironmentUnavailable,
	isRunning,
	isSending,
	onImplementPlanInNewThread,
	pendingAction,
	promptHasText,
	preserveComposerFocusOnPointerDown,
	showPlanFollowUpPrompt,
	onInterrupt,
	onPreviousPendingQuestion,
}: {
	compact: boolean;
	contextWindow: ContextWindowSnapshot | null;
	disabled: boolean;
	hasSendableContent: boolean;
	isConnecting: boolean;
	isEnvironmentUnavailable: boolean;
	isRunning: boolean;
	isSending: boolean;
	onImplementPlanInNewThread?: () => void;
	pendingAction: PendingActionState | null;
	promptHasText?: boolean;
	preserveComposerFocusOnPointerDown?: boolean;
	showPlanFollowUpPrompt?: boolean;
	onInterrupt: () => void;
	onPreviousPendingQuestion: () => void;
}) {
	return (
		<>
			{contextWindow ? <ContextWindowMeter usage={contextWindow} /> : null}
			<ComposerPrimaryActions
				compact={compact}
				disabled={disabled}
				hasSendableContent={hasSendableContent}
				isConnecting={isConnecting}
				isEnvironmentUnavailable={isEnvironmentUnavailable}
				isRunning={isRunning}
				isSending={isSending}
				pendingAction={pendingAction}
				promptHasText={promptHasText}
				preserveComposerFocusOnPointerDown={
					preserveComposerFocusOnPointerDown ?? false
				}
				showPlanFollowUpPrompt={showPlanFollowUpPrompt}
				onInterrupt={onInterrupt}
				onImplementPlanInNewThread={onImplementPlanInNewThread}
				onPreviousPendingQuestion={onPreviousPendingQuestion}
			/>
		</>
	);
});

function useComposerCommandItems(input: {
	composerCommands: readonly ChatComposerCommand[];
	composerSkills: readonly ChatComposerSkill[];
	mentionRefs: ComposerMentionTarget[];
	trigger: ComposerTrigger | null;
}): ComposerCommandItem[] {
	return useMemo(() => {
		if (!input.trigger) {
			return [];
		}

		if (input.trigger.kind === "path") {
			return searchComposerMentionTargets({
				targets: input.mentionRefs,
				query: input.trigger.query,
			}).map((mention) => ({
				description: "Add context to this chat",
				id: mention.path,
				label: mention.label,
				mention,
				path: mention.path,
				type: "path" as const,
			}));
		}

		if (input.trigger.kind === "skill") {
			const query = input.trigger.query.toLowerCase();
			return skillCommandItems(input.composerSkills).filter((item) =>
				item.label.toLowerCase().includes(query) ||
				item.description.toLowerCase().includes(query),
			);
		}

		return searchSlashCommandItems(
			[...builtInSlashCommandItems, ...appCommandItems(input.composerCommands)],
			input.trigger.query,
		);
	}, [input.composerCommands, input.composerSkills, input.mentionRefs, input.trigger]);
}

const builtInSlashCommandItems: Array<
	Extract<ComposerCommandItem, { type: "slash-command" }>
> = [
	{
		command: "model",
		description: "Open the model picker",
		id: "slash:model",
		label: "/model",
		type: "slash-command",
	},
	{
		command: "plan",
		description: "Switch this thread into plan mode",
		id: "slash:plan",
		label: "/plan",
		type: "slash-command",
	},
	{
		command: "default",
		description: "Switch this thread back to normal mode",
		id: "slash:default",
		label: "/default",
		type: "slash-command",
	},
];

function appCommandItems(
	commands: readonly ChatComposerCommand[],
): Array<Extract<ComposerCommandItem, { type: "slash-command" }>> {
	return commands.map((command) => ({
		command: command.name,
		description: command.description,
		disabled: command.disabled,
		id: `app-slash:${command.name}`,
		label: command.label ?? `/${command.name}`,
		type: "slash-command" as const,
		unavailableReason: command.unavailableReason,
	}));
}

const defaultAppComposerCommands: readonly ChatComposerCommand[] = [
	{
		description: "Start a new chat when the host app supports it",
		disabled: true,
		name: "new",
		unavailableReason: "New chat is controlled by the host app.",
	},
	{
		description: "Summarize this thread and compact context",
		name: "compact",
	},
	{
		description: "Toggle realtime voice mode when configured",
		disabled: true,
		name: "realtime",
		unavailableReason: "Realtime is not configured for this chat.",
	},
];

function skillCommandItems(
	skills: readonly ChatComposerSkill[],
): Array<Extract<ComposerCommandItem, { type: "skill" }>> {
	return skills.map((skill) => ({
		description: skill.description ?? "Insert this skill into the prompt",
		disabled: skill.disabled,
		id: `skill:${skill.name}`,
		label: skill.label ?? `$${skill.name}`,
		name: skill.name,
		type: "skill" as const,
		unavailableReason: skill.unavailableReason,
	}));
}
