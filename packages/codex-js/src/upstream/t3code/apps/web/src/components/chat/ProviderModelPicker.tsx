import { ChevronDownIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { Button } from "../ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "../ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import {
	codexModelOptions,
	defaultCodexProviderInstance,
	resolveCodexModelOption,
	type CodexModelOption,
	type ProviderInstanceEntry,
} from "../../lib/modelSelection";

import { ModelPickerContent } from "./ModelPickerContent";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { getTriggerDisplayModelLabel } from "./providerIconUtils";

export const ProviderModelPicker = memo(function ProviderModelPicker({
	className,
	compact = false,
	disabled = false,
	favoriteModels,
	instanceEntries = [defaultCodexProviderInstance],
	model,
	modelOptions = codexModelOptions,
	open,
	onFavoriteModelsChange,
	onModelChange,
	onOpenChange,
}: {
	className?: string;
	compact?: boolean;
	disabled?: boolean;
	favoriteModels: readonly string[];
	instanceEntries?: ReadonlyArray<ProviderInstanceEntry>;
	model: string;
	modelOptions?: readonly CodexModelOption[];
	open?: boolean;
	onFavoriteModelsChange: (models: string[]) => void;
	onModelChange: (model: string) => void;
	onOpenChange?: (open: boolean) => void;
}) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const isOpen = open ?? uncontrolledOpen;
	const activeModel = useMemo(() => resolveCodexModelOption(model), [model]);
	const activeInstance = instanceEntries[0] ?? defaultCodexProviderInstance;
	const triggerTitle = getTriggerDisplayModelLabel(activeModel);

	function setOpen(nextOpen: boolean) {
		onOpenChange?.(nextOpen);
		if (open === undefined) {
			setUncontrolledOpen(nextOpen);
		}
	}

	function toggleFavorite(modelSlug: string) {
		const next = favoriteModels.includes(modelSlug)
			? favoriteModels.filter((entry) => entry !== modelSlug)
			: [...favoriteModels, modelSlug];
		onFavoriteModelsChange(next);
	}

	return (
		<Popover
			open={isOpen}
			onOpenChange={(nextOpen) => {
				setOpen(disabled ? false : nextOpen);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					data-chat-provider-model-picker="true"
					className={cn(
						"min-w-0 justify-start overflow-hidden whitespace-nowrap px-2 text-muted-foreground/70 hover:text-foreground/80 [&_svg]:mx-0",
						compact ? "max-w-42 shrink-0" : "max-w-48 shrink sm:max-w-56 sm:px-3",
						className,
					)}
					disabled={disabled}
				>
					<span
						className={cn(
							"flex min-w-0 w-full box-border items-center gap-2 overflow-hidden",
							compact ? "max-w-36 sm:pl-1" : undefined,
						)}
					>
						<ProviderInstanceIcon
							className="size-4 shrink-0"
							iconClassName="size-4"
							driverKind={activeInstance.driverKind}
							displayName={activeInstance.displayName}
							accentColor={activeInstance.accentColor}
						/>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="min-w-0 flex-1 truncate text-left">
									{triggerTitle}
								</span>
							</TooltipTrigger>
							<TooltipContent side="top">{triggerTitle}</TooltipContent>
						</Tooltip>
						<ChevronDownIcon
							aria-hidden="true"
							className="size-3 shrink-0 opacity-60"
						/>
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="border-0 bg-transparent p-0 shadow-none ring-0"
			>
				<ModelPickerContent
					favoriteModels={favoriteModels}
					instanceEntries={instanceEntries}
					model={model}
					modelOptions={modelOptions}
					onRequestClose={() => setOpen(false)}
					onModelChange={(nextModel) => {
						onModelChange(nextModel);
						setOpen(false);
					}}
					onToggleFavorite={toggleFavorite}
				/>
			</PopoverContent>
		</Popover>
	);
});
