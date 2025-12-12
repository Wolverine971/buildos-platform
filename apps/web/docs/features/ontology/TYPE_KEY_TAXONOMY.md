<!-- apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md -->

# Type Key Taxonomy Architecture

**Last Updated**: December 10, 2025
**Status**: Architecture Guide
**Purpose**: Naming conventions, taxonomy patterns, and architectural decisions for ontology entities

> **See Also**: [NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md) for the complete naming reference with all templates listed.

## Quick Reference

| Entity                | Has Type Key? | Format                                      | Templates | Example                                                   |
| --------------------- | ------------- | ------------------------------------------- | --------- | --------------------------------------------------------- |
| **onto_projects**     | Yes           | `project.{realm}.{deliverable}[.{variant}]` | 13+       | `project.creative.book`, `project.technical.app.mobile`   |
| **onto_tasks**        | Yes           | `task.{work_mode}[.{specialization}]`       | 12        | `task.execute`, `task.coordinate.meeting`                 |
| **onto_plans**        | Yes           | `plan.{family}[.{variant}]`                 | 20+       | `plan.timebox.sprint`, `plan.campaign.marketing`          |
| **onto_goals**        | Yes           | `goal.{family}[.{variant}]`                 | 12+       | `goal.outcome.project`, `goal.metric.revenue`             |
| **onto_outputs**      | Yes           | `output.{family}[.{variant}]`               | 25+       | `output.written.chapter`, `output.media.slide_deck`       |
| **onto_documents**    | Yes           | `document.{family}[.{variant}]`             | 20+       | `document.context.project`, `document.knowledge.research` |
| **onto_risks**        | Yes           | `risk.{family}[.{variant}]`                 | 18+       | `risk.technical.security`, `risk.schedule.dependency`     |
| **onto_events**       | Yes           | `event.{family}[.{variant}]`                | 18+       | `event.work.focus_block`, `event.collab.meeting.standup`  |
| **onto_requirements** | Yes           | `requirement.{type}[.{category}]`           | 6         | `requirement.functional`, `requirement.constraint`        |
| **onto_metrics**      | No            | Inherited from project                      | -         | N/A                                                       |
| **onto_milestones**   | No            | Inherited from project                      | -         | N/A                                                       |
| **onto_decisions**    | No            | Inherited from project                      | -         | N/A                                                       |

---

## Core Principle: Entity Autonomy

The key question for determining if an entity needs its own type_key:

> **Does this entity have autonomous meaning, or is it meaningful only in relation to its parent?**

### Decision Framework

**Give an entity its own type_key IF:**

1. You'd want to instantiate it via a template independent of a project
2. You'd want to query "show me all {type} across my projects"
3. Different types have significantly different schema or FSM
4. It represents a meaningful, discoverable unit of work

**Don't give an entity its own type_key if:**

1. It only exists within project context
2. Its meaning is entirely derived from its parent
3. You'd never search/filter/template it independently
4. It's purely relational (linking two things)

---

## Core Pattern: Family-Based Taxonomy

All autonomous entities (except projects and tasks) follow a **family-based taxonomy**:

```
{data_type}.{family}[.{variant}]
```

- **data_type**: Entity scope prefix (`plan`, `goal`, `document`, `output`, `risk`, `event`)
- **family**: Meta-category for grouping and querying
- **variant**: Specific template within the family (optional)

### Abstract Base Templates

Abstract bases are **not instantiable** and serve as inheritance roots:

```
{data_type}.base            # Root abstract type for that data_type
{data_type}.{family}.base   # Abstract type for that family
```

---

## Entity Classification

### 1. Autonomous Entities (Own Type Keys)

These entities have independent lifecycles, can be discovered independently, and have their own templates.

#### onto_projects

- **Format**: `project.{realm}.{deliverable}[.{variant}]`
- **Key Insight**: Realm describes the _category of value/output_ the project creates, NOT the role of the person doing the work. Role is orthogonal and belongs to the user, not the project.

##### Project Realms (Domains)

| Realm         | Core Focus                   | Distinct Because                  | Example Deliverables                               |
| ------------- | ---------------------------- | --------------------------------- | -------------------------------------------------- |
| **creative**  | Original content, expression | Artifact is the expression itself | book, article, album, video, design, brand         |
| **technical** | Building functional systems  | Artifact is a working system      | app, api, feature, infrastructure                  |
| **business**  | Commercial growth & ventures | Success = revenue/market          | startup, product_launch, campaign, market_research |
| **service**   | Delivering value to clients  | Success = client outcome          | coaching_program, consulting_engagement, workshop  |
| **education** | Acquiring knowledge          | Success = learning/credential     | course, thesis, certification                      |
| **personal**  | Self/life improvement        | Success = personal change         | habit, routine, goal, wellness                     |

> **Note**: We intentionally limit to 6 core realms for high classification accuracy. Edge cases:
>
> - **Research** → Usually `business` (market research) or `education` (academic research) or a phase within another project
> - **Operations** → Usually `business` (company ops) or `service` (client ops)
> - **Design** → Usually `creative` (visual/brand) or `technical` (UX/product design)

##### Examples by Realm

**Creative**:

- `project.creative.book` - Writing a book
- `project.creative.article` - Writing an article or essay
- `project.creative.album` - Music album production
- `project.creative.video` - Video production
- `project.creative.screenplay` - Screenwriting project
- `project.creative.brand` - Brand/identity design
- `project.creative.design` - Visual design project

**Technical**:

- `project.technical.app` - Application development
- `project.technical.app.mobile` - Mobile app development
- `project.technical.app.web` - Web application
- `project.technical.api` - API development
- `project.technical.feature` - Feature implementation
- `project.technical.infrastructure` - Infrastructure/DevOps
- `project.technical.ux` - UX design (system-focused)

**Business**:

- `project.business.startup` - New venture/company
- `project.business.product_launch` - Launching a product
- `project.business.campaign` - Marketing/sales campaign
- `project.business.fundraise` - Fundraising round
- `project.business.market_research` - Market research/analysis
- `project.business.event` - Company event/conference
- `project.business.hiring` - Hiring initiative

**Service**:

- `project.service.coaching_program` - Coaching engagement
- `project.service.consulting_engagement` - Consulting project
- `project.service.workshop` - Workshop delivery
- `project.service.retainer` - Ongoing retainer work

**Education**:

- `project.education.course` - Taking/completing a course
- `project.education.thesis` - Thesis or dissertation
- `project.education.certification` - Getting certified
- `project.education.degree` - Degree program
- `project.education.research` - Academic research

**Personal**:

- `project.personal.habit` - Building a new habit
- `project.personal.routine` - Establishing a routine
- `project.personal.goal` - Personal goal achievement
- `project.personal.wellness` - Health/wellness initiative
- `project.personal.finance` - Personal finance project

##### Realm Classification Signals

When inferring realm from user input (brain dumps), use these signals:

| Realm         | Strong Vocabulary Signals                                                                                | Confidence  |
| ------------- | -------------------------------------------------------------------------------------------------------- | ----------- |
| **technical** | "build", "code", "app", "API", "feature", "deploy", "bug", "database"                                    | High        |
| **creative**  | "write", "book", "article", "publish", "draft", "story", "content", "design", "brand"                    | High        |
| **business**  | "launch", "startup", "revenue", "customers", "market", "pitch", "fundraise", "sales", "campaign", "hire" | High        |
| **service**   | "client", "engagement", "deliverable", "SOW", "consulting", "session", "workshop"                        | High        |
| **education** | "class", "assignment", "thesis", "degree", "learn", "exam", "professor", "course", "study"               | High        |
| **personal**  | "habit", "routine", "goal", "health", "morning", "productivity", "self", "wellness"                      | Medium-High |

##### Disambiguation Strategy

When classification is ambiguous, ask: **"What does success look like?"**

- "I shipped the feature / it's working" → **technical**
- "The client achieved their goal" → **service**
- "We hit revenue target / gained customers" → **business**
- "I learned the skill / passed the exam" → **education**
- "It's published / the content is out" → **creative**
- "I'm doing it consistently / I feel better" → **personal**

##### Why Realm ≠ Role

**Critical distinction**: The realm describes the _project_, not the _person_.

- A **developer** can have a `project.creative.book` (writing a technical book)
- A **writer** can have a `project.technical.app` (building a writing tool)
- A **coach** can have a `project.business.startup` (launching their practice)
- A **founder** can have a `project.education.course` (taking a leadership course)

Role belongs to the user and influences which templates are shown, but does not change what the project fundamentally is.

#### onto_tasks

- **Format**: `task.{work_mode}[.{specialization}]`
- **8 Base Work Modes**:
  | Work Mode | Type Key | Description |
  |-----------|----------|-------------|
  | Execute | `task.execute` | Action tasks - do the work (default) |
  | Create | `task.create` | Produce new artifacts |
  | Refine | `task.refine` | Improve existing work |
  | Research | `task.research` | Investigate and gather information |
  | Review | `task.review` | Evaluate and provide feedback |
  | Coordinate | `task.coordinate` | Sync with others |
  | Admin | `task.admin` | Administrative housekeeping |
  | Plan | `task.plan` | Strategic thinking and planning |

- **4 v1 Specializations**:
  | Specialization | Type Key | Parent |
  |----------------|----------|--------|
  | Meeting | `task.coordinate.meeting` | `task.coordinate` |
  | Standup | `task.coordinate.standup` | `task.coordinate` |
  | Deploy | `task.execute.deploy` | `task.execute` |
  | Checklist | `task.execute.checklist` | `task.execute` |

- **Plan Relationships**: Tasks relate to plans via `onto_edges` with `rel: belongs_to_plan` (task→plan) and `rel: has_task` (plan→task)
- **Why**: Different work modes have different cognitive patterns, duration expectations, and workflows

#### onto_plans

- **Format**: `plan.{family}[.{variant}]`
- **Families**:
  | Family | Abstract Base | Description |
  |--------|---------------|-------------|
  | timebox | `plan.timebox.base` | Short, fixed time windows |
  | pipeline | `plan.pipeline.base` | Stage-based funnels/Kanban |
  | campaign | `plan.campaign.base` | Multi-channel pushes over a period |
  | roadmap | `plan.roadmap.base` | Long-term directional plans |
  | process | `plan.process.base` | Repeatable internal processes |
  | phase | `plan.phase.base` | Large phases inside a project |

- **Concrete Examples**:
    - `plan.timebox.sprint` - 1-4 week dev sprint
    - `plan.timebox.weekly` - Weekly plan
    - `plan.campaign.marketing` - Marketing campaign
    - `plan.campaign.content_calendar` - Editorial calendar
    - `plan.roadmap.product` - Product roadmap
    - `plan.process.client_onboarding` - Client onboarding
    - `plan.phase.project` - Generic project phase

- **Why**: Plans have their own logic, FSM, and can be templated across projects

#### onto_goals

- **Format**: `goal.{family}[.{variant}]`
- **Families**:
  | Family | Abstract Base | Measurement |
  |--------|---------------|-------------|
  | outcome | `goal.outcome.base` | Binary completion |
  | metric | `goal.metric.base` | Numeric/quantitative targets |
  | behavior | `goal.behavior.base` | Frequency & consistency |
  | learning | `goal.learning.base` | Skill level progression |

- **Concrete Examples**:
    - `goal.outcome.project` - "Launch v1", "Publish book"
    - `goal.outcome.milestone` - Intermediate milestone
    - `goal.metric.usage` - MAU, DAU, retention
    - `goal.metric.revenue` - MRR, ARR, GMV
    - `goal.behavior.cadence` - "post 3x/week"
    - `goal.learning.skill` - "learn React"

- **Why**: Different goal types have different measurement strategies and templates

#### onto_documents

- **Format**: `document.{family}[.{variant}]`
- **Families**:
  | Family | Abstract Base | Purpose |
  |--------|---------------|---------|
  | context | `document.context.base` | Big picture, intent, constraints |
  | knowledge | `document.knowledge.base` | Research, findings, raw learning |
  | decision | `document.decision.base` | Decisions and commitments |
  | spec | `document.spec.base` | Formalized "what/how" |
  | reference | `document.reference.base` | Reusable guides / handbooks |
  | intake | `document.intake.base` | Information gathered at start |

- **Concrete Examples**:
    - `document.context.project` - Canonical project context
    - `document.knowledge.research` - General research notes
    - `document.decision.meeting_notes` - Meeting notes + decisions
    - `document.spec.product` - Product spec
    - `document.reference.handbook` - Handbook / playbook
    - `document.intake.client` - Client intake form

- **Context Docs**: `document.context.project` links via `onto_projects.context_document_id`
- **Why**: Documents have different purposes and schemas, can be versioned independently

#### onto_outputs (Deliverables)

- **Format**: `output.{family}[.{variant}]`
- **Families** (content modality):
  | Family | Abstract Base | Description |
  |--------|---------------|-------------|
  | written | `output.written.base` | Long-form text, structured writing |
  | media | `output.media.base` | Visual/audio/video artifacts |
  | software | `output.software.base` | Code, releases, APIs |
  | operational | `output.operational.base` | Business/ops deliverables |

- **Concrete Examples**:
    - `output.written.chapter` - Book chapter
    - `output.written.article` - Article / essay
    - `output.written.blog_post` - Blog post
    - `output.media.design_mockup` - Design mockup
    - `output.media.slide_deck` - Presentation deck
    - `output.software.feature` - Shipped feature
    - `output.software.release` - Versioned release
    - `output.operational.report` - Report
    - `output.operational.dashboard` - Live dashboard

- **Why**: Different output types have completely different schemas and lifecycles

#### onto_risks

- **Format**: `risk.{family}[.{variant}]`
- **Families**:
  | Family | Abstract Base | Category |
  |--------|---------------|----------|
  | technical | `risk.technical.base` | Tech/architecture, security, reliability |
  | schedule | `risk.schedule.base` | Timing & deadlines |
  | resource | `risk.resource.base` | People, skills, bandwidth |
  | budget | `risk.budget.base` | Money-related |
  | scope | `risk.scope.base` | Scope creep & ambiguity |
  | external | `risk.external.base` | Market, regulatory, vendor |
  | quality | `risk.quality.base` | Bugs, UX, performance issues |

- **Concrete Examples**:
    - `risk.technical.security` - Security risk
    - `risk.technical.scalability` - Scalability risk
    - `risk.schedule.dependency` - Dependency timing
    - `risk.resource.skill_gap` - Missing expertise
    - `risk.external.regulatory` - Compliance risk

- **FSM**: identified → analyzing → mitigating → monitoring → occurred/closed
- **Why**: Different risk types have different mitigation strategies and properties

#### onto_events

- **Format**: `event.{family}[.{variant}]`
- **Families**:
  | Family | Abstract Base | Description |
  |--------|---------------|-------------|
  | work | `event.work.base` | Individual work sessions / focus time |
  | collab | `event.collab.base` | Coordination with others |
  | marker | `event.marker.base` | Deadlines, reminders, status markers |

- **Concrete Examples**:
    - `event.work.focus_block` - Deep work focus block
    - `event.work.time_block` - Generic working block
    - `event.collab.meeting.base` - Abstract meeting
    - `event.collab.meeting.one_on_one` - 1:1 meeting
    - `event.collab.meeting.standup` - Daily standup
    - `event.marker.deadline` - Deadline
    - `event.marker.reminder` - Reminder

- **Why**: Calendar-bound time slots need type differentiation for scheduling and analytics

#### onto_requirements

- **Format**: `requirement.{type}[.{category}]`
- **Templates**:
  | Type | Type Key | Focus |
  |------|----------|-------|
  | Base | `requirement.base` | Abstract base |
  | Functional | `requirement.functional` | What it does |
  | Non-Functional | `requirement.non_functional` | How it performs |
  | Constraint | `requirement.constraint` | Limitations |
  | Assumption | `requirement.assumption` | Working assumptions |
  | Dependency | `requirement.dependency` | External dependencies |

- **FSM**: draft → proposed → approved → implemented → verified
- **Priority**: Uses MoSCoW (must_have, should_have, could_have, wont_have)
- **Why**: Different requirement types have different validation and tracking needs

---

### 2. Project-Derived Entities (No Type Keys)

These entities inherit meaning from their parent project and don't need independent taxonomy.

#### onto_metrics

- **Why not**: Metrics are project-specific measurements
- **Pattern**: The project type determines what metrics matter

#### onto_milestones

- **Why not**: Temporal markers within a project, no schema variation
- **Pattern**: Just `{title, due_at, props}` within project context

#### onto_decisions

- **Why not**: Project-specific choices, standard schema
- **Pattern**: `{title, rationale, decision_at}` within project

### 3. Relational/Infrastructure Entities (No Type Keys)

Pure linking constructs with no independent lifecycle:

- `onto_edges` - Relationships between entities
- `onto_assignments` - Role assignments
- `onto_permissions` - Access control

### 4. Reference/Taxonomy Entities (Are The Taxonomy)

System-wide reference data:

- `onto_templates` - The blueprints themselves
- `onto_facet_definitions` - The 3 facets definition
- `onto_facet_values` - Allowed facet values
- `onto_tools` - Available tools catalog

---

## Type Key vs Facets

### Understanding the Relationship

**Type Key** and **Facets** answer different questions:

- **type_key** → "What is this entity fundamentally?"
- **facets** → "What are the instance-specific dimensions?"

### Example

```typescript
{
  type_key: "project.technical.app.mobile",  // WHAT KIND of project (realm + deliverable)
  props: {
    facets: {
      context: "client",              // WHO it's for (instance-specific)
      scale: "large",                 // HOW BIG (instance-specific)
      stage: "execution"              // WHERE in lifecycle (instance-specific)
    }
  }
}
```

The type_key defines the category and suggests default behaviors, while facets provide orthogonal dimensions that vary per instance.

### Role is NOT in type_key

Role (writer, developer, coach, founder, etc.) is orthogonal to project type:

```typescript
// CORRECT: Role is user context, not project taxonomy
{
  type_key: "project.creative.book",  // The project IS a book
  // User's role (writer, developer writing a tech book, etc.)
  // is determined separately and influences template selection
}

// INCORRECT: Don't put role in type_key
{
  type_key: "project.writer.book",  // WRONG - writer is a role, not a realm
}
```

---

## Naming Conventions

### Consistent Format Pattern

All autonomous entities follow: `{scope}.{type}[.{variant}]`

- **Projects**: `project.{realm}.{deliverable}[.{variant}]`
    - `project.creative.book`
    - `project.technical.app.mobile`
    - `project.service.coaching_program`

- **Tasks**: `task.{work_mode}[.{specialization}]`
    - `task.execute` (default)
    - `task.coordinate.meeting`

- **Plans**: `plan.{family}[.{variant}]`
    - `plan.timebox.sprint`
    - `plan.campaign.marketing`

- **Goals**: `goal.{family}[.{variant}]`
    - `goal.outcome.project`
    - `goal.metric.revenue`

- **Documents**: `document.{family}[.{variant}]`
    - `document.context.project`
    - `document.knowledge.research`

- **Outputs**: `output.{family}[.{variant}]`
    - `output.written.chapter`
    - `output.media.slide_deck`

- **Risks**: `risk.{family}[.{variant}]`
    - `risk.technical.security`
    - `risk.schedule.dependency`

- **Events**: `event.{family}[.{variant}]`
    - `event.work.focus_block`
    - `event.collab.meeting.standup`

### Multi-Word Convention

Use underscores for multi-word components:

- `project.personal.morning_routine`
- `output.written.blog_post`
- `plan.process.client_onboarding`
- `document.decision.meeting_notes`
- `event.marker.out_of_office`

---

## Validation Patterns

### Type Key Regex Validators

```typescript
// Valid patterns by scope
const TYPE_KEY_PATTERNS = {
	project: /^project\.[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/,
	task: /^task\.[a-z_]+(\.[a-z_]+)?$/,
	plan: /^plan\.[a-z_]+(\.[a-z_]+)?$/,
	goal: /^goal\.[a-z_]+(\.[a-z_]+)?$/,
	output: /^output\.[a-z_]+(\.[a-z_]+)?$/,
	document: /^document\.[a-z_]+(\.[a-z_]+)?$/,
	risk: /^risk\.[a-z_]+(\.[a-z_]+)?$/,
	event: /^event\.[a-z_]+(\.[a-z_]+)?$/,
	requirement: /^requirement\.[a-z_]+(\.[a-z_]+)?$/
};

// General type_key pattern (2-3 dot-separated segments, lowercase with underscores)
const GENERAL_TYPE_KEY_PATTERN = /^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/;

// Valid project realms (6 core realms)
const PROJECT_REALMS = ['creative', 'technical', 'business', 'service', 'education', 'personal'];
```

### Validation Helper

```typescript
function isValidTypeKey(typeKey: string, scope?: string): boolean {
	if (scope && TYPE_KEY_PATTERNS[scope]) {
		return TYPE_KEY_PATTERNS[scope].test(typeKey);
	}
	return GENERAL_TYPE_KEY_PATTERN.test(typeKey);
}

function isValidProjectRealm(realm: string): boolean {
	return PROJECT_REALMS.includes(realm);
}

function extractProjectRealm(typeKey: string): string | null {
	const match = typeKey.match(/^project\.([a-z_]+)\./);
	return match ? match[1] : null;
}
```

---

## Cross-Cutting Query Patterns

With the family-based taxonomy, you get powerful querying:

```sql
-- All creative projects
SELECT * FROM onto_projects
WHERE type_key LIKE 'project.creative.%';

-- All technical projects
SELECT * FROM onto_projects
WHERE type_key LIKE 'project.technical.%';

-- All business projects
SELECT * FROM onto_projects
WHERE type_key LIKE 'project.business.%';

-- All service projects
SELECT * FROM onto_projects
WHERE type_key LIKE 'project.service.%';

-- All written outputs
SELECT * FROM onto_outputs
WHERE type_key LIKE 'output.written.%';

-- All campaign-style plans
SELECT * FROM onto_plans
WHERE type_key LIKE 'plan.campaign.%';

-- All knowledge-oriented docs
SELECT * FROM onto_documents
WHERE type_key LIKE 'document.knowledge.%';

-- All collaboration events this week
SELECT * FROM onto_events
WHERE type_key LIKE 'event.collab.%'
  AND start_at >= $week_start
  AND start_at < $week_end;

-- All technical risks across all projects
SELECT * FROM onto_risks
WHERE type_key LIKE 'risk.technical.%';

-- All behavior-type goals
SELECT * FROM onto_goals
WHERE type_key LIKE 'goal.behavior.%';
```

### Family Extraction for Indexing

```typescript
// Extract family from type_key for search/indexing
function extractFamily(typeKey: string): { scope: string; family: string; variant?: string } {
	const parts = typeKey.split('.');
	return {
		scope: parts[0],
		family: parts[1],
		variant: parts[2]
	};
}

// Example usage
extractFamily('output.written.chapter');
// → { scope: 'output', family: 'written', variant: 'chapter' }

extractFamily('plan.timebox.sprint');
// → { scope: 'plan', family: 'timebox', variant: 'sprint' }

extractFamily('project.technical.app');
// → { scope: 'project', family: 'technical', variant: 'app' }
```

---

## Implementation Guidelines

### 1. Don't Over-Engineer

Only create type_key taxonomy where you actually need to:

- Template independent instances
- Discover/filter across projects
- Have schema/FSM variation

### 2. Template-First Thinking

For each table, ask: "Would I ever create a template for this?"

- YES → needs type_key
- NO → doesn't need type_key

### 3. Required Type Keys

Tasks now require a type_key (defaults to `task.execute`):

```typescript
interface Task {
	type_key: string; // Required - defaults to 'task.execute'
	project_id: string; // Always has project context
	// Plan relationships managed via onto_edges, not a direct plan_id column
}
```

### 4. Context Inheritance

Project context flows down to child entities:

- **Projects say**: "We're doing a `project.technical.app` project"
- **Plans say**: "Within that, we're using a `plan.timebox.sprint` plan"
- **Tasks say**: "Some tasks are `task.execute` or `task.create`" (work mode typing)
- **Outputs say**: "We're producing `output.software.feature` outputs"

Each level adds specificity while maintaining parent context.

---

## Quick Decision Guide

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

## Related Documentation

- **[NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md)** - Complete naming reference with all templates
- **[ONTOLOGY_NAMESPACES_CORE.md](./ONTOLOGY_NAMESPACES_CORE.md)** - Canonical namespace definitions
- **[DATA_MODELS.md](./DATA_MODELS.md)** - Complete database schema
- **[README.md](./README.md)** - Main ontology documentation
- **[CURRENT_STATUS.md](./CURRENT_STATUS.md)** - Implementation status
- **[API_ENDPOINTS.md](./API_ENDPOINTS.md)** - API reference
- **[TEMPLATE_TAXONOMY.md](./TEMPLATE_TAXONOMY.md)** - Deliverables catalog

---

## Changelog

### December 10, 2025 (Project Realm Taxonomy Update)

- **BREAKING**: Changed project type_key format from `project.{role}.{deliverable}` to `project.{realm}.{deliverable}`
- **NEW**: Defined 6 core project realms: creative, technical, business, service, education, personal
- **NOTE**: Edge cases (research, operations, design) fold into core realms for higher classification accuracy
- **NEW**: Added realm classification signals for AI inference from brain dumps
- **NEW**: Added disambiguation strategy ("What does success look like?")
- **CLARIFIED**: Role belongs to the user, not the project - role is orthogonal to type_key
- **UPDATED**: All project examples to use realm-based naming
- **ADDED**: PROJECT_REALMS constant for validation

### December 1, 2025 (Family-Based Taxonomy Update)

- **NEW**: Added family-based taxonomy pattern for plans, goals, documents, outputs, risks, and events
- **NEW**: Added `onto_events` entity documentation with work/collab/marker families
- **NEW**: Added abstract base templates (`*.base` and `*.{family}.base`) documentation
- **UPDATED**: Plan families: timebox, pipeline, campaign, roadmap, process, phase
- **UPDATED**: Goal families: outcome, metric, behavior, learning
- **UPDATED**: Document families: context, knowledge, decision, spec, reference, intake
- **UPDATED**: Output families: written, media, software, operational
- **UPDATED**: Risk families: technical, schedule, resource, budget, scope, external, quality
- **NEW**: Added family extraction helper for indexing/search
- **NEW**: Added cross-cutting query pattern examples

---

**Key Insight**: The elegance of this system is that it solves the ontology problem at the project level with realms that describe _what kind of value is being created_, then lets each sub-entity choose whether it needs independent structure. Role is about _who is doing the work_ and belongs to the user context, not the project taxonomy. Don't conflate the two.
