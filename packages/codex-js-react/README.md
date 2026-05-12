# @jrkropp/codex-js-react

React UI for `@jrkropp/codex-js`, including `CodexChat`, hooks, shadcn-compatible primitives, and a generated stylesheet.

## Install

```sh
pnpm add @jrkropp/codex-js @jrkropp/codex-js-react react react-dom
```

Requirements:

- Node.js 20 or newer.
- ESM projects only. This package does not ship CommonJS.
- React 18.3 or React 19.
- A browser bundler that can import CSS.

## Usage

```tsx
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { CodexChat } from "@jrkropp/codex-js-react";
import "@jrkropp/codex-js-react/styles.css";

const appServer = createCodexAppServerClient({
	url: () => "ws://localhost:1466/api/codex/app-server",
});

export function App() {
	return (
		<CodexChat
			appServer={appServer}
			threadId="00000000-0000-4000-8000-000000000001"
			title="Codex"
			subtitle="React package consumer"
		/>
	);
}
```

## Stable Imports

```ts
import { CodexChat } from "@jrkropp/codex-js-react";
import { SidebarContent } from "@jrkropp/codex-js-react/shadcn";
import "@jrkropp/codex-js-react/styles.css";
```

The React package exposes only:

- `@jrkropp/codex-js-react`
- `@jrkropp/codex-js-react/shadcn`
- `@jrkropp/codex-js-react/styles.css`

Runtime and server APIs remain in `@jrkropp/codex-js`.
