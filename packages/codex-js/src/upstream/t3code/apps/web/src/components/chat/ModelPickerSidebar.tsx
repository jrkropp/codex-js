import { Clock3Icon, StarIcon } from "lucide-react";
import { memo, useMemo } from "react";

import type {
	ProviderInstanceEntry,
	ProviderInstanceId,
} from "../../lib/modelSelection";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

function describeUnavailableInstance(entry: ProviderInstanceEntry): string {
	const label = entry.displayName;
	if (entry.status === "ready") {
		return label;
	}
	const kind =
		entry.status === "error"
			? "Unavailable"
			: entry.status === "warning"
				? "Limited"
				: entry.status === "disabled"
					? "Disabled in settings"
					: "Not ready";
	const msg = entry.snapshot.message?.trim();
	return msg ? `${label} - ${kind}. ${msg}` : `${label} - ${kind}.`;
}

const selectedButtonClass = "bg-background text-foreground shadow-sm";
const selectedIndicatorClass =
	"pointer-events-none absolute -right-1 top-1/2 z-10 h-5 w-0.5 -translate-y-1/2 rounded-l-full bg-primary";
const soonBadgeClass =
	"pointer-events-none absolute -right-0.5 top-0.5 z-10 flex size-3.5 items-center justify-center rounded-full bg-transparent text-muted-foreground shadow-sm";

export const ModelPickerSidebar = memo(function ModelPickerSidebar(props: {
	instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
	onSelectInstance: (instanceId: ProviderInstanceId | "favorites") => void;
	selectedInstanceId: ProviderInstanceId | "favorites";
	showComingSoon?: boolean;
	showFavorites?: boolean;
}) {
	const showFavorites = props.showFavorites ?? true;
	const showComingSoon = props.showComingSoon ?? true;
	const duplicateDriverCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const entry of props.instanceEntries) {
			counts.set(entry.driverKind, (counts.get(entry.driverKind) ?? 0) + 1);
		}
		return counts;
	}, [props.instanceEntries]);

	return (
		<div
			className="w-12 shrink-0 overflow-y-auto border-r bg-muted/30 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			data-model-picker-sidebar="true"
		>
			<div className="flex min-h-full flex-col gap-1 p-1">
				{showFavorites ? (
					<div className="mb-1 border-b pb-1">
						<div className="relative w-full">
							{props.selectedInstanceId === "favorites" ? (
								<div className={selectedIndicatorClass} />
							) : null}
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										className={cn(
											"relative isolate flex aspect-square w-full cursor-pointer items-center justify-center rounded transition-colors hover:bg-muted",
											props.selectedInstanceId === "favorites" && selectedButtonClass,
										)}
										onClick={() => props.onSelectInstance("favorites")}
										type="button"
										data-model-picker-provider="favorites"
										aria-label="Favorites"
									>
										<StarIcon className="size-5 shrink-0 fill-current" aria-hidden />
									</button>
								</TooltipTrigger>
								<TooltipContent side="left" align="center">
									Favorites
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
				) : null}

				{props.instanceEntries.map((entry) => {
					const isDisabled = !entry.isAvailable || entry.status !== "ready";
					const isSelected = props.selectedInstanceId === entry.instanceId;
					const showInstanceBadge =
						Boolean(entry.accentColor) ||
						(duplicateDriverCounts.get(entry.driverKind) ?? 0) > 1;
					const tooltip = isDisabled
						? describeUnavailableInstance(entry)
						: entry.displayName;

					return (
						<div key={entry.instanceId} className="relative w-full">
							{isSelected ? <div className={selectedIndicatorClass} /> : null}
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										data-model-picker-provider={entry.instanceId}
										className={cn(
											"relative isolate flex aspect-square w-full cursor-pointer items-center justify-center rounded transition-colors hover:bg-muted",
											isSelected && selectedButtonClass,
											isDisabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
										)}
										data-provider-accent-color={entry.accentColor}
										onClick={() => {
											if (!isDisabled) {
												props.onSelectInstance(entry.instanceId);
											}
										}}
										disabled={isDisabled}
										type="button"
										aria-label={tooltip}
									>
										<ProviderInstanceIcon
											driverKind={entry.driverKind}
											displayName={entry.displayName}
											accentColor={entry.accentColor}
											showBadge={showInstanceBadge}
											className="size-6"
											iconClassName="size-5"
										/>
									</button>
								</TooltipTrigger>
								<TooltipContent side="left" align="center" className="max-w-64 text-balance">
									{tooltip}
								</TooltipContent>
							</Tooltip>
						</div>
					);
				})}

				{showComingSoon ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<span className="relative block w-full">
								<button
									className="relative isolate flex aspect-square w-full cursor-not-allowed items-center justify-center rounded opacity-50 transition-colors hover:bg-transparent"
									disabled
									type="button"
									data-model-picker-provider="coming-soon"
									aria-label="More providers coming soon"
								>
									<Clock3Icon className="size-5 text-muted-foreground/85" aria-hidden />
									<span className={soonBadgeClass} aria-hidden>
										<Clock3Icon className="size-2" />
									</span>
								</button>
							</span>
						</TooltipTrigger>
						<TooltipContent side="left" align="center">
							More providers coming soon
						</TooltipContent>
					</Tooltip>
				) : null}
			</div>
		</div>
	);
});
