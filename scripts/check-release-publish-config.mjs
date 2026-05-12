import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
const packagesRoot = join(repoRoot, "packages");
const hasNpmToken = Boolean(process.env.NPM_TOKEN);
const trustedPublishing = process.env.NPM_TRUSTED_PUBLISHING === "true";

if (!hasNpmToken && !trustedPublishing) {
	process.stdout.write(
		"npm publishing is disabled; skipping release publish preflight.\n",
	);
	process.exit(0);
}

const packages = readPublishablePackages();
const unpublishedVersions = [];
const missingPackages = [];
const unexpectedErrors = [];

for (const packageJson of packages) {
	const version = npmView(
		`${packageJson.name}@${packageJson.version}`,
		"version",
	);
	if (version.exists) {
		continue;
	}
	if (version.error) {
		unexpectedErrors.push(version.error);
		continue;
	}

	unpublishedVersions.push(packageJson);
	const packageRecord = npmView(packageJson.name, "name");
	if (!packageRecord.exists && !packageRecord.error) {
		missingPackages.push(packageJson);
	}
	if (packageRecord.error) {
		unexpectedErrors.push(packageRecord.error);
	}
}

if (unexpectedErrors.length > 0) {
	fail([
		"npm release preflight could not verify package publication state.",
		"",
		...unexpectedErrors.map((error) => `- ${error}`),
	]);
}

if (trustedPublishing && !hasNpmToken && missingPackages.length > 0) {
	fail([
		"npm release preflight found new package names, but this workflow is configured for trusted publishing without NPM_TOKEN.",
		"",
		"npm trusted publishing can only be configured after a package exists on the registry. Bootstrap new package names with an npm token or a manual first publish, then configure trusted publishing for each package.",
		"",
		"New package names:",
		...missingPackages.map(
			(packageJson) => `- ${packageJson.name}@${packageJson.version}`,
		),
		"",
		"Trusted publisher configuration:",
		"- Repository: jrkropp/codex-js",
		"- Workflow file: release.yml",
		"- Environment: none",
	]);
}

if (unpublishedVersions.length === 0) {
	process.stdout.write(
		"npm release preflight passed: all versions are published.\n",
	);
} else {
	process.stdout.write(
		[
			"npm release preflight passed for publishable versions:",
			...unpublishedVersions.map(
				(packageJson) => `- ${packageJson.name}@${packageJson.version}`,
			),
			"",
		].join("\n"),
	);
}

function readPublishablePackages() {
	return readdirSync(packagesRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => join(packagesRoot, entry.name, "package.json"))
		.filter((path) => existsSync(path))
		.map((path) => JSON.parse(readFileSync(path, "utf8")))
		.filter((packageJson) => packageJson.private !== true)
		.filter((packageJson) => packageJson.name && packageJson.version)
		.sort((a, b) => a.name.localeCompare(b.name));
}

function npmView(specifier, field) {
	const result = spawnSync("npm", ["view", specifier, field, "--json"], {
		cwd: repoRoot,
		encoding: "utf8",
		env: {
			...process.env,
			NPM_CONFIG_LOGLEVEL: "silent",
		},
	});
	const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim();
	if (result.status === 0) {
		return { exists: true };
	}
	if (output.includes("E404") || output.includes("404 Not Found")) {
		return { exists: false };
	}
	return {
		exists: false,
		error: `npm view ${specifier} ${field} failed: ${output || result.status}`,
	};
}

function fail(lines) {
	process.stderr.write(`${lines.join("\n")}\n`);
	process.exit(1);
}
