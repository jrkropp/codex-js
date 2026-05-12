export type StreamOutput<T = string> = {
	text: T;
	truncated_after_lines?: number | null;
};

export type ExecToolCallOutput = {
	exit_code: number;
	stdout: StreamOutput<string>;
	stderr: StreamOutput<string>;
	aggregated_output: StreamOutput<string>;
	duration_ms: number;
	timed_out: boolean;
};

export function streamOutput(text: string): StreamOutput<string> {
	return {
		text,
		truncated_after_lines: null,
	};
}

export function execToolCallOutput(input: {
	exit_code: number;
	stdout?: string;
	stderr?: string;
	duration_ms?: number;
	timed_out?: boolean;
}): ExecToolCallOutput {
	const stdout = input.stdout ?? "";
	const stderr = input.stderr ?? "";
	return {
		exit_code: input.exit_code,
		stdout: streamOutput(stdout),
		stderr: streamOutput(stderr),
		aggregated_output: streamOutput(`${stdout}${stderr}`),
		duration_ms: input.duration_ms ?? 0,
		timed_out: input.timed_out ?? false,
	};
}
