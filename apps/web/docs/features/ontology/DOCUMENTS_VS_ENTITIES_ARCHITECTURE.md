<!-- apps/web/docs/features/ontology/DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md -->

# Documents vs Entities: Architectural Tension

**Status:** Exploratory Draft
**Date:** 2026-01-29

---

## The Problem

We have two organizational systems that need to coexist:

### System 1: Document Tree (Hierarchical)

```
Product/
├── Architecture/
│   ├── System Design.md
│   └── ADRs/
└── Features/
    └── Brain Dump.md
```

- **Structure:** Parent-child (tree)
- **Purpose:** Knowledge organization, reference material, source of truth
- **Growth:** Organic, as information accumulates
- **Navigation:** Path-based (like filesystem)

### System 2: Ontology Entities (Graph)

```
Goal: "Launch MVP"
  ├── has_milestone → "Beta Release"
  ├── has_plan → "Development Sprint 1"
  │   └── has_task → "Build auth system"
  └── has_risk → "Technical debt"
```

- **Structure:** Graph (edges connect anything to anything)
- **Purpose:** Action tracking, progress, accountability
- **Growth:** Created from brain dumps, planning sessions
- **Navigation:** Relationship traversal

### The Tension

These systems serve different purposes but need to reference each other:

| Question                                          | Unclear Answer                                      |
| ------------------------------------------------- | --------------------------------------------------- |
| Does a Goal need a "Goal Document"?               | Maybe? Where would it live?                         |
| If a Task references a document, is that an edge? | Feels heavy                                         |
| Can a document "contain" a task?                  | That's what edges do, but edges feel wrong for docs |
| Where does strategic context live?                | Documents? Goal descriptions? Both?                 |

---

## Two Mental Models

### Model A: Documents Are Static, Entities Are Dynamic

```
DOCUMENTS (Reference)          ENTITIES (Action)
─────────────────────         ─────────────────
Product Vision.md       ←───  Goal: "Launch MVP"
                              (references this doc)
Architecture.md         ←───  Task: "Design API"
                              (informed by this doc)
```

**Documents:** Write once, update occasionally. The "why" and "how we think about things."
**Entities:** Created, progressed, completed. The "what we're doing."

**Relationship:** Entities can _reference_ documents, but documents don't _contain_ entities.

### Model B: Documents Can Contain Entity Summaries

```
Product/
├── Goals/
│   └── Launch MVP.md           ← Auto-generated from Goal entity
│       - Status: Active
│       - Milestones: [list]
│       - Context: [prose]
├── Architecture/
│   └── System Design.md        ← Pure knowledge document
```

**Documents:** Some are pure knowledge, some are "entity views" rendered as documents.
**Entities:** Live in the ontology graph, but can be "projected" into the document tree.

---

## Core Question: What Is a Document For?

### Documents excel at:

- Long-form context and rationale
- Reference material that doesn't change often
- Information that has a natural "home" in a hierarchy
- Content that AI agents need to read/update as prose

### Entities excel at:

- Things with state (draft → active → complete)
- Things with deadlines (due dates, target dates)
- Things that decompose (goal → milestones → tasks)
- Things you track progress on

### The gray area:

- **Goal context:** Is this a document or a field on the goal entity?
- **Plan details:** Is the plan description a document, or embedded?
- **Meeting notes:** Document that spawns tasks, or task that has notes?

---

## Proposal: Clear Separation with Lightweight References

### Principle 1: Documents Don't Have Edges (Except Parent-Child)

The document tree uses **only** parent-child relationships:

```
Company/
└── Strategy/
    └── Annual Plan.md    ← parent is "Strategy" folder
```

Documents reference each other via **inline links** (document scheme), not edges:

```markdown
See also: [System Design](document:uuid-of-system-design)
```

### Principle 2: Entities Can Reference Documents

Entities have an optional `context_document_id` field:

```typescript
Goal {
  id: "..."
  name: "Launch MVP"
  context_document_id: "uuid-of-product-vision-doc"  // optional
}
```

The goal can link to a document that provides context, but the document doesn't "know" about the goal.

**Note:** `context_document_id` is a proposed field; it requires a schema change if/when we adopt it.

### Principle 3: Entity Details Live in Entities, Not Documents

Don't create "Goal Documents" that duplicate entity data:

```
❌ Goals/
   └── Launch MVP.md   ← This duplicates the Goal entity
```

Instead, the Goal entity has rich fields:

```typescript
Goal {
  name: "Launch MVP"
  description: "Full prose description..."
  rationale: "Why we're doing this..."
  success_criteria: "How we'll know we succeeded..."
}
```

### Principle 4: Documents Are For Durable Knowledge

Documents contain information that:

- Outlives any single goal/task/plan
- Would be useful even if all entities were deleted
- Has a natural "home" in the organizational hierarchy

Examples:

- ✅ "Product Vision" - Durable, hierarchical home in Product/
- ✅ "Brand Guidelines" - Durable, hierarchical home in Growth/Brand/
- ✅ "API Design Principles" - Durable, hierarchical home in Product/Architecture/
- ❌ "Q1 Sprint Plan" - Ephemeral, better as a Plan entity
- ❌ "Launch MVP Goal" - Ephemeral, better as a Goal entity

---

## Growth Triggers

### When to Create a Document

| Trigger                            | Example                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| **New knowledge domain**           | "We need to document our pricing strategy" → Create `Sales/Pricing Strategy.md`                |
| **Reference material needed**      | "Engineers keep asking about our API patterns" → Create `Product/Architecture/API Patterns.md` |
| **AI agent needs context**         | "The agent needs to understand our brand voice" → Create `Growth/Brand/Voice & Tone.md`        |
| **Information has a natural home** | "This competitive analysis belongs somewhere" → Create `Executive/Competitive Analysis.md`     |

### When to Create an Entity

| Trigger                     | Example                                       |
| --------------------------- | --------------------------------------------- |
| **Something to accomplish** | "We need to launch MVP" → Create Goal         |
| **Something to track**      | "Build auth system by Friday" → Create Task   |
| **Decomposition needed**    | "This goal has phases" → Create Milestones    |
| **Risk identified**         | "We might not hit the deadline" → Create Risk |

### When to Link Entity → Document

| Trigger                   | Example                                                                 |
| ------------------------- | ----------------------------------------------------------------------- |
| **Entity needs context**  | Goal "Rebrand" references `Growth/Brand/Brand Identity.md`              |
| **Task informed by doc**  | Task "Update API" references `Product/Architecture/API Design.md`       |
| **Plan follows strategy** | Plan "Q1 Marketing" references `Growth/Marketing/Marketing Strategy.md` |

---

## What About "Entity Documents"?

### Option A: No Entity Documents (Recommended)

Entities have rich fields for their content. No separate documents.

**Pros:**

- No duplication
- Clear separation
- Simpler mental model

**Cons:**

- Entity descriptions might get long
- Harder to have "chapters" within an entity

### Option B: Optional Deep-Dive Documents

For complex entities, allow an optional linked document:

```typescript
Goal {
  name: "Launch MVP"
  description: "Brief summary..."
  detail_document_id: "uuid"  // Optional: links to a deep-dive doc
}
```

The deep-dive document lives... where? Options:

1. **Orphaned** - Not in the tree, accessed only via entity
2. **In a special folder** - `_Entity Details/Goals/Launch MVP.md`
3. **User chooses location** - User decides where it fits

**Recommendation:** Option 1 (Orphaned). If you need a full document for an entity, it's linked but doesn't clutter the knowledge tree.

### Option C: Render Entities as Documents (Not Recommended)

Auto-generate documents from entities:

```
Goals/
└── Launch MVP.md  ← Generated from Goal entity
```

**Problems:**

- Sync issues (edit the doc or the entity?)
- Clutters document tree with ephemeral items
- Confuses "knowledge" with "action items"

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    DOCUMENT TREE                            │
│  (Hierarchical, durable knowledge)                         │
│                                                             │
│  Company/                                                   │
│  ├── Mission.md                                            │
│  └── Strategy.md  ←─────────────────────┐                  │
│                                          │ references       │
│  Product/                                │                  │
│  ├── Vision.md  ←───────────────────────┼─┐                │
│  └── Architecture/                       │ │                │
│      └── System Design.md  ←────────────┼─┼─┐              │
│                                          │ │ │              │
└─────────────────────────────────────────┼─┼─┼──────────────┘
                                          │ │ │
┌─────────────────────────────────────────┼─┼─┼──────────────┐
│                 ENTITY GRAPH             │ │ │              │
│  (Action items, progress tracking)       │ │ │              │
│                                          │ │ │              │
│  Goal: "Launch MVP" ─────────────────────┘ │ │              │
│    │   context_doc ────────────────────────┘ │              │
│    │                                          │              │
│    ├── has_milestone → "Beta Release"         │              │
│    │                                          │              │
│    └── has_plan → "Sprint 1"                  │              │
│          │                                    │              │
│          └── has_task → "Build API" ──────────┘              │
│                context_doc                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Key points:**

- Document tree is self-contained (parent-child only)
- Entities can reference documents (one-way)
- No edges between documents
- No auto-generated entity documents

---

## Open Questions

1. **Should document references be displayed on documents?**
    - "This document is referenced by: Goal 'Launch MVP', Task 'Build API'"
    - Pro: Helps understand document importance
    - Con: Creates visual coupling

2. **Can entities reference multiple documents?**
    - Single `context_document_id` vs array of references
    - Or use the existing edge system for entity→document links?

3. **What about meeting notes that spawn tasks?**
    - Meeting notes = Document (durable record of what was discussed)
    - Tasks = Entities (action items)
    - Link: Tasks could reference the meeting doc as their "source"

4. **How do AI agents know when to create docs vs entities?**
    - Need clear heuristics
    - "This is reference material" → Document
    - "This needs to get done" → Entity

---

## Summary

| Aspect              | Documents                 | Entities                            |
| ------------------- | ------------------------- | ----------------------------------- |
| **Structure**       | Tree (parent-child)       | Graph (edges)                       |
| **Purpose**         | Knowledge, reference      | Action, progress                    |
| **Lifespan**        | Durable                   | Ephemeral                           |
| **Growth**          | As knowledge accumulates  | As work is identified               |
| **Relationships**   | Parent-child + wiki links | Edges (has_task, etc.)              |
| **Cross-reference** | Entities → Documents      | Documents don't know about entities |

**The rule:** Documents are the library. Entities are the to-do list. The to-do list can reference the library, but the library doesn't track to-dos.

---

## Related Documents

- [HIERARCHICAL_DOCUMENT_TREE_SPEC.md](./HIERARCHICAL_DOCUMENT_TREE_SPEC.md) - Full specification for document hierarchy
- [HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md](./HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md) - Decisions on implementation details
- [HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md](./HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md) - Implementation tracking
- [HIERARCHICAL_DOCUMENTS_HANDOFF.md](./HIERARCHICAL_DOCUMENTS_HANDOFF.md) - Agent handoff for continuing work
- [DATA_MODELS.md](./DATA_MODELS.md) - Database schema for all entities
