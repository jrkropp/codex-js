---
"@jrkropp/codex-js": patch
---

Polish the npm package contract by limiting stable exports to the root, client, server, react, shadcn, testing, and styles surfaces; moving upstream Codex and T3 mirrors under explicit unstable subpaths; splitting browser and runtime build targets; documenting npm consumer setup; and adding packed consumer checks for server and Vite React usage.
