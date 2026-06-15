---
name: Information Architecture Review
description: >-
    Child skill under Build Quality UI/UX for the structure-first lens: map the user's goal, the system's conceptual model, the primary flows, navigation and wayfinding, labels and grouping, feedback, and error recovery — before visual polish. Returns a structural map plus evidence-backed findings.
parent_id: build_quality_ui_ux
depth: 1
preserve_markdown: true
legacy_paths:
    - product-and-design.information-architecture-and-interaction-fundamentals.skill
    - product-and-design/information-architecture-and-interaction-fundamentals
reference_modules:
    - id: information_architecture_review.ia_heuristics
      name: IA & Interaction Heuristics
      summary: The deep canon — Norman's gulfs and seven stages of action, affordance vs signifier, Cooper's conceptual/mental/implementation model gap, the IA-relevant Nielsen heuristics, Morville's findability facets, the wayfinding triad, and label/grouping and recovery checklists.
      when_to_load:
          - Before producing structural findings, to apply named heuristics rather than generic UX intuition.
          - When the user disputes a finding and you need the underlying principle and source.
      path: references/ia-heuristics.md
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/information_architecture_review/SKILL.md
---

# Information Architecture Review

The structure-first lens. Before anyone asks whether a screen is _pretty_, this skill asks whether the user can understand it: do they know **where they are**, **what things mean**, **what is actionable**, **what just happened**, and **how to get back**. Run this lens first when a feature, flow, or workspace feels confusing — visual polish on a broken conceptual model just makes the confusion look nicer.

This is the holistic pass: build a map of the system's structure and the user's path through it, then report structural fixes before cosmetic ones. The deep heuristics live in the `information_architecture_review.ia_heuristics` reference module — load it before producing findings.

## When to Use

- Reviewing a feature, flow, navigation model, dashboard, workspace, settings area, builder, or multi-step task that feels confusing, even when the individual screens look acceptable.
- The user asks about information architecture, labels, affordances, signifiers, conceptual models, navigation, wayfinding, feedback, or error recovery.
- A screen looks fine but users may not know what to do, where they are, what changed, or how to recover.
- `ui_ux_quality_review` (or the parent router) escalated a "conceptual confusion" finding here.
- You need to understand the whole structure before a redesign, not just audit one screen's pixels.

## Workflow

1. **State the goal and the conceptual model in plain language.** What is the user trying to accomplish here, and what is the system's model of this domain (its objects, their relationships, the verbs that act on them)? If you cannot state both in one sentence each, that gap is your first finding.
2. **Map the primary flow.** Walk the path from entry to goal completion as the user experiences it: each step, the decision required, and what carries the user forward. Note dead ends, hidden steps, and points where the next action is unclear.
3. **Load `information_architecture_review.ia_heuristics`** and apply the named lenses rather than generic intuition:
    - **Gulfs (Norman):** is the gulf of execution bridged (can the user see how to act?) and the gulf of evaluation bridged (can the user tell what the system did?).
    - **Model gap (Cooper):** is the interface presenting a clean conceptual model, or is it leaking the implementation model (database tables, internal states, system jargon)?
    - **Labels & grouping:** do labels use the user's words, carry information scent, and group by user task rather than internal structure?
    - **Affordances & signifiers:** does what _looks_ actionable match what _is_ actionable, and does each action signify its result?
    - **Wayfinding triad (Morville):** can the user always answer _Where am I? Where can I go? How do I get back?_
    - **Feedback & recovery (Nielsen):** is system status visible, are errors prevented where possible, and is there an obvious undo / recovery path for every consequential action?
4. **Separate structural findings from polish.** Anything about comprehension, model, flow, labels, wayfinding, feedback, or recovery is in scope here. Pure visual-craft, accessibility-semantics, or persuasion-copy issues get tagged for the sibling skill, not solved here.
5. **Return the structural map and findings using the Output contract**, leading with the fixes that unblock comprehension and task completion.

## Output

Return two parts.

**Part 1 — Structural map** (the holistic understanding, in plain language):

```
Goal: <what the user is trying to accomplish on this surface>
Conceptual model: <the objects, relationships, and verbs the UI presents>
Primary flow: <entry → … → goal, as the user experiences it>
Wayfinding: <how the user knows where they are / where they can go / how to get back>
```

**Part 2 — Structural findings**, each in this shape:

```
Lens: <model | flow | labels | affordances | wayfinding | feedback | recovery>
Finding: <named principle violated, e.g. "Implementation model leaked" or "Gulf of evaluation: no feedback after save">
Evidence: <specific screen, control, label, step, or state>
Severity: <high | medium | low>
Fix: <concrete structural change — relabel, regroup, add feedback, add recovery path, reshape the flow>
Delegated: <optional sibling skill id when the residual fix is out of scope>
```

Severity rubric:

- **high** — the user cannot understand the model, find the path, or recover from a consequential action; the task is blocked or data loss is possible.
- **medium** — the user can get through it but with avoidable confusion, recall burden, or wrong-turn risk.
- **low** — minor label, grouping, or feedback refinement.

Stop conditions before returning: the structural map is filled in (or its missing pieces are themselves named as findings); every finding cites specific evidence and a severity; structural fixes lead, with cosmetic ones held back or delegated; out-of-scope concerns are tagged `Delegated`, not dropped.

## Worked Example

**Input (summary):** A project "Settings" area with three tabs — _General_, _Members_, _Records_. The "Records" tab lists rows labeled `entity_id`, `created_ts`, and `status_enum`; a primary button reads "Commit". Saving a change flips the button to "Commit" again with no message. There is no breadcrumb; the only way out of an editing sub-panel is the browser back button. User goal: rename the project and add a teammate.

**Structural map:**

```
Goal: rename the project and invite a teammate.
Conceptual model presented: tabs of "settings," but "Records" exposes raw rows (entity_id/created_ts/status_enum) — the data model, not a user concept.
Primary flow: Settings → General (rename lives here?) → Members (invite lives here) → save. Rename location is ambiguous; "Records" is an unexplained fourth thing.
Wayfinding: no breadcrumb, no active-tab affordance beyond color; exiting a sub-panel relies on browser back.
```

```
Lens: model
Finding: Implementation model leaked — "Records" surfaces entity_id, created_ts, status_enum
Evidence: Records tab rows labeled `entity_id`, `created_ts`, `status_enum`.
Severity: high
Fix: Either hide Records from this audience or relabel to a user concept ("Activity log") with human columns (who, what, when). Settings should present what the user manages, not database rows.
```

```
Lens: feedback
Finding: Gulf of evaluation — no confirmation after a consequential save
Evidence: Saving flips the button back to "Commit"; no success message or state change.
Severity: high
Fix: Show explicit success feedback ("Saved" / toast) and reflect the new value in place, so the user can tell the system did what they asked.
```

```
Lens: labels
Finding: Action label does not carry intent — "Commit"
Evidence: Primary button reads "Commit" (version-control jargon) for a settings save.
Severity: medium
Fix: Use the user's verb: "Save changes". Reserve domain jargon for domains where it is the user's own language.
```

```
Lens: recovery
Finding: No in-product way out of the editing sub-panel
Evidence: Exiting relies on the browser back button; no Cancel/Close affordance.
Severity: medium
Fix: Add an explicit Cancel/Close that returns to the tab without applying changes (user control & freedom).
```

```
Lens: wayfinding
Finding: Weak "where am I" signal
Evidence: Active tab distinguished by color alone; no breadcrumb or section heading in the sub-panel.
Severity: low
Fix: Add a clear active-tab signifier plus a sub-panel heading so the user can always name their location.
Delegated: visual_craft_fundamentals (the exact active-state styling is a craft decision)
```

**Top fixes (ranked by impact on the stated goal):** (1) relabel/restructure "Records" so the Settings model matches a user concept; (2) add save feedback so the rename visibly takes effect; (3) make the invite and rename locations unambiguous and add an in-product exit.

## Guardrails

- Do not start with color, typography, or spacing when the user cannot understand the model, find the path, or recover. Structure outranks polish here by definition.
- Do not invent novel interaction patterns where an established convention would lower cognitive load — recognition beats recall.
- Do not flag a database/implementation term as fine just because it is accurate; accurate-but-internal labels are a model leak.
- Do not assign severity without the rubric, and do not include a finding you cannot tie to a specific screen, control, label, step, or state.
- Tag visual-craft, accessibility-semantics, and persuasion-copy residue for the sibling skills instead of solving them here.
- Apply the named heuristics from the reference module rather than generic UX opinion; cite the principle when the user pushes back.

## Notes

- Primary sources: Don Norman (_The Design of Everyday Things_ — gulfs, stages of action, affordances/signifiers), Alan Cooper (_About Face_ — conceptual vs implementation models), Jakob Nielsen (usability heuristics), and Peter Morville / Abby Covert (findability, wayfinding, information architecture).
- The deep heuristics, checklists, and thresholds live in `information_architecture_review.ia_heuristics`; load it before producing findings.
- Source backing is canonical book/article analysis. A future pass should add long-form transcript material (Abby Covert, Jared Spool, long-form Norman) to deepen the wayfinding and labeling checklists.
- This skill is the structure-first half of a review; pair it with `ui_ux_quality_review` for the build-quality half and `accessibility_inclusive_ui_review` for the semantics floor.
