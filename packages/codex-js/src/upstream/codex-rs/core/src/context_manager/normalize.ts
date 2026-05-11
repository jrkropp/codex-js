import type {
	FunctionCallOutputPayload,
	ResponseItem,
} from "../models";

function abortedOutput(): FunctionCallOutputPayload {
	return {
		body: {
			type: "text",
			text: "aborted",
		},
		success: null,
	};
}

export function ensureCallOutputsPresent(items: ResponseItem[]): ResponseItem[] {
	const normalized = [...items];
	const missingOutputs: Array<{ index: number; item: ResponseItem }> = [];

	for (const [index, item] of normalized.entries()) {
		if (item.type === "function_call") {
			const hasOutput = normalized.some(
				(candidate) =>
					candidate.type === "function_call_output" &&
					candidate.call_id === item.call_id,
			);
			if (!hasOutput) {
				missingOutputs.push({
					index,
					item: {
						type: "function_call_output",
						call_id: item.call_id,
						output: abortedOutput(),
					},
				});
			}
			continue;
		}

		if (item.type === "custom_tool_call") {
			const hasOutput = normalized.some(
				(candidate) =>
					candidate.type === "custom_tool_call_output" &&
					candidate.call_id === item.call_id,
			);
			if (!hasOutput) {
				missingOutputs.push({
					index,
					item: {
						type: "custom_tool_call_output",
						call_id: item.call_id,
						name: null,
						output: abortedOutput(),
					},
				});
			}
			continue;
		}

		if (item.type === "local_shell_call" && item.call_id) {
			const hasOutput = normalized.some(
				(candidate) =>
					candidate.type === "function_call_output" &&
					candidate.call_id === item.call_id,
			);
			if (!hasOutput) {
				missingOutputs.push({
					index,
					item: {
						type: "function_call_output",
						call_id: item.call_id,
						output: abortedOutput(),
					},
				});
			}
			continue;
		}

		if (item.type === "tool_search_call" && item.call_id) {
			const hasOutput = normalized.some(
				(candidate) =>
					candidate.type === "tool_search_output" &&
					candidate.call_id === item.call_id,
			);
			if (!hasOutput) {
				missingOutputs.push({
					index,
					item: {
						type: "tool_search_output",
						call_id: item.call_id,
						status: "completed",
						execution: "client",
						tools: [],
					},
				});
			}
		}
	}

	for (const missing of missingOutputs.reverse()) {
		normalized.splice(missing.index + 1, 0, missing.item);
	}

	return normalized;
}

export function removeOrphanOutputs(items: ResponseItem[]): ResponseItem[] {
	const functionCallIds = new Set(
		items.flatMap((item) =>
			item.type === "function_call" ? [item.call_id] : [],
		),
	);
	const localShellCallIds = new Set(
		items.flatMap((item) =>
			item.type === "local_shell_call" ? [item.call_id ?? ""] : [],
		),
	);
	const customToolCallIds = new Set(
		items.flatMap((item) =>
			item.type === "custom_tool_call" ? [item.call_id] : [],
		),
	);
	const toolSearchCallIds = new Set(
		items.flatMap((item) =>
			item.type === "tool_search_call" && item.call_id ? [item.call_id] : [],
		),
	);

	return items.filter((item) => {
		if (item.type === "function_call_output") {
			return (
				functionCallIds.has(item.call_id) || localShellCallIds.has(item.call_id)
			);
		}

		if (item.type === "custom_tool_call_output") {
			return customToolCallIds.has(item.call_id);
		}

		if (item.type === "tool_search_output") {
			if (item.execution === "server" || !item.call_id) {
				return true;
			}

			return toolSearchCallIds.has(item.call_id);
		}

		return true;
	});
}

export function removeCorrespondingFor(
	items: ResponseItem[],
	item: ResponseItem,
): ResponseItem[] {
	const next = [...items];

	switch (item.type) {
		case "function_call":
			removeFirstMatching(
				next,
				(candidate) =>
					candidate.type === "function_call_output" &&
					candidate.call_id === item.call_id,
			);
			break;
		case "function_call_output":
			removeFirstMatching(
				next,
				(candidate) =>
					(candidate.type === "function_call" ||
						candidate.type === "local_shell_call") &&
					candidate.call_id === item.call_id,
			);
			break;
		case "custom_tool_call":
			removeFirstMatching(
				next,
				(candidate) =>
					candidate.type === "custom_tool_call_output" &&
					candidate.call_id === item.call_id,
			);
			break;
		case "custom_tool_call_output":
			removeFirstMatching(
				next,
				(candidate) =>
					candidate.type === "custom_tool_call" &&
					candidate.call_id === item.call_id,
			);
			break;
		case "tool_search_call":
			if (item.call_id) {
				removeFirstMatching(
					next,
					(candidate) =>
						candidate.type === "tool_search_output" &&
						candidate.call_id === item.call_id,
				);
			}
			break;
		case "tool_search_output":
			if (item.call_id) {
				removeFirstMatching(
					next,
					(candidate) =>
						candidate.type === "tool_search_call" &&
						candidate.call_id === item.call_id,
				);
			}
			break;
		case "local_shell_call":
			if (item.call_id) {
				removeFirstMatching(
					next,
					(candidate) =>
						candidate.type === "function_call_output" &&
						candidate.call_id === item.call_id,
				);
			}
			break;
	}

	return next;
}

export function normalizeResponseHistory(items: ResponseItem[]): ResponseItem[] {
	return removeOrphanOutputs(ensureCallOutputsPresent(items));
}

export function stripImagesWhenUnsupported(
	inputModalities: readonly string[] | null | undefined,
	items: ResponseItem[],
): ResponseItem[] {
	if (inputModalities?.includes("image")) {
		return items.map(cloneResponseItem);
	}

	return items.map((item): ResponseItem => {
		if (item.type === "message") {
			return {
				...item,
				content: item.content.filter((content) => content.type !== "input_image"),
			};
		}

		if (
			(item.type === "function_call_output" ||
				item.type === "custom_tool_call_output") &&
			item.output.body.type === "content_items"
		) {
			return {
				...item,
				output: {
					...item.output,
					body: {
						type: "content_items",
						items: item.output.body.items.filter(
							(content) => content.type !== "input_image",
						),
					},
				},
			};
		}

		return cloneResponseItem(item);
	});
}

function cloneResponseItem(item: ResponseItem): ResponseItem {
	return structuredClone(item);
}

function removeFirstMatching(
	items: ResponseItem[],
	predicate: (item: ResponseItem) => boolean,
): void {
	const index = items.findIndex(predicate);
	if (index >= 0) {
		items.splice(index, 1);
	}
}
