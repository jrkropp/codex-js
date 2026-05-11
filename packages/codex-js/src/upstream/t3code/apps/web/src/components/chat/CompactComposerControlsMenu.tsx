import {
	BotIcon,
	EllipsisIcon,
	ListTodoIcon,
	LockIcon,
	LockOpenIcon,
	PenLineIcon,
} from "lucide-react";
import { memo } from "react";

import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type { CodexReasoningEffort } from "../../lib/modelSelection";
import type {
	ChatComposerInteractionMode,
	ChatComposerRuntimeMode,
} from "./ChatComposer";

import { TraitsPicker } from "./TraitsPicker";

const runtimeModeLabels: Record<
	ChatComposerRuntimeMode,
	{ description: string; icon: typeof LockIcon; label: string }
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
	runtimeModeLabels,
) as ChatComposerRuntimeMode[];

function isRuntimeMode(value: string): value is ChatComposerRuntimeMode {
	return runtimeModeOptions.includes(value as ChatComposerRuntimeMode);
}

export const CompactComposerControlsMenu = memo(
	function CompactComposerControlsMenu({
		activePlan = false,
		disabled,
		effort,
		interactionMode = "default",
		onRuntimeModeChange,
		onToggleInteractionMode,
		onTogglePlanSidebar,
		onEffortChange,
		planSidebarLabel = "Plan",
		planSidebarOpen = false,
		runtimeMode = "full-access",
		showInteractionModeToggle = true,
	}: {
		activePlan?: boolean;
		disabled?: boolean;
		effort: CodexReasoningEffort;
		interactionMode?: ChatComposerInteractionMode;
		onEffortChange: (effort: CodexReasoningEffort) => void;
		onRuntimeModeChange?: (mode: ChatComposerRuntimeMode) => void;
		onToggleInteractionMode?: () => void;
		onTogglePlanSidebar?: () => void;
		planSidebarLabel?: string;
		planSidebarOpen?: boolean;
		runtimeMode?: ChatComposerRuntimeMode;
		showInteractionModeToggle?: boolean;
	}) {
		return (
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="shrink-0 text-muted-foreground/70 hover:text-foreground/80"
						aria-label="More composer controls"
						disabled={disabled}
					>
						<EllipsisIcon aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" className="w-52">
					<DropdownMenuLabel>Reasoning</DropdownMenuLabel>
					<div className="px-1.5 pb-1">
						<TraitsPicker
							disabled={disabled}
							effort={effort}
							onEffortChange={onEffortChange}
						/>
					</div>
					<DropdownMenuSeparator />
					{showInteractionModeToggle ? (
						<DropdownMenuItem
							disabled={disabled}
							onSelect={(event) => {
								event.preventDefault();
								onToggleInteractionMode?.();
							}}
						>
							<BotIcon aria-hidden="true" className="size-4" />
							{interactionMode === "plan" ? "Plan" : "Build"}
						</DropdownMenuItem>
					) : null}
					<DropdownMenuLabel>Runtime mode</DropdownMenuLabel>
					<DropdownMenuRadioGroup
						value={runtimeMode}
						onValueChange={(value) => {
							if (isRuntimeMode(value)) {
								onRuntimeModeChange?.(value);
							}
						}}
					>
						{runtimeModeOptions.map((mode) => {
							const option = runtimeModeLabels[mode];
							const Icon = option.icon;
							return (
								<DropdownMenuRadioItem
									key={mode}
									value={mode}
									disabled={disabled}
								>
									<div className="grid gap-0.5">
										<span className="inline-flex items-center gap-1.5">
											<Icon aria-hidden="true" className="size-3.5" />
											{option.label}
										</span>
										<span className="text-muted-foreground text-xs">
											{option.description}
										</span>
									</div>
								</DropdownMenuRadioItem>
							);
						})}
					</DropdownMenuRadioGroup>
					{activePlan ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuItem
								disabled={disabled}
								onSelect={(event) => {
									event.preventDefault();
									onTogglePlanSidebar?.();
								}}
							>
								<ListTodoIcon aria-hidden="true" className="size-4" />
								{planSidebarOpen ? "Hide" : "Show"} {planSidebarLabel}
							</DropdownMenuItem>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
		);
	},
);
