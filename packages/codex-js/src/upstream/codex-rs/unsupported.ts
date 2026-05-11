export type CodexReferenceModule = {
	crate: string;
	reason: string;
	referencePath: string;
	status: "stubbed" | "platform_adaptation";
};

export class UnsupportedCodexFeatureError extends Error {
	readonly crate: string;
	readonly referencePath: string;
	readonly reason: string;

	constructor(module: CodexReferenceModule, message?: string) {
		super(
			message ??
				`Unsupported Codex feature: ${module.referencePath} (${module.reason})`,
		);
		this.name = "UnsupportedCodexFeatureError";
		this.crate = module.crate;
		this.referencePath = module.referencePath;
		this.reason = module.reason;
	}
}

export function unsupportedCodexFeature(
	module: CodexReferenceModule,
	message?: string,
): never {
	throw new UnsupportedCodexFeatureError(module, message);
}
