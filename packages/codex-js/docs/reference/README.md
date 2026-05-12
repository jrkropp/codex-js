# Reference

Reference material, audits, source comparisons, and supporting research live here.

Unchecked upstream source trees do not belong in this docs folder. Keep them in
the repo-root `external/` directory instead, ideally synced by:

```bash
pnpm external:sync --codex /path/to/codex --t3 /path/to/t3-chat
```

That keeps the reference source available for parity work without checking
vendor copies into git history.
