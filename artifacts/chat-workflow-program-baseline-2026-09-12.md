<!-- artifacts/chat-workflow-program-baseline-2026-09-12.md -->

# Chat workflow implementation baseline — 2026-09-12

This is the coordinator receipt for Tasker 81. It records the shared dirty-tree
source that packages 82, 84, and the package-85 interface design inspected before
their first write. It contains no environment values or credentials.

## Source identity

- Branch: `main`
- Git HEAD: `c324762250e8c9546d63cf1dada4b6c885d36974`
- Executable dirty-tree SHA-256 (the repository's `readSourceProvenance` rules):
  `79e3613c2cb2ca0d2c7176476fab884e560bba53c2adec2dffe134f82a55fb3f`
- All three package owners confirmed they had made no file edits before this
  identity was captured.
- The source is an intentionally dirty working tree. It is not reproducible from
  HEAD alone and must not be replaced with a clean checkout for integration proof.

## Selected executable path manifest

The following paths differed from HEAD under the provenance source roots at
capture time. This is a manifest, not permission to stage, restore, or overwrite
any path.

```text
apps/web/docs/development/sproject-context.json
apps/web/package.json
apps/web/src/content/blogs/blog-context.json
apps/web/src/lib/components/agent/ThinkingBlock.svelte
apps/web/src/lib/components/agent/ThinkingBlock.test.ts
apps/web/src/lib/components/agent/WorkflowProgressCard.svelte
apps/web/src/lib/components/agent/agent-chat-session.test.ts
apps/web/src/lib/components/agent/agent-chat-session.ts
apps/web/src/lib/components/agent/agent-chat-sse-handler.test.ts
apps/web/src/lib/components/agent/agent-chat-sse-handler.ts
apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts
apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts
apps/web/src/lib/services/agentic-chat-lite/prompt/types.ts
apps/web/src/lib/services/agentic-chat-v2/context-loader.ts
apps/web/src/lib/services/agentic-chat-v2/context-models.ts
apps/web/src/lib/services/agentic-chat-v2/focused-document-context.ts
apps/web/src/lib/services/agentic-chat-v2/scope.ts
apps/web/src/lib/services/agentic-chat/project-domain-profiles.ts
apps/web/src/lib/tests/agentic-e2e/harness/judge.ts
apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/budget-absence.test.ts
apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-10-calendar-availability.scenario.ts
apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-14-grounded-status.scenario.ts
apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/cedar-house.test.ts
apps/web/src/lib/tests/agentic-e2e/workflow-prototype.live.test.ts
apps/web/src/routes/workflow-lab/+page.server.ts
apps/web/src/routes/workflow-lab/+page.svelte
apps/web/vitest.config.agentic.ts
apps/web/vitest.config.ts
apps/worker/src/workers/agentic-chat/bootstrap.ts
apps/worker/src/workers/agentic-chat/composition-root.ts
apps/worker/src/workers/agentic-chat/config.ts
apps/worker/src/workers/agentic-chat/djflow-architecture.md
apps/worker/src/workers/agentic-chat/djflow-build-list.md
apps/worker/src/workers/agentic-chat/djflow-prototype.md
apps/worker/src/workers/agentic-chat/djflow-review.md
apps/worker/src/workers/agentic-chat/djflow.md
apps/worker/src/workers/agentic-chat/provider/contracts.ts
apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts
apps/worker/src/workers/agentic-chat/provider/review/mutation-batch.ts
apps/worker/src/workers/agentic-chat/provider/turn-provider.ts
apps/worker/src/workers/agentic-chat/provider/validation.ts
apps/worker/src/workers/agentic-chat/supabaseStreamPublisherAdapters.ts
apps/worker/src/workers/agentic-chat/turn-executor.ts
apps/worker/src/workers/agentic-chat/workflow/context-loader.ts
apps/worker/src/workers/agentic-chat/workflow/prototype-provider.ts
apps/worker/tests/agenticChatMutationBatchReview.test.ts
apps/worker/tests/agenticChatOpenRouterClient.test.ts
apps/worker/tests/agenticChatStreamPublisher.test.ts
apps/worker/tests/agenticChatTurnExecutor.test.ts
apps/worker/tests/agenticChatTurnProvider.test.ts
apps/worker/tests/agenticChatWorkflowPrototype.test.ts
package.json
packages/agentic-chat-runtime/package.json
packages/agentic-chat-runtime/source-entrypoints.ts
packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts
packages/agentic-chat-runtime/src/context/context-loader.test.ts
packages/agentic-chat-runtime/src/context/context-loader.ts
packages/agentic-chat-runtime/src/context/context-models.ts
packages/agentic-chat-runtime/src/context/focused-document-context.ts
packages/agentic-chat-runtime/src/context/index.ts
packages/agentic-chat-runtime/src/context/project-domain-profiles.ts
packages/agentic-chat-runtime/src/context/prompt-context.ts
packages/agentic-chat-runtime/src/context/scope.ts
packages/agentic-chat-runtime/vitest.config.ts
packages/shared-agent-ops/src/gateway/op-execution-gateway.config.ts
packages/shared-types/src/agent.types.ts
packages/shared-types/src/chat-workflow-prototype.ts
packages/shared-types/src/database.schema.ts
packages/shared-types/src/index.ts
scripts/agentic/calendar-setup.ts
scripts/agentic/gate-policy.test.ts
scripts/agentic/gate-policy.ts
scripts/agentic/gate.ts
scripts/agentic/preflight.test.ts
scripts/agentic/preflight.ts
scripts/agentic/provenance.test.ts
scripts/agentic/reference-data.json
scripts/agentic/workflow-prototype.ts
scripts/testing/postgres-ipc-preflight.ts
scripts/testing/test-type-baseline.json
supabase/.temp/cli-latest
```

Tasker and durable evidence documents outside the executable provenance roots were
also dirty or untracked at capture. The package taskers are
`tasker/81-chat-workflow-implementation-program.md` through
`tasker/89-chat-workflow-integration-acceptance.md`.

## Retained evidence supplied to owners

- `output/agentic-gate/djflow-subscription-race-2026-09-12/`
- `output/workflow-startup-stall-2026-09-12/`
- `output/agentic-gate/djflow-timing-profile-2026-09-12/`
- `docs/technical/reviews/DJFLOW_STARTUP_STALL_2026-09-12.md`
- `docs/technical/reviews/CHAT_WORKFLOW_REGRESSION_REPAIRS_2026-09-13.md`
- `docs/testing/agentic-chat-gate.md`

The first retained full gate is a failure at 44/52. The browser replay is an
explicitly partial result. Neither is superseded by later focused tests.

## Initial ownership and integration lock

- Package 82: ordinary prompt/reviewer correctness and Cedar fixtures.
- Package 84: stream publisher, Supabase delivery adapter, and delivery-health tests.
- Package 85: interface design only until stabilization is accepted.
- Coordinator: `turn-executor.ts`, `bootstrap.ts`, `composition-root.ts`, `config.ts`,
  full-gate scheduling, acceptance evidence, and sequential integration decisions.

No owner may run the full Agentic Chat gate or a competing QA worker. New runtime
packages remain blocked until the 82/84 stabilization change set passes the mandatory
gate.
