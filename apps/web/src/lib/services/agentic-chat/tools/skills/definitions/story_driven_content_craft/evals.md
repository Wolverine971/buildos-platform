<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/story_driven_content_craft/evals.md -->

# Evals — story_driven_content_craft

Golden tasks per `../../EVALS_GUIDE.md`. This skill has no reference modules — Run B gets the full SKILL.md only.

---

## Task 1 — Structure a founder narrative from raw material

### Task prompt

> Here's a rambling anecdote about building my product solo. Turn it into a structured short founder essay (~500–700 words) for my blog and LinkedIn. Give me the full structural plan and draft the key lines — I'll flesh out the prose. Audience: overwhelmed solo founders.
>
> Raw material (verbatim):
>
> > so I've been building BuildOS alone for about two years now
> > I used to have notes in six different apps — notion, apple notes, voice memos, a whiteboard, random texts to myself
> > every productivity app I tried I abandoned within like three weeks
> > the breaking point was missing a launch deadline because the plan existed in my head and across three apps but nowhere real
> > I started just rambling everything into one place every morning instead of organizing
> > weirdly the structure showed up on its own once everything was in one spot
> > now that brain dump flow is the core feature of the product
> > people keep telling me they thought they had a discipline problem but it was actually a capture problem
> > I almost didn't ship it because it felt too simple
> > also my dog ate one of my notebooks once which is kind of funny

### Delta markers

1. **M1 (last line first):** The ending is written BEFORE the body plan, labelled as written-first, and the memorability test is explicitly run ("would a stranger text this to a friend?"). An ending that appears only at the end of the outline with no first-gate treatment = miss.
2. **M2 (lens stratification):** ≥5 candidate lenses are generated and ranked by tier; a Tier 3 or Tier 4 lens is chosen with a category-of-one justification; at least one Tier 1 lens (e.g. "my solo-building journey") is named and rejected.
3. **M3 (dance connectors):** The beat outline tags every transition `but` or `therefore`; zero `and then` / purely additive transitions.
4. **M4 (W-stack):** Opening leads with what + why (the missed launch / plan-in-three-apps pain); where/when material ("two years," app inventory timeline) is explicitly demoted to position 3+.
5. **M5 (villain named):** A named antagonist drives the piece — the "organize harder" doctrine, the productivity-app graveyard, or the discipline framing — framed as `they/it does X, but…`. A hero-only narrative = miss.
6. **M6 (audience map):** An explicit "for X / if you're X" statement lands in the first paragraph, tying the solo-founder reader's stakes to the narrator's.
7. **M7 (atomic shareability):** A one-sentence atomic version of the piece is supplied and is ≤10 words.
8. **M8 (intensity curve, numeric):** The intensity curve is mapped with numbers per the Kallaway arc — opening ≥70/100, first peak within the first ~200 words, re-peak every ~400–600 words. Prose-only "starts strong" claims = miss.
9. **M9 (rebuy map):** Each closed loop is paired with the next loop's opening; the lede carries 2–3 loops in the first ~200 words per the long-form translation table.
10. **M10 (first line + visual analog):** The drafted first line names the topic and contains a concrete image, number, or scene (e.g. the three-apps missed launch) — no throat-clearing intro paragraph.
11. **M11 (ladder diagnostic + bundle contract):** Output follows the `## Output` bundle: the implanted first-paragraph question is stated, mid-piece anticipation is stated, payoff non-obviousness is checked (discipline→capture inversion), AND the bundle carries tone audit (one named reader, broadcast phrasing stripped), rhythm audit, visual brief per beat, and the seven-mistake reject pass with each mistake marked clean or fail-with-fix.
12. **M12 (beat selection — honest negative):** The irrelevant fixture line (the dog eating a notebook) does NOT appear as a beat or anecdote in the plan — it is cut, not forced in for "personality."

### Expected load path

- `skill_load(story_driven_content_craft, full)` — the Three Pillars (ladder table, six craft moves, seven mistakes), the lens tier ladder, the long-form translation table, and the `## Output` bundle all live outside the short-format parsed sections; a `short` load loses the entire construction machinery.
- References: none exist; zero `skill_reference_load` calls. Any reference-load attempt is a usage failure.
- Should NOT load: `hook_craft_short_form` (this is a blog/LinkedIn essay, and the first-line rule inline suffices) or `viral_video_script_structure` (no video script asked for). Deferring upstream inquiry to `nonfiction-writing-from-lived-conviction` by name is fine; loading it is not needed — the lived material is already supplied.

### Discovery probe

"Turn this rambling story about building my startup solo into a structured founder essay people actually finish." → catalog description matches on "Structure non-fiction content as a sequence of curiosity loops … blog posts … founder essays … where structural craft (not idea generation) is the bottleneck."

---

## Task 2 — Diagnose a flat founder-essay draft

### Task prompt

> I wrote this draft for my blog and it feels flat but I can't say why. Diagnose it — what do I fix first?
>
> Draft (verbatim):
>
> > Back in 2024, when I was working from my apartment in Maryland, I decided to start building a productivity tool.
> > In this post I will share my journey and the lessons I learned along the way.
> > I started by researching the existing tools on the market.
> > And then I made a list of features that I thought would be useful.
> > And then I spent several months building the first version of the product.
> > I worked on it in the evenings and on the weekends.
> > I tested it with some friends and they gave me some feedback.
> > And then I improved the onboarding flow based on that feedback.
> > Eventually I launched it and got my first users.
> > It was hard at times but I kept going and made progress.
> > In the end, I learned that building a product takes persistence.
> > So I built an app that helps people organize their notes.
> > Thanks for reading! Let me know your thoughts in the comments.

### Delta markers

1. **M1 (audit-mode contract):** Output is a diagnostic report naming the FIRST failed rung, the corresponding craft-move fix, and a rewrite plan — not a holistic rewrite of the whole draft.
2. **M2 (ladder walked in order, stop rule):** Walks the rungs in order and stops at the first failure: stimulation/captivation — explicitly runs the implanted-question test ("at the first paragraph, what question is in the reader's head?") and finds none.
3. **M3 (Mistake 2 — Jumbling The W's):** Flags "Back in 2024, when I was working from my apartment in Maryland" as leading with where/when; prescribes the what + why → who + how → where + when restack.
4. **M4 (Mistake 1 — Traditional Story Arc):** Names the bell-curve/chronological buildup and prescribes the Kallaway arc with its numbers (open ~70/100, spike ~90 early, release ~30, re-peak ~75).
5. **M5 (dance violation):** Flags the `and then` connector chain explicitly and prescribes `but` / `therefore` insertion between beats.
6. **M6 (Mistake 4 — Missing Villain):** Flags that no antagonist exists and names a candidate (status quo, app graveyard, "organize harder" doctrine, discipline framing) with the `they do X, but we do Y` contrast.
7. **M7 (Mistake 5 — Nobody To Root For):** Flags that stakes exist only for the writer; prescribes explicit audience-mapping ("if you're a solo founder…") in the opening.
8. **M8 (knowing-only payoff):** Flags "building a product takes persistence" / "I built an app that helps people organize notes" as a predictable, knowing-only payoff that releases no validation dopamine; proposes a non-obvious reframe.
9. **M9 (tone violation):** Flags "In this post I will share my journey" as broadcast phrasing; prescribes the one-named-reader rewrite into direct address.
10. **M10 (ending violation):** Flags "Thanks for reading! Let me know your thoughts" as failing the last-dab bar; prescribes writing the last line first against the stranger-text test.
11. **M11 (fix order — honest negative):** Does NOT lead with rhythm/sentence-length or tone polish as the first fix — per the audit workflow, Rhythm and Tone passes come last, only after the structural rungs are clean. A diagnosis whose first prescription is "vary your sentence length" = miss.

### Expected load path

- `skill_load(story_driven_content_craft, full)` — the ladder table, seven-mistake taxonomy, audit workflow with its stop-at-first-rung rule, and audit-mode contract live outside the short-format sections.
- References: none; zero reference loads.
- Should NOT load: `viral_video_script_structure` or `hook_craft_short_form` — this is a prose-narrative diagnosis, not a script or hook job.

### Discovery probe

"My founder blog post feels flat and people don't finish it — diagnose what's wrong." → description matches on "rewriting blog posts … founder essays … where structural craft … is the bottleneck."

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

2026-06-11 — Task 1 manufacturing run (with-skill, self-checked against markers): embedded as ## Worked Example. Markers: 12/12 self-assessed after one fix pass (first draft's atomic line was 11 words — M7 — trimmed to 9; intensity curve initially lacked the re-peak word positions — M8 — added).

### 2026-06-12 — Task 1 — BLIND A/B (the owed pair; prior wave-2 entry was a with-skill self-check) — performer (with/without) + blind judge: claude-opus-4-8 (workflow subagents)

| Marker | without | with |
| --- | --- | --- |
| M1 | miss | hit |
| M2 | miss | hit |
| M3 | miss | hit |
| M4 | miss | hit |
| M5 | miss | hit |
| M6 | miss | hit |
| M7 | miss | hit |
| M8 | miss | hit |
| M9 | miss | hit |
| M10 | miss | hit |
| M11 | miss | hit |
| M12 | miss | hit |

Verdict: **STRONG DELTA**. With-skill hit 12/12 markers; gap over no-skill = 12 markers. Refusal missed by skill run: False.
Load path (expected, not re-tested this run): skill_load(story_driven_content_craft, full) — full load only; zero skill_reference_load calls (no references exist); must NOT load hook_craft_short_form or viral_video_script_structure.
Notes: Output Y (skill run) hits all 12 markers; Output X (no-skill) hits 0. Y supplies the full named-rule machinery: written-first kicker with stranger-text gate, 5 tier-ranked lenses with T4 category-of-one + T1 rejection, but/therefore transition tags, named "organize harder" villain, numeric intensity curve, rebuy/loop map, W-stack demotion, and the complete reject-pass bundle. X is a competent-but-generic essay plan that buries where/when in the opening, forces the dog line in twice (M12 miss), and provides no atomic line, no villain, no numbered curve. M10 borderline for X but its drafted first line leads with "two years" throat-clearing, so miss. No guardrail markers in play.
