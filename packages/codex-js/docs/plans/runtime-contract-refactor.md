# Runtime Contract Refactor Plan

This plan aligns the package implementation with the accepted public runtime contract.

## Summary

The runtime layer uses Codex primitives directly. The React layer provides ergonomic components and hooks without becoming a second runtime model. Host applications configure stores, transports, prompts, tools, auth, routing, product renderers, and deployment outside the package.

## Runtime

- Make `@jrkropp/codex-js/server` the canonical runtime import surface.
- Re-export Codex-native types from runtime: `ThreadStore`, `LiveThread`, `Submission`, `Event`, `EventMsg`, `Op`, `RolloutItem`, `UserInput`, `ThreadHistoryBuilder`, and `RenderedThreadState`.
- Replace store-addressing runtime options with configured store and transport options. Product grouping is represented by the store instance supplied by the consuming app.
- Rename `CodexAssistantOptions` to package-name-neutral runtime and React option types.

## Transport

- Shape transport around Codex dispatch semantics: `submit`, `subscribe`, and `stop`.
- Keep friendly `sendMessage` helpers in hooks or components where text input is converted into a Codex `Submission`.
- Keep Cloudflare, Durable Object, browser storage, and local file examples outside the runtime primitive set.

## Components And Hooks

- Keep T3-shaped lifecycle ownership in `components` and `hooks`: optimistic user rows, local dispatch snapshots, send guard, draft promotion timing, composer draft handoff, scroll pinning, and rendered timeline coordination.
- Ensure `<CodexChat store={store} transport={transport} />` works without React Router, Cloudflare, Durable Object terminology, host application project terminology, or T3 upstream source imports.
- Ensure `useCodexChat` supports headless custom UI while still returning Codex-shaped thread state and ergonomic send/stop actions.

## Documentation

- Present plug-and-play, headless, local file-backed, and Cloudflare Durable Object examples as consumer integrations.
- Describe Cloudflare as one implementation of store and transport boundaries.
- Keep docs explicit that package source is replaceable and consuming apps extend through composition, not package source edits.

## Test Plan

- Update package boundary tests so canonical exports include `/runtime`, `/components`, and `/hooks`.
- Add runtime tests showing configured stores work without React Router, Cloudflare, or host application product concepts.
- Add hook/component tests showing friendly message input becomes a Codex `Submission`.
- Add examples or tests for local, Cloudflare, headless, and plug-and-play usage that import only canonical public surfaces.
- Keep boundary tests proving Codex and T3 upstream-shaped paths remain available for advanced use.

## Acceptance Criteria

- A developer can understand the package through three import paths: `runtime`, `components`, and `hooks`.
- Runtime docs use Codex terms for durable lifecycle concepts.
- React docs use T3-shaped lifecycle language for chat interaction ownership.
- No core runtime API requires product grouping, routes, Durable Objects, or host application-specific concepts.
- Product-specific tools, prompts, auth, storage, routing, renderers, and deployment remain outside package source.
