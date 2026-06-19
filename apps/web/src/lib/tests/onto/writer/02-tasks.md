<!-- apps/web/src/lib/tests/onto/writer/02-tasks.md -->

# 02 — Tasks: Create & Update

**Entry context**: `project` (already inside _The Last Ember_, `entity_id = {{PROJECT_ID}}`).
Assumes the `01` fixture exists.

The hard part of task creation is **judgment**, not mechanics: knowing _when_ to create a task vs.
just doing the work, linking to the right plan, and not duplicating what already exists. These
cases test that boundary.

---

## A. Creating tasks

### 2.1 — Straightforward create, correct plan link

**User input**

```text
Add a task to research medieval blacksmithing techniques, and another to write the antagonist's character profile.
```

**Expected tool calls**

```jsonc
create_onto_task({
  project_id: "{{PROJECT_ID}}",
  title: "Research medieval blacksmithing techniques",
  plan_id: "{{PLAN_WORLDBUILDING}}",
  priority: 3, state_key: "todo"
})
create_onto_task({
  project_id: "{{PROJECT_ID}}",
  title: "Write the antagonist's character profile",
  plan_id: "{{PLAN_CHARACTER}}",
  priority: 4, state_key: "todo"
})
```

**✅ Pass**

- Two tasks, each on the topically-correct plan (blacksmithing → World Building, antagonist →
  Character Development). To link correctly the agent must know the plan ids — either from
  conversation context or a `search_project`/`list_onto_plans` lookup first.
- `state_key` defaults to `todo`; `project_id` always present.
- The antagonist task title stays generic — the agent does **not** invent the antagonist's name
  (the author hasn't given one).

**❌ Fail**

- Both tasks dumped on the project root with no plan, or swapped onto the wrong plans.
- Invents an assignee, due date, priority, or a name (e.g. an antagonist called "The Shadow King")
  the user never gave, and presents it as fact.

---

### 2.2 — "Do the work" boundary (negative — should NOT create a task)

> The `create_onto_task` tool is explicitly: _"Do not create tasks for research, brainstorming,
> summarizing, or drafting you can do now; do the work instead."_ This is the single most important
> task test.

**User input**

```text
Brainstorm ten possible names for the magic system.
```

**✅ Pass**

- Agent **answers inline** with ten names. **Zero** `create_onto_task` calls.
- (Optional, only if the user then says "save these") writes them to a doc or task — not before.

**❌ Fail**

- Creates a task "Brainstorm magic system names" and stops, handing the work back to the user.

**Variant 2.2b**

```text
Remind me what this book is about so far.
```

**✅ Pass** — agent reads the project overview/context doc (created in `01`) and summarizes the
premise. No task created.
**❌ Fail** — creates a "Summarize the premise" task, or answers from memory without reading the
overview doc.

---

### 2.3 — Duplicate avoidance

**Precondition**: `{{TASK_OUTLINE}}` ("Outline first three chapters") already exists.

**User input**

```text
Make sure I've got outlining the first three chapters on my list.
```

**Expected tool calls**

```jsonc
search_project({ project_id: "{{PROJECT_ID}}", query: "outline first three chapters", types: ["task"] })
// → finds {{TASK_OUTLINE}}; do NOT create a second one
```

**✅ Pass** — searches first, finds the existing task, tells the user it already exists (and its
state) instead of creating a duplicate.

**❌ Fail** — blindly creates a near-identical second task.

---

### 2.4 — Decomposition of a vague ask

**User input**

```text
I need to get this book professionally edited before launch.
```

**✅ Pass** (either is acceptable, agent should pick one and be transparent)

- Creates one clear task "Arrange professional editing" linked to a publishing plan, **or**
- Asks one scoping question (developmental vs. copy edit? budget/timeline?) then creates.

**❌ Fail** — fabricates a detailed multi-task editing pipeline with invented vendor names and dates.

---

## B. Updating tasks

### 2.5 — Natural-language completion (search → update)

**User input**

```text
I finished mapping out the kingdom.
```

**Expected tool calls**

```jsonc
search_project({ project_id: "{{PROJECT_ID}}", query: "map out the kingdom", types: ["task"] })
// → {{TASK_KINGDOM}}
update_onto_task({ task_id: "{{TASK_KINGDOM}}", state_key: "done" })
```

**✅ Pass** — resolves the fuzzy reference to the right task via search, then flips `state_key` to
`done`. Confirms which task it closed.

**❌ Fail** — asks the user for a task id, or marks the wrong "map"/"kingdom" task done without
confirming.

---

### 2.6 — Partial update preserves other fields

**User input**

```text
Bump the magic system task up to top priority.
```

**Expected tool calls**

```jsonc
update_onto_task({ task_id: "{{TASK_MAGIC}}", priority: 5 })
```

**✅ Pass** — only `priority` changes. Title, description, `plan_id`, and `state_key` are untouched
(update merges; omitted fields are left alone).

**❌ Fail** — re-sends the whole task and accidentally blanks the description or unlinks the plan;
or changes state to `in_progress` as a side effect the user didn't ask for.

---

### 2.7 — Props merge, not replace (progress logging)

**Precondition**: `{{TASK_OUTLINE}}` has `props: { chapters_outlined: 1 }`.

**User input**

```text
Log that I've now outlined two of the three chapters.
```

**Expected tool calls**

```jsonc
update_onto_task({ task_id: "{{TASK_OUTLINE}}", props: { chapters_outlined: 2 } })
```

**✅ Pass** — `props` merges; any sibling keys already in props survive. Task stays `todo`/
`in_progress` (not `done` — only 2 of 3).

**❌ Fail** — marks it `done` prematurely, or replaces the whole `props` object and drops sibling
keys.

---

### 2.8 — Ambiguous reference → disambiguate

**Precondition**: two tasks contain "chapter" (e.g. "Outline first three chapters" and a later
"Write Chapter 3").

**User input**

```text
Mark the chapter task as done.
```

**✅ Pass** — agent surfaces the candidates ("Did you mean _Outline first three chapters_ or _Write
Chapter 3_?") and waits, **or** uses clear recency/context to justify a pick out loud.

**❌ Fail** — silently picks one and marks it done with no signal that it guessed.

---

### 2.9 — Reschedule

**User input**

```text
Push the antagonist profile task to next month.
```

**Expected tool calls**

```jsonc
search_project({ project_id: "{{PROJECT_ID}}", query: "antagonist character profile", types: ["task"] })
update_onto_task({ task_id: "[found]", due_at: "[today + 1 month, ISO]" })
```

**✅ Pass** — sets a concrete ISO `due_at` ~1 month out; other fields unchanged.
**❌ Fail** — writes a vague string ("next month") into `due_at`, or changes priority/state too.

---

## Combined progress turn (realistic, multi-op)

**User input**

```text
I finished chapter 2 — 4,500 words. The dragon-forge scene went great. I still need to fix some dialogue, and I want to start chapter 3.
```

**Expected behavior** — one turn, several tool calls:

1. `search_project(... "chapter 2" types:["task"])` → if a Chapter 2 task exists, `update_onto_task`
   to `done` with `props: { word_count: 4500 }`.
2. `create_onto_task` "Revise Chapter 2 dialogue" → `{{PLAN_CHAPTERS}}`, priority 4.
3. `create_onto_task` "Write Chapter 3" → `{{PLAN_CHAPTERS}}`, priority 5.

**✅ Pass** — closes the finished work, opens the two genuinely-new future work items, logs the
word count as props. Does **not** create a task for "fix dialogue" _and_ a duplicate "revise
dialogue".

**❌ Fail** — creates a task to "write chapter 2" (already done), or files the 4,500-word note as a
new document nobody asked for.
