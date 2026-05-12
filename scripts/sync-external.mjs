import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const externalRoot = join(repoRoot, "external");
const excludedNames = new Set([
	".DS_Store",
	".git",
	".hg",
	".jj",
	".svn",
	"coverage",
	"dist",
	"node_modules",
	"target",
]);

const args = parseArgs(process.argv.slice(2));

if (args.help || (!args.codex && !args.t3)) {
	printUsage(args.help ? 0 : 1);
}

mkdirSync(externalRoot, { recursive: true });

if (args.codex) {
	syncReference({
		name: "codex",
		source: args.codex,
		target: join(externalRoot, "codex"),
		validate: (path) => existsSync(join(path, "codex-rs")),
		expectation: "a repo root containing codex-rs/",
	});
}

if (args.t3) {
	syncReference({
		name: "t3code",
		source: args.t3,
		target: join(externalRoot, "t3code"),
		validate: (path) => existsSync(join(path, "apps/web")),
		expectation: "a repo root containing apps/web/",
	});
}

function syncReference({ name, source, target, validate, expectation }) {
	const resolvedSource = normalizePath(source);
	if (!existsSync(resolvedSource)) {
		fail(`Missing ${name} source: ${resolvedSource}`);
	}
	if (!validate(resolvedSource)) {
		fail(
			`Invalid ${name} source: expected ${expectation}, got ${resolvedSource}`,
		);
	}

	if (existsSync(target)) {
		rmSync(target, { force: true, recursive: true });
	}

	cpSync(resolvedSource, target, {
		filter: (sourcePath) => !excludedNames.has(basename(sourcePath)),
		preserveTimestamps: true,
		recursive: true,
	});
	process.stdout.write(
		`synced ${name}: ${relativeToRepo(target)} <- ${displayPath(resolvedSource)}\n`,
	);
}

function parseArgs(argv) {
	const result = {
		codex: "",
		t3: "",
		help: false,
	};
	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		switch (token) {
			case "--codex":
				result.codex = argv[index + 1] ?? "";
				index += 1;
				break;
			case "--t3":
				result.t3 = argv[index + 1] ?? "";
				index += 1;
				break;
			case "--help":
			case "-h":
				result.help = true;
				break;
			default:
				fail(`Unknown argument: ${token}`);
		}
	}
	return result;
}

function normalizePath(input) {
	if (!input) {
		fail("Missing path after flag.");
	}
	if (input.startsWith("~")) {
		const home = process.env.HOME;
		if (!home) {
			fail("Cannot expand ~ because HOME is not set.");
		}
		return resolve(home, input.slice(2));
	}
	if (isAbsolute(input)) {
		return resolve(input);
	}
	return resolve(process.cwd(), input);
}

function relativeToRepo(path) {
	return path.startsWith(`${repoRoot}/`)
		? path.slice(repoRoot.length + 1)
		: path;
}

function displayPath(path) {
	return basename(path) === path ? path : relativeToRepo(path);
}

function printUsage(code) {
	process.stdout.write(`Usage:
  pnpm external:sync --codex /absolute/path/to/codex --t3 /absolute/path/to/t3-chat

Options:
  --codex <path>   Sync a local Codex source tree into external/codex
  --t3 <path>      Sync a local T3 source tree into external/t3code
  --help           Show this help
`);
	process.exit(code);
}

function fail(message) {
	process.stderr.write(`${message}\n`);
	process.exit(1);
}
