import type { DynamicToolCallResponse } from "../../app-server-protocol/schema/typescript/v2";
import type {
	DynamicToolCallOutputContentItem as CoreDynamicToolCallOutputContentItem,
	DynamicToolResponse as CoreDynamicToolResponse,
} from "../../core/src/protocol/dynamic_tools";

export function coreDynamicToolResponseFromAppServerResponse(
	value: unknown,
): CoreDynamicToolResponse {
	const response = decodeDynamicToolCallResponse(value);
	return {
		content_items: response.contentItems.map(coreDynamicToolCallOutputContentItem),
		success: response.success,
	};
}

export function decodeDynamicToolCallResponse(
	value: unknown,
): DynamicToolCallResponse {
	if (!isDynamicToolCallResponse(value)) {
		return fallbackDynamicToolCallResponse("dynamic tool response was invalid");
	}
	return value;
}

export function fallbackDynamicToolCallResponse(
	message: string,
): DynamicToolCallResponse {
	return {
		contentItems: [{ text: message, type: "inputText" }],
		success: false,
	};
}

function coreDynamicToolCallOutputContentItem(
	item: DynamicToolCallResponse["contentItems"][number],
): CoreDynamicToolCallOutputContentItem {
	switch (item.type) {
		case "inputText":
			return { text: item.text, type: "inputText" };
		case "inputImage":
			return { imageUrl: item.imageUrl, type: "inputImage" };
	}
}

function isDynamicToolCallResponse(
	value: unknown,
): value is DynamicToolCallResponse {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const candidate = value as DynamicToolCallResponse;
	return (
		typeof candidate.success === "boolean" &&
		Array.isArray(candidate.contentItems) &&
		candidate.contentItems.every(isDynamicToolCallOutputContentItem)
	);
}

function isDynamicToolCallOutputContentItem(
	value: unknown,
): value is DynamicToolCallResponse["contentItems"][number] {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const item = value as DynamicToolCallResponse["contentItems"][number];
	if (item.type === "inputText") {
		return typeof item.text === "string";
	}
	if (item.type === "inputImage") {
		return typeof item.imageUrl === "string";
	}
	return false;
}
