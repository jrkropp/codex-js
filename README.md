# codex-js

`codex-js` is an unofficial TypeScript port of the Codex runtime for building
Codex-backed web apps and interfaces.

The workspace publishes two npm packages:

- `@jrkropp/codex-js`: core client, server, runtime, and testing utilities.
- `@jrkropp/codex-js-react`: React chat UI, shadcn-compatible primitives, and CSS.

Examples show how a host application supplies credentials, storage, prompts,
tools, and routes.

This project is not affiliated with, endorsed by, or sponsored by OpenAI.

## Install

```bash
pnpm add @jrkropp/codex-js
```

For React UI:

```bash
pnpm add @jrkropp/codex-js @jrkropp/codex-js-react react react-dom
```

```tsx
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { CodexChat } from "@jrkropp/codex-js-react";
import "@jrkropp/codex-js-react/styles.css";

const appServer = createCodexAppServerClient({
	url: async () => getCodexAppServerWebSocketUrl(),
});

export function Chat({ threadId }: { threadId: string }) {
	return <CodexChat appServer={appServer} threadId={threadId} />;
}
```

## Public Surfaces

- `@jrkropp/codex-js`: small root client conveniences.
- `@jrkropp/codex-js/client`: browser app-server WebSocket client and protocol event helpers.
- `@jrkropp/codex-js/server`: Codex runtime, app-server processors, stores, model transport, and server helpers.
- `@jrkropp/codex-js/testing`: test stores and package test helpers.
- `@jrkropp/codex-js-react`: React chat components, hooks, render state, and composer helpers.
- `@jrkropp/codex-js-react/shadcn`: optional shadcn primitives for chat layout composition.
- `@jrkropp/codex-js-react/styles.css`: generated package CSS.

## Development

```bash
pnpm install
pnpm external:sync --codex /path/to/codex --t3 /path/to/t3-chat
pnpm typecheck
pnpm test
pnpm test:pack
pnpm build
pnpm publint
pnpm pack:dry-run
pnpm dev:minimal
```

Upstream reference source should stay local and unchecked-in under
`external/`. The recommended setup is to sync local Codex and T3 source trees
into `external/codex` and `external/t3code` with `pnpm external:sync`, then keep
publishable package code inside the tracked `packages/*/src` trees.

## Releases

This repo uses Changesets. Add a changeset for user-visible changes:

```bash
pnpm changeset
```

Merging the Changesets release PR updates `CHANGELOG.md`, bumps package
versions, publishes to npm, and creates the GitHub release.

Releases use npm trusted publishing. Existing package names can publish through
OIDC from `.github/workflows/release.yml`; brand-new package names must be
bootstrapped once with an npm token or a manual first publish before trusted
publishing can be configured for them. Run `pnpm release:preflight` to catch
that state before a release can partially publish.

## License And Attribution

`codex-js` is licensed under Apache-2.0. Portions are modified TypeScript ports
of OpenAI Codex, which is also Apache-2.0. T3-derived UI code is used under the
T3 Tools MIT license. See `LICENSE` and `NOTICE`.
