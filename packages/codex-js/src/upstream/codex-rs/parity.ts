export type CodexParityStatus =
	| "implemented"
	| "stubbed"
	| "platform_adaptation"
	| "missing";

export type CodexParityLedgerFile = {
	crate: string;
	referencePath: string;
	mirrorPath: string;
	reason: string;
	status: CodexParityStatus;
};

export type CodexParityLedgerTotals = {
	referenceCrates: number;
	referenceRustFiles: number;
	implemented: number;
	platform_adaptation: number;
	stubbed: number;
	missing: number;
};

export type CodexParityLedger = {
	schema: "codex-rs-typescript-parity-ledger.v1";
	referenceRoot: string;
	mirrorRoot: string;
	totals: CodexParityLedgerTotals;
	crates: string[];
	files: CodexParityLedgerFile[];
};
