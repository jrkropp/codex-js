import {
	ArchiveIcon,
	BotIcon,
	BoxIcon,
	MessageSquarePlusIcon,
	SparklesIcon,
	UserRoundIcon,
} from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef } from "react";

import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "../ui/command";
import { cn } from "../../lib/utils";

import type { ComposerSlashCommand, ComposerTriggerKind } from "./composer-logic";
import type { ComposerMentionTarget } from "./composer-mention-targets";

export type ComposerCommandItem =
	| {
			description: string;
			id: string;
			label: string;
			mention: ComposerMentionTarget;
			path: string;
			type: "path";
	  }
	| {
			command: ComposerSlashCommand;
			description: string;
			disabled?: boolean;
			id: string;
			label: string;
			type: "slash-command";
			unavailableReason?: string;
	  }
	| {
			description: string;
			disabled?: boolean;
			id: string;
			label: string;
			name: string;
			type: "skill";
			unavailableReason?: string;
	  };

type ComposerCommandGroup = {
	id: string;
	items: ComposerCommandItem[];
	label: string | null;
};

export const ComposerCommandMenu = memo(function ComposerCommandMenu(props: {
	activeItemId: string | null;
	emptyStateText?: string;
	isLoading?: boolean;
	items: ComposerCommandItem[];
	triggerKind: ComposerTriggerKind | null;
	onHighlightedItemChange: (itemId: string | null) => void;
	onSelect: (item: ComposerCommandItem) => void;
}) {
	const listRef = useRef<HTMLDivElement | null>(null);
	const groups = useMemo(
		() => groupCommandItems(props.items, props.triggerKind),
		[props.items, props.triggerKind],
	);

	useLayoutEffect(() => {
		if (!props.activeItemId || !listRef.current) {
			return;
		}
		const item = listRef.current.querySelector<HTMLElement>(
			`[data-composer-item-id="${CSS.escape(props.activeItemId)}"]`,
		);
		item?.scrollIntoView({ block: "nearest" });
	}, [props.activeItemId]);

	return (
		<Command
			loop
			shouldFilter={false}
			onValueChange={(value) => props.onHighlightedItemChange(value || null)}
		>
			<div
				ref={listRef}
				className="relative overflow-hidden rounded-xl border border-border/80 bg-popover/96 shadow-lg/8 backdrop-blur-xs"
			>
				<CommandList className="max-h-72">
					{groups.map((group, index) => (
						<div key={group.id}>
							{index > 0 ? <CommandSeparator className="my-0.5" /> : null}
							<CommandGroup heading={group.label ?? undefined}>
								{group.items.map((item) => (
									<ComposerCommandMenuItem
										key={item.id}
										item={item}
										isActive={props.activeItemId === item.id}
										onHighlight={props.onHighlightedItemChange}
										onSelect={props.onSelect}
									/>
								))}
							</CommandGroup>
						</div>
					))}
					{props.items.length === 0 ? (
						<CommandEmpty>
							{props.isLoading
								? "Searching..."
								: (props.emptyStateText ?? emptyStateForTrigger(props.triggerKind))}
						</CommandEmpty>
					) : null}
				</CommandList>
			</div>
		</Command>
	);
});

function ComposerCommandMenuItem(props: {
	isActive: boolean;
	item: ComposerCommandItem;
	onHighlight: (itemId: string | null) => void;
	onSelect: (item: ComposerCommandItem) => void;
}) {
	const disabled = "disabled" in props.item ? Boolean(props.item.disabled) : false;

	return (
		<CommandItem
			value={props.item.id}
			data-composer-item-id={props.item.id}
			data-composer-disabled={disabled ? "true" : undefined}
			aria-disabled={disabled}
			className={cn(
				"cursor-pointer select-none gap-2 hover:bg-transparent hover:text-inherit data-selected:bg-transparent data-[selected=true]:bg-transparent",
				props.isActive && "bg-accent! text-accent-foreground!",
				disabled && "opacity-55",
			)}
			onMouseMove={() => {
				if (!props.isActive) {
					props.onHighlight(props.item.id);
				}
			}}
			onMouseDown={(event) => event.preventDefault()}
			onSelect={() => props.onSelect(props.item)}
		>
			<CommandItemIcon item={props.item} />
			<span className="flex min-w-0 flex-1 items-center gap-2">
				<span className="shrink-0">{props.item.label}</span>
				<span className="min-w-0 flex-1 truncate text-muted-foreground/70 text-xs">
					{"unavailableReason" in props.item && props.item.unavailableReason
						? props.item.unavailableReason
						: props.item.description}
				</span>
			</span>
		</CommandItem>
	);
}

function CommandItemIcon({ item }: { item: ComposerCommandItem }) {
	if (item.type === "path") {
		return <UserRoundIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/80" />;
	}
	if (item.type === "skill") {
		return <BoxIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/80" />;
	}

	switch (item.command) {
		case "model":
		case "plan":
		case "default":
			return <BotIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/80" />;
		case "new":
			return <MessageSquarePlusIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/80" />;
		case "compact":
			return <ArchiveIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/80" />;
		case "characters":
		case "realtime":
			return <SparklesIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/80" />;
		default:
			return <BotIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/80" />;
	}
}

function groupCommandItems(
	items: ComposerCommandItem[],
	triggerKind: ComposerTriggerKind | null,
): ComposerCommandGroup[] {
	if (triggerKind === "path") {
		return items.length > 0 ? [{ id: "project", items, label: "Project" }] : [];
	}
	if (triggerKind === "skill") {
		return items.length > 0 ? [{ id: "skills", items, label: "Skills" }] : [];
	}

	const commands = items.filter((item) => item.type === "slash-command");
	return commands.length > 0
		? [{ id: "commands", items: commands, label: "Commands" }]
		: [];
}

function emptyStateForTrigger(triggerKind: ComposerTriggerKind | null): string {
	if (triggerKind === "path") {
		return "No matching project references.";
	}
	if (triggerKind === "skill") {
		return "No skills found.";
	}
	return "No matching command.";
}
