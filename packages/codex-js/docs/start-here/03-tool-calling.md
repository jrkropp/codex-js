# Tool Calling

Codex treats tools as runtime affordances. A tool definition tells the model what
capability exists. A tool call is the model choosing that capability during a
turn. A tool result is the runtime feeding the outside-world result back into
the next model step.

The package keeps those responsibilities separate:

```text
App-owned tool specs
  -> ToolRouter
  -> visible tools or tool_search
  -> model tool call
  -> ServerRequest item/tool/call
  -> app-owned execution
  -> RequestId resolution
  -> function_call_output for the model
```

## Dynamic Tools

Dynamic tools are app-owned capabilities. The package owns discovery, protocol,
request identity, and model-loop reinjection. The application owns business
execution, credentials, policy, permissions, and product data.

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

Visible tools use `defer_loading: false`. Codex includes their definitions in
the model request's `tools` list.

Deferred tools use `defer_loading: true`. Codex keeps them registered in the
runtime, excludes them from the ordinary model-facing tool list, and makes them
discoverable through `tool_search`.

## Tool Search

`tool_search` is a client-executed Codex tool. Codex exposes it when deferred
dynamic or MCP tools are available. The model supplies a query; Codex searches
tool metadata with BM25 and returns matching loadable tool specs.

Codex indexes metadata, not embeddings:

```text
tool name
tool name with underscores expanded
namespace
description
input schema property names
```

For example, `billing.refund_invoice` is searchable by `billing`, `refund`,
`invoice`, `reason`, and any meaningful words in the description.

## Hosted Web Search

Web search is a hosted Responses API tool. Codex controls it with top-level
`web_search` config and refines it with `[tools.web_search]`.

```toml
web_search = "cached"

[tools.web_search]
context_size = "high"
allowed_domains = ["openai.com", "platform.openai.com"]

[tools.web_search.location]
country = "US"
region = "CA"
city = "San Francisco"
timezone = "America/Los_Angeles"
```

The effective default is `cached`. Cached search sends `web_search` with
`external_web_access: false`; live search sends it with
`external_web_access: true`; disabled search omits the hosted tool. Boolean
`[tools].web_search` values are accepted as legacy no-op payloads and do not
enable or disable the tool.

Web search is not a dynamic tool. It does not emit `ServerRequest`, does not use
`RequestId`, and does not ask for per-call approval. Search activity appears as
normal generated thread items such as `ThreadItem.webSearch`, which T3 renders
as passive work-log activity.

## App-Owned Execution

When the model calls an app-owned dynamic tool, Codex emits a generated
app-server request:

```ts
{
  id: "req_17",
  method: "item/tool/call",
  params: {
    threadId: "thread_123",
    turnId: "turn_abc",
    callId: "call_refund_1",
    namespace: "billing",
    tool: "refund_invoice",
    arguments: {
      invoiceId: "INV-1001",
      reason: "Customer was double charged",
    },
  },
}
```

The app handles the business action and resolves the request by `RequestId`:

```ts
async function handleServerRequest(request: ServerRequest) {
  if (
    request.method === "item/tool/call" &&
    request.params.namespace === "billing" &&
    request.params.tool === "refund_invoice"
  ) {
    const refund = await billing.refundInvoice(request.params.arguments);

    await appServer.resolveServerRequest(request.id, {
      contentItems: [
        {
          type: "inputText",
          text: JSON.stringify(refund),
        },
      ],
      success: true,
    });
  }
}
```

`RequestId` and `call_id` have different jobs:

```text
RequestId: app-server request correlation
call_id: model/tool-loop correlation
```

The browser, server, and UI resolve or reject `ServerRequest` values by
`RequestId`. Codex uses `call_id` internally to attach the tool result to the
model's original function call.

## User Feedback Requests

`request_user_input` is a Codex tool. The model calls it during a turn when it
needs the user to answer a small set of structured questions. Codex emits the
request through the app-server protocol, and T3 renders it as composer state:

```text
request_user_input tool
  -> EventMsg::RequestUserInput
  -> ServerRequest item/tool/requestUserInput
  -> pending composer input
  -> resolveServerRequest(RequestId, ToolRequestUserInputResponse)
```

The app-server request keeps protocol identity and tool identity separate:

```ts
{
  id: "req_21",
  method: "item/tool/requestUserInput",
  params: {
    threadId: "thread_123",
    turnId: "turn_abc",
    itemId: "call_plan_questions",
    questions: [
      {
        id: "direction",
        header: "Direction",
        question: "Which direction should Codex explore first?",
        options: [
          {
            label: "Small patch (Recommended)",
            description: "Keep the change narrowly scoped.",
          },
          {
            label: "Full refactor",
            description: "Rework the full module now.",
          },
        ],
        isOther: true,
        isSecret: false,
      },
    ],
  },
}
```

The UI resolves by `RequestId`. `params.itemId` is the model/tool item id and is
not used as the app-server request identity.

```tsx
<CodexChat
  appServer={appServer}
  threadId={threadId}
  renderPendingUserInput={({ request, defaultNode, resolve }) => {
    if (request.pendingUserInput.questions[0]?.id === "direction") {
      return (
        <DecisionPanel
          request={request.pendingUserInput}
          onSubmit={(response) => resolve(response)}
        />
      );
    }
    return defaultNode;
  }}
/>
```

The default package UI renders `request_user_input` inside the composer. Apps
customize presentation through `renderPendingUserInput`; they do not create a
custom protocol or resolve by tool `call_id`.

## Plan Mode

Plan Mode uses the same tool and protocol boundaries. Codex injects Plan Mode
collaboration instructions into the turn context, the model can call
`request_user_input` to collect structured feedback, and final plan content is
emitted inside `<proposed_plan>` blocks. The Codex turn loop strips those blocks
from normal assistant text and emits generated `Plan` item notifications.

```text
Plan collaboration mode
  -> request_user_input when more direction is needed
  -> <proposed_plan> final plan markdown </proposed_plan>
  -> item/plan/delta and completed ThreadItem.Plan
  -> T3 ProposedPlanCard
```

`CodexChat` can expose the T3-shaped Build/Plan toggle:

```tsx
<CodexChat
  appServer={appServer}
  threadId={threadId}
  showInteractionModeToggle
  defaultInteractionMode="plan"
/>
```

Applications keep product behavior at the component edge. A custom app can
listen for proposed-plan actions, route implementation into a product workflow,
or keep the default T3 behavior that sends `PLEASE IMPLEMENT THIS PLAN:` back to
Codex.

## UI Extension

Applications customize tool UX through component slots. The default chat surface
can render a product-specific confirmation panel for mutating tools without
editing package source.

```tsx
<CodexChat
  appServer={appServer}
  threadId={threadId}
  renderPendingRequest={({ request, defaultNode, resolve, reject }) => {
    if (
      request.kind === "dynamicToolCall" &&
      request.request.params.namespace === "billing" &&
      request.request.params.tool === "refund_invoice"
    ) {
      return (
        <RefundApprovalPanel
          request={request}
          onApprove={(result) => resolve(result)}
          onReject={() => reject("Refund rejected by the application.")}
        />
      );
    }
    return defaultNode;
  }}
/>
```

This is the core extension model: Codex owns the turn loop and protocol; the app
owns product meaning.
