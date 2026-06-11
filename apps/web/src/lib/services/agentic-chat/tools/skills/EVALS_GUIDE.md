<!-- apps/web/src/lib/services/agentic-chat/tools/skills/EVALS_GUIDE.md -->

# Skill Evals Guide

Protocol for the golden-task evals in `definitions/<skill_id>/evals.md`. These are **dev artifacts** — they are not runtime-bundled (the only runtime glob is `./definitions/**/references/*.md`; never place an eval inside `references/`).

## Purpose: the Delta Test

From `docs/research/youtube-library/SKILL_QUALITY_AUDIT_2026-06-10.md` §2:

> **Would the agent's output on a concrete task be materially different — and better — with this skill loaded vs. without it?**

The base model already knows "use visual hierarchy," "personalize cold emails," "hooks should create curiosity." A skill earns its existence only by carrying things the model wouldn't reliably produce on its own: decision rules, numeric thresholds, named procedures run in a fixed order, refusal rules, and output contracts. Evals make this empirical instead of vibes: each eval is a concrete task plus a list of behaviors that only the skill should produce.

## The with/without protocol

Each golden task runs twice, with identical fixtures (every fixture is embedded in the task prompt — an eval must be runnable with zero external files):

- **Run A (without).** A performer agent receives ONLY the task prompt. No skill content, no hints that a skill exists.
- **Run B (with).** A performer agent receives the task prompt **plus the skill's full content**: the SKILL.md shell and ALL of its reference modules, pasted verbatim. (This isolates content quality from load behavior — load behavior is measured separately, below.)

Both runs produce the deliverable. A **judge agent** then scores both outputs against the task's delta markers **blind**: outputs are relabeled X and Y in random order, and the judge is told only the task and the markers, not which run is which.

## Delta markers

Delta markers are specific, checkable behaviors that only the skill should produce:

- a **named rule** applied and cited ("Closed-scale spacing violated", "two-people test");
- a **threshold** cited and used (≤170 words, 4.5:1 contrast, 3–5 word overlay);
- the skill's **output contract** followed (the `## Output` shape, all fields present);
- a **guardrail/refusal** triggered (refuse to compile, do-not-send on auto-fail);
- a **routing** decision to the correct sibling skill.

A good marker is **binary-checkable**: a judge can answer hit/miss without taste. "The review is thorough" is not a marker. "Every finding carries an Evidence field naming a class string or component" is. Each task carries 6–12 markers, at least one output-contract marker, and at least one guardrail/refusal marker where the skill has them.

It is expected (and fine) that Run A hits a few markers by accident — frontier models are good. The verdict is about the _gap_.

## The usage dimension

Content quality is necessary but not sufficient — at runtime the agent sees only a catalog table (skill id + description for all 43 skills) and must call `skill_load(skill, format: short|full)`, then `skill_reference_load` per module. Every load is an extra API hop and latency. So each eval also records:

- **Expected load path.** Which format a well-behaved agent should use (`short` drops everything outside the parsed sections — `## When to Use`, `## Workflow`, `## Guardrails`, `## Notes` — so skills whose `## Output` contract or pillar tables live outside those sections need `full`), and which reference modules it should load for THIS task — **and which it should NOT**. Over-loading is a usage failure even when the answer is right.
- **Discovery probe.** The task phrased in one line as a real user would phrase it. Pass = the skill's catalog `description` (frontmatter) would plausibly lead an agent scanning the catalog to pick this skill. This tests the description, not the body. Score it by reading the probe against the description — or, better, by giving a fresh agent the probe plus the full catalog table and asking which skill it would load.

The usage dimension is checked separately from the A/B runs and recorded in the results log alongside the verdict.

## Scoring

1. Judge scores each run per-marker: **hit / miss** (partial = miss; markers are written so partials shouldn't exist).
2. Compute the gap: markers hit by Run B (with) but missed by Run A (without).
3. Verdict:

| Verdict          | Meaning                                                                                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **STRONG DELTA** | Run B hits ≥75% of markers AND hits ≥4 markers that Run A missed, including at least one threshold/named-rule or refusal marker.                                                                                                        |
| **WEAK DELTA**   | Run B clearly better but the gap is ≤3 markers, or the gap is only output-formatting (contract followed, but same substance).                                                                                                           |
| **NO DELTA**     | Run A and Run B hit materially the same markers. **The skill fails the delta test for this task — regardless of how clean the skill file looks.** File it as a skill-quality bug: the content is something the base model already does. |

If Run B _misses_ a refusal marker (e.g. compiles around a missing ingredient anyway), record it explicitly — that is a skill-compliance failure, worse than NO DELTA, and usually means the guardrail is buried or contradicted elsewhere in the skill.

## Authoring rules for new golden tasks

1. **2–3 tasks per skill.** Cover the skill's distinct workflow paths (e.g. generate vs. audit, full review vs. targeted single-reference, compile vs. refuse). One task should exercise a guardrail/refusal where the skill has one.
2. **Fixtures embedded, always.** Screens as inline HTML, emails as quoted text, briefs as bullet lists — seeded with specific violations the skill's checklists catch. Never reference an external file or URL.
3. **Markers cite the skill.** Each marker names the rule, threshold, or contract field it tests, so a NO DELTA verdict points at the exact content that failed to move behavior.
4. **Include honest-negative markers.** At least one marker should check the agent does NOT do something (over-load references, invent an auto-fail, route to the wrong sibling). Skills fail by overfiring too.
5. **Don't teach through the prompt.** The task prompt must read like a real user — if it smuggles in the skill's vocabulary ("run the four-mistake diagnostic"), Run A gets the skill for free and the eval is void.

## Where results go

Every `evals.md` ends with a `## Results log` section. Append one entry per run-pair:

```
### 2026-06-12 — Task 1 — performer: <model>, judge: <model>
| Marker | A (without) | B (with) |
| --- | --- | --- |
| M1 ... | miss | hit |
Verdict: STRONG DELTA. Load path: as expected / deviations. Discovery probe: pass/fail.
Notes: <one or two lines — surprising hits in A, misses in B, marker wording fixes needed>
```

Keep failed verdicts in the log — they are the point. A NO DELTA entry is the trigger to enrich or kill the skill, not to rewrite the eval until it passes.
