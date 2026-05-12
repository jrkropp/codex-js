import type { CoreTurnItem as TurnItem } from "@jrkropp/codex-js/client";

type FileChangeTurnItem = Extract<TurnItem, { type: "FileChange" }>;
type FileChange = FileChangeTurnItem["changes"][string];

export type TimelineChangedFile = {
	additions: number;
	changeType: FileChange["type"];
	deletions: number;
	path: string;
};

export type TimelineChangedFileStat = {
	additions: number;
	deletions: number;
};

export type TimelineChangedFileTreeNode =
	| {
			children: TimelineChangedFileTreeNode[];
			kind: "directory";
			name: string;
			path: string;
			stat: TimelineChangedFileStat;
	  }
	| {
			file: TimelineChangedFile;
			kind: "file";
			name: string;
			path: string;
			stat: TimelineChangedFileStat;
	  };

type MutableDirectoryNode = {
	directories: Map<string, MutableDirectoryNode>;
	files: Extract<TimelineChangedFileTreeNode, { kind: "file" }>[];
	name: string;
	path: string;
	stat: TimelineChangedFileStat;
};

const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = {
	numeric: true,
	sensitivity: "base",
};

export function changedFilesForFileChangeTurnItem(
	item: FileChangeTurnItem,
): TimelineChangedFile[] {
	return Object.entries(item.changes).map(([path, change]) => ({
		path,
		changeType: change.type,
		...statForFileChange(change),
	}));
}

export function summarizeChangedFileStats(
	files: readonly TimelineChangedFile[],
): TimelineChangedFileStat {
	return files.reduce<TimelineChangedFileStat>(
		(total, file) => ({
			additions: total.additions + file.additions,
			deletions: total.deletions + file.deletions,
		}),
		{ additions: 0, deletions: 0 },
	);
}

export function hasNonZeroChangedFileStat(
	stat: TimelineChangedFileStat,
): boolean {
	return stat.additions > 0 || stat.deletions > 0;
}

export function buildChangedFilesTree(
	files: readonly TimelineChangedFile[],
): TimelineChangedFileTreeNode[] {
	const root: MutableDirectoryNode = {
		name: "",
		path: "",
		stat: { additions: 0, deletions: 0 },
		directories: new Map(),
		files: [],
	};

	for (const file of files) {
		const segments = normalizePathSegments(file.path);
		if (segments.length === 0) {
			continue;
		}
		const fileName = segments.at(-1);
		if (!fileName) {
			continue;
		}

		let currentDirectory = root;
		const ancestors: MutableDirectoryNode[] = [root];
		for (const segment of segments.slice(0, -1)) {
			const nextPath = currentDirectory.path
				? `${currentDirectory.path}/${segment}`
				: segment;
			const existing = currentDirectory.directories.get(segment);
			if (existing) {
				currentDirectory = existing;
			} else {
				const created: MutableDirectoryNode = {
					name: segment,
					path: nextPath,
					stat: { additions: 0, deletions: 0 },
					directories: new Map(),
					files: [],
				};
				currentDirectory.directories.set(segment, created);
				currentDirectory = created;
			}
			ancestors.push(currentDirectory);
		}

		const normalizedPath = segments.join("/");
		currentDirectory.files.push({
			kind: "file",
			name: fileName,
			path: normalizedPath,
			stat: {
				additions: file.additions,
				deletions: file.deletions,
			},
			file: {
				...file,
				path: normalizedPath,
			},
		});

		for (const ancestor of ancestors) {
			ancestor.stat.additions += file.additions;
			ancestor.stat.deletions += file.deletions;
		}
	}

	return toTreeNodes(root);
}

function normalizePathSegments(path: string): string[] {
	return path
		.replaceAll("\\", "/")
		.split("/")
		.filter((segment) => segment.length > 0);
}

function compareByName(a: { name: string }, b: { name: string }): number {
	return a.name.localeCompare(b.name, undefined, SORT_LOCALE_OPTIONS);
}

function toTreeNodes(
	directory: MutableDirectoryNode,
): TimelineChangedFileTreeNode[] {
	const directories = Array.from(directory.directories.values())
		.sort(compareByName)
		.map<TimelineChangedFileTreeNode>((subdirectory) =>
			compactDirectoryNode({
				kind: "directory",
				name: subdirectory.name,
				path: subdirectory.path,
				stat: {
					additions: subdirectory.stat.additions,
					deletions: subdirectory.stat.deletions,
				},
				children: toTreeNodes(subdirectory),
			}),
		);
	const files = [...directory.files].sort(compareByName);
	return [...directories, ...files];
}

function compactDirectoryNode(
	node: Extract<TimelineChangedFileTreeNode, { kind: "directory" }>,
): Extract<TimelineChangedFileTreeNode, { kind: "directory" }> {
	let compactedNode = {
		...node,
		children: node.children.map((child) =>
			child.kind === "directory" ? compactDirectoryNode(child) : child,
		),
	};

	while (
		compactedNode.children.length === 1 &&
		compactedNode.children[0]?.kind === "directory"
	) {
		const onlyChild = compactedNode.children[0];
		compactedNode = {
			kind: "directory",
			name: `${compactedNode.name}/${onlyChild.name}`,
			path: onlyChild.path,
			stat: onlyChild.stat,
			children: onlyChild.children,
		};
	}

	return compactedNode;
}

function statForFileChange(change: FileChange): TimelineChangedFileStat {
	switch (change.type) {
		case "add":
			return { additions: countContentLines(change.content), deletions: 0 };
		case "delete":
			return { additions: 0, deletions: countContentLines(change.content) };
		case "update":
			return statForUnifiedDiff(change.unified_diff);
	}
}

function countContentLines(content: string): number {
	if (content.length === 0) {
		return 0;
	}
	return content.replace(/\r?\n$/, "").split(/\r?\n/).length;
}

function statForUnifiedDiff(diff: string): TimelineChangedFileStat {
	let additions = 0;
	let deletions = 0;
	for (const line of diff.split(/\r?\n/)) {
		if (line.startsWith("+++") || line.startsWith("---")) {
			continue;
		}
		if (line.startsWith("+")) {
			additions += 1;
		} else if (line.startsWith("-")) {
			deletions += 1;
		}
	}
	return { additions, deletions };
}
