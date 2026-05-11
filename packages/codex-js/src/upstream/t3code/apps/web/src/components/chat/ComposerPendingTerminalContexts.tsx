import { cn } from "../../lib/utils";
import { TerminalContextInlineChip } from "./TerminalContextInlineChip";

export interface TerminalContextDraft {
	expiresAt?: number | null;
	id: string;
	label?: string | null;
	text: string;
}

interface ComposerPendingTerminalContextsProps {
	className?: string;
	contexts: ReadonlyArray<TerminalContextDraft>;
}

interface ComposerPendingTerminalContextChipProps {
	context: TerminalContextDraft;
}

export function formatTerminalContextLabel(context: TerminalContextDraft): string {
	return context.label?.trim() || `Terminal ${context.id}`;
}

export function isTerminalContextExpired(context: TerminalContextDraft): boolean {
	return typeof context.expiresAt === "number" && context.expiresAt <= Date.now();
}

export function ComposerPendingTerminalContextChip({
	context,
}: ComposerPendingTerminalContextChipProps) {
	const label = formatTerminalContextLabel(context);
	const expired = isTerminalContextExpired(context);
	const tooltipText = expired
		? `Terminal context expired. Remove and re-add ${label} to include it in your message.`
		: context.text;

	return (
		<TerminalContextInlineChip
			expired={expired}
			label={label}
			tooltipText={tooltipText}
		/>
	);
}

export function ComposerPendingTerminalContexts({
	className,
	contexts,
}: ComposerPendingTerminalContextsProps) {
	if (contexts.length === 0) {
		return null;
	}

	return (
		<div className={cn("flex flex-wrap gap-1.5", className)}>
			{contexts.map((context) => (
				<ComposerPendingTerminalContextChip key={context.id} context={context} />
			))}
		</div>
	);
}
