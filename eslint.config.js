import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			".changeset/**",
			"external/**",
			"node_modules/**",
			"packages/*/dist/**",
			"examples/*/dist/**",
			"examples/cloudflare/worker-configuration.d.ts",
			"docs/internal/**",
			"pnpm-lock.yaml",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2022,
			globals: {
				...globals.browser,
				...globals.node,
				DurableObjectNamespace: "readonly",
				DurableObjectState: "readonly",
				DurableObjectStorage: "readonly",
				Env: "readonly",
				WebSocketPair: "readonly",
			},
			sourceType: "module",
		},
		rules: {
			"no-console": "off",
			"no-undef": "off",
			"preserve-caught-error": "off",
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-this-alias": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					argsIgnorePattern: "^_",
					caughtErrorsIgnorePattern: "^_",
					varsIgnorePattern: "^_",
				},
			],
		},
	},
	{
		files: ["**/*.tsx"],
		plugins: {
			"react-hooks": reactHooks,
		},
		rules: {
			"react-hooks/exhaustive-deps": "error",
			"react-hooks/rules-of-hooks": "error",
		},
	},
);
