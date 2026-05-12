import type {
	WebSearchConfig,
	WebSearchMode,
	WebSearchToolType,
} from "./spec_plan_types";
import type { ToolSpec } from "./tool_spec";

const WEB_SEARCH_TEXT_AND_IMAGE_CONTENT_TYPES = ["text", "image"] as const;

export type WebSearchToolOptions = {
	web_search_mode?: WebSearchMode | null;
	web_search_config?: WebSearchConfig | null;
	web_search_tool_type?: WebSearchToolType;
};

export function create_image_generation_tool(outputFormat: string): ToolSpec {
	return {
		type: "image_generation",
		output_format: outputFormat,
	};
}

export function create_web_search_tool(
	options: WebSearchToolOptions,
): ToolSpec | null {
	const externalWebAccess =
		options.web_search_mode === "cached"
			? false
			: options.web_search_mode === "live"
				? true
				: null;
	if (externalWebAccess === null) {
		return null;
	}

	return {
		type: "web_search",
		external_web_access: externalWebAccess,
		...(options.web_search_config?.filters !== undefined
			? { filters: options.web_search_config.filters }
			: {}),
		...(options.web_search_config?.user_location !== undefined
			? { user_location: options.web_search_config.user_location }
			: {}),
		...(options.web_search_config?.search_context_size !== undefined
			? { search_context_size: options.web_search_config.search_context_size }
			: {}),
		...(options.web_search_tool_type === "text_and_image"
			? { search_content_types: [...WEB_SEARCH_TEXT_AND_IMAGE_CONTENT_TYPES] }
			: {}),
	};
}
