# @jrkropp/codex-js

Core TypeScript SDK for building Codex-backed applications. It includes the browser app-server client, platform-neutral server helpers, Codex-aligned runtime contracts, stores, model transport, and test utilities.

## Install

```sh
npm install @jrkropp/codex-js
```

Requirements:

- Node.js 20 or newer.
- ESM only. CommonJS output is not shipped.
- React is not a dependency. Install `@jrkropp/codex-js-react` only when you need packaged UI components.

## Public Imports

```ts
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { createCodexAppServer } from "@jrkropp/codex-js/server";
import { InMemoryThreadStore } from "@jrkropp/codex-js/testing";
```

The core package exposes only:

- `@jrkropp/codex-js`
- `@jrkropp/codex-js/client`
- `@jrkropp/codex-js/server`
- `@jrkropp/codex-js/testing`

There are no public mirror or unstable imports.

## Server Quick Start

```ts
import {
	createCodexAppServer,
	createModelClient,
	defineDynamicTool,
	dynamicToolResponse,
} from "@jrkropp/codex-js/server";
import { InMemoryThreadStore } from "@jrkropp/codex-js/testing";

const lookupStatus = defineDynamicTool({
	name: "lookup_status",
	description: "Look up the current deployment status.",
	inputSchema: {
		type: "object",
		properties: { name: { type: "string" } },
		required: ["name"],
		additionalProperties: false,
	},
	async execute(args) {
		return dynamicToolResponse.text(`${args.name} is healthy.`);
	},
});

const appServer = createCodexAppServer({
	threadStore: new InMemoryThreadStore(),
	dynamicTools: [lookupStatus],
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

Create one app-server connection per WebSocket:

```ts
const connection = appServer.createConnection({
	send(message) {
		webSocket.send(message);
	},
});

webSocket.addEventListener("message", (event) => {
	void connection.accept(event.data);
});

webSocket.addEventListener("close", () => {
	void connection.close();
});
```

`createCodexAppServerRuntime` is still exported for advanced hosts that need to own message processing directly, but most applications should start with `createCodexAppServer`.

## Dynamic Tools

Use `defineDynamicTool` for server-executed tools. Use a namespace when a tool is deferred and loaded through Codex tool search.

```ts
const lookupInvoice = defineDynamicTool({
	namespace: "billing",
	name: "lookup_invoice",
	description: "Look up an invoice by id.",
	deferLoading: true,
	inputSchema: {
		type: "object",
		properties: { invoiceId: { type: "string" } },
		required: ["invoiceId"],
		additionalProperties: false,
	},
	async execute(args) {
		return dynamicToolResponse.text(`Invoice ${args.invoiceId} is paid.`);
	},
});
```

Tools with `execute` are resolved by the server. Tools without `execute` are surfaced as app-server requests so the client can resolve them.

## Browser Client

```ts
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";

const appServer = createCodexAppServerClient({
	url: async () => {
		const session = await fetch("/api/codex/session", { method: "POST" });
		const { webSocketUrl } = await session.json();
		return webSocketUrl;
	},
});
```

The browser never needs an OpenAI API key. Host applications should issue a short-lived app-server WebSocket URL from their backend.

## Cloudflare

The repository includes a deployable Cloudflare Worker + Durable Object + Vite React example:

```sh
pnpm dev:node-local
pnpm dev:cloudflare-example
pnpm --filter @jrkropp/codex-js-cloudflare-example deploy:dry-run
```

Use `examples/node-local` for the smallest local Node/Vite integration. Use `examples/cloudflare` for a deployable Worker + Durable Object integration with one-time WebSocket tickets, Durable Object SQLite storage, hibernating WebSockets, server-executed dynamic tools, and a deferred namespaced tool.
