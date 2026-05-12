import { defineConfig } from "tsup";

export default defineConfig({
	bundle: true,
	clean: false,
	dts: false,
	entry: {
		index: "src/index.ts",
		"client/index": "src/client/index.ts",
		"server/index": "src/server/index.ts",
		"testing/index": "src/testing/index.ts",
	},
	external: ["smol-toml"],
	format: ["esm"],
	minify: false,
	outDir: "dist",
	platform: "neutral",
	sourcemap: false,
	splitting: false,
	target: "es2022",
	treeshake: true,
});
