import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = process.argv[2];

if (!root) {
	throw new Error("Usage: node scripts/fix-dts-extensions.mjs <dist-dir>");
}

for (const file of walk(resolve(root)).filter((path) =>
	path.endsWith(".d.ts"),
)) {
	const source = readFileSync(file, "utf8");
	const updated = source.replace(
		/(from\s+["']|import\s*\(\s*["'])(\.{1,2}(?:\/[^"']*)?)(["'])/g,
		(match, prefix, specifier, suffix) => {
			if (hasExtension(specifier)) {
				return match;
			}
			const resolved = resolveDeclarationSpecifier(file, specifier);
			return resolved ? `${prefix}${resolved}${suffix}` : match;
		},
	);
	if (updated !== source) {
		writeFileSync(file, updated);
	}
}

function walk(directory) {
	return readdirSync(directory).flatMap((entry) => {
		const path = join(directory, entry);
		if (statSync(path).isDirectory()) {
			return walk(path);
		}
		return [path];
	});
}

function hasExtension(specifier) {
	return /\.(?:[cm]?js|[cm]?ts|json|css)$/.test(specifier);
}

function resolveDeclarationSpecifier(file, specifier) {
	const absolute = resolve(dirname(file), specifier);
	if (existsSync(`${absolute}.d.ts`)) {
		return `${specifier}.js`;
	}
	if (existsSync(join(absolute, "index.d.ts"))) {
		return `${specifier}/index.js`;
	}
	return null;
}
