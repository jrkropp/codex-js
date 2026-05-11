import { TerminalIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import {
	COMPOSER_INLINE_CHIP_CLASS_NAME,
	COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
	COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME,
} from "../composerInlineChip";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "../ui/tooltip";

interface TerminalContextInlineChipProps {
	expired?: boolean;
	label: string;
	tooltipText: string;
}

export function TerminalContextInlineChip(props: TerminalContextInlineChipProps) {
	const { expired = false, label, tooltipText } = props;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className={cn(
						COMPOSER_INLINE_CHIP_CLASS_NAME,
						expired && "border-destructive/35 bg-destructive/8 text-destructive",
					)}
					data-terminal-context-expired={expired ? "true" : undefined}
				>
					<TerminalIcon
						aria-hidden="true"
						className={cn(
							COMPOSER_INLINE_CHIP_ICON_CLASS_NAME,
							"size-3.5",
							expired && "opacity-100",
						)}
					/>
					<span className={COMPOSER_INLINE_CHIP_LABEL_CLASS_NAME}>{label}</span>
				</span>
			</TooltipTrigger>
			<TooltipContent className="max-w-80 whitespace-pre-wrap leading-tight" side="top">
				{tooltipText}
			</TooltipContent>
		</Tooltip>
	);
}
