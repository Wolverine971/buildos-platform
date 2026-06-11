<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/hook_craft_short_form/evals.md -->

# Evals — hook_craft_short_form

Golden tasks per `../../EVALS_GUIDE.md`. This skill has no reference modules — Run B gets the full SKILL.md only.

---

## Task 1 — Generate a hook from scratch

### Task prompt

> I'm filming a short-form video (Reels/TikTok) this week. Write the hook.
>
> - **Topic:** how dumping your messy thoughts into one place turns into an organized project plan — the video shows this happening live in BuildOS.
> - **Available footage:** a clean screen recording of a rambling voice-note transcript turning into a structured project board (tasks appear, phases form), plus talking-head footage of me at my desk. No b-roll, no props.
> - **Audience:** overwhelmed solo founders and creators with notes scattered across six apps, who feel behind on everything.
> - **Body payoff:** the video really does show the full transformation in ~40 seconds, ending with the organized board.
>
> Give me everything I need to shoot the opening.

### Delta markers

1. **M1 (visual-first decision rule):** Picks the archetype FROM the available footage (screen recording → Experimenter, or argued equivalent) and says so — not from the topic. An unexplained archetype, or no archetype, is a miss.
2. **M2 (slot map):** Output includes an explicit labelled slot map — Subject / Action / Objective / Contrast (+ optional Proof / Time) — with mandatory slots all filled.
3. **M3 (three beats):** Context Lean / Scroll-Stop Interjection / Contrarian Snapback appear as labelled fields; the scroll-stop uses a contrastive connector (but / however / yet / although).
4. **M4 (Delay threshold):** The topic noun appears in the first 5–7 words of the spoken hook.
5. **M5 (sentence cap):** Every spoken-hook sentence is ≤12 words; hook is ≤3 lines.
6. **M6 (text overlay rules):** Text overlay is 3–5 words AND contains no literal product/feature name ("BuildOS", "brain dump" as feature name) — an emotional category phrase instead.
7. **M7 (four-mistake diagnostic):** Delay / Confusion / Irrelevance / Disinterest each explicitly marked clean or fail-with-fix.
8. **M8 (Irrelevance pass):** Spoken hook uses `you/your` and agitates a named audience painpoint (scattered notes / feeling behind / overwhelm) — not first-person `I` unless the result is the hook.
9. **M9 (variants guardrail):** 3–5 variants provided, using different archetypes or lean mechanisms — never a single hook.
10. **M10 (full bundle contract):** All bundle fields present: archetype, slot map, three beats, spoken hook, text overlay, visual cue, audio cue, lean mechanism, contrast mode (stated/implied with assumed A named if implied), two-variable score, four-mistake result, comprehension-sandwich note, variants, payoff coherence note.
11. **M11 (payoff coherence):** A one-sentence payoff coherence note ties the hook's promise to the stated 40-second transformation in the body.
12. **M12 (BuildOS register):** The objective slot reads as relief, not creator-economy shock (no "go viral", "0 to 100K"-style framing), and no jargon ("context engineering", "ontology", "second brain OS") in the spoken hook.

### Expected load path

- `skill_load(hook_craft_short_form, full)` — the Four Pillars, BuildOS Voice Translation, and `## Output` bundle all live outside the short-format parsed sections; a `short` load loses the slot grammar and the bundle contract.
- References: none exist; zero `skill_reference_load` calls. Any reference-load attempt is a usage failure.
- Should NOT load: `viral_video_script_structure` or `content_strategy_beyond_blogging` — the ask is hook-only.

### Discovery probe

"Write the hook for my TikTok about turning messy notes into a project plan." → catalog description matches on "Draft, audit, and rewrite hooks for short-form video … the first 1–5 seconds."

---

## Task 2 — Audit a mediocre draft hook

### Task prompt

> Here's the hook I wrote for a short video about why most productivity apps make overwhelm worse. Audit it — is it good enough to ship?
>
> Draft (spoken, over talking-head footage):
>
> > "So a few weeks ago I was sitting at my desk going through all my apps, and I started thinking about something kind of interesting. I've been struggling to keep my notes and tasks organized for years, and I realized there's a reason for that which most people never really consider."
>
> Text overlay idea: "My productivity journey"
> The body of the video argues that adding more apps fragments your thinking, and one capture point fixes it.

### Delta markers

1. **M1 (slot tagging):** Maps the draft's words to slots and explicitly marks missing mandatory slots — at minimum Contrast is flagged missing.
2. **M2 (diagnostic order + stop rule):** Runs Delay → Confusion → Irrelevance → Disinterest in order and names **Delay** as the first failure (topic noun absent from the first 5–7 words / first ~2 seconds; "So a few weeks ago I was sitting at my desk" is throat-clearing to delete).
3. **M3 (Irrelevance named):** Flags the draft as Irrelevance-failing with the specific conversion move: "I've been struggling…" → "If you've struggled…" / `you/your` framing against a specific painpoint.
4. **M4 (Disinterest named):** Flags missing A-vs-B contrast and supplies one (A = "more apps = more organized", B = "more apps = more fragmented") — the body's actual contrarian claim.
5. **M5 (two-variable refusal):** Scores topic clarity and on-target curiosity as explicit yes/no, lands below 2/2, and refuses to ship the draft as-is (guardrail: no hooks below 2/2).
6. **M6 (verbatim LLM prompt):** Proposes the Kallaway clarity-rewrite prompt verbatim ("I've written a hook for a short-form video about X topic… sixth-grade reading level…") and scopes the LLM to clarity rewriting only — not generation.
7. **M7 (rewrite candidates):** Provides exactly 3 rewrite candidates, each fixing the identified failure mode, each with topic noun in the first 5–7 words and ≤12-word sentences.
8. **M8 (overlay rules applied):** Rejects "My productivity journey" (first-person, no topic, no painpoint) and proposes a 3–5 word audience-vocabulary replacement.
9. **M9 (audit-mode output contract):** Output is a diagnostic report naming the failed pass(es) and proposed fix — replacing the variants section per the audit-mode contract — and re-runs the comprehension sandwich on the chosen candidate.
10. **M10 (archetype identification):** Names the archetype the draft is implicitly reaching for (Investigator — "a reason most people never consider") before rewriting.

### Expected load path

- `skill_load(hook_craft_short_form, full)` — audit workflow, diagnostic, and the verbatim LLM prompt are all outside short-format sections.
- References: none; zero reference loads.
- Should NOT load: `story_driven_content_craft` / `viral_video_script_structure` — body structure is out of scope for a hook audit.

### Discovery probe

"Is this hook good enough, or should I rewrite it?" (+ pasted draft) → description matches on "audit … hooks for short-form video … produce or evaluate the first 1–5 seconds."

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
