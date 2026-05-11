export type DynamicToolSpec = {
	namespace?: string | null;
	name: string;
	description: string;
	input_schema: unknown;
	defer_loading?: boolean;
};

export type DynamicToolCallRequest = {
	call_id: string;
	turn_id: string;
	started_at_ms?: number;
	namespace?: string | null;
	tool: string;
	arguments: unknown;
};

export type DynamicToolCallOutputContentItem =
	| { type: "inputText"; text: string }
	| { type: "inputImage"; imageUrl: string };

export type DynamicToolResponse = {
	content_items: DynamicToolCallOutputContentItem[];
	success: boolean;
};

export type DynamicToolCallResponseEvent = {
	call_id: string;
	turn_id: string;
	completed_at_ms?: number;
	namespace?: string | null;
	tool: string;
	arguments: unknown;
	content_items: DynamicToolCallOutputContentItem[];
	success: boolean;
	error?: string | null;
	duration: string;
};

export type DynamicToolSpecWire = {
	namespace?: string | null;
	name: string;
	description: string;
	inputSchema: unknown;
	deferLoading?: boolean;
	exposeToContext?: boolean;
};

export function dynamicToolSpecToWire(
	spec: DynamicToolSpec,
): DynamicToolSpecWire {
	return {
		namespace: spec.namespace ?? null,
		name: spec.name,
		description: spec.description,
		inputSchema: spec.input_schema,
		deferLoading: spec.defer_loading ?? false,
	};
}

export function dynamicToolSpecFromWire(
	spec: DynamicToolSpecWire,
): DynamicToolSpec {
	const deferLoading =
		spec.deferLoading !== undefined
			? spec.deferLoading
			: spec.exposeToContext === undefined
				? false
				: !spec.exposeToContext;

	return {
		namespace: spec.namespace ?? null,
		name: spec.name,
		description: spec.description,
		input_schema: spec.inputSchema,
		defer_loading: deferLoading,
	};
}
