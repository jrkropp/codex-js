# @jrkropp/codex-js-react

## 0.3.0

### Minor Changes

- Update the React package docs and examples around the split package model,
  generated stylesheet import, and Cloudflare example integration path.

### Patch Changes

- Updated dependencies:
  - @jrkropp/codex-js@0.3.0

## 0.2.1

### Patch Changes

- [#6](https://github.com/jrkropp/codex-js/pull/6) [`cddb1ce`](https://github.com/jrkropp/codex-js/commit/cddb1ce1f0c021b8ff79a08a6ce9bb8ae69048d7) Thanks [@jrkropp](https://github.com/jrkropp)! - Replace the package's internal workspace dependency with a publishable semver range so npm consumers can install the React package from the registry.

## 0.2.0

### Minor Changes

- [#1](https://github.com/jrkropp/codex-js/pull/1) [`de7d669`](https://github.com/jrkropp/codex-js/commit/de7d669f6c922c2abb4cedb6c4c822f87b6a2f2b) Thanks [@jrkropp](https://github.com/jrkropp)! - Restructure codex-js into a standard two-package workspace. `@jrkropp/codex-js` now owns the non-React runtime, client, server, and testing surfaces, while `@jrkropp/codex-js-react` owns the React components, shadcn-compatible exports, and generated stylesheet.

### Patch Changes

- Updated dependencies [[`de7d669`](https://github.com/jrkropp/codex-js/commit/de7d669f6c922c2abb4cedb6c4c822f87b6a2f2b)]:
  - @jrkropp/codex-js@0.2.0

## 0.1.4

Initial React package extracted from `@jrkropp/codex-js`.
