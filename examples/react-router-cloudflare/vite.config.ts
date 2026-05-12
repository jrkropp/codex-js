import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { codexJsAliases } from "../codex-js-vite-aliases";

export default defineConfig({
	resolve: {
		alias: codexJsAliases,
		dedupe: ["react", "react-dom"],
	},
	plugins: [tailwindcss()],
});
