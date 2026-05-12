# codex-js

Unofficial TypeScript packages for building Codex-backed web applications.

This workspace publishes:

- `@jrkropp/codex-js`: browser client, server app-server helpers, runtime contracts, stores, model transport, and testing utilities.
- `@jrkropp/codex-js-react`: React chat UI, hooks, shadcn-compatible primitives, and generated CSS.

This project is not affiliated with, endorsed by, or sponsored by OpenAI.

## Install

```sh
npm install @jrkropp/codex-js
```

For the packaged React UI:

```sh
npm install @jrkropp/codex-js @jrkropp/codex-js-react react react-dom
```

```tsx
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { CodexChat } from "@jrkropp/codex-js-react";
import "@jrkropp/codex-js-react/styles.css";

const appServer = createCodexAppServerClient({
	url: async () => {
		const response = await fetch("/api/codex/session", { method: "POST" });
		const { webSocketUrl } = await response.json();
		return webSocketUrl;
	},
});

export function Chat({ threadId }: { threadId: string }) {
	return <CodexChat appServer={appServer} threadId={threadId} />;
}
```

## Public Surfaces

Core package:

- `@jrkropp/codex-js`
- `@jrkropp/codex-js/client`
- `@jrkropp/codex-js/server`
- `@jrkropp/codex-js/testing`

React package:

- `@jrkropp/codex-js-react`
- `@jrkropp/codex-js-react/shadcn`
- `@jrkropp/codex-js-react/styles.css`

There are no public upstream mirror or unstable imports.

## Server Shape

```ts
import {
	createCodexAppServer,
	createModelClient,
	defineDynamicTool,
	dynamicToolResponse,
} from "@jrkropp/codex-js/server";
import { InMemoryThreadStore } from "@jrkropp/codex-js/testing";

const lookupDeployment = defineDynamicTool({
	name: "lookup_deployment",
	description: "Look up deployment status.",
	inputSchema: { type: "object", properties: {}, additionalProperties: false },
	async execute() {
		return dynamicToolResponse.text("Deployment is healthy.");
	},
});

const appServer = createCodexAppServer({
	threadStore: new InMemoryThreadStore(),
	dynamicTools: [lookupDeployment],
	defaults: {
		cwd: "/workspace",
		model: "gpt-5-mini",
		modelProvider: "openai",
	},
	createModelClient({ session, threadId }) {
		return createModelClient({
			apiKey: process.env.OPENAI_API_KEY!,
			installationId: "my-app",
			sessionId: session.id,
			threadId,
		});
	},
});
```

Host applications own HTTP routing, authentication, persistence, credentials, and platform bindings. `codex-js` owns the Codex app-server protocol, connection processing, runtime contracts, and dynamic tool mapping.

## Examples

```sh
pnpm install
pnpm dev:node-local
pnpm dev:cloudflare-example
```

`examples/node-local` is the smallest full-stack local path: Vite, a Node WebSocket endpoint, `createCodexAppServer`, `createCodexAppServerConnection`, in-memory threads, and example dynamic tools.

`examples/cloudflare` is the deployable production-style path: plain Vite React, Worker API, Durable Object SQLite storage, one-time WebSocket tickets, hibernating Durable Object WebSockets, and server-executed dynamic tools.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:pack
pnpm publint
pnpm pack:dry-run
pnpm build:examples
```

## Releases

This repo uses Changesets. Add a changeset for user-visible changes:

```sh
pnpm changeset
```

Merging the Changesets release PR updates changelogs, publishes to npm, and creates the GitHub release. Releases use npm trusted publishing through GitHub Actions.

## License And Attribution

`codex-js` is licensed under Apache-2.0. Portions are modified TypeScript ports of OpenAI Codex, which is also Apache-2.0. T3-derived UI code is used under the T3 Tools MIT license. See `LICENSE` and `NOTICE`.
