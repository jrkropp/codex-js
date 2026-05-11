# External Upstream Sources

This directory is intentionally gitignored.

Use it for local, unchecked copies of upstream source trees that guide
the mirrors in `packages/codex-js/src/upstream`.

Expected layout:

```text
external/
  README.md
  codex/
  t3code/
```

The package currently expects:

- `external/codex/codex-rs`
- `external/t3code/apps/web`

Recommended workflow:

```bash
pnpm external:sync --codex /absolute/path/to/codex --t3 /absolute/path/to/t3-chat
```

That copies upstream source into `external/` so the mirror tooling can work
without depending on live symlinks.

Rules:

- Do not import runtime code from `external/`.
- Use `external/` only for human comparison, mirror generation, and parity work.
- Keep product code in `packages/codex-js/src`.
