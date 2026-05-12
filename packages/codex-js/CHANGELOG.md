# @jrkropp/codex-js

## 0.2.0

### Minor Changes

- [#1](https://github.com/jrkropp/codex-js/pull/1) [`de7d669`](https://github.com/jrkropp/codex-js/commit/de7d669f6c922c2abb4cedb6c4c822f87b6a2f2b) Thanks [@jrkropp](https://github.com/jrkropp)! - Restructure codex-js into a standard two-package workspace. `@jrkropp/codex-js` now owns the non-React runtime, client, server, and testing surfaces, while `@jrkropp/codex-js-react` owns the React components, shadcn-compatible exports, and generated stylesheet.

## 0.1.4

Expose the full React chat lifecycle helper surface from the public React subpath.

## 0.1.3

Expose deliberate low-level Codex and T3 mirror subpaths so host adapters can migrate off the vendored workspace package.

## 0.1.2

Expose the complete Codex runtime surface from the public server subpath for host adapters.

## 0.1.1

Initial visible public extraction of the unofficial TypeScript Codex runtime.
