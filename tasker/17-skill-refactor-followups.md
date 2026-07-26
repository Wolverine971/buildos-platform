<!-- tasker/17-skill-refactor-followups.md -->

# 17 — Skill ontology refactor: verification debt + DJ decision queue

**Priority:** P3 — the refactor is committed, green, and in daily use; this is quality debt
**Type:** Engineering review + DJ decisions
**Live-test runbook:** `docs/testing/SKILL_ONTOLOGY_LIVE_TEST_PROMPTS.md` (moved out of `tasker/`
2026-07-24 — it is a runbook, not a tracker)

## State (refreshed 2026-07-24)

All SKILL.md files were migrated to the canonical block ontology; the validator is live; the skills
test suite and typecheck are green. Committed in `2655b199`. The planned adversarial review never
happened before that commit, so the review debt below is post-hoc.

The routing/enforcement fix wave — skill-load gate in domain sensing, broader lite-prompt skill
policy, current-date anchoring for project creation, alias word-boundary matching (the `ui`-inside-
"BuildOS" false positive), story/narrative recall terms, and deterministic finalization repair when
a gated turn answers without a loaded skill — **is committed and deployed.** The old "local/
uncommitted" caveat is stale.

A partial rerun of the live suite proved the date fix and script/hook skill loading. Content
fidelity was uneven and the **full suite has never been rerun** against the fixed environment.

## Loose ends

1. **Run the full post-fix live suite** — `docs/testing/SKILL_ONTOLOGY_LIVE_TEST_PROMPTS.md`.
   Fresh project-scoped chat per prompt; **no `skill_load` on a gated turn = routing failure, stop
   scoring that turn's content.** Confirm the fixes are active first: look for `Skill-load gate:
ACTIVE` in the prompt snapshot and a `Current date:` line in project-create turns.
2. **Five skills still need fidelity verification** — `sensory_double_tap`,
   `ui_ux_quality_review`, `usability_quick_research`, `viral_video_script_structure`,
   `youtube_channel_craft_for_founders`. All five still exist (verified 2026-07-24). The
   auto-verifier's known blind spot is _silently dropped rendered content_ — `project_creation`
   passed it while dropping content — so sample-diff these against pre-refactor rather than
   trusting the verifier. Highest risk: `viral_video_script_structure` (largest file, 342 lines).
3. **Cold-email sensing recall** — "cold-emailed" can still return null because the scorer lacks
   stemming/alias coverage, so the gate may not fire for that family.
4. **DJ decision queue** — DRY single-owner rulings (`calendar_management` ↔ `google_calendar`,
   UI-review ×8, cold-email ×11, content/lens ×9, ontology entity-chain dupes); merge candidate
   `project_audit` ↔ `project_forecast`; reference-extraction candidates
   (`viral_video_script_structure`, `cold_email_learning_review`); ratify the synthesized
   `google_calendar` Contract. **Note:** the skill set has churned since this queue was written
   (7/03) — re-derive the duplicate list before spending DJ time on stale pairs.
5. **Validator soundness questions** — orphan_dependency relaxation,
   `migrated_requires_preserve_markdown` invariant, alias-map collisions,
   `stripReferenceFrontmatter` regex, `internal-default` vs `(internal default)` spelling.

## Done when

Full live suite rerun and logged, the 5 skills verified or fixed, DJ rulings recorded, and the
validator questions answered or dismissed.
