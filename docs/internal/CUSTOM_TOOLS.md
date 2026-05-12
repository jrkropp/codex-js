# codex-js Custom Tools

Tool calling follows Codex's `core/src/tools` architecture. The package owns
generic tool contracts, specs, routing, and model-facing outputs. Consuming apps
own product-specific tools and register them through adapter boundaries.

## Tool Types

| Type | Use When | Package Ownership |
| --- | --- | --- |
| Built-in handler | The tool is a reusable Codex assistant primitive. | Add a spec helper, handler, `ToolHandlerKind`, and registry-builder mapping. |
| Dynamic tool | The tool belongs to the app or current assistant scope. | App provides `DynamicToolSpec`; package routes calls and waits for app output. |
| Hosted tool | Responses backend owns execution, such as web search or image generation. | Package emits the hosted spec only. |
| MCP tool | The tool comes from an external server or app connector. | MCP manager exposes tools; package routes calls through the MCP boundary. |
| Execution tool | The tool needs local shell or file mutation. | Package exposes safe foundations; a desktop/local executor must implement execution. |

## Adding An App Tool

Use a dynamic tool for app-owned behavior.

1. Define a `DynamicToolSpec` in the consuming app.
2. Give it a stable namespaced `ToolName` using `{ namespace, name }`.
3. Return it from the app's `AssistantToolProvider.dynamicTools(scope)`.
4. Add those specs to the thread/session config layer as `dynamic_tools`.
5. Resolve the call in app-owned browser, Worker, or desktop glue.
6. Return Codex-shaped dynamic tool output content items.

The package must not import the app implementation. The package sees only the
spec, the model-facing tool call, and the app-provided result.

Built-in tool availability belongs in `[tools]` config. Dynamic tools are
runtime tool specs, not package-level feature flags.

## Adding A Package Built-In Tool

Only add a built-in when the tool is reusable assistant infrastructure.

1. Add a handler under `src/upstream/codex-rs/core/src/tools/handlers`.
2. Add a matching spec helper, usually in `*_spec.ts`.
3. Add a `ToolHandlerKind` variant in `spec_plan_types.ts`.
4. Add the spec and handler kind in `build_tool_registry_plan`.
5. Register the handler in `build_specs_with_discoverable_tools`.
6. Return a `ToolOutput` that serializes to the correct Responses input item.
7. Add registry, router, and runtime tests.

This mirrors Codex's path through `spec_plan`, `spec`, `registry`, `router`, and
`context`.

## Discoverability

Tools that should not be shown in the primary model-visible tool list can be
deferred and surfaced through `tool_search`.

- Deferred dynamic tools use `DynamicToolSpec.defer_loading`.
- Deferred MCP tools are passed as deferred MCP planning input.
- `tool_search` returns Codex-shaped entries with name, title, description,
  source, and input schema.

## Boundary Rules

- Product prompts, storage keys, route paths, scope kinds, and concrete tool
  implementations stay in the consuming app.
- The package owns generic Codex naming, file structure, handler contracts, and
  output serialization.
- Arbitrary shell execution is never added directly to Cloudflare Workers.
