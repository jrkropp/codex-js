# Primitives And Boundaries

This page names the package primitives and where application behavior attaches.

## Runtime Primitives

| Primitive | Boundary |
| --- | --- |
| `ThreadStore` | Full Codex persistence boundary for thread metadata and ordered rollout history. |
| `ThreadReader` | Narrow read view over `ThreadStore` for store-only or headless integrations. |
| `LiveThread` | Active store-backed handle used by Codex sessions. |
| `CodexAppServer` | UI-facing boundary for generated Codex app-server requests, responses, notifications, and server requests. |
| `AppServerSession` | Client helper that owns request ids and typed lifecycle calls such as `threadStart`, `threadResume`, and `turnStart`. |
| `CodexAppServerMessageProcessor` | Connection-scoped control plane that handles initialize, experimental capability checks, request serialization, and method dispatch. |
| `RequestSerializationQueues` | Codex-style keyed FIFO queue for same-scope requests such as one thread, one config domain, or one process. |
| `ConnectionRpcGate` | Connection lifecycle gate that accepts work while open and rejects late work after shutdown. |
| `ModelClient` | Session-scoped model transport boundary that owns provider config, auth material, WebSocket fallback state, and cached turn WebSocket state. |
| `ModelClientSession` | Turn-scoped model streaming boundary that prewarms Responses WebSocket, replays `x-codex-turn-state`, streams model events, and releases cached transport state back to `ModelClient`. |
| `PendingAppServerRequests` | Request-id indexed pending state for server requests that need a client or app response. |
| `ThreadEventStore` | Protocol-native React state store for generated `Thread`, `Turn`, `ThreadItem`, `ServerNotification`, and `ServerRequest` values. |
| `CodexChatRenderState` | Component-layer adapter from protocol state to T3 timeline, composer, banners, and pending request slots. |

`Submission`, `Op`, `Event`, `EventMsg`, `RolloutItem`, and
`RenderedThreadState` remain Codex runtime and storage concepts. They are useful
inside the runtime and tests, but app-facing React code should usually work with
`CodexAppServer`, `ThreadEventSnapshot`, and package components or hooks.

## App Server Boundary

`CodexAppServer` is the browser doorway to Codex App Server. It accepts generated
`ClientRequest` values, returns typed method responses, streams generated
`ServerNotification` and `ServerRequest` values, and resolves or rejects server
requests by `RequestId`.

Each app-server connection starts with `initialize`. After that, the message
processor reads generated protocol metadata to decide whether a request is
experimental, whether it must serialize with another request, and which
processor owns it. Browser chat is therefore a generated app-server protocol
client, not a raw `Submission` or `EventMsg` transport.

The production browser delivery mechanism is one Codex app-server WebSocket.
That socket carries generated JSON-RPC requests, responses, notifications, and
server requests. Route paths, WebSocket tickets, credential headers, Durable
Object names, and deployment details remain host-owned.

## Model Transport Boundary

The OpenAI model transport is separate from the browser app-server WebSocket.
Codex runtime creates a session-scoped `ModelClient`; each turn creates a
`ModelClientSession`. The session prefers OpenAI Responses WebSocket,
prewarms with `generate: false`, captures sticky turn state, sends
`response.processed`, and falls back to HTTP/SSE for the rest of the session
when the WebSocket path is unavailable.

The package owns the Codex-shaped transport classes and request serialization.
The host app owns credentials, provider policy, project prompts, tools, and
where the runtime is allowed to make outbound OpenAI requests.

## Tool Boundary

Dynamic tools are app-owned capabilities registered with Codex. The package owns
tool discovery, model-facing specs, generated server requests, and reinjecting
results into the Codex turn loop. The app owns business execution, credentials,
permissions, and product data.

`request_user_input` follows the same separation. Codex exposes the tool, emits
a generated server request, and T3 renders pending questions. The app resolves
the request by `RequestId`.

## Presentation Boundary

The T3-derived composer and timeline own interaction mechanics: optimistic
rows, scroll pinning, image attachments, draft restoration, command menus,
pending input, and proposed-plan cards.

Applications customize presentation through component props and render slots:

- `composerCommands` and `composerSkills`
- `mentionRefs`
- `renderPendingRequest`
- `renderPendingUserInput`
- `renderBannerItems`
- `renderTimelineExtras`
- `onImplementProposedPlan`

These extension points keep product behavior outside package internals while
allowing each host app to make the chat surface feel native.

## Host-App Boundary

The consuming app owns everything that changes by product or deployment:

- prompts and developer instructions
- dynamic tool specs and resolvers
- storage placement and `ThreadStore` implementation
- model credential policy and model-client construction
- route paths, draft promotion, and thread list placement
- branded UI actions and product-specific rendering

If a new behavior depends on any of those concerns, add or use a host extension
point instead of changing Codex or T3 upstream-shaped source.
