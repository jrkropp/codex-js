# codex-js

`codex-js` is an unofficial TypeScript port of the Codex runtime for building
Codex-backed web apps and interfaces.

It provides a Codex-style app-server client, server/runtime primitives, React
chat components, optional shadcn layout primitives, and examples that show how a
host application supplies credentials, storage, prompts, tools, and routes.

This project is not affiliated with, endorsed by, or sponsored by OpenAI.

## Install

```bash
pnpm add @jrkropp/codex-js
```

```tsx
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { CodexChat } from "@jrkropp/codex-js/react";

const appServer = createCodexAppServerClient({
	url: async () => getCodexAppServerWebSocketUrl(),
});

export function Chat({ threadId }: { threadId: string }) {
	return <CodexChat appServer={appServer} threadId={threadId} />;
}
```

## Public Surfaces

- `@jrkropp/codex-js/client`: browser app-server WebSocket client and protocol event helpers.
- `@jrkropp/codex-js/server`: Codex runtime, app-server processors, stores, model transport, and server helpers.
- `@jrkropp/codex-js/react`: React chat components, hooks, render state, and composer helpers.
- `@jrkropp/codex-js/shadcn`: optional shadcn primitives for chat layout composition.
- `@jrkropp/codex-js/testing`: test stores and package test helpers.
- `@jrkropp/codex-js/styles.css`: Tailwind source hint for package classes.

## Development

```bash
pnpm install
pnpm external:sync --codex /path/to/codex --t3 /path/to/t3-chat
pnpm typecheck
pnpm test
pnpm build
pnpm publint
pnpm pack:dry-run
pnpm dev:minimal
```

Upstream reference source should stay local and unchecked-in under
`external/`. The recommended setup is to sync local Codex and T3 source
trees into `external/codex` and `external/t3code` with
`pnpm external:sync`, then keep all actual product code and ports inside the
tracked `packages/codex-js/src` tree.

## Releases

This repo uses Changesets. Add a changeset for user-visible changes:

```bash
pnpm changeset
```

Merging the Changesets release PR updates `CHANGELOG.md`, bumps package
versions, publishes to npm, and creates the GitHub release.

## License And Attribution

`codex-js` is licensed under Apache-2.0. Portions are modified TypeScript ports
of OpenAI Codex, which is also Apache-2.0. T3-derived UI code is used under the
T3 Tools MIT license. See `LICENSE` and `NOTICE`.
