import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin";
import {
	$applyNodeReplacement,
	$createLineBreakNode,
	$createParagraphNode,
	$createRangeSelection,
	$createTextNode,
	$getRoot,
	$getSelection,
	$isElementNode,
	$isLineBreakNode,
	$isRangeSelection,
	$isTextNode,
	$setSelection,
	COMMAND_PRIORITY_HIGH,
	COMMAND_PRIORITY_LOW,
	DecoratorNode,
	KEY_ARROW_DOWN_COMMAND,
	KEY_ARROW_UP_COMMAND,
	KEY_ENTER_COMMAND,
	KEY_TAB_COMMAND,
	SELECTION_CHANGE_COMMAND,
	type EditorState,
	type LexicalNode,
	type NodeKey,
	type SerializedLexicalNode,
	type Spread,
} from "lexical";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	type ReactElement,
	type Ref,
} from "react";

import { cn } from "../lib/utils";

import {
	createComposerPromptSnapshot,
	type ComposerPromptSnapshot,
} from "./chat/composer-editor-mentions";
import {
	detectComposerTrigger,
	replaceTextRange,
	type ComposerTrigger,
} from "./chat/composer-logic";
import {
	mentionBindingRangesForText,
	mentionBindingsAfterReplacement,
	normalizeMentionBindingsForText,
	type MentionBinding,
} from "./chat/mention-bindings";
import { mentionToken } from "./chat/mention-syntax";
import { type ComposerMentionTarget } from "./chat/composer-mention-targets";

export type ComposerPromptEditorHandle = {
	clear: () => void;
	focusAt: (cursor: number) => void;
	focusAtEnd: () => void;
	insertTextAtCursor: (
		text: string,
		options?: { source?: "manual" | "realtime" },
	) => void;
	insertMention: (
		mention: ComposerMentionTarget,
		trigger: ComposerTrigger | null,
	) => void;
	insertRecordingMeterPlaceholder: (text: string) => string;
	readSnapshot: () => ComposerPromptSnapshot;
	removeRecordingMeterPlaceholder: (id: string) => void;
	replaceRecordingMeterPlaceholder: (id: string, text: string) => void;
	setTextContentWithMentionBindings: (input: {
		mentionBindings?: MentionBinding[];
		text: string;
	}) => void;
	updateRecordingMeterInPlace: (id: string, text: string) => boolean;
};

type ComposerPromptEditorProps = {
	ariaLabel?: string;
	className?: string;
	disabled?: boolean;
	placeholder?: string;
	onCommandKey?: (
		key: "ArrowDown" | "ArrowUp" | "Enter" | "Tab",
		event: KeyboardEvent,
	) => boolean;
	onSnapshotChange?: (snapshot: ComposerPromptSnapshot) => void;
	onSubmit?: () => void;
	onTriggerChange?: (trigger: ComposerTrigger | null) => void;
};

type SerializedComposerMentionNode = Spread<
	{
		mention: string;
		path: string;
		type: "composer-mention";
		version: 1;
	},
	SerializedLexicalNode
>;

type SerializedComposerRecordingMeterNode = Spread<
	{
		id: string;
		text: string;
		type: "composer-recording-meter";
		version: 1;
	},
	SerializedLexicalNode
>;

class ComposerMentionNode extends DecoratorNode<ReactElement> {
	__mention: string;
	__path: string;

	static override getType(): string {
		return "composer-mention";
	}

	static override clone(node: ComposerMentionNode): ComposerMentionNode {
		return new ComposerMentionNode(node.__mention, node.__path, node.__key);
	}

	static override importJSON(
		serializedNode: SerializedComposerMentionNode,
	): ComposerMentionNode {
		return $createComposerMentionNode(
			serializedNode.mention,
			serializedNode.path,
		).updateFromJSON(serializedNode);
	}

	constructor(mention: string, path: string, key?: NodeKey) {
		super(key);
		this.__mention = mention.startsWith("@") ? mention.slice(1) : mention;
		this.__path = path;
	}

	override exportJSON(): SerializedComposerMentionNode {
		return {
			...super.exportJSON(),
			mention: this.__mention,
			path: this.__path,
			type: "composer-mention",
			version: 1,
		};
	}

	override createDOM(): HTMLElement {
		const dom = document.createElement("span");
		dom.className = "inline-flex align-middle leading-none";
		return dom;
	}

	override updateDOM(): false {
		return false;
	}

	override getTextContent(): string {
		return mentionToken(this.__mention);
	}

	override isInline(): true {
		return true;
	}

	override decorate(): ReactElement {
		return (
			<span
				className="inline-flex max-w-48 select-none items-center rounded-md border border-border/70 bg-muted/60 px-1.5 py-0.5 align-middle text-[0.9em] leading-none text-foreground"
				contentEditable={false}
				data-composer-mention-chip="true"
				title={this.__path}
			>
				<span className="truncate">{mentionToken(this.__mention)}</span>
			</span>
		);
	}
}

class ComposerRecordingMeterNode extends DecoratorNode<ReactElement> {
	__id: string;
	__text: string;

	static override getType(): string {
		return "composer-recording-meter";
	}

	static override clone(
		node: ComposerRecordingMeterNode,
	): ComposerRecordingMeterNode {
		return new ComposerRecordingMeterNode(node.__id, node.__text, node.__key);
	}

	static override importJSON(
		serializedNode: SerializedComposerRecordingMeterNode,
	): ComposerRecordingMeterNode {
		return $createComposerRecordingMeterNode(
			serializedNode.id,
			serializedNode.text,
		).updateFromJSON(serializedNode);
	}

	constructor(id: string, text: string, key?: NodeKey) {
		super(key);
		this.__id = id;
		this.__text = text;
	}

	override exportJSON(): SerializedComposerRecordingMeterNode {
		return {
			...super.exportJSON(),
			id: this.__id,
			text: this.__text,
			type: "composer-recording-meter",
			version: 1,
		};
	}

	override createDOM(): HTMLElement {
		const dom = document.createElement("span");
		dom.className = "inline-flex align-middle leading-none";
		return dom;
	}

	override updateDOM(): false {
		return false;
	}

	override getTextContent(): string {
		return "";
	}

	override isInline(): true {
		return true;
	}

	setText(text: string): ComposerRecordingMeterNode {
		const writable = this.getWritable();
		writable.__text = text;
		return writable;
	}

	override decorate(): ReactElement {
		return (
			<span
				className="inline-flex select-none items-center rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 align-middle font-mono text-[0.9em] leading-none text-muted-foreground"
				contentEditable={false}
				data-composer-recording-meter="true"
				title="Realtime voice"
			>
				{this.__text}
			</span>
		);
	}
}

function $createComposerMentionNode(
	mention: string,
	path: string,
): ComposerMentionNode {
	return $applyNodeReplacement(new ComposerMentionNode(mention, path));
}

function $createComposerRecordingMeterNode(
	id: string,
	text: string,
): ComposerRecordingMeterNode {
	return $applyNodeReplacement(new ComposerRecordingMeterNode(id, text));
}

export const ComposerPromptEditor = forwardRef<
	ComposerPromptEditorHandle,
	ComposerPromptEditorProps
>(function ComposerPromptEditor(props, ref: Ref<ComposerPromptEditorHandle>) {
	const editorConfig = useMemo<InitialConfigType>(
		() => ({
			namespace: "CodexAssistantComposer",
			nodes: [ComposerMentionNode, ComposerRecordingMeterNode],
			onError(error) {
				throw error;
			},
			theme: {
				paragraph: "m-0",
			},
		}),
		[],
	);

	return (
		<LexicalComposer initialConfig={editorConfig}>
			<ComposerPromptEditorInner {...props} editorRef={ref} />
		</LexicalComposer>
	);
});

function ComposerPromptEditorInner({
	ariaLabel = "Message Codex",
	className,
	disabled = false,
	editorRef,
	onCommandKey,
	onSnapshotChange,
	onSubmit,
	onTriggerChange,
	placeholder = "Message Codex...",
}: ComposerPromptEditorProps & {
	editorRef: Ref<ComposerPromptEditorHandle>;
}) {
	const [editor] = useLexicalComposerContext();
	const snapshotRef = useRef<ComposerPromptSnapshot>(
		createComposerPromptSnapshot(""),
	);

	const publishSnapshot = useCallback(
		(snapshot: Readonly<EditorSnapshot>) => {
			const composerSnapshot = createComposerPromptSnapshot(
				snapshot.text,
				snapshot.mentionBindings,
			);
			snapshotRef.current = composerSnapshot;
			onSnapshotChange?.(composerSnapshot);
			onTriggerChange?.(detectComposerTrigger(snapshot.text, snapshot.cursor));
		},
		[onSnapshotChange, onTriggerChange],
	);

	const replaceEditorContent = useCallback(
		(input: {
			text: string;
			mentionBindings?: MentionBinding[];
			cursor?: number;
			focus?: boolean;
		}) => {
			editor.update(() => {
				$replaceRootTextWithMentions(
					input.text,
					input.mentionBindings ?? [],
					input.cursor ?? input.text.length,
				);
				publishSnapshot($readEditorSnapshot());
			});
			if (input.focus) {
				window.requestAnimationFrame(() => editor.focus());
			}
		},
		[editor, publishSnapshot],
	);

	const focusAt = useCallback(
		(cursor: number) => {
			editor.update(() => {
				const snapshot = $readEditorSnapshot();
				$setSelectionAtComposerOffset(
					Math.max(0, Math.min(cursor, snapshot.text.length)),
				);
				publishSnapshot($readEditorSnapshot());
			});
			window.requestAnimationFrame(() => editor.focus());
		},
		[editor, publishSnapshot],
	);

	useImperativeHandle(
		editorRef,
		() => ({
			clear() {
				replaceEditorContent({ text: "", mentionBindings: [], cursor: 0 });
			},
			focusAt,
			focusAtEnd() {
				focusAt(snapshotRef.current.text.length);
			},
			insertTextAtCursor(text) {
				editor.update(() => {
					const snapshot = $readEditorSnapshot();
					const insertion = composerPlainTextInsertion(snapshot, text);
					if (!insertion) {
						return;
					}
					const cursor = Math.max(
						0,
						Math.min(snapshot.cursor, snapshot.text.length),
					);
					const next = replaceTextRange(
						snapshot.text,
						cursor,
						cursor,
						insertion,
					);
					$replaceRootTextWithMentions(
						next.text,
						normalizeMentionBindingsForText(
							next.text,
							snapshot.mentionBindings,
						),
						next.cursor,
					);
					publishSnapshot($readEditorSnapshot());
				});
				window.requestAnimationFrame(() => editor.focus());
			},
			insertMention(mention, trigger) {
				const snapshot = snapshotRef.current;
				const range =
					trigger?.kind === "path"
						? { end: trigger.rangeEnd, start: trigger.rangeStart }
						: { end: snapshot.text.length, start: snapshot.text.length };
				const replacement = `${mentionToken(mention.binding.mention)} `;
				const next = replaceTextRange(
					snapshot.text,
					range.start,
					range.end,
					replacement,
				);
				replaceEditorContent({
					text: next.text,
					cursor: next.cursor,
					focus: true,
					mentionBindings: mentionBindingsAfterReplacement({
						currentBindings: snapshot.mentionBindings,
						insertedBinding: mention.binding,
						nextText: next.text,
						rangeEnd: range.end,
						rangeStart: range.start,
						replacement,
						text: snapshot.text,
					}),
				});
			},
			insertRecordingMeterPlaceholder(text) {
				const id = createRecordingMeterId();
				editor.update(() => {
					const node = $createComposerRecordingMeterNode(id, text);
					const selection = $getSelection();
					if ($isRangeSelection(selection)) {
						selection.insertNodes([node]);
						$setSelectionAfterNode(node);
					} else {
						const root = $getRoot();
						const existingParagraph = root.getFirstChild();
						const paragraph = $isElementNode(existingParagraph)
							? existingParagraph
							: $createParagraphNode();
						if (paragraph !== existingParagraph) {
							root.clear();
							root.append(paragraph);
						}
						paragraph.append(node);
						$setSelectionAfterNode(node);
					}
					publishSnapshot($readEditorSnapshot());
				});
				window.requestAnimationFrame(() => editor.focus());
				return id;
			},
			readSnapshot() {
				return snapshotRef.current;
			},
			removeRecordingMeterPlaceholder(id) {
				editor.update(() => {
					const node = $findRecordingMeterNode(id);
					if (!node) {
						return;
					}
					node.remove();
					publishSnapshot($readEditorSnapshot());
				});
			},
			replaceRecordingMeterPlaceholder(id, text) {
				editor.update(() => {
					const node = $findRecordingMeterNode(id);
					if (!node) {
						return;
					}
					const snapshot = $readEditorSnapshot();
					const offset = $recordingMeterTextOffset(id) ?? snapshot.cursor;
					const insertion = composerPlainTextInsertion(
						{ ...snapshot, cursor: offset },
						text,
					);
					const next = replaceTextRange(
						snapshot.text,
						offset,
						offset,
						insertion,
					);
					$replaceRootTextWithMentions(
						next.text,
						normalizeMentionBindingsForText(
							next.text,
							snapshot.mentionBindings,
						),
						next.cursor,
					);
					publishSnapshot($readEditorSnapshot());
				});
				window.requestAnimationFrame(() => editor.focus());
			},
			setTextContentWithMentionBindings(input) {
				replaceEditorContent({
					text: input.text,
					mentionBindings: input.mentionBindings ?? [],
					cursor: input.text.length,
					focus: true,
				});
			},
			updateRecordingMeterInPlace(id, text) {
				let updated = false;
				editor.update(() => {
					const node = $findRecordingMeterNode(id);
					if (!node) {
						return;
					}
					node.setText(text);
					updated = true;
				});
				return updated;
			},
		}),
		[editor, focusAt, publishSnapshot, replaceEditorContent],
	);

	useEffect(() => {
		editor.setEditable(!disabled);
	}, [disabled, editor]);

	useEffect(() => {
		return editor.registerCommand(
			KEY_ENTER_COMMAND,
			(event) => {
				if (event?.shiftKey) {
					return false;
				}
				if (event && onCommandKey?.("Enter", event)) {
					event.preventDefault();
					return true;
				}
				event?.preventDefault();
				onSubmit?.();
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
	}, [editor, onCommandKey, onSubmit]);

	useEffect(() => {
		return editor.registerCommand(
			KEY_ARROW_DOWN_COMMAND,
			(event) => {
				if (!event || !onCommandKey?.("ArrowDown", event)) {
					return false;
				}
				event.preventDefault();
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
	}, [editor, onCommandKey]);

	useEffect(() => {
		return editor.registerCommand(
			KEY_ARROW_UP_COMMAND,
			(event) => {
				if (!event || !onCommandKey?.("ArrowUp", event)) {
					return false;
				}
				event.preventDefault();
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
	}, [editor, onCommandKey]);

	useEffect(() => {
		return editor.registerCommand(
			KEY_TAB_COMMAND,
			(event) => {
				if (!event || !onCommandKey?.("Tab", event)) {
					return false;
				}
				event.preventDefault();
				return true;
			},
			COMMAND_PRIORITY_HIGH,
		);
	}, [editor, onCommandKey]);

	useEffect(() => {
		return editor.registerCommand(
			SELECTION_CHANGE_COMMAND,
			() => {
				editor.getEditorState().read(() => {
					const snapshot = $readEditorSnapshot();
					snapshotRef.current = createComposerPromptSnapshot(
						snapshot.text,
						snapshot.mentionBindings,
					);
					onTriggerChange?.(detectComposerTrigger(snapshot.text, snapshot.cursor));
				});
				return false;
			},
			COMMAND_PRIORITY_LOW,
		);
	}, [editor, onTriggerChange]);

	function handleEditorChange(editorState: EditorState) {
		editorState.read(() => {
			publishSnapshot($readEditorSnapshot());
		});
	}

	return (
		<div
			className={cn(
				"relative",
				disabled && "cursor-not-allowed opacity-60",
				className,
			)}
			onClick={() => {
				if (!disabled) {
					editor.focus();
				}
			}}
		>
			<PlainTextPlugin
				contentEditable={
					<ContentEditable
						aria-label={ariaLabel}
						aria-placeholder={placeholder}
						className="block max-h-[200px] min-h-17.5 w-full overflow-y-auto whitespace-pre-wrap wrap-break-word bg-transparent text-[16px] leading-relaxed text-foreground outline-none focus:outline-none sm:text-[14px]"
						placeholder={<span />}
						spellCheck
					/>
				}
				placeholder={
					<div className="pointer-events-none absolute inset-0 text-[16px] leading-relaxed text-muted-foreground/35 sm:text-[14px]">
						{placeholder}
					</div>
				}
				ErrorBoundary={LexicalErrorBoundary}
			/>
			<HistoryPlugin />
			<OnChangePlugin onChange={handleEditorChange} />
		</div>
	);
}

type EditorSnapshot = {
	cursor: number;
	mentionBindings: MentionBinding[];
	text: string;
};

function $replaceRootTextWithMentions(
	text: string,
	bindings: readonly MentionBinding[],
	cursor: number,
) {
	const root = $getRoot();
	root.clear();
	const paragraph = $createParagraphNode();
	root.append(paragraph);
	const ranges = mentionBindingRangesForText(text, bindings);
	let index = 0;
	for (const item of ranges) {
		appendPlainText(paragraph, text.slice(index, item.range.start));
		paragraph.append(
			$createComposerMentionNode(item.binding.mention, item.binding.path),
		);
		index = item.range.end;
	}
	appendPlainText(paragraph, text.slice(index));
	$setSelectionAtComposerOffset(cursor);
}

function composerPlainTextInsertion(
	snapshot: EditorSnapshot,
	text: string,
): string {
	const trimmed = text.trim();
	if (!trimmed) {
		return "";
	}
	const cursor = Math.max(0, Math.min(snapshot.cursor, snapshot.text.length));
	const before = snapshot.text.slice(0, cursor);
	const after = snapshot.text.slice(cursor);
	const needsLeadingSpace =
		before.length > 0 && !/\s$/.test(before) && !/^\s/.test(trimmed);
	const needsTrailingSpace =
		after.length > 0 && !/\s$/.test(trimmed) && !/^\s/.test(after);
	return `${needsLeadingSpace ? " " : ""}${trimmed}${needsTrailingSpace ? " " : ""}`;
}

function appendPlainText(parent: ReturnType<typeof $createParagraphNode>, text: string) {
	if (!text) {
		return;
	}
	const parts = text.split("\n");
	parts.forEach((part, index) => {
		if (index > 0) {
			parent.append($createLineBreakNode());
		}
		if (part) {
			parent.append($createTextNode(part));
		}
	});
}

function $readEditorSnapshot(): EditorSnapshot {
	const root = $getRoot();
	const selection = $getSelection();
	const selectionPoint =
		$isRangeSelection(selection) && selection.isCollapsed()
			? {
					key: selection.anchor.key,
					offset: selection.anchor.offset,
				}
			: null;
	const state = {
		cursor: 0,
		mentionBindings: [] as MentionBinding[],
		selectionOffset: null as number | null,
		text: "",
	};

	for (const child of root.getChildren()) {
		appendNodeSnapshot(child, state, selectionPoint);
	}

	return {
		cursor: state.selectionOffset ?? state.text.length,
		mentionBindings: state.mentionBindings,
		text: state.text,
	};
}

function appendNodeSnapshot(
	node: LexicalNode,
	state: {
		cursor: number;
		mentionBindings: MentionBinding[];
		selectionOffset: number | null;
		text: string;
	},
	selectionPoint: { key: string; offset: number } | null,
) {
	if ($isTextNode(node)) {
		if (selectionPoint?.key === node.getKey()) {
			state.selectionOffset = state.text.length + selectionPoint.offset;
		}
		state.text += node.getTextContent();
		return;
	}

	if (node instanceof ComposerMentionNode) {
		if (selectionPoint?.key === node.getKey()) {
			state.selectionOffset =
				state.text.length +
				(selectionPoint.offset > 0 ? node.getTextContent().length : 0);
		}
		state.mentionBindings.push({
			mention: node.__mention,
			path: node.__path,
		});
		state.text += node.getTextContent();
		return;
	}

	if (node instanceof ComposerRecordingMeterNode) {
		if (selectionPoint?.key === node.getKey()) {
			state.selectionOffset = state.text.length;
		}
		return;
	}

	if ($isLineBreakNode(node)) {
		state.text += "\n";
		return;
	}

	if ($isElementNode(node)) {
		const children = node.getChildren();
		if (selectionPoint?.key === node.getKey()) {
			const boundedOffset = Math.max(
				0,
				Math.min(selectionPoint.offset, children.length),
			);
			state.selectionOffset =
				state.text.length +
				children
					.slice(0, boundedOffset)
					.reduce((total, child) => total + composerNodeTextLength(child), 0);
		}
		children.forEach((child, index) => {
			if (index > 0 && node === $getRoot()) {
				state.text += "\n";
			}
			appendNodeSnapshot(child, state, selectionPoint);
		});
	}
}

function composerNodeTextLength(node: LexicalNode): number {
	if ($isTextNode(node)) {
		return node.getTextContentSize();
	}
	if (node instanceof ComposerMentionNode) {
		return node.getTextContent().length;
	}
	if (node instanceof ComposerRecordingMeterNode) {
		return 0;
	}
	if ($isLineBreakNode(node)) {
		return 1;
	}
	if ($isElementNode(node)) {
		return node
			.getChildren()
			.reduce((total, child) => total + composerNodeTextLength(child), 0);
	}
	return 0;
}

function $setSelectionAtComposerOffset(offset: number) {
	const root = $getRoot();
	const point = findSelectionPoint(root, { remaining: offset }) ?? {
		key: root.getKey(),
		offset: root.getChildrenSize(),
		type: "element" as const,
	};
	const selection = $createRangeSelection();
	selection.anchor.set(point.key, point.offset, point.type);
	selection.focus.set(point.key, point.offset, point.type);
	$setSelection(selection);
}

function findSelectionPoint(
	node: LexicalNode,
	ref: { remaining: number },
): { key: string; offset: number; type: "element" | "text" } | null {
	if ($isTextNode(node)) {
		const length = node.getTextContentSize();
		if (ref.remaining <= length) {
			return {
				key: node.getKey(),
				offset: Math.max(0, ref.remaining),
				type: "text",
			};
		}
		ref.remaining -= length;
		return null;
	}

	if (node instanceof ComposerMentionNode) {
		const parent = node.getParent();
		if (!parent || !$isElementNode(parent)) {
			return null;
		}
		const length = node.getTextContent().length;
		if (ref.remaining <= length) {
			return {
				key: parent.getKey(),
				offset: node.getIndexWithinParent() + (ref.remaining > 0 ? 1 : 0),
				type: "element",
			};
		}
		ref.remaining -= length;
		return null;
	}

	if (node instanceof ComposerRecordingMeterNode) {
		if (ref.remaining <= 0) {
			const parent = node.getParent();
			if (!$isElementNode(parent)) {
				return null;
			}
			return {
				key: parent.getKey(),
				offset: node.getIndexWithinParent(),
				type: "element",
			};
		}
		return null;
	}

	if ($isLineBreakNode(node)) {
		const parent = node.getParent();
		if (!parent) {
			return null;
		}
		if (ref.remaining <= 1) {
			return {
				key: parent.getKey(),
				offset: node.getIndexWithinParent() + (ref.remaining > 0 ? 1 : 0),
				type: "element",
			};
		}
		ref.remaining -= 1;
		return null;
	}

	if ($isElementNode(node)) {
		const children = node.getChildren();
		for (const child of children) {
			const point = findSelectionPoint(child, ref);
			if (point) {
				return point;
			}
		}
		if (ref.remaining === 0) {
			return {
				key: node.getKey(),
				offset: children.length,
				type: "element",
			};
		}
	}

	return null;
}

function $findRecordingMeterNode(
	id: string,
	node: LexicalNode = $getRoot(),
): ComposerRecordingMeterNode | null {
	if (node instanceof ComposerRecordingMeterNode) {
		return node.__id === id ? node : null;
	}
	if (!$isElementNode(node)) {
		return null;
	}
	for (const child of node.getChildren()) {
		const match = $findRecordingMeterNode(id, child);
		if (match) {
			return match;
		}
	}
	return null;
}

function $recordingMeterTextOffset(
	id: string,
	node: LexicalNode = $getRoot(),
	offset = { value: 0 },
): number | null {
	if (node instanceof ComposerRecordingMeterNode) {
		return node.__id === id ? offset.value : null;
	}
	if ($isTextNode(node)) {
		offset.value += node.getTextContentSize();
		return null;
	}
	if (node instanceof ComposerMentionNode) {
		offset.value += node.getTextContent().length;
		return null;
	}
	if ($isLineBreakNode(node)) {
		offset.value += 1;
		return null;
	}
	if ($isElementNode(node)) {
		for (const child of node.getChildren()) {
			const match = $recordingMeterTextOffset(id, child, offset);
			if (match !== null) {
				return match;
			}
		}
	}
	return null;
}

function $setSelectionAfterNode(node: LexicalNode) {
	const parent = node.getParent();
	if (!$isElementNode(parent)) {
		return;
	}
	const selection = $createRangeSelection();
	const offset = node.getIndexWithinParent() + 1;
	selection.anchor.set(parent.getKey(), offset, "element");
	selection.focus.set(parent.getKey(), offset, "element");
	$setSelection(selection);
}

function createRecordingMeterId(): string {
	if (globalThis.crypto?.randomUUID) {
		return `recording-meter:${globalThis.crypto.randomUUID()}`;
	}
	return `recording-meter:${Date.now().toString(36)}:${Math.random()
		.toString(36)
		.slice(2)}`;
}
