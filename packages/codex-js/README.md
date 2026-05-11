# @jrkropp/codex-js

Unofficial TypeScript Codex runtime and React UI kit for building
Codex-backed web apps.

This project is not affiliated with, endorsed by, or sponsored by OpenAI.

## Install

```bash
pnpm add @jrkropp/codex-js
```

React is only required when you import the root UI package or
`@jrkropp/codex-js/react`:

```bash
pnpm add react react-dom
```

The package is ESM-only and targets modern runtimes with `fetch`, `WebSocket`,
and `crypto.randomUUID`.

## Import Surfaces

Stable public imports:

```ts
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { createCodexAppServerRuntime } from "@jrkropp/codex-js/server";
import { CodexChat } from "@jrkropp/codex-js/react";
import "@jrkropp/codex-js/styles.css";
```

Supported subpaths:

- `@jrkropp/codex-js`: plug-and-play React chat exports.
- `@jrkropp/codex-js/client`: browser app-server WebSocket client.
- `@jrkropp/codex-js/server`: server/runtime primitives for host adapters.
- `@jrkropp/codex-js/react`: React chat components, hooks, and render helpers.
- `@jrkropp/codex-js/shadcn`: optional shadcn layout primitives.
- `@jrkropp/codex-js/testing`: test stores and package test helpers.
- `@jrkropp/codex-js/styles.css`: Tailwind source hint for package classes.

Low-level mirror imports are available under `@jrkropp/codex-js/unstable/*`.
They mirror upstream Codex and T3 source boundaries and may change in any minor
release before 1.0.

## Browser Client

The browser connects to your host app-server over a WebSocket URL that your app
owns. A common pattern is to mint a short-lived ticket first, then open the
socket with that ticket:

```ts
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";

export const appServer = createCodexAppServerClient({
	url: async () => {
		const { ticket } = await fetch("/api/codex/app-server/ticket", {
			method: "POST",
		}).then((response) => response.json());
		const url = new URL("/api/codex/app-server", window.location.origin);
		url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
		url.searchParams.set("ticket", ticket);
		return url.toString();
	},
});
```

## React Chat

Import package styles from your app CSS or entrypoint, then render `CodexChat`
with a configured app-server client:

```tsx
import { CodexChat } from "@jrkropp/codex-js/react";
import "@jrkropp/codex-js/styles.css";
import { appServer } from "./app-server";

export function Chat({ threadId }: { threadId: string }) {
	return <CodexChat appServer={appServer} threadId={threadId} />;
}
```

The default chat shell owns connection lifecycle, thread hydration, live
protocol events, optimistic user messages, pending server requests, model and
reasoning controls, and composer state.

## Server Runtime

Host applications own credentials, routes, storage, tools, and event delivery.
`createCodexAppServerRuntime` provides the Codex-shaped request handlers that
your WebSocket route can call per connection.

```ts
import {
	createCodexAppServerRuntime,
	createModelClient,
	InMemoryThreadStore,
	ThreadEventPersistenceMode,
	ThreadMemoryMode,
	type AppServerEvent,
} from "@jrkropp/codex-js/server";

const store = new InMemoryThreadStore();

export const runtime = createCodexAppServerRuntime({
	store,
	createModelClient({ context, threadId }) {
		return createModelClient({
			apiKey: context.apiKey,
			installationId: "my-app",
			sessionId: String(threadId),
			threadId,
		});
	},
	sendOutgoingMessage(event: AppServerEvent) {
		// Deliver generated server notifications and server requests to your socket.
		void event;
	},
	buildCreateThreadParams({ params, threadId }) {
		return {
			base_instructions: {
				text: params.baseInstructions ?? "You are Codex inside my app.",
			},
			dynamic_tools: [],
			event_persistence_mode: ThreadEventPersistenceMode.Limited,
			metadata: {
				cwd: params.cwd ?? "/workspace",
				memory_mode: ThreadMemoryMode.Disabled,
				model: params.model ?? "gpt-5-mini",
				model_provider: params.modelProvider ?? "openai",
			},
			source: "appServer",
			thread_id: threadId,
			thread_source: null,
		};
	},
});
```

Create one `CodexAppServerMessageProcessor` per browser WebSocket connection.
Do not reuse a processor across reconnects because `initialize` is connection
state.

## Runnable Examples

From the repository root:

```bash
pnpm install
pnpm build
pnpm dev:minimal
```

Then open `http://localhost:1466`. The minimal example prompts for an OpenAI API
key, stores it in `sessionStorage`, and sends it only to the local Vite
app-server endpoint.

Additional examples:

```bash
pnpm dev:vite-react
pnpm dev:cloudflare-example
```

## Architecture

The project has three ownership boundaries:

- Codex owns runtime truth: protocol, thread lifecycle, storage contracts, model
  transport, and app-server request processing.
- T3-derived UI owns interaction quality: composer, timeline, model picker,
  image previews, and chat affordances.
- The consuming app owns product meaning: credentials, routes, tools, prompts,
  persistence, deployment, and branded layout.

Package-owned source wraps those mirrors into stable public surfaces:

| Segment | Purpose | Source of Truth |
| --- | --- | --- |
| `src/runtime` | Store, app-server, transport, and thread lifecycle contracts. | Package-owned |
| `src/components` | Stable React component surface built from T3-derived primitives. | Package-owned |
| `src/hooks` | Stable hooks for binding runtime state to UI. | Package-owned |
| `src/shadcn` | Optional package-owned shadcn primitives. | Package-owned |
| `src/upstream/codex-rs` | Codex runtime mirror. | `external/codex/codex-rs` |
| `src/upstream/t3code` | T3 UI mirror. | `external/t3code` |

Keep runtime code inside `packages/codex-js/src`. Local upstream source trees
belong under the gitignored `external/` directory and should be used only for
comparison, mirror generation, and parity work.

## Releases

This repo uses Changesets. Add a changeset for user-visible changes:

```bash
pnpm changeset
```

CI validates typecheck, build, tests, `publint`, npm pack contents, and example
builds before release.

## License And Attribution

`codex-js` is licensed under Apache-2.0. Portions are modified TypeScript ports
of OpenAI Codex, which is also Apache-2.0. T3-derived UI code is used under the
T3 Tools MIT license. See `LICENSE` and `NOTICE`.
