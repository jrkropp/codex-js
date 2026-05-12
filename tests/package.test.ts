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
import { isAbsolute, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const corePackageRoot = join(repoRoot, "packages/codex-js");
const reactPackageRoot = join(repoRoot, "packages/codex-js-react");

describe("npm package boundaries", () => {
	it("publishes the intended core and React export contracts", () => {
		const corePackageJson = readPackageJson(corePackageRoot);
		const reactPackageJson = readPackageJson(reactPackageRoot);

		expect(corePackageJson.name).toBe("@jrkropp/codex-js");
		expect(corePackageJson.private).toBeUndefined();
		expect(corePackageJson.files).toEqual(packageFiles());
		expect(Object.keys(corePackageJson.exports)).toEqual([
			".",
			"./client",
			"./server",
			"./testing",
		]);
		expect(corePackageJson.exports).toEqual({
			".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
			"./client": {
				import: "./dist/client/index.js",
				types: "./dist/client/index.d.ts",
			},
			"./server": {
				import: "./dist/server/index.js",
				types: "./dist/server/index.d.ts",
			},
			"./testing": {
				import: "./dist/testing/index.js",
				types: "./dist/testing/index.d.ts",
			},
		});
		expect(corePackageJson.dependencies).not.toHaveProperty("react");
		expect(corePackageJson.peerDependencies).toBeUndefined();

		expect(reactPackageJson.name).toBe("@jrkropp/codex-js-react");
		expect(reactPackageJson.private).toBeUndefined();
		expect(reactPackageJson.files).toEqual(packageFiles());
		expect(Object.keys(reactPackageJson.exports)).toEqual([
			".",
			"./shadcn",
			"./styles.css",
		]);
		expect(reactPackageJson.exports).toEqual({
			".": { import: "./dist/index.js", types: "./dist/index.d.ts" },
			"./shadcn": {
				import: "./dist/shadcn/index.js",
				types: "./dist/shadcn/index.d.ts",
			},
			"./styles.css": "./dist/styles.css",
		});
		expect(reactPackageJson.dependencies).toHaveProperty("@jrkropp/codex-js");
		expect(reactPackageJson.peerDependencies).toMatchObject({
			react: expect.any(String),
			"react-dom": expect.any(String),
		});

		for (const packageJson of [corePackageJson, reactPackageJson]) {
			const metadata = JSON.stringify(packageJson);
			expect(metadata).not.toContain("./src/");
			expect(metadata).not.toContain("unstable");
			expect(metadata).not.toContain("codex-rs");
			expect(metadata).not.toContain("t3code");
			expect(metadata).not.toContain("upstream");
		}
	});

	it("keeps examples on public package surfaces only", () => {
		const exampleSources = readSourceFiles(join(repoRoot, "examples"));
		const forbiddenReferences = exampleSources.flatMap((file) =>
			[
				"packages/codex-js/src/components",
				"packages/codex-js/src/hooks",
				"packages/codex-js/src/shadcn",
				"packages/codex-js/src/upstream",
				"@jrkropp/codex-js/react",
				"@jrkropp/codex-js/shadcn",
				"@jrkropp/codex-js/styles.css",
				"@jrkropp/codex-js/unstable",
			]
				.filter((reference) => file.contents.includes(reference))
				.map((reference) => `${file.relativePath}: ${reference}`),
		);
		const publicReferences = exampleSources.flatMap((file) =>
			Array.from(
				file.contents.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/g),
			)
				.map((match) => match[1] ?? "")
				.filter((specifier) => specifier.startsWith("@jrkropp/codex-js"))
				.map((specifier) => `${file.relativePath}: ${specifier}`),
		);

		expect(forbiddenReferences).toEqual([]);
		expect(publicReferences).toEqual(
			expect.arrayContaining([
				expect.stringContaining("@jrkropp/codex-js/client"),
				expect.stringContaining("@jrkropp/codex-js/server"),
				expect.stringContaining("@jrkropp/codex-js-react"),
			]),
		);
	});

	it("keeps package source free of mirror and stub scaffolding", () => {
		const packageSources = [
			...readSourceFiles(join(corePackageRoot, "src")),
			...readSourceFiles(join(reactPackageRoot, "src")),
		];
		const forbiddenReferences = packageSources.flatMap((file) =>
			[
				"codex-rs",
				"t3code",
				"stubbed",
				"not ported yet",
				"src/upstream",
				"internal/chat-ui/apps",
				"apps/web/src",
			]
				.filter((reference) => file.contents.includes(reference))
				.map((reference) => `${file.relativePath}: ${reference}`),
		);

		expect(forbiddenReferences).toEqual([]);
	});

	it("emits built files for every public export when dist is present", () => {
		for (const packageRoot of [corePackageRoot, reactPackageRoot]) {
			const distRoot = join(packageRoot, "dist");
			if (!existsSync(distRoot)) {
				continue;
			}
			const packageJson = readPackageJson(packageRoot);
			for (const entry of Object.values(packageJson.exports)) {
				if (typeof entry === "string") {
					expect(existsSync(join(packageRoot, entry))).toBe(true);
					continue;
				}
				expect(existsSync(join(packageRoot, entry.import))).toBe(true);
				expect(existsSync(join(packageRoot, entry.types))).toBe(true);
			}
		}
	});

	it("works from packed tarballs in server-only and Vite React consumers", () => {
		if (
			!existsSync(join(corePackageRoot, "dist")) ||
			!existsSync(join(reactPackageRoot, "dist"))
		) {
			return;
		}

		const tempRoot = mkdtempSync(join(tmpdir(), "codex-js-packed-"));
		try {
			const corePack = packPackage(corePackageRoot, tempRoot);
			const reactPack = packPackage(reactPackageRoot, tempRoot);

			expectPackFileContract(corePack.files);
			expectPackFileContract(reactPack.files);
			expectBuiltCssIsReal();

			const serverConsumer = join(tempRoot, "server-consumer");
			writeServerConsumer(serverConsumer, corePack.tarballPath);
			installConsumer(serverConsumer);
			runConsumerCommand(serverConsumer, "pnpm", [
				"exec",
				"tsc",
				"-p",
				"tsconfig.json",
			]);
			runConsumerCommand(serverConsumer, "node", ["index.mjs"]);
			expectPackedPackageHasNoSource(serverConsumer, "@jrkropp/codex-js");
			expect(existsSync(join(serverConsumer, "node_modules/react"))).toBe(
				false,
			);
			expect(
				existsSync(
					join(serverConsumer, "node_modules/@jrkropp/codex-js-react"),
				),
			).toBe(false);

			const reactConsumer = join(tempRoot, "react-consumer");
			writeReactConsumer(
				reactConsumer,
				corePack.tarballPath,
				reactPack.tarballPath,
			);
			installConsumer(reactConsumer);
			runConsumerCommand(reactConsumer, "pnpm", [
				"exec",
				"tsc",
				"-p",
				"tsconfig.json",
			]);
			runConsumerCommand(reactConsumer, "pnpm", ["exec", "vite", "build"]);
			expectPackedPackageHasNoSource(reactConsumer, "@jrkropp/codex-js");
			expectPackedPackageHasNoSource(reactConsumer, "@jrkropp/codex-js-react");
		} finally {
			rmSync(tempRoot, { force: true, recursive: true });
		}
	}, 120_000);
});

type PackageJson = {
	dependencies?: Record<string, string>;
	exports: Record<string, string | { import: string; types: string }>;
	files: string[];
	name: string;
	peerDependencies?: Record<string, string>;
	private?: boolean;
	version: string;
};

type PackedPackage = {
	files: Array<{ path: string; size: number }>;
	tarballPath: string;
};

function packageFiles(): string[] {
	return ["dist", "README.md", "CHANGELOG.md", "LICENSE", "NOTICE"];
}

function readPackageJson(packageRoot: string): PackageJson {
	return JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
}

function packPackage(packageRoot: string, destination: string): PackedPackage {
	const packOutput = JSON.parse(
		execFileSync(
			"pnpm",
			["pack", "--json", "--pack-destination", destination],
			{
				cwd: packageRoot,
				encoding: "utf8",
			},
		),
	) as
		| { filename: string; files: Array<{ path: string; size: number }> }
		| Array<{ filename: string; files: Array<{ path: string; size: number }> }>;
	const packed = Array.isArray(packOutput) ? packOutput[0] : packOutput;
	const filename = packed?.filename ?? "";
	const tarballPath = isAbsolute(filename)
		? filename
		: join(destination, filename);
	expect(existsSync(tarballPath)).toBe(true);
	return { files: packed?.files ?? [], tarballPath };
}

function expectPackFileContract(
	files: Array<{ path: string; size: number }>,
): void {
	const paths = files.map((file) => file.path);
	const forbiddenFragments = [
		"unstable",
		"codex-rs",
		"t3code",
		"upstream",
		"stubbed",
		"not ported yet",
		"apps/web",
	];
	for (const path of paths) {
		expect(path).not.toMatch(/(^|\/)chunk-[^/]+/);
		expect(path).not.toMatch(/^dist\/[^/]+-[A-Za-z0-9]{8,}\.d\.[cm]?ts$/);
		for (const fragment of forbiddenFragments) {
			expect(path.toLowerCase()).not.toContain(fragment);
		}
	}
}

function expectBuiltCssIsReal(): void {
	const cssPath = join(reactPackageRoot, "dist/styles.css");
	const css = readFileSync(cssPath, "utf8");
	expect(css.length).toBeGreaterThan(1_000);
	expect(css).toContain("--color-background");
	expect(css).toContain(".bg-background");
}

function readSourceFiles(directory: string): Array<{
	contents: string;
	relativePath: string;
}> {
	return walk(directory)
		.filter((file) => /\.(css|ts|tsx)$/.test(file))
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
			if (
				entry === "node_modules" ||
				entry === ".git" ||
				entry === "external"
			) {
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

function writeServerConsumer(directory: string, coreTarballPath: string): void {
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
					"@jrkropp/codex-js": `file:${coreTarballPath}`,
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
			'import { InMemoryThreadStore, serializeJsonRpcResponse } from "@jrkropp/codex-js/server";',
			'import type { ThreadStore } from "@jrkropp/codex-js/server";',
			"const store: ThreadStore = new InMemoryThreadStore();",
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

function writeReactConsumer(
	directory: string,
	coreTarballPath: string,
	reactTarballPath: string,
): void {
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
					"@jrkropp/codex-js": `file:${coreTarballPath}`,
					"@jrkropp/codex-js-react": `file:${reactTarballPath}`,
					"@vitejs/plugin-react": "^5.1.1",
					react: "19.2.1",
					"react-dom": "19.2.1",
					vite: "^6.4.2",
				},
				devDependencies: {
					"@types/react": "19.2.7",
					"@types/react-dom": "19.2.3",
					typescript: "5.8.3",
				},
				pnpm: {
					overrides: {
						"@jrkropp/codex-js": `file:${coreTarballPath}`,
					},
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
			'import { CodexChat } from "@jrkropp/codex-js-react";',
			'import "@jrkropp/codex-js-react/styles.css";',
			"const appServer: CodexAppServer = {",
			"  async rejectServerRequest() {},",
			"  async request() { throw new Error('not connected'); },",
			"  async requestTyped() { throw new Error('not connected'); },",
			"  async resolveServerRequest() {},",
			"};",
			"createRoot(document.getElementById('root')!).render(",
			'  <CodexChat appServer={appServer} connectOnMount={false} threadId="00000000-0000-4000-8000-000000000999" />',
			");",
		].join("\n"),
	);
}

function expectPackedPackageHasNoSource(
	directory: string,
	packageName: "@jrkropp/codex-js" | "@jrkropp/codex-js-react",
): void {
	const installedPackage = join(directory, "node_modules", packageName);
	expect(existsSync(join(installedPackage, "src"))).toBe(false);
	const packageJson = readFileSync(
		join(installedPackage, "package.json"),
		"utf8",
	);
	expect(packageJson).not.toContain("./src/");
}
