import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { codexJsAliases } from "../codex-js-vite-aliases";

export default defineConfig({
	build: {
		outDir: "dist",
	},
	plugins: [react(), tailwindcss(), cloudflare()],
	resolve: {
		alias: codexJsAliases,
		dedupe: ["react", "react-dom"],
	},
});
