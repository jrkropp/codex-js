# codex-js Upstream Map

This map records the upstream source locations that guide package structure.
Use it when updating from a newer Codex or T3Chat source drop.

## Codex Runtime

| Package Path | Upstream Reference |
| --- | --- |
| `src/upstream/codex-rs/core/src/session/session.ts` | `external/codex/codex-rs/core/src/session/session.rs` |
| `src/upstream/codex-rs/core/src/session/turn-context.ts` | `external/codex/codex-rs/core/src/session/turn_context.rs` |
| `src/upstream/codex-rs/core/src/session/rollout-reconstruction.ts` | `external/codex/codex-rs/core/src/session/rollout_reconstruction.rs` |
| `src/upstream/codex-rs/core/src/client.ts` | `external/codex/codex-rs/core/src/client.rs` |
| `src/upstream/codex-rs/core/src/agent` | `external/codex/codex-rs/core/src/agent` |
| `src/upstream/codex-rs/core/src/tools/handlers/multi_agents.ts` | `external/codex/codex-rs/core/src/tools/handlers/multi_agents.rs` |
| `src/upstream/codex-rs/core/src/tools/handlers/agent_jobs*` | `external/codex/codex-rs/core/src/tools/handlers/agent_jobs*` |
| `src/upstream/codex-rs/core/src/tasks/mod.ts` | `external/codex/codex-rs/core/src/tasks/mod.rs` |
| `src/upstream/codex-rs/core/src/tasks/regular.ts` | `external/codex/codex-rs/core/src/tasks/regular.rs` |
| `src/upstream/codex-rs/core/src/tasks/compact.ts` | `external/codex/codex-rs/core/src/tasks/compact.rs` |
| `src/upstream/codex-rs/core/src/context` | `external/codex/codex-rs/core/src/context` |
| `src/upstream/codex-rs/core/src/context-manager` | `external/codex/codex-rs/core/src/context_manager` |
| `src/upstream/codex-rs/config/src/config_toml.ts` | `external/codex/codex-rs/config/src/config_toml.rs` |
| `src/upstream/codex-rs/config/src/profile_toml.ts` | `external/codex/codex-rs/config/src/profile_toml.rs` |
| `src/upstream/codex-rs/config/src/thread_config.ts` | `external/codex/codex-rs/config/src/thread_config.rs` |
| `src/upstream/codex-rs/config/src/merge.ts` | `external/codex/codex-rs/config/src/merge.rs` |
| `src/upstream/codex-rs/protocol/src/prompts/base_instructions/default.md` | `external/codex/codex-rs/protocol/src/prompts/base_instructions/default.md` |
| `src/upstream/codex-rs/core/src/config/mod.ts` | `external/codex/codex-rs/core/src/config/mod.rs` |
| `src/upstream/codex-rs/core/src/config/permissions.ts` | `external/codex/codex-rs/core/src/config/permissions.rs` |
| `src/upstream/codex-rs/core/templates` | `external/codex/codex-rs/core/templates` |
| `src/upstream/codex-rs/core/templates/model_instructions` | `external/codex/codex-rs/core/templates/model_instructions` |
| `src/upstream/codex-rs/core/src/tools` | `external/codex/codex-rs/core/src/tools` |
| `src/upstream/codex-rs/core/src/tools/spec.ts` | `external/codex/codex-rs/core/src/tools/spec.rs` |
| `src/upstream/codex-rs/core/src/tools/spec_plan.ts` | `external/codex/codex-rs/core/src/tools/spec_plan.rs` |
| `src/upstream/codex-rs/core/src/tools/spec_plan_types.ts` | `external/codex/codex-rs/core/src/tools/spec_plan_types.rs` |
| `src/upstream/codex-rs/core/src/tools/tool_search_entry.ts` | `external/codex/codex-rs/core/src/tools/tool_search_entry.rs` |
| `src/upstream/codex-rs/core/src/tools/tool_dispatch_trace.ts` | `external/codex/codex-rs/core/src/tools/tool_dispatch_trace.rs` |
| `src/upstream/codex-rs/core/src/tools/network_approval.ts` | `external/codex/codex-rs/core/src/tools/network_approval.rs` |
| `src/upstream/codex-rs/core/src/tools/runtimes` | `external/codex/codex-rs/core/src/tools/runtimes` |
| `src/upstream/codex-rs/core/src/tools/handlers/dynamic.ts` | `external/codex/codex-rs/core/src/tools/handlers/dynamic.rs` |
| `src/upstream/codex-rs/core/src/tools/handlers/tool_search.ts` | `external/codex/codex-rs/core/src/tools/handlers/tool_search.rs` |
| `src/upstream/codex-rs/core/src/tools/handlers/tool_search_spec.ts` | `external/codex/codex-rs/core/src/tools/handlers/tool_search_spec.rs` |
| `src/upstream/codex-rs/core/src/tools/handlers/apply_patch.ts` | `external/codex/codex-rs/core/src/tools/handlers/apply_patch.rs` |
| `src/upstream/codex-rs/core/src/tools/handlers/apply_patch_spec.ts` | `external/codex/codex-rs/core/src/tools/handlers/apply_patch_spec.rs` |
| `src/upstream/codex-rs/core/src/tools/handlers/unified_exec` | `external/codex/codex-rs/core/src/tools/handlers/unified_exec` |
| `src/upstream/codex-rs/core/src/tools/handlers/mcp_resource*` | `external/codex/codex-rs/core/src/tools/handlers/mcp_resource*` |
| `src/upstream/codex-rs/core/src/tools/handlers/plan*` | `external/codex/codex-rs/core/src/tools/handlers/plan*` |
| `src/upstream/codex-rs/core/src/tools/handlers/view_image*` | `external/codex/codex-rs/core/src/tools/handlers/view_image*` |
| `src/upstream/codex-rs/core/src/tools/handlers/request_plugin_install*` | `external/codex/codex-rs/core/src/tools/handlers/request_plugin_install*` |
| `src/upstream/codex-rs/core/src/tools/code_mode` | `external/codex/codex-rs/core/src/tools/code_mode` |
| `src/upstream/codex-rs/core/src/tools/handlers/goal_spec.ts` | `external/codex/codex-rs/core/src/tools/handlers/goal_spec.rs` |
| `src/upstream/codex-rs/core/src/event-mapping.ts` | `external/codex/codex-rs/core/src/event_mapping.rs` |
| `src/upstream/codex-rs/core/src/thread-history-builder.ts` | `external/codex/codex-rs/app-server/src/thread_state.rs` and thread history projection code |
| `src/upstream/codex-rs/thread-store/src` | `external/codex/codex-rs/thread-store/src` |
| `src/upstream/codex-rs/codex-api/src/endpoint/responses.ts` | `external/codex/codex-rs/codex-api/src/endpoint/responses.rs` |
| `src/upstream/codex-rs/codex-api/src/endpoint/responses_websocket.ts` | `external/codex/codex-rs/codex-api/src/endpoint/responses_websocket.rs` |
| `src/upstream/codex-rs/codex-api/src/requests/responses.ts` | `external/codex/codex-rs/codex-api/src/requests/responses.rs` |
| `src/upstream/codex-rs/codex-api/src/sse/responses.ts` | `external/codex/codex-rs/codex-api/src/sse/responses.rs` |
| `src/upstream/codex-rs/codex-api/src/provider.ts` | `external/codex/codex-rs/codex-api/src/provider.rs` |
| `src/upstream/codex-rs/codex-api/src/rate_limits.ts` | `external/codex/codex-rs/codex-api/src/rate_limits.rs` |
| `src/upstream/codex-rs/model-provider/src` | `external/codex/codex-rs/model-provider/src` |
| `src/upstream/codex-rs/models-manager/src` | `external/codex/codex-rs/models-manager/src` |
| `src/upstream/codex-rs/app-server-protocol/schema/typescript` | `external/codex/codex-rs/app-server-protocol/schema/typescript` |
| `src/upstream/codex-rs/app-server-protocol/src/protocol/common.ts` | `external/codex/codex-rs/app-server-protocol/src/protocol/common.rs` |
| `src/upstream/codex-rs/app-server-protocol/src/protocol/event-mapping.ts` | `external/codex/codex-rs/app-server-protocol/src/protocol/event_mapping.rs` |
| `src/upstream/codex-rs/app-server/src/connection_rpc_gate.ts` | `external/codex/codex-rs/app-server/src/connection_rpc_gate.rs` |
| `src/upstream/codex-rs/app-server/src/message_processor.ts` | `external/codex/codex-rs/app-server/src/message_processor.rs` |
| `src/upstream/codex-rs/app-server/src/request_serialization.ts` | `external/codex/codex-rs/app-server/src/request_serialization.rs` |
| `src/upstream/codex-rs/app-server/src/runtime.ts` | TypeScript app-server runtime composition over Codex message processor, request processors, thread state, and session/task orchestration |
| `src/upstream/codex-rs/app-server/src/server_request_response.ts` | TypeScript server-request response translation helper for Codex submissions |
| `src/upstream/codex-rs/app-server/src/session_factory.ts` | TypeScript adaptation of Codex thread/session creation boundaries from `external/codex/codex-rs/core/src/thread_manager.rs` and `core/src/session/session.rs` |
| `src/upstream/codex-rs/app-server/src/session_task_runner.ts` | TypeScript adaptation of Codex task execution boundaries from `external/codex/codex-rs/core/src/tasks` and `core/src/session/turn.rs` |
| `src/upstream/codex-rs/app-server/src/thread_state.ts` | `external/codex/codex-rs/app-server/src/thread_state.rs` |
| `src/upstream/codex-rs/app-server/src/transport.ts` | `external/codex/codex-rs/app-server/src/transport.rs` |
| `src/upstream/codex-rs/app-server-transport/src/outgoing_message.ts` | `external/codex/codex-rs/app-server-transport/src/outgoing_message.rs` |
| `src/upstream/codex-rs/app-server-transport/src/transport/mod.ts` | `external/codex/codex-rs/app-server-transport/src/transport/mod.rs` |
| `src/upstream/codex-rs/app-server-client/src/lib.ts` | `external/codex/codex-rs/app-server-client/src/lib.rs` |
| `src/upstream/codex-rs/app-server-client/src/remote.ts` | `external/codex/codex-rs/app-server-client/src/remote.rs` |
| `src/upstream/codex-rs/app-server-client/src/session.ts` | TypeScript typed session helper for generated app-server requests |
| `src/upstream/codex-rs/app-server-client/src/pending_requests.ts` | TypeScript app-server server-request tracking helper |
| `src/upstream/codex-rs/app-server-client/src/thread_event_store.ts` | TypeScript app-server notification/request thread projection helper |

## T3Chat UI

| Package Path | Upstream Reference |
| --- | --- |
| `src/upstream/t3code/apps/web/src/components/chat/ChatComposer.tsx` | `external/t3code/apps/web/src/components/chat/ChatComposer.tsx` |
| `src/upstream/t3code/apps/web/src/components/ComposerPromptEditor.tsx` | `external/t3code/apps/web/src/components/ComposerPromptEditor.tsx` |
| `src/upstream/t3code/apps/web/src/components/chat/MessagesTimeline.tsx` | `external/t3code/apps/web/src/components/chat/MessagesTimeline.tsx` |
| `src/upstream/t3code/apps/web/src/components/chat/ChangedFilesTree.tsx` | `external/t3code/apps/web/src/components/chat/ChangedFilesTree.tsx` |
| `src/upstream/t3code/apps/web/src/components/chat/ProviderModelPicker.tsx` | `external/t3code/apps/web/src/components/chat/ProviderModelPicker.tsx` |
| `src/upstream/t3code/apps/web/src/components/ui` | `external/t3code/apps/web/src/components/ui` or the closest current T3Chat UI primitive source |
| `src/upstream/t3code/apps/web/src/hooks` | `external/t3code/apps/web/src/hooks` |
| `src/upstream/t3code/apps/web/src/lib` | `external/t3code/apps/web/src/lib` |

## Package Shadcn Primitives

| Package Path | Source |
| --- | --- |
| `src/shadcn/ui/sidebar.tsx` | Standard radix-nova shadcn `sidebar` primitive with package-local imports |
| `src/shadcn/ui/button.tsx` | Standard radix-nova shadcn `button` primitive with package-local imports |
| `src/shadcn/ui/sheet.tsx` | Standard radix-nova shadcn `sheet` primitive with package-local imports |
| `src/shadcn/ui/tooltip.tsx` | Standard radix-nova shadcn `tooltip` primitive with package-local imports |
| `src/shadcn/ui/separator.tsx` | Standard radix-nova shadcn `separator` primitive with package-local imports |
| `src/shadcn/ui/scroll-area.tsx` | Standard radix-nova shadcn `scroll-area` primitive with package-local imports |
| `src/shadcn/ui/skeleton.tsx` | Standard radix-nova shadcn `skeleton` primitive with package-local imports |
| `src/shadcn/ui/input.tsx` | Standard radix-nova shadcn `input` primitive with package-local imports |
| `src/shadcn/ui/collapsible.tsx` | Standard radix-nova shadcn `collapsible` primitive with package-local imports |
| `src/shadcn/ui/command.tsx` | Standard radix-nova shadcn `command` primitive with package-local imports |

## Intentional Adaptations

- TypeScript files use `.ts` and `.tsx`; upstream Codex files use `.rs`.
- Browser and Cloudflare Workers use `fetch`, WebSocket, and Durable Object
  primitives instead of Codex's Rust runtime primitives.
- Cloudflare-specific Durable Object and route mounting code belongs outside
  the package.
- Application prompts, tools, scope resolution, route paths, storage prefixes,
  and branding belong outside the package.
- Application identity and product behavior should enter as
  `developer_instructions`; the `instructions` config key is reserved for
  intentional base-instructions replacement, matching Codex.
- The consuming app must include `packages/codex-js/src/upstream/t3code`,
  `packages/codex-js/src/components`, and
  `packages/codex-js/src/shadcn` in its Tailwind source scan so
  copied T3Chat and package shadcn utility classes are generated.

## Package Facades

These files are not upstream mirrors. They are package-owned integration
surfaces that keep application concerns out of the Codex and T3 mirror trees.

| Package Path | Purpose |
| --- | --- |
| `src/runtime` | Codex lifecycle contracts, configured runtime, store boundary, app-server control plane, drafts, and route-neutral thread state. |
| `src/components` | Stable public React component surface built from the T3 mirror. |
| `src/shadcn` | Standard shadcn primitives for optional chat layout composition. |
| `src/hooks` | Stable public React hooks without router coupling. |
| `src/testing` | Package and consumer testing utilities. |

The app-server control plane mirrors Codex's `message_processor.rs`,
`request_serialization.rs`, `connection_rpc_gate.rs`, and request processor
split in TypeScript. The package-owned files keep strict initialize,
serialization, connection gating, and thread/turn dispatch outside product
adapters.

## Upstream Update Checklist

1. Identify the upstream Codex or T3Chat files that changed.
2. Find the matching package path in this map.
3. Port structure, names, and protocol terminology before adapting behavior.
4. Keep product-specific behavior in the consuming app.
5. Run:

```bash
npx tsc -p packages/codex-js/tsconfig.json --pretty false
npx vitest run src/__tests__/codex-assistant-package.test.ts
```

6. Run the relevant runtime or UI regression tests for the changed segment.
