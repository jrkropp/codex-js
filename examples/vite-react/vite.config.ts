import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
	resolve: {
		dedupe: ["react", "react-dom"],
	},
	plugins: [tailwindcss()],
});
