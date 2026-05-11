# codex-js

`@jrkropp/codex-js` is a Codex runtime and UI kit for
TypeScript React applications.

The design is intentionally upstream-first. `src/upstream/codex-rs` is directly
based on Codex source code, and `src/upstream/t3code` is directly based on T3
code. Keep their file names, folder structure, lifecycle boundaries, protocol
names, and component ownership as close to upstream as practical. That upstream-shaped source layout is the maintenance strategy.

Codex source and T3 code remain the references for runtime behavior, file
boundaries, naming, and interaction patterns.

Ownership is deliberately split: Codex owns runtime truth, T3 owns interaction
quality, and the consuming app owns product meaning. Host applications supply
prompts, tools, routes, credentials, storage, and branded UI through package
contracts rather than by modifying package internals.

`codex-js` is an unofficial TypeScript port. It is not affiliated with,
endorsed by, or sponsored by OpenAI.

## Package Structure

| Segment | Purpose | Source of Truth |
| --- | --- | --- |
| `src/upstream/codex-rs` | Codex runtime, protocol, thread store, tools, model transport, and app-server protocol primitives. | `.reference/codex/codex-rs` |
| `src/upstream/t3code` | T3Chat web UI primitives: composer, timeline, model picker, image previews, and chat helpers. | `.reference/t3code` |
| `src/runtime` | Package-owned Codex lifecycle contracts, store and reader boundaries, app-server boundary, and route-neutral thread state. | Package-owned |
| `src/components` | Stable public React component surface built from the T3 upstream source. | Package-owned |
| `src/shadcn` | Package-owned standard shadcn primitives used for optional chat layout composition. | Package-owned |
| `src/hooks` | Stable public React hooks for binding a configured runtime to application UI. | Package-owned |
| `src/testing` | Package and consumer testing utilities. | Package-owned |

## Import Surfaces

Use the public package surfaces directly:

```ts
import {
  createCodexAppServerClient,
  type CodexAppServer,
} from "@jrkropp/codex-js/client";
import {
  createCodexAppServerRuntime,
  createModelClient,
  InMemoryThreadStore,
  LocalThreadStore,
  AppServerSession,
  CodexAppServerMessageProcessor,
  parseServerTransportPayload,
  serializeJsonRpcError,
  serializeJsonRpcResponse,
  type ThreadStore,
} from "@jrkropp/codex-js/server";
import {
  CodexChat,
  CodexChatLayout,
  defaultCodexModel,
  mentionToken,
  useCodexChat,
  type MentionBinding,
} from "@jrkropp/codex-js/react";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@jrkropp/codex-js/shadcn";
import {
  type ThreadReader,
} from "@jrkropp/codex-js/react";
```

The Codex and T3 upstream mirrors are internal implementation sources. Public
applications should depend on `client`, `server`, `react`, `shadcn`, and
`testing` instead of reaching into mirrored upstream folders.

Most app UI should not need the upstream T3 path. The `components` surface
exposes the reusable interaction primitives a host app naturally needs:
composer draft state, mention encoding, model and reasoning-effort options,
image attachment helpers, realtime-control state, and the polished `CodexChat`
shell. Direct T3 imports are reserved for advanced adapter work.

The `shadcn` surface exposes package-owned radix-nova shadcn primitives for
apps that want the same optional workspace shell building blocks. It is a layout
primitive surface, not a required chat dependency.

The package root remains intentionally small. It exposes the plug-and-play chat
and optional layout entrypoints only; runtime, hooks, components, shadcn, Codex
mirrors, and T3 mirrors stay on explicit subpaths.

## Store Model

`ThreadStore` is the Codex storage boundary. A configured store represents the
host application's storage scope: a local folder, database, remote service, or
Durable Object.

`ThreadReader` is the narrow read view over a configured thread store for
store-only and headless integrations. Plug-and-play chat hydration uses
`CodexAppServer.threadResume`, which presents stored Codex history as a
generated app-server `Thread` snapshot.

```ts
const store = InMemoryThreadStore.forId("dev");
const threadReader: ThreadReader = store;
```

`InMemoryThreadStore` is the standard test and example implementation.
`LocalThreadStore` is the standard local-store shape for Node and desktop
integrations. Cloudflare Durable Objects, SQL, and remote services implement the
same `ThreadStore` contract in application code.

The runtime receives configured store, reader, and app-server boundaries and runs
Codex-shaped thread lifecycle logic against them. Codex App Server runs Codex,
the store remembers Codex, and the UI renders generated app-server snapshots and
live events. `CodexAppServer` is how UI reaches Codex App Server.

## App Server Model

`CodexAppServer` is the UI-facing Codex App Server boundary. It mirrors Codex's
generated typed request, response, notification, and server-request protocol.
The protocol types come from `src/upstream/codex-rs/app-server-protocol/schema/typescript`.
Package-owned code wraps that generated protocol; it does not redefine it.
`AppServerSession` owns request-id lifecycle and typed helpers such as
`initialize`, `threadStart`, `threadResume`, `threadList`, `threadRead`,
`threadNameSet`, `turnStart`, `turnSteer`, `turnInterrupt`, and
`threadCompactStart`. `PendingAppServerRequests` owns request-id pending UI
state for server requests.

The package mirrors Codex's app-server control plane. `initialize` is the first
request on a connection and records client identity, experimental API
capability, and notification opt-outs. `CodexAppServerMessageProcessor` then
checks initialization, gates experimental requests, derives request
serialization from generated protocol metadata, and dispatches to Codex-shaped
request processors. `RequestSerializationQueues` gives same-scope requests FIFO
ordering, while `ConnectionRpcGate` stops late work after connection shutdown.

The app-server implementation owns platform details such as HTTP routes,
WebSocket tickets, credentials, Durable Objects, and hosted service URLs. Those
details stay outside the package.

`CodexAppServerMessageProcessor` is the server-side processor for a single
app-server connection. It dispatches generated `ClientRequest` values after
`initialize`, sends JSON-RPC responses through `OutgoingMessageSender`, and owns
protocol dispatch, initialize state, serialization, and connection gating. The
application implements Codex behavior: credentials, prompts, tools, storage
placement, runtime execution, and deployment.

`createCodexAppServerRuntime` is the standard runtime doorway. It implements
the Codex App Server method handlers from a configured `ThreadStore`, host-owned
model client creation, and app-owned protocol event delivery. The package runs
Codex session lifecycle; the application owns credentials, tools, prompts,
storage, event delivery, and deployment.

Core `EventMsg` values remain runtime and storage internals. Worker, local, and
hosted app-server implementations emit generated `ServerNotification` and
`ServerRequest` values on browser-facing streams. The package runtime owns live
protocol emission, request-id tracking, and server-request resolution ordering;
host applications deliver the resulting `AppServerEvent` values. `thread/resume`
returns a generated `ThreadResumeResponse`, so initial hydration and live
streaming share the same app-server model.

Runtime method handling follows Codex's request processor boundary:
`ThreadRequestProcessor` owns thread start, resume, list, read, name, archive,
unarchive, metadata update, and compaction, while `TurnRequestProcessor` owns
turn start, steer, and interrupt.

React chat state reduces the generated app-server protocol directly.
`ThreadEventStore` owns the protocol-native thread snapshot, active turns,
pending server requests, warnings, errors, and connection state. T3 rendering
adapters live in `src/components` and turn that snapshot plus lifecycle UI state
into `CodexChatRenderState`; they do not reconstruct core `EventMsg` values
after the app-server boundary.

## Model Transport Model

The package mirrors Codex's model transport split. `core/src/client.ts` owns the
session-scoped `ModelClient` and turn-scoped `ModelClientSession`.
`codex-api/src/endpoint/responses_websocket.ts` owns Responses-over-WebSocket,
and `codex-api/src/endpoint/responses.ts` owns HTTP/SSE as Codex's fallback
transport.

There are two separate WebSocket layers:

- The browser-facing Codex app-server WebSocket carries generated JSON-RPC
  `ClientRequest`, response, notification, and server-request messages between
  UI and host runtime.
- The server-side OpenAI Responses WebSocket carries `response.create`,
  `response.processed`, and model stream events between the host runtime and
  OpenAI.

`ModelClient` prefers Responses WebSocket when the provider supports it. A
`ModelClientSession` opens the socket lazily for a turn, captures
`x-codex-turn-state`, prewarms with `generate: false`, reuses the connection
within the turn, sends incremental `previous_response_id` payloads when
possible, and switches the whole session to HTTP/SSE fallback when the
WebSocket path is unsupported or unhealthy. The consuming app still owns
credential policy, provider selection, prompts, dynamic tools, and storage.

## Usage

### Plug-and-play

```ts
const appServer = createCodexAppServerClient({
  url: async () => {
    const { ticket } = await fetch("/api/codex/app-server/ticket", {
      method: "POST",
    }).then((response) => response.json());
    const url = new URL("/api/codex/app-server", window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("ticket", ticket);
    return url.toString();
  },
});
```

The client opens one Codex app-server WebSocket, sends `initialize`, sends all
generated `ClientRequest` values on that connection, resolves JSON-RPC responses
by request id, and receives generated `ServerNotification` and `ServerRequest`
messages on the same socket.

```tsx
<CodexChat
  appServer={appServer}
  threadId={threadId}
/>
```

`CodexChat` renders the default Codex/T3 chat experience. It owns lifecycle
hydration, live events, optimistic rows, composer handoff, pending server
requests, and scroll coordination.

```tsx
<CodexChat
  appServer={appServer}
  threadId={threadId}
  title="Support Assistant"
  buildTurnStartParams={({ threadId, input, model, effort, clientMessageId }) => ({
    threadId,
    input,
    model,
    effort,
    clientMessageId,
    cwd: "/workspace",
  })}
/>
```

### Optional Sidebar Layout

`CodexChatLayout` wraps any chat node in a standard shadcn `SidebarProvider`
only when `sidebar` is provided. Without `sidebar`, it returns the children
unchanged.

```tsx
<CodexChatLayout
  defaultOpen
  sidebar={
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>Threads</SidebarGroupLabel>
        <SidebarGroupContent>{threadList}</SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  }
>
  <CodexChat
    appServer={appServer}
    threadId={threadId}
  />
</CodexChatLayout>
```

The sidebar has no product meaning in the package. A host app decides whether
the sidebar contains threads, files, tools, plan details, context, or app
navigation.

### Server Handler

```ts
const runtime = createCodexAppServerRuntime({
  store,
  createModelClient({ context, threadId }) {
    return createModelClient({
      apiKey: context.credentials.openaiApiKey,
      installationId: context.installationId,
      sessionId: String(threadId),
      threadId,
    });
  },
  modelClientCacheKey({ context, threadId }) {
    return `${threadId}:${context.credentials.providerKeyHash}`;
  },
  sendOutgoingMessage(event, { threadId }) {
    publishCodexEvent(threadId, event);
  },
});

const processorsByConnection = new Map<number, ReturnType<typeof runtime.createMessageProcessor>>();

export function acceptAppServerSocket(socket: WebSocket, connectionId: number) {
  const processor =
    processorsByConnection.get(connectionId) ??
    runtime.createMessageProcessor({ connectionId });
  processorsByConnection.set(connectionId, processor);

  socket.addEventListener("message", async (event) => {
    const parsed = parseServerTransportPayload(event.data);
    if (parsed.type === "invalid") {
      socket.send(serializeJsonRpcError(parsed.id, parsed.error));
      return;
    }
    if (parsed.message.type !== "client_request") {
      return;
    }
    try {
      const result = await processor.processClientRequest(parsed.message.request, {
        user,
        credentials,
      });
      socket.send(serializeJsonRpcResponse(parsed.message.request.id, result));
    } catch (error) {
      socket.send(serializeJsonRpcError(
        parsed.message.request.id,
        errorToJsonRpcError(error),
      ));
    }
  });
}
```

The runtime implements Codex App Server methods from Codex primitives. The
handler accepts generated Codex `ClientRequest` messages, requires `initialize`
before normal methods, and returns generated method responses as JSON-RPC
response messages. Neither layer knows the host framework, route layout,
deployment platform, credentials, or model provider policy.

Production integrations use the same shape. A host app configures the runtime
with its `ThreadStore`, credential/model-client factory, prompts, tools,
app-server ticket route, and WebSocket transport adapter; it does not reimplement
Codex session lifecycle in route handlers.

### App-Owned Dynamic Tools

Dynamic tools are app-owned capabilities. The package registers them with the
Codex `ToolRouter`, exposes visible tools in the model request, exposes deferred
tools through `tool_search`, emits generated `ServerRequest` values when the
model calls them, and reinjects results into the Codex turn loop.

```ts
const billingTools = [
  {
    namespace: "billing",
    name: "lookup_invoice",
    description: "Look up an invoice by invoice id.",
    input_schema: {
      type: "object",
      properties: {
        invoiceId: { type: "string" },
      },
      required: ["invoiceId"],
      additionalProperties: false,
    },
    defer_loading: false,
  },
  {
    namespace: "billing",
    name: "refund_invoice",
    description: "Refund an invoice after checking policy constraints.",
    input_schema: {
      type: "object",
      properties: {
        invoiceId: { type: "string" },
        reason: { type: "string" },
      },
      required: ["invoiceId", "reason"],
      additionalProperties: false,
    },
    defer_loading: true,
  },
];
```

`defer_loading: false` makes a tool visible on ordinary model requests.
`defer_loading: true` keeps a tool registered while making it discoverable
through `tool_search`, which uses BM25 over tool names, namespaces,
descriptions, and schema property names. Applications execute dynamic tools and
resolve `item/tool/call` by generated `RequestId`; Codex uses the model
`call_id` internally to attach the result to the original tool call.

`request_user_input` follows the same boundary. Codex exposes it as a core tool,
emits `item/tool/requestUserInput` as a generated `ServerRequest`, and the T3
composer renders the pending questions. Apps resolve the prompt by generated
`RequestId`; `params.itemId` remains the model/tool item identity.

The full tool model is documented in
[`docs/start-here/03-tool-calling.md`](./docs/start-here/03-tool-calling.md).

### Hosted Web Search

Web search mirrors Codex exactly. It is a hosted Responses API tool controlled
by top-level config, not an app-owned dynamic tool or approval request.

```toml
web_search = "cached"   # default effective mode
# web_search = "live"   # allow live external web access
# web_search = "disabled"

[tools.web_search]
context_size = "medium"
allowed_domains = ["openai.com"]

[tools.web_search.location]
country = "US"
region = "WA"
city = "Seattle"
timezone = "America/Los_Angeles"
```

`cached` sends the hosted `web_search` tool with
`external_web_access: false`. `live` sends the same tool with
`external_web_access: true`. `disabled` omits it. `[tools.web_search]` only
configures context size, domain filters, and approximate location; legacy
boolean values are accepted as no-op config payloads. Host CLI switches like
`--search` should map to top-level `web_search = "live"`.

### Plan Mode

Plan Mode is Codex collaboration state rendered through T3. Codex injects Plan
Mode instructions through `collaborationMode`, exposes `request_user_input`
when the model needs structured feedback, and turns `<proposed_plan>` blocks
into generated `Plan` thread items. T3 renders those results as composer
questions and proposed-plan cards.

```tsx
<CodexChat
  appServer={appServer}
  threadId={threadId}
  showInteractionModeToggle
  defaultInteractionMode="plan"
/>
```

Applications can customize plan actions without changing package source:

```tsx
<CodexChat
  appServer={appServer}
  threadId={threadId}
  showInteractionModeToggle
  onImplementProposedPlan={(plan) => {
    queueImplementation(plan.planMarkdown);
  }}
/>
```

The default behavior follows T3: when a proposed plan is active in Plan mode,
submitting an empty composer sends `PLEASE IMPLEMENT THIS PLAN:` with the plan
markdown and switches the next turn back to Build mode.

### Composer Commands

The default composer is an internal T3-shaped port. `/` opens command
suggestions, `@` opens mention suggestions, `$` opens skill suggestions, arrow
keys move the active row, and Enter or Tab selects it. Built-in commands stay
T3-shaped: `/model`, `/plan`, and `/default`.

Applications add product commands and skills through component props instead of
editing upstream source:

```tsx
<CodexChat
  appServer={appServer}
  threadId={threadId}
  composerCommands={[
    {
      name: "billing",
      label: "/billing",
      description: "Insert a billing-tools prompt",
    },
    {
      name: "realtime",
      label: "/realtime",
      description: "Start realtime voice when configured",
      disabled: true,
      unavailableReason: "Realtime is not configured for this chat.",
    },
  ]}
  composerSkills={[
    {
      name: "billing-tools",
      description: "Use the app-owned billing dynamic tools",
    },
  ]}
  onCommand={(command) => {
    if (command === "billing") {
      insertBillingPrompt();
    }
  }}
/>
```

Unsupported visible controls stay visible and deterministic: pass `disabled`
and `unavailableReason` so the composer can explain why an app-owned action is
not available in the current host.

A runnable minimal version of this full path lives in
`examples/minimal-app-server`. It uses `InMemoryThreadStore`, the runtime
doorway, the handler doorway, the generic app-server client, and `CodexChat` to
prove the public package APIs compose without product-specific host code, Cloudflare, Durable
Objects, React Router, upstream Codex imports, or upstream T3 imports.

### Polished Shell

```tsx
<CodexChatView
  lifecycle={{
    appServer,
    threadId,
    buildTurnStartParams,
  }}
  title={title}
  subtitle={subtitle}
  actions={actions}
/>
```

### Headless

```ts
const chat = useCodexChat({
  threadId,
  appServer,
  threadReader,
});

await chat.sendMessage({ text: "Summarize this thread." });
```

### Composed React

```tsx
<CodexChatProvider appServer={appServer} threadId={threadId} threadReader={threadReader}>
  <CodexThread>
    <CodexMessages />
    <CodexComposer />
  </CodexThread>
</CodexChatProvider>
```

### Presentation Extension

```tsx
<CodexChat
  appServer={appServer}
  threadId={threadId}
  title="Acme"
  renderPendingRequest={({ request, defaultNode, resolve, reject }) => {
    if (request.kind === "dynamicToolCall") {
      return (
        <ProductToolPanel
          request={request}
          onResolve={resolve}
          onReject={reject}
        />
      );
    }
    return defaultNode;
  }}
/>
```

The package owns the default Codex/T3 experience. Applications own product
meaning and extend presentation through slots, not package source edits.

## What You Implement

Applications provide the Codex App Server boundary and product policy:

- `CodexAppServer`: typed `thread/start`, `thread/resume`, `turn/start`,
  `turn/steer`, `turn/interrupt`, request-id resolution, and app-server events.
- `createCodexAppServerRuntime`: the standard runtime harness when the host
  wants package-owned Codex session lifecycle over an app-owned `ThreadStore`,
  model client factory, and event sink.
- `createCodexAppServerClient`: the standard protocol client when the host
  exposes a Codex app-server WebSocket plus an app-owned ticket/auth route.
- `CodexAppServerMessageProcessor`: the standard protocol dispatcher when the
  host accepts generated `ClientRequest` messages and routes them to app-owned
  runtime operations.
- `ThreadReader`: optional store-only read view for headless or fallback paths.
- Parameter builders: optional prompt, tool, cwd, model, sandbox, approval, and
  metadata policy for thread and turn requests.
- Product UI: optional layout sidebar content, banners, actions, pending request
  panels, mention sources, route titles, and product-specific renderers.

The server accepts generated `ClientRequest` JSON-RPC messages, returns typed
Codex responses, emits generated server notifications and server requests on the
same socket, and resolves or rejects `ServerRequest` values by `RequestId`.

Apps may compose the upstream-shaped T3 components directly when they need a full
T3-shaped shell. The package runtime owns chat lifecycle state; route code
should only resolve host context, configure the store and app server, and render
chat.

## Runtime Concepts

- `ThreadStore`: full Codex storage boundary.
- `ThreadReader`: narrow read view used by store-only and headless hooks.
- `LiveThread`: store-backed lifecycle for a single thread.
- `ClientRequest`: Codex App Server client-to-server method envelope.
- `ServerNotification`: Codex App Server server-to-client notification envelope.
- `ServerRequest`: Codex App Server server-to-client request envelope.
- `RequestId`: identity used to resolve or reject server requests.
- `AppServerSession`: typed request-id owner for Codex App Server lifecycle calls.
- `PendingAppServerRequests`: request-id indexed pending UI state for server requests.
- `ThreadEventStore`: protocol-native chat state store for generated app-server snapshots, notifications, and server requests.
- `ThreadEventSnapshot`: immutable protocol-native chat state consumed by hooks and components.
- `createCodexChatRenderState`: component-layer adapter from protocol state into `CodexChatRenderState` for the T3 timeline, composer, banners, and pending request slots.
- `Submission`: Codex core operation envelope used inside runtime/session internals.
- `Event` and `EventMsg`: Codex core runtime event flow used inside runtime and storage internals.
- `RenderedThreadState`: low-level Codex core projection for stored history and core tests.
- `CodexAppServer`: UI-facing Codex App Server boundary for typed requests, notifications, server requests, and request-id resolution.

Cloudflare, Durable Objects, browser storage, local files, routing, credentials,
tools, prompts, and product renderers are implementation choices in consuming
applications or documentation guides. They are not package primitives.

## Host App Integration

The consuming app owns product-specific behavior outside this package:

- branding
- prompts and developer instructions
- dynamic tools
- mention targets
- model defaults
- auth credentials
- route paths
- Durable Object binding names

Host applications pass those choices through runtime, store, app-server,
component, and hook contracts. Product-specific code must not be imported from
package internals.

## Copy-forward Workflow

To reuse this package in another application:

1. Copy `packages/codex-js` into the target repository.
2. Add path aliases for the exported package surfaces.
3. Implement host adapters outside the package.
4. Keep prompts, tools, route mounting, Durable Object bindings, and product
   terminology outside the package.
5. Run the package typecheck and boundary tests before wiring the app UI.

To update from newer upstream sources, use `MIRROR_MAP.md` to locate the matching
Codex or T3 file, port upstream structure and terminology first, then apply only
documented TypeScript, browser, or Cloudflare adaptations.
