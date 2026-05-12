# @jrkropp/codex-js-react

React UI package for `@jrkropp/codex-js`. It includes `CodexChat`, React hooks, shadcn-compatible primitives, and generated CSS.

## Install

```sh
npm install @jrkropp/codex-js @jrkropp/codex-js-react react react-dom
```

Requirements:

- Node.js 20 or newer.
- ESM only. CommonJS output is not shipped.
- React 18.3 or React 19.
- A bundler that supports CSS imports.

## Usage

```tsx
import { createCodexAppServerClient } from "@jrkropp/codex-js/client";
import { CodexChat } from "@jrkropp/codex-js-react";
import "@jrkropp/codex-js-react/styles.css";

const appServer = createCodexAppServerClient({
	url: async () => {
		const session = await fetch("/api/codex/session", { method: "POST" });
		const { webSocketUrl } = await session.json();
		return webSocketUrl;
	},
});

export function App() {
	return (
		<CodexChat
			appServer={appServer}
			threadId="00000000-0000-4000-8000-000000000001"
			title="Codex"
		/>
	);
}
```

## Public Imports

```ts
import { CodexChat } from "@jrkropp/codex-js-react";
import { SidebarContent } from "@jrkropp/codex-js-react/shadcn";
import "@jrkropp/codex-js-react/styles.css";
```

The React package exposes only:

- `@jrkropp/codex-js-react`
- `@jrkropp/codex-js-react/shadcn`
- `@jrkropp/codex-js-react/styles.css`

Runtime, server, and testing APIs live in `@jrkropp/codex-js`.
