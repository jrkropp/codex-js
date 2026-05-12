import { CheckIcon, StarIcon } from "lucide-react";
import { memo } from "react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import type { CodexModelOption } from "../../lib/modelSelection";

export const ModelListRow = memo(function ModelListRow({
	index,
	isFavorite,
	isSelected,
	model,
	onSelect,
	onToggleFavorite,
}: {
	index: number;
	isFavorite: boolean;
	isSelected: boolean;
	model: CodexModelOption;
	onSelect: () => void;
	onToggleFavorite: () => void;
}) {
	return (
		<div
			className={cn(
				"group/model-row flex min-w-0 items-center gap-2 rounded-md px-2 py-2 transition-colors",
				isSelected ? "bg-muted text-foreground" : "hover:bg-muted/70",
			)}
		>
			<button
				type="button"
				className="grid min-w-0 flex-1 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 text-left"
				onClick={onSelect}
			>
				<span className="flex size-6 items-center justify-center rounded bg-muted/70 text-[11px] font-medium tabular-nums text-muted-foreground">
					{index + 1}
				</span>
				<span className="grid min-w-0 gap-0.5">
					<span className="truncate text-sm font-medium">{model.name}</span>
					<span className="truncate text-xs text-muted-foreground/70">
						{model.description}
					</span>
				</span>
				{isSelected ? (
					<CheckIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />
				) : null}
			</button>
			<Button
				type="button"
				size="icon-xs"
				variant="ghost"
				aria-label={isFavorite ? `Unfavorite ${model.name}` : `Favorite ${model.name}`}
				className={cn(
					"opacity-60 group-hover/model-row:opacity-100",
					isFavorite && "text-primary opacity-100",
				)}
				onClick={onToggleFavorite}
			>
				<StarIcon
					aria-hidden="true"
					className={cn(isFavorite && "fill-current")}
				/>
			</Button>
		</div>
	);
});
