export function resolveComposerMenuActiveItemId(input: {
	currentSearchKey: string | null;
	highlightedItemId: string | null;
	highlightedSearchKey: string | null;
	items: ReadonlyArray<{ id: string }>;
}): string | null {
	if (input.items.length === 0) {
		return null;
	}

	if (
		input.currentSearchKey === input.highlightedSearchKey &&
		input.highlightedItemId &&
		input.items.some((item) => item.id === input.highlightedItemId)
	) {
		return input.highlightedItemId;
	}

	return input.items[0]?.id ?? null;
}
