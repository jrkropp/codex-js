# codex-js Docs

This directory records the package model, architecture, integration surface, accepted design decisions, and engineering plans for `@jrkropp/codex-js`.

Start with [Start Here](./start-here/README.md).

Exploratory proposals live in [Staging](./staging/README.md) until their terminology, primitives, boundaries, and implementation direction are settled.

## Package Source

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

The source structure is accepted in [ADR 0001](./design/decisions/0001-package-source-structure.md).

## Documentation Areas

- [Architecture](./architecture/README.md): production architecture explanations.
- [Design Decisions](./design/decisions/README.md): accepted ADR-style decisions.
- [Plans](./plans/README.md): implementation and refactor plans.
- [Reference](./reference/README.md): audits, source comparisons, and research.
- [Staging](./staging/README.md): exploratory thinking before acceptance.
