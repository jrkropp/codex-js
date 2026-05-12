# 0001 Package Source Structure

Status: accepted

## Context

The workspace publishes a core Codex SDK and a separate React UI package. The
source layout should look like a conventional npm workspace, not like an
extracted application or a public mirror of reference repositories.

Codex remains the terminology and runtime source of truth, but reference
material belongs outside publishable package source.

## Decision

The workspace uses two packages:

```text
packages/
  codex-js/
    src/client/
    src/server/
    src/testing/
    src/internal/
    src/generated/

  codex-js-react/
    src/components/
    src/hooks/
    src/shadcn/
    src/styles.css
```

`packages/codex-js` is dependency-light and non-React. It owns browser client
helpers, platform-neutral app-server helpers, runtime contracts, store
contracts, model-client creation, dynamic tool mapping, and testing utilities.

`packages/codex-js-react` owns React components, hooks, shadcn-compatible
primitives, generated CSS, and React-only dependencies.

Reference and parity material lives in `external/`, `reference/`, or
`docs/internal/`. It is not exposed through package exports or included in npm
tarballs.

## Consequences

Public imports are boring and semantic. Consumers use `/client`, `/server`,
`/testing`, the React package root, `/shadcn`, and `/styles.css`.

Cloudflare Workers, Durable Objects, local files, databases, credentials, auth,
prompts, and product-specific tools remain host application concerns.

When behavior is wrong or unclear, compare against Codex terminology and
lifecycle concepts, then implement the package-facing API in the conventional
package folders.
