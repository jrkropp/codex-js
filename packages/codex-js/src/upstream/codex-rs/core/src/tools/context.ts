import type {
	FunctionCallOutputBody,
	FunctionCallOutputContentItem,
	FunctionCallOutputPayload,
	ResponseInputItem,
	TruncationPolicy,
} from "../protocol";
import type { Session } from "../session/session";
import type { TurnContext } from "../session/turn-context";
import {
	run_post_tool_use_hooks,
	run_pre_tool_use_hooks,
} from "../hooks";
import { truncate_function_output_payload } from "../context_manager/history";
import { ToolName, type ToolNameInput } from "./tool_name";
export type { ConfiguredToolSpec, ToolSpec } from "./tool_spec";

export const ToolKind = {
	Function: "Function",
	Mcp: "Mcp",
} as const;

export type ToolKind = (typeof ToolKind)[keyof typeof ToolKind];

export type SearchToolCallParams = {
	query?: string;
	limit?: number;
	[key: string]: unknown;
};

export type ShellToolCallParams = {
	command?: string[];
	workdir?: string | null;
	timeout_ms?: number | null;
	sandbox_permissions?: unknown;
	prefix_rule?: string[] | null;
	justification?: string | null;
	[key: string]: unknown;
};

export type ToolPayload =
	| { type: "function"; arguments: string }
	| { type: "tool_search"; arguments: SearchToolCallParams }
	| { type: "custom"; input: string }
	| { type: "local_shell"; params: ShellToolCallParams }
	| { type: "mcp"; server: string; tool: string; raw_arguments: string };

export function logPayload(payload: ToolPayload): string {
	switch (payload.type) {
		case "function":
			return payload.arguments;
		case "tool_search":
			return payload.arguments.query ?? JSON.stringify(payload.arguments);
		case "custom":
			return payload.input;
		case "local_shell":
			return payload.params.command?.join(" ") ?? JSON.stringify(payload.params);
		case "mcp":
			return payload.raw_arguments;
	}
}

export type ToolCallSource =
	| { type: "direct" }
	| {
			type: "code_mode";
			cell_id: string;
			runtime_tool_call_id: string;
	  };

export type ToolInvocation = {
	session: Session;
	turn: TurnContext;
	cancellation_token: CancellationToken;
	call_id: string;
	tool_name: ToolNameInput;
	source: ToolCallSource;
	payload: ToolPayload;
};

export class CancellationToken {
	constructor(readonly signal?: AbortSignal) {}

	is_cancelled(): boolean {
		return this.signal?.aborted ?? false;
	}

	cancelled(): Promise<void> {
		if (!this.signal || this.signal.aborted) {
			return Promise.resolve();
		}
		return new Promise((resolve) => {
			this.signal?.addEventListener("abort", () => resolve(), { once: true });
		});
	}
}

export type PreToolUsePayload = {
	tool_name: string;
	tool_input: unknown;
};

export type PostToolUsePayload = {
	tool_name: string;
	tool_use_id: string;
	tool_input: unknown;
	tool_response: unknown;
};

export interface ToolArgumentDiffConsumer {
	consumeDiff(
		turn: TurnContext,
		callId: string,
		diff: string,
	): unknown | null;
	finish?(): unknown | null;
}

export interface ToolOutput {
	logPreview(): string;
	successForLogging(): boolean;
	toResponseItem(callId: string, payload: ToolPayload): ResponseInputItem;
	postToolUseResponse(callId: string, payload: ToolPayload): unknown | null;
	codeModeResult(payload: ToolPayload): unknown;
}

export class FunctionToolOutput implements ToolOutput {
	constructor(
		readonly body: FunctionCallOutputContentItem[],
		readonly success?: boolean | null,
		readonly post_tool_use_response: unknown | null = null,
	) {}

	static fromText(text: string, success?: boolean | null): FunctionToolOutput {
		return new FunctionToolOutput([{ type: "input_text", text }], success);
	}

	static fromContent(
		content: FunctionCallOutputContentItem[],
		success?: boolean | null,
	): FunctionToolOutput {
		return new FunctionToolOutput(content, success);
	}

	intoText(): string {
		return contentItemsToText(this.body);
	}

	logPreview(): string {
		return this.intoText();
	}

	successForLogging(): boolean {
		return this.success ?? true;
	}

	toResponseItem(callId: string, payload: ToolPayload): ResponseInputItem {
		return functionToolResponse(callId, payload, this.body, this.success);
	}

	postToolUseResponse(): unknown | null {
		return this.post_tool_use_response;
	}

	codeModeResult(): unknown {
		return this.intoText();
	}
}

export class McpToolOutput implements ToolOutput {
	constructor(
		readonly result: unknown,
		readonly tool_input: unknown,
		readonly wall_time_ms: number,
		readonly original_image_detail_supported: boolean,
		readonly truncation_policy?: TruncationPolicy | null,
	) {}

	logPreview(): string {
		return functionCallOutputPayloadToText(this.response_payload());
	}

	successForLogging(): boolean {
		return !isMcpErrorResult(this.result);
	}

	toResponseItem(callId: string): ResponseInputItem {
		return {
			type: "function_call_output",
			call_id: callId,
			output: this.response_payload(),
		};
	}

	postToolUseResponse(): unknown | null {
		return this.result;
	}

	codeModeResult(): unknown {
		return this.result;
	}

	private response_payload(): FunctionCallOutputPayload {
		const wallTimeSeconds = Math.max(0, this.wall_time_ms) / 1000;
		const header = `Wall time: ${wallTimeSeconds.toFixed(4)} seconds\nOutput:`;
		const outputText = mcpResultToText(this.result);
		const payload: FunctionCallOutputPayload = {
			body: {
				type: "text",
				text: outputText.length > 0 ? `${header}\n${outputText}` : header,
			},
			success: this.successForLogging(),
		};

		return truncate_function_output_payload(
			payload,
			this.truncation_policy ?? null,
		);
	}
}

export interface ToolHandler<TOutput extends ToolOutput = ToolOutput> {
	toolName(): ToolNameInput;
	kind(): ToolKind;
	matchesKind?(payload: ToolPayload): boolean;
	isMutating?(invocation: ToolInvocation): Promise<boolean>;
	preToolUsePayload?(invocation: ToolInvocation): PreToolUsePayload | null;
	postToolUsePayload?(
		invocation: ToolInvocation,
		result: TOutput,
	): PostToolUsePayload | null;
	createDiffConsumer?(): ToolArgumentDiffConsumer | null;
	handle(invocation: ToolInvocation): Promise<TOutput>;
}

export function matchesToolKind(
	kind: ToolKind,
	payload: ToolPayload,
): boolean {
	return (
		(kind === ToolKind.Function &&
			(payload.type === "function" || payload.type === "tool_search")) ||
		(kind === ToolKind.Mcp && payload.type === "mcp")
	);
}

export class AnyToolResult {
	constructor(
		readonly call_id: string,
		readonly payload: ToolPayload,
		readonly result: ToolOutput,
		readonly post_tool_use_payload: PostToolUsePayload | null,
	) {}

	intoResponse(): ResponseInputItem {
		return this.result.toResponseItem(this.call_id, this.payload);
	}

	codeModeResult(): unknown {
		return this.result.codeModeResult(this.payload);
	}
}

export const FunctionCallErrorKind = {
	RespondToModel: "respond_to_model",
	Fatal: "fatal",
} as const;

export type FunctionCallErrorKind =
	(typeof FunctionCallErrorKind)[keyof typeof FunctionCallErrorKind];

export class FunctionCallError extends Error {
	private constructor(
		readonly kind: FunctionCallErrorKind,
		message: string,
	) {
		super(message);
		this.name = "FunctionCallError";
	}

	static respondToModel(message: string): FunctionCallError {
		return new FunctionCallError(FunctionCallErrorKind.RespondToModel, message);
	}

	static fatal(message: string): FunctionCallError {
		return new FunctionCallError(FunctionCallErrorKind.Fatal, message);
	}
}

export class ToolRegistry {
	private constructor(
		private readonly handlers: Map<string, ToolHandler> = new Map(),
	) {}

	static emptyForTest(): ToolRegistry {
		return new ToolRegistry();
	}

	static withHandlerForTest(handler: ToolHandler): ToolRegistry {
		return new ToolRegistry(new Map([[ToolName.from(handler.toolName()).key(), handler]]));
	}

	static fromHandlersForBuilder(handlers: Map<string, ToolHandler>): ToolRegistry {
		return new ToolRegistry(new Map(handlers));
	}

	hasHandler(name: ToolNameInput): boolean {
		return this.handlers.has(ToolName.from(name).key());
	}

	createDiffConsumer(name: ToolNameInput): ToolArgumentDiffConsumer | null {
		return (
			this.handlers.get(ToolName.from(name).key())?.createDiffConsumer?.() ??
			null
		);
	}

	async dispatchAny(invocation: ToolInvocation): Promise<AnyToolResult> {
		if (invocation.session.activeTurn) {
			invocation.session.activeTurn.turn_state.tool_calls += 1;
		}

		const toolName = ToolName.from(invocation.tool_name);
		const displayName = toolName.display();
		const handler = this.handlers.get(toolName.key());
		if (!handler) {
			throw FunctionCallError.respondToModel(
				unsupportedToolCallMessage(invocation.payload, toolName),
			);
		}

		const matchesKind =
			handler.matchesKind?.(invocation.payload) ??
			matchesToolKind(handler.kind(), invocation.payload);
		if (!matchesKind) {
			throw FunctionCallError.fatal(
				`tool ${displayName} invoked with incompatible payload`,
			);
		}

		if (!invocation.session.hooks().is_empty()) {
			const preToolUsePayload =
				handler.preToolUsePayload?.(invocation) ??
				defaultPreToolUsePayload(invocation, displayName);
			const blockMessage = await run_pre_tool_use_hooks(
				invocation.session,
				invocation.turn,
				{
					tool_use_id: invocation.call_id,
					tool_name: preToolUsePayload.tool_name,
					tool_input: preToolUsePayload.tool_input,
				},
			);
			if (blockMessage) {
				throw FunctionCallError.respondToModel(blockMessage);
			}
		}

		await (handler.isMutating?.(invocation) ?? Promise.resolve(false));
		const result = await handler.handle(invocation);
		await invocation.session.note_tool_completed(
			invocation.turn,
			toolName.display(),
		);
		const postToolUsePayload =
			handler.postToolUsePayload?.(invocation, result) ?? null;
		if (postToolUsePayload && !invocation.session.hooks().is_empty()) {
			const outcome = await run_post_tool_use_hooks(
				invocation.session,
				invocation.turn,
				{
					tool_use_id: postToolUsePayload.tool_use_id,
					tool_name: postToolUsePayload.tool_name,
					tool_input: postToolUsePayload.tool_input,
					tool_response: postToolUsePayload.tool_response,
				},
			);
			const replacementText =
				(outcome.should_stop
					? (outcome.feedback_message ?? outcome.stop_reason)
					: outcome.feedback_message) ?? null;
			if (replacementText) {
				return new AnyToolResult(
					invocation.call_id,
					invocation.payload,
					FunctionToolOutput.fromText(replacementText, null),
					postToolUsePayload,
				);
			}
		}
		return new AnyToolResult(
			invocation.call_id,
			invocation.payload,
			result,
			postToolUsePayload,
		);
	}
}

function defaultPreToolUsePayload(
	invocation: ToolInvocation,
	displayName: string,
): PreToolUsePayload {
	return {
		tool_name: displayName,
		tool_input: hookToolInputFromPayload(invocation.payload),
	};
}

function hookToolInputFromPayload(payload: ToolPayload): unknown {
	switch (payload.type) {
		case "function":
			return parseJsonOrRaw(payload.arguments);
		case "tool_search":
			return payload.arguments;
		case "custom":
			return payload.input;
		case "local_shell":
			return payload.params;
		case "mcp":
			return {
				server: payload.server,
				tool: payload.tool,
				arguments: parseJsonOrRaw(payload.raw_arguments),
			};
	}
}

function parseJsonOrRaw(value: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return value;
	}
}

function functionToolResponse(
	callId: string,
	payload: ToolPayload,
	body: FunctionCallOutputContentItem[],
	success?: boolean | null,
): ResponseInputItem {
	const output: FunctionCallOutputPayload = {
		body: functionCallOutputBody(body),
		success,
	};

	if (payload.type === "custom") {
		return {
			type: "custom_tool_call_output",
			call_id: callId,
			name: null,
			output,
		};
	}

	return {
		type: "function_call_output",
		call_id: callId,
		output,
	};
}

function functionCallOutputBody(
	body: FunctionCallOutputContentItem[],
): FunctionCallOutputBody {
	if (body.length === 1 && body[0]?.type === "input_text") {
		return {
			type: "text",
			text: body[0].text,
		};
	}

	return {
		type: "content_items",
		items: body,
	};
}

function functionCallOutputPayloadToText(payload: FunctionCallOutputPayload): string {
	if (payload.body.type === "text") {
		return payload.body.text;
	}
	return contentItemsToText(payload.body.items);
}

function contentItemsToText(items: FunctionCallOutputContentItem[]): string {
	return items
		.map((item) => (item.type === "input_text" ? item.text : item.image_url))
		.filter((text) => text.trim().length > 0)
		.join("\n");
}

function mcpResultToText(result: unknown): string {
	if (typeof result === "string") {
		return result;
	}
	if (isRecord(result)) {
		const content = result.content;
		if (Array.isArray(content)) {
			const text = content
				.flatMap((item) => {
					if (!isRecord(item)) {
						return [];
					}
					if (typeof item.text === "string") {
						return [item.text];
					}
					if (typeof item.data === "string") {
						return [item.data];
					}
					if (typeof item.url === "string") {
						return [item.url];
					}
					return [];
				})
				.join("\n");
			if (text.length > 0) {
				return text;
			}
		}
	}
	try {
		return JSON.stringify(result) ?? String(result);
	} catch {
		return String(result);
	}
}

function isMcpErrorResult(result: unknown): boolean {
	return isRecord(result) && result.isError === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unsupportedToolCallMessage(
	payload: ToolPayload,
	toolName: ToolName,
): string {
	const displayName = toolName.display();
	if (payload.type === "custom") {
		return `unsupported custom tool call: ${displayName}`;
	}

	return `unsupported call: ${displayName}`;
}
