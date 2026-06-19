<!-- apps/web/src/lib/tests/onto/writer/04-goals-milestones-risks.md -->

# 04 — Goals, Milestones & Risks

**Entry context**: `project` for goals/milestones, `project_audit` for the risk pass.
Assumes the `01` fixture exists (`entity_id = {{PROJECT_ID}}`).

Covers the planning entities a writer adds after the project is rolling: new goals, a publishing
timeline of milestones, and a risk assessment.

> ⚠️ **No requirement-write tool exists.** The old flat writer file used `create_onto_requirement`
> — that tool is not real. "Requirements" like a deadline or a word-count target are modeled here
> as a **milestone** (deadline) + a measurable **goal** (word count), or as risks. Don't call a
> `create_onto_requirement`.

---

## A. Goals

### 4.1 — Add a measurable goal

**User input**

```text
Add a goal: hit 80,000 words on the first draft.
```

**Expected tool calls**

```jsonc
create_onto_goal({
  project_id: "{{PROJECT_ID}}",
  name: "Reach 80,000 words on the first draft",
  type_key: "goal.outcome",
  props: { target: 80000, unit: "words" }
})
```

**✅ Pass** — measurable target captured in `props`; linked to the project. If the agent recognizes
this overlaps the existing `{{GOAL_DRAFT}}` ("Complete first draft"), linking the new goal to it or
folding it in is a plus.
**❌ Fail** — calls a non-existent `create_onto_requirement`, or stores "80,000 words" only as free
text with no structured target.

---

## B. Milestones (publishing timeline)

### 4.2 — Create a sequence of dated milestones

**User input**

```text
I'm self-publishing. Milestones: first draft done March 31, beta readers by May 15, pro edit by July 30, cover design by Aug 15, launch Sept 1.
```

**Expected tool calls** — one per milestone, each with an ISO `due_at`, ideally linked to a goal:

```jsonc
create_onto_milestone({ project_id: "{{PROJECT_ID}}", title: "First draft complete",   due_at: "2026-03-31", goal_id: "{{GOAL_DRAFT}}" })
create_onto_milestone({ project_id: "{{PROJECT_ID}}", title: "Beta reader feedback in", due_at: "2026-05-15" })
create_onto_milestone({ project_id: "{{PROJECT_ID}}", title: "Professional edit done",  due_at: "2026-07-30" })
create_onto_milestone({ project_id: "{{PROJECT_ID}}", title: "Cover design complete",   due_at: "2026-08-15" })
create_onto_milestone({ project_id: "{{PROJECT_ID}}", title: "Book launch",             due_at: "2026-09-01" })
```

Optionally also `create_onto_plan` "Publishing & Launch" (`state_key: active`) to group the
publishing work.

**✅ Pass**

- Five milestones, **chronologically ordered**, each with a concrete ISO date matching the user's
  months.
- "First draft complete" links to `{{GOAL_DRAFT}}` (milestones should usually connect to a goal).

**❌ Fail**

- Folds five distinct checkpoints into one milestone, or drops/garbles a date (e.g. launch before
  edit).
- Files the milestones as tasks instead of milestones.

---

## C. Risks (audit mode)

### 4.3 — Risk assessment

**Context**: `project_audit`

**User input**

```text
Help me think about what could derail this. My worries: writer's block, losing motivation halfway, and not finding time around my day job.
```

**Expected tool calls**

```jsonc
create_onto_risk({
  project_id: "{{PROJECT_ID}}",
  title: "Writer's block",
  props: { impact: "high", probability: 0.6, mitigation: "Daily writing habit; morning pages", category: "creative" },
  state_key: "identified"
})
create_onto_risk({
  project_id: "{{PROJECT_ID}}",
  title: "Loss of motivation mid-project",
  props: { impact: "high", probability: 0.5, mitigation: "Accountability check-ins; visible word-count streak" },
  state_key: "identified"
})
create_onto_risk({
  project_id: "{{PROJECT_ID}}",
  title: "Insufficient writing time around day job",
  props: { impact: "medium", probability: 0.7, mitigation: "Time-boxed early-morning sessions" },
  state_key: "identified"
})
```

**✅ Pass**

- Three risks, each with impact + probability + a **concrete mitigation** (not just a restated
  worry).
- Stays in / respects `project_audit` context.

**❌ Fail**

- Records the worries as tasks or a vague "risks" note instead of structured `onto_risks`.
- Mitigations are empty or just echo the risk title ("mitigation: avoid writer's block").

---

### 4.4 — Update a risk as it changes

**User input**

```text
I've started doing morning pages daily, so writer's block feels handled now.
```

**Expected tool calls**

```jsonc
search_project({ project_id: "{{PROJECT_ID}}", query: "writer's block", types: ["risk"] })
update_onto_risk({ risk_id: "[found]", state_key: "mitigated" })
```

**✅ Pass** — finds the existing risk and transitions its `state_key` (e.g. `identified` →
`mitigated`); does not create a duplicate risk.
**❌ Fail** — creates a new "writer's block (handled)" risk, leaving two competing records.
