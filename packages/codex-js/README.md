# @jrkropp/codex-js

Core TypeScript runtime, browser client, server adapters, and test utilities for building Codex-backed apps.

## Install

```sh
pnpm add @jrkropp/codex-js
```

Requirements:

- Node.js 20 or newer.
- ESM projects only. This package does not ship CommonJS.
- React is not a dependency of this package. Install `@jrkropp/codex-js-react` only when you need the packaged UI.

## Stable Imports

```ts
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { createCodexAppServerRuntime } from "@jrkropp/codex-js/server";
import { InMemoryThreadStore } from "@jrkropp/codex-js/testing";
```

The published core package exposes only:

- `@jrkropp/codex-js`
- `@jrkropp/codex-js/client`
- `@jrkropp/codex-js/server`
- `@jrkropp/codex-js/testing`

There are no public upstream mirror or unstable import paths.

## Browser Client

```ts
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";

const appServer = createCodexAppServerClient({
	url: () => "ws://localhost:1466/api/codex/app-server",
});

await appServer.requestTyped("thread/start", {
	threadId: "00000000-0000-4000-8000-000000000001",
});
```

## Server Runtime

```ts
import {
	CodexAppServerMessageProcessor,
	createCodexAppServerRuntime,
} from "@jrkropp/codex-js/server";
import { InMemoryThreadStore } from "@jrkropp/codex-js/testing";

const runtime = createCodexAppServerRuntime({
	threadStore: new InMemoryThreadStore(),
});

const processor = new CodexAppServerMessageProcessor({
	runtime,
	send: (message) => {
		// Write the serialized app-server event to your WebSocket.
		console.log(message);
	},
});
```

Create one message processor per WebSocket connection. The package does not own your HTTP server, credential handling, persistence backend, or product-specific tools.

## React UI

The UI package is separate:

```sh
pnpm add @jrkropp/codex-js @jrkropp/codex-js-react react react-dom
```

```tsx
import { CodexChat } from "@jrkropp/codex-js-react";
import "@jrkropp/codex-js-react/styles.css";
```

## Examples

From the repository root:

```sh
pnpm dev:minimal
pnpm dev:vite-react
pnpm dev:cloudflare-example
```

The examples use local source aliases during development and packed-package tests verify the npm tarballs.

## Architecture

`@jrkropp/codex-js` is the non-React package. It owns the transport protocol, app-server client, server runtime helpers, stores, serializers, and testing primitives. UI components, shadcn exports, Tailwind output, and React-only dependencies live in `@jrkropp/codex-js-react`.
