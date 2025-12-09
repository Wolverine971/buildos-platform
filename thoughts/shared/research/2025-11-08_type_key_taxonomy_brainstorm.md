---
date: 2025-11-08T00:00:00Z
researcher: Claude
repository: buildos-platform
topic: Type Key Naming Convention for Ontology Tables Beyond onto_projects
tags: [research, ontology, architecture, type-key, taxonomy, database-design]
status: brainstorm
path: thoughts/shared/research/2025-11-08_type_key_taxonomy_brainstorm.md
---

# Deep Architectural Thinking: Type Key Taxonomy for Ontology Tables

## The Core Question You're Asking

> "I have a clear naming convention for onto_projects: `{domain}.{deliverable}.{variant}`. Now I'm building onto_tasks, onto_plans, onto_outputs, and other tables. Do I need a separate taxonomy for each? At what point does the project define meaning, and at what point do sub-entities need their own independent taxonomy?"

This is an **architectural crossroads**. The answer determines whether your ontology is:
- **Elegant & maintainable** (one clear principle applied consistently)
- **Over-engineered** (every table has its own taxonomy when it shouldn't)
- **Under-specified** (some tables lack necessary type distinction)

---

## The Current State: What Works for onto_projects

### Why onto_projects Type Key Works

Your `{domain}.{deliverable}.{variant}` format is effective because:

1. **Semantic Clarity**: `writer.book` immediately tells you what kind of work this is
2. **Perspective-Based**: Uses the actor's view (I'm a writer creating a book)
3. **Independent Meaning**: Projects exist as top-level entities that can be discovered, filtered, and reasoned about independently
4. **Lifecycles**: Projects have their own FSM, their own phases, their own completion criteria
5. **Discovery**: You want to list "all my writer.book projects" or "all founder.startup projects"

### How Facets Complement type_key

Your 3-facet system (`context`, `scale`, `stage`) is orthogonal to type_key:

- `type_key = "writer.book"` (WHAT KIND of project)
- `facets` = (WHO it's for, HOW BIG, WHERE in lifecycle)

These answer different questions:
- `type_key` → "What is this project fundamentally?"
- `facets` → "What are the instance-specific dimensions of THIS project?"

---

## The Critical Insight: Entity Autonomy

The **key question** isn't "should every table have a type_key?" but rather:

> **Does this entity have autonomous meaning, or is it meaningful only in relation to its parent?**

### Four Categories of Entities

#### 1. **Autonomous Entities** (Need Their Own Taxonomy)

These are:
- **Independent units of work** with their own lifecycle
- **Discoverable** independent of their parent
- **Meaningful** even outside project context
- **Have their own FSM, schema, version history**

**Current examples in your schema:**
- `onto_projects` ✅ Already has type_key
- `onto_outputs` ✅ Has type_key (`deliverable.chapter`, `deliverable.research_doc.icp`)
- `onto_documents` ✅ Has type_key
- `onto_plans` ✅ Has type_key (`content_calendar`, `client_onboarding`)

**Question for you:**
- Can you list "all my research_doc.icp outputs across all projects"? YES → needs type_key
- Can you create an output template that applies across projects? YES → needs type_key
- Does each output type have different schema/FSM? YES → needs type_key

#### 2. **Dependent Leaf Entities** (Inherit from Parent)

These are:
- **Only meaningful in project context**
- **Not independently discoverable**
- **Inherit type from parent's domain**
- **May have local role classification**

**Current examples:**
- `onto_tasks` - Are tasks meaningful without knowing "writer.book" project? Somewhat, but...
- `onto_decisions` - Are decisions meaningful standalone? Maybe in a "decisions for this project"
- `onto_sources` - Are sources meaningful standalone? Maybe as "references for this project"

**The key test:**
> "Would I ever want to browse, filter, or instantiate this entity type independently of its project?"

If YES → it needs its own type_key
If NO → it can inherit meaning from its project

#### 3. **Relational/Bridge Entities** (Just Relationships)

These are:
- **Pure linking constructs**
- **No independent lifecycle**
- **No independent schema**

**Examples:**
- `onto_edges` (relationships between entities)
- `onto_assignments` (who is assigned to what)
- `onto_permissions` (access control)

**These don't need type_key at all** — they're infrastructure.

#### 4. **Metadata Entities** (Configuration/Taxonomy)

These are:
- **System-wide reference data**
- **Shared across all projects**
- **Not per-project instances**

**Examples:**
- `onto_templates` (the blueprints themselves)
- `onto_facet_definitions` (the 3 facets)
- `onto_facet_values` (allowed values per facet)
- `onto_tools` (available tools)

**These don't need instance-specific type_keys** — they're the taxonomy itself.

---

## The Project-Determines vs Entity-Needs Matrix

Here's the decision framework:

| Entity | Autonomous? | Independent Discovery? | Own FSM/Schema? | Verdict | Type Key Format |
|--------|-------------|------------------------|-----------------|---------|-----------------|
| **onto_projects** | ✅ Yes | ✅ Yes | ✅ Yes | Own taxonomy | `{domain}.{deliverable}.{variant}` |
| **onto_outputs** | ✅ Yes | ✅ Yes | ✅ Yes | Own taxonomy | `deliverable.{type}.{variant}?` |
| **onto_plans** | ✅ Yes | ✅ Yes | ✅ Yes | Own taxonomy | `plan.{type}` |
| **onto_documents** | ✅ Yes | ✅ Yes | ⚠️ Partial | Own taxonomy | `document.{type}` |
| **onto_tasks** | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | **Hybrid** | `{project_type_key}:task:{role}?` |
| **onto_goals** | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | **Hybrid** | (Needs thinking) |
| **onto_metrics** | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | **Hybrid** | (Needs thinking) |
| **onto_requirements** | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | **Hybrid** | (Needs thinking) |
| **onto_milestones** | ⚠️ Partial | ⚠️ Partial | ❌ No | **Project-derived** | (No separate type_key) |
| **onto_risks** | ⚠️ Partial | ⚠️ Partial | ⚠️ Partial | **Hybrid** | (Needs thinking) |
| **onto_decisions** | ⚠️ Partial | ⚠️ Partial | ❌ No | **Project-derived** | (No separate type_key) |
| **onto_edges** | ❌ No | ❌ No | ❌ No | Relational only | (Not applicable) |
| **onto_assignments** | ❌ No | ❌ No | ❌ No | Relational only | (Not applicable) |
| **onto_templates** | ✅ Yes | ✅ Yes | ✅ Yes | Reference data | (Type is the taxonomy) |

---

## Detailed Analysis: Which Tables Need Their Own Taxonomy?

### 1. **onto_outputs** - YES, Own Taxonomy

**Why:**
- Each output type has completely different schema (chapter vs research_doc vs mockup vs code)
- Each has different FSM (document draft→review→approved vs code release→deployed)
- Outputs are independently versioned and stored
- You want to ask "show me all research_doc.icp outputs"
- Different creation tools (Figma vs Google Docs vs GitHub)

**Type Key Format:**
```
deliverable.{primitive_type}[.{variant}]

Examples:
- deliverable.chapter
- deliverable.research_doc.icp
- deliverable.mockup
- deliverable.code.feature
- deliverable.workout_plan
```

**Already Implemented:** ✅ Yes (you have this)

---

### 2. **onto_plans** - YES, Own Taxonomy

**Why:**
- Plans group tasks with their own logic and FSM
- A "content_calendar" plan has different schema than "client_onboarding"
- Each plan type suggests different task types
- Templates can exist for plan types independent of specific projects
- You want to ask "show me all content_calendar plans"

**Type Key Format:**
```
plan.{type}[.{context}]

Examples:
- plan.content_calendar
- plan.onboarding (could be .client_onboarding or .employee_onboarding)
- plan.roadmap (could be .product_roadmap or .development_roadmap)
- plan.sprint
- plan.campaign
- plan.curriculum
```

**Decision:** Each domain might suggest default plan types, but plans should have their own taxonomy

---

### 3. **onto_documents** - YES, Own Taxonomy

**Why:**
- Documents have different purposes (context notes vs research vs template)
- Schema varies (research docs have sources, meeting notes have attendees)
- Can be discovered/searched independently
- Can be versioned and embedded separately from projects

**Type Key Format:**
```
document.{type}

Examples:
- document.context (project background)
- document.research
- document.notes
- document.meeting_minutes
- document.specification
- document.requirements
```

**Already Implemented:** ✅ Yes (you have this)

---

### 4. **onto_tasks** - HYBRID (Project-Derived + Local Role)

**This is tricky.** Consider two approaches:

#### Approach A: Full Taxonomy (Like Outputs)
```
task.{type}[.{role}]

Examples:
- task.milestone (major checkpoint)
- task.deep_work (focused execution)
- task.review (quality pass)
- task.meeting (sync/collaboration)
- task.research (investigation)
```

**Pros:**
- Clear semantics per task
- Can have task-specific FSM (review tasks flow differently than work tasks)
- Can ask "show me all my deep_work tasks"
- Can have task templates

**Cons:**
- Every task needs explicit typing
- More schema complexity
- May be over-engineering for what is often just "work items"

#### Approach B: Project-Derived (Simpler)
```
Task inherits type from its project, adds only a local "role" if needed:

{
  project_id: "writer.book:uuid",
  title: "Write Chapter 3",
  role: "writing" | "review" | "planning" | "research",
  facet_scale: "large" | "medium" | "small"
}
```

**Pros:**
- Simpler mental model
- Fewer schemas to maintain
- Tasks are clearly "part of writing a book"
- Can still ask "show me all review role tasks in my projects"

**Cons:**
- Can't template "all deep_work tasks" across projects
- Less semantic clarity
- Role is limited to a few categories

#### Approach C: Hybrid Best of Both (Recommended?)
```
Task has BOTH project context AND local classification:

{
  project_id: "writer.book:uuid",        // Inherits: this is book-writing work
  type_key: "task.deep_work",            // OR null if not typed
  title: "Write Chapter 3",
  facet_scale: "large"
}
```

**Allows:**
- Optional typing for tasks that need it
- "All deep_work tasks across projects" queries
- But simple tasks can just be untyped (role implicit from project)
- Tasks inherit domain context from project automatically

**Decision:** I'd recommend **Approach C: Hybrid** — optional type_key for tasks, inherit from project when not specified.

---

### 5. **onto_goals** - HYBRID or Project-Derived?

**Current state:** You have task and goal templates (`goal.base`, `goal.outcome`, `goal.learning`, `goal.behavior`, `goal.metric`)

**Question:** Are goals independently discoverable across projects?
- Can you ask "show me all my learning goals"?
- Do different goal types have different schema/FSM?
- Can you create a goal template that applies across projects?

**If YES to any:** Use `goal.{type}`
**If NO:** Keep them project-derived

**Type Key Format (if adopting):**
```
goal.{type}

Examples:
- goal.outcome (specific deliverable goal)
- goal.learning (skill/knowledge acquisition)
- goal.behavior (habit/behavioral change)
- goal.metric (measured result)
- goal.milestone (temporal checkpoint)
```

**Decision:** You already have this in templates, so **YES - Use own taxonomy**

---

### 6. **onto_metrics** - HYBRID (Probably Project-Derived)

**Current state:** You have `metrics` with `type_key` nullable

**Question:** Are metrics independently meaningful?
- Do you ask "show me all my NPS metrics"?
- Or are they always "metrics for THIS project"?

**Most likely:** Metrics are project-specific measurements. The project type determines what metrics matter (writer doesn't measure conversion, founder does).

**Type Key Format (if adopting):**
```
// Option 1: Generic metrics system
metric.{measurement_type}
- metric.counter (count something)
- metric.percentage (track a rate)
- metric.ratio (compare two things)
- metric.timeline (track over time)

// Option 2: Domain-specific metrics
// (Probably too much)
```

**Decision:** Metrics are probably **project-derived**. No separate taxonomy needed. Projects just include metrics in their context.

---

### 7. **onto_requirements** - HYBRID (Could be Project-Derived)

**Current state:** You have type_key on requirements

**Question:** Are requirements independently meaningful or always "requirements for THIS project"?

**Most likely:** Requirements are always project-specific. A writer's book doesn't have "must integrate with Stripe" (that's a developer.app requirement).

**Decision:** Requirements are probably **project-derived**. They inherit meaning from their project type. No separate taxonomy needed.

---

### 8. **onto_milestones** - Project-Derived (No Type Key)

**Why:**
- Milestones are temporal markers within a project
- They don't have schema variation
- They don't have independent FSM
- They're discovered "as part of project" not independently

**Decision:** **No separate type_key.** Just `{title, due_at, props}` within project context.

---

### 9. **onto_risks** - HYBRID (Maybe Optional Type Key)

**Current state:** You have type_key on risks

**Question:** Do you have different risk types with different schema?
- risk.technical (requires different fields than risk.financial)
- risk.market (requires different fields)
- risk.resource (requires different fields)

**If different schema per type:** Use `risk.{type}`
**If same schema for all:** No need for type_key

**Type Key Format (if adopting):**
```
risk.{type}

Examples:
- risk.technical
- risk.market
- risk.financial
- risk.resource
- risk.timeline
- risk.dependency
```

**Decision:** **Probably YES - Optional type_key** if you have different mitigation strategies per risk type.

---

### 10. **onto_decisions** - Project-Derived (No Type Key)

**Why:**
- Decisions are project-specific choices
- Doesn't need independent discovery ("show me all architecture decisions")
- Schema is standard (decision, rationale, date)
- Not independently templated

**Decision:** **No separate type_key.** Just `{title, rationale, decision_at}` within project.

---

## The Over-Arching Principle

**Simple rule of thumb:**

```
✅ Give an entity its own type_key IF:
   1. You'd want to instantiate it via a template independent of a project
   2. You'd want to ask "show me all {type} across my projects"
   3. Different types have significantly different schema or FSM
   4. It represents a meaningful, discoverable unit of work

❌ Don't give an entity its own type_key if:
   1. It only exists within project context
   2. Its meaning is entirely derived from its parent
   3. You'd never search/filter/template it independently
   4. It's purely relational (linking two things)
```

---

## The Emerging Ontology Structure

Based on this analysis, here's what I'd recommend:

```
AUTONOMOUS ENTITIES (Own Type Keys):
├── onto_projects
│   ├── type_key: {domain}.{deliverable}[.{variant}]
│   ├── facets: context, scale, stage
│   └── examples: writer.book, coach.client.executive
│
├── onto_plans
│   ├── type_key: plan.{type}[.{variant}]
│   └── examples: plan.content_calendar, plan.onboarding
│
├── onto_outputs (deliverables)
│   ├── type_key: deliverable.{type}[.{variant}]
│   └── examples: deliverable.chapter, deliverable.research_doc.icp
│
├── onto_documents
│   ├── type_key: document.{type}
│   └── examples: document.context, document.research
│
├── onto_goals
│   ├── type_key: goal.{type}
│   └── examples: goal.outcome, goal.learning
│
└── onto_tasks (HYBRID OPTIONAL)
    ├── type_key: task.{type} (optional)
    └── examples: task.deep_work, task.review

PROJECT-DERIVED ENTITIES (Inherit from Project):
├── onto_metrics
│   ├── type_key: inherited from project or none
│   └── meaning: measurements specific to project context
│
├── onto_requirements
│   ├── type_key: inherited from project or none
│   └── meaning: needs specific to project type
│
├── onto_milestones
│   ├── No type_key
│   └── Just temporal markers
│
├── onto_decisions
│   ├── No type_key
│   └── Just choices made in project
│
└── onto_risks
    ├── type_key: risk.{type} (optional, if different schema)
    └── examples: risk.technical, risk.market

RELATIONAL ENTITIES (No Type Keys):
├── onto_edges (relationships)
├── onto_assignments (role assignments)
└── onto_permissions (access control)

REFERENCE/SYSTEM ENTITIES:
├── onto_templates (blueprints)
├── onto_facet_definitions (the 3 facets)
└── onto_facet_values (allowed facet values)
```

---

## Recommendations for Implementation

### 1. **Don't Over-Engineer**
Only create type_key taxonomy where you actually need to:
- Template independent instances
- Discover/filter across projects
- Have schema/FSM variation

### 2. **Template-First Thinking**
For each table, ask: "Would I ever create a template for this?"
- YES → needs type_key
- NO → doesn't need type_key

### 3. **Inheritance for Tasks** (Optional But Powerful)
If you implement task.{type}, make it **optional**:
```typescript
task: {
  type_key: "task.deep_work", // Optional, can be null
  project_id: "...",
  title: "...",
  // If type_key is null, task is just part of project workflow
  // If type_key is set, task can be templated/discovered independently
}
```

### 4. **Consistent Naming Pattern**
Keep format consistent across tables:
- **Autonomous entities**: `{category}.{type}[.{variant}]`
- Projects: `{domain}.{deliverable}[.{variant}]`
- Plans: `plan.{type}[.{variant}]`
- Outputs: `deliverable.{type}[.{variant}]`
- Documents: `document.{type}`
- Goals: `goal.{type}`
- Tasks: `task.{type}` (optional)

### 5. **Use Facets Consistently**
Only use the 3 facets where they make sense:
- **context**: "who is this for?" (applies to most)
- **scale**: "how big?" (applies to projects, plans, tasks)
- **stage**: "where in lifecycle?" (applies to projects, plans, outputs, documents)

---

## Key Insight: The Project Doesn't Determine Everything

Your intuition was partially right:

> "At what point does the project define what other tables do?"

**Answer:** The project defines the **domain context**, but sub-entities can have their own **type taxonomy** for things that are truly independent.

Think of it like this:
- **Projects say:** "We're doing a writer.book project"
- **Plans say:** "Within that, we're using a content_calendar plan type"
- **Tasks say:** "Some tasks are deep_work, some are review" (optional, can inherit)
- **Outputs say:** "We're producing a deliverable.chapter output"
- **Documents say:** "We're keeping deliverable.research documents"

**Each level adds specificity.**

---

## For Non-Autonomous Sub-Entities

For things like metrics, requirements, decisions, milestones:

The project context is usually sufficient. You don't need separate type_keys. Instead:
- Let the project's template suggest "typical metrics for this project type"
- Keep the schema simple and universal
- Store domain-specific structure in `props` if needed
- Make them discoverable by project type, not by their own type

---

## Questions for Your Own Thinking

As you implement, ask yourself for each table:

1. **Can I template this independently?** (separate from any specific project)
2. **Would I want to filter/search across projects by this type?**
3. **Do different "types" of this entity have significantly different schema or lifecycle?**
4. **Could two projects use the same template for this entity type?**

If YES to 2+ of these: **Give it a type_key**
If NO to all: **Keep it project-derived or relational**

---

## Summary: A Non-Dogmatic Framework

**You don't need a separate taxonomy for everything.**

The elegance of your current system (`{domain}.{deliverable}` + orthogonal facets) is that **it solves the ontology problem at the project level**, then **lets each sub-entity choose whether it needs independent structure**.

- **Projects**: Definitely type_key + facets
- **Plans, Outputs, Documents, Goals**: Probably type_key (they're independently meaningful)
- **Tasks**: Optional type_key (can be both - inherit from project, or type-specific)
- **Metrics, Requirements, Decisions, Milestones**: Probably not - keep simple, project-derived

The key is: **Don't create taxonomy when you don't need it. Only introduce complexity where the problem actually exists.**

