import type { FileChange } from "../../items";
import { execToolCallOutput } from "../../exec-output";
import {
	FunctionCallError,
	FunctionToolOutput,
	ToolKind,
	type ToolHandler,
	type ToolInvocation,
} from "../context";
import { emitToolEvent, ToolEmitter } from "../events";
import { ToolName } from "../tool_name";

export const APPLY_PATCH_TOOL_NAME = "apply_patch";

const EXECUTOR_UNAVAILABLE =
	"tool execution is unavailable in this Codex assistant runtime; a desktop/local executor is required.";

export class ApplyPatchHandler implements ToolHandler<FunctionToolOutput> {
	toolName(): ToolName {
		return ToolName.plain(APPLY_PATCH_TOOL_NAME);
	}

	kind(): ToolKind {
		return ToolKind.Function;
	}

	async isMutating(): Promise<boolean> {
		return true;
	}

	async handle(invocation: ToolInvocation): Promise<FunctionToolOutput> {
		const args = parseFunctionArgs<ApplyPatchArgs>(
			invocation,
			APPLY_PATCH_TOOL_NAME,
		);
		const patch = args.patch?.trim();
		if (!patch) {
			throw FunctionCallError.respondToModel("apply_patch requires `patch`");
		}

		const changes = parseApplyPatchChanges(patch);
		const emitter = ToolEmitter.apply_patch({
			changes,
			auto_approved: false,
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

export type ApplyPatchArgs = {
	patch?: string;
};

export function parseApplyPatchChanges(patch: string): Record<string, FileChange> {
	const changes: Record<string, FileChange> = {};
	const lines = patch.split(/\r?\n/u);
	let index = 0;

	while (index < lines.length) {
		const line = lines[index] ?? "";
		if (line.startsWith("*** Add File: ")) {
			const path = line.slice("*** Add File: ".length).trim();
			const body: string[] = [];
			index += 1;
			while (index < lines.length && !isPatchHeader(lines[index] ?? "")) {
				const contentLine = lines[index] ?? "";
				body.push(
					contentLine.startsWith("+") ? contentLine.slice(1) : contentLine,
				);
				index += 1;
			}
			changes[path] = { type: "add", content: body.join("\n") };
			continue;
		}
		if (line.startsWith("*** Delete File: ")) {
			const path = line.slice("*** Delete File: ".length).trim();
			changes[path] = { type: "delete", content: "" };
			index += 1;
			continue;
		}
		if (line.startsWith("*** Update File: ")) {
			const path = line.slice("*** Update File: ".length).trim();
			const body: string[] = [];
			let movePath: string | null = null;
			index += 1;
			while (index < lines.length && !isPatchHeader(lines[index] ?? "")) {
				const contentLine = lines[index] ?? "";
				if (contentLine.startsWith("*** Move to: ")) {
					movePath = contentLine.slice("*** Move to: ".length).trim();
				} else {
					body.push(contentLine);
				}
				index += 1;
			}
			changes[path] = {
				type: "update",
				unified_diff: body.join("\n"),
				move_path: movePath,
			};
			continue;
		}
		index += 1;
	}

	if (Object.keys(changes).length === 0) {
		throw FunctionCallError.respondToModel(
			"failed to parse apply_patch: no file changes found",
		);
	}

	return changes;
}

function isPatchHeader(line: string): boolean {
	return (
		line.startsWith("*** Add File: ") ||
		line.startsWith("*** Delete File: ") ||
		line.startsWith("*** Update File: ") ||
		line === "*** End Patch"
	);
}

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
