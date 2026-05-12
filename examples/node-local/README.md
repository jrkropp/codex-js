# codex-js Node Local Example

Small local integration of the public package surfaces:

```txt
CodexChat
  -> createCodexAppServerClient
  -> Vite WebSocket endpoint
  -> createCodexAppServerConnection
  -> createCodexAppServer
  -> InMemoryThreadStore + createModelClient + dynamic tools
```

## Run

Create `examples/node-local/.env.local`:

```env
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-5-mini
```

Then run from the repository root:

```sh
pnpm dev:node-local
```

Open `http://localhost:1466`.

## What This Example Shows

- A local Node/Vite app-server endpoint that keeps `OPENAI_API_KEY` server-side.
- One-time WebSocket tickets from `POST /api/codex/session`.
- `createCodexAppServer` as the high-level server entrypoint.
- `createCodexAppServerConnection` as the platform-neutral WebSocket bridge.
- `threadStore` with `InMemoryThreadStore`.
- A server-executed dynamic tool: `billing.lookup_invoice`.
- A visible client-resolved dynamic tool: `billing.refund_invoice`, rendered as an approval panel.

This example avoids Cloudflare, Durable Objects, package-internal imports, and browser-provided API keys. Use `examples/cloudflare` for the deployable Worker + Durable Object version.
