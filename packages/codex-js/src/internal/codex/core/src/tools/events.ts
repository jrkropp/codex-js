import type { FileChange, FileChangeTurnItem } from "../items";
import type { Session } from "../session/session";
import type { TurnContext } from "../session/turn-context";
import type { ExecToolCallOutput } from "../exec-output";

export type ToolEventCtx = {
	session: Session;
	turn: TurnContext;
	call_id: string;
};

export type ToolEventFailure =
	| { type: "output"; output: ExecToolCallOutput }
	| { type: "message"; message: string }
	| { type: "rejected"; message: string };

export type ToolEventStage =
	| { type: "begin" }
	| { type: "success"; output: ExecToolCallOutput }
	| { type: "failure"; failure: ToolEventFailure };

export type ToolEmitter =
	| {
			type: "unified_exec";
			command: string[];
			cwd: string;
			process_id?: string | null;
	  }
	| {
			type: "apply_patch";
			changes: Record<string, FileChange>;
			auto_approved?: boolean;
	  };

export const ToolEmitter = {
	unified_exec(input: {
		command: string[];
		cwd: string;
		process_id?: string | null;
	}): ToolEmitter {
		return { type: "unified_exec", ...input };
	},

	apply_patch(input: {
		changes: Record<string, FileChange>;
		auto_approved?: boolean;
	}): ToolEmitter {
		return { type: "apply_patch", ...input };
	},
};

export async function emitToolEvent(
	emitter: ToolEmitter,
	ctx: ToolEventCtx,
	stage: ToolEventStage,
): Promise<void> {
	if (emitter.type === "unified_exec") {
		await emitUnifiedExecEvent(emitter, ctx, stage);
		return;
	}
	await emitApplyPatchEvent(emitter, ctx, stage);
}

async function emitUnifiedExecEvent(
	emitter: Extract<ToolEmitter, { type: "unified_exec" }>,
	ctx: ToolEventCtx,
	stage: ToolEventStage,
): Promise<void> {
	switch (stage.type) {
		case "begin":
			await ctx.session.send_event(ctx.turn, {
				type: "exec_command_begin",
				call_id: ctx.call_id,
				process_id: emitter.process_id ?? null,
				turn_id: ctx.turn.sub_id,
				started_at_ms: Date.now(),
				command: emitter.command,
				cwd: emitter.cwd,
				parsed_cmd: [],
				source: "model",
				interaction_input: null,
			});
			return;
		case "success":
			await ctx.session.send_event(ctx.turn, {
				type: "exec_command_end",
				call_id: ctx.call_id,
				turn_id: ctx.turn.sub_id,
				process_id: emitter.process_id ?? null,
				completed_at_ms: Date.now(),
				exit_code: stage.output.exit_code,
				status: stage.output.exit_code === 0 ? "completed" : "failed",
				duration_ms: stage.output.duration_ms,
				stdout: stage.output.stdout.text,
				stderr: stage.output.stderr.text,
				output: stage.output,
			});
			return;
		case "failure": {
			const output =
				stage.failure.type === "output" ? stage.failure.output : null;
			await ctx.session.send_event(ctx.turn, {
				type: "exec_command_end",
				call_id: ctx.call_id,
				turn_id: ctx.turn.sub_id,
				process_id: emitter.process_id ?? null,
				completed_at_ms: Date.now(),
				exit_code: output?.exit_code ?? 1,
				status: stage.failure.type === "rejected" ? "cancelled" : "failed",
				duration_ms: output?.duration_ms ?? null,
				stdout: output?.stdout.text ?? "",
				stderr:
					output?.stderr.text ??
					(stage.failure.type === "message" || stage.failure.type === "rejected"
						? stage.failure.message
						: ""),
				output,
			});
		}
	}
}

async function emitApplyPatchEvent(
	emitter: Extract<ToolEmitter, { type: "apply_patch" }>,
	ctx: ToolEventCtx,
	stage: ToolEventStage,
): Promise<void> {
	const baseItem: FileChangeTurnItem = {
		type: "FileChange",
		id: ctx.call_id,
		changes: emitter.changes,
		status: null,
		auto_approved: emitter.auto_approved ?? false,
		stdout: "",
		stderr: "",
	};

	switch (stage.type) {
		case "begin":
			await ctx.session.send_event(ctx.turn, {
				type: "item_started",
				turn_id: ctx.turn.sub_id,
				item: baseItem,
			});
			await ctx.session.send_event(ctx.turn, {
				type: "patch_apply_updated",
				call_id: ctx.call_id,
				turn_id: ctx.turn.sub_id,
				changes: emitter.changes,
				status: null,
				stdout: "",
				stderr: "",
			});
			return;
		case "success":
			await ctx.session.send_event(ctx.turn, {
				type: "item_completed",
				turn_id: ctx.turn.sub_id,
				item: {
					...baseItem,
					status: stage.output.exit_code === 0 ? "completed" : "failed",
					stdout: stage.output.stdout.text,
					stderr: stage.output.stderr.text,
				},
			});
			await ctx.session.send_event(ctx.turn, {
				type: "patch_apply_updated",
				call_id: ctx.call_id,
				turn_id: ctx.turn.sub_id,
				changes: emitter.changes,
				status: stage.output.exit_code === 0 ? "completed" : "failed",
				stdout: stage.output.stdout.text,
				stderr: stage.output.stderr.text,
			});
			return;
		case "failure":
			await ctx.session.send_event(ctx.turn, {
				type: "item_completed",
				turn_id: ctx.turn.sub_id,
				item: {
					...baseItem,
					status: stage.failure.type === "rejected" ? "declined" : "failed",
					stderr:
						stage.failure.type === "output"
							? stage.failure.output.stderr.text
							: stage.failure.message,
				},
			});
			await ctx.session.send_event(ctx.turn, {
				type: "patch_apply_updated",
				call_id: ctx.call_id,
				turn_id: ctx.turn.sub_id,
				changes: emitter.changes,
				status: stage.failure.type === "rejected" ? "declined" : "failed",
				stdout:
					stage.failure.type === "output"
						? stage.failure.output.stdout.text
						: "",
				stderr:
					stage.failure.type === "output"
						? stage.failure.output.stderr.text
						: stage.failure.message,
			});
	}
}
