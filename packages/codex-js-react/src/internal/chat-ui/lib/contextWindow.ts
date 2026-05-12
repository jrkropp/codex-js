import type { ThreadTokenUsage } from "@jrkropp/codex-js/client";

export type ContextWindowSnapshot = {
	cachedInputTokens: number | null;
	compactsAutomatically: boolean;
	durationMs: number | null;
	inputTokens: number | null;
	lastCachedInputTokens: number | null;
	lastInputTokens: number | null;
	lastOutputTokens: number | null;
	lastReasoningOutputTokens: number | null;
	lastUsedTokens: number | null;
	maxTokens: number | null;
	outputTokens: number | null;
	reasoningOutputTokens: number | null;
	remainingPercentage: number | null;
	remainingTokens: number | null;
	toolUses: number | null;
	totalProcessedTokens: number | null;
	updatedAt: string;
	usedPercentage: number | null;
	usedTokens: number;
};

export function deriveContextWindowSnapshotFromTokenUsage(input: {
	tokenUsage: ThreadTokenUsage | null | undefined;
	updatedAt?: string | null;
}): ContextWindowSnapshot | null {
	const tokenUsage = input.tokenUsage;
	if (!tokenUsage || tokenUsage.total.totalTokens <= 0) {
		return null;
	}

	const usedTokens = tokenUsage.total.totalTokens;
	const maxTokens = tokenUsage.modelContextWindow;
	const usedPercentage =
		maxTokens !== null && maxTokens > 0
			? Math.min(100, (usedTokens / maxTokens) * 100)
			: null;
	const remainingTokens =
		maxTokens !== null ? Math.max(0, Math.round(maxTokens - usedTokens)) : null;
	const remainingPercentage =
		usedPercentage !== null ? Math.max(0, 100 - usedPercentage) : null;

	return {
		cachedInputTokens: tokenUsage.total.cachedInputTokens,
		compactsAutomatically: maxTokens !== null,
		durationMs: null,
		inputTokens: tokenUsage.total.inputTokens,
		lastCachedInputTokens: tokenUsage.last.cachedInputTokens,
		lastInputTokens: tokenUsage.last.inputTokens,
		lastOutputTokens: tokenUsage.last.outputTokens,
		lastReasoningOutputTokens: tokenUsage.last.reasoningOutputTokens,
		lastUsedTokens: tokenUsage.last.totalTokens,
		maxTokens,
		outputTokens: tokenUsage.total.outputTokens,
		reasoningOutputTokens: tokenUsage.total.reasoningOutputTokens,
		remainingPercentage,
		remainingTokens,
		toolUses: null,
		totalProcessedTokens: null,
		updatedAt: input.updatedAt ?? new Date().toISOString(),
		usedPercentage,
		usedTokens,
	};
}

export function formatContextWindowTokens(value: number | null): string {
	if (value === null || !Number.isFinite(value)) {
		return "0";
	}
	if (value < 1_000) {
		return `${Math.round(value)}`;
	}
	if (value < 10_000) {
		return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
	}
	if (value < 1_000_000) {
		return `${Math.round(value / 1_000)}k`;
	}
	return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
}
