import { SearchIcon } from "lucide-react";
import { memo, useMemo, useState } from "react";

import { Input } from "../ui/input";
import { cn } from "../../lib/utils";
import {
	defaultCodexProviderInstance,
	type CodexModelOption,
	type ProviderInstanceEntry,
	type ProviderInstanceId,
} from "../../lib/modelSelection";

import { ModelListRow } from "./ModelListRow";
import { ModelPickerSidebar } from "./ModelPickerSidebar";
import {
	buildModelPickerSearchText,
	scoreModelPickerSearch,
} from "./modelPickerSearch";

export const ModelPickerContent = memo(function ModelPickerContent({
	favoriteModels,
	instanceEntries = [defaultCodexProviderInstance],
	model,
	modelOptions,
	onModelChange,
	onRequestClose,
	onToggleFavorite,
}: {
	favoriteModels: readonly string[];
	instanceEntries?: ReadonlyArray<ProviderInstanceEntry>;
	model: string;
	modelOptions: readonly CodexModelOption[];
	onModelChange: (model: string) => void;
	onRequestClose?: () => void;
	onToggleFavorite: (model: string) => void;
}) {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedInstanceId, setSelectedInstanceId] = useState<
		ProviderInstanceId | "favorites"
	>(() => (favoriteModels.length > 0 ? "favorites" : instanceEntries[0]?.instanceId ?? "codex"));
	const favoriteSet = useMemo(() => new Set(favoriteModels), [favoriteModels]);
	const normalizedQuery = searchQuery.trim().toLowerCase();
	const filteredModels = useMemo(() => {
		return filterCodexModelPickerOptions({
			favoriteModels: favoriteSet,
			modelOptions,
			query: normalizedQuery,
		});
	}, [favoriteSet, modelOptions, normalizedQuery]);
	const visibleModels = useMemo(() => {
		if (selectedInstanceId === "favorites" && !normalizedQuery) {
			return filteredModels.filter((option) => favoriteSet.has(option.slug));
		}
		return filteredModels;
	}, [favoriteSet, filteredModels, normalizedQuery, selectedInstanceId]);

	return (
		<div className="relative flex h-screen max-h-96 w-screen max-w-120 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg/5">
			<ModelPickerSidebar
				instanceEntries={instanceEntries}
				selectedInstanceId={selectedInstanceId}
				onSelectInstance={setSelectedInstanceId}
			/>
			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<div className="border-b px-3 py-2">
					<div className="relative">
						<SearchIcon
							aria-hidden="true"
							className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50"
						/>
						<Input
							autoFocus
							className="h-8 rounded-md border-0 bg-muted/45 pl-8 shadow-none focus-visible:ring-1"
							placeholder="Search models..."
							value={searchQuery}
							onChange={(event) => setSearchQuery(event.currentTarget.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") {
									event.preventDefault();
									onRequestClose?.();
								}
							}}
						/>
					</div>
				</div>
				<div className="min-h-0 flex-1 overflow-y-auto p-2">
					{visibleModels.length > 0 ? (
						<div className="grid gap-1">
							{visibleModels.map((option, index) => (
								<ModelListRow
									key={option.slug}
									index={index}
									isFavorite={favoriteSet.has(option.slug)}
									isSelected={option.slug === model}
									model={option}
									onSelect={() => onModelChange(option.slug)}
									onToggleFavorite={() => onToggleFavorite(option.slug)}
								/>
							))}
						</div>
					) : (
						<div className="py-8 text-center text-muted-foreground text-sm">
							No models found
						</div>
					)}
				</div>
				<div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
					<span className={cn("font-medium", favoriteModels.length && "text-foreground")}>
						{favoriteModels.length}
					</span>{" "}
					favorite{favoriteModels.length === 1 ? "" : "s"}
				</div>
			</div>
		</div>
	);
});

export function filterCodexModelPickerOptions(input: {
	favoriteModels: ReadonlySet<string>;
	modelOptions: readonly CodexModelOption[];
	query: string;
}): CodexModelOption[] {
	const normalizedQuery = input.query.trim().toLowerCase();
	if (normalizedQuery) {
		return input.modelOptions
			.map((option) => {
				const isFavorite = input.favoriteModels.has(option.slug);
				const searchableModel = {
					driverKind: "codex",
					providerDisplayName: "Codex",
					name: option.name,
					...(option.shortName ? { shortName: option.shortName } : {}),
					isFavorite,
				};
				const score = scoreModelPickerSearch(searchableModel, normalizedQuery);
				return {
					option,
					score,
					isFavorite,
					tieBreaker: buildModelPickerSearchText(searchableModel),
				};
			})
			.filter(
				(
					rankedModel,
				): rankedModel is {
					option: CodexModelOption;
					score: number;
					isFavorite: boolean;
					tieBreaker: string;
				} => rankedModel.score !== null,
			)
			.sort((left, right) => {
				const scoreDelta = left.score - right.score;
				if (scoreDelta !== 0) {
					return scoreDelta;
				}
				if (left.isFavorite !== right.isFavorite) {
					return left.isFavorite ? -1 : 1;
				}
				return left.tieBreaker.localeCompare(right.tieBreaker);
			})
			.map((rankedModel) => rankedModel.option);
	}

	const models = [...input.modelOptions];

	return [...models].sort((left, right) => {
		const leftFavorite = input.favoriteModels.has(left.slug);
		const rightFavorite = input.favoriteModels.has(right.slug);
		if (leftFavorite !== rightFavorite) {
			return leftFavorite ? -1 : 1;
		}
		return input.modelOptions.indexOf(left) - input.modelOptions.indexOf(right);
	});
}
