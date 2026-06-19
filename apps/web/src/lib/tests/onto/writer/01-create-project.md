<!-- apps/web/src/lib/tests/onto/writer/01-create-project.md -->

# 01 — Create Project

Creates the **fixture** the rest of the suite depends on. Two cases: a comprehensive book project
and a minimal blog project. Entry context for both: `project_create`.

> The agent must build **only** from what the author actually said. The create prompt below names
> no characters, kingdoms, or antagonists — so the agent must not either. Names enter the project
> later, when the author provides them (see `03`).

---

## 1.1 — Comprehensive novel project

**Context**: `project_create`

**User input**

```text
I want to create a fantasy novel project called 'The Last Ember'. It's about a young blacksmith who discovers she can forge magical weapons. I need to develop the main character, create a magic system, map out the kingdom, and outline the first three chapters.
```

**Expected tool calls**

1. Template lookup (find the `writer.book` template).
2. A single `create_onto_project`. Note the **real** shape: a flat `entities[]` array keyed by
   `temp_id` + `kind`, a `relationships[]` array that links those temp*ids, and a
   `context_document`. (Project `type_key` is a `project.*`key —`writer.book`is the \_template*,`project.creative.book` is the stored type.)

```jsonc
create_onto_project({
  project: {
    name: "The Last Ember",
    type_key: "project.creative.book",
    description: "Fantasy novel: a young female blacksmith discovers she can forge magical weapons.",
    props: { facets: { context: "personal", scale: "large", stage: "discovery" } },
    start_at: "[today]"
  },
  entities: [
    { temp_id: "g1", kind: "goal", name: "Complete first draft",  type_key: "goal.outcome" },
    { temp_id: "g2", kind: "goal", name: "Develop magic system",  type_key: "goal.learning" },

    { temp_id: "p1", kind: "plan", name: "World Building",        type_key: "plan.creative.worldbuilding", state_key: "active" },
    { temp_id: "p2", kind: "plan", name: "Character Development", type_key: "plan.creative.character",     state_key: "active" },
    { temp_id: "p3", kind: "plan", name: "Chapter Outlines",      type_key: "plan.writing.chapters",       state_key: "draft"  },

    { temp_id: "t1", kind: "task", title: "Develop the protagonist (the young blacksmith)", priority: 5 },
    { temp_id: "t2", kind: "task", title: "Design the magic system for forging weapons",    priority: 5 },
    { temp_id: "t3", kind: "task", title: "Map out the kingdom",                             priority: 4 },
    { temp_id: "t4", kind: "task", title: "Outline the first three chapters",               priority: 4 },

    { temp_id: "d1", kind: "document", title: "Character Profile — Protagonist", type_key: "document.knowledge.character",     state_key: "draft" },
    { temp_id: "d2", kind: "document", title: "Magic System",                    type_key: "document.knowledge.worldbuilding", state_key: "draft" }
  ],
  relationships: [
    // tasks live under the topically-correct plan (containment)
    { from: { temp_id: "t1", kind: "task" }, to: { temp_id: "p2", kind: "plan" }, intent: "containment" },
    { from: { temp_id: "t2", kind: "task" }, to: { temp_id: "p1", kind: "plan" }, intent: "containment" },
    { from: { temp_id: "t3", kind: "task" }, to: { temp_id: "p1", kind: "plan" }, intent: "containment" },
    { from: { temp_id: "t4", kind: "task" }, to: { temp_id: "p3", kind: "plan" }, intent: "containment" },
    // the magic plan supports the magic goal (semantic)
    { from: { temp_id: "p1", kind: "plan" }, to: { temp_id: "g2", kind: "goal" }, intent: "semantic" }
  ],
  context_document: {
    title: "The Last Ember — Project Overview",
    content: "## Premise\nA young female blacksmith discovers she can forge magical weapons.\n\n## Open threads\n- Name and backstory the protagonist\n- Design the magic system\n- Name and map the kingdom\n- Outline the first three chapters"
  }
})
```

**✅ Pass**

- Exactly one project, `type_key` under `project.*` (e.g. `project.creative.book`) — **not** the
  raw template key `writer.book`.
- Facets inferred from the prose: `context: personal`, `scale: large` (a novel), `stage: discovery`.
- The four user-named work items map to four tasks, each linked (via `relationships`) to the
  topically-correct plan ("map out the kingdom" → World Building, "outline chapters" → Chapter
  Outlines).
- The two starter documents are created as **empty `draft` stubs** — titles only, no fabricated
  body — because the author hasn't dictated their contents yet.
- The overview/context document describes **only the premise the author gave**, plus open threads.
- Context shifts `project_create` → `project` with `entity_id` = new project id.

**❌ Fail**

- **Invents proper nouns the author never gave** — a protagonist name (e.g. "Elena"), a kingdom
  name (e.g. "Aethermoor"), an antagonist, or a "backstory" that contradicts the premise (she _is_
  the blacksmith; she was not "raised by" one). This is the primary failure this case guards.
- Writes fabricated body content into the Character Profile / Magic System stubs.
- Creates tasks with no plan linkage, or invents plans the user didn't imply.
- Splits creation across many sequential `create_onto_*` calls when one bundled
  `create_onto_project` would do.
- Picks a non-writer template, or uses the template key `writer.book` as the project `type_key`.
- Stalls asking for facets it can clearly infer ("is this large or small?" for a novel).

---

## 1.2 — Minimal blog project

**Context**: `project_create`

**User input**

```text
Start a blog project for a productivity tips series. I want to write 10 articles over the next 3 months.
```

**Expected tool calls**

```jsonc
create_onto_project({
  project: {
    name: "Productivity Tips Blog Series",
    type_key: "project.content.blog",
    description: "A 10-article series on productivity tips.",
    props: { facets: { context: "personal", scale: "small", stage: "planning" } },
    start_at: "[today]",
    end_at: "[today + 3 months]"
  },
  entities: [
    { temp_id: "g1", kind: "goal", name: "Publish 10 productivity articles", type_key: "goal.outcome",
      props: { target_count: 10, measurement: "articles_published" } }
  ],
  relationships: []
})
```

**✅ Pass**

- `project.content.blog` type, `scale: small` (not `large`).
- `end_at` set ~3 months out from `start_at`.
- The "10 articles" target is captured as one measurable goal — **not** pre-created as 10 empty
  task stubs, and **not** ten invented article titles the author never wrote.

**❌ Fail**

- Over-builds: fabricates 10 article tasks/titles, a full plan tree, or article documents up front.
- Drops the time box (`end_at` missing) when the user explicitly said "next 3 months".

---

## 1.3 — Vague request → clarify, don't guess

**Context**: `project_create`

**User input**

```text
Create a writing project.
```

**✅ Pass**

- Agent asks 1–2 sharp clarifying questions (what kind of writing? topic/working title?) **before**
  committing a project, or creates a deliberately minimal placeholder and says so. The
  `create_onto_project` tool supports a `clarifications[]` array for exactly this.

**❌ Fail**

- Silently invents a fully-specified novel with a title, characters, plans, and tasks the user
  never mentioned.
