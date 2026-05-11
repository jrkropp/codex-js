# codex-js Documentation Guide

The package favors small durable primitives over broad abstractions. A primitive earns its place only when it owns durable state, a clear lifecycle, or a boundary that protects the rest of the system. Useful concepts that do not meet that bar stay as projections, adapters, implementation details, or host-app concerns.

This documentation describes the intended production design of `@jrkropp/codex-js` as a polished Codex runtime and UI kit.

## Core Principles

- Establish durable primitives before implementation details.
- Keep the public model small, standard, and composable.
- Treat `src/upstream/codex-rs` as a Codex-shaped upstream source and `src/upstream/t3code` as a T3-shaped upstream source. Codex and T3 are proven source references; follow their folder structure, naming, concepts, classes, contracts, and lifecycle patterns as closely as practical.
- Keep package-owned abstractions outside the upstream trees.
- `ThreadStore` is the storage boundary. Product grouping, account boundaries, workspace selection, and deployment placement are not package primitives.
- Runtime delivery follows Codex's server names: `OutgoingMessageSender`, `ThreadScopedOutgoingMessageSender`, `ThreadState`, and `ThreadStateManager`.
- Examples use the public doorways: `CodexChat`, `createCodexAppServerClient`, `CodexAppServerMessageProcessor`, `createCodexAppServerRuntime`, `ThreadStore`, `createModelClient`, and `sendOutgoingMessage`.
- When behavior is wrong or unclear, compare against Codex or T3 first. If local code differs, realign it with the source reference instead of inventing a custom fix.
- Prefer precise names over broad abstractions.
- Separate accepted docs from staged thinking.
- Keep implementation and refactor plans in `plans/`, not in accepted architecture docs.

## Source References

- Codex source reference: `/Users/justinkropp/Github/host-app/external/codex`
- T3 source reference: `/Users/justinkropp/Github/host-app/external/t3code`
- Package Codex upstream source: `/Users/justinkropp/Github/host-app/packages/codex-js/src/upstream/codex-rs`
- Package T3 upstream source: `/Users/justinkropp/Github/host-app/packages/codex-js/src/upstream/t3code`

The `external/` directories are read-only. Do not import from them, edit them, or treat them as package source.

## Writing Style

- Write as if the package already exists in its final production form.
- Accepted docs describe the intended production design, not transient implementation state.
- Use clear, direct, polished prose.
- Avoid TODOs, roadmap placeholders, scaffolding notes, and speculative language.
- Keep implementation sequencing, migration steps, and work breakdowns in `plans/`.
- Keep docs concise enough to guide implementation without becoming design debris.

## Folder Structure

- `src/upstream/codex-rs/`: Codex-shaped upstream source tree.
- `src/upstream/t3code/`: T3-shaped upstream source tree.
- `src/runtime/`: platform-neutral Codex lifecycle code and contracts.
- `src/components/`: stable public React component surface.
- `src/hooks/`: stable public React hooks.
- `src/testing/`: package and consumer testing utilities.
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
