import { defineConfig, type Options } from "tsup";

const external: Options["external"] = [
	"@legendapp/list",
	"@legendapp/list/react",
	"@lexical/react",
	"@lexical/react/LexicalComposer",
	"@lexical/react/LexicalComposerContext",
	"@lexical/react/LexicalContentEditable",
	"@lexical/react/LexicalErrorBoundary",
	"@lexical/react/LexicalHistoryPlugin",
	"@lexical/react/LexicalOnChangePlugin",
	"@lexical/react/LexicalPlainTextPlugin",
	"class-variance-authority",
	"clsx",
	"cmdk",
	"lexical",
	"lucide-react",
	"radix-ui",
	"react",
	"react-dom",
	"react/jsx-runtime",
	"react-markdown",
	"remark-gfm",
	"smol-toml",
	"tailwind-merge",
	"zustand",
	"zustand/middleware",
];

const baseConfig = {
	bundle: true,
	dts: true,
	external,
	format: ["esm"],
	minify: false,
	outDir: "dist",
	sourcemap: true,
	splitting: true,
	target: "es2022",
	treeshake: true,
} satisfies Options;

export default defineConfig([
	{
		...baseConfig,
		clean: true,
		entry: {
			index: "src/index.ts",
			"client/index": "src/client/index.ts",
			"react/index": "src/react/index.ts",
			"shadcn/index": "src/shadcn/index.ts",
		},
		platform: "browser",
	},
	{
		...baseConfig,
		clean: false,
		entry: {
			"server/index": "src/server/index.ts",
			"testing/index": "src/testing/index.ts",
			"unstable/codex-rs/config/index":
				"src/upstream/codex-rs/config/src/index.ts",
			"unstable/codex-rs/parity": "src/upstream/codex-rs/parity.ts",
			"unstable/codex-rs/unsupported": "src/upstream/codex-rs/unsupported.ts",
			"unstable/codex-rs/core/index": "src/upstream/codex-rs/core/src/index.ts",
			"unstable/codex-rs/core/config/index":
				"src/upstream/codex-rs/core/src/config/mod.ts",
			"unstable/codex-rs/thread-store/index":
				"src/upstream/codex-rs/thread-store/src/index.ts",
			"unstable/codex-rs/codex-api/index":
				"src/upstream/codex-rs/codex-api/src/index.ts",
			"unstable/codex-rs/app-server/index":
				"src/upstream/codex-rs/app-server/src/index.ts",
			"unstable/codex-rs/app-server-protocol/index":
				"src/upstream/codex-rs/app-server-protocol/schema/typescript/index.ts",
			"unstable/codex-rs/app-server-protocol/protocol":
				"src/upstream/codex-rs/app-server-protocol/src/protocol/index.ts",
			"unstable/codex-rs/model-provider/index":
				"src/upstream/codex-rs/model-provider/src/index.ts",
			"unstable/codex-rs/models-manager/index":
				"src/upstream/codex-rs/models-manager/src/index.ts",
			"unstable/codex-rs/utils/output-truncation":
				"src/upstream/codex-rs/utils/output-truncation/src/lib.ts",
			"unstable/codex-rs/utils/string":
				"src/upstream/codex-rs/utils/string/src/lib.ts",
			"unstable/t3code/apps/web/index":
				"src/upstream/t3code/apps/web/src/index.ts",
			"unstable/t3code/apps/web/components/chat":
				"src/upstream/t3code/apps/web/src/components/chat/index.ts",
		},
		platform: "neutral",
	},
]);
