<!-- tasker/52-ai-inbox-review-loop-remediation.md -->

# 52 - AI Inbox / Project Review Loop Remediation

**Created:** 2026-08-13
**Priority:** WP-1 is a live correctness bug (P0); WP-2 is a cheap quick win; WP-3 is the structural build
**Type:** Remediation build handoff
**Terminology:** `docs/product/PROJECT_REVIEW_TAXONOMY.md`
**Origin:** [AI Inbox Project Review Loop Audit 2026-08-13](../apps/web/docs/technical/audits/AI_INBOX_PROJECT_REVIEW_LOOP_AUDIT_2026-08-13.md), independently verified against code and production the same day. DJ ratified the adjusted direction on 2026-08-13.

## Implementation update — 2026-08-13

- **WP-1 complete locally:** executable Project Review suggestions now resolve target and destination IDs against current project state, produce a canonical `verified_change_summary`, fail closed with structured diagnostics, and revalidate before direct or clarified approval. Raw model-authored operations are no longer rendered in approval UI or inserted into discussion/agent prompts.
- **WP-1 production sweep applied:** two executable proposals with model/ID mismatches were quarantined. The known Mood Board proposal remains preserved as source history (`project_suggestions.status = pending`) while its inbox row is `expired` with `source_status = proposal_quarantined:model_entity_mismatch`.
- **WP-2 complete and applied:** drift observations remain in Project Review history but no longer enter the attention inbox. Existing unresolved drift rows were expired as `observation_not_admitted`.
- **Visible production delta:** unresolved Project Review inbox rows fell from **18 pending / 44 deferred / 62 total** to **7 pending / 31 deferred / 38 total**. The visible queue now contains 2 `doc_org` changes and 5 `audit_recommendation` findings; no drift items remain.
- **Verification:** deterministic resolver coverage includes current title/destination resolution, label/ID mismatch, multi-operation swapped IDs, preview count mismatch, rename behavior, inactive and cross-project entities, changed tree/operation state, and explicit partial-failure policy. Shared typecheck, web `svelte-check`, and focused web/worker tests pass.
- **WP-3 implemented locally (2026-08-14):** DJ's brief-surface interview is captured below. The light Project Review now produces a typed, post-generator project-manager synthesis; only `decision`/`urgent` briefs enter AI Inbox, Complete Project Audit owns one parent packet, and underlying findings remain evidence/execution objects instead of standalone cards.
- **WP-3 schema hosted; runtime not deployed (2026-08-14):** migration `20260814020000_project_review_manager_brief_inbox.sql` is recorded in the linked production ledger and its fetched receipt is byte-identical to the local source (SHA-256 `771cd0157d2bcc6c3b4140f3d249a74ee8c49e6d37b818a00f7907fbdab80638`). A receipt-isolated post-apply dry run reports the remote database up to date. The worker/web code remains local, so the new brief producer and UI are not live yet.
- **Hosted migration verification:** all 59 audit-linked suggestions have zero active standalone child inbox rows. There are currently zero waiting v2 manager briefs, zero duplicate/precedence cleanup targets, and zero active `project_review` inbox rows. The runtime itself supersedes older v2 briefs and lets an active Complete Project Audit own the decision; no additional data-repair migration is required.

## Where this picks up

The audit found that Project Review loops generate diagnoses faster than DJ resolves them, that most inbox items carry no executable change, and that model-authored proposal prose can diverge from the stored operations that would actually execute. A second agent (this handoff's author) independently verified **every load-bearing claim** — code paths read directly, production re-queried fresh — and DJ approved a re-sequenced plan.

**Already done — do not redo:**

- **Tier 1 presentation work is committed** in `d72960f5d` (card hierarchy project → ask → why, `Approve change`/`Mark handled`/`Discuss` labels, single `Details` disclosure, truthful `pending · held` counts, metadata/risk demotion). The audit's "Tier 1 implementation update" section documents it with verification results.
- **The audit document itself** is committed and is the canonical evidence base. Its code reference index is accurate — all cited line ranges were re-read and confirmed on 2026-08-13.

**This doc hands off three work packages plus an explicit deferred list.** Do them in order; WP-1 and WP-2 are independent of each other but both much smaller than WP-3.

## Verification facts the audit does not contain

These came from the independent verification pass (re-runnable via `scripts/audits/verify-inbox-review-loop.mjs`, SELECT-only):

1. **The wrong-document proposal is LIVE and pending.** Project 9takes has **two** pending proposals titled about grouping Instagram content under "Mood Board Carousel Strategy":
    - An older 3-operation proposal whose IDs all resolve correctly.
    - A newer 2-operation proposal whose label/preview say "Move The Mirror Moment" but whose first `move_document_in_tree` operation targets a document that currently resolves to **"03 — Quality Contract & Failure Recovery"**. Approving it moves the wrong document.
    - Find them with: `project_suggestions` where `title ilike '%Mood Board Carousel%'` and `status = 'pending'`. The 2-op row is the corrupted one. This pair is simultaneously the proposal-integrity proof AND a live semantic-duplicate pair.
2. **Table name landmine:** the suggestions table is **`project_suggestions`**, not `project_loop_suggestions` (runs are `project_loop_runs`, audits are `project_audits` / `project_audit_suggestions`). The audit's reproduction queries have been corrected in place.
3. **Workload re-verified (2026-08-13 evening, later than the audit snapshot):** 18 pending / 44 deferred / **62 unresolved across 9 projects** (audit snapshot: 19/41/60 across 7). The backlog grew during the day the audit was written.
4. **Deferred promotion gap (new finding):** three projects have 0 pending but 2 deferred items each. `applyProjectAttentionBudget` only runs when a producer syncs or the inbox is read for that project, so deferred rows in untouched projects **never resurface on their own**. Whatever WP-3 does with the deferred queue must account for this; don't build a promotion sweep first, since WP-3 likely eliminates the deferred queue entirely.
5. **Adoption by kind (since Jul 1, explicit outcomes only):** document cleanup (doc_org + doc_outdated) ran **12 applied : 1 rejected**. Drift: effectively zero adoption (39 of 90 August suggestions were drift). Task conflicts: zero, all superseded. This data is the justification for WP-2.
6. **August generation vs consumption (all projects):** 90 generated, 56 still pending, 17 superseded, 17 explicitly resolved (8 applied / 4 rejected / 5 addressed).

## Ratified decisions

DJ approved the audit's "Decisions for the reviewing agent" (§ near the end) with **one amendment**:

1. Inbox is for decisions and executable changes, not observations — **yes**.
2. At most one primary unresolved review brief per project — **yes**.
3. Secondary findings live inside the brief, not a deferred queue — **yes**.
4. Complete Project Audit appears as one packet — **yes**.
5. User-visible changes derive from resolved operations, never model labels — **yes** (verified live; this is WP-1).
6. New runs require enough new information to improve/replace the current brief — **yes**.
7. ~~`Addressed` must record a concrete next step~~ — **REJECTED**. Forcing a typed plan on every dismissal adds friction. The real fix is admission (diagnosis-only items don't get in), after which `Mark handled` is rare. Keep `Mark handled` lightweight.
8. Success = project progress and recurrence, not suggestion volume — **yes**.

Sequencing amendments DJ also approved:

- **Pull the drift admission cut forward** as an immediate quick win (WP-2) rather than waiting for synthesis.
- **Collapse the audit's Phases 1+2+3 into one build** (WP-3): synthesis output IS the admission unit; an audit packet is just that brief when a complete audit ran. Do not build them as separate sequential phases.
- **Skip the six-factor value-scoring rubric entirely** (audit Phase 2 §3). At current single-user scale, one brief per project leaves almost nothing to rank.
- **Keep WP-1's fail-closed checks deterministic** — no LLM judge for prose/ops comparison.

## WP-1 - Proposal correctness gate (do first)

**Goal:** make it impossible for the displayed change and the executable operations to diverge. This is the audit's Phase 0, unchanged in substance.

**Root cause (verified):** `decodeLoopOperation` in `packages/shared-agent-ops/src/proposal-context/decode-operations.ts` derives `target` from model-authored `args.title`/`args.name`, trusts `op.label` as the summary, and renders `new_parent_id` as a raw value. Nothing ever resolves operation entity IDs against current entities.

**Build:**

1. Server-side resolution layer: for every operation, load target + destination entities by ID (`onto_documents` etc.), validate project ownership, existence, and expected current state.
2. Produce a canonical `verified_change_summary` from resolved entities; render ONLY that in approval surfaces (`InboxChangeDetails.svelte` and the shared decode path).
3. Deterministic mismatch checks — operation count vs preview move count; resolved entity names must appear in the label/preview (fuzzy/normalized match is fine). On mismatch: **fail closed** — quarantine the proposal out of the inbox with a structured diagnostic reason, never show it.
4. Revalidate immediately before execution (protects against post-generation renames/moves/archives).
5. **Retroactive sweep:** run the resolver over all currently unresolved (`pending` + `deferred`) executable proposals and quarantine mismatches. This is what actually kills the live 9takes proposal — verify it gets caught.

**Code refs:** suggestion contract `packages/shared-types/src/project-loops.types.ts` (~L120-189); row construction `apps/worker/src/workers/project-loop/projectLoopWorker.ts` (~L3057-3097); decoder as above; disclosure component `apps/web/src/lib/components/inbox/InboxChangeDetails.svelte`. Trace the mutation replay/execution path before building step 4.

**Tests (from audit "Required test coverage → Proposal integrity", all still wanted):** correct title resolution; destination resolves to current parent name; label/ID mismatch quarantines; preview/ops count mismatch quarantines; post-generation rename shows current truth; archived/deleted/moved target blocks approval; cross-project target rejected; multi-op atomicity or explicit partial-failure policy.

## WP-2 - Drift admission cut (quick win, independent of WP-1)

**Goal:** stop admitting diagnosis-only drift findings to the attention inbox. Justification: adoption data in verification fact #5; drift is 39/90 of August generation with ~zero adoption.

**Build:**

1. In `mapProjectSuggestionToInboxItem` (`packages/shared-agent-ops/src/inbox-index.ts` ~L455-506), stop producing attention rows for `kind === 'drift'` (decide during implementation whether `task_conflict` joins it — volume is tiny either way). Keep generating drift suggestions in the worker: they remain review history and become synthesis evidence in WP-3.
2. Retire existing unresolved drift inbox rows (expire with a source_status like `observation_not_admitted`, mirroring the existing `grouped_into_project_audit` pattern) so the 62-row backlog honestly shrinks.
3. Leave `audit_recommendation` admission alone for now — it folds into audit packets in WP-3, not here.
4. Check both sync paths converge (worker post-run sync AND web read-path backfill in `apps/web/src/lib/server/inbox.service.ts` ~L949-1368) so drift rows can't leak back in, and that pending/held counts stay truthful.

**Expected visible effect:** the dashboard inbox drops from ~18 pending to roughly the executable + audit items, and held counts shrink sharply. Tell DJ what the before/after counts were.

## WP-3 - One brief per project (the structural build)

**Goal:** replace "N generator outputs per project, 3 visible, rest deferred" with **at most one primary review brief per project**, synthesized after candidate generation. This collapses audit Phases 1 (synthesis), 2 (admission), and 3 (audit packets) into one build, plus the Phase 5 trigger gate.

**⚠️ Interview DJ before building the brief surface.** DJ explicitly wants to be interviewed on the shape of the brief (what it leads with, how secondary findings/options render, how Approve/Discuss work on a packet) before implementation. Lead with an open-ended "describe what you're envisioning for the project brief card"; he'll say where he has no vision — then you decide.

**Build outline:**

1. Implement the already-scoped final synthesis from `tasker/34-project-review-holistic-synthesis.md` (read it fully — it specifies the typed result shape: `state_summary`, `what_changed[]`, `what_matters_now[]`, `decision_item_ids[]`, `no_attention_reason`, etc.). Move/replace the pre-generator brief accordingly (`projectLoopWorker.ts` ~L2898-2974).
2. Admission = synthesis output: one primary brief per project; verified changes / bounded decisions / concrete tasks as its actionable children; observations stay inside as evidence. `no_attention_required` is a successful outcome — no item is created.
3. Audit packets: when a Complete Project Audit ran, the brief IS the packet. Note the code's two competing shapes — `mapProjectAuditToInboxItem` returns `null` for `ready` audits while `syncInboxItemForProjectAudit` marks the parent no-action and indexes children individually (`inbox-index.ts` ~L508-548, ~L680-719). The helper `expireInboxItemsForProjectAuditChildSuggestions` (~L722-755) already exists for regrouping children into a packet. Determine whether the current child-indexing behavior was an unfinished migration or a reversal before changing it (git history will say).
4. Trigger gate (audit Phase 5, cheap version): before queueing a light review, skip if an unresolved brief exists and no material evidence change occurred since it was produced. Burst config: `apps/web/src/lib/server/project-loop-burst.service.ts` (threshold 4 in ~L20-22, weights ~L90-99 — one doc move/archive alone triggers); end-of-day enqueue: `apps/worker/src/workers/project-loop/enqueue.ts` (~L403-501).
5. This should make the deferred queue and its promotion gap (verification fact #4) obsolete — verify no orphaned `deferred` rows remain for migrated projects.

**Explicitly skipped (ratified):** the six-factor value-scoring rubric; per-item ranking beyond simple ordering inside the brief.

**Tests:** the audit's "Synthesis and deduplication" + "Inbox admission and ranking" coverage lists, minus value-score cases.

### WP-3 interview result — 2026-08-14

DJ supplied an authenticated AI Inbox screenshot and described the desired manager behavior.
The current audit follow-ups expose internal review language (`drift_scope_control`,
`documentation_quality`), ask the user to invent the plan, and provide truncated evidence without
enough context. DJ would dismiss both example items because neither explains what is actually wrong,
which documents are involved, or what the assistant recommends.

The ratified brief direction is now captured in
[`docs/product/PROJECT_REVIEW_MANAGER_BRIEF.md`](../docs/product/PROJECT_REVIEW_MANAGER_BRIEF.md):

- one project-manager synthesis receives separate project/document/task findings;
- bottom line and recommendation come first;
- the manager asks one direct question only when DJ's judgment is required;
- minor issues are labeled and kept out of the attention inbox;
- ordinary-language entity links replace opaque evidence chips;
- common-sense work may be automated only when it is deterministically allowlisted, verified,
  reversible, and truthfully receipted;
- Complete Project Audit uses the same manager-brief packet instead of child recommendation rows.

Research checked for the framing: Army BLUF/plain-writing guidance, management-by-exception project
governance, Amazon's reversible two-way-door decisions, and concise executive status-report patterns.

### WP-3 local implementation — 2026-08-14

- `project_loop_runs.brief.version = 2` is now the evidence-bound post-generator manager synthesis.
  It records attention level, bottom line, recommendation, one bounded decision, typed project /
  document / task issues, candidate membership, entity evidence, and reversible cross-kind clusters.
- The sanitizer rejects internal snake-case labels and the exact academic audit language seen in the
  authenticated screenshot. A model may raise severity, but cannot downgrade a deterministically
  important candidate below `decision` / `urgent`.
- `project_review` is a first-class inbox source. `none` and `minor` reviews finish successfully
  without an attention row; `decision` and `urgent` produce at most one unresolved manager brief.
  The brief's direct action can execute only one integrity-verified `recommended_suggestion_id`.
- Complete Project Audit now admits the ready parent packet and expires its child suggestion rows.
  A ready audit supersedes a light manager brief, and a light review stays out of the inbox while an
  audit packet already owns the project decision.
- Automated enqueue skips an unchanged project when an unresolved v2 brief exists and no newer
  `project_review_signals` evidence was recorded. Manual review still bypasses the gate.
- Dashboard and project-workspace cards lead with **Decision needed**, the bottom line, **My
  recommendation**, one question, and ordinary-language links to the actual documents/tasks.
  Secondary issues stay under one disclosure. Minor/no-attention results remain visible only on the
  project surface, not as pings.
- The Complete Project Audit scaffold no longer emits “choose the canonical project documents.” It
  names the available documents and recommends a concrete keep/fold/update action. The UI also
  rewrites that legacy phrase for already-stored audit packets.
- Common-sense auto-execution is deliberately not claimed here: no cleanup is run automatically
  until a deterministic tool allowlist, integrity check, reversibility rule, and truthful receipt
  path exist.

**Focused verification:** 36 worker mapper/generator/gate tests and 60 affected web component,
service, and route tests pass. Shared types, shared agent ops, and worker typechecks pass. The full
web check reaches one unrelated pre-existing error in `routes/projects/[id]/+page.svelte`
(`onCreateTask` is not a current component prop); the touched Svelte components have no autofixer
issues.

**Latest production baseline (SELECT-only, 2026-08-14; before WP-3 runtime deployment):** 14 pending + 9
deferred = 23 unresolved standalone Project Review rows. The visible mix is 3 drift, 6 outdated-doc,
and 5 document-organization rows. This confirms new producer output can reintroduce drift until the
local admission code is deployed; the earlier quarantined Mood Board mismatch remains expired.

## Deferred - do not build

- Value-scoring rubric (audit Phase 2 §3).
- Signature animation / operation-preview transition (audit Tier 3) — waits until correctness + synthesis are stable.
- Forcing `Addressed`/`Mark handled` to record a concrete next step (rejected decision #7).
- Deferred-row promotion sweep (obsoleted by WP-3; only revisit if WP-3 stalls).

## Success criteria

The audit's "Success criteria" section stands, with the August baseline now: **90 generated → 17 explicitly resolved**. Headline targets: 0 display/execution mismatches; every attention item is a verified change, bounded decision, or concrete task; at most one primary brief per project; ≥50% of surfaced items decided within 7 days; generated-to-resolved ratio substantially improved. Instrument the generation → admission → decision funnel counts as part of WP-3 (cheap; do it early so the synthesis change has a baseline).

## Tooling

- **Baseline script:** `scripts/audits/verify-inbox-review-loop.mjs` — SELECT-only, reads `apps/web/.env`, prints workload by project, visible-queue composition, the Mood Board proposal resolution check, and August stats. Re-run before and after each WP to show DJ the delta.
- **Focused tests:** the Tier 1 commit added component tests under `apps/web/src/lib/components/inbox/`. `pnpm check` and the focused Vitest suite were green at handoff.

## Reading order for the picking-up agent

1. This doc.
2. The [audit](../apps/web/docs/technical/audits/AI_INBOX_PROJECT_REVIEW_LOOP_AUDIT_2026-08-13.md) — especially "Critical proposal-integrity findings", "Recommended target operating model", and the code reference index (verified accurate).
3. `tasker/34-project-review-holistic-synthesis.md` (WP-3's core spec).
4. `docs/product/PROJECT_REVIEW_TAXONOMY.md` (vocabulary; "agent loop" is reserved — these are review passes).
5. Run the baseline script.
