import type { CodexAppServer } from "../upstream/codex-rs/app-server-client/src/session";
import type { ThreadId } from "../upstream/codex-rs/core/src/ids";
import type { ThreadStore } from "../upstream/codex-rs/core/src/thread-store/store";

export type ThreadReader = Pick<ThreadStore, "loadHistory" | "readThread">;

export type { CodexAppServer, ThreadId };
