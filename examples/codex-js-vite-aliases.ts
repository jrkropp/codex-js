import type { AliasOptions } from "vite";

export const codexJsAliases = [
	{
		find: "@jrkropp/codex-js/client",
		replacement: new URL(
			"../packages/codex-js/src/client/index.ts",
			import.meta.url,
		).pathname,
	},
	{
		find: "@jrkropp/codex-js/server",
		replacement: new URL(
			"../packages/codex-js/src/server/index.ts",
			import.meta.url,
		).pathname,
	},
	{
		find: "@jrkropp/codex-js/testing",
		replacement: new URL(
			"../packages/codex-js/src/testing/index.ts",
			import.meta.url,
		).pathname,
	},
	{
		find: "@jrkropp/codex-js-react/shadcn",
		replacement: new URL(
			"../packages/codex-js-react/src/shadcn/index.ts",
			import.meta.url,
		).pathname,
	},
	{
		find: "@jrkropp/codex-js-react/styles.css",
		replacement: new URL(
			"../packages/codex-js-react/src/styles.css",
			import.meta.url,
		).pathname,
	},
	{
		find: /^@jrkropp\/codex-js$/,
		replacement: new URL("../packages/codex-js/src/index.ts", import.meta.url)
			.pathname,
	},
	{
		find: /^@jrkropp\/codex-js-react$/,
		replacement: new URL(
			"../packages/codex-js-react/src/index.ts",
			import.meta.url,
		).pathname,
	},
] satisfies AliasOptions;
