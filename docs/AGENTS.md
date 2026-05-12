# codex-js Documentation Guide

The package favors small durable primitives over broad abstractions. A primitive earns its place only when it owns durable state, a clear lifecycle, or a boundary that protects the rest of the system. Useful concepts that do not meet that bar stay as projections, adapters, implementation details, or host-app concerns.

This documentation describes the intended production design of `@jrkropp/codex-js` as a polished Codex runtime and UI kit.

## Core Principles

- Establish durable primitives before implementation details.
- Keep the public model small, standard, and composable.
- Treat `external/codex` as the Codex terminology and lifecycle source of truth.
- Keep publishable package code semantic and boring: `client`, `server`, `testing`, `internal`, `generated`, `components`, `hooks`, and `shadcn`.
- `ThreadStore` is the storage boundary. Product grouping, account boundaries, workspace selection, and deployment placement are not package primitives.
- Runtime delivery follows Codex's server names: `OutgoingMessageSender`, `ThreadScopedOutgoingMessageSender`, `ThreadState`, and `ThreadStateManager`.
- Examples use the public doorways: `CodexChat`, `createCodexAppServerClient`, `createCodexAppServer`, `ThreadStore`, `createModelClient`, and dynamic tool helpers.
- When behavior is wrong or unclear, compare against Codex or T3 first. If local code differs, realign it with the source reference instead of inventing a custom fix.
- Prefer precise names over broad abstractions.
- Separate accepted docs from staged thinking.
- Keep implementation and refactor plans in `plans/`, not in accepted architecture docs.

## Source References

- Codex source reference: `/Users/justinkropp/Github/codex-js/external/codex`
- T3 source reference: `/Users/justinkropp/Github/codex-js/external/t3code`

The `external/` directories are read-only. Do not import from them, edit them, or treat them as package source.

## Writing Style

- Write as if the package already exists in its final production form.
- Accepted docs describe the intended production design, not transient implementation state.
- Use clear, direct, polished prose.
- Avoid TODOs, roadmap placeholders, scaffolding notes, and speculative language.
- Keep implementation sequencing, migration steps, and work breakdowns in `plans/`.
- Keep docs concise enough to guide implementation without becoming design debris.

## Folder Structure

- `packages/codex-js/src/client/`: browser app-server client facade.
- `packages/codex-js/src/server/`: platform-neutral app-server helpers.
- `packages/codex-js/src/testing/`: package and consumer testing utilities.
- `packages/codex-js/src/internal/`: implemented Codex ports and package internals.
- `packages/codex-js/src/generated/`: generated protocol surfaces.
- `packages/codex-js-react/src/components/`: stable public React component surface.
- `packages/codex-js-react/src/hooks/`: stable public React hooks.
- `packages/codex-js-react/src/shadcn/`: shadcn-compatible primitives.
- `start-here/`: short onboarding path for the package model, philosophy, and primitives.
- `architecture/`: accepted architecture notes and deeper system explanations.
- `design/decisions/`: accepted ADR-style decisions.
- `plans/`: implementation plans, refactor plans, audit plans, and execution notes.
- `reference/`: audits, source comparisons, and supporting research.
- `staging/`: exploratory proposals before they become accepted documentation.

## Documentation Process

- Put early thinking in `staging/`.
- Write staged material in the same production-ready style expected of accepted docs.
- Promote staged material only after terminology, primitives, boundaries, and implementation direction are settled.
- When promoting staged material, move it to the proper resting place and make only the edits needed for fit and polish.
- Do not leave half-formed ideas in the permanent docs.
