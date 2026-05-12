import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";
import { codexJsAliases } from "../codex-js-vite-aliases";

export default defineWorkersConfig({
	resolve: {
		alias: codexJsAliases,
	},
	test: {
		include: ["test/**/*.test.ts"],
		poolOptions: {
			workers: {
				isolatedStorage: false,
				main: "./src/worker/index.ts",
				wrangler: {
					configPath: "./wrangler.test.jsonc",
				},
			},
		},
	},
});
