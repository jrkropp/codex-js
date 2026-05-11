# 0001 Package Source Structure

Status: accepted

## Context

`@jrkropp/codex-js` is a Codex runtime and UI kit. The package needs a source layout that makes upstream source trees obvious, keeps package-owned runtime code separate, and lets consuming applications extend behavior without editing package source.

Codex and T3 are source references. Their folder structure, naming, concepts, classes, contracts, and lifecycle boundaries are preserved as closely as practical so updates can be ported by comparing the corresponding source files.

## Decision

The package source is organized around upstream source trees, a package-owned runtime, React components, React hooks, and testing utilities.

```text
src/
  upstream/
    codex-rs/
    t3code/

  runtime/
  components/
  hooks/
  testing/
```

`src/upstream/codex-rs` is the Codex-shaped runtime upstream source. `src/upstream/t3code` is the T3-shaped chat UI upstream source. Code in these trees follows upstream names, file boundaries, contracts, and lifecycle patterns.

`src/runtime` contains package-owned, platform-neutral Codex lifecycle code and contracts. It does not depend on React, routing, Cloudflare, Durable Objects, host application projects, or host-app business behavior.

`src/components` contains the stable public React component surface built from the T3 upstream source. Developers import application-facing chat components from `components` rather than from the upstream tree.

`src/hooks` contains the stable public React hooks that bind a configured runtime to React applications. Hooks stay separate from components so developers can use the runtime with their own UI.

`src/testing` contains test utilities and lightweight helpers for package consumers and package tests.

Platform-specific implementation details are not source primitives. Cloudflare Workers, Durable Objects, browser storage, routing, credentials, tools, prompts, and product-specific renderers live in consuming applications or documentation guides.

## Consequences

Upstream-shaped code is visually isolated from package-owned code. Package-owned abstractions stay outside the upstream trees.

The package remains replaceable. Consuming applications extend behavior through composition, contracts, slots, renderers, tools, prompts, storage, and app-server boundaries instead of modifying package source.

A Durable Object is one possible implementation of a Codex store and app-server boundary. It is not a primitive of the Codex assistant package.

When behavior is wrong or unclear, the first step is to compare against Codex or T3 and realign the package with the corresponding source reference.
