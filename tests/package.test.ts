import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const packageRoot = join(repoRoot, "packages/codex-js");

describe("codex-js package boundary", () => {
	it("publishes curated stable exports plus explicit unstable mirrors", () => {
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
		expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+(?:[-+].+)?$/);
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
			"./unstable/codex-rs/config": {
				import: "./dist/unstable/codex-rs/config/index.js",
				types: "./dist/unstable/codex-rs/config/index.d.ts",
			},
			"./unstable/codex-rs/core": {
				import: "./dist/unstable/codex-rs/core/index.js",
				types: "./dist/unstable/codex-rs/core/index.d.ts",
			},
			"./unstable/codex-rs/app-server": {
				import: "./dist/unstable/codex-rs/app-server/index.js",
				types: "./dist/unstable/codex-rs/app-server/index.d.ts",
			},
			"./unstable/t3code/apps/web": {
				import: "./dist/unstable/t3code/apps/web/index.js",
				types: "./dist/unstable/t3code/apps/web/index.d.ts",
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

	it("keeps public examples on stable package surfaces only", () => {
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
						specifier.startsWith("@jrkropp/codex-js/t3code") ||
						specifier.startsWith("@jrkropp/codex-js/unstable"),
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

	it("keeps attribution and local upstream references explicit", () => {
		const rootReadme = readFileSync(join(repoRoot, "README.md"), "utf8");
		const packageReadme = readFileSync(join(packageRoot, "README.md"), "utf8");
		const notice = readFileSync(join(packageRoot, "NOTICE"), "utf8");
		const parityLedger = readFileSync(
			join(packageRoot, "CODEX_PARITY_LEDGER.md"),
			"utf8",
		);
		const rootGitignore = readFileSync(join(repoRoot, ".gitignore"), "utf8");

		expect(rootReadme).toContain("unofficial TypeScript port");
		expect(rootReadme).toContain("not affiliated with");
		expect(packageReadme).toContain("not affiliated with");
		expect(notice).toContain("OpenAI Codex");
		expect(notice).toContain("T3 Tools");
		expect(parityLedger).toContain("modified TypeScript ports");
		expect(rootGitignore).toContain("external/*");
		expect(rootGitignore).toContain("!external/README.md");
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

	it("works from a packed tarball in minimal server and Vite React consumers", () => {
		const distRoot = join(packageRoot, "dist");
		if (!existsSync(distRoot)) {
			return;
		}

		const tempRoot = mkdtempSync(join(tmpdir(), "codex-js-packed-"));
		try {
			const packOutput = JSON.parse(
				execFileSync(
					"npm",
					["pack", "--json", "--pack-destination", tempRoot],
					{ cwd: packageRoot, encoding: "utf8" },
				),
			) as Array<{ filename: string }>;
			const tarballPath = join(tempRoot, packOutput[0]?.filename ?? "");
			expect(existsSync(tarballPath)).toBe(true);

			const serverConsumer = join(tempRoot, "server-consumer");
			writeServerConsumer(serverConsumer, tarballPath);
			installConsumer(serverConsumer);
			runConsumerCommand(serverConsumer, "pnpm", [
				"exec",
				"tsc",
				"-p",
				"tsconfig.json",
			]);
			runConsumerCommand(serverConsumer, "node", ["index.mjs"]);
			expectPackedPackageHasNoSource(serverConsumer);

			const reactConsumer = join(tempRoot, "react-consumer");
			writeReactConsumer(reactConsumer, tarballPath);
			installConsumer(reactConsumer);
			runConsumerCommand(reactConsumer, "pnpm", [
				"exec",
				"tsc",
				"-p",
				"tsconfig.json",
			]);
			runConsumerCommand(reactConsumer, "pnpm", ["exec", "vite", "build"]);
			expectPackedPackageHasNoSource(reactConsumer);
		} finally {
			rmSync(tempRoot, { force: true, recursive: true });
		}
	}, 120_000);
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
			if (entry === "node_modules" || entry === ".git" || entry === "external") {
				return [];
			}
			return walk(filePath);
		}
		return [filePath];
	});
}

function installConsumer(directory: string): void {
	execFileSync("pnpm", ["install", "--ignore-scripts"], {
		cwd: directory,
		stdio: "pipe",
	});
}

function runConsumerCommand(
	directory: string,
	command: string,
	args: string[],
): void {
	try {
		execFileSync(command, args, {
			cwd: directory,
			encoding: "utf8",
			stdio: "pipe",
		});
	} catch (error) {
		const details = error as {
			message?: string;
			stderr?: Buffer | string;
			stdout?: Buffer | string;
		};
		throw new Error(
			[
				`Command failed in ${directory}: ${command} ${args.join(" ")}`,
				toText(details.stdout),
				toText(details.stderr),
				details.message ?? "",
			]
				.filter(Boolean)
				.join("\n"),
		);
	}
}

function toText(value: Buffer | string | undefined): string {
	return Buffer.isBuffer(value) ? value.toString("utf8") : (value ?? "");
}

function writeServerConsumer(directory: string, tarballPath: string): void {
	rmSync(directory, { force: true, recursive: true });
	mkdirSync(directory, { recursive: true });
	writeFileSync(
		join(directory, "package.json"),
		JSON.stringify(
			{
				name: "codex-js-packed-server-consumer",
				private: true,
				type: "module",
				dependencies: {
					"@jrkropp/codex-js": `file:${tarballPath}`,
				},
				devDependencies: {
					typescript: "5.8.3",
				},
			},
			null,
			2,
		),
	);
	writeFileSync(
		join(directory, "tsconfig.json"),
		JSON.stringify(
			{
				compilerOptions: {
					module: "NodeNext",
					moduleResolution: "NodeNext",
					noEmit: true,
					strict: true,
					target: "ES2022",
				},
				include: ["index.ts"],
			},
			null,
			2,
		),
	);
	writeFileSync(
		join(directory, "index.ts"),
		[
			'import { InMemoryThreadStore, parseServerTransportPayload, serializeJsonRpcResponse } from "@jrkropp/codex-js/server";',
			'import type { ThreadStore } from "@jrkropp/codex-js/server";',
			"const store: ThreadStore = new InMemoryThreadStore();",
			"parseServerTransportPayload('{}');",
			"serializeJsonRpcResponse(1, { ok: true });",
			"void store;",
		].join("\n"),
	);
	writeFileSync(
		join(directory, "index.mjs"),
		[
			'import { InMemoryThreadStore, serializeJsonRpcResponse } from "@jrkropp/codex-js/server";',
			"const store = new InMemoryThreadStore();",
			"if (typeof serializeJsonRpcResponse(1, {}) !== 'string') throw new Error('bad transport export');",
			"if (!store) throw new Error('bad store export');",
		].join("\n"),
	);
}

function writeReactConsumer(directory: string, tarballPath: string): void {
	rmSync(directory, { force: true, recursive: true });
	const srcRoot = join(directory, "src");
	mkdirSync(srcRoot, { recursive: true });
	writeFileSync(
		join(directory, "package.json"),
		JSON.stringify(
			{
				name: "codex-js-packed-react-consumer",
				private: true,
				type: "module",
				dependencies: {
					"@jrkropp/codex-js": `file:${tarballPath}`,
					react: "19.2.1",
					"react-dom": "19.2.1",
					vite: "^6.4.2",
				},
				devDependencies: {
					"@types/react": "19.2.7",
					"@types/react-dom": "19.2.3",
					typescript: "5.8.3",
				},
			},
			null,
			2,
		),
	);
	writeFileSync(
		join(directory, "index.html"),
		'<div id="root"></div><script type="module" src="/src/main.tsx"></script>',
	);
	writeFileSync(
		join(directory, "tsconfig.json"),
		JSON.stringify(
			{
				compilerOptions: {
					jsx: "react-jsx",
					module: "ESNext",
					moduleResolution: "Bundler",
					noEmit: true,
					strict: true,
					target: "ES2022",
					types: ["vite/client"],
				},
				include: ["src"],
			},
			null,
			2,
		),
	);
	writeFileSync(
		join(srcRoot, "main.tsx"),
		[
			'import { createRoot } from "react-dom/client";',
			'import type { CodexAppServer } from "@jrkropp/codex-js/client";',
			'import { CodexChat } from "@jrkropp/codex-js/react";',
			'import "@jrkropp/codex-js/styles.css";',
			"const appServer: CodexAppServer = {",
			"  async rejectServerRequest() {},",
			"  async request() { throw new Error('not connected'); },",
			"  async requestTyped() { throw new Error('not connected'); },",
			"  async resolveServerRequest() {},",
			"};",
			"createRoot(document.getElementById('root')!).render(",
			"  <CodexChat appServer={appServer} connectOnMount={false} threadId=\"00000000-0000-4000-8000-000000000999\" />",
			");",
		].join("\n"),
	);
}

function expectPackedPackageHasNoSource(directory: string): void {
	const installedPackage = join(directory, "node_modules/@jrkropp/codex-js");
	expect(existsSync(join(installedPackage, "src"))).toBe(false);
	const packageJson = readFileSync(join(installedPackage, "package.json"), "utf8");
	expect(packageJson).not.toContain("./src/");
}
