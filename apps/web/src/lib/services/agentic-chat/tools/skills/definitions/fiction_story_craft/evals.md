<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/fiction_story_craft/evals.md -->

# Evals — fiction_story_craft

Golden tasks per `../../EVALS_GUIDE.md`. The runtime preloads this skill in short format for an established fiction project; Run B may use the full shell when testing the complete craft machinery. The skill has no reference modules.

---

## Task 1 — Generate grounded character options without changing canon

### Task prompt

> This is my novel workspace. Ilyan has just learned that the city wards are powered by prisoners. What should he do next? Give me options.
>
> Character canon: Ilyan wants to belong to the Council, refuses to become coercive like his father, and is protective of Mara.
>
> Structure canon: Part II needs Ilyan's first public break with the Council, but the later trial requires him to retain institutional access.
>
> Current chapter: Mara does not know about the prisoners. Captain Sevrin saw Ilyan enter the ward chamber.
>
> World canon: destroying one ward immediately exposes its district.

### Delta markers

1. **M1 (mode boundary):** Selects EXPLORE and makes zero durable writes; ends with an explicit “No project facts changed” status.
2. **M2 (evidence sweep):** Uses the focal character, structure/arc, current chapter, and relevant world rule; does not ask for or inventory unrelated project documents.
3. **M3 (canon ledger):** Separates supplied canon, unresolved pressure, assumptions, and assistant proposals; no generated detail is stated as established fact.
4. **M4 (option count and shape):** Returns 3–5 Option Cards, each with Move, Causal bridge, Arc effect, Continuity fit, Cost/risk, and Next beat.
5. **M5 (grounding):** Every option grounds itself in at least two fixture facts or one fixture fact plus the central unresolved pressure.
6. **M6 (causal diversity):** Options differ across at least two causal levers (choice, pressure, information, relationship, cost); they are not cosmetic versions of one event.
7. **M7 (arc integration):** Every option names how Ilyan's want, anti-father belief, protective relationship, or arc position changes.
8. **M8 (continuity gate):** Preserves the ward-destruction constraint or explicitly labels a needed new rule as an assumption; does not casually destroy a ward.
9. **M9 (best-fit is not canon):** Recommends at most one best-fit proposal after comparison and explicitly says it remains a proposal until chosen.
10. **M10 (framework restraint):** Does not impose Hero's Journey, Save the Cat, or three-act terminology not present in the fixture.

### Expected load path

- Established fiction workspace: server preload of `fiction_story_craft` at short format; optional `skill_load(fiction_story_craft, full)` only if the complete worked machinery is needed.
- Expected reads: focused project search only if IDs are unavailable, followed by document outline/section reads.
- Expected writes: zero.

### Discovery probe

“Given this novel, what should happen with this character next? Give me three options.” → `writing.fiction` and `fiction_story_craft`.

---

## Task 2 — Propagate one confirmed beat without duplicating the story bible

### Task prompt

> Add this to the book: In chapter 8, Mara discovers that Ilyan hid the prisoner ledger. She stops trusting his judgment, and Ilyan decides he has to expose the Council publicly instead of working inside it.
>
> Existing project map: Character — Mara (`doc_mara`); Character — Ilyan (`doc_ilyan`); Story Structure (`doc_structure`); World Rules (`doc_world`). No chapter 8 document exists. The structure already has a Chapter 8 section.

### Delta markers

1. **M1 (mode boundary):** Selects CAPTURE because the author supplies confirmed facts.
2. **M2 (smallest reads):** Reads existing relevant sections in `doc_mara`, `doc_ilyan`, and `doc_structure`; does not scan or rewrite `doc_world` when no world rule changes.
3. **M3 (primary routing):** Updates Chapter 8 in `doc_structure` with the discovery and public-exposure decision.
4. **M4 (secondary propagation):** Updates Mara's relationship/trust state and Ilyan's motivation/arc position in their existing character sheets.
5. **M5 (no duplication):** Does not create a second story structure, duplicate character sheet, empty Chapter 8 container, milestone, task, or plan.
6. **M6 (preservation):** Uses merge/section-targeted updates with non-empty content and preserves unrelated facts.
7. **M7 (canon only):** Does not add the assistant's own consequences, dialogue, dates, motives, or world facts as canon.
8. **M8 (receipt):** Returns a write receipt naming all three updated documents and why each changed.
9. **M9 (schedule restraint):** Explicitly confirms no schedule or milestone was invented from “chapter 8.”
10. **M10 (open conflicts):** Surfaces any found conflict instead of silently resolving it; otherwise states that none was found in the inspected sections.

### Expected load path

- The explicit “chapter”/character/structure language may lexically preload `fiction_story_craft` at short format. A terse declarative fact may stay on the lightweight living-reference capture path; the project affinity must not force a craft preload for every tidbit.
- Direct reads of exact document IDs and direct document updates; zero discovery calls because the map supplies IDs.

### Discovery probe

Persisted `agent_workspace.domain_profile=fiction_story` plus the declarative turn should activate living-reference capture without requiring the words “novel” or “story”; craft preloading is optional for this capture-only case.

---

## Task 3 — Draft a scene but keep proposed details out of canon

### Task prompt

> Draft the confrontation between Mara and Ilyan after she finds the ledger. Close third from Mara, about 700 words. Don't save it yet.
>
> Canon: The scene is in the abandoned observatory before dawn. Mara wants Ilyan to admit he chose the Council over her. Ilyan wants her help exposing the Council. Mara knows the ledger exists but not where he hid it. Neither character knows Sevrin followed them.

### Delta markers

1. **M1 (mode boundary):** Selects DRAFT and makes zero durable writes; respects “Don't save it yet.”
2. **M2 (draft frame):** Locks POV, where/when, scene objective, opposition, and turn before drafting.
3. **M3 (canon anchors):** Names at least three controlling fixture facts and keeps them consistent in the prose.
4. **M4 (knowledge-state continuity):** Mara does not know the ledger location; neither character knowingly reacts to Sevrin.
5. **M5 (requested span):** Produces only the requested confrontation rather than inventing a chapter outline or later plot resolution.
6. **M6 (proposal ledger):** After the draft, lists any newly invented sensory detail, gesture, line of history, or tactical choice as a proposal rather than canon.
7. **M7 (continuity notes):** Reports facts used, intentional tensions, and items needing confirmation.
8. **M8 (save status):** Ends with an explicit “Not saved” status.
9. **M9 (no framework imposition):** Does not reshape the scene around an unsolicited story framework.

### Expected load path

- Server preload of `fiction_story_craft` at short format from persisted fiction affinity.
- Focused evidence reads if these fixtures came from project documents; expected writes: zero.

### Discovery probe

“Draft the confrontation between these two characters, close third from Mara, but don't save it.” inside a fiction project → `fiction_story_craft`.

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
