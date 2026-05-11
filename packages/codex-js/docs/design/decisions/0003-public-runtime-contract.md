# 0003 Public Runtime Contract

Status: accepted

## Context

`@jrkropp/codex-js` exposes a public package surface on top of two upstream source trees: Codex for runtime semantics and T3 for chat interaction ownership. The public contract must stay small enough to understand quickly while remaining faithful to those source systems.

The package surface contains ergonomic concepts only where they clarify usage without creating a second runtime model. The pressure test compares the public surface against Codex primitives, T3 lifecycle ownership, and common consuming application shapes.

## Decision

Codex terms define the runtime contract. The durable runtime concepts are:

- `Thread`
- `Turn`
- `ThreadStore`
- `LiveThread`
- `Submission`
- `Op`
- `Event`
- `EventMsg`
- `RolloutItem`
- `UserInput`
- `ThreadHistoryBuilder`
- `RenderedThreadState`

The public package surface is organized around a configured `ThreadStore`, its narrow hook-level `ThreadReader` read view, `CodexAppServer`, generated app-server protocol snapshots, and protocol-native chat state. A configured store represents the host application's storage scope. Product grouping is not a runtime primitive.

`CodexAppServer` is the UI-facing boundary to Codex App Server. Its protocol types come from Codex's generated TypeScript schema. `AppServerSession` owns request-id lifecycle and typed lifecycle helpers. `PendingAppServerRequests` owns request-id pending UI state. The boundary can be implemented by a local process, Worker, Durable Object, or hosted service without changing package APIs.

Core runtime events remain inside Codex history and projection code. `thread/resume` returns generated `ThreadResumeResponse` snapshots for initial hydration, and the app-server listener emits generated `ServerNotification` and `ServerRequest` values as the external stream. React chat state reduces those protocol values into `ThreadEventStore`; it does not reconstruct core events after the app-server boundary.

Protocol state belongs in `runtime`. T3 projection belongs at the component boundary, where `ThreadEventSnapshot` and lifecycle UI state become `CodexChatRenderState` for the T3-derived timeline, composer, banners, and pending-request slots. Apps extend that presentation boundary through composition, not package source edits.

T3 terms define the React chat lifecycle boundary. Optimistic rows, local dispatch snapshots, send-in-flight guards, composer handoff, draft promotion timing, scroll pinning, and route-friendly draft state belong to `components` and `hooks`, not to the Codex runtime upstream source.

The canonical public import paths are:

- `@jrkropp/codex-js/server`
- `@jrkropp/codex-js/react`
- `@jrkropp/codex-js/react`

The package root is a small plug-and-play chat entrypoint. It does not flatten
runtime, hook, component, Codex mirror, or T3 mirror exports into one namespace.

The Codex and T3 upstream source import paths remain available for advanced use, but app-facing code should prefer the canonical package surfaces.

## Public Surface Classification

| Concept | Classification | Decision |
| --- | --- | --- |
| `ThreadStore` | Codex-native | Use the Codex-shaped store contract as the storage boundary. |
| `ThreadReader` | Codex store read view | Use for store-only and headless hydration when hooks need only `readThread` and `loadHistory`. |
| `LiveThread` | Codex-native | Use for live thread lifecycle and store-backed thread operations. |
| `ClientRequest` | Codex app-server protocol | Use for typed client-to-server app-server method calls. |
| `ServerNotification` | Codex app-server protocol | Use for typed server-to-client notification flow. |
| `ServerRequest` | Codex app-server protocol | Use for server-to-client requests that require request-id resolution. |
| `RequestId` | Codex app-server protocol | Use to resolve or reject server requests. |
| `AppServerSession` | Codex app-server client helper | Own request-id lifecycle and typed lifecycle helpers over generated `ClientRequest` values. |
| `PendingAppServerRequests` | Codex app-server request state | Own pending UI state keyed by `RequestId`. |
| `ThreadEventStore` | Codex app-server protocol state | Own generated `Thread`, `Turn`, `ThreadItem`, pending server request, warning, error, active-turn, and connection state for chat UI. |
| `ThreadEventSnapshot` | Codex app-server protocol state | Expose immutable protocol-native state to hooks and components. |
| `Submission` | Codex-native | Use inside Codex runtime/session internals, not as the public UI response contract. |
| `Event` and `EventMsg` | Codex-native | Use for core runtime event flow inside runtime and storage internals. |
| `ThreadHistoryBuilder` | Codex-native | Use for low-level history projection. |
| `RenderedThreadState` | Codex-native projection | Keep as a low-level core projection, not the primary app-facing chat state. |
| `CodexChatRuntimeOptions` | Component ergonomic facade | Configure an app-server-backed chat runtime with optional thread and optional store reader fallback. |
| `CodexAppServer` | Codex app-server boundary | Shape around Codex generated `ClientRequest`, `ServerNotification`, `ServerRequest`, `RequestId`, event streaming, and request-id resolution; hide route, credential, WebSocket, and platform details in the host adapter. |
| Component and hook props | React ergonomics | Keep package-name-neutral and store-centered. |
| Draft helpers | T3 lifecycle/app routing | Keep in `hooks` or host-app glue unless they operate only on Codex data. |
| Local dispatch helpers | T3 lifecycle | Keep with chat lifecycle code, close to `ChatView` and composer ownership. |

## Pressure Test Findings

| Scenario | Required package concepts | Host-owned concepts | Result |
| --- | --- | --- | --- |
| Local file-backed app | `ThreadStore`, `LiveThread`, `Submission`, `ThreadEventStore`, hooks or components | Local file paths, user identity, persistence location | Passes when the store is configured before entering runtime. |
| Cloudflare Durable Object app | Same runtime concepts plus an app-server implementation | Durable Object naming, bindings, auth, routing, deployment | Passes when Durable Object placement is hidden behind store and app-server boundaries. |
| Custom product app | Runtime plus renderer/tool/prompt extension points | Product prompts, tools, auth, renderers, route paths | Passes when extensions enter through composition rather than package source edits. |
| Headless app | `runtime` and `hooks` | Entire UI | Passes when hooks expose state/actions without requiring package components. |
| Plug-and-play app | `components` with configured reader and app server | Store, reader, and app-server construction | Passes when the component API does not expose routes, Cloudflare, deployment placement, or T3 internals. |

## Consequences

Runtime APIs stay Codex-shaped. React APIs stay approachable, but they do not introduce a second runtime model.

Cloudflare Durable Objects, local directories, databases, and remote services are all store configuration strategies.

The app server runs Codex. The store remembers Codex. The UI renders Codex as generated app-server snapshots and live events.

`CodexAppServer` is how UI reaches the app server. It sends typed client requests over the app-server JSON-RPC connection, receives typed notifications and server requests on that same connection, resolves or rejects server requests by `RequestId`, and keeps delivery details out of the package contract. The app-server implementation is provided by the consuming application and is not exported as a separate package subpath.

Drafts are treated as chat lifecycle state coordinated by T3-shaped hooks and components. Host apps may reflect draft state in routes, but routing is not part of the package runtime contract.

When the public API is unclear, compare against Codex first for runtime semantics and T3 first for chat lifecycle ownership.
