const APPROX_BYTES_PER_TOKEN = 4;

export function truncate_middle_chars(value: string, maxBytes: number): string {
	return truncate_with_byte_estimate(value, maxBytes, false);
}

export function truncate_middle_with_token_budget(
	value: string,
	maxTokens: number,
): [string, number | null] {
	if (value.length === 0) {
		return ["", null];
	}
	if (maxTokens > 0 && utf8ByteLength(value) <= approx_bytes_for_tokens(maxTokens)) {
		return [value, null];
	}

	const truncated = truncate_with_byte_estimate(
		value,
		approx_bytes_for_tokens(maxTokens),
		true,
	);
	const totalTokens = approx_token_count(value);
	return truncated === value ? [truncated, null] : [truncated, totalTokens];
}

export function approx_token_count(text: string): number {
	const length = utf8ByteLength(text);
	return Math.ceil(length / APPROX_BYTES_PER_TOKEN);
}

export function approx_bytes_for_tokens(tokens: number): number {
	return Math.max(0, Math.trunc(tokens)) * APPROX_BYTES_PER_TOKEN;
}

export function approx_tokens_from_byte_count(bytes: number): number {
	return Math.ceil(Math.max(0, Math.trunc(bytes)) / APPROX_BYTES_PER_TOKEN);
}

function truncate_with_byte_estimate(
	value: string,
	maxBytes: number,
	useTokens: boolean,
): string {
	if (value.length === 0) {
		return "";
	}
	const normalizedMaxBytes = Math.max(0, Math.trunc(maxBytes));
	const totalBytes = utf8ByteLength(value);
	if (normalizedMaxBytes === 0) {
		return format_truncation_marker(
			useTokens,
			removed_units(useTokens, totalBytes, [...value].length),
		);
	}
	if (totalBytes <= normalizedMaxBytes) {
		return value;
	}

	const [leftBudget, rightBudget] = split_budget(normalizedMaxBytes);
	const { left, removedChars, right } = split_string(value, leftBudget, rightBudget);
	const marker = format_truncation_marker(
		useTokens,
		removed_units(
			useTokens,
			Math.max(0, totalBytes - normalizedMaxBytes),
			removedChars,
		),
	);
	return assemble_truncated_output(left, right, marker);
}

function split_budget(maxBytes: number): [number, number] {
	const left = Math.floor(maxBytes / 2);
	return [left, maxBytes - left];
}

function split_string(
	value: string,
	beginningBytes: number,
	endBytes: number,
): { left: string; removedChars: number; right: string } {
	let left = "";
	let right = "";
	let leftBytes = 0;
	const chars = [...value];
	for (const char of chars) {
		const nextBytes = utf8ByteLength(char);
		if (leftBytes + nextBytes > beginningBytes) {
			break;
		}
		left += char;
		leftBytes += nextBytes;
	}

	let rightBytes = 0;
	for (let index = chars.length - 1; index >= 0; index -= 1) {
		const char = chars[index] ?? "";
		const nextBytes = utf8ByteLength(char);
		if (rightBytes + nextBytes > endBytes) {
			break;
		}
		right = `${char}${right}`;
		rightBytes += nextBytes;
	}

	const keptChars = [...left].length + [...right].length;
	return {
		left,
		removedChars: Math.max(0, chars.length - keptChars),
		right,
	};
}

function assemble_truncated_output(
	left: string,
	right: string,
	marker: string,
): string {
	if (!left && !right) {
		return marker;
	}
	if (!left) {
		return `${marker}${right}`;
	}
	if (!right) {
		return `${left}${marker}`;
	}
	return `${left}${marker}${right}`;
}

function format_truncation_marker(useTokens: boolean, removedUnits: number): string {
	const unit = useTokens ? "tokens" : "chars";
	return `…${removedUnits} ${unit} truncated…`;
}

function removed_units(
	useTokens: boolean,
	removedBytes: number,
	removedChars: number,
): number {
	return useTokens ? approx_tokens_from_byte_count(removedBytes) : removedChars;
}

function utf8ByteLength(value: string): number {
	return new TextEncoder().encode(value).byteLength;
}
