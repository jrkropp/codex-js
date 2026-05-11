import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const packageRoot = join(repoRoot, "packages/codex-js");

describe("codex-js package boundary", () => {
	it("publishes curated built subpath exports", () => {
		const packageJson = JSON.parse(
			readFileSync(join(packageRoot, "package.json"), "utf8"),
		) as {
			exports: Record<string, string | { import: string; types: string }>;
			files: string[];
			name: string;
			private?: boolean;
			version: string;
		};

		expect(packageJson.name).toBe("@jrkropp/codex-js");
		expect(packageJson.version).toBe("0.1.1");
		expect(packageJson.private).toBeUndefined();
		expect(packageJson.files).toEqual([
			"dist",
			"README.md",
			"CHANGELOG.md",
			"LICENSE",
			"NOTICE",
		]);
		expect(packageJson.exports).toMatchObject({
			".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
			"./client": {
				import: "./dist/client/index.js",
				types: "./dist/client/index.d.ts",
			},
			"./react": {
				import: "./dist/react/index.js",
				types: "./dist/react/index.d.ts",
			},
			"./server": {
				import: "./dist/server/index.js",
				types: "./dist/server/index.d.ts",
			},
			"./shadcn": {
				import: "./dist/shadcn/index.js",
				types: "./dist/shadcn/index.d.ts",
			},
			"./testing": {
				import: "./dist/testing/index.js",
				types: "./dist/testing/index.d.ts",
			},
			"./styles.css": "./dist/styles.css",
		});
		expect(packageJson.exports).not.toHaveProperty("./runtime");
		expect(packageJson.exports).not.toHaveProperty("./components");
		expect(packageJson.exports).not.toHaveProperty("./hooks");
		expect(packageJson.exports).not.toHaveProperty("./codex-rs/core");
		expect(packageJson.exports).not.toHaveProperty("./t3code/apps/web");
		expect(JSON.stringify(packageJson.exports)).not.toContain("./src/");
	});

	it("keeps public examples on package surfaces only", () => {
		const exampleSources = readSourceFiles(join(repoRoot, "examples"));
		const forbiddenImports = exampleSources.flatMap((file) =>
			Array.from(file.contents.matchAll(/from\s+["']([^"']+)["']/g))
				.map((match) => match[1] ?? "")
				.filter(
					(specifier) =>
						specifier.includes("packages/codex-js") ||
						specifier.startsWith("@jrkropp/codex-js/runtime") ||
						specifier.startsWith("@jrkropp/codex-js/components") ||
						specifier.startsWith("@jrkropp/codex-js/hooks") ||
						specifier.startsWith("@jrkropp/codex-js/codex-rs") ||
						specifier.startsWith("@jrkropp/codex-js/t3code"),
				)
				.map((specifier) => `${file.relativePath}: ${specifier}`),
		);
		const publicImports = exampleSources.flatMap((file) =>
			Array.from(file.contents.matchAll(/from\s+["']([^"']+)["']/g))
				.map((match) => match[1] ?? "")
				.filter((specifier) => specifier.startsWith("@jrkropp/codex-js"))
				.map((specifier) => `${file.relativePath}: ${specifier}`),
		);

		expect(forbiddenImports).toEqual([]);
		expect(publicImports).toEqual(
			expect.arrayContaining([
				expect.stringContaining("@jrkropp/codex-js/client"),
				expect.stringContaining("@jrkropp/codex-js/react"),
				expect.stringContaining("@jrkropp/codex-js/server"),
			]),
		);
	});

	it("keeps attribution and npm tarball boundaries explicit", () => {
		const rootReadme = readFileSync(join(repoRoot, "README.md"), "utf8");
		const packageReadme = readFileSync(join(packageRoot, "README.md"), "utf8");
		const notice = readFileSync(join(packageRoot, "NOTICE"), "utf8");
		const parityLedger = readFileSync(
			join(packageRoot, "CODEX_PARITY_LEDGER.md"),
			"utf8",
		);
		const repoFiles = walk(repoRoot).map((file) => relative(repoRoot, file));

		expect(rootReadme).toContain("unofficial TypeScript port");
		expect(rootReadme).toContain("not affiliated with");
		expect(packageReadme).toContain("not affiliated with");
		expect(notice).toContain("OpenAI Codex");
		expect(notice).toContain("T3 Tools");
		expect(parityLedger).toContain("modified TypeScript ports");
		expect(repoFiles.some((file) => file.startsWith(".reference/"))).toBe(false);
		expect(repoFiles.some((file) => file.endsWith(".DS_Store"))).toBe(false);
	});

	it("emits built files for every public export when dist is present", () => {
		const distRoot = join(packageRoot, "dist");
		if (!existsSync(distRoot)) {
			return;
		}
		const packageJson = JSON.parse(
			readFileSync(join(packageRoot, "package.json"), "utf8"),
		) as {
			exports: Record<string, string | { import: string; types: string }>;
		};
		for (const entry of Object.values(packageJson.exports)) {
			if (typeof entry === "string") {
				expect(existsSync(join(packageRoot, entry))).toBe(true);
				continue;
			}
			expect(existsSync(join(packageRoot, entry.import))).toBe(true);
			expect(existsSync(join(packageRoot, entry.types))).toBe(true);
		}
	});
});

function readSourceFiles(directory: string): Array<{
	contents: string;
	relativePath: string;
}> {
	return walk(directory)
		.filter((file) => /\.(ts|tsx)$/.test(file))
		.map((file) => ({
			contents: readFileSync(file, "utf8"),
			relativePath: relative(directory, file),
		}));
}

function walk(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const filePath = join(directory, entry);
		const stat = statSync(filePath);
		if (stat.isDirectory()) {
			if (entry === "node_modules" || entry === ".git") {
				return [];
			}
			return walk(filePath);
		}
		return [filePath];
	});
}
