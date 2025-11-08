# Type Key Taxonomy Architecture

**Last Updated**: November 8, 2025
**Status**: Architecture Guide ✅
**Purpose**: Naming conventions and taxonomy patterns for ontology entities

## 📋 Quick Reference

| Entity                | Has Type Key? | Format                               | Example                                               |
| --------------------- | ------------- | ------------------------------------ | ----------------------------------------------------- |
| **onto_projects**     | ✅ Yes        | `{domain}.{deliverable}[.{variant}]` | `writer.book`, `coach.client.executive`               |
| **onto_outputs**      | ✅ Yes        | `deliverable.{type}[.{variant}]`     | `deliverable.chapter`, `deliverable.research_doc.icp` |
| **onto_plans**        | ✅ Yes        | `plan.{type}[.{context}]`            | `plan.content_calendar`, `plan.onboarding.client`     |
| **onto_documents**    | ✅ Yes        | `document.{type}`                    | `document.research`, `document.specification`         |
| **onto_goals**        | ✅ Yes        | `goal.{type}`                        | `goal.outcome`, `goal.learning`, `goal.metric`        |
| **onto_tasks**        | ⚠️ Optional   | `task.{type}`                        | `task.deep_work`, `task.review`                       |
| **onto_risks**        | ⚠️ Optional   | `risk.{type}`                        | `risk.technical`, `risk.market`                       |
| **onto_metrics**      | ❌ No         | Inherited from project               | N/A                                                   |
| **onto_requirements** | ❌ No         | Inherited from project               | N/A                                                   |
| **onto_milestones**   | ❌ No         | Inherited from project               | N/A                                                   |
| **onto_decisions**    | ❌ No         | Inherited from project               | N/A                                                   |

---

## 🎯 Core Principle: Entity Autonomy

The key question for determining if an entity needs its own type_key:

> **Does this entity have autonomous meaning, or is it meaningful only in relation to its parent?**

### Decision Framework

✅ **Give an entity its own type_key IF:**

1. You'd want to instantiate it via a template independent of a project
2. You'd want to query "show me all {type} across my projects"
3. Different types have significantly different schema or FSM
4. It represents a meaningful, discoverable unit of work

❌ **Don't give an entity its own type_key if:**

1. It only exists within project context
2. Its meaning is entirely derived from its parent
3. You'd never search/filter/template it independently
4. It's purely relational (linking two things)

---

## 📊 Entity Classification

### 1. Autonomous Entities (Own Type Keys)

These entities have independent lifecycles, can be discovered independently, and have their own templates.

#### onto_projects

- **Format**: `{domain}.{deliverable}[.{variant}]`
- **Examples**:
    - `writer.book` - Writer creating a book
    - `coach.client.executive` - Coach working with executive client
    - `developer.app.mobile` - Developer building mobile app
- **Why**: Top-level entities with independent meaning

#### onto_outputs (Deliverables)

- **Format**: `deliverable.{type}[.{variant}]`
- **Examples**:
    - `deliverable.chapter`
    - `deliverable.research_doc.icp`
    - `deliverable.mockup`
    - `deliverable.code.feature`
- **Why**: Different output types have completely different schemas and lifecycles

#### onto_plans

- **Format**: `plan.{type}[.{context}]`
- **Examples**:
    - `plan.content_calendar`
    - `plan.onboarding.client`
    - `plan.roadmap.product`
    - `plan.sprint`
    - `plan.campaign`
- **Why**: Plans have their own logic, FSM, and can be templated across projects

#### onto_documents

- **Format**: `document.{type}`
- **Examples**:
    - `document.context` - Project background
    - `document.research`
    - `document.meeting_minutes`
    - `document.specification`
    - `document.requirements`
- **Why**: Documents have different purposes and schemas, can be versioned independently

#### onto_goals

- **Format**: `goal.{type}`
- **Examples**:
    - `goal.outcome` - Specific deliverable goal
    - `goal.learning` - Skill/knowledge acquisition
    - `goal.behavior` - Habit/behavioral change
    - `goal.metric` - Measured result
    - `goal.milestone` - Temporal checkpoint
- **Why**: Different goal types have different measurement strategies and templates

### 2. Hybrid Entities (Optional Type Keys)

These entities can either inherit from their parent or have their own type for specific cases.

#### onto_tasks

- **Format**: `task.{type}` (optional)
- **Examples**:
    - `task.deep_work` - Focused execution
    - `task.review` - Quality pass
    - `task.meeting` - Sync/collaboration
    - `task.research` - Investigation
- **Implementation**:
    ```typescript
    {
      project_id: "writer.book:uuid",     // Always inherits project context
      type_key: "task.deep_work",         // Optional - can be null
      title: "Write Chapter 3",
      facet_scale: "large"
    }
    ```
- **Why**: Tasks can be simple work items or have specific behavioral patterns

#### onto_risks

- **Format**: `risk.{type}` (optional)
- **Examples**:
    - `risk.technical`
    - `risk.market`
    - `risk.financial`
    - `risk.resource`
- **Why**: Different risk types may have different mitigation strategies

### 3. Project-Derived Entities (No Type Keys)

These entities inherit meaning from their parent project and don't need independent taxonomy.

#### onto_metrics

- **Why not**: Metrics are project-specific measurements
- **Pattern**: The project type determines what metrics matter

#### onto_requirements

- **Why not**: Requirements are always "requirements for THIS project"
- **Pattern**: A writer's book doesn't have "must integrate with Stripe" requirements

#### onto_milestones

- **Why not**: Temporal markers within a project, no schema variation
- **Pattern**: Just `{title, due_at, props}` within project context

#### onto_decisions

- **Why not**: Project-specific choices, standard schema
- **Pattern**: `{title, rationale, decision_at}` within project

### 4. Relational/Infrastructure Entities (No Type Keys)

Pure linking constructs with no independent lifecycle:

- `onto_edges` - Relationships between entities
- `onto_assignments` - Role assignments
- `onto_permissions` - Access control

### 5. Reference/Taxonomy Entities (Are The Taxonomy)

System-wide reference data:

- `onto_templates` - The blueprints themselves
- `onto_facet_definitions` - The 3 facets definition
- `onto_facet_values` - Allowed facet values
- `onto_tools` - Available tools catalog

---

## 🏗️ Type Key vs Facets

### Understanding the Relationship

**Type Key** and **Facets** answer different questions:

- **type_key** → "What is this entity fundamentally?"
- **facets** → "What are the instance-specific dimensions?"

### Example

```typescript
{
  type_key: "writer.book",        // WHAT KIND of project
  facets: {
    context: "client",             // WHO it's for (instance-specific)
    scale: "large",                // HOW BIG (instance-specific)
    stage: "execution"             // WHERE in lifecycle (instance-specific)
  }
}
```

The type_key defines the category and suggests default behaviors, while facets provide orthogonal dimensions that vary per instance.

---

## 📐 Naming Conventions

### Consistent Format Pattern

All autonomous entities follow: `{category}.{type}[.{variant}]`

- **Projects**: `{domain}.{deliverable}[.{variant}]`
    - `writer.book`
    - `coach.client.executive`

- **Plans**: `plan.{type}[.{context}]`
    - `plan.content_calendar`
    - `plan.onboarding.client`

- **Outputs**: `deliverable.{type}[.{variant}]`
    - `deliverable.chapter`
    - `deliverable.research_doc.icp`

- **Documents**: `document.{type}`
    - `document.research`
    - `document.specification`

- **Goals**: `goal.{type}`
    - `goal.outcome`
    - `goal.learning`

### Multi-Word Convention

Use underscores for multi-word components:

- ✅ `personal.morning_routine`
- ✅ `deliverable.research_doc`
- ❌ `personal.morningRoutine`
- ❌ `personal.morning-routine`

---

## 💡 Implementation Guidelines

### 1. Don't Over-Engineer

Only create type_key taxonomy where you actually need to:

- Template independent instances
- Discover/filter across projects
- Have schema/FSM variation

### 2. Template-First Thinking

For each table, ask: "Would I ever create a template for this?"

- YES → needs type_key
- NO → doesn't need type_key

### 3. Optional Type Keys for Flexibility

For hybrid entities like tasks:

```typescript
interface Task {
	type_key?: string; // Optional - null means simple task
	project_id: string; // Always has project context
	// If type_key is null, task is just part of project workflow
	// If type_key is set, task can be templated/discovered independently
}
```

### 4. Context Inheritance

Project context flows down to child entities:

- **Projects say**: "We're doing a writer.book project"
- **Plans say**: "Within that, we're using a content_calendar plan"
- **Tasks say**: "Some tasks are deep_work" (optional typing)
- **Outputs say**: "We're producing deliverable.chapter outputs"

Each level adds specificity while maintaining parent context.

---

## 🔍 Practical Examples

### Query Patterns

With proper type_key taxonomy, you can:

```sql
-- Find all research document outputs across all projects
SELECT * FROM onto_outputs
WHERE type_key LIKE 'deliverable.research_doc%';

-- Find all content calendar plans
SELECT * FROM onto_plans
WHERE type_key = 'plan.content_calendar';

-- Find all deep work tasks (if typed)
SELECT * FROM onto_tasks
WHERE type_key = 'task.deep_work';

-- Find all metrics for writer projects (no type_key needed)
SELECT m.* FROM onto_metrics m
JOIN onto_projects p ON m.project_id = p.id
WHERE p.type_key LIKE 'writer.%';
```

### Template Discovery

```typescript
// Autonomous entities can have templates
const planTemplates = await getTemplates('plan.*');
const outputTemplates = await getTemplates('deliverable.*');

// Project-derived entities use project templates
const projectTemplate = await getTemplate('writer.book');
// This template suggests metrics, requirements, milestones
```

---

## 📚 Related Documentation

- [Data Models](./DATA_MODELS.md) - Complete database schema
- [README](./README.md) - Main ontology documentation
- [Implementation Roadmap](./ontology-implementation-roadmap.md) - Development plan
- [Template Taxonomy](./TEMPLATE_TAXONOMY.md) - Deliverables catalog

---

## ❓ Quick Decision Guide

When adding a new entity type, ask:

1. **Can users search for "all X of type Y"?**
    - YES → Use type_key
    - NO → Inherit from parent

2. **Do different types have different schemas?**
    - YES → Use type_key
    - NO → Consider inheritance

3. **Would you create templates for this entity?**
    - YES → Use type_key
    - NO → Probably inherit

4. **Is it meaningful outside project context?**
    - YES → Use type_key
    - NO → Inherit from parent

---

**Key Insight**: The elegance of this system is that it solves the ontology problem at the project level, then lets each sub-entity choose whether it needs independent structure. Don't create taxonomy when you don't need it - only introduce complexity where the problem actually exists.
