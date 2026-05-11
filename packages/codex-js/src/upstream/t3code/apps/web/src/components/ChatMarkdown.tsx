import { CheckIcon, CopyIcon } from "lucide-react";
import {
	Children,
	Suspense,
	isValidElement,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type ChatMarkdownProps = {
	cwd?: string | undefined;
	isStreaming?: boolean;
	text: string;
};

const CODE_FENCE_LANGUAGE_REGEX = /(?:^|\s)language-([^\s]+)/;

function extractFenceLanguage(className: string | undefined): string {
	const match = className?.match(CODE_FENCE_LANGUAGE_REGEX);
	return match?.[1] ?? "text";
}

function nodeToPlainText(node: ReactNode): string {
	if (typeof node === "string" || typeof node === "number") {
		return String(node);
	}
	if (Array.isArray(node)) {
		return node.map((child) => nodeToPlainText(child)).join("");
	}
	if (isValidElement<{ children?: ReactNode }>(node)) {
		return nodeToPlainText(node.props.children);
	}
	return "";
}

function extractCodeBlock(
	children: ReactNode,
): { className: string | undefined; code: string } | null {
	const childNodes = Children.toArray(children);
	if (childNodes.length !== 1) {
		return null;
	}

	const onlyChild = childNodes[0];
	if (!isValidElement<{ className?: string; children?: ReactNode }>(onlyChild)) {
		return null;
	}

	return {
		className: onlyChild.props.className,
		code: nodeToPlainText(onlyChild.props.children),
	};
}

function MarkdownCodeBlock({
	children,
	code,
	language,
}: {
	children: ReactNode;
	code: string;
	language: string;
}) {
	const [copied, setCopied] = useState(false);
	const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const handleCopy = useCallback(() => {
		if (!navigator.clipboard?.writeText) {
			return;
		}
		void navigator.clipboard.writeText(code).then(() => {
			if (copiedTimerRef.current !== null) {
				clearTimeout(copiedTimerRef.current);
			}
			setCopied(true);
			copiedTimerRef.current = setTimeout(() => {
				setCopied(false);
				copiedTimerRef.current = null;
			}, 1200);
		});
	}, [code]);

	useEffect(
		() => () => {
			if (copiedTimerRef.current !== null) {
				clearTimeout(copiedTimerRef.current);
			}
		},
		[],
	);

	return (
		<div className="chat-markdown-codeblock group/code relative my-3 overflow-hidden rounded-lg border bg-muted/35">
			<div className="flex h-8 items-center justify-between border-b bg-muted/45 px-3">
				<span className="truncate font-mono text-[11px] text-muted-foreground">
					{language}
				</span>
				<Button
					type="button"
					size="icon-xs"
					variant="ghost"
					aria-label={copied ? "Copied code" : "Copy code"}
					title={copied ? "Copied" : "Copy code"}
					onClick={handleCopy}
				>
					{copied ? <CheckIcon /> : <CopyIcon />}
				</Button>
			</div>
			{children}
		</div>
	);
}

export const ChatMarkdown = memo(function ChatMarkdown({
	isStreaming = false,
	text,
}: ChatMarkdownProps) {
	const markdownComponents = useMemo<Components>(
		() => ({
			a({ href, ...props }) {
				return (
					<a
						{...props}
						href={href}
						target="_blank"
						rel="noopener noreferrer"
					/>
				);
			},
			code({ className, children, ...props }) {
				const codeProps = { ...props } as typeof props & {
					node?: unknown;
				};
				delete codeProps.node;
				const code = nodeToPlainText(children);
				return (
					<code
						{...codeProps}
						className={cn(
							className,
							"rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]",
						)}
					>
						{code}
					</code>
				);
			},
			pre({ children }) {
				const block = extractCodeBlock(children);
				if (!block) {
					return (
						<pre className="my-3 overflow-x-auto rounded-lg border bg-muted/35 p-3">
							{children}
						</pre>
					);
				}
				const language = extractFenceLanguage(block.className);
				return (
					<MarkdownCodeBlock code={block.code} language={language}>
						<pre className="overflow-x-auto p-3 text-[13px] leading-5">
							<code className={block.className}>{block.code}</code>
						</pre>
					</MarkdownCodeBlock>
				);
			},
		}),
		[],
	);

	return (
		<div
			className={cn(
				"chat-markdown min-w-0 max-w-none text-sm leading-6",
				"prose prose-sm dark:prose-invert",
				"prose-headings:mb-2 prose-headings:mt-4 prose-headings:font-semibold",
				"prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5",
				"prose-table:my-3 prose-th:border prose-th:px-2 prose-th:py-1 prose-td:border prose-td:px-2 prose-td:py-1",
				"prose-a:text-primary prose-a:underline-offset-4 hover:prose-a:underline",
				isStreaming && "after:ml-0.5 after:animate-pulse after:content-['|']",
			)}
		>
			<Suspense fallback={<p className="whitespace-pre-wrap">{text}</p>}>
				<ReactMarkdown
					components={markdownComponents}
					remarkPlugins={[remarkGfm]}
					urlTransform={defaultUrlTransform}
				>
					{text}
				</ReactMarkdown>
			</Suspense>
		</div>
	);
});

export default ChatMarkdown;
