<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/information_architecture_review/references/ia-heuristics.md -->

# IA & Interaction Heuristics

The named principles behind a structural review. Use these to ground findings in a stated principle instead of generic UX intuition — and to cite the source when a recommendation is challenged.

## 1. Norman — the two gulfs

Every interaction crosses two gaps. Most "confusing UI" is an unbridged gulf.

- **Gulf of execution** — the distance between the user's intention and the actions the system allows. Bridged when the user can _see_ how to do what they want (the right control is visible, discoverable, and labeled with their intent). Unbridged when the user must guess, hunt, or already know.
- **Gulf of evaluation** — the distance between the system's state and the user's understanding of it. Bridged when the user can _tell what happened_ after acting (feedback, visible state change, confirmation). Unbridged when an action produces no observable result.

Diagnostic questions: _Can the user see how to act? After they act, can they tell what the system did?_ A "no" to either is a high-severity structural finding.

## 2. Norman — seven stages of action

Walk a flow against these stages to locate exactly where it breaks:

1. Goal (form the intention)
2. Plan (choose an action)
3. Specify (decide the exact operation)
4. Perform (do it)
5. Perceive (notice the system's state)
6. Interpret (make sense of it)
7. Compare (does it match the goal?)

Stages 1–4 sit on the execution side; 5–7 on the evaluation side. Naming the failing stage turns "this feels off" into a precise fix.

## 3. Norman — affordance vs signifier

- **Affordance** — what an element _can_ do (a button can be clicked).
- **Signifier** — the perceivable cue that _tells_ the user it can (it looks clickable, is labeled, has a hover/focus state).

Failure mode: the affordance exists but the signifier is missing (a clickable card with no cue) or lies (something that looks actionable but is not). Fix the signifier, not the user's expectation.

Related: **mapping** (controls should spatially/logically correspond to their effects) and **constraints** (prevent invalid actions rather than punishing them after the fact).

## 4. Cooper — three models, and the leak

- **Implementation model** — how the system actually works internally (tables, ids, states, sync jobs).
- **Conceptual model** — the model the interface presents to the user.
- **Mental model** — what the user believes is happening.

Goal: the conceptual model matches the user's mental model, and the implementation model stays hidden. **Model leak** is the most common high-severity IA defect: surfacing `entity_id`, `status_enum`, `created_ts`, internal state names, or system jargon as if they were user concepts. Relabel to the user's domain language; hide or translate internal structure.

## 5. Nielsen — the IA-relevant heuristics

Of the ten usability heuristics, these are the structural ones (the rest are craft/accessibility, delegated elsewhere):

- **Visibility of system status** — always show what is happening (loading, saved, current location). Directly bridges the gulf of evaluation.
- **Match between system and the real world** — speak the user's language; follow real-world conventions; present information in a natural order.
- **User control & freedom** — provide a clearly marked exit, undo, and redo for consequential actions. Never trap the user (browser-back-only is a trap).
- **Consistency & standards** — same word, same control, same place for the same thing; follow platform conventions so users do not have to learn yours.
- **Recognition rather than recall** — make options, actions, and previously entered data visible; do not force the user to remember across steps.
- **Help users recognize, diagnose, and recover from errors** — plain-language error messages that say what happened and how to fix it; prevent the error where feasible.

## 6. Morville — findability and the wayfinding triad

- **Findability facets:** can users find what they need by the path they expect? Check navigation labels, search, filtering, and information scent (does a label predict what is behind it?).
- **Wayfinding triad** — at every screen the user should be able to answer:
    - _Where am I?_ (active-state signifier, breadcrumb, section heading)
    - _Where can I go?_ (visible, labeled navigation)
    - _How do I get back?_ (in-product back/cancel, not browser-dependent)

A "no" on any of the three is a wayfinding finding; all three failing on a core flow is high severity.

## 7. Labels & grouping checklist

- Use the user's words, not internal/domain jargon (unless the jargon _is_ the user's language).
- Group by user task and mental model, not by database structure or org chart.
- Every label should carry information scent — predict what is behind it.
- Prefer verbs that name the result ("Save changes", "Invite teammate") over generic or system verbs ("Commit", "Submit", "OK").
- Avoid ambiguous fourth things: every navigation item should map to a concept the user already has or can form on sight.

## 8. Recovery & error-prevention checklist

- Every consequential action has an obvious undo or confirmation-before-commit.
- Destructive actions are guarded (confirm, or soft-delete with restore) and never the default/easy path.
- Errors are prevented structurally where possible (disable invalid options, constrain inputs) rather than reported after failure.
- Error messages state cause + remedy in plain language; they never blame the user or expose stack/implementation detail.

## Applying this in a review

1. Map goal → conceptual model → primary flow → wayfinding first (the Output contract's Part 1).
2. For each rough spot, name the failing principle from above (gulf, stage, model leak, missing signifier, broken wayfinding triad, absent recovery).
3. Cite the principle and source in the finding so the recommendation is defensible.
4. Lead with comprehension/recovery blockers; hold cosmetic items for `visual_craft_fundamentals` and semantics for `accessibility_inclusive_ui_review`.
