import { VIEW_IMAGE_TOOL_NAME } from "./view_image";

export function create_view_image_tool() {
	return {
		type: "function" as const,
		name: VIEW_IMAGE_TOOL_NAME,
		description: "View a local image.",
		strict: false,
		parameters: {
			type: "object",
			properties: { path: { type: "string" } },
			required: ["path"],
			additionalProperties: true,
		},
	};
}
