<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/receipts/WP-A2-admission-and-skills.md -->

# WP-A2 — admission and skills (F44, F69, F70, F71, F75)

Receipt for the `A2-admission-and-skills` package of AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08.
All changes are unstaged in the working tree; nothing was committed, stashed, or reset.

## Per finding

### F44 — dead lexical intent classifier call and two dead checkpoint queries (verifier stage 1 done, stage 2 partial)

Verified dead by reading: `createTurnCheckpoint` is the only inserter into `chat_turn_checkpoints` and has no caller
(only its own test), so `loadLatestActiveCheckpoint` never finds a row and `recover_agentic_chat_resume_checkpoints`
has nothing to recover; `resolveFastChatTurnIntent` returns `emptyIntent()` unconditionally and its one reader
(`turnIntent?.requiresWrite === true`) was always false.

- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts`
    - Deleted `loadWorkerResumeCheckpoint`, the `checkpoint-service.server` import, `SUPERVISOR_RESUMING_STALE_AFTER_MS`,
      the `loadResumeCheckpoint` dependency hook, the `resumeCheckpoint` artifact spread, and the
      `supervisor_resume_*` user-message metadata. Two DB round trips (one RPC, one select) gone from every
      non-prepared turn.
    - `turnIntentRequiresWrite` collapsed to `turnPreparation.pendingTurnContract !== null`.
    - The artifact's optional `resumeCheckpoint` field and the worker's `request-builders.ts` handling are untouched, as the note required.
- `apps/web/src/lib/services/agentic-chat-v2/turn-preparation.ts`
    - Removed the `./turn-intent` import, `pendingTurnIntent` / `turnIntent` fields, and the
      `readFastChatPendingTurnIntent` / `resolveFastChatTurnIntent` wiring (old lines 118–136).
- `packages/agentic-chat-runtime/src/loop/turn-intent.ts` — **left in place** (see Handoffs). It is owned by this
  package but every export is re-exported by name from `apps/web/src/lib/services/agentic-chat-v2/turn-intent.ts`
  and consumed by `loop/turn-outcome.ts`, `loop/synthesis-context.ts`, and `loop/index.ts`, none of which this
  package owns; the verifier's stage 2 is a joint deletion of all of them.
- Tests: `turn-preparation.test.ts` (3 assertions flipped to `not.toHaveProperty('turnIntent')`),
  `worker-turn-preparation.test.ts` (dependency hook and four `turnIntent` mock objects removed; the
  "freezes the selected checkpoint" test rewritten as "issues no checkpoint query and freezes no resume snapshot" —
  asserts `serviceClient.rpc` never called, `from('chat_turn_checkpoints')` never called, no `resumeCheckpoint`
  in the artifact, no `supervisor_resume_*` metadata, artifact still validates).

### F69 — per-window dedupe removed the playbook from every following write turn (verifier better_fix, done)

- `apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.ts`
    - `resolveOperationalSkillPreload` no longer accepts or applies `alreadyLoadedSkillIds`: an operational playbook is
      this turn's write rules and renders on every turn its intent fires. Craft / explicit-ask / project-affinity
      preloads keep their one-shot dedupe (`resolveSkillGatePreload`, `resolveSkillPreloadById` unchanged).
- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts` (loaded-skills summary only)
    - `projectHistorySnapshotWithLineage` no longer appends the `Previously loaded skills in this session:` system
      message, so `skill_load` never appears in a worker prompt. The continuity rows still feed the pending
      clarification summary. `buildLoadedSkillHistorySummary`, `extractLoadedSkillIdsFromHistory`,
      `historyIncludesLoadedSkillsLedger`, and `LOADED_SKILLS_LEDGER_PREFIX` stay exported (the two latter are
      re-exported by `agentic-chat-v2/index.ts`, not owned) but have no production caller now — see Handoffs.
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts`
    - `loadOwnedWorkerHistory` now returns `{ history, loadedSkillIds }`; `collectWindowLoadedSkillIds` reads the
      craft-dedupe set out of band (real `skill_load` executions + `skill_preloaded_id` user-message metadata) so no
      ledger has to ride the prompt. `buildSkillPreloadContinuityRows` deleted (it only existed to synthesize ledger rows).
    - `loadWorkerSkillPreloadLedgerMessage` (called by the prewarm route, not owned) now returns `null`; export kept
      until the route drops the call.
    - `skill_preloaded_id` / `skill_preload_source` metadata kept as telemetry.
    - Deliberate, bounded gap: a prepared-admission hit skips the history query and so has no dedupe window; a craft
      playbook that already rendered inside the window may render once more on a prepared hit (≤6,000 chars, no
      correctness effect). Operational playbooks are per-turn on both paths, so the P0-2 parity that matters
      (does the write playbook fire) is identical on hit and miss.
- Tests: `session-service.test.ts` projection test flipped (no ledger message, no `skill_load` text);
  `worker-turn-preparation.test.ts` "skips re-injecting … carries the ledger" rewritten as "renders the operational
  playbook again on the next write turn and carries no loaded-skills ledger" (the F69 failing input: turn 2 of a
  task-editing session), plus a new "still dedupes a one-shot craft preload against the skills the window already
  showed" (project_audit twice → second admission has no preload); `skill-gate-preload.test.ts` "has no
  already-loaded dedupe, unlike the craft route".

### F70 — half the productivity allowlist could never fire (note-narrowed, done)

- `apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.ts`
    - `PRODUCTIVITY_PRELOAD_ALLOWLIST` trimmed 12 → 6 to the reachable set: `calendar_management`,
      `context_engineering_for_agent_work`, `document_workspace`, `project_audit`, `project_forecast`,
      `task_management`. Dropped (verified: in no domain, outcome card, or mounted intent kind):
      `google_calendar`, `people_context`, `plan_management` (tools on no surface), `project_creation`,
      `research_capture`, `task_state_updates`. All six stay registered for `skill_search` / `skill_load` and the
      gateway; `skill-registry-disk-parity.test.ts` passes.
    - Header comment rewritten (operational skills list, per-turn rendering).
- `apps/web/src/lib/services/agentic-chat/tools/domains/operational-skill-intent.ts`
    - Stale "Calendar tools are not executable on the worker today" comment and the "nine operational skills" header
      corrected: task and calendar writes are on global + project, document writes on project, plan on none.
- Not done here (not owned; see Handoffs): rewrite `project_creation` Contract/Examples to the shell-only payload;
  fold `google_calendar` into `calendar_management` and redirect the blog.
- Tests: `skill-gate-preload.test.ts` allowlist test asserts the exact six and that the six dropped ids are
  registered but not allowlisted.

### F71 — the operational SKILL.md files were written for a different runtime (verifier better_fix, done)

- `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md` and
  `.../document_workspace/SKILL.md`
    - Activation, Procedure, Contract, Policy, Examples rewritten in snake tool names, naming only tools mounted on
      the worker surface that carries the write (task: `list_onto_tasks`, `get_onto_task_details`,
      `create_onto_task`, `update_onto_task`, `move_onto_task`; document: `search_project`, `list_onto_documents`,
      `get_document_tree`, `get_document_outline`, `read_document_section`, `create_onto_document`,
      `update_onto_document`, `move_document_in_tree`, `link_onto_entities`). No `onto.task.docs.*`,
      `delete_onto_document`, `onto.task.search`, `merge_llm`, `merge_instructions`, or `create_task_document`.
    - `### Direct tool packaging` H4 block deleted.
    - Examples open with the update-by-exact-id case; the create example (task) and organize example (document) follow.
    - `## Related Tools` left in dotted op ids (materialized_tools / gateway contract), as the verifier required.
    - Rules already carried by the worker write rules or the tool description overrides (exact-id repeated in
      Policy and a "Guard against empty task writes" example; `state_key` stop-condition duplicate) removed; one
      `state_key` mention remains in Procedure step 4.
    - `move_document_in_tree` is described with `new_parent_title` / `new_parent_id` per its override; no
      `declare_turn_contract` mention anywhere (the opening pass defers that tool — F02).
    - Rendered worker blocks: task update 34 lines / 2,953 chars; task create 36 / 3,283; document organize 33 / 2,947.
- `apps/web/src/lib/services/agentic-chat/tools/domains/skill-gate-preload.ts`
    - Worker block heading is now one line: `Playbook for <task|document|calendar> writes this turn:` for
      operational preloads, `Playbook for this turn (<Skill Name>):` for craft/affinity preloads. The
      "Preloaded skill … already loaded at short format" line and the "Reference modules and child skills are not
      loadable on this surface…" line are gone.
    - Tiny example selector (`selectWorkerExample`): the example whose title opens with the turn's verb
      (create / update / organize), else the first (the update case).
- `apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts` (preload wrapper only)
    - The preload branch of `renderDomainSensingPromptContent` returns the playbook as-is; the
      `Source: … / Skill-load gate: SATISFIED BY PRELOAD. / Next step: … do not call skill_load … outcome_card_load`
      wrapper and `PRELOADED_NEXT_STEP` are deleted. The gated (no-preload) branch is unchanged.
- `apps/web/src/lib/services/agentic-chat/tools/domains/operational-skill-intent.ts`
    - `resolveOperationalExampleHint` (earliest verb wins; default `update`) and `exampleHint` on
      `OperationalSkillResolution`.
- Tests: new `worker playbook crosscheck against the mounted surface` in `skill-gate-preload.test.ts` — renders the
  block for six message/surface pairs off the real `getGatewayDirectToolNamesForProfile` minus the worker-omitted
  set and asserts: ≤40 lines, no dotted op id, no `declare_turn_contract`, every registered tool name in the block
  is mounted on that surface. Plus "shows the worked example that matches the turn verb", the flipped
  heading/reference-note tests, and the rewritten `renderDomainSensingPromptContent with a preload` block.
  `skill-load.test.ts`: the `Never emit update_onto_task({})` content pin replaced by "update example precedes
  create example" and "no Direct tool packaging".

### F75 — one regex classifier gates both the playbook and the write rule (note + verifier, partial)

- `apps/web/src/lib/services/agentic-chat/tools/domains/operational-skill-intent.ts`
    - `STRONG_MUTATION_PATTERNS` extended (verifier better_fix): schedule/book/set up/arrange + meeting/call/…,
      assign/reassign/hand … to, set the <field>, fix the …, put … on hold — so "Can you schedule a call with Ana
      tomorrow?" now classifies as a calendar write and gets the playbook. `put` and `fix` added to the task verb
      lexicon, `fix` to the document lexicon.
    - The verifier's "require an entity-kind hit for the playbook" was already true: `resolveOperationalSkillForTurn`
      filters on `entityKinds`; `strongMutation` alone only feeds `looksLikeMutationTurn`. Documented in the header.
    - TODO comment naming F75 left at the top of the file: `situational-rules.ts` (WP-A1, landed uncommitted) kept
      every block intent-keyed (F01) and still gates the worker write recipe on `looksLikeMutationTurn`; the WP-A2
      note wants the recipe mount-keyed on worker-bound artifacts. Not owned here — see Handoffs.
- Not done here (not owned): the "otherwise declare*turn_contract first" sentence on `link_onto_entities`,
  `update_calendar_event`, `delete_calendar_event` descriptions in `apps/worker/.../mutationToolCatalog.ts` — and
  note WP-A1's F02 direction is to \_remove* that sentence from opening-pass overrides, so this verifier item
  should be re-decided together with F02 rather than applied as written.
- Tests: `operational-skill-intent.test.ts` "classifies polite question-led writes by their strong verb phrase"
  (five inputs incl. the F75 example, plus a no-strong-phrase question that stays a read) and "picks the worked
  example from the earliest verb".

## Tests run (one file at a time, `pnpm --filter @buildos/web exec vitest run <file>`)

| File                                                                                                       | Result                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/lib/services/agentic-chat-v2/turn-preparation.test.ts`                                                | 13 pass / **1 fail — not mine**: "admits the reviewed project shell…" expects `declare_read_only_turn` on the project_create surface; the other session's F28 change to `surfaces.ts` removed it |
| `src/lib/services/agentic-chat-v2/session-service.test.ts`                                                 | 11 / 11 pass                                                                                                                                                                                     |
| `src/lib/services/agentic-chat-v2/worker-turn-preparation.test.ts`                                         | 30 / 30 pass (two assertions aligned to landed in-flight work from other packages — see Behaviour changes)                                                                                       |
| `src/lib/services/agentic-chat/tools/domains/skill-gate-preload.test.ts`                                   | 39 / 39 pass                                                                                                                                                                                     |
| `src/lib/services/agentic-chat/tools/domains/operational-skill-intent.test.ts`                             | 12 / 12 pass                                                                                                                                                                                     |
| `src/lib/services/agentic-chat/tools/domains/domain-sensing.test.ts`                                       | 49 / 49 pass                                                                                                                                                                                     |
| `src/lib/services/agentic-chat/tools/skills/skill-load.test.ts`                                            | 22 / 22 pass                                                                                                                                                                                     |
| `src/lib/services/agentic-chat/tools/skills/skill-registry-disk-parity.test.ts`                            | 2 / 2 pass                                                                                                                                                                                       |
| `src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts` (not owned; run to size the handoff) | 13 fail, 11 of them from WP-A1's in-flight `build-lite-prompt.ts` rewrite; 2 are mine (lines 398, 423 — see Handoffs)                                                                            |
| `src/lib/services/agentic-chat-lite/prompt/prompt-size-budget.test.ts` (not owned; F69 risk guard)         | 1 fail: `toolSchemaTokensPerTurn` 31,230 > 31,200 — tool schemas, from the other session's `catalog/definitions/*.ts` edits; no schema is touched here                                           |

No typecheck / svelte-check was run (integration agent). No test-gate refusals.

## Handoffs (files not owned by this package)

1. **F44 stage 2 joint deletion** (270 + 16 + ~60 lines): delete `packages/agentic-chat-runtime/src/loop/turn-intent.ts`,
   `packages/agentic-chat-runtime/src/loop/turn-outcome.ts` (only importer of `getWriteToolNamesForTurnIntent`;
   `resolveFastChatTurnOutcome` has no production caller), their tests (`loop/turn-intent.test.ts`,
   `apps/web/.../agentic-chat-v2/turn-outcome.test.ts`), the web wrappers
   `apps/web/src/lib/services/agentic-chat-v2/turn-intent.ts` and `.../turn-outcome.ts`; remove
   `export * from './turn-intent'` / `'./turn-outcome'` from `packages/agentic-chat-runtime/src/loop/index.ts` and
   `apps/web/src/lib/services/agentic-chat-v2/index.ts`; remove the `turnIntent?: FastChatTurnIntent | null` param
   and the `intentLine` / `originalRequestText` lines from `packages/agentic-chat-runtime/src/loop/synthesis-context.ts`
   (lines 218–231; no caller passes it).
2. **F44 checkpoint service**: `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/checkpoint-service.server.ts`
   (486 lines) and `checkpoint-service.test.ts` now have zero production callers — delete both. The SQL RPCs, the
   `chat_turn_checkpoints` table and the p4 postgres tests need no migration (verifier).
3. **F44 param name**: `apps/web/src/lib/services/agentic-chat-lite/prompt/situational-rules.ts` lines 136/152 —
   rename `turnIntentRequiresWrite` to `pendingTurnContract` (boolean); the only caller is
   `worker-turn-preparation.server.ts:631`, which I will not rename until the param does.
4. **F69 prewarm**: `apps/web/src/routes/api/agent/v2/prewarm/+server.ts` — delete the import of
   `loadWorkerSkillPreloadLedgerMessage` (line 64) and the `skillPreloadLedger` block (lines 261–275), passing
   `loadedHistory` straight to `composeFastChatHistory`; then delete `loadWorkerSkillPreloadLedgerMessage` from
   `worker-turn-preparation.server.ts`. `apps/web/src/routes/api/agent/v2/prewarm/server.test.ts` line 353 test
   "threads the last-turn continuity hint and the worker preload ledger into the prepared history": drop the second
   `expect.objectContaining({ role: 'system', content: expect.stringContaining('`task_management`') })` history
   entry and retitle. Optional parity follow-up: have prewarm store the window's loaded craft skill ids on the
   prepared row so a prepared hit can dedupe craft preloads like a miss.
5. **F69 dead ledger cluster**: `buildLoadedSkillHistorySummary`, `extractLoadedSkillIdsFromHistory`,
   `historyIncludesLoadedSkillsLedger`, `LOADED_SKILLS_LEDGER_PREFIX` in `session-service.ts` and their
   re-exports in `agentic-chat-v2/index.ts` lines 13–14 have no production caller; delete together with their
   unit tests in `session-service.test.ts` (lines ~560–705).
6. **F71 build-lite-prompt test pins**: `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts`
   line 398 `toContain('Skill-load gate: SATISFIED BY PRELOAD.')` → `not.toContain('Skill-load gate')`; line 423
   `toContain('persisted_project_domain_affinity')` → `toContain('Playbook for this turn (Fiction Story Craft):')`.
   (The `Preloaded skill: …` pins on 399/424/442/453 still hold: those tests use the web-lane renderer.)
7. **F70 content**: `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/project_creation/SKILL.md` —
   rewrite Contract/Examples to the shell-only payload (goals: 0, tasks: 0) instead of unpublishing
   (`registry/capability-catalog.ts:44-55` depends on the id). `google_calendar/SKILL.md` — fold unique content into
   `calendar_management` and redirect
   `apps/web/src/content/blogs/agent-skills/google-calendar-for-ai-agents-search-before-you-create.md`.
8. **F71 calendar_management** (`skills/definitions/calendar_management/SKILL.md`, not owned): its rendered worker
   block is 37 lines and step 4 says `cal.project.get` (a dotted op) — should be `get_project_calendar`. Add
   `calendar_management` cases to the crosscheck test once fixed.
9. **F75 decision** (`situational-rules.ts`, WP-A1): the worker write recipe still renders only when
   `looksLikeMutationTurn` / pending contract / capture fires. Either render it whenever a mutation tool is on a
   worker-bound artifact (WP-A2 note) or keep intent keying (WP-A1 F01 + F75 verifier); one decision, one place.
   The mutationToolCatalog "otherwise declare_turn_contract first" additions the F75 verifier suggested conflict
   with WP-A1's F02 removal of that sentence and should be re-decided with it.

## Behaviour changes a reviewer should know

- Every non-prepared admission does two fewer DB calls (checkpoint RPC + select). No user message carries
  `supervisor_resume_*` metadata any more; no artifact carries `resumeCheckpoint` (field stays in the contract).
- On turns 2..n of a task/document/calendar editing session the model now gets the playbook every time its intent
  fires (about 3,000 chars per such turn) instead of a 485-char "loaded skills / do not call skill_load" ledger and
  no playbook. The ledger message is gone from every worker prompt (admission-window and prepared paths).
- Craft/explicit-ask/affinity preloads still fire at most once per history window on the admission-window path;
  on a prepared-admission hit they can fire again (see F69).
- The preload block no longer opens with `Source: … / Skill-load gate: SATISFIED BY PRELOAD.` and no longer ends
  with `Next step: … do not call skill_load … outcome_card_load` or the reference-modules note; it opens with
  `Playbook for task writes this turn:` (or `Playbook for this turn (<Skill>):`).
- The task and document playbooks show the update-by-exact-id example by default, the create example on
  create-verb turns, the organize example on organize-verb turns.
- Automatic preload is now possible only for the six reachable skills; nothing changes for `skill_search`,
  `skill_load`, the gateway, or the marketing skill pages (files remain published).
- Polite question-led writes ("Can you schedule a call…", "Could you assign this to Sam?", "set the due date",
  "fix the title", "put … on hold") now classify as writes → playbook + write rules. "How do I fix the build?"
  will also trip the write rules (four lines) but never a playbook (no entity-kind hit).
- Two assertions in `worker-turn-preparation.test.ts` were aligned to other packages' landed-but-uncommitted work so
  the file is green: the review-delegation test now asserts `turnSituation` carries no `reviewDelegation`
  (WP-A1/F01 deleted the block; I also dropped the now-ignored `reviewDelegation:` argument from the call site),
  and the calendar-context surface test no longer lists `delegate_task` on the global surface (F25). If either
  package is reverted, restore those two assertions.
- Not touched, per the survive list: Finding 11 addendum, the direct-write floor and restraint canary, SHA-bound
  approvals, fail-closed unknown tools, terminal-truth invariants, worker never imports web source, the reviewer
  prompt/approval tools, context-only mounting (the playbook and rules are keyed off the message, the _surface_ is
  not), idempotent usage receipts. `## Related Tools` dotted ops and `materialized_tools` untouched.

## Deliberately left alone

- `packages/agentic-chat-runtime/src/loop/turn-intent.ts` (owned): deleting it alone breaks four files this
  package does not own; handed off as one joint deletion (Handoff 1).
- The web-lane renderer `renderPreloadedSkillPromptContent` ("Need more depth? Call skill_load …"): no production
  caller since one-engine, but exercised by tests in files not owned here; unchanged.
- `resolveSkillPreloadById` (project-affinity route): no production caller found; unchanged.
- `PROJECT_WRITE_DOCUMENT_TOOLS` fixtures in the domain tests still carry `declare_turn_contract`; harmless.
- `skill_preloaded_id` / `skill_preload_source` telemetry keys and the health report's preload breakdown.
