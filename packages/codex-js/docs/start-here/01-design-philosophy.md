# Design Philosophy

The core design rule is simple:

```text
Codex owns runtime truth.
T3 owns interaction quality.
The host app owns product meaning.
```

This avoids a custom product-specific chat runtime. The package preserves Codex
concepts for execution and persistence while using T3-shaped components for the
browser chat experience.

## Upstream First

The upstream source trees are the maintenance strategy. File names, folder
boundaries, protocol names, and lifecycle concepts stay close to Codex and T3 so
future source drops can be compared and ported directly.

Package-owned abstractions live outside the upstream trees. If a behavior is
product-specific, expose a contract, prop, renderer, tool, prompt, or adapter
slot instead of editing upstream-shaped package code.

## Boundaries Over Abstractions

The package avoids generic "chat" abstractions where Codex already has precise
terms. `ThreadStore`, `LiveThread`, `Session`, `Submission`, `EventMsg`,
`RolloutItem`, `CodexAppServer`, `ServerRequest`, and `RequestId` carry
runtime meaning and make upstream parity easier to preserve.

React ergonomics are allowed at the component edge. `CodexChat`,
`CodexChatView`, and `useCodexChat` provide approachable APIs, but they all
reduce the same protocol-native lifecycle state. They do not create a second
runtime model.

## Product Isolation

Host applications own the parts that make an assistant product-specific:

- prompts and developer instructions
- dynamic tool specs and execution
- account and credential policy
- route paths and draft routing
- storage placement and deployment
- product actions, banners, mentions, and custom renderers

Those choices enter through stable package contracts. They do not belong in
`src/upstream/codex-rs`, `src/upstream/t3code`, or package runtime internals.

## Current Truth

The browser-facing chat contract is generated Codex app-server protocol.
`EventMsg` remains a core runtime and storage primitive; it is not the React UI
wire contract. `ThreadEventStore` reduces generated protocol snapshots,
notifications, and server requests before T3 presentation code renders them.
