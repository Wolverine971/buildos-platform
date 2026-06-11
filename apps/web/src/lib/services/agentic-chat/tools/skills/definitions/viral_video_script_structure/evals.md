<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/viral_video_script_structure/evals.md -->

# Evals — viral_video_script_structure

Golden tasks per `../../EVALS_GUIDE.md`. This skill has no reference modules — Run B gets the full SKILL.md only.

---

## Task 1 — Write the script body from a locked hook

### Task prompt

> My hook is locked — don't touch it. Write the rest of the script (body + ending) for a 60–90 second vertical video (Reels/TikTok).
>
> - **Hook (locked, 0:00–0:07):** "Your messy notes are scattered across six apps. But organizing them harder was never the fix. Watch one raw ramble become a full plan."
> - **Footage:** a clean screen recording of a rambling voice-note transcript turning into a structured project board in BuildOS (tasks appear, phases form, deadlines attach), plus talking-head at my desk.
> - **Audience:** overwhelmed solo founders with notes scattered across six apps, who feel behind on everything.
> - **Signal:** a rough 20-second clip of the same transformation got 4× my usual saves last month.
> - **Material I could cover:** why every productivity app made me organize while capturing (and why I quit them all in ~3 weeks); the live ramble→plan transformation itself; my take that capture-first beats organize-first; the daily brief feature; the calendar sync feature; a bigger riff on how AI agents are changing founder workflows.
>
> Give me everything I need to record this.

### Delta markers

1. **M1 (one plot line + named cuts):** Exactly ONE plot line is locked, and the cut angles are named explicitly (daily brief, calendar sync, AI-agents riff — at minimum two of these named as cut). Covering 4+ of the listed materials = miss ("no combination plot lines in short-form").
2. **M2 (2-1-3-4 ordering):** Body points are ranked and explicitly reordered so the second-best point opens and the best lands second, with a written justification for the swap. Best-point-first or unexplained order = miss.
3. **M3 (Value Loop per point):** Every body point carries all three labelled Value Loop components — Context (what) / Application (how, concrete examples) / Framing (why). Any point missing a component = miss.
4. **M4 (rehook, no generic transitions):** A mini stake-raising rehook sits between every two body points; zero "Next, let's talk about…"-style transitions.
5. **M5 (verdict ending, hedges stripped):** Script ends on a verdict line, not a CTA; contains no "I think / maybe / probably / kind of"; register is conviction-from-experience (BuildOS Voice Translation), not "this changes everything" bombast.
6. **M6 (objection surfaced):** One sentence surfaces the obvious objection (e.g. "sounds too simple") and dismisses it before the verdict.
7. **M7 (read time vs 90s):** Read time is computed (~150 wpm) and stated against the 90-second window, with a cut-from-expansions note if over. No timing at all = miss.
8. **M8 (cadence / the dance):** A sentence-length cadence map is present — deliberate long/short alternation marked, with a read-aloud note. Uniform sentence lengths with no cadence treatment = miss.
9. **M9 (word audit, teenager test):** A word-by-word audit is run; no "ontology," "context engineering," "agent-native"-tier jargon in the spoken script; any abstract entity is given a concrete renaming.
10. **M10 (hook locked — honest negative):** The provided hook is NOT rewritten or replaced, AND the body delivers exactly what it promises — the script visibly ends on the formed plan/board ("no hook locked before the middle is real" in reverse: promise must be paid).
11. **M11 (native CTA discipline):** At most ONE CTA, embedded as a natural continuation of a body point (or explicitly omitted), with the removal test noted — script reads complete without it. A "follow for more / link in bio" spell-break = miss.
12. **M12 (script bundle contract):** Output follows the `## Output` bundle shape: plot line + cut angles, ranked points with justification, body with Value Loops and rehooks, conviction ending, cadence map, word audit, read time, and an expectation-vs-reality scorecard marking each beat raise / hold / shrink.

### Expected load path

- `skill_load(viral_video_script_structure, full)` — the 5-step skeleton, 6-phase live process, cadence/dance rules, Cross-Platform Compression table, and the `## Output` bundle all live outside the short-format parsed sections.
- References: none exist; zero `skill_reference_load` calls. Any reference-load attempt is a usage failure.
- Should NOT load: `hook_craft_short_form` (hook is locked by the user) or `story_driven_content_craft` — the ask is body structure only.

### Discovery probe

"I have my hook — write the rest of my 60-second TikTok script so people watch to the end." → catalog description matches on "Write … short-form … video scripts … for 60-90s videos … TikTok / Reels / Shorts … keep viewers hooked end to end."

---

## Task 2 — Audit a mediocre short-form script

### Task prompt

> Here's my draft script for a ~60-second vertical video about my product. Audit it — what's wrong, and what do I fix first?
>
> Draft (spoken, talking-head plus some screen recording):
>
> > Hey guys, so today I want to talk about something pretty interesting about productivity apps.
> > Most people use a bunch of different apps to stay organized across their projects.
> > I built a tool called BuildOS that uses context engineering and an ontology layer to structure your thinking.
> > The best feature is the brain dump, where you just ramble and a full project plan appears with tasks and phases.
> > It also has a daily brief feature that sends you an email every single morning.
> > Next, let's talk about the calendar sync feature for a second.
> > The calendar sync feature puts all of your tasks directly onto your calendar.
> > Also I want to talk about how AI agents are changing the way founders work in general.
> > AI agents are going to be doing more and more of our actual work for us.
> > That means having your context structured properly is going to matter a lot.
> > So those are the main things I wanted to share about all of this today.
> > Anyway, don't forget to like and subscribe and check out the link in my bio.
> > I think this could maybe change how some people work, probably.

### Delta markers

1. **M1 (audit-mode contract):** Output is a diagnostic report — names which skeleton step(s) failed (packaging / outline / intro / body / outro / CTA) AND which live-process phase(s) broke (signal / simplification / plot line / middle / hook / pacing / cut), plus a specific rewrite plan. A generic line-edit rewrite with no step/phase diagnosis = miss.
2. **M2 (combination plot line):** Flags the draft as carrying multiple plot lines (product walkthrough + feature tour + AI-industry take) and demands locking ONE, naming what gets cut — citing the one-plot-line rule for short-form.
3. **M3 (ordering violation):** Flags that the best point (brain dump transformation) leads and value descends after it — the 1-2-3-4 anti-pattern — and prescribes a 2-1-3-4 reorder with justification.
4. **M4 (Value Loop incompleteness):** Flags at least one named point (daily brief and/or calendar sync) as Context-only — missing Application (concrete examples) and Framing (why it matters).
5. **M5 (generic transition):** Cites "Next, let's talk about…" as a bounce trigger and supplies a rehook replacement.
6. **M6 (word audit / teenager test):** Flags "context engineering" and "ontology layer" specifically as jargon fails and proposes concrete renamings.
7. **M7 (outro + CTA violations):** Flags BOTH the "so those are the main things… anyway" outro (no recap → pain solved → high note) AND the "like and subscribe / link in bio" spell-breaking CTA, prescribing a native embed or removal.
8. **M8 (hedged ending):** Flags "I think this could maybe… probably" and strips hedges into a verdict line with conviction.
9. **M9 (throat-clearing open + routing):** Flags "Hey guys, so today…" as failing the first-3-seconds click-confirm for short-form, and routes hook rewrite to `hook-craft-short-form` rather than doing full hook craft inline.
10. **M10 (cadence monotony):** Flags the uniform medium-length sentence pattern (4+ similar-length sentences in a row) and prescribes inserting short beats per the dance cadence.
11. **M11 (no invented length violation — honest negative):** Does NOT flag read time as a failure — the draft is ~150 words ≈ 60s at ~150 wpm, inside the 90-second budget. Demanding cuts "for time" = miss.

### Expected load path

- `skill_load(viral_video_script_structure, full)` — the skeleton/process failure taxonomy, word-by-word audit checklist, and audit-mode output contract live outside the short-format sections.
- References: none; zero reference loads.
- Should NOT load: `story_driven_content_craft` — this is a script-structure audit, not a narrative-shape audit. A hook-craft load is unnecessary (routing by name suffices).

### Discovery probe

"Here's my TikTok script draft — tell me what's wrong with it before I film." → description matches on "Write or audit short-form … video scripts … keep viewers hooked end to end."

---

## Results log

<!-- Append per EVALS_GUIDE.md. Template: -->
<!--
### YYYY-MM-DD — Task N — performer: <model>, judge: <model>
| Marker | A (without) | B (with) |
| --- | --- | --- |
| M1 | miss | hit |
Verdict: STRONG/WEAK/NO DELTA. Load path: as expected / deviations. Discovery probe: pass/fail.
Notes:
-->

2026-06-11 — Task 1 manufacturing run (with-skill, self-checked against markers): embedded as ## Worked Example. Markers: 12/12 self-assessed after one fix pass (first draft buried the cut-angles list inside prose — M1 — and omitted the expectation-vs-reality scorecard — M12; both corrected before trimming).

### 2026-06-12 — Task 1 — BLIND A/B (the owed pair; prior wave-2 entry was a with-skill self-check) — performer (with/without) + blind judge: claude-opus-4-8 (workflow subagents)

| Marker | without | with |
| --- | --- | --- |
| M1 | hit | hit |
| M2 | miss | hit |
| M3 | miss | hit |
| M4 | miss | hit |
| M5 | miss | hit |
| M6 | miss | hit |
| M7 | miss | hit |
| M8 | miss | hit |
| M9 | miss | hit |
| M10 | hit | hit |
| M11 | miss | hit |
| M12 | miss | hit |

Verdict: **STRONG DELTA**. With-skill hit 12/12 markers; gap over no-skill = 10 markers. Refusal missed by skill run: False.
Load path (expected, not re-tested this run): skill_load(viral_video_script_structure, full) — and nothing else: zero reference loads (none exist), and must NOT load hook_craft_short_form (hook is locked) or story_driven_content_craft (ask is body structure only).
Notes: X (skill run) executes the full structured bundle: 2-1-3 reorder with written justification, three-part Context/Application/Framing loops, stake-raising rehooks, objection inoculation, verdict ending with no CTA spell-break, cadence map, word audit, computed read time (~165 words / 0:66), and an expectation-vs-reality scorecard. Y is a competent shooting script but misses nearly every named rule: best-point-first ordering, no labelled three-part loops, no rehooks, no cadence map/word audit/read-time, and crucially fires a "Link's in my bio" CTA (M11 spell-break) plus a thesis-bombast register. Both correctly keep the locked hook (M10) and name cut material (M1). Gap is large and includes named-rule + guardrail markers, so STRONG DELTA. No refusal/guardrail marker was missed by the stronger output.
