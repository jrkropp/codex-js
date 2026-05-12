# codex-js Docs

This directory records the package model, architecture, integration surface, accepted design decisions, and engineering plans for `@jrkropp/codex-js`.

Start with [Start Here](./start-here/README.md).

Exploratory proposals live in [Staging](./staging/README.md) until their terminology, primitives, boundaries, and implementation direction are settled.

## Package Source

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

external/
  codex/
  t3code/
```

Publishable source lives in `packages/*/src`. Source reference material lives in
`external/` or `docs/internal/` and is not part of the npm package surface.

## Documentation Areas

- [Architecture](./architecture/README.md): production architecture explanations.
- [Design Decisions](./design/decisions/README.md): accepted ADR-style decisions.
- [Plans](./plans/README.md): implementation and refactor plans.
- [Reference](./reference/README.md): audits, source comparisons, and research.
- [Staging](./staging/README.md): exploratory thinking before acceptance.
