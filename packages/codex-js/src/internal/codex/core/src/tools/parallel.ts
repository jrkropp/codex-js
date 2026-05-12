import type { ResponseInputItem } from "../protocol";
import type { Session } from "../session/session";
import type { TurnContext } from "../session/turn-context";
import {
	AnyToolResult,
	FunctionCallError,
	FunctionCallErrorKind,
	FunctionToolOutput,
	type ToolPayload,
	type ToolOutput,
	type ToolCallSource,
} from "./context";
import { type ToolCall, type ToolRouter } from "./router";
import { ToolDispatchTrace } from "./tool_dispatch_trace";

export type ToolCallRuntimeParams = {
	router: ToolRouter;
	session: Session;
	turn: TurnContext;
};

export class AbortedToolOutput implements ToolOutput {
	constructor(readonly message: string) {}

	logPreview(): string {
		return this.message;
	}

	successForLogging(): boolean {
		return false;
	}

	toResponseItem(callId: string, payload: ToolPayload): ResponseInputItem {
		if (payload.type === "tool_search") {
			return {
				type: "tool_search_output",
				call_id: callId,
				status: "completed",
				execution: "client",
				tools: [],
			};
		}

		return FunctionToolOutput.fromText(this.message, null).toResponseItem(
			callId,
			payload,
		);
	}

	postToolUseResponse(): unknown | null {
		return null;
	}

	codeModeResult(): unknown {
		return {};
	}
}

export class ToolCallRuntime {
	private readonly parallelExecution = new ReadWriteExecutionGate();

	constructor(private readonly params: ToolCallRuntimeParams) {}

	find_spec(toolName: Parameters<ToolRouter["find_spec"]>[0]) {
		return this.params.router.find_spec(toolName);
	}

	create_diff_consumer(toolName: Parameters<ToolRouter["createDiffConsumer"]>[0]) {
		return this.params.router.createDiffConsumer(toolName);
	}

	async handle_tool_call(
		call: ToolCall,
		signal?: AbortSignal,
	): Promise<ResponseInputItem> {
		try {
			const result = await this.handle_tool_call_with_source(
				call,
				{ type: "direct" },
				signal,
			);
			return result.intoResponse();
		} catch (error) {
			if (isFunctionCallError(error)) {
				if (error.kind === FunctionCallErrorKind.Fatal) {
					throw error;
				}

				return ToolCallRuntime.failureResponse(call, error);
			}

			throw error;
		}
	}

	async handle_tool_call_with_source(
		call: ToolCall,
		source: ToolCallSource = { type: "direct" },
		signal?: AbortSignal,
		trace = new ToolDispatchTrace(),
	): Promise<AnyToolResult> {
		const startedAt = Date.now();

		if (signal?.aborted) {
			return ToolCallRuntime.abortedResponse(call, 0.1);
		}

		trace.start(call);
		const run = async () => {
			try {
				const result = await this.raceAbort(
					this.params.router.dispatch_tool_call_with_code_mode_result({
						session: this.params.session,
						turn: this.params.turn,
						call,
						source,
						signal,
					}),
					call,
					startedAt,
					signal,
				);
				trace.record_completed(call);
				return result;
			} catch (error) {
				if (error instanceof Error) {
					trace.record_failed(call, error);
				}
				throw error;
			}
		};

		const release = await (this.params.router.tool_supports_parallel(call)
			? this.parallelExecution.read()
			: this.parallelExecution.write());
		try {
			return await run();
		} finally {
			release();
		}
	}

	static failureResponse(
		call: ToolCall,
		error: FunctionCallError,
	): ResponseInputItem {
		const message = error.message;
		if (call.payload.type === "tool_search") {
			return {
				type: "tool_search_output",
				call_id: call.call_id,
				status: "completed",
				execution: "client",
				tools: [],
			};
		}

		return FunctionToolOutput.fromText(message, false).toResponseItem(
			call.call_id,
			call.payload,
		);
	}

	static abortedResponse(call: ToolCall, secs: number): AnyToolResult {
		return new AnyToolResult(
			call.call_id,
			call.payload,
			new AbortedToolOutput(ToolCallRuntime.abortMessage(call, secs)),
			null,
		);
	}

	private async raceAbort(
		promise: Promise<AnyToolResult>,
		call: ToolCall,
		startedAt: number,
		signal?: AbortSignal,
	): Promise<AnyToolResult> {
		if (!signal) {
			return promise;
		}

		if (signal.aborted) {
			return ToolCallRuntime.abortedResponse(call, 0.1);
		}

		return Promise.race([
			promise,
			new Promise<AnyToolResult>((resolve) => {
				signal.addEventListener(
					"abort",
					() => {
						const elapsedSeconds = Math.max(
							0.1,
							(Date.now() - startedAt) / 1000,
						);
						resolve(ToolCallRuntime.abortedResponse(call, elapsedSeconds));
					},
					{ once: true },
				);
			}),
		]);
	}

	private static abortMessage(call: ToolCall, secs: number): string {
		if (
			call.tool_name.namespace === null &&
			["shell", "container.exec", "local_shell", "shell_command", "unified_exec"].includes(
				call.tool_name.name,
			)
		) {
			return `Wall time: ${secs.toFixed(1)} seconds\naborted by user`;
		}

		return `aborted by user after ${secs.toFixed(1)}s`;
	}
}

type QueuedExecution = {
	kind: "read" | "write";
	resolve: (release: () => void) => void;
};

class ReadWriteExecutionGate {
	private activeReaders = 0;
	private writerActive = false;
	private readonly queue: QueuedExecution[] = [];

	read(): Promise<() => void> {
		return this.acquire("read");
	}

	write(): Promise<() => void> {
		return this.acquire("write");
	}

	private acquire(kind: "read" | "write"): Promise<() => void> {
		if (this.canGrantImmediately(kind)) {
			this.grant(kind);
			return Promise.resolve(() => this.release(kind));
		}

		return new Promise((resolve) => {
			this.queue.push({ kind, resolve });
			this.drain();
		});
	}

	private canGrantImmediately(kind: "read" | "write"): boolean {
		if (kind === "read") {
			return !this.writerActive && !this.queue.some((entry) => entry.kind === "write");
		}
		return !this.writerActive && this.activeReaders === 0 && this.queue.length === 0;
	}

	private drain(): void {
		if (this.writerActive) {
			return;
		}

		const next = this.queue[0];
		if (!next) {
			return;
		}

		if (next.kind === "write") {
			if (this.activeReaders > 0) {
				return;
			}
			this.queue.shift();
			this.grant("write");
			next.resolve(() => this.release("write"));
			return;
		}

		while (this.queue[0]?.kind === "read" && !this.writerActive) {
			const read = this.queue.shift() as QueuedExecution;
			this.grant("read");
			read.resolve(() => this.release("read"));
		}
	}

	private grant(kind: "read" | "write"): void {
		if (kind === "read") {
			this.activeReaders += 1;
			return;
		}
		this.writerActive = true;
	}

	private release(kind: "read" | "write"): void {
		if (kind === "read") {
			this.activeReaders = Math.max(0, this.activeReaders - 1);
		} else {
			this.writerActive = false;
		}
		this.drain();
	}
}

function isFunctionCallError(error: unknown): error is FunctionCallError {
	return (
		typeof error === "object" &&
		error !== null &&
		"kind" in error &&
		"message" in error
	);
}
