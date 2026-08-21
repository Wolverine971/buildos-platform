<!-- docs/plans/AGENTIC_CHAT_WORKER_WRITE_PATH_ROLLOUT_RESULT_2026-08-21.md -->

# Agentic Chat worker write path — rollout result

**Date:** 2026-08-21
**Follows:** [`AGENTIC_CHAT_WORKER_ORGANIZE_MULTIUPDATE_FAILURE_INVESTIGATION_2026-08-21.md`](./AGENTIC_CHAT_WORKER_ORGANIZE_MULTIUPDATE_FAILURE_INVESTIGATION_2026-08-21.md)
**Decision executed:** writes ON for the one-user canary worker with all 20 reviewed capabilities;
ambitious reviewer redesign; capability readback in `/health`; harness refuses to spend on a
read-only worker.
**Production releases:** `4816f6769` (write path), `4d28b2d1f` (batch reviewer required-arguments),
`70cf7f357` (review transition ids per attempt + publisher block diagnostics).
**Railway:** `agentic-chat-worker`, both capability lists = all 20 names, cohort unchanged
(canary + harness account).
**Database:** migration `20260822010000_agentic_chat_execution_observation_rejected_tool.sql` applied
through a receipt-isolated workdir (dry run named exactly that file; post-apply dry run: up to date).

## 1. Headline

| Scenario | Before (08-21 morning, writes off) | After (prod worker, zero retries) |
| --- | ---: | --- |
| `task-multi-update` | 0/3 | **PASS** on the first turn after the flip |
| `project-organize` | 0/3 (1 pass in 22 worker turns since 08-15) | **PASS, judge 5/5**, $0.03, 127 s — 4 folders created, 6 moves against code-bound label ids |
| Six-scenario × 5-rep battery | 11/18 best prior (`33b4faec`) | _(filled in below when the background battery completes)_ |

## 2. What shipped

| Work package | Change | Where |
| --- | --- | --- |
| WP3 organize parity | `new_parent_title` admitted on the worker `move_document_in_tree`; gateway returns `parent_id`/`parent_created`; adapter proves placement against the receipt; write ledger records the resolved parent; organize execution nudge appended after approval and in the write carve-out | `mutationToolCatalog.ts`, `gatewayDocumentRelationshipMutationAdapter.ts`, `op-execution-gateway.core.ts`, `write-ledger.ts`, `readOnlyProvider.ts` |
| WP1 symbolic references | Contract outcomes carry `label` (create) and `parent_label` (move/organize); parser enforces one-labelled-create-per-entity with a declared title; `bindTurnContractLabels` binds by title key (NFKC, alphanumerics only, case-folded) with containment/elimination/title-move fallbacks; worker authorizes a move when `new_parent_id` equals the binding or `new_parent_title` matches the declared title; batch reviewer receives "Resolved contract labels" | `turn-contract.ts`, `gateway.ts` (schema), `readOnlyProvider.ts` |
| WP2 reviewer | Field-semantics block projected from the advertised tool schemas (so "top priority → 1" is resolved); delegated-organization and postcondition guidance; two revisions per lane; batch reviewer told each tool's required arguments | `readOnlyProvider.ts` |
| WP4 surface coherence | A contract declared on a surface with no write tool becomes a read-only continuation (no reviewer passes); `/health.agenticChat.mutationCapabilities` reports provider/adapter names and counts and the advertised write tools | `readOnlyProvider.ts`, `phase3Bootstrap.ts` |
| WP5 harness | `Scenario.requiredMutationTools`; preflight fails closed unless the worker advertises them (`PRIVATE_AGENTIC_CHAT_WORKER_URL`); rejected tool name + advertised tool count retained in provider observations and the evidence artifact; `pnpm compare:agentic-evidence <baseline> <candidate>` | `agentic-e2e/**`, `openRouterReadOnlyClient.ts`, migration, `evidence-report.ts`, `scripts/agentic-e2e/compare-evidence.mjs` |

Verification before deploy: worker 1121/1121, shared-agent-ops 118/118, runtime `turn-contract`
54/54, web harness 55/55, typecheck clean in all four packages.

## 3. What the first live turns taught (and fixed the same hour)

1. **Batch reviewer vs required arguments.** With labels working and the contract approved on first
   review, the batch reviewer returned the four folder creates because they carried a `description`
   — a required argument of `create_onto_document` — as an "invented value". The stripped calls failed
   validation and the turn asked the user for descriptions. Fix (`4d28b2d1f`): the batch review
   request lists each tool's required arguments and the reviewer is told the agent supplies them.
2. **Identical re-declaration collided with itself.** The acting model ignored a second reviewer
   correction and re-declared a byte-identical contract. The contract review's durable transition id
   was keyed only by contract SHA, so the second review raised
   `agentic_chat_semantic_write_transition_conflict`, the publisher blocked, and the turn died as an
   opaque `AgenticChatPublisherBlockedError`. Fix (`70cf7f357`): contract / read-only / batch review
   transition ids include the logical provider round; the publisher keeps the database guard name in
   its block outcome and the typed failure log carries it.
3. **Reviewer nit on `type_key`.** The reviewer revised a contract for listing `type_key` in
   `required_fields` without a value, then rejected `document.default`. Guidance now states that
   required fields without a declared change are postconditions and that type/description defaults
   are the agent's choice.

Evidence: [`…writepath_smoke_organize_transition_conflict_2026-08-21_4d28b2d1f.json`](./evidence/agentic_chat_worker_writepath_smoke_organize_transition_conflict_2026-08-21_4d28b2d1f.json),
[`…writepath_smoke_organize_pass_2026-08-21_70cf7f357.json`](./evidence/agentic_chat_worker_writepath_smoke_organize_pass_2026-08-21_70cf7f357.json).

## 4. Six-scenario battery (5 reps, zero retries, clean worktree at `70cf7f357`)

Artifact: [`…writepath_six_scenario_battery_2026-08-21_70cf7f357.json`](./evidence/agentic_chat_worker_writepath_six_scenario_battery_2026-08-21_70cf7f357.json)
(`$0.36`, 30 turns). Compare: `pnpm compare:agentic-evidence <33b4faec> <this>`.

| Scenario | Best prior worker (`33b4faec`, 3 reps) | This battery (5 reps) |
| --- | ---: | ---: |
| `project-catchup-cold` | 3/3 | **5/5** |
| `restraint-noop-and-ambiguity` | 2/3 | **5/5** (10/10 turns) |
| `task-complete-cold-reference` | 1/3 | **4/5** |
| `task-reschedule-cold-reference` | 3/3 | 4/5 |
| `task-multi-update` | 2/3 | **4/5** |
| `project-organize` | 0/3 | 1/4 (one rep failed at seed, 5 s) |
| **Total** | **11/18 (61%)** | **23/30 (77%)** |

Every failure, from the database:

- **organize ×3** — identical shape: labelled contract approved on first or second review, four
  folders created and approved as a batch, then the model answered ("Here's my plan for the
  moves…") without proposing the moves. Nothing forced completion once the write carve-out had
  been spent. The one pass went through the parent-by-title path. → fixed in `16670602c`
  (§3 item 4).
- **task-complete ×1** — the acting model called `approve_mutation_batch_review` on its own
  batch, imitating the reviewer it had just watched; the allowlist refused and the turn failed
  permanently. → fixed in `16670602c` (§3 item 5).
- **reschedule ×1** — the reviewer asked what time to use although the contract carried the
  task's existing 15:00 time. → guidance in `16670602c`.
- **multi-update ×1** — the reviewer approved an added `state_key: in_progress` this time (it had
  revised it out in four other reps); the collateral fingerprint caught it. → guidance in
  `16670602c`.

4. **Approved contracts were abandoned after the first mutation round.** The write carve-out is
   deliberately one-shot; after it the model's prose was accepted even with untouched outcomes
   left. Fix (`16670602c`): when an approved contract has outcomes no successful write has
   touched, the worker withholds the answer once and sends the model back with the unfinished
   outcomes and their bound destination ids; an outcome any write already touched is never
   re-run from here.
5. **Reviewer mimicry.** A model that watches the reviewer approve its batch sometimes calls the
   approval tool itself. Now a one-shot repair ("reviewer-only control; you propose, the
   reviewer approves") instead of a permanent failure.

## 4b. Follow-up runs (all zero retries, clean worktree, captured)

| Release | Run | Result | Finding → fix |
| --- | --- | --- | --- |
| `16670602c` | organize, multi-update, task-complete × 3 | multi **3/3**, task-complete **3/3**, organize 1/3 | organize still stopped after the creates — the read-loop escalation is monotonic, so the post-mutation pass was forced tool-free and bypassed the completion continuation → `cdab55003` takes the write-only completion pass on that branch too |
| `cdab55003` | organize × 3 | 1/3 | the two failures were the **candidate gate** converting reviewer approvals into clarifications (7 listed documents incl. START HERE, contract covered 6) → `24c1d2f7b` gates singular references only |
| `24c1d2f7b` | organize × 3 + restraint × 3 | organize 2/3 (judge 5/5 ×2), restraint 2/3 | **both failures are harness-side**: turns `33c9a255` (all 4 creates + 6 moves executed, completed 22:28:18Z) and `e8f789cf` (completed 23:00:35Z) finished on the worker but the harness never received the terminal event and reported "did not terminate" after ~1000–1200 s. Restraint's turn-2 clarification behaviour is intact. |

Artifacts: `…writepath_confirm_three_scenario_2026-08-21_16670602c.json`,
`…writepath_organize_x3_2026-08-21_cdab55003.json`,
`…writepath_organize_restraint_x3_2026-08-21_24c1d2f7b.json`.

Handoff for the next agent: [`AGENTIC_CHAT_WORKER_WRITE_PATH_HANDOFF_2026-08-21.md`](./AGENTIC_CHAT_WORKER_WRITE_PATH_HANDOFF_2026-08-21.md).

## 5. Operator notes

- Capability readback: `curl -s https://agentic-chat-worker-production.up.railway.app/health | jq .agenticChat.mutationCapabilities`.
- Zero-spend preflight now proves the write surface:
  `AGENTIC_E2E_WORKER_PREFLIGHT_ONLY=true AGENTIC_E2E_BASE_URL=https://build-os.com AGENTIC_E2E_EXECUTION_MODE=worker_realtime PRIVATE_AGENTIC_CHAT_WORKER_URL=https://agentic-chat-worker-production.up.railway.app AGENTIC_SCENARIOS=project-organize,task-multi-update pnpm --filter @buildos/web exec vitest run --config vitest.config.agentic.ts src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts --retry=0`
- Never `supabase db push` from the main migration directory (the remote ledger has 120 receipts
  against 365 local files). Copy `supabase/.temp` plus only the remote-receipt migrations and the new
  file into a scratch workdir; the dry run must name exactly the new file.
- Evidence capture requires a clean tree: use a git worktree, `pnpm install --offline`, build the
  packages, and copy `apps/web/.env` in (ignored, so the tree stays clean).
- To explain any reviewer decision, read the database, not the artifact:
  `apps/web/scripts/agentic-e2e/dump-turn-decisions.mjs` + `render-turn-decisions.py`.
