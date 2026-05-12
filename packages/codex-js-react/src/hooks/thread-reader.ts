import type {
	CodexAppServer,
	ThreadId,
	ThreadStore,
} from "@jrkropp/codex-js/client";

export type ThreadReader = Pick<ThreadStore, "loadHistory" | "readThread">;

export type { CodexAppServer, ThreadId };
