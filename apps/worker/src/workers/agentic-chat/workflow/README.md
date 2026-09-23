<!-- apps/worker/src/workers/agentic-chat/workflow/README.md -->

# Durable project-review workflow

The in-chat Review toggle runs here. Web admission writes an `agentic_chat_input_v4` turn (a raw
review request with a `policyRef`, no prepared prompt). The worker then runs a fixed, read-only,
multi-agent review: planner → two specialists → editor. Every step commits its result together with
its progress event through fenced RPCs, so a crashed or requeued worker resumes from durable truth
and never repeats accepted work. Ordinary chat turns never enter this folder.

## Entry points, in order

Paths are relative to `apps/worker/src/workers/agentic-chat/`; bare names live in this folder.

1. **Seam** — `turn/turn-executor.ts` hands a v4 turn to `rawWorkflow.execute` (built by
   `preparation-composition.ts`, wired in `host/composition-root.ts`).
2. **Preparation** — `raw-turn-preparation.ts`: cohort and `policyRef` gates, access check, context
   load (`context-loader.ts`), accepted checkpoint (`prepared-context.ts`, `preparation-store.ts`).
3. **Runner** — `workflow-runner-adapter.ts` → `workflow-runner.ts`: planner, specialists (reports
   parsed by `role-report.ts` / `source-bound-report.ts`, saved reads via `document-read-tool.ts`),
   editor. State lives in `workflow-store.ts`; progress events come from `workflow-projection.ts`.
4. **Dispatch** — `workflow-dispatch.ts`: priced routes and a meter on every physical provider attempt.
5. **Terminal** — `workflow-terminal.ts`: the one terminal write, from durable truth. Stalled-worker
   recovery (`host/stalled-recovery.ts`) uses the same builder.

## Flags (`host/config.ts`, all default off)

- `AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED` — installs preparation. Off: v4 turns fail permanently.
- `AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED` — runs models. Requires preparation. Off: readable failure.
- `AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS` — the review cohort (web admission checks it too).
- Policy gates: `AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED`, `_V3_ENABLED`,
  `AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED`, `AGENTIC_CHAT_PUBLISHED_SPECIALISTS_ENABLED`,
  `AGENTIC_CHAT_DOCUMENT_READ_TOOLS_ENABLED`, `AGENTIC_CHAT_DOCUMENT_EVIDENCE_HANDOFF_ENABLED`.
- `AGENTIC_CHAT_CONTEXT_FINDER_ENABLED` — Jev-selected evidence (needs execution).
  `AGENTIC_CHAT_WORKFLOW_REASONING_OFF_STEPS` — hidden reasoning per step (`contracts.ts`).

Contract: [docs/architecture/agentic-chat-workflow-v1-contract.md](../../../../../../docs/architecture/agentic-chat-workflow-v1-contract.md).
