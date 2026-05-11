# System Tour

`@jrkropp/codex-js` is a portable Codex runtime and T3-shaped
chat UI kit. It is not a host application package, a Cloudflare package, or a React
Router package. host application is one consuming application that proves the
package boundary.

## Layers

The package has four layers:

| Layer | Responsibility |
| --- | --- |
| `src/upstream/codex-rs` | Codex runtime, thread store, protocol, tools, model transport, and app-server protocol primitives. |
| `src/upstream/t3code` | T3Chat composer, timeline, model picker, image previews, command menus, and chat interaction helpers. |
| `src/runtime` | Package-owned Codex lifecycle contracts, app-server boundary, store boundary, and route-neutral protocol state. |
| `src/components` and `src/hooks` | Stable React surfaces that bind Codex protocol state to T3-derived chat presentation. |

Codex source defines runtime semantics. T3 source defines browser interaction
ownership. The package facades connect the two without letting product behavior
leak into either upstream-shaped tree.

## Runtime Flow

The app server runs Codex. The store remembers Codex. The UI renders Codex.

```text
host app
  -> CodexAppServer JSON-RPC WebSocket ClientRequest
  -> package runtime request processors
  -> Codex Session and ThreadStore
  -> generated ServerNotification or ServerRequest
  -> ThreadEventStore
  -> CodexChatRenderState
  -> T3 timeline and composer
```

Core `EventMsg` values stay inside Codex runtime and stored history. Browser UI
uses generated app-server protocol values over one app-server connection:
`ClientRequest`, typed responses, `Thread`, `Turn`, `ThreadItem`,
`ServerNotification`, `ServerRequest`, and `RequestId`.

## Host Integration

A consuming app provides product policy and platform placement:

- storage implementation for `ThreadStore` or a remote app-server WebSocket
- credentials and model-client creation
- prompts, developer instructions, dynamic tools, and scopes
- routes, auth, deployment, WebSocket delivery, and product renderers

host application supplies those pieces from its app folders. The package never
imports host application routes, domains, Worker bindings, storage keys, prompts, or
branding.

## Public Doorways

Most integrations should enter through the public surfaces:

- `@jrkropp/codex-js/server`
- `@jrkropp/codex-js/react`
- `@jrkropp/codex-js/react`

The package root is intentionally small and only exposes the plug-and-play chat
component entrypoint. Runtime, hook, component, Codex mirror, and T3 mirror APIs
stay on their explicit subpaths.

The upstream-shaped Codex and T3 import paths remain available for low-level
adapter work, tests, and source-parity updates. Product UI should prefer the
public facades unless it is intentionally bridging into a specific upstream
primitive.
