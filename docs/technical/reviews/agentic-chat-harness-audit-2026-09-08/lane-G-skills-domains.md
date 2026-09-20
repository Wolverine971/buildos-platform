<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/lane-G-skills-domains.md -->

# Lane G — Skills, Domains, Outcome Cards

Audit date: 2026-09-09T02Z. Tree: working tree on `6d70b36e1` (main). Read-only; no source edited.
Evidence scripts and the production pull live in `evidence/lane-G-*`.

The question for this lane: what playbook text actually reaches the acting model on the worker
today, and is the machinery that produces it proportionate to what it delivers?

Short answer: **one 233-line regex module (`operational-skill-intent.ts`) produces every skill
preload that has fired in production since the one-engine deploy; the other ~5,000 lines of
domain sensing, outcome cards, session state, research queue, used-signal derivation, a 638-line
SQL trigger and a per-turn 4.3 KB artifact map produced zero.** The playbook it delivers is a
~1,000-token block wrapped in 156 tokens of tooling jargon that names tools the worker does not
have, and it is deliberately withheld on every subsequent write turn in the same history window
even though the system prompt is rebuilt from scratch each turn.

---

## 1. Subsystem map — how a skill reaches the worker model today

The path, with the exact code (all working tree):

1. **Admission runs lexical domain sensing on every turn.**
   `apps/web/src/lib/services/agentic-chat-v2/turn-preparation.ts:138-153` calls `senseDomains()`
   (`tools/domains/domain-sensing.ts:586-717`) with the user message, the conversation summary and
   the prior `fastchat_domain_state` from `chat_sessions.agent_metadata`. This runs regardless of
   whether the worker will use the result (`scaffold.routing.domainSensing` defaults to `true`,
   `scaffold-variant.ts:77`).

2. **Admission picks at most one preload, operational intent first.**
   `worker-turn-preparation.server.ts:1260-1284` (`resolveWorkerSkillPreload`): - `resolveOperationalSkillPreload` (`tools/domains/skill-gate-preload.ts:207-233`) calls
   `resolveOperationalSkillForTurn` (`tools/domains/operational-skill-intent.ts:218-233`): a
   regex classifier over mutation verbs + entity nouns picks `task` / `document` / `plan` /
   `calendar`, then keeps only kinds whose write tools are mounted on the resolved surface
   (`:58-63`, `:205-211`). - If that returns null, `resolveSkillGatePreload` (`skill-gate-preload.ts:124-161`) takes the
   top domain-sensing candidate if `skill_load_required` is true. - Every route lands in `resolveSkillPreload` (`:257-295`): skip if the skill id is in
   `alreadyLoadedSkillIds`; refuse unless the skill is on `PRODUCTIVITY_PRELOAD_ALLOWLIST`
   (`:69-82`) or the turn is an explicit craft ask (`:170-183`); then `loadSkill(id, {format:
'short'})` and render.

3. **Rendering for the worker lane.** `renderWorkerPreloadedSkillPromptContent`
   (`skill-gate-preload.ts:337-367`): header line, optional Judgment block (only when frontmatter
   says `recommended_load_format: full`, `:401-415`), When-to-use (max 3), Workflow (all steps),
   Guardrails (max 6), Output contract, the **first** worked example (max 60 lines), a
   "reference modules and child skills are not loadable" sentence when the skill declares any
   (`:353-357`), an "Alternate skill candidates" line (`:359-364`), capped at
   `WORKER_PRELOAD_MAX_CHARS = 6_000` (`:113`, `:417-424`).

4. **Wrapping and placement.** `build-lite-prompt.ts:372-402` (`buildSituationalRulesSection`)
   calls `renderPreloadedSkillPlaybook` (`:410-419`) which calls
   `renderDomainSensingPromptContent` (`domain-sensing.ts:857-881`) — the preload branch wraps the
   block in `Source: <source>.` / `Skill-load gate: SATISFIED BY PRELOAD.` / `Next step:
<PRELOADED_NEXT_STEP>` (`:232-233`). The block leads the `## Rules for This Turn` section,
   followed by the situational write / web-research / delegation rules
   (`situational-rules.ts:180-223`). The section is inserted after `safety_data_rules`
   (`build-lite-prompt.ts:350-357`) on both the fresh-build and prepared-hit paths
   (`worker-turn-preparation.server.ts:684-698`).

5. **Dedupe.** `alreadyLoadedSkillIds = extractLoadedSkillIdsFromHistory(modelHistory)`
   (`worker-turn-preparation.server.ts:640`). The ids come from a system message
   `Previously loaded skills in this session:` (`session-service.ts:211`, `:219-237`) that the
   history composer appends (`:631-637`) from `loaded_skill_executions`, which on the worker lane
   are synthesized from the `skill_preloaded_id` user-message metadata
   (`worker-turn-preparation.server.ts:1192-1222`, written at `:844-847`). Result: a skill
   fires **once per history window** (`HISTORY_LIMIT` default 10 messages, `:126`), not once per
   turn.

6. **Telemetry / persistence.** Whether or not anything rendered, admission freezes
   `domainMetadata` into the turn input artifact (`:777-782`, `:918-952`): the merged domain
   session state plus `skillDomainIds` for all 53 skills and `outcomeCardDomainIds` for all 11
   cards (`:954-975`). A DB trigger (`supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql:380-600`,
   `trg_chat_turn_runs_terminal_domain_metadata`) fires on every worker turn's terminal status,
   scans `chat_tool_executions` for `domain_load` / `outcome_card_load` / `skill_load` /
   `resource_load` rows, takes `SELECT … FOR UPDATE` on the `chat_sessions` row and writes
   `fastchat_domain_state`. None of those five tools can execute on the worker
   (`packages/agentic-chat-runtime/src/worker-tool-policy.ts:80-85` omits `domain_search`,
   `skill_search`, `skill_load`; `outcome_card_*` / `resource_load` are not in any worker surface,
   `catalog/surfaces.ts:79-164`), so the projection branch is permanently empty.

7. **The worker never sees any skill tool.** `worker-prompt-surface.ts:16-20` sets
   `dynamicSkillTools: false`; `resolveWorkerPromptTools` (`:22-41`) strips the omitted names. The
   static prompt's catalog table, skill-routing bullet and "See the X skill" pointers are all
   gated off (`build-lite-prompt.ts:1116`, `:1268-1275`, `:1290-1292`; `situational-rules.ts:80-82`).
   Every production caller of `buildLitePromptEnvelope` passes the worker scaffold
   (`worker-turn-preparation.server.ts:606-615`, `routes/api/agent/v2/prewarm/+server.ts:301,318-326`,
   `prepared-prompt-cache.ts:241-251` via the stored scaffold), so every `dynamicSkillTools: true`
   branch in the prompt builder and preload renderer is dead in production.

8. **Other consumers of the skill files.** `/skills` and `/agent-skills` marketing routes
   (`apps/web/src/lib/server/agent-skills.ts` imports `skills/registry` and
   `skill-reference-load`) and the external agent API (`lib/server/agent-call/external-tool-gateway.ts:45,431-438`
   serves `skill_load` full-format to external agents). These are legitimate consumers of the
   full markdown format and are **not** on the chat turn path.

---

## 2. Measurements

### 2.1 Rendered worker preload blocks (evidence/lane-G-measure-preload.mjs — faithful JS port of the parser + renderer)

| Skill                              | SKILL.md bytes | Body lines | Rendered block chars | ≈ tokens (÷4) | With wrapper chars | ≈ tokens | Truncated at 6,000? | Reachable on worker?                                                                                                           |
| ---------------------------------- | -------------: | ---------: | -------------------: | ------------: | -----------------: | -------: | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| task_management                    |         10,101 |        126 |                3,976 |           994 |              4,313 |    1,079 | no                  | yes — operational intent                                                                                                       |
| document_workspace                 |          6,225 |         89 |                3,699 |           925 |              4,036 |    1,009 | no                  | yes — operational intent (project surface only)                                                                                |
| calendar_management                |          6,020 |         78 |                3,799 |           950 |              4,136 |    1,034 | no                  | yes — operational intent                                                                                                       |
| plan_management                    |         13,026 |        134 |                5,428 |         1,357 |              5,765 |    1,442 | **yes**             | **no** — `create_onto_plan`/`update_onto_plan` not mounted on any surface                                                      |
| project_creation                   |          6,839 |         91 |                3,715 |           929 |              4,052 |    1,013 | no                  | **no** — project_create context skips the section (`build-lite-prompt.ts:199-204`); no `project` entity kind in the intent map |
| people_context                     |          4,933 |         84 |                2,540 |           635 |              2,877 |      720 | no                  | **no** — in no domain/card/intent map; all 6 related tools are `UNAVAILABLE` on the worker                                     |
| research_capture                   |          9,561 |        159 |                5,266 |         1,317 |              5,603 |    1,401 | no                  | **no** — in no domain/card/intent map                                                                                          |
| task_state_updates                 |          4,411 |         76 |                1,920 |           480 |              2,257 |      565 | no                  | **no** — child skill; children never load on the worker                                                                        |
| project_audit                      |         10,003 |        122 |                5,738 |         1,435 |              6,075 |    1,519 | no                  | yes — native outcome-card signal (`domain-sensing.ts:235-257`)                                                                 |
| project_forecast                   |          7,941 |        110 |                4,011 |         1,003 |              4,348 |    1,087 | no                  | yes — native outcome-card signal                                                                                               |
| google_calendar                    |          8,676 |        153 |                2,740 |           685 |              3,077 |      770 | no                  | **no** — in no domain/card/intent map (duplicate of calendar_management)                                                       |
| context_engineering_for_agent_work |          8,180 |        145 |                2,475 |           619 |              2,812 |      703 | no                  | yes — `agent_engineering` domain is not explicit-ask-only (`domains/catalog.ts:819-855`)                                       |

The 09-02 audit's `task_management = 3,976 chars` matches this port exactly, which validates the
measurement method.

**Of the 12 allowlisted skills, 6 can reach the worker at all; 2 have.** The 41 non-allowlisted
craft skills can reach it only on an explicit ask (`skill-gate-preload.ts:170-183`).

### 2.2 Production: which preloads actually fire (read-only `agentic:health` pull, evidence/lane-G-skill-preloads-since-0904.json)

Window 2026-09-04T18:00Z → 2026-09-09T02:00Z (post one-engine deploy, all users): 38 worker
turns, 17 with a write-tool execution, **8 preloaded — 4 `task_management:operational_intent`,
4 `document_workspace:operational_intent`, 0 from `domain_sensing`, 0 `explicit_ask`, 0
`project_domain_affinity`, 0 calendar/audit/forecast/context-engineering.** The earlier 09-02→09-03
window (29 turns) showed 7/8 write turns preloaded, one of them a marketing skill via sensing
(`cold_email_deliverability_readiness`) before the 09-03 allowlist.

### 2.3 What surrounds the block: `## Rules for This Turn` on the worker

| Block                                                                      | Trigger today                                                             | Chars | ≈ tokens | Renders on                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----: | -------: | ---------------------------------------------------------------------------------------------- |
| Preload (task_management, wrapped)                                         | operational intent, once per history window                               | 4,313 |    1,079 | first task-write turn in window                                                                |
| Write rules (`WORKER_WRITE_TURN_RULE_LINES`, `situational-rules.ts:73-78`) | `looksLikeMutationTurn` or pending contract                               |   840 |      210 | mutation-verb turns                                                                            |
| Web research (`WORKER_WEB_RESEARCH_RULE_LINES`, `:90-96`)                  | `web_search`/`web_visit` **mounted** (`:147`)                             | 1,258 |      315 | **every worker turn** — both tools are on every global/project surface (`surfaces.ts:111-112`) |
| Review delegation (`REVIEW_DELEGATION_RULE_LINES`, `:108-112`)             | `delegate_task` **mounted** (`worker-turn-preparation.server.ts:660-664`) |   736 |      184 | **every worker turn** (`surfaces.ts:110`)                                                      |
| Total on a preloaded task-write project turn                               |                                                                           | 7,177 |    1,795 |                                                                                                |

The canonical project system prompt is 14,222 chars (`prompt-size-budget.test.ts:225`), so the
preload alone is +30% and the two always-on blocks are +14% on every turn including pure reads.

### 2.4 Wrapper / jargon share of the preload block

Header (`Preloaded skill: … already loaded at short format`, 118 chars) + `Source:` / `Skill-load
gate:` lines (68) + `Next step:` line (289) + references-unavailable sentence (158) = **621 chars,
≈156 tokens, 14% of the task_management block**. It names `skill_load` and `outcome_card_load`
(neither exists on the worker), says "for the cards listed here" when no card is listed, and
tells the model on a task write to "state platform-specific claims as unverified".

### 2.5 Code volume by bucket (non-test lines / test lines / test cases)

| Bucket                                                                                    | Modules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |      Non-test lines |                            Test lines |   Tests |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------: | ------------------------------------: | ------: |
| **Live on the worker turn path and load-bearing**                                         | `operational-skill-intent.ts` (233), `skill-gate-preload.ts` (432), `skills/registry.ts` (202), `skills/skill-load.ts` (357), `skills/markdown-skill.ts` (406), `skills/types.ts` (99), 12 `*.skill.ts` registration stubs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |              ≈1,900 |                                     — |       — |
| **Live on the worker path but output never rendered / never consumed**                    | `domain-sensing.ts` (963), `domain-load.ts` (322), `domains/catalog.ts` (884), `domain-session-state.ts` (1,291), `domain-used-signals.ts` (335), `outcome-cards/*` (723), `domains/types.ts` (125), SQL trigger (638 lines)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |  4,643 TS + 638 SQL | 2,662 (domains) + 113 (outcome-cards) | 109 + 6 |
| **Admin-only consumers of the persisted state**                                           | `domain-research-queue.ts` (508), `admin/domain-demand-analytics.ts` (421), `routes/admin/chat/domains/**`, `routes/api/admin/chat/domains/**`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |             ≈1,050+ |                                   200 |       — |
| **Dead in production (no non-test importer, or only `dynamicSkillTools: true` branches)** | `skills/skill-search.ts` (192), `work-capabilities/*` (46), `resources/resource-registry.ts` (215), `resolveSkillPreloadById` + the `project_domain_affinity` reason, `getSkillGateCandidateSkillLoadFormats`, `renderDomainSensingPromptBlock`, `listExplicitAskOnlyDomainIds`, the non-preload branch of `renderDomainSensingPromptContent` (`domain-sensing.ts:882-958`), `renderPreloadedSkillPromptContent` (web variant, `skill-gate-preload.ts:297-329`), `buildMidTurnSituationalNotice`, `WRITE_TURN_RULE_LINES` / `WEB_RESEARCH_RULE_LINES`, the catalog table (`build-lite-prompt.ts:1268-1310`); 12 of 17 exports of `project-domain-profiles.ts` (767) incl. the fiction starter overlay (only on `web_compound`, never `reviewed_shell`, `build-lite-prompt.ts:237-240`, `:333-337`) | ≈1,400 identifiable |                                     — |       — |
| **Test-only**                                                                             | `skill-authoring-validation.ts` (772; only importer is its test), `skill.schema.ts` (125; imported by the validator, the parser and types)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |                 897 |                        1,462 (skills) |      60 |
| **Marketing site + external agents**                                                      | 53 `SKILL.md` (766,746 bytes), 77 reference `.md` (573,020 bytes), `skill-reference-load.ts`, `skill-reference-visibility.ts`, `lib/server/agent-skills.ts`, `routes/skills/**`, `routes/agent-skills/**`, `AUTHORING_GUIDE.md`, `EVALS_GUIDE.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |     1.34 MB content |                                     — |       — |

### 2.6 Per-turn artifact weight of the reference maps

`skillDomainIds` (53 keys) + `outcomeCardDomainIds` (11 keys) serialize to **≈4,347 bytes** of
JSON per turn artifact (computed from the catalogs, `evidence/`), frozen for the trigger's
load-projection branch that can never run on the worker.

### 2.7 Related-tool reality check (evidence/lane-G-crosscheck-skill-tools.mjs)

| Skill               | `## Related Tools` ops | Not mounted on any worker surface | Notable                                                                                                                                        |
| ------------------- | ---------------------: | --------------------------------: | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| task_management     |                      8 |                                 4 | `onto.task.search`, `onto.plan.get`, `onto.goal.get`, `onto.milestone.get`                                                                     |
| document_workspace  |                      9 |                                 4 | `onto.document.delete` UNAVAILABLE, `onto.document.path.get`, `onto.task.docs.list`, `onto.task.docs.create_or_attach` (executable, unmounted) |
| calendar_management |                      7 |                                 0 | `cal.project.get/set` project-surface only                                                                                                     |
| plan_management     |                     16 |                                11 | every plan/goal/milestone tool                                                                                                                 |
| project_audit       |                      9 |                                 5 | `onto.project.graph.get`, `onto.goal.list`, `onto.plan.list`, `onto.milestone.list`, `onto.risk.list`                                          |
| project_forecast    |                     11 |                                 5 | same five                                                                                                                                      |
| research_capture    |                      7 |                                 1 | `onto.document.search`                                                                                                                         |
| people_context      |                      6 |                                 6 | all six `UNAVAILABLE` on the worker                                                                                                            |

Related Tools are not rendered in the worker block (`pushCoreBlocks`, `skill-gate-preload.ts:369-386`
renders no `related_ops`), but the Procedure and Policy prose that _is_ rendered still names them
in dotted form: task_management 16 dotted references, document_workspace 17, plan_management 18
(`rg` count over each SKILL.md).

---

## 3. Reading the operational SKILL.md files as a cheap acting model would

`task_management/SKILL.md` (155 lines). What renders: 3 activation bullets, 9 procedure steps,
5 guardrails, the Contract, example 1 (a **create** with a fiction payload). What does not render
but the file spends 15 lines on: `### Direct tool packaging` Part 1 / Part 2 (`:70-84`) — the
parser only lifts numbered items from Procedure (`markdown-skill.ts:263-277`), so the bullets
under an H4 are dropped. Examples 2–4, including the only update-by-exact-id payload (`:141`)
and "Guard against empty task writes" (`:145-150`), never reach the worker because only
`examples[0]` renders (`skill-gate-preload.ts:349`). The exact-`task_id` rule appears three
times in the rendered block (step 6, Policy line 4, Contract stop condition) and a fourth time in
the write rules (`EXACT_ID_RULE_LINE`) and a fifth in the worker's `update_onto_task` description
override (`apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts:471-472`). Step 8 (state
coverage) is the same sentence as `TASK_STATE_RULE_LINE` (`situational-rules.ts:57-58`), which
renders in the same section on the same turn because both key off the same classifier.

`document_workspace/SKILL.md` (102 lines). Step 5 tells the model to "use onto.task.docs.\*" —
not mounted. Policy line 3 discusses `delete_onto_document` args — unavailable on the worker.
Steps 4, 6, 7 speak in `onto.document.tree.get` / `onto.document.tree.move` while the tools array
says `get_document_tree` / `move_document_in_tree`; a weak model has to translate. The one thing
the block teaches that the tool descriptions do not — "get the tree once, then issue targeted
moves" — is two sentences.

`calendar_management/SKILL.md` (94 lines). The best of the set: 0 unmounted tools, the Google
`{ event_id, calendar_source_id }` pair rule is real and not in the tool schema description. Still
written in `cal.event.list` / `cal.project.get` op names.

`plan_management/SKILL.md` (147 lines, 13,026 bytes). Truncated at 6,000 chars on render; step 12
says "update the plan body with append or merge_llm" while its own example says
"`update_onto_plan` replaces fields directly — it does not append or merge server-side"
(`:106`, `:130`). Moot on the worker: the plan tools are executable
(`worker-tool-policy.ts:27-28`) but on no surface, so "turn this goal into a plan" is a dead ask
(Lane B owns the mount decision; this lane notes the skill can never fire).

`project_creation/SKILL.md` describes the legacy compound payload
(`{ project, entities, relationships, clarifications[] }`, `:57-68`); the worker adapter creates
a shell only and the reviewed lane creates goals/tasks separately (`surfaces.ts:149-154`). Never
preloaded on the worker; still published on `/skills` and served to external agents.

`research_capture/SKILL.md` (171 lines) is the one skill with `recommended_load_format: full` so
its Judgment table would inline (`skill-gate-preload.ts:401-415`) — and it can never fire on the
worker (no domain, no card, no intent kind).

A 40-line version of task_management for the worker keeps: the task-vs-do-now rule (1 line), the
parent-context rule (1), valid states (1), exact-id-or-read-first (1), description-is-replacement
(1), state_key-with-progress (1), the four-line Contract, and **the update example with an exact
id** — about 400 tokens, written in `create_onto_task` / `update_onto_task` / `list_onto_tasks`
names only. Everything else in the rendered block is already in the tool description overrides
or the write rules.

---

## 4. Is the skill abstraction the right unit for a weak model on the worker?

The format was designed for progressive disclosure: `catalog_line` → `skill_search` →
`skill_load(short)` → `skill_load(full)` → child skills → reference modules, with `activation`,
`altitude`, `skill_type`, `dependencies` and an 11-block canonical order enforced by a 772-line
linter, and an authoring guide that sizes a shell at "8–20 KB (~2–5k tokens); primary job complete
in one load" and a worked example at "50–80 lines" (`AUTHORING_GUIDE.md:93-97`).

On the production worker none of that ladder exists. What survives is a fixed projection —
3 activation bullets, Procedure, ≤6 Policy lines, Contract, example 1, ≤60 lines — capped at 6,000
chars, delivered by one deterministic verb/noun map for three entity kinds, once per history window.
`activation: progressive` is on all 53 skills and nothing reads it (lane D 09-02 §2 already noted
the enum is decorative). `recommended_load_format` matters for exactly one skill that cannot fire.
Child skills and reference modules are announced as unavailable in the block itself. The authoring
guide's sizing targets are 1.3–3.3× the worker cap, and `plan_management` already truncates.

The 09-02 audit concluded "the gap is delivery, not authoring". Six days of production say the
delivery fix worked for exactly the two skills the regex map covers and that the rest of the system
delivered nothing. That is the evidence for the stronger claim: **for the worker, the skill file is
the wrong unit.** The operational knowledge a cheap model needs at write time is small (§3), is
per-tool or per-entity, and is already half-duplicated in the mutation description overrides. The
right home is (a) the tool description for anything about one call, and (b) a short per-entity
playbook string, in tool names, rendered on every write turn of that kind — not a markdown document
parsed into a payload, projected, capped and deduped.

The full SKILL.md format is still the right unit for the marketing site and for external agents
that can call `skill_load(full)`; nothing here argues for deleting the files.

---

## 5. Findings

Severity legend: P0 breaks turns; P1 measurable token/round/latency cost or a cheap-model trap on
common turns; P2 real but bounded; P3 hygiene.

### G1 — P1 — The domain/outcome-card/session-state apparatus runs on every worker turn and has produced zero preloads since the one-engine deploy (delete / simplify)

**Claim.** Since 2026-09-04 every production preload (8/8) came from
`operational-skill-intent.ts`; `senseDomains`, the 11 outcome cards, `mergeDomainSessionState`,
the 4.3 KB per-turn reference map and the terminal DB trigger contributed nothing the model saw.

**Evidence.**

- `turn-preparation.ts:138-153` — sensing runs every turn.
- `worker-turn-preparation.server.ts:650` — sensing reaches the prompt only when a preload already
  exists; `:777-782`, `:918-975` — it is persisted every turn regardless.
- `supabase/migrations/20260813070000_agentic_chat_terminal_domain_metadata.sql:380-600` — trigger
  scans for five load tools; `worker-tool-policy.ts:80-85` + `surfaces.ts:79-164` — none is
  callable on the worker; `:583-598` — `FOR UPDATE` on `chat_sessions` then write.
- Consumers of the persisted `fastchat_domain_state`: `turn-preparation.ts:138-140` (feeds
  `priorDomainIds` back into sensing as a `session_state` source that can never open the gate,
  `domain-sensing.ts:259-272`) and `lib/services/admin/domain-demand-analytics.ts:147`.
- Production: `evidence/lane-G-skill-preloads-since-0904.json` — breakdown has no
  `domain_sensing` / `explicit_ask` entries in 38 turns.
- Line counts: §2.5 — 4,643 TS + 638 SQL live-but-inert; 2,775 test lines / 115 tests guarding it.

**Cheap-model impact.** None directly on the prompt today (nothing renders); the cost is a row
lock and a JSONB write per turn, ~4.3 KB per artifact, and a routing surface where a single alias
hit on a craft domain plus a verb like "review" can inject a 6,000-char marketing playbook into a
worker turn that cannot load its references — the misfire class the 09-02 audit documented, now
rate-limited by the allowlist rather than removed.

**Fix.** Lean: keep `senseDomains` as a pure function for the explicit-ask craft route but delete
`domain-session-state.ts`, `domain-used-signals.ts`, `domain-research-queue.ts`, the
`domainMetadata` artifact field, the trigger (new migration dropping
`trg_chat_turn_runs_terminal_domain_metadata` and the seven helper functions) and the admin
domain-demand page; replace the two native outcome-card signals with two entries in the operational
intent map (`project_audit`, `project_forecast`) and delete `outcome-cards/`. Ambitious: also
delete `domain-sensing.ts` / `domain-load.ts` / `domains/catalog.ts` from the chat path; chat
becomes productivity-only and the 41 craft skills live on the marketing site and the external
agent API. **Decision for DJ:** keep the explicit-ask marketing preload in chat (0 fires in 4.3
days) or not.

**Estimated effect.** −5,281 lines TS/SQL (lean keeps ~2,169 of sensing), −1 DB trigger with a
session-row lock per turn, −4.3 KB per artifact, −115 tests to maintain.

**Risk.** Admin domain-demand analytics loses its feed (it is the only reader). Guard: the
`agentic:health` preload breakdown must still show `task_management` / `document_workspace` fires
after the change; `skill-gate-preload.test.ts` cases for operational preload stay.

### G2 — P1 — The preload wrapper speaks tooling jargon and names tools the worker does not have (prompt edit)

**Claim.** 621 chars (≈156 tokens, 14%) of every rendered block is `Source: operational_intent.`,
`Skill-load gate: SATISFIED BY PRELOAD.`, a `Next step:` sentence forbidding `skill_load` and
`outcome_card_load` "for the cards listed here" (none are listed), a header saying "already loaded
at short format", and "Reference modules and child skills are not loadable on this surface; apply
this playbook as written and state platform-specific claims as unverified."

**Evidence.** `domain-sensing.ts:232-233`, `:866-880`; `skill-gate-preload.ts:342`, `:353-357`;
rendered dump in §2 and `evidence/lane-G-measure-preload.mjs` (`DUMP=1`). `worker-tool-policy.ts:80-85`
confirms neither tool exists on the worker. Also `:359-364` renders "Alternate skill candidates if
this one does not fit: …" on the worker lane, where no alternate can be loaded.

**Cheap-model impact.** Tool names in the prompt are call candidates for a weak model; `skill_load`
is exactly the name the 09-02 audit found emitted as a phantom call. "State platform-specific
claims as unverified" on a task write is a literal instruction a small model may echo into the
reply. The "gate"/"source"/"short format" vocabulary is internal telemetry.

**Fix.** On the worker lane render `Playbook for this turn — <name>:` followed by the body; drop
the `Source`/gate/`Next step` wrapper, the references sentence and the alternates line
(`renderDomainSensingPromptContent` preload branch and `renderWorkerPreloadedSkillPromptContent`).

**Estimated effect.** −156 tokens per preloaded turn; removes two nonexistent tool names from
every preloaded prompt.

**Risk.** None functional; `skill-gate-preload.test.ts` and `build-lite-prompt.test.ts` assert on
the old strings and need updating.

### G3 — P1 — Once-per-history-window dedupe removes the playbook from every following write turn of the same kind while the prompt is rebuilt each turn (architecture)

**Claim.** The system prompt (including `Rules for This Turn`) is regenerated per turn and prior
turns' system prompts are not in `modelHistory`; the dedupe treats the playbook as remembered.
On turns 2–5 of a task-editing session the model gets a 485-char ledger system message saying
`task_management` is "loaded" plus "Do not call skill_load again … Reload only when the current
turn needs full markdown/examples" — and no playbook.

**Evidence.** `worker-turn-preparation.server.ts:636-646` (comment: "A skill therefore fires once
per history window, not once per turn"), `:1192-1222`; `session-service.ts:250-271` (ledger text,
`:262-266` names `skill_load`), `:631-637` (appended as a system message); `HISTORY_LIMIT` default
10 (`worker-turn-preparation.server.ts:126`). Ledger size computed: 485 chars. tasker/80 WP-5
(`tasker/80-agentic-chat-post-audit-follow-through.md:335-338`) proposes widening to a per-session
ledger, which would remove the playbook from every later turn of the session.

**Cheap-model impact.** The turn that most needs the update-by-exact-id rule is typically not the
first write of the conversation. Production since 09-04: 9 of 17 write turns had no preload; the
window dedupe is one of the two possible causes (the other is classifier misses, G11). The ledger
text also re-introduces `skill_load` into every subsequent prompt.

**Fix.** Pick one: (a) render the playbook on every turn where the intent fires and delete the
continuity-row projection, the ledger message on the worker lane and `alreadyLoadedSkillIds`
(keep `skill_preloaded_id` metadata as telemetry only) — cost ≈1,000 tokens per write turn of that
kind; or (b) fold the ~400-token essentials into the tool descriptions / a per-entity string that
always renders on write turns, and delete the preload dedupe with it (this is the G8 direction).
Do not implement WP-5's per-session ledger. **Decision for DJ:** (a) costs tokens on repeat writes;
(b) is the structural change.

**Estimated effect.** Either +≈1,000 tokens on repeat write turns with a playbook present, or
−1,079 tokens on first write turns and a stable ≈400-token rule set on all write turns.

**Risk.** (a) increases spend on write-heavy sessions; guard with the prompt-size budget test and
the health report's preload breakdown. (b) is a prompt-architecture change; the restraint canary
and the three battery write classes must be rerun.

### G4 — P2 — Half the productivity allowlist can never fire; the list and catalog overstate what the worker has (simplify)

**Claim.** Of 12 allowlisted skills, `google_calendar`, `project_creation`, `research_capture`,
`task_state_updates` and `people_context` are in no domain, no outcome card and no intent kind;
`plan_management` is in the intent map but its tools are mounted on no surface; so 6 of 12 are
unreachable and production shows 2 firing.

**Evidence.** `skill-gate-preload.ts:69-82`; §2.1 reachability column; `domains/catalog.ts` grep
(`people_context` appears only as a capability id at `:381`, `:427`, never as a skill);
`operational-skill-intent.ts:44-49`, `:58-63`; `surfaces.ts:125-147` (no plan tools);
`worker-tool-policy.ts:49-71` (all six `people_context` tools unavailable). `google_calendar` and
`calendar_management` are two skills for one tool set (`registry.ts:67-68`).

**Cheap-model impact.** Indirect: authoring effort, tests and the 09-02 "14 never preloadable"
list keep pointing at skills as the fix for behaviors the worker cannot express. A user asking
"who is Ana?" or "make this goal a plan" hits a capability gap that no playbook can close.

**Fix.** Shrink the allowlist to what can fire (task, document, calendar, audit, forecast,
context-engineering) or to what G8 keeps; delete `google_calendar`; rewrite or unpublish
`project_creation` (payload shape no longer matches the shell adapter); route `plan` and contact
capabilities to Lane B as mount decisions.

**Estimated effect.** −6 entries of false capability; −1 duplicate skill (8,676 bytes).

**Risk.** Marketing pages list these skills; unpublishing changes public content. Guard:
`skill-registry-disk-parity.test.ts`.

### G5 — P2 — What renders from the operational SKILL.md files is written for a different runtime (prompt edit)

**Claim.** The rendered blocks (a) name tools by dotted op ids the tools array does not use
(task_management 16, document_workspace 17 references), (b) tell the model to use tools that are
not mounted (`onto.task.docs.*`, `delete_onto_document`, `onto.task.search`), (c) repeat rules the
same section and the tool description already carry (exact-id rule 5× on a task-write turn;
`state_key` rule verbatim twice in the same section), (d) render a create example on update turns
because only `examples[0]` renders, and (e) carry 15 lines of `### Direct tool packaging` that the
parser never lifts.

**Evidence.** §3; `task_management/SKILL.md:65-67`, `:70-84`, `:95`, `:102`, `:141`;
`document_workspace/SKILL.md:44`, `:64`; `markdown-skill.ts:263-277`; `skill-gate-preload.ts:349`;
`situational-rules.ts:54-58`, `:73-78`; `apps/worker/src/workers/agentic-chat/mutationToolCatalog.ts:269-270`,
`:471-472`; §2.7 cross-check.

**Cheap-model impact.** Name translation (`onto.document.tree.get` → `get_document_tree`) is a
step a strong model does silently and a weak one gets wrong; the one-engine work removed alias
folding on purpose (`surfaces.ts:203-210`), so a dotted name emitted as a call is an unknown tool.
Repetition spends tokens and dilutes the one rule per block that is not elsewhere.

**Fix.** Rewrite the three reachable operational skills in tool names only, ≤40 lines each,
with the update example first for task/document; delete the packaging sub-bullets; remove rules
already in the write rules or the tool description overrides.

**Estimated effect.** task_management 3,976 → ≈1,600 chars (−600 tokens per preloaded turn);
zero unmounted tool names in rendered playbooks.

**Risk.** Marketing pages render the same files; keep the public copy readable. Guard: the
`crosscheck-skill-tools.mjs` script as a test.

### G6 — P1 — `Rules for This Turn` is no longer situational: ≈500 tokens of web-research and delegation rules render on every worker turn (prompt edit)

**Claim.** The web-research block triggers on `web_search`/`web_visit` being mounted and the
delegation block on `delegate_task` being mounted; since 09-04 all three are on every global and
project surface, so both blocks render on every turn including pure reads — the trigger class the
09-02 audit fixed for write rules (Findings 9/10).

**Evidence.** `situational-rules.ts:46`, `:147` (`webToolsMounted`), `:18-19` (premise: "those
tools mount only when research is plausible" — no longer true); `surfaces.ts:110-112`;
`worker-turn-preparation.server.ts:660-664` (delegation keyed on mount by design); measured 1,258 +
736 chars (§2.3).

**Cheap-model impact.** Five bullets of web-research procedure on "mark the vendor call done" and
three on "what is due this week" are attention spent on the wrong rules; ≈500 tokens × ≈3 passes
per turn; the block sits after the cached static prefix so it is paid on every pass.

**Fix.** Key the web block on `looksLikeWebResearchTurn` (already exists, `:130-134`) or reduce it
to one line; move the one restraint sentence of the delegation block
("Tool availability alone does not commission an Agent Run") into the `delegate_task`
description and drop the block. (Overlaps the prompt lane; reported here because the section is
where the preload lands.)

**Estimated effect.** −≈500 tokens per worker turn on non-research turns; −≈1,500 tokens per
3-pass turn.

**Risk.** Research turns that do not match the regex lose the rules; guard with the 09-08 research
canaries (`artifacts/agentic-chat-research-postdeploy-2026-09-08.md`) and
`situational-rules.test.ts`.

### G7 — P2 — Research persistence has no carrier on the worker (capability gap)

**Claim.** `research_capture` cannot fire on the worker (G4), and the worker's web-research rules
omit the persistence rule the web lane had ("Research you do not write down is lost … save what you
learned into a project document"); a user who asks "research X for this project" gets a chat-only
answer.

**Evidence.** `situational-rules.ts:84-88` (web lane, line 3) vs `:90-96` (worker lane, no
persistence line); `research_capture/SKILL.md:41-49`, `:143-149` (Provenance: the skill was written
from a measured 2/5 failure on exactly this); `artifacts/agentic-chat-research-postdeploy-2026-09-08.md`
("Its prompt contains the focused document and no legacy 'save all research' or implicit-capture
instruction").

**Cheap-model impact.** A weak model does what the prompt says; with no persistence rule it
answers and stops. The research the user paid for (Tavily + visits + passes) is lost when the
session ends.

**Fix.** One line in the worker web-research block (conditional on ≥2 web calls) or a
deterministic post-turn capture; either way not a skill. **Decision for DJ:** should chat auto-save
research into a project document (the 07-25 decision said yes; the worker lane dropped it)?

**Estimated effect.** Capability restored on research turns; +≈60 tokens on research turns only
if G6 is done.

**Risk.** Unwanted documents on quick lookups; the research_capture Judgment table's "≥2 calls"
threshold is the guard.

### G8 — P2 — The skill abstraction is the wrong unit for the worker; fold operational knowledge into tool descriptions plus a per-entity playbook string (architecture, decision)

**Claim.** The 11-block ontology, short/full formats, child skills, 77 reference modules,
`activation`/`altitude`/`skill_type` enums, the 772-line linter and the 8–20 KB authoring targets
exist for a dynamic-load runtime the chat no longer has; the worker renders a fixed ≤6,000-char
projection of ≤6 skills, and production uses 2.

**Evidence.** §4; `AUTHORING_GUIDE.md:93-97`; `skill-gate-preload.ts:113`, `:337-367`;
`markdown-skill.ts` (406 lines of parser feeding a payload of which the worker reads 6 fields);
`skill-authoring-validation.ts` (772, test-only importer); §2.2 production breakdown.

**Cheap-model impact.** Everything in §3 and §5 G2/G5 is downstream of this: jargon, dotted names,
duplicated rules, a create example on update turns, a cap that truncates, and a dedupe that
assumes memory. A weak model needs a short, stable, tool-named rule set on every write turn, not a
document.

**Fix.** Move the per-call rules into the worker's mutation description overrides (already the
"right place for point-of-use guidance" per 09-02 §6); keep one `WORKER_ENTITY_PLAYBOOKS`
constant in `packages/agentic-chat-runtime` with ≤40-line task / document / calendar strings in
tool names, rendered by the existing operational intent map on every write turn of that kind;
keep `SKILL.md`, the parser, `skill-load` and `skill-reference-load` for `/skills` and the external
gateway. Delete the worker preload renderer, the ledger projection, the `domainMetadata` path.

**Estimated effect.** Per write turn: a stable ≈400-token rule block instead of 0 or 1,079 tokens
depending on window position; −≈1,000 lines of chat-path code; skill authoring stops being on the
chat critical path.

**Risk.** Two copies of operational truth (SKILL.md for the public, runtime string for chat) can
drift; guard with a test that each runtime string names only mounted tools. Prompt regression
guard: the three write classes in the battery.

### G9 — P3 — Dead modules and dead branches (delete)

**Claim.** The following have no non-test importer or are reachable only under
`dynamicSkillTools: true`, which no production caller sets: `skills/skill-search.ts` (192),
`tools/work-capabilities/*` (46), `tools/resources/resource-registry.ts` (215),
`resolveSkillPreloadById` and the `project_domain_affinity` reason (`skill-gate-preload.ts:190-199`,
`:248`), `getSkillGateCandidateSkillLoadFormats` (`domain-sensing.ts:820-850`),
`renderDomainSensingPromptBlock` (`:960-963`), the non-preload render branch (`:882-958`),
`listExplicitAskOnlyDomainIds` (`domains/catalog.ts:874-878`), `renderPreloadedSkillPromptContent`
(`skill-gate-preload.ts:297-329`), `buildMidTurnSituationalNotice` (`situational-rules.ts:231-242`),
`WRITE_TURN_RULE_LINES` / `WEB_RESEARCH_RULE_LINES`, the catalog table + skill-routing bullet
(`build-lite-prompt.ts:1116`, `:1268-1310`), 12 of 17 exports in `project-domain-profiles.ts`
including the fiction starter overlay (`build-lite-prompt.ts:237-240`, `:333-337`), and
`materializedToolNames` on the preload (computed via `resolveRelatedOps`, read nowhere on the
worker).

**Evidence.** Import graph in §2.5 (rg over `apps`/`packages` excluding tests); production
scaffold callers listed in §1.7.

**Cheap-model impact.** None directly; these are branches an engineer must reason around when
changing what the model sees, and tests that assert on prompts no user receives.

**Fix.** Delete; keep `scaffold-variant.ts` variants only if the eval runner still needs them.

**Estimated effect.** −≈1,400 lines identifiable plus their tests.

**Risk.** `lite-turn-runner.ts`, `build-lite-prompt-preview.ts` and `compare-lite-shadow.ts`
build web-scaffold prompts for evals; decide whether those evals still model production.

### G10 — P3 — Stale comments and config that will mislead the next change (bug)

**Claim.** `operational-skill-intent.ts:51-56` says calendar tools "are not executable on the
worker today" (they are since 09-04, `worker-tool-policy.ts:36-41`); the `explicitAskOnly: false`
state of the four design domains (`domains/catalog.ts:497-667`) lets sensing open the gate for
skills the allowlist then refuses with `not_allowlisted` — dead configuration on the worker;
`plan_management/SKILL.md:106` vs `:130` contradict each other on append/merge; the ledger footer
(`session-service.ts:262-266`) and `PRELOADED_NEXT_STEP` reference tools that exist on no lane.

**Fix.** Delete or correct with the G1/G2 work.

### G11 — P3 — One regex classifier gates both the playbook and the worker's write-route rule (simplify)

**Claim.** `looksLikeMutationTurn` (`operational-skill-intent.ts:201-203`) decides whether the
model is told "Writing to an existing entity: call declare_turn_contract first"
(`situational-rules.ts:74`) and which playbook fires. Its question-lead rule
(`:90-91`, `:182-184`) drops polite asks that lack a strong pattern — "Can you schedule a call with
Ana tomorrow?" hits no `STRONG_MUTATION_PATTERNS` entry (`:68-80`; the calendar idiom requires
"on/onto my calendar") — so such a turn gets neither the calendar playbook nor the write rules, and
the worker's redirect-to-contract behavior (audit F-A3) is the model's first notice.

**Cheap-model impact.** One extra round on misses (direct write withheld → contract route), and
no `state_key` / exact-id rule on the turn that needed it.

**Fix.** Render the 840-char worker write rules whenever a write tool is on the surface (the
09-02 objection was rendering on pure questions; the worker rules are four lines, not the old
block), and use the classifier only to choose the playbook.

**Estimated effect.** +210 tokens on read turns, −1 round on classifier misses of write turns.

---

## 6. What is right and must not be undone

- **`operational-skill-intent.ts` as the preload router.** Deterministic, keyed on mounted tools,
  cannot misfire on prose; the only component of this subsystem with production output.
- **Lane-aware rendering with a hard character cap** (`WORKER_PRELOAD_MAX_CHARS`,
  `capPreloadContent`) — right instinct even if the cap should be lower.
- **The productivity allowlist as the single chokepoint** (`resolvePreloadReason`) — one place
  enforces the 09-03 decision.
- **Worker prompt never names a dynamic skill tool in its static sections** — the
  `dynamicSkillTools: false` gating in `build-lite-prompt.ts` and `situational-rules.ts` is
  correct and complete; the leaks are only in the preload wrapper and the ledger.
- **`skill_preloaded_id` / `skill_preload_source` on the user message** — cheap, durable telemetry
  that made §2.2 measurable.
- **The mutation description overrides on the worker** (`mutationToolCatalog.ts`) — the right home
  for per-call rules; G8 moves more there.
- **Skill files as public content and external-agent payloads** — the format, parser and
  reference loader are fine for `/skills` and `skill_load(full)` over the agent API.

---

## 7. Proposal — the minimal skill system that delivers value on the worker

**Which skills.** Three entity playbooks: task, document, calendar. Add audit/forecast only if a
battery case shows the analysis turns need more than `get_project_overview` + `explore_project`
guidance in the tool descriptions.

**Which trigger.** The existing `resolveOperationalSkillForTurn` (verb/noun + mounted tools),
extended with two lines for audit/forecast phrases if kept. No domain sensing, no outcome cards,
no session state, no DB trigger, no dedupe.

**Which size.** ≤40 lines / ≈400 tokens each, tool names only, update example first, rendered on
every write turn of that kind under a plain heading (`Playbook — tasks:`). Everything that is a
rule about one call moves into that tool's description override.

**Delete (chat path).** `domain-session-state.ts`, `domain-used-signals.ts`,
`domain-research-queue.ts`, `outcome-cards/*`, `work-capabilities/*`,
`resources/resource-registry.ts`, `skill-search.ts`, the `domainMetadata` artifact field and
trigger, the preload continuity rows + ledger on the worker lane, `renderPreloadedSkillPromptContent`
and the web-lane rule constants, the catalog table, the fiction starter overlay path, the
`project_domain_affinity` route, `google_calendar`. Move `admin/chat/domains` off the feed or
delete it.

**Keep for the marketing site / external agents.** `skills/definitions/**`, `registry.ts`,
`markdown-skill.ts`, `skill-load.ts`, `skill-reference-load.ts`, `skill-reference-visibility.ts`,
`skill.schema.ts`, `AUTHORING_GUIDE.md`, `EVALS_GUIDE.md`, `lib/server/agent-skills.ts`,
`routes/skills/**`, `routes/agent-skills/**`. Move `skill-authoring-validation.ts` next to its
test or into a `scripts/` lint. Decide separately whether `domain-sensing.ts` / `domain-load.ts` /
`domains/catalog.ts` stay for the explicit-ask craft route (G1 decision).

**Lean vs ambitious.** Lean = G2 + G6 + G10 (prompt edits, a day, −≈650 tokens per preloaded
turn, −≈500 per turn everywhere). Ambitious = G1 + G3(b) + G5 + G8 + G9 (delete ≈6,500 lines and
one trigger; replace the skill projection with three runtime playbook strings; every write turn
gets the same short, correct, tool-named rules). The ambitious version is what "a cheap model does
the work cleanly" needs; the lean version only trims the current machine.

---

## 8. Cross-lane notes

- Lane B: `create_onto_plan` / `update_onto_plan` / goal / milestone / risk writes are executable
  on the worker (`worker-tool-policy.ts:27-32`) but mounted on no surface; the `create_onto_project`
  description (`catalog/definitions/ontology-write.ts:748-751`) still says "always include project,
  entities, and relationships" while the adapter creates a shell.
- Lane E/harness: unknown tool names emitted from dotted op ids in playbooks are the
  `provider_tool_not_allowlisted` class; this lane removes the source, not the repair.
- Prompt lane: G6 overlaps; the numbers here are for the worker scaffold only.
- Data: the terminal domain trigger holds a `FOR UPDATE` on `chat_sessions` per turn; if anything
  else in the terminal path locks that row, this is a serialization point worth confirming before
  the drop migration.
