export type CodexBrand<TValue, TBrand extends string> = TValue & {
	readonly __codexBrand: TBrand;
};

export type ThreadId = CodexBrand<string, "ThreadId">;

export function asThreadId(value: string): ThreadId {
	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
	if (!uuidPattern.test(value)) {
		throw new Error(`Invalid ThreadId: ${value}`);
	}

	return value as ThreadId;
}
