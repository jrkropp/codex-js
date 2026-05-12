import { execToolCallOutput } from "../../../exec-output";
import {
	FunctionCallError,
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../../context";
import { emitToolEvent, ToolEmitter } from "../../events";
import { ToolName } from "../../tool_name";

export const EXEC_COMMAND_TOOL_NAME = "exec_command";

const EXECUTOR_UNAVAILABLE =
	"tool execution is unavailable in this Codex assistant runtime; a desktop/local executor is required.";

export class ExecCommandHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(EXEC_COMMAND_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async isMutating(): Promise<boolean> {
		return true;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		const args = parseFunctionArgs<ExecCommandArgs>(
			invocation,
			EXEC_COMMAND_TOOL_NAME,
		);
		const command = args.cmd?.trim();
		if (!command) {
			throw FunctionCallError.respondToModel("exec_command requires `cmd`");
		}

		const cwd = args.workdir?.trim() || invocation.turn.cwd;
		const emitter = ToolEmitter.unified_exec({
			command: [command],
			cwd,
		});
		await emitToolEvent(emitter, eventCtx(invocation), { type: "begin" });
		const output = execToolCallOutput({
			exit_code: 1,
			stderr: EXECUTOR_UNAVAILABLE,
		});
		await emitToolEvent(emitter, eventCtx(invocation), {
			type: "failure",
			failure: { type: "output", output },
		});
		return FunctionToolOutput.fromText(EXECUTOR_UNAVAILABLE, false);
	}
}

export type ExecCommandArgs = {
	cmd?: string;
	workdir?: string | null;
};

function parseFunctionArgs<T>(
	invocation: ToolInvocation,
	toolName: string,
): T {
	if (invocation.payload.type !== "function") {
		throw FunctionCallError.respondToModel(
			`${toolName} handler received unsupported payload`,
		);
	}
	try {
		return JSON.parse(invocation.payload.arguments) as T;
	} catch (error) {
		throw FunctionCallError.respondToModel(
			`failed to parse function arguments: ${errorMessage(error)}`,
		);
	}
}

function eventCtx(invocation: ToolInvocation) {
	return {
		session: invocation.session,
		turn: invocation.turn,
		call_id: invocation.call_id,
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
