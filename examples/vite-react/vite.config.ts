import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const codexJsAliases = [
	{
		find: "@jrkropp/codex-js/client",
		replacement: new URL("../../packages/codex-js/src/client/index.ts", import.meta.url)
			.pathname,
	},
	{
		find: "@jrkropp/codex-js/react",
		replacement: new URL("../../packages/codex-js/src/react/index.ts", import.meta.url)
			.pathname,
	},
	{
		find: "@jrkropp/codex-js/server",
		replacement: new URL("../../packages/codex-js/src/server/index.ts", import.meta.url)
			.pathname,
	},
	{
		find: "@jrkropp/codex-js/shadcn",
		replacement: new URL("../../packages/codex-js/src/shadcn/index.ts", import.meta.url)
			.pathname,
	},
	{
		find: "@jrkropp/codex-js/testing",
		replacement: new URL("../../packages/codex-js/src/testing/index.ts", import.meta.url)
			.pathname,
	},
	{
		find: "@jrkropp/codex-js/styles.css",
		replacement: new URL("../../packages/codex-js/src/styles.css", import.meta.url)
			.pathname,
	},
	{
		find: /^@jrkropp\/codex-js$/,
		replacement: new URL("../../packages/codex-js/src/index.ts", import.meta.url)
			.pathname,
	},
];

export default defineConfig({
	resolve: {
		alias: codexJsAliases,
		dedupe: ["react", "react-dom"],
	},
	plugins: [tailwindcss()],
});
