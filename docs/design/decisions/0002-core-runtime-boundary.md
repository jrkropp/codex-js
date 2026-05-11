# 0002 Core Runtime Boundary

Status: accepted

## Context

`@jrkropp/codex-js` follows Codex's runtime model and T3's chat interaction model. The package needs a runtime boundary that stays faithful to Codex while allowing consuming applications to choose their own storage, app-server implementation, routing, tools, prompts, auth, deployment, and product grouping.

Codex already defines the storage-neutral persistence boundary through `ThreadStore`. A thread store can be backed by local files, memory, a remote service, a database, a Durable Object, or another host-owned implementation without changing the Codex runtime model.

React chat surfaces use `CodexAppServer.threadResume` for protocol-shaped hydration. `ThreadReader` remains the narrow `readThread` plus `loadHistory` view for store-only and headless integrations; it is a read view over the Codex store boundary, not a competing storage primitive.

Codex App Server is the execution role for Codex. It owns credentials, tools, prompts, model execution, persistence writes, and event emission. The package exposes this role to UI through `CodexAppServer`, matching Codex's upstream terminology.

## Decision

`ThreadStore` is the Codex storage boundary. A configured store represents the consuming application's storage scope, such as a local folder, database, remote service, or Durable Object.

`ThreadReader` is the hook-level read boundary for integrations that hydrate directly from storage. Plug-and-play chat components hydrate from `CodexAppServer.threadResume`, which presents stored Codex history as a generated app-server `Thread` snapshot.

`CodexAppServer` is the package UI boundary for Codex App Server communication. It mirrors Codex's generated typed request, response, notification, and server-request protocol with `ClientRequest`, `ServerNotification`, `ServerRequest`, and `RequestId`. `AppServerSession` owns request-id lifecycle and typed lifecycle helpers such as `threadStart`, `threadResume`, `turnStart`, `turnSteer`, `turnInterrupt`, and `threadCompactStart`. `PendingAppServerRequests` owns request-id pending UI state. App-server implementations hide platform details such as HTTP routes, WebSocket tickets, credentials, Durable Objects, and hosted service URLs.

Core `EventMsg` values are runtime and storage internals. App-server implementations use a listener boundary to emit generated `ServerNotification` and `ServerRequest` shapes as the external event stream, track request ids, and order `serverRequest/resolved` notifications with the requests they resolve.

`thread/resume` is protocol snapshot hydration. Resume responses and live event streams use the same generated app-server model; stored rollout history is source material for that model, not the browser contract.

React chat state reduces generated app-server protocol events into `ThreadEventStore`. Hooks and components render `ThreadEventSnapshot` state derived from generated `Thread`, `Turn`, `ThreadItem`, `ServerNotification`, and `ServerRequest` values. Core events remain below the app-server boundary.

Protocol state belongs in `src/runtime`; T3 projection belongs at the component boundary. The runtime reducer does not import T3 timeline types. Components create `CodexChatRenderState` from protocol snapshots and lifecycle UI state before rendering the T3-derived timeline, composer, banners, and pending-request slots.

The package model uses Codex-shaped terms:

- `Thread`
- `Turn`
- `ThreadStore`
- `ThreadReader`
- `LiveThread`
- `Submission`
- `Op`
- `Event`
- `EventMsg`
- `RolloutItem`
- `UserInput`
- `ThreadHistoryBuilder`
- `RenderedThreadState`
- `CodexAppServer`
- `ClientRequest`
- `ServerNotification`
- `ServerRequest`
- `RequestId`
- `AppServerSession`
- `PendingAppServerRequests`
- `ThreadEventStore`
- `ThreadEventSnapshot`

Product grouping, account boundaries, workspace selection, and deployment placement are host-app or store implementation strategies. They are not core runtime primitives.

The package layers remain explicit:

- `src/upstream/codex-rs` is the faithful Codex runtime upstream source.
- `src/runtime` contains platform-neutral lifecycle contracts around Codex concepts.
- `src/components` contains the stable T3-derived React component surface.
- `src/hooks` contains React hooks around a configured runtime.
- The consuming app owns storage, routing, auth, tools, prompts, product renderers, and deployment.

The app server runs Codex. The store remembers Codex. The UI renders Codex as generated app-server snapshots and live events.

## Consequences

Runtime APIs prefer Codex terminology over generic chat terminology. Ergonomic React components and hooks may expose friendlier APIs, but they build on the Codex-shaped runtime model.

Applications extend the package through composition and stable extension points instead of modifying package source. Product-specific tools, prompts, auth, storage, renderers, and routes live in the consuming application.

A Durable Object is one possible implementation of a Codex store and app-server boundary. It is not a primitive of the Codex assistant package.
