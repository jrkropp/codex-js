# codex-js Agent Guide

This package is a Codex runtime and UI kit. It must remain portable across
applications and must preserve upstream Codex and T3Chat structure wherever
practical.

## Upstream Mirror Rules

- Treat `.reference/codex/codex-rs` as the canonical architecture source for
  `src/upstream/codex-rs`.
- Treat `.reference/t3code` as the canonical UI source for `src/upstream/t3code`.
- Preserve upstream naming, file stems, folder structure, terminology, protocol
  names, lifecycle boundaries, and runtime concepts whenever TypeScript allows.
- When Rust file names use snake_case, prefer the same file stem in TypeScript
  unless the package already exposes a stable local stem.
- When T3Chat uses a component or helper boundary, prefer matching that
  component or helper boundary over inventing a product-specific wrapper inside
  the package.

## Package Boundary

The package must not import from consuming app code. Forbidden package imports
include:

- `app/`
- `src/assistant-app/`
- `src/domain/`
- `src/browser/`
- `src/worker/`
- app route modules
- product domain modules

The package must not contain product-specific prompts, tools, route paths,
partition names, storage keys, Durable Object binding names, or branding. Those
belong in the consuming app and enter through runtime, component, hook, store,
and app-server contracts.

`ThreadStore` is the full Codex storage boundary. `ThreadReader` is the narrow
read view over `readThread` and `loadHistory` for store-only and headless
integrations. Plug-and-play chat hydration prefers `CodexAppServer.threadResume`,
which returns a generated protocol thread snapshot.

`CodexAppServer` is the UI-facing Codex App Server boundary. It mirrors Codex's
generated typed protocol shape: `ClientRequest`, `ServerNotification`,
`ServerRequest`, and `RequestId`. Package-owned code wraps the generated schema;
it does not redefine it. `AppServerSession` owns request-id lifecycle and typed
lifecycle helpers. `PendingAppServerRequests` owns request-id pending UI state.
Local servers, Workers, Durable Objects, and hosted services are app-server and
store implementations.

Core `EventMsg` values stay inside Codex runtime and stored history. Browser-facing
streams emit generated app-server `ServerNotification` and `ServerRequest` shapes.
The package runtime owns live protocol emission and request-id resolution
ordering. Host applications deliver the resulting `AppServerEvent` values.
Resume snapshots and live streams use the same app-server protocol model; stored
history is source material, not the browser contract.

Server-side runtime delivery follows Codex's own shape. Prefer
`OutgoingMessageSender`, `ThreadScopedOutgoingMessageSender`, `ThreadState`, and
`ThreadStateManager` over generic event-bus abstractions.

React chat state reduces generated app-server protocol events into
`ThreadEventStore`. Hooks and components render protocol-native
`ThreadEventSnapshot` state and should not reconstruct core `EventMsg` values
after the app-server boundary.

Protocol state belongs in `src/runtime`; T3 projection belongs at the component
boundary. `src/components` creates `CodexChatRenderState` from protocol
snapshots and lifecycle state, then passes that render state into the T3-derived
timeline, composer, banners, and pending-request slots. Apps extend this
boundary through composition points, not package source edits.

## Extension Rule

If a behavior differs by application, expose a composition point, runtime
contract, component prop, hook option, renderer, tool, prompt, store, or
app-server boundary instead of changing Codex or T3Chat upstream-shaped source. Consuming
applications own product-specific integration outside the package.

## Updating From Upstream

When porting a newer Codex or T3Chat change:

1. Locate the upstream file in `MIRROR_MAP.md`.
2. Preserve upstream structure and names first.
3. Apply only the documented TypeScript, browser, or Cloudflare adaptations.
4. Keep consuming-app code outside the package.
5. Run the package typecheck, boundary test, and relevant runtime/UI tests.

Do not add compatibility shims for removed app-local import paths. Consumers
should import the package surfaces directly.
