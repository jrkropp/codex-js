# codex-js Package Boundary

`packages/codex-js` is the reusable Codex runtime and UI kit. It is
designed to be copied between applications today and extracted to a standalone
package later without changing the integration model.

Codex owns runtime truth, T3 owns interaction quality, and the consuming app owns
product meaning. The package exists to preserve that boundary while providing
stable runtime, component, hook, store, and app-server contracts.

Read these files before changing package code:

- `README.md` describes package usage and integration modes.
- `AGENTS.md` defines the agent rules for maintaining upstream parity.
- `MIRROR_MAP.md` maps package upstream files to upstream Codex and T3Chat references.
- `CUSTOM_TOOLS.md` documents how apps extend tools without modifying package
  internals.

## Segments

| Segment | Owner | Rule |
| --- | --- | --- |
| `src/upstream/codex-rs` | Package | Follow `.reference/codex/codex-rs` structure and naming. |
| `src/upstream/t3code` | Package | Follow `.reference/t3code` structure and UI boundaries. |
| `src/runtime` | Package | Define Codex lifecycle contracts, configured runtime, store boundary, app-server boundary, and route-neutral thread state. |
| `src/components` | Package | Define stable public React components built from the T3 upstream source. |
| `src/shadcn` | Package | Define package-owned standard shadcn primitives for optional layout composition. |
| `src/hooks` | Package | Define stable public React hooks without router coupling. |
| `src/testing` | Package | Define package and consumer testing utilities. |
| Consuming app | App | Provide prompts, tools, routes, branding, storage, auth, product renderers, and deployment. |

`src/runtime` mirrors Codex's app-server control plane. Generated
`ClientRequest` metadata drives initialize checks, experimental capability
gating, request serialization, connection shutdown, and request-processor
dispatch. Host apps provide routes and credentials around that control plane
instead of bypassing it with product-specific chat handlers.

`src/upstream/codex-rs/core/src/client.ts` mirrors Codex's model transport
boundary. `ModelClient` is session-scoped; `ModelClientSession` is turn-scoped.
The model path prefers server-side OpenAI Responses WebSocket, uses HTTP/SSE
only as Codex-style fallback, and remains separate from the browser-facing
Codex app-server WebSocket.

`src/components` also owns the stable facade for reusable T3 interaction
primitives: model options, composer draft state, mention helpers, image
attachment helpers, realtime-control state, and the polished chat shell.
Consuming app UI should prefer that facade before importing from
`src/upstream/t3code`.

`src/shadcn` is a package-local copy of the unmodified shadcn primitives needed
for chat layout. It is available through the `shadcn` package subpath and must
not import from a consuming app's `~/components/ui`, `~/hooks`, or `~/lib`
aliases.

## Forbidden Package Dependencies

Package code must not import from product application folders or runtime glue,
including:

- `app/`
- `src/assistant-app/`
- `src/domain/`
- `src/browser/`
- `src/worker/`
- product route modules
- product domain modules

The package must not include app-specific prompts, tools, route paths, partition
names, storage keys, Durable Object binding names, or branding. Those belong in
the consuming application and enter through runtime, component, hook, store, and
transport contracts.

## Upstream Source Rule

`src/upstream/codex-rs` and `src/upstream/t3code` are upstream source trees. Do not
rename files, flatten folders, or invent new lifecycle boundaries inside those
trees. Package-owned abstractions belong in `src/runtime`, `src/components`,
`src/hooks`, or `src/testing`.
