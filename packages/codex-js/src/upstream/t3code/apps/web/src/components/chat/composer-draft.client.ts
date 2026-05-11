import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
	defaultCodexModel,
	defaultCodexReasoningEffort,
	isCodexReasoningEffort,
	resolveCodexModelOption,
	resolveCodexReasoningEffortForModel,
	type CodexReasoningEffort,
} from "../../lib/modelSelection";

import {
	restoreComposerDraftAttachments,
	revokeComposerImageAttachments,
	type ComposerImageAttachment,
	type PersistedComposerDraftImageAttachment,
} from "./composer-image-attachments";

export interface ComposerDraftState {
	prompt: string;
	model: string | null;
	effort: CodexReasoningEffort | null;
	images: ComposerImageAttachment[];
	persistedImages: PersistedComposerDraftImageAttachment[];
}

export type ComposerDraftKey = string;

export type PersistedComposerDraftState = Omit<ComposerDraftState, "images">;

type ComposerDraftStorePersistedState = {
	draftsByKey: Record<string, PersistedComposerDraftState>;
	favoriteModels: string[];
	stickyEffort: CodexReasoningEffort | null;
	stickyModel: string | null;
};

type LegacyComposerDraftState = {
	text?: unknown;
	model?: unknown;
	effort?: unknown;
	images?: unknown;
};

type ComposerDraftStoreState = {
	draftsByKey: Record<string, ComposerDraftState>;
	favoriteModels: string[];
	stickyEffort: CodexReasoningEffort | null;
	stickyModel: string | null;
	addImages: (key: ComposerDraftKey, images: ComposerImageAttachment[]) => void;
	clearComposerContent: (key: ComposerDraftKey) => void;
	clearDraft: (key: ComposerDraftKey) => void;
	ensureDraft: (key: ComposerDraftKey) => ComposerDraftState;
	getDraft: (key: ComposerDraftKey) => ComposerDraftState;
	removeImage: (key: ComposerDraftKey, imageId: string) => void;
	setEffort: (key: ComposerDraftKey, effort: CodexReasoningEffort | null) => void;
	setFavoriteModels: (models: string[]) => void;
	setModel: (key: ComposerDraftKey, model: string | null) => void;
	setPrompt: (key: ComposerDraftKey, prompt: string) => void;
	syncPersistedImages: (
		key: ComposerDraftKey,
		images: PersistedComposerDraftImageAttachment[],
	) => void;
};

const composerDraftStorageKey = "codex-assistant:composer-drafts:v1";
const composerDraftStorageVersion = 1;
const emptyDraft: ComposerDraftState = {
	prompt: "",
	model: null,
	effort: null,
	images: [],
	persistedImages: [],
};

export function assistantComposerDraftKey(input: {
	scope: string;
	threadId: string | null;
}): ComposerDraftKey {
	return `codex-assistant:composer-draft:v${composerDraftStorageVersion}:${input.scope}:${input.threadId ?? "new"}`;
}

export function readLegacyComposerDraft(
	key: ComposerDraftKey,
	storage: Storage | null = browserLocalStorage(),
): PersistedComposerDraftState | null {
	if (!storage) {
		return null;
	}
	const raw = storage.getItem(key);
	if (!raw) {
		return null;
	}

	try {
		const parsed = JSON.parse(raw) as LegacyComposerDraftState | null;
		if (!parsed || typeof parsed !== "object") {
			return null;
		}
		return {
			prompt: typeof parsed.text === "string" ? parsed.text : "",
			model: typeof parsed.model === "string" ? parsed.model : null,
			effort:
				typeof parsed.effort === "string" && isCodexReasoningEffort(parsed.effort)
					? parsed.effort
					: null,
			persistedImages: Array.isArray(parsed.images)
				? parsed.images.filter(isPersistedComposerDraftImageAttachment)
				: [],
		};
	} catch {
		return null;
	}
}

export function resolveDraftModel(draft: Pick<ComposerDraftState, "model">): string {
	const candidate = draft.model ?? readLegacyStickyModel() ?? defaultCodexModel;
	return resolveCodexModelOption(candidate).slug;
}

export function resolveDraftEffort(
	draft: Pick<ComposerDraftState, "effort">,
	model = defaultCodexModel,
): CodexReasoningEffort {
	return resolveCodexReasoningEffortForModel(
		model,
		draft.effort ?? readLegacyStickyEffort() ?? defaultCodexReasoningEffort,
	);
}

export const useComposerDraftStore = create<ComposerDraftStoreState>()(
	persist(
		(set, get) => ({
			draftsByKey: {},
			favoriteModels: readLegacyFavoriteModels(),
			stickyEffort: readLegacyStickyEffort(),
			stickyModel: readLegacyStickyModel(),
			addImages: (key, images) => {
				if (images.length === 0) {
					return;
				}
				set((state) => {
					const draft = getDraftFromState(state, key);
					return {
						draftsByKey: {
							...state.draftsByKey,
							[key]: {
								...draft,
								images: [...draft.images, ...images],
							},
						},
					};
				});
			},
			clearComposerContent: (key) => {
				const draft = get().draftsByKey[key];
				if (draft) {
					revokeComposerImageAttachments(draft.images);
				}
				set((state) => {
					const current = getDraftFromState(state, key);
					const nextDraft = {
						...current,
						prompt: "",
						images: [],
						persistedImages: [],
					};
					if (
						nextDraft.model === null &&
						nextDraft.effort === null &&
						nextDraft.prompt.length === 0 &&
						nextDraft.persistedImages.length === 0
					) {
						return { draftsByKey: omitDraftKey(state.draftsByKey, key) };
					}
					return {
						draftsByKey: {
							...state.draftsByKey,
							[key]: nextDraft,
						},
					};
				});
			},
			clearDraft: (key) => {
				const draft = get().draftsByKey[key];
				if (draft) {
					revokeComposerImageAttachments(draft.images);
				}
				set((state) => {
					return { draftsByKey: omitDraftKey(state.draftsByKey, key) };
				});
			},
			ensureDraft: (key) => {
				const existing = get().draftsByKey[key];
				if (existing) {
					return existing;
				}
				const legacy = readLegacyComposerDraft(key);
				const nextDraft = legacy ? restorePersistedDraft(legacy) : createEmptyDraft();
				set((state) => ({
					draftsByKey: {
						...state.draftsByKey,
						[key]: nextDraft,
					},
				}));
				return nextDraft;
			},
			getDraft: (key) => getDraftFromState(get(), key),
			removeImage: (key, imageId) => {
				set((state) => {
					const draft = getDraftFromState(state, key);
					const removed = draft.images.filter((image) => image.id === imageId);
					if (removed.length > 0) {
						revokeComposerImageAttachments(removed);
					}
					return {
						draftsByKey: {
							...state.draftsByKey,
							[key]: {
								...draft,
								images: draft.images.filter((image) => image.id !== imageId),
								persistedImages: draft.persistedImages.filter(
									(image) => image.id !== imageId,
								),
							},
						},
					};
				});
			},
			setEffort: (key, effort) => {
				set((state) => {
					const draft = getDraftFromState(state, key);
					return {
						draftsByKey: {
							...state.draftsByKey,
							[key]: { ...draft, effort },
						},
						stickyEffort: effort ?? state.stickyEffort,
					};
				});
			},
			setFavoriteModels: (models) => {
				set({ favoriteModels: [...new Set(models)] });
			},
			setModel: (key, model) => {
				set((state) => {
					const draft = getDraftFromState(state, key);
					return {
						draftsByKey: {
							...state.draftsByKey,
							[key]: { ...draft, model },
						},
						stickyModel: model ?? state.stickyModel,
					};
				});
			},
			setPrompt: (key, prompt) => {
				set((state) => {
					const draft = getDraftFromState(state, key);
					return {
						draftsByKey: {
							...state.draftsByKey,
							[key]: { ...draft, prompt },
						},
					};
				});
			},
			syncPersistedImages: (key, persistedImages) => {
				set((state) => {
					const draft = getDraftFromState(state, key);
					return {
						draftsByKey: {
							...state.draftsByKey,
							[key]: { ...draft, persistedImages },
						},
					};
				});
			},
		}),
		{
			name: composerDraftStorageKey,
			storage: createJSONStorage(() => browserLocalStorage() ?? createMemoryStorage()),
			partialize: (state): ComposerDraftStorePersistedState => ({
				draftsByKey: Object.fromEntries(
					Object.entries(state.draftsByKey).flatMap(([key, draft]) => {
						const persistedDraft: PersistedComposerDraftState = {
							prompt: draft.prompt,
							model: draft.model,
							effort: draft.effort,
							persistedImages: draft.persistedImages,
						};
						return persistedDraftHasContent(persistedDraft)
							? ([[key, persistedDraft]] as const)
							: [];
					}),
				),
				favoriteModels: state.favoriteModels,
				stickyEffort: state.stickyEffort,
				stickyModel: state.stickyModel,
			}),
			merge: (persisted, current): ComposerDraftStoreState => {
				const state = isPersistedStoreState(persisted) ? persisted : null;
				if (!state) {
					return current;
				}
				return {
					...current,
					draftsByKey: Object.fromEntries(
						Object.entries(state.draftsByKey).map(([key, draft]) => [
							key,
							restorePersistedDraft(draft),
						]),
					),
					favoriteModels: state.favoriteModels,
					stickyEffort: state.stickyEffort,
					stickyModel: state.stickyModel,
				};
			},
		},
	),
);

export function useComposerThreadDraft(key: ComposerDraftKey): ComposerDraftState {
	return useComposerDraftStore((state) => state.draftsByKey[key] ?? emptyDraft);
}

function getDraftFromState(
	state: Pick<ComposerDraftStoreState, "draftsByKey">,
	key: ComposerDraftKey,
): ComposerDraftState {
	return state.draftsByKey[key] ?? createEmptyDraft();
}

function omitDraftKey(
	draftsByKey: Record<string, ComposerDraftState>,
	key: ComposerDraftKey,
): Record<string, ComposerDraftState> {
	const next = { ...draftsByKey };
	delete next[key];
	return next;
}

function createEmptyDraft(): ComposerDraftState {
	return {
		prompt: "",
		model: null,
		effort: null,
		images: [],
		persistedImages: [],
	};
}

function restorePersistedDraft(
	draft: PersistedComposerDraftState,
): ComposerDraftState {
	return {
		...draft,
		images: restoreComposerDraftAttachments(draft.persistedImages),
	};
}

function persistedDraftHasContent(draft: PersistedComposerDraftState): boolean {
	return (
		draft.prompt.trim().length > 0 ||
		draft.persistedImages.length > 0 ||
		draft.model !== null ||
		draft.effort !== null
	);
}

function isPersistedStoreState(
	value: unknown,
): value is ComposerDraftStorePersistedState {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Partial<ComposerDraftStorePersistedState>;
	return (
		candidate.draftsByKey !== null &&
		typeof candidate.draftsByKey === "object" &&
		Array.isArray(candidate.favoriteModels)
	);
}

function isPersistedComposerDraftImageAttachment(
	value: unknown,
): value is PersistedComposerDraftImageAttachment {
	if (!value || typeof value !== "object") {
		return false;
	}
	const candidate = value as Partial<PersistedComposerDraftImageAttachment>;
	return (
		typeof candidate.id === "string" &&
		typeof candidate.name === "string" &&
		typeof candidate.type === "string" &&
		typeof candidate.size === "number" &&
		typeof candidate.dataUrl === "string"
	);
}

function readLegacyStickyModel(): string | null {
	const storage = browserLocalStorage();
	return storage?.getItem("codex-assistant:chat:model") ?? null;
}

function readLegacyStickyEffort(): CodexReasoningEffort | null {
	const storage = browserLocalStorage();
	const value = storage?.getItem("codex-assistant:chat:effort");
	return value && isCodexReasoningEffort(value) ? value : null;
}

function readLegacyFavoriteModels(): string[] {
	const storage = browserLocalStorage();
	if (!storage) {
		return [];
	}
	try {
		const parsed = JSON.parse(
			storage.getItem("codex-assistant:chat:favorite-models") ?? "[]",
		);
		return Array.isArray(parsed)
			? parsed.filter((entry): entry is string => typeof entry === "string")
			: [];
	} catch {
		return [];
	}
}

function browserLocalStorage(): Storage | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window.localStorage;
}

function createMemoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		clear: () => values.clear(),
		getItem: (key) => values.get(key) ?? null,
		key: (index) => Array.from(values.keys())[index] ?? null,
		removeItem: (key) => values.delete(key),
		setItem: (key, value) => {
			values.set(key, value);
		},
	};
}
