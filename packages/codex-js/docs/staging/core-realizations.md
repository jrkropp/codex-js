# Core Realizations

The package is a Codex runtime and UI kit, not a Cloudflare, Durable Object, React Router, or host application package.

Do not make app grouping the primitive. Make the store the boundary.

A configured `ThreadStore` represents the host app's storage scope.

`ThreadReader` is the narrow read view over `ThreadStore`; store-only and headless hooks should not require full store lifecycle methods when they only read metadata and history.

`thread/resume` is protocol snapshot hydration. Plug-and-play chat should hydrate from `CodexAppServer.threadResume`; `ThreadReader` is the store-only fallback.

Codex is a thread runtime over an event log, not a chat-message store.

`ThreadStore` stores Codex history. App-server resume translates that history into a generated `Thread` snapshot for UI.

Codex App Server is the adapter boundary between UI and runtime.

The app server runs Codex. The store remembers Codex. The UI renders Codex.

`CodexAppServer` is how UI reaches the app server; the name mirrors Codex's upstream app-server terminology.

Codex App Server is not just lifecycle verbs; it is the protocol shape: `ClientRequest`, `ServerNotification`, `ServerRequest`, and `RequestId`.

Codex App Server protocol types come from Codex's generated TypeScript schema. Package-owned code wraps the generated protocol; it does not redefine it.

Core events are internal. App-server notifications are the wire contract.

The app-server listener is the live delivery boundary. It translates core events, tracks request ids, and orders server-request resolution without changing stored history.

Resume snapshot and live stream are the same app-server model; stored history is only the source material.

After the app-server boundary, React should reduce protocol events, not reconstruct core events.

`ThreadEventStore` is the protocol-native UI state store. It owns generated `Thread`, `Turn`, `ThreadItem`, pending `ServerRequest`, warning, error, active-turn, and connection state.

Protocol state belongs in runtime; T3 projection belongs at the component boundary.

The T3 adapter is the presentation boundary; apps extend it by composition, not by editing package source.

The package owns defaults; apps extend presentation through slots, not source edits.

Architecture is not complete until the integration path is obvious.

`CodexChat` is the UI doorway. `createCodexAppServerClient` is the app-server doorway.

`CodexAppServerMessageProcessor` is the server doorway. The package dispatches Codex protocol; the app implements Codex behavior.

`createCodexAppServerRuntime` is the runtime doorway. The package can run Codex without owning deployment: runtime is Codex; storage, credentials, tools, and transport are app choices.

The runtime boundary is complete when the production app no longer reimplements Codex session lifecycle.

Once the runtime doorway works, delete the parallel lifecycle doorway.

Codex server delivery is not a generic event bus. `OutgoingMessageSender`,
`ThreadScopedOutgoingMessageSender`, `ThreadState`, and `ThreadStateManager`
carry ordering, request-id callbacks, listener lifecycle, and active-turn state.

Public runtime exports are integration doorways. Codex app-server machinery stays
inside the runtime unless an application boundary needs it directly.

The production app proves the package by being boring. host application consumes
runtime doorways, while protocol mapping and resume snapshot construction stay
inside the package runtime.

Examples are architecture. If the example hand-rolls lifecycle, consumers will
too.

Server-request responses belong in the runtime. The app resolves or rejects by
generated `RequestId`; the package turns that into the internal Codex session
response path.

A public API is not obvious until a minimal app can use it without private knowledge.

`AppServerSession` owns request-id lifecycle. UI code should not assemble app-server request ids ad hoc.

`PendingAppServerRequests` owns request-id pending UI state. Server requests are resolved or rejected by `RequestId`.

Codex starts and resumes threads explicitly through app-server requests. `ensure` is listener and runtime attachment semantics, not public thread creation semantics.

Once the app-server boundary is Codex-shaped, HTTP, WebSocket, Durable Object RPC, local process, and hosted service are delivery mechanisms.

A Durable Object is one possible implementation of a Codex store and app-server boundary. It is not a primitive of the Codex assistant package.

Local files, IndexedDB, SQL, and Durable Objects are storage implementations of the same Codex store boundary.

The package should follow Codex's conversation model and lifecycle while leaving storage, routing, deployment, and host-app grouping decisions to adapters.

Runtime uses Codex terms. Ergonomic components and hooks can expose friendlier APIs.

When Codex already has the right concept, preserve Codex's vocabulary. Names like `CodexAppServer` carry architecture and make upstream changes easier to map.

The package should be easy at the edge and faithful at the core. Developers get simple APIs and components, while the internals stay close to Codex and T3 naming, structure, and lifecycle.

Upstream-shaped source should be visually obvious in the folder structure. Codex and T3 upstream sources are source references; package-owned primitives and public APIs live outside those upstream trees.

The public React surface should be named for what developers use, not where the implementation came from. T3 remains the upstream source tree; `components` and `hooks` are the stable React surfaces.

Developers should extend by composition, not by editing package source. Business tools, prompts, auth, storage, custom rendering, and product-specific interactions live in the consuming app.

Apps extend through composition, not package source edits.

The package should be replaceable. A consuming app should be able to update the package without overwriting its business-specific customizations.

Adapters are not primitives. The package exposes contracts; platform-specific implementations belong in host apps, examples, or documentation guides.

Extension points should be intentional. The package exposes stable boundaries such as store, app server, tools, prompts, renderers, slots, and runtime configuration without turning every internal mechanism into public API.

The model should stay Codex-shaped, not host application-shaped. host application projects, routes, prompts, tools, and Durable Object layout are host-app choices, not package primitives.

`ChatRuntime` is an ergonomic component-surface facade, not a second runtime. It reads from the same protocol-native lifecycle as `CodexChatView`.

Friendly `sendMessage` APIs belong at the component edge. Runtime dispatch is Codex-shaped app-server lifecycle flow.

Codex App Server is maintained by processor boundaries: thread requests, turn requests, thread state, outgoing messages, and bespoke event handling.

Session creation is a runtime boundary: it attaches ThreadStore history, LiveThread persistence, SessionConfiguration, and app-owned overrides before processors run turns.

Task execution is a runtime boundary: request processors choose app-server verbs,
`CodexSessionTaskRunner` starts `RegularTask` or `CompactTask`, and
`ModelClientSession` stays turn-scoped inside Codex execution.

Codex execution helpers live in upstream core; package runtime composes them
through app-server processors.

Tool calls are core turn-loop work; app-server requests are the outside-input boundary.

Tool definitions are runtime affordances. Tool calls and tool results become
thread history, but tool availability comes from the tool registry for each
turn.

Web search is a hosted Responses API tool. Top-level `web_search` selects
disabled, cached, or live mode; `[tools.web_search]` only configures context,
domain filters, and approximate location.

Cached web search is the effective Codex default. Live search is a configured
mode or a no-sandbox turn fallback, not an app-owned dynamic tool.

App-owned dynamic tools let the application teach Codex what capabilities exist
without letting the package own product execution.

`tool_search` is BM25 over deferred tool metadata. The model chooses the query;
Codex deterministically ranks tool names, namespaces, descriptions, and schema
property names.

`RequestId` is app-server correlation. `call_id` is model and tool correlation.

One core tool event may emit multiple app-server protocol messages.

User feedback is a Codex tool request. T3 renders it as composer state, and apps
customize presentation without changing the generated protocol.

`RequestId` is the app-server request identity. `itemId` and core `call_id` are
model/tool item identities.

Plan Mode is Codex collaboration state rendered through T3, not a separate chat
product.

Proposed plans are protocol thread items. T3 renders `Plan` items as plan cards
and applications customize plan actions at the component boundary.

The composer is a T3 presentation primitive. Codex protocol state enters through
package adapters; app commands, skills, realtime controls, model choices, and
unavailable host actions enter as typed component props.

Composer shortcuts are interaction contracts, not incidental UI. `/`, `@`, `$`,
arrow navigation, Enter/Tab selection, and Shift+Tab mode switching should stay
aligned with T3 so developers get the expected chat workflow without importing
T3 internals.
