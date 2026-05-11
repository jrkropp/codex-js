import { ChevronDownIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";
import {
	codexReasoningEffortOptions,
	isCodexReasoningEffort,
	resolveCodexReasoningEffortOption,
	type CodexReasoningEffort,
} from "../../lib/modelSelection";

export const TraitsPicker = memo(function TraitsPicker({
	className,
	disabled = false,
	effort,
	onEffortChange,
}: {
	className?: string;
	disabled?: boolean;
	effort: CodexReasoningEffort;
	onEffortChange: (effort: CodexReasoningEffort) => void;
}) {
	const [open, setOpen] = useState(false);
	const selected = useMemo(() => resolveCodexReasoningEffortOption(effort), [effort]);

	return (
		<DropdownMenu
			open={open}
			onOpenChange={(nextOpen) => setOpen(disabled ? false : nextOpen)}
		>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={cn(
						"min-w-0 max-w-40 shrink justify-start overflow-hidden whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 sm:max-w-48 sm:px-3",
						className,
					)}
					disabled={disabled}
					title={selected.description}
				>
					<span className="flex min-w-0 w-full items-center gap-2 overflow-hidden">
						<span className="truncate">{selected.label}</span>
						<ChevronDownIcon
							aria-hidden="true"
							className="size-3 shrink-0 opacity-60"
						/>
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-64">
				<DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
				<DropdownMenuRadioGroup
					value={effort}
					onValueChange={(value) => {
						if (isCodexReasoningEffort(value)) {
							onEffortChange(value);
							setOpen(false);
						}
					}}
				>
					{codexReasoningEffortOptions.map((option) => (
						<DropdownMenuRadioItem key={option.value} value={option.value}>
							<div className="grid gap-0.5">
								<span>{option.label}</span>
								<span className="text-muted-foreground text-xs">
									{option.description}
								</span>
							</div>
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
});
