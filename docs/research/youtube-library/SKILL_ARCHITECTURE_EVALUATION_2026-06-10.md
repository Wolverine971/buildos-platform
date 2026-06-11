<!-- docs/research/youtube-library/SKILL_ARCHITECTURE_EVALUATION_2026-06-10.md -->

# Skill Architecture Evaluation: Root vs. Niche — 2026-06-10

An evaluation of the root-skill / niche-skill information architecture against the design principle DJ stated, using the loader code, the size distribution of all 43 runtime skills, and the first two executed golden-task evals as evidence.

## The design principle being evaluated

> The root skill should contain the majority of the information. Only when the root gets really big AND there's a rabbit hole of added detail does that detail become a niche skill (or reference). Every extra load is an API call, added latency, and another read — and if the agent has to load a second thing, that second thing must contain a lot of information it didn't already have. Niche skills that are too thin aren't adding value: either fold them back into the root, or build them out in real depth.

This document's verdict: **the principle is right, the current system mostly honors it, but there are three concrete violations — one in the loader, one in how the cold-email enrichment split its references, and one in a handful of still-thin children.**

---

## 1. The verified cost model (what a load actually costs)

From `skill-load.ts`, `skill-reference-load.ts`, `build-lite-prompt.ts`:

| Step                                       | Cost                                                                                                                                                                                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discovery                                  | Free — all 43 skills' id + description are already in the system prompt catalog table (~1–2k tokens, paid once per conversation)                                                                                                       |
| `skill_load(id)` — **defaults to `short`** | 1 tool-call round trip. Returns summary, when*to_use, workflow, related_ops, guardrails, examples, and reference-module \_stubs*. **Does NOT return the markdown body** — no `## Output` contract, no principle tables, no scorecards. |
| `skill_load(id, format: "full")`           | 1 round trip. Returns everything, including the preserved markdown body. Same hop count as short — only the token payload differs.                                                                                                     |
| `skill_reference_load(id, ref)`            | 1 round trip **each**.                                                                                                                                                                                                                 |
| Child skill                                | A full separate `skill_load`.                                                                                                                                                                                                          |

Each round trip is a full agent-loop turn: model emits the call, server executes, result is appended, model continues — seconds of latency and a context re-read per hop. **Hops are the expensive unit; tokens within a hop are comparatively cheap.** That asymmetry is the core of DJ's principle, and it's correct.

## 2. Evidence from the executed evals (2026-06-10)

Two with/without evals ran today (full logs in `definitions/<id>/evals.md`):

| Skill                     | Without | With  | Verdict      | Load path observed                                            |
| ------------------------- | ------- | ----- | ------------ | ------------------------------------------------------------- |
| `cold_email_taste_review` | 0/12    | 12/12 | STRONG DELTA | shell → scorecard ref → fake-warmth ref (3 hops)              |
| `ui_ux_quality_review`    | 6/12    | 12/12 | STRONG DELTA | shell → smoke-test ref → foundation ref → polish ref (4 hops) |

Three architecture-relevant facts fell out:

1. **Workflow-driven loading works.** Both with-skill agents loaded exactly the references the workflow named, in order, with zero over-loads. The "workflow names which reference loads when" pattern steers behavior reliably.
2. **The delta lives in the full-format content.** The behaviors that separated 12/12 from 0–6/12 — output contract, named patterns, closed scales, calibration disclosures — live in the markdown body and the references, i.e., the parts a default `short` load never delivers.
3. **Routine tasks currently cost 3–4 hops.** A plain "is this email good?" costs three round trips before the agent can answer properly. Under DJ's principle, a skill's _primary job_ should cost one.

## 3. The three violations

### Violation 1 — the loader default hides the best content (highest leverage, smallest fix)

`skill_load` defaults to `short` (`skill-load.ts:224`: `options.format ?? 'short'`). For all 30+ `preserve_markdown` skills, short format silently drops the `## Output` contract, principle tables, and every custom section. An agent taking the default gets a skill stripped of exactly what the evals proved drives the delta.

**Fix options (recommend both):**

- **(a) Parser change (preferred):** teach `markdown-skill.ts` to parse `## Output` into the structured payload (same pattern as `## Guardrails`) so short format carries the contract. ~20 lines across `markdown-skill.ts`, `types.ts`, `skill-load.ts`.
- **(b) Authoring stopgap:** every skill's final workflow step states the output contract essentials (workflow IS parsed into short format). Several skills already do a weak version of this.

### Violation 2 — "always-loaded" references are mandatory second hops

A reference module earns its existence only if its load condition is **genuinely conditional** — per-mode, per-platform, failure-triggered, escalation-only. Several of today's enrichment references have `when_to_load: always before the main job`, which makes them a guaranteed extra round trip on every single use. That's a root-skill body wearing a reference's clothes.

Shell-share data (shell bytes ÷ total bytes) makes the pattern visible — the suspects keep only ~26–33% of their content in the shell:

| Skill                          | Shell share | The unconditional ref(s)                                                               | Recommendation                                                                                                                                                                                                                                                                                                                    |
| ------------------------------ | ----------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cold_email_taste_review`      | 26%         | `taste-scorecard` ("load when grading **any** draft")                                  | **Fold scorecard into shell** (~13KB shell); keep fake-warmth ref (conditional on failures). Primary job: 3 hops → 1.                                                                                                                                                                                                             |
| `cold_email_reply_os`          | 26%         | `reply-taxonomy-and-sla` ("classify first" = always)                                   | **Fold taxonomy+SLA into shell**; keep objection routes + forks (conditional on reply class). 2 hops → 1 for classification.                                                                                                                                                                                                      |
| `cold_email_outreach_compiler` | 26%         | `packaging_rules` + `lint_and_cadence` (steps 5–7, every compile)                      | **Fold both into shell** (~18KB); keep `mode_templates` (conditional — one mode per task). 4 hops → 2.                                                                                                                                                                                                                            |
| `cold_email_learning_review`   | 33%         | both refs fire on every review                                                         | **Fold both** → single ~21KB shell, hook_craft-style. 3 hops → 1.                                                                                                                                                                                                                                                                 |
| `cold_email_offer_lab`         | 36%         | both refs run in the standard workflow                                                 | **Fold both** → ~19KB single shell. 3 hops → 1.                                                                                                                                                                                                                                                                                   |
| `algorithm_aware_publishing`   | 32%         | `content-games` ("loaded in _every_ mode first")                                       | **Fold content-games** (~4.4KB) into shell; keep the three mode refs (genuinely conditional).                                                                                                                                                                                                                                     |
| `ui_ux_quality_review`         | 40%         | foundation + polish (every full audit) — but the targeted-question path loads only one | **Judgment call.** Folding both (~19KB shell) cuts full audits from 4 hops → 2 (smoke test stays conditional); targeted asks pay ~3k extra tokens but drop to 1 hop. Given latency > tokens, lean fold. The same logic applies to its rescued siblings (`accessibility`, `calm`, `delightful`, `visual_craft`, `marketing_site`). |

**Correctly architected today (keep as-is):** `going_viral` (one platform ref per task — the canonical rabbit hole), `ai_era_craft_and_quality_moat` (5 occasion-distinct refs), `task_management` (85% shell, one narrow ref), and the three big single-shell skills (`hook_craft_short_form` 18.7KB, `story_driven_content_craft`, `viral_video_script_structure`) — which are, in hindsight, the purest expression of DJ's principle and eval-validated.

### Violation 3 — thin children that add a hop without adding knowledge

Children/leaves under ~3KB with no references and no unique decision rules cost a full `skill_load` to deliver near-zero delta:

| Skill                               | Size  | Call                                                                                                                                                                                                                           |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `information_architecture_review`   | 2.1KB | Deepen (source-backed, via `/skill-gap-audit`) or fold into `build_quality_ui_ux` as a section                                                                                                                                 |
| `usability_quick_research`          | 2.7KB | Same decision                                                                                                                                                                                                                  |
| `design_system_architecture_review` | 3.0KB | Same decision                                                                                                                                                                                                                  |
| `cold_email_research_anchors`       | 2.4KB | Distinct job (anchor levels) but the L3/L4/L5 research bar now also lives in the compiler's mode-templates — either deepen this child and make it canonical, or fold the anchor-level table here and have the compiler cite it |

Don't fold these blindly — a child also earns existence through _separate discoverability_ (its own catalog row matching different user phrasing). But "discoverable and empty" is the worst quadrant; each needs a deepen-or-fold decision.

---

## 4. The sizing rules (proposed scorecard for every skill file)

1. **One-load primary job.** The shell must contain everything the skill's primary job needs. One `skill_load(full)` should be sufficient for the standard workflow. Target shell: **8–20KB (~2–5k tokens)**.
2. **References are conditional or they're the body.** A reference earns existence only with a genuinely conditional `when_to_load`: per-mode, per-platform, failure-triggered, escalation/diagnosis-only. "Load always" or "load before the main job" = fold it into the shell.
3. **Hop budget.** Primary job = 1 load. Primary job + one conditional branch = 2 loads. Any routine task costing 3+ loads = restructure.
4. **Split threshold.** Split only when the shell exceeds ~20KB **and** a genuinely conditional seam exists. Big shell with no seam (hook_craft at 18.7KB) beats a lean shell with mandatory refs.
5. **Thin-child test.** A child under ~4KB with no unique decision rules gets deepened or folded. A child earns existence by separate discoverability + its own primary job + real depth (the `task_state_updates` pattern).
6. **Short-format survival.** Until the parser learns `## Output`, the output contract's essentials must appear in the final workflow step (which short format does deliver). Better: make the parser change.
7. **Descriptions are the discovery API.** No two sibling descriptions may claim the same user phrasing. (Known collision from eval authoring: "tighten up this email" plausibly routes to either `cold_email_taste_review` or `cold_email_outreach_compiler`.)

## 5. Recommended execution order (not yet applied — DJ to approve)

1. **Parser change** for `## Output` in short format (+ test). Small, benefits all 43 skills at once.
2. **Fold the unconditional cold-email refs** (taste, reply_os, compiler packaging/lint, learning, offer_lab) — mechanical, reverses part of today's split but keeps all content; conditional refs stay.
3. **Fold `content-games` into `algorithm_aware_publishing`'s shell.**
4. **Decide the design-review family** (fold foundation/polish into shells vs. keep targeted-path savings) — run one more eval on the targeted-typography task first to measure what the fold would cost there.
5. **Deepen-or-fold decisions** for the four thin leaves (queue `/skill-gap-audit` runs).
6. **De-collide sibling descriptions** (taste vs. compiler at minimum).

## 6. Skill-fix queue surfaced by eval authoring (independent of architecture)

- `cold_email_outreach_compiler`: "Tracking targets" output field has no defining content anywhere — cross-reference `cold_email_learning_review`'s bands or cut the field.
- `cold_email_taste_review`: workflow step 1 asks for a "trust level" but the T0–T3 rubric lives in `cold_email_offer_lab` — inline a 3-line trust ladder or cite the sibling explicitly.
- `hook_craft_short_form`: "on-target curiosity," "different direction" snapback, and the motion calibration are not judge-checkable — acceptable for craft skills, but note they can't anchor evals.
- `ui_ux_quality_review`: preflight demands breakpoint screenshots that markup-only reviews can't satisfy — add "or reason from markup when that's all that exists."

---

_Evidence: `skill-load.ts` / `skill-reference-load.ts` / `markdown-skill.ts` (cost model), shell-share survey of all 43 `definitions/` dirs (2026-06-10), eval results in `definitions/ui_ux_quality_review/evals.md` and `definitions/cold_email_taste_review/evals.md`, eval-authoring findings in the EVALS_GUIDE batch report._
