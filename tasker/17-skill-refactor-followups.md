<!-- tasker/17-skill-refactor-followups.md -->

# 17 — Skill ontology refactor: post-commit review debt + DJ decision queue

**Priority:** P2 — refactor is committed and green; this is quality debt + rulings
**Type:** Engineering review + DJ decisions
**Sources:** committed skill ontology implementation, collapsed 7/02 routing assessment handoffs, and local diff review against the skill definitions

## State

All 52 SKILL.md files migrated to the canonical block ontology; validator live; 55/55 skills tests green; typecheck clean. **Committed in `2655b199` — but the planned adversarial review did not happen before commit.** The commit shipped anyway, so the review debt is now post-hoc.

## Routing assessment status (collapsed 2026-07-03)

The first live test did not verify the refactored skills: project creation ran, but the script and hook turns produced base-model output with zero `skill_load` calls, and "end of July" persisted as `2025-07-31`.

The follow-up local fix wave added: a skill-load gate in domain sensing, broader lite-prompt skill policy, current-date anchoring for project creation, alias word-boundary matching (fixing the `ui` inside "BuildOS" false positive), story/narrative recall terms, and a deterministic finalization repair when a gated turn tries to answer without a loaded skill. The partial rerun proved the date fix plus script/hook skill loading, but content fidelity was uneven and the full suite was not rerun after the second fix wave. These fixes are local/uncommitted until [15](15-commit-staged-work.md) lands.

## Loose ends

1. **Run the full post-fix live suite** in [17a](17-skill-live-test-prompts.md), using fresh project-scoped chats and treating no `skill_load` on a gated turn as a failure. Confirm whether the local fixes were active before scoring.
2. **Five skills still need fidelity verification**: `sensory_double_tap`, `ui_ux_quality_review`, `usability_quick_research`, `viral_video_script_structure`, `youtube_channel_craft_for_founders`. The auto-verifier has a known blind spot — `project_creation` passed it while actually dropping rendered content. Sample-diff these five against pre-refactor.
3. **Script/hook content contract fidelity is still weak** even when the correct skill loads. Add eval/contract checks or manually score against [17a](17-skill-live-test-prompts.md)'s pass signals before calling the skills verified.
4. **Cold-email sensing recall remains open**: "cold-emailed" can still return null because the scorer lacks stemming/alias coverage, so the gate may not fire for that family.
5. **DJ decision queue:** DRY single-owner rulings (`calendar_management`↔`google_calendar`, UI-review ×8, cold-email ×11, content/lens ×9, ontology entity-chain dupes); merge candidate `project_audit`↔`project_forecast`; reference-extraction candidates (`viral_video_script_structure` 342 lines, `cold_email_learning_review`); ratify the synthesized `google_calendar` Contract.
6. **Validator soundness questions:** orphan_dependency relaxation, `migrated_requires_preserve_markdown` invariant, alias-map collisions, `stripReferenceFrontmatter` regex, `internal-default` vs `(internal default)` spelling.

## Next action

1. Commit the local routing/enforcement fixes with [15](15-commit-staged-work.md), then rerun the [17a](17-skill-live-test-prompts.md) suite against the environment that contains those fixes.
2. Run the fidelity sample-diff on the 5 unverified skills (highest risk: `viral_video_script_structure`, largest file).
3. Schedule a 30-minute DJ pass on the §13.3 decision queue — the rulings unblock the DRY dedup work.

## Done when

Full live suite rerun logged, 5 skills verified or fixed, DJ rulings recorded, and validator questions answered or dismissed.
