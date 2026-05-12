# System Tour

`@jrkropp/codex-js` is a portable Codex runtime SDK.
`@jrkropp/codex-js-react` is the React UI package. Neither package is a host
application, a Cloudflare package, or a React Router package.

## Layers

The workspace has four layers:

| Layer                            | Responsibility                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/codex-js/src/client`   | Browser app-server WebSocket client and protocol event helpers.                                   |
| `packages/codex-js/src/server`   | App-server runtime helpers, connection bridge, stores, model transport, and dynamic tool helpers. |
| `packages/codex-js/src/internal` | Implemented Codex ports and package internals.                                                    |
| `packages/codex-js-react/src`    | Stable React components, hooks, shadcn primitives, and CSS.                                       |

Codex source defines runtime semantics. The package facades expose those
semantics without leaking product behavior or reference-source layout into npm
imports.

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

The host application supplies those pieces from its app folders. The package never
imports host application routes, domains, Worker bindings, storage keys, prompts, or
branding.

## Public Doorways

Most integrations should enter through the public surfaces:

- `@jrkropp/codex-js/server`
- `@jrkropp/codex-js/client`
- `@jrkropp/codex-js/testing`
- `@jrkropp/codex-js-react`
- `@jrkropp/codex-js-react/shadcn`
- `@jrkropp/codex-js-react/styles.css`

The package roots are intentionally small. Reference-source and mirror material
is not a public import surface.
