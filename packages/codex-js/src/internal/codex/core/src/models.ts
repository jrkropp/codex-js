export type MessagePhase = "commentary" | "final_answer";

export type ContentItem =
	| { type: "input_text"; text: string }
	| { type: "input_image"; image_url: string; detail?: string | null }
	| { type: "output_text"; text: string };

export type FunctionCallOutputContentItem =
	| { type: "input_text"; text: string }
	| { type: "input_image"; image_url: string; detail?: string | null };

export type FunctionCallOutputBody =
	| { type: "text"; text: string }
	| { type: "content_items"; items: FunctionCallOutputContentItem[] };

export type FunctionCallOutputPayload = {
	body: FunctionCallOutputBody;
	success?: boolean | null;
};

export type MessageResponseInputItem = {
	type: "message";
	id?: string;
	role: string;
	content: ContentItem[];
	phase?: MessagePhase | null;
};

export type FunctionCallOutputResponseInputItem = {
	type: "function_call_output";
	call_id: string;
	output: FunctionCallOutputPayload;
};

export type CustomToolCallOutputResponseInputItem = {
	type: "custom_tool_call_output";
	call_id: string;
	name?: string | null;
	output: FunctionCallOutputPayload;
};

export type McpToolCallOutputResponseInputItem = {
	type: "mcp_tool_call_output";
	call_id: string;
	output: unknown;
};

export type ToolSearchOutputResponseInputItem = {
	type: "tool_search_output";
	call_id: string;
	status: "completed";
	execution: "client";
	tools: unknown[];
};

export type ResponseInputItem =
	| MessageResponseInputItem
	| FunctionCallOutputResponseInputItem
	| CustomToolCallOutputResponseInputItem
	| McpToolCallOutputResponseInputItem
	| ToolSearchOutputResponseInputItem;

export type ResponseMessageItem = {
	type: "message";
	id?: string;
	role: string;
	content: ContentItem[];
	phase?: MessagePhase | null;
};

export type ReasoningItemReasoningSummary = Record<string, unknown>;
export type ReasoningItemContent = Record<string, unknown>;

export type ResponseReasoningItem = {
	type: "reasoning";
	id?: string;
	summary: ReasoningItemReasoningSummary[];
	content?: ReasoningItemContent[] | null;
	encrypted_content?: string | null;
};

export type ResponseLocalShellCallItem = {
	type: "local_shell_call";
	id?: string | null;
	call_id?: string | null;
	status?: string | null;
	action: Record<string, unknown>;
};

export type ResponseFunctionCallItem = {
	type: "function_call";
	id?: string | null;
	name: string;
	namespace?: string | null;
	arguments: string;
	call_id: string;
};

export type ResponseToolSearchCallItem = {
	type: "tool_search_call";
	id?: string | null;
	call_id?: string | null;
	status?: string | null;
	execution: string;
	arguments: unknown;
};

export type ResponseFunctionCallOutputItem = {
	type: "function_call_output";
	call_id: string;
	output: FunctionCallOutputPayload;
};

export type ResponseCustomToolCallItem = {
	type: "custom_tool_call";
	id?: string | null;
	status?: string | null;
	call_id: string;
	name: string;
	input: string;
};

export type ResponseCustomToolCallOutputItem = {
	type: "custom_tool_call_output";
	call_id: string;
	name?: string | null;
	output: FunctionCallOutputPayload;
};

export type ResponseToolSearchOutputItem = {
	type: "tool_search_output";
	call_id?: string | null;
	status: string;
	execution: string;
	tools: unknown[];
};

export type ResponseWebSearchCallItem = {
	type: "web_search_call";
	id?: string | null;
	status?: string | null;
	action?: Record<string, unknown> | null;
};

export type ResponseImageGenerationCallItem = {
	type: "image_generation_call";
	id: string;
	status: string;
	revised_prompt?: string | null;
	result: string;
	saved_path?: string;
};

export type ResponseCompactionItem = {
	type: "compaction" | "context_compaction";
	encrypted_content?: string | null;
};

export type ResponseOtherItem = {
	type: "other";
};

export type ResponseItem =
	| ResponseMessageItem
	| ResponseReasoningItem
	| ResponseLocalShellCallItem
	| ResponseFunctionCallItem
	| ResponseToolSearchCallItem
	| ResponseFunctionCallOutputItem
	| ResponseCustomToolCallItem
	| ResponseCustomToolCallOutputItem
	| ResponseToolSearchOutputItem
	| ResponseWebSearchCallItem
	| ResponseImageGenerationCallItem
	| ResponseCompactionItem
	| ResponseOtherItem;

export type ResponseItemWire =
	| (Omit<ResponseMessageItem, "phase"> & { phase?: MessagePhase | null })
	| ResponseReasoningItem
	| ResponseLocalShellCallItem
	| ResponseFunctionCallItem
	| ResponseToolSearchCallItem
	| (Omit<ResponseFunctionCallOutputItem, "output"> & {
			output: string | FunctionCallOutputContentItem[];
	  })
	| ResponseCustomToolCallItem
	| (Omit<ResponseCustomToolCallOutputItem, "output"> & {
			output: string | FunctionCallOutputContentItem[];
	  })
	| ResponseToolSearchOutputItem
	| ResponseWebSearchCallItem
	| ResponseImageGenerationCallItem
	| ResponseCompactionItem
	| ResponseOtherItem;

export function responseInputToResponseItem(
	item: ResponseInputItem,
): ResponseItem {
	switch (item.type) {
		case "message":
			return {
				type: "message",
				...(item.id ? { id: item.id } : {}),
				role: item.role,
				content: item.content,
				...(item.phase ? { phase: item.phase } : {}),
			};
		case "function_call_output":
			return {
				type: "function_call_output",
				call_id: item.call_id,
				output: item.output,
			};
		case "custom_tool_call_output":
			return {
				type: "custom_tool_call_output",
				call_id: item.call_id,
				...(item.name ? { name: item.name } : {}),
				output: item.output,
			};
		case "tool_search_output":
			return {
				type: "tool_search_output",
				call_id: item.call_id,
				status: item.status,
				execution: item.execution,
				tools: item.tools,
			};
		case "mcp_tool_call_output":
			return {
				type: "function_call_output",
				call_id: item.call_id,
				output: mcpOutputAsFunctionCallOutputPayload(item.output),
			};
	}
}

export function functionCallOutputPayloadToWire(
	output: FunctionCallOutputPayload,
): string | FunctionCallOutputContentItem[] {
	if (output.body.type === "text") {
		return output.body.text;
	}

	return output.body.items;
}

function mcpOutputAsFunctionCallOutputPayload(output: unknown): FunctionCallOutputPayload {
	if (typeof output === "string") {
		return {
			body: {
				type: "text",
				text: output,
			},
			success: null,
		};
	}

	return {
		body: {
			type: "text",
			text: JSON.stringify(output) ?? String(output),
		},
		success: null,
	};
}
