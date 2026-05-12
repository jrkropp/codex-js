# Minimal Codex App Server

This example is the smallest runnable integration of the public package doorways:

```txt
CodexChat
  -> createCodexAppServerClient
  -> createCodexAppServerRuntime
  -> createMessageProcessor
  -> InMemoryThreadStore + createModelClient + sendOutgoingMessage
```

Run it with:

```bash
pnpm dev:minimal
```

The app prompts for an OpenAI API key and stores it in `sessionStorage` for the
current browser session. The local Vite app-server endpoint passes that key into
`createCodexAppServerRuntime`, uses `InMemoryThreadStore` for thread state, and
delivers generated `AppServerEvent` values over the example WebSocket.

The example also includes app-owned dynamic tools:

- `billing.lookup_invoice` is visible to the model immediately and resolves
  automatically from sample invoice data.
- `billing.refund_invoice` is deferred behind `tool_search` and renders a small
  approval panel before the app resolves the generated `RequestId`.
- `request_user_input` is available in Plan mode so the default T3 composer can
  render Codex's structured user-feedback prompt and resolve it by `RequestId`.
- The Build/Plan toggle demonstrates Codex collaboration mode. Plan responses
  can include `<proposed_plan>` blocks, which render as T3 proposed-plan cards
  and can be sent back as `PLEASE IMPLEMENT THIS PLAN:` follow-ups.

The example intentionally avoids product-specific host code, Cloudflare,
Durable Objects, React Router, unstable T3 imports, unstable Codex imports, and
package-internal paths. Codex behavior enters through the stable `/server`
surface; UI rendering enters through the stable `/react` surface.
