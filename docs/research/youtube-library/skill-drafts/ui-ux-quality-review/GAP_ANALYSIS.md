---
title: 'Gap Analysis: ui-ux-quality-review skill'
skill_id: ui-ux-quality-review
analysis_type: gap_analysis
analyzed_date: 2026-05-03
analyst: Claude (Opus 4.7)
scope:
    - apps/web/src/content/blogs/agent-skills/ui-ux-quality-review.md
    - docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md
    - docs/research/youtube-library/skill-drafts/ui-ux-quality-review/lineage.yaml
    - 6 underlying source analyses (Kole Jain, DesignSpo ×4, Nesrine Changuel)
status: draft for DJ review
path: docs/research/youtube-library/skill-drafts/ui-ux-quality-review/GAP_ANALYSIS.md
---

# Gap Analysis: `ui-ux-quality-review` Skill

## What I read

- **Public skill** — `apps/web/src/content/blogs/agent-skills/ui-ux-quality-review.md` (286 lines, ~46% of which is YAML frontmatter)
- **Draft skill** — `docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md` (206 lines)
- **Lineage** — `docs/research/youtube-library/skill-drafts/ui-ux-quality-review/lineage.yaml` (418 lines)
- **Source analyses behind it** — 1,593 lines across 6 files (Kole Jain, DesignSpo ×4, Nesrine Changuel)
- **Sister skill for comparison** — `visual-craft-fundamentals/SKILL.md` (254 lines, much denser, agent-grade)

---

## Headline diagnosis

> The skill is metadata-rich and agent-poor. Its lineage and frontmatter explain _that_ the skill exists; its body does not give an agent enough to actually run a review.

The published file is **286 lines**, but **103 are frontmatter** and another ~30 are `Skill Composition` table + source attribution. That leaves ~**150 lines of actual review guidance**, which has to cover flow, hierarchy, spacing, typography, color, components, feedback, charts, responsive, and delight. Each section gets ~2–8 bullets.

Compare to `visual-craft-fundamentals/SKILL.md` (sister skill in the same series): **same source pool**, but **~210 lines of operational density** with named techniques (two-part shadow, hue rotation, Method 0–4 + Scrim, up-pop/down-pop, single-hue palette), AI-slop detection patterns table, severity-graded output schema, token-level fixes.

The `ui-ux-quality-review` skill should be operating at that density or higher (it's the _foundational_ of the pair), and it is not.

---

## Decisions from DJ (2026-05-03)

These choices override the original gap framing below. Use these to steer the rewrite.

1. **Dual-mode skill display.** Each principle should ship in two surfaces: a **human view** (readable narrative / heuristic) and an **agent view tab** (checkable rules, thresholds, named patterns). The agent view is not a replacement — it is the underbody of the human surface. UI affordance: tabs.
2. **Principles over examples.** Skip static worked examples. They go stale fast. Extrapolatable principles + named patterns carry more weight. Examples only when the example is the principle (e.g., the F vs. Z scan-pattern decision rule is the example).
3. **Drop the "When NOT To Use" boundary.** Agents request a skill by name; they don't need a negative-space definition to avoid it. If exclusions matter, encode them as `stackWith` redirects ("for X, use Y skill") rather than negative rules.
4. **Operating posture is dual.** Both the human and the agent need a preflight section. For humans it's "what should you be looking at / have ready before you run this review." For agents it's "what to inspect / capture / decide before producing findings." Same shape, different audience.
5. **Properly stack this.** `stackWith` should not just be metadata. The body needs a workflow section showing how `ui-ux-quality-review` chains with `accessibility-and-inclusive-ui-review`, `visual-craft-fundamentals`, `marketing-site-design-review`, and `delightful-product-review` — including run order, handoff outputs, and where each sibling picks up.

Decision status applied to gaps below: ✅ accepted, 🛠 accepted with modification, ❌ dropped.

---

## What's working

Don't rewrite what's good. Keep:

1. **Sequencing discipline** — "flow before pixels" is the load-bearing idea and the skill leads with it correctly.
2. **Closed spacing scale** (`4, 8, 12, 16, 24, 32, 48, 64, 96`) — concrete and checkable.
3. **Lineage YAML** — primitives, source claims, edges, and confidences are well-modeled. This is genuinely good agent context if exposed.
4. **Anti-delight section** — concrete, named (Mother's Day push, streak-shaming, default-on celebrations).
5. **Guardrails block** — these are checkable rules.

---

## Gap-by-gap analysis

### Gap 1 — The skill body buries the source material

**The signal.** The lineage YAML lists source claims like `claim.kole.beginner.flow-before-pixels` and the analysis files contain things like the "10-lever contrast rank" with WebAIM 4.5 numbers, the F vs. Z scan-pattern decision tree, the verbatim cohesion rules, and the three-step shadow recipe. **None of this richness lands in the skill body.**

**Examples of detail in source, missing from skill:**

| In the analysis                                                                                                                       | In the skill                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10 contrast levers ranked: motion → task-relevant info → whitespace → faces → color → size → weight → imagery → extras → misalignment | "Beginners reach for size and color first, but hierarchy can also come from motion, task-relevant information, whitespace, imagery, faces, weight, and position." (one comma-separated list, no rank, no when-to-use) |
| F-pattern for text-heavy / Z-pattern for minimalist hero / top-to-bottom for cards — explicit decision rule                           | Not mentioned in the published skill at all                                                                                                                                                                           |
| WebAIM contrast ratio ≥ 4.5 (and 7:1 aspirational)                                                                                    | Not in the published skill (it's in the draft, dropped on publish)                                                                                                                                                    |
| Three-step shadow recipe (lighter color → bigger blur → or remove)                                                                    | Not present                                                                                                                                                                                                           |
| Corner-radius standard (10px for small components)                                                                                    | Not present                                                                                                                                                                                                           |
| Save → badge dot pattern (the system-wide feedback example)                                                                           | Not present                                                                                                                                                                                                           |
| "Vertical trim off in Figma auto-layout"                                                                                              | Not present (tool-specific but agent-actionable)                                                                                                                                                                      |
| 50/40/10 roadmap rule (50% functional / 40% deep delight / 10% surface delight)                                                       | Not present in published, only in draft                                                                                                                                                                               |
| Habituation risk (delight decays — first-use wow, fifth-use wallpaper)                                                                | Not present in published                                                                                                                                                                                              |
| Demotivator inversion technique ("ask what would frustrate the user")                                                                 | Not present in published                                                                                                                                                                                              |

**The published file is a ~50% lossy compression of the draft, and the draft is a ~30% lossy compression of the source analyses.** Net loss vs. raw source: roughly 65–70% of the operational density.

### Gap 2 — Heuristics are written for humans, not agents

Most of the practical-heuristic bullets are **judgment statements**, not **checks an agent can execute**:

| Skill says                                                                               | What an agent needs                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Mobile needs more whitespace than most teams expect."                                   | Define "more" — e.g., `min-padding-mobile = 1.25× equivalent desktop padding; flag if mobile padding ≤ desktop`.                                               |
| "If the shadow is the first thing noticed, it is too strong."                            | Inverted aesthetic test — agent can't run it. Replace with: `shadow opacity ≤ 0.15; shadow color is gray, not pure black; blur ≥ 8px for elevations above sm`. |
| "Microinteractions should confirm an action, not decorate the page at random."           | Define: agent should check that every animation has either a state-change cause or a feedback purpose; flag continuous loops without a state.                  |
| "Use color for meaning: success, warning, danger, focus, trust, selection, or category." | Audit rule: each semantic color should appear in ≤ one role per surface; flag ambiguous overload.                                                              |
| "Every user action needs a visible response."                                            | Concrete check: for each interactive element, does at least one of `:hover, :active, :focus, :disabled, loading, success, error` exist in styles?              |

For each "qualitative" heuristic, there's a checkable form behind it. The skill currently ships only the soft form.

### Gap 3 — No worked examples or input/output contracts

The skill says "return findings grouped by [9 categories]" but never **shows** what a finding looks like. Compare to `visual-craft-fundamentals` which provides:

```
Domain: <shadows | color | typography | ...>
Finding: <named principle violated, e.g., "Two-part shadow not decomposed">
Evidence: <quoted class string or component snippet>
Severity: <high | medium | low>
Fix: <concrete tokens or technique name>
```

**ui-ux-quality-review should ship the same contract**, plus a worked example showing the agent: "Here's an input screen. Here's the review for it." Without examples, every agent that picks up this skill produces output in a slightly different shape, and agent-to-agent composition (one agent reviews, another fixes) breaks.

### Gap 4 — "Sources" exists, but "where to look in sources" doesn't

The Source Lineage section names the videos (good) but doesn't tell an agent **how to use them as a fallback**. When an agent hits an edge case the skill doesn't cover (e.g., "is this color combo okay for a colorblind user?"), it should know:

- Color contrast questions → `analyses/2026-04-29_designspo-color-theory_analysis.md` + the WebAIM contrast checker (URL).
- Spacing math edge cases → `analyses/2026-04-29_designspo-golden-rule-web-design_analysis.md`.
- Delight edge cases → `2026-04-28-nesrine-changuel-...-ANALYSIS.md`, especially the inclusion-risk section.

Right now those local paths exist in the **draft** SKILL.md but were **stripped from the published skill** (the operational map even says "Avoid local analysis paths in public copy"). That's an instinct that makes sense for human readers but actively harms agent users — the agent has no fallback when the skill body runs out.

**Solution:** keep two source attribution blocks — a human-facing "Distilled from" with YouTube links, and an agent-facing "Deep-dive references" with local paths that agents running inside the BuildOS repo can read for richer context.

### Gap 5 — Missing categories the source material covers

Looking at what's in the source material vs. what's in the skill:

| Topic in source material                                                                                               | Coverage in skill                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Touch targets / hit areas** (mobile flows)                                                                           | Mentioned only as "controls fit on mobile" — no minimum size (44px iOS / 48dp Android is the canonical floor)                                                                  |
| **Form input design** (heights 40–48px, placeholder vs. label, off-white backgrounds, length signals expected content) | Absent (sister skill covers it)                                                                                                                                                |
| **Modal / overlay patterns**                                                                                           | Absent                                                                                                                                                                         |
| **Empty states** (concrete patterns: illustration + first action + helper text)                                        | Mentioned as a state to check, but no pattern guidance                                                                                                                         |
| **Error message quality** (tone, recovery path, does it say what to do next)                                           | Generic "error states" mention only                                                                                                                                            |
| **Keyboard / focus order** (semi-related to a11y but core UX)                                                          | Punted to "use accessibility skill"                                                                                                                                            |
| **Loading state patterns** (skeleton vs. spinner vs. progressive)                                                      | Mentioned as a state, no pattern guidance                                                                                                                                      |
| **Saved/persisted state visibility** (the badge-dot pattern from Kole Jain)                                            | In the source, missing from skill                                                                                                                                              |
| **Charts**                                                                                                             | Listed as a category but only one line of guidance ("readable axes, honest data") — Kole Jain analysis has 3+ specific failure modes (no axis, rounded bar tops, padding bars) |

### Gap 6 — Frontmatter declares stats that don't match reality

The frontmatter says:

```yaml
lineageStats:
    sources: 7
    primitives: 9
    sourceClaims: 10
    edges: 24
    candidateV2Sources: 3
```

But the lineage YAML has **9 source_claims** (not 10), and the published skill body only operationalizes ~7 of those primitives concretely. This is a metadata-vs-content drift. If the metadata is going to claim "9 primitives," the body needs to have 9 named primitive subsections that an agent can address one-by-one, and currently it has a table listing them but no subsection per primitive.

### Gap 7 — The "When NOT To Use" boundary is too thin

Current:

> Do not use this skill as a full brand strategy process, visual identity exploration, or WCAG-specific accessibility audit.

Missing boundaries an agent needs to recognize:

- Don't use it for **information-architecture / navigation-structure** problems (different skill domain — site map work, not screen work)
- Don't use it for **content/copy review** (the words on the screen)
- Don't use it for **performance/CLS/LCP** (visual jank from layout shift is a perf problem, not a UI quality problem)
- Don't use it as a **substitute for user testing** — this skill catches craft errors, not usability errors that only show up when real users use the thing
- Don't use it on **early wireframes** where flow is intentionally undefined — flag-checking unfinished work produces noise

### Gap 8 — No "agent operating posture" section

Most agent-grade skills have an explicit posture (how to behave while running the skill). Missing here:

- **Preflight:** what should the agent inspect before producing findings? (screenshot at multiple viewports, dark + light mode, hover states captured, the actual interactive element states)
- **Evidence requirement:** every finding should cite the specific component, class, region, or coordinates — agents currently might say "spacing is inconsistent" without pointing to where.
- **Severity rubric:** what makes a finding "high" vs. "medium"? (high = blocks task completion or breaks accessibility floor; medium = degrades polish; low = stylistic preference)
- **Confidence/uncertainty handling:** when should the agent say "I can't tell from this screenshot, please share X"?
- **Stop conditions:** when has the agent done enough? (e.g., after producing top 3 high-priority fixes and at least one finding per applicable category)

### Gap 9 — `stackWith` is metadata, not workflow

Frontmatter lists `stackWith: [marketing-site-design-review, visual-craft-fundamentals, accessibility-and-inclusive-ui-review, delightful-product-review]` but the body never explains the **sequencing**:

- Run `ui-ux-quality-review` first (foundational pass)
- Then `accessibility-and-inclusive-ui-review` if WCAG matters
- Then `visual-craft-fundamentals` if the foundational pass clears
- Then `delightful-product-review` as a final layer

This is in the sister skill's body (`visual-craft-fundamentals` says "Run first, this skill ships on top") but the foundational skill doesn't reciprocate.

### Gap 10 — Source attribution needs date stability

Sources cite YouTube videos. YouTube videos disappear. The skill should include:

- **Capture date** for each video (so the agent knows the underlying material is N months old)
- **Local transcript path** (so even if YouTube takes the video down, the BuildOS-internal agent can still read the content)
- **Channel handle and channel URL** (so the agent can find replacement content from the same source)

The frontmatter has channelUrl, but the body section doesn't use it. The draft lineage has `local_path` but it doesn't appear in the published skill body.

---

## Severity-ranked fix list

### High priority (must ship)

1. ✅ **Convert qualitative heuristics → agent-checkable form.** Each principle ships in two layers: human-readable principle + `Agent checks` subsection with thresholds, named patterns, primitive IDs. (~30 conversions)
2. ✅ **Per-category sub-checklists with concrete numbers.** Spacing ≥ 10 sub-checks. Typography ≥ 10. Color ≥ 8. Today they have 3–5 each.
3. ❌ **Worked examples — DROPPED.** DJ call: principles + named patterns over examples. Examples go stale; principles extrapolate.
4. ✅ **Restore the lost source detail.** 10-lever contrast rank, F vs. Z scan rules, three-step shadow recipe, 10px corner-radius standard, save→badge-dot pattern, 50/40/10 delight roadmap, habituation risk, demotivator inversion.
5. ✅ **Add the missing pattern libraries:** touch target floors, form input heights, empty-state pattern, error-message tone, loading-state patterns, chart failure modes.

### Medium priority

6. 🛠 **Operating posture, dual.** Both human preflight ("what should you have ready before running this review") and agent preflight ("what to inspect / capture / decide before producing findings"). Same shape, different audience.
7. ✅ **`stackWith` becomes a workflow section.** Run order, handoff outputs, where each sibling picks up. Promote to high priority — DJ specifically called this out.
8. ✅ **Agent-facing deep-dive references** as a separate block from human-facing source attribution. Local paths included.
9. ✅ **Reconcile lineage stats with content.** 9 primitives in frontmatter ⇒ 9 named primitive subsections in body.
10. ❌ **"When NOT To Use" — DROPPED.** DJ call: agents request a skill by name; negative-space definitions waste tokens. Where exclusions matter, encode as `stackWith` redirects ("for X, use Y skill").

### Low priority (polish)

11. ✅ Capture dates and local transcript paths in source citations.
12. ✅ Mini AI-slop smoke test mirroring the sister skill's pattern table.
13. ✅ Cross-reference lineage YAML primitive IDs in the body.

---

## Recommendation

**Don't try to fit the fix in 286 lines.** The sister skill is denser at 254 lines because it's all operational; this skill needs to roughly **double in length** (to ~500 lines) to carry both the foundational checks AND the source-grounded examples agents need.

**Split decision to make:** keep the published blog as a human-readable narrative _and_ serve a separate, denser `SKILL.md` for agent consumption — or merge them into a single dense file that reads well to both audiences. The sister skill chose the latter and it works because the prose is operational rather than narrative. I'd recommend the same: rewrite as agent-grade and let humans read the dense version. Anyone reading a skill index is technical enough.

**One ordered editing pass:** (1) restore lost source detail; (2) convert qualitative → checkable; (3) add per-category sub-checklists; (4) add the worked example; (5) add operating posture; (6) reconcile metadata with content. Doing them in that order keeps each step's diff small and reviewable.

---

## Open questions for DJ (post-decisions)

Resolved by 2026-05-03 decisions:

- ~~Audience split~~ → one doc, two layers (human principle + agent checks subsection per topic), tabs in UI later.
- ~~Where agent paths live~~ → in the skill body under "Agent-facing deep-dive references."
- ~~Worked example scope~~ → no static examples; principles only.

Still open:

1. **Lineage open questions carry-over.** Should charts be split into their own primitive, and should delight stay here or move into `delightful-product-review`?
2. **Audit the other four skills?** All five skills in this folder were drafted in the same window with the same template; same gap pattern likely applies to `marketing-site-design-review`, `accessibility-and-inclusive-ui-review`, `delightful-product-review`, `landing-page-scorecard-funnel`. Worth a short audit pass after this rewrite ships.
3. **Tab UI implementation.** When does the blog renderer get the tab affordance for the human/agent split? Today the markdown structures it via subheadings; the renderer can progressively enhance.
