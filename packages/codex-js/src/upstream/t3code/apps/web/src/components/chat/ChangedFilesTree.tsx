import {
	ChevronRightIcon,
	FileIcon,
	FolderClosedIcon,
	FolderIcon,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

import {
	buildChangedFilesTree,
	hasNonZeroChangedFileStat,
	summarizeChangedFileStats,
	type TimelineChangedFile,
	type TimelineChangedFileTreeNode,
} from "./ChangedFilesTree.logic";

const EMPTY_DIRECTORY_OVERRIDES: Record<string, boolean> = {};

export const AssistantChangedFilesSection = memo(
	function AssistantChangedFilesSection({
		files,
		turnId,
	}: {
		files: readonly TimelineChangedFile[];
		turnId: string | null;
	}) {
		const [allDirectoriesExpanded, setAllDirectoriesExpanded] = useState(true);
		const summaryStat = useMemo(() => summarizeChangedFileStats(files), [files]);

		if (files.length === 0) {
			return null;
		}

		return (
			<div
				className="mt-2 rounded-lg border border-border/80 bg-card/45 p-2.5"
				data-assistant-changed-files="true"
				data-turn-id={turnId ?? undefined}
			>
				<div className="sticky top-2 z-10 mb-1.5 flex items-center justify-between gap-2 bg-background before:absolute before:inset-x-0 before:-top-2 before:h-2 before:bg-background before:content-['']">
					<p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground/65">
						<span>Changed files ({files.length})</span>
						{hasNonZeroChangedFileStat(summaryStat) ? (
							<>
								<span className="mx-1" aria-hidden="true">
									&middot;
								</span>
								<DiffStatLabel
									additions={summaryStat.additions}
									deletions={summaryStat.deletions}
								/>
							</>
						) : null}
					</p>
					<Button
						type="button"
						size="xs"
						variant="outline"
						data-scroll-anchor-ignore
						onClick={() => setAllDirectoriesExpanded((current) => !current)}
					>
						{allDirectoriesExpanded ? "Collapse all" : "Expand all"}
					</Button>
				</div>
				<ChangedFilesTree
					key={`changed-files-tree:${turnId ?? "none"}:${files.length}`}
					allDirectoriesExpanded={allDirectoriesExpanded}
					files={files}
				/>
			</div>
		);
	},
);

const ChangedFilesTree = memo(function ChangedFilesTree({
	allDirectoriesExpanded,
	files,
}: {
	allDirectoriesExpanded: boolean;
	files: readonly TimelineChangedFile[];
}) {
	const treeNodes = useMemo(() => buildChangedFilesTree(files), [files]);
	const directoryPathsKey = useMemo(
		() => collectDirectoryPaths(treeNodes).join("\u0000"),
		[treeNodes],
	);
	const expansionStateKey = `${allDirectoriesExpanded ? "expanded" : "collapsed"}\u0000${directoryPathsKey}`;
	const [directoryExpansionState, setDirectoryExpansionState] = useState<{
		key: string;
		overrides: Record<string, boolean>;
	}>(() => ({
		key: expansionStateKey,
		overrides: {},
	}));
	const expandedDirectories =
		directoryExpansionState.key === expansionStateKey
			? directoryExpansionState.overrides
			: EMPTY_DIRECTORY_OVERRIDES;

	const toggleDirectory = useCallback(
		(path: string) => {
			setDirectoryExpansionState((current) => {
				const nextOverrides =
					current.key === expansionStateKey ? current.overrides : {};
				return {
					key: expansionStateKey,
					overrides: {
						...nextOverrides,
						[path]: !(nextOverrides[path] ?? allDirectoriesExpanded),
					},
				};
			});
		},
		[allDirectoriesExpanded, expansionStateKey],
	);

	return (
		<div className="space-y-0.5">
			{treeNodes.map((node) => (
				<ChangedFilesTreeNode
					key={`${node.kind}:${node.path}`}
					allDirectoriesExpanded={allDirectoriesExpanded}
					depth={0}
					expandedDirectories={expandedDirectories}
					node={node}
					onToggleDirectory={toggleDirectory}
				/>
			))}
		</div>
	);
});

const ChangedFilesTreeNode = memo(function ChangedFilesTreeNode({
	allDirectoriesExpanded,
	depth,
	expandedDirectories,
	node,
	onToggleDirectory,
}: {
	allDirectoriesExpanded: boolean;
	depth: number;
	expandedDirectories: Record<string, boolean>;
	node: TimelineChangedFileTreeNode;
	onToggleDirectory: (path: string) => void;
}) {
	const leftPadding = 8 + depth * 14;
	if (node.kind === "directory") {
		const isExpanded = expandedDirectories[node.path] ?? allDirectoriesExpanded;
		return (
			<div>
				<button
					type="button"
					data-scroll-anchor-ignore
					className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/80"
					style={{ paddingLeft: `${leftPadding}px` }}
					onClick={() => onToggleDirectory(node.path)}
				>
					<ChevronRightIcon
						aria-hidden="true"
						className={cn(
							"size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
							isExpanded ? "rotate-90" : null,
						)}
					/>
					{isExpanded ? (
						<FolderIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
					) : (
						<FolderClosedIcon className="size-3.5 shrink-0 text-muted-foreground/75" />
					)}
					<span className="truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground/90">
						{node.name}
					</span>
					{hasNonZeroChangedFileStat(node.stat) ? (
						<span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
							<DiffStatLabel
								additions={node.stat.additions}
								deletions={node.stat.deletions}
							/>
						</span>
					) : null}
				</button>
				{isExpanded ? (
					<div className="space-y-0.5">
						{node.children.map((child) => (
							<ChangedFilesTreeNode
								key={`${child.kind}:${child.path}`}
								allDirectoriesExpanded={allDirectoriesExpanded}
								depth={depth + 1}
								expandedDirectories={expandedDirectories}
								node={child}
								onToggleDirectory={onToggleDirectory}
							/>
						))}
					</div>
				) : null}
			</div>
		);
	}

	return (
		<div
			className="group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:bg-background/80"
			data-changed-file-path={node.path}
			style={{ paddingLeft: `${leftPadding}px` }}
			title={node.path}
		>
			<span aria-hidden="true" className="size-3.5 shrink-0" />
			<FileIcon className="size-3.5 shrink-0 text-muted-foreground/70" />
			<span className="truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground/90">
				{node.name}
			</span>
			{hasNonZeroChangedFileStat(node.stat) ? (
				<span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
					<DiffStatLabel
						additions={node.stat.additions}
						deletions={node.stat.deletions}
					/>
				</span>
			) : null}
		</div>
	);
});

function DiffStatLabel({
	additions,
	deletions,
}: {
	additions: number;
	deletions: number;
}) {
	return (
		<>
			<span className="text-success">+{additions}</span>
			<span className="mx-0.5 text-muted-foreground/70">/</span>
			<span className="text-destructive">-{deletions}</span>
		</>
	);
}

function collectDirectoryPaths(
	nodes: readonly TimelineChangedFileTreeNode[],
): string[] {
	const paths: string[] = [];
	for (const node of nodes) {
		if (node.kind !== "directory") {
			continue;
		}
		paths.push(node.path);
		paths.push(...collectDirectoryPaths(node.children));
	}
	return paths;
}
