import type {
	FunctionCallOutputContentItem,
	FunctionCallOutputPayload,
	TruncationPolicy,
} from "../../../core/src/protocol";
import {
	approx_bytes_for_tokens,
	approx_token_count,
	approx_tokens_from_byte_count,
	truncate_middle_chars,
	truncate_middle_with_token_budget,
} from "../../string/src/lib";

export {
	approx_bytes_for_tokens,
	approx_token_count,
	approx_tokens_from_byte_count,
};

export type ResolvedTruncationPolicy =
	| { mode: "bytes"; limit: number }
	| { mode: "tokens"; limit: number };

export const DEFAULT_TRUNCATION_POLICY: ResolvedTruncationPolicy = {
	mode: "bytes",
	limit: 10_000,
};

export function resolve_truncation_policy(
	policy: TruncationPolicy | ResolvedTruncationPolicy | null | undefined,
): ResolvedTruncationPolicy {
	if (isResolvedPolicy(policy)) {
		return { mode: policy.mode, limit: normalizeLimit(policy.limit) };
	}
	if (isRecord(policy)) {
		const mode = policy.mode;
		const limit = normalizeLimit(policy.limit);
		if (mode === "bytes" || mode === "Bytes") {
			return { mode: "bytes", limit };
		}
		if (mode === "tokens" || mode === "Tokens") {
			return { mode: "tokens", limit };
		}
	}
	return DEFAULT_TRUNCATION_POLICY;
}

export function scale_truncation_policy(
	policy: TruncationPolicy | ResolvedTruncationPolicy | null | undefined,
	scale: number,
): ResolvedTruncationPolicy {
	const resolved = resolve_truncation_policy(policy);
	return {
		mode: resolved.mode,
		limit: Math.max(0, Math.trunc(resolved.limit * scale)),
	};
}

export function formatted_truncate_text(
	content: string,
	policy: TruncationPolicy | ResolvedTruncationPolicy | null | undefined,
): string {
	const resolved = resolve_truncation_policy(policy);
	if (utf8ByteLength(content) <= byte_budget(resolved)) {
		return content;
	}
	const totalLines = content.split(/\r?\n/u).length;
	return `Total output lines: ${totalLines}\n\n${truncate_text(content, resolved)}`;
}

export function truncate_text(
	content: string,
	policy: TruncationPolicy | ResolvedTruncationPolicy | null | undefined,
): string {
	const resolved = resolve_truncation_policy(policy);
	if (resolved.mode === "bytes") {
		return truncate_middle_chars(content, resolved.limit);
	}
	return truncate_middle_with_token_budget(content, resolved.limit)[0];
}

export function formatted_truncate_text_content_items_with_policy(
	items: readonly FunctionCallOutputContentItem[],
	policy: TruncationPolicy | ResolvedTruncationPolicy | null | undefined,
): [FunctionCallOutputContentItem[], number | null] {
	const textSegments = items.flatMap((item) =>
		item.type === "input_text" ? [item.text] : [],
	);
	if (textSegments.length === 0) {
		return [[...items], null];
	}

	const combined = textSegments.join("\n");
	const resolved = resolve_truncation_policy(policy);
	if (utf8ByteLength(combined) <= byte_budget(resolved)) {
		return [[...items], null];
	}

	return [
		[
			{ type: "input_text", text: formatted_truncate_text(combined, resolved) },
			...items.flatMap((item) =>
				item.type === "input_image" ? [{ ...item }] : [],
			),
		],
		approx_token_count(combined),
	];
}

export function truncate_function_output_items_with_policy(
	items: readonly FunctionCallOutputContentItem[],
	policy: TruncationPolicy | ResolvedTruncationPolicy | null | undefined,
): FunctionCallOutputContentItem[] {
	const resolved = resolve_truncation_policy(policy);
	const output: FunctionCallOutputContentItem[] = [];
	let remainingBudget =
		resolved.mode === "bytes" ? byte_budget(resolved) : token_budget(resolved);
	let omittedTextItems = 0;

	for (const item of items) {
		if (item.type === "input_image") {
			output.push({ ...item });
			continue;
		}

		if (remainingBudget <= 0) {
			omittedTextItems += 1;
			continue;
		}

		const cost =
			resolved.mode === "bytes" ? utf8ByteLength(item.text) : approx_token_count(item.text);
		if (cost <= remainingBudget) {
			output.push({ ...item });
			remainingBudget -= cost;
			continue;
		}

		const snippetPolicy: ResolvedTruncationPolicy = {
			mode: resolved.mode,
			limit: remainingBudget,
		};
		const snippet = truncate_text(item.text, snippetPolicy);
		if (snippet.length === 0) {
			omittedTextItems += 1;
		} else {
			output.push({ type: "input_text", text: snippet });
		}
		remainingBudget = 0;
	}

	if (omittedTextItems > 0) {
		output.push({
			type: "input_text",
			text: `[omitted ${omittedTextItems} text items ...]`,
		});
	}

	return output;
}

export function truncate_function_output_payload(
	output: FunctionCallOutputPayload,
	policy: TruncationPolicy | ResolvedTruncationPolicy | null | undefined,
): FunctionCallOutputPayload {
	if (output.body.type === "text") {
		return {
			...output,
			body: { type: "text", text: truncate_text(output.body.text, policy) },
		};
	}
	return {
		...output,
		body: {
			type: "content_items",
			items: truncate_function_output_items_with_policy(output.body.items, policy),
		},
	};
}

export function approx_tokens_from_byte_count_i64(bytes: number): number {
	if (bytes <= 0) {
		return 0;
	}
	return approx_tokens_from_byte_count(bytes);
}

function byte_budget(policy: ResolvedTruncationPolicy): number {
	return policy.mode === "bytes" ? policy.limit : approx_bytes_for_tokens(policy.limit);
}

function token_budget(policy: ResolvedTruncationPolicy): number {
	return policy.mode === "tokens"
		? policy.limit
		: approx_tokens_from_byte_count(policy.limit);
}

function isResolvedPolicy(value: unknown): value is ResolvedTruncationPolicy {
	return (
		isRecord(value) &&
		(value.mode === "bytes" || value.mode === "tokens") &&
		typeof value.limit === "number"
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLimit(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0
		? Math.trunc(value)
		: DEFAULT_TRUNCATION_POLICY.limit;
}

function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}
