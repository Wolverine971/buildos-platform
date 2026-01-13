<!-- apps/web/docs/features/ontology/NAMING_CONVENTIONS.md -->

# Ontology Naming Conventions

**Last Updated**: December 1, 2025
**Status**: Canonical Reference
**Purpose**: Definitive naming patterns for all ontology entities

---

## Quick Reference Table

| Entity           | Type Key Format                              | Example                                                   | Template Count |
| ---------------- | -------------------------------------------- | --------------------------------------------------------- | -------------- |
| **Projects**     | `project.{domain}.{deliverable}[.{variant}]` | `project.writer.book`, `project.developer.app.web`        | 13+            |
| **Tasks**        | `task.{work_mode}[.{specialization}]`        | `task.execute`, `task.coordinate.meeting`                 | 12             |
| **Plans**        | `plan.{family}[.{variant}]`                  | `plan.timebox.sprint`, `plan.campaign.marketing`          | 20+            |
| **Goals**        | `goal.{family}[.{variant}]`                  | `goal.outcome.project`, `goal.metric.revenue`             | 12+            |
| **Documents**    | `document.{family}[.{variant}]`              | `document.context.project`, `document.knowledge.research` | 20+            |
| **Outputs**      | `output.{family}[.{variant}]`                | `output.written.chapter`, `output.media.slide_deck`       | 25+            |
| **Risks**        | `risk.{family}[.{variant}]`                  | `risk.technical.security`, `risk.schedule.dependency`     | 18+            |
| **Events**       | `event.{family}[.{variant}]`                 | `event.work.focus_block`, `event.collab.meeting.standup`  | 18+            |
| **Requirements** | `requirement.{type}[.{category}]`            | `requirement.functional`, `requirement.constraint`        | 6              |

---

## General Principles

### 1. Core Pattern: Family-Based Taxonomy

All autonomous entities follow a **family-based taxonomy pattern**:

```
{data_type}.{family}[.{variant}]
```

- **data_type**: Entity category (`plan`, `goal`, `document`, `output`, `risk`, `event`)
- **family**: Meta-category for querying (e.g., `written`, `context`, `timebox`, `collab`)
- **variant**: Specific template within the family (e.g., `sprint`, `article`, `meeting.one_on_one`)

### 2. Abstract Base Templates

Abstract bases follow this pattern and are **not instantiable**:

```
{data_type}.base            # Root abstract type for that data_type
{data_type}.{family}.base   # Abstract type for that family
```

### 3. Naming Rules

| Rule                           | Good                   | Bad                                   |
| ------------------------------ | ---------------------- | ------------------------------------- |
| Use lowercase                  | `task.execute`         | `Task.Execute`                        |
| Use underscores for multi-word | `content_calendar`     | `contentCalendar`, `content-calendar` |
| Keep segments short            | `plan.timebox.sprint`  | `plan.development_sprint_cycle`       |
| Be specific but not verbose    | `risk.technical`       | `risk.technical_engineering_issue`    |
| Use nouns, not verbs           | `task.research`        | `task.researching`                    |
| Maximum 3 segments             | `event.collab.meeting` | `event.collab.meeting.one.on.one`     |

### 4. Reserved Scope Prefixes

These scope prefixes are reserved and must be used consistently:

- `project.` - All project templates
- `task.` - All task templates
- `plan.` - All plan templates
- `goal.` - All goal templates
- `output.` - All output/deliverable templates
- `document.` - All document templates
- `risk.` - All risk templates
- `event.` - All event templates
- `requirement.` - All requirement templates

---

## Entity-Specific Conventions

### Projects

**Format**: `project.{domain}.{deliverable}[.{variant}]`

Projects use the `project.` scope prefix followed by domain-based naming that reflects the user's professional identity.

| Segment       | Description                 | Examples                                   |
| ------------- | --------------------------- | ------------------------------------------ |
| `project`     | Required scope prefix       | Always `project`                           |
| `domain`      | Professional domain or role | `writer`, `developer`, `coach`, `marketer` |
| `deliverable` | Primary output type         | `book`, `app`, `client`, `campaign`        |
| `variant`     | Specialization (optional)   | `mobile`, `executive`, `b2b`               |

**Examples**:

```
project.writer.book                    # Writer creating a book
project.writer.article                 # Writer creating articles
project.developer.app                  # Developer building an app
project.developer.app.mobile           # Developer building a mobile app
project.coach.client                   # Coach with a client engagement
project.coach.client.executive         # Executive coaching engagement
project.marketer.campaign              # Marketing campaign
project.founder.startup                # Startup founder
project.personal.routine               # Personal routine/habit
project.student.course                 # Student taking a course
```

---

### Tasks

**Format**: `task.{work_mode}[.{specialization}]`

Tasks use a **work mode taxonomy** that describes the cognitive pattern of the work.

#### 8 Base Work Modes

| Work Mode  | Type Key          | Description                          | Typical Duration |
| ---------- | ----------------- | ------------------------------------ | ---------------- |
| Execute    | `task.execute`    | Action tasks - do the work (default) | 1-4 hours        |
| Create     | `task.create`     | Produce new artifacts                | 2-8 hours        |
| Refine     | `task.refine`     | Improve existing work                | 1-4 hours        |
| Research   | `task.research`   | Investigate and gather information   | 1-6 hours        |
| Review     | `task.review`     | Evaluate and provide feedback        | 30min-2 hours    |
| Coordinate | `task.coordinate` | Sync with others                     | 15min-1 hour     |
| Admin      | `task.admin`      | Administrative housekeeping          | 15min-1 hour     |
| Plan       | `task.plan`       | Strategic thinking and planning      | 1-4 hours        |

#### 4 Specializations (v1)

Specializations inherit from base work modes and add workflow-specific properties:

| Specialization | Type Key                  | Parent            | Use Case               |
| -------------- | ------------------------- | ----------------- | ---------------------- |
| Meeting        | `task.coordinate.meeting` | `task.coordinate` | Scheduled meetings     |
| Standup        | `task.coordinate.standup` | `task.coordinate` | Daily syncs            |
| Deploy         | `task.execute.deploy`     | `task.execute`    | Production deployments |
| Checklist      | `task.execute.checklist`  | `task.execute`    | Process-based tasks    |

**Selection Guide**:

- Default to `task.execute` when unsure
- Use `task.create` when producing something new from scratch
- Use `task.refine` when improving existing work
- Use `task.coordinate.meeting` for any scheduled meeting

---

### Plans

**Format**: `plan.{family}[.{variant}]`

Plans organize tasks across time/structure. They align to goals, provide cadence & scope, and attach to events and tasks.

#### Plan Families

| Family   | Abstract Base        | Description                        | Typical Duration |
| -------- | -------------------- | ---------------------------------- | ---------------- |
| timebox  | `plan.timebox.base`  | Short, fixed time windows          | 1 day - 4 weeks  |
| pipeline | `plan.pipeline.base` | Stage-based funnels/Kanban         | Ongoing          |
| campaign | `plan.campaign.base` | Multi-channel pushes over a period | 1-3 months       |
| roadmap  | `plan.roadmap.base`  | Long-term directional plans        | 3-12 months      |
| process  | `plan.process.base`  | Repeatable internal processes      | Varies           |
| phase    | `plan.phase.base`    | Large phases inside a project      | Varies           |

#### Concrete Plan Templates

**Timeboxed Plans**

```
plan.timebox.sprint          # 1–4 week dev sprint
plan.timebox.weekly          # Weekly plan
plan.timebox.daily_focus     # Daily focus plan
```

**Pipeline Plans**

```
plan.pipeline.sales          # leads → opps → closed
plan.pipeline.content        # idea → draft → edit → published
plan.pipeline.feature        # backlog → in_progress → done
```

**Campaign Plans**

```
plan.campaign.marketing      # Marketing campaign (multi-channel)
plan.campaign.product_launch # Launch campaign
plan.campaign.content_calendar  # Editorial calendar
```

**Roadmap Plans**

```
plan.roadmap.product         # Product roadmap (quarters / epics)
plan.roadmap.strategy        # Business/strategy roadmap
```

**Process Plans**

```
plan.process.client_onboarding  # Client onboarding
plan.process.support_runbook    # Support / ops process
plan.process.hiring_pipeline    # Hiring process
```

**Phase Plans**

```
plan.phase.project             # Generic project phase
plan.phase.discovery           # Discovery phase
plan.phase.execution           # Execution phase
plan.phase.migration           # Migration / cutover phase
```

> **Query Examples:**
>
> - "All timeboxed plans": `WHERE type_key LIKE 'plan.timebox.%'`
> - "All campaign-like plans": `WHERE type_key LIKE 'plan.campaign.%'`

---

### Goals

**Format**: `goal.{family}[.{variant}]`

Goals define what success looks like: what must be true, what must we hit (numbers, habits, skills).

#### Goal Families

| Family   | Abstract Base        | Measurement                  | Examples                     |
| -------- | -------------------- | ---------------------------- | ---------------------------- |
| outcome  | `goal.outcome.base`  | Binary completion            | "Launch MVP", "Publish book" |
| metric   | `goal.metric.base`   | Numeric/quantitative targets | "10k MAU", "$50k MRR"        |
| behavior | `goal.behavior.base` | Frequency & consistency      | "Post 3x/week", "Call 5/day" |
| learning | `goal.learning.base` | Skill level progression      | "Learn React", "Master SQL"  |

#### Concrete Goal Templates

```
goal.outcome.project         # "Launch v1", "Publish book"
goal.outcome.milestone       # Intermediate project milestone
goal.metric.usage            # MAU, DAU, retention
goal.metric.revenue          # MRR, ARR, GMV
goal.behavior.cadence        # "post 3x/week", "call 5 prospects/day"
goal.behavior.routine        # Morning routine / weekly review
goal.learning.skill          # "learn React", "learn copywriting"
goal.learning.domain         # "understand ICP", "understand competitor landscape"
```

> **Query Example:** All habit-like goals: `WHERE type_key LIKE 'goal.behavior.%'`

---

### Documents

**Format**: `document.{family}[.{variant}]`

Documents are project memory: context & narrative, knowledge & evidence, decisions & specifications, reusable references.

#### Document Families

| Family    | Abstract Base             | Purpose                                     |
| --------- | ------------------------- | ------------------------------------------- |
| context   | `document.context.base`   | Big picture, intent, constraints            |
| knowledge | `document.knowledge.base` | Research, findings, raw learning            |
| decision  | `document.decision.base`  | Decisions and commitments                   |
| spec      | `document.spec.base`      | Formalized "what/how" (requirements, specs) |
| reference | `document.reference.base` | Reusable guides / handbooks                 |
| intake    | `document.intake.base`    | Information gathered at relationship start  |

#### Concrete Document Templates

**Context Documents**

```
document.context.project      # Canonical project context
document.context.brief        # Short creative brief / one-pager
```

**Knowledge Documents**

```
document.knowledge.research          # General research notes
document.knowledge.market_research   # Market/ICP specific research
document.knowledge.user_research     # User interviews, surveys
document.knowledge.brain_dump        # Semi-structured brain dumps
```

**Decision Documents**

```
document.decision.meeting_notes      # Meeting notes + decisions
document.decision.rfc                # Request for comment / design decision doc
document.decision.proposal.client    # Proposal sent to client
document.decision.proposal.investor  # Investor pitch/proposal
```

**Spec Documents**

```
document.spec.product                # Product spec
document.spec.technical              # Technical/architecture spec
document.spec.requirement            # Requirements doc
```

**Reference Documents**

```
document.reference.handbook          # Handbook / playbook
document.reference.sop               # Standard operating procedure
document.reference.checklist         # Reusable procedural checklist
```

**Intake Documents**

```
document.intake.client               # Client intake / discovery form
document.intake.user                 # User intake / onboarding form
document.intake.project              # Project intake questionnaire
```

> **Query Example:** All knowledge docs: `WHERE type_key LIKE 'document.knowledge.%'`

---

### Outputs

**Format**: `output.{family}[.{variant}]`

Outputs are the deliverables a project produces. The family segment represents the content modality.

#### Output Families

| Family      | Abstract Base             | Description                        |
| ----------- | ------------------------- | ---------------------------------- |
| written     | `output.written.base`     | Long-form text, structured writing |
| media       | `output.media.base`       | Visual/audio/video artifacts       |
| software    | `output.software.base`    | Code, releases, APIs               |
| operational | `output.operational.base` | Business/ops deliverables          |

#### Concrete Output Templates

**Written Outputs**

```
output.written.chapter          # Book chapter
output.written.article          # Article / essay
output.written.blog_post        # Blog post
output.written.case_study       # Case study
output.written.whitepaper       # Technical/analysis whitepaper
output.written.newsletter       # Newsletter edition
output.written.sales_page       # Sales/landing page
output.written.script           # Script for video/podcast
```

**Media Outputs**

```
output.media.design_mockup      # Design mockup / Figma frame
output.media.slide_deck         # Presentation deck
output.media.video              # Produced video
output.media.audio              # Podcast / audio asset
output.media.asset_pack         # Icon sets, banners, etc.
```

**Software Outputs**

```
output.software.feature         # Shipped feature
output.software.release         # Versioned release
output.software.api             # API surface / endpoint bundle
output.software.integration     # Integration with external service
```

**Operational Outputs**

```
output.operational.report       # Recurring or ad-hoc report
output.operational.dashboard    # Live dashboard
output.operational.contract     # Signed contract / agreement
output.operational.playbook     # Implementation playbook for a client
```

> **Query Examples:**
>
> - "All written outputs": `WHERE type_key LIKE 'output.written.%'`
> - "All dashboards": `WHERE type_key = 'output.operational.dashboard'`

---

### Risks

**Format**: `risk.{family}[.{variant}]`

Risks track potential negative outcomes and mitigation strategies.

#### Risk Families

| Family    | Abstract Base         | Category                                 |
| --------- | --------------------- | ---------------------------------------- |
| technical | `risk.technical.base` | Tech/architecture, security, reliability |
| schedule  | `risk.schedule.base`  | Timing & deadlines                       |
| resource  | `risk.resource.base`  | People, skills, bandwidth                |
| budget    | `risk.budget.base`    | Money-related                            |
| scope     | `risk.scope.base`     | Scope creep & ambiguity                  |
| external  | `risk.external.base`  | Market, regulatory, vendor               |
| quality   | `risk.quality.base`   | Bugs, UX, performance issues             |

#### Concrete Risk Templates

```
risk.technical.security         # Security-specific technical risk
risk.technical.scalability      # Scalability / performance
risk.schedule.dependency        # Timing risk from dependencies
risk.schedule.deadline          # Hard deadline risk
risk.resource.headcount         # Not enough people
risk.resource.skill_gap         # Missing expertise
risk.budget.overrun             # Budget overrun
risk.external.regulatory        # Laws / compliance
risk.external.market_shift      # Macro or competitor-based
risk.quality.defects            # High defect rate risk
risk.quality.usability          # UX / adoption risk
```

> **Query Examples:**
>
> - All technical risks: `WHERE type_key LIKE 'risk.technical.%'`
> - All schedule-related risks: `WHERE type_key LIKE 'risk.schedule.%'`

**Risk Score Matrix**:

Risks use probability × impact for scoring:

|               | Low Impact | Medium | High | Critical |
| ------------- | ---------- | ------ | ---- | -------- |
| **Very High** | 4          | 8      | 12   | 16       |
| **High**      | 3          | 6      | 9    | 12       |
| **Medium**    | 2          | 4      | 6    | 8        |
| **Low**       | 1          | 2      | 3    | 4        |

---

### Events

**Format**: `event.{family}[.{variant}]`

Events are calendar-bound time slots: when something happens.

#### Event Families

| Family | Abstract Base       | Description                           |
| ------ | ------------------- | ------------------------------------- |
| work   | `event.work.base`   | Individual work sessions / focus time |
| collab | `event.collab.base` | Coordination with others              |
| marker | `event.marker.base` | Deadlines, reminders, status markers  |

#### Concrete Event Templates

**Work Events**

```
event.work.focus_block        # Deep work focus block
event.work.time_block         # Generic working block
event.work.buffer             # Buffer time between sessions
```

**Collaboration Events**

```
event.collab.meeting.base     # Abstract meeting
event.collab.meeting.one_on_one
event.collab.meeting.standup
event.collab.meeting.review       # Design/code/plan review
event.collab.meeting.workshop     # Longer collaborative session
event.collab.meeting.client       # Client-facing meeting
event.collab.meeting.internal     # Internal team meeting
```

**Marker Events**

```
event.marker.deadline         # Deadline reflected on calendar
event.marker.reminder         # Short reminder ping
event.marker.out_of_office    # OOO block
event.marker.travel           # Travel block
event.marker.hold             # Calendar hold / tentative slot
```

> **Query Examples:**
>
> - All collaboration events: `WHERE type_key LIKE 'event.collab.%'`
> - All work sessions: `WHERE type_key LIKE 'event.work.%'`

---

### Requirements

**Format**: `requirement.{type}[.{category}]`

Requirements capture what the project must achieve.

| Type           | Type Key                     | Focus                 |
| -------------- | ---------------------------- | --------------------- |
| Base           | `requirement.base`           | Abstract base         |
| Functional     | `requirement.functional`     | What it does          |
| Non-Functional | `requirement.non_functional` | How it performs       |
| Constraint     | `requirement.constraint`     | Limitations           |
| Assumption     | `requirement.assumption`     | Working assumptions   |
| Dependency     | `requirement.dependency`     | External dependencies |

**Priority Levels (MoSCoW)**:

- `must_have` - Critical for success
- `should_have` - Important but not critical
- `could_have` - Nice to have
- `wont_have` - Explicitly out of scope

---

## Template Inheritance

### How Inheritance Works

Child templates inherit from parents:

1. **Schema properties accumulate** (child can override)
2. **FSM is replaced** (child defines own state machine)
3. **Metadata merges** (child wins on conflict)
4. **Facet defaults merge** (child wins on conflict)

### Abstract Templates

Templates marked `is_abstract: true` cannot be instantiated directly. They serve as inheritance bases:

**Root Abstracts (not usable):**

- `plan.base`, `goal.base`, `document.base`, `output.base`, `risk.base`, `event.base`

**Family Abstracts (not usable):**

- `plan.timebox.base`, `plan.campaign.base`, etc.
- `goal.outcome.base`, `goal.metric.base`, etc.
- `document.context.base`, `document.knowledge.base`, etc.
- `output.written.base`, `output.media.base`, etc.
- `risk.technical.base`, `risk.schedule.base`, etc.
- `event.work.base`, `event.collab.base`, `event.marker.base`

---

## Facets (Dimensional Classification)

Beyond type_key, entities support **facets** for cross-cutting classification:

| Facet       | Values                                                                                       | Applies To               |
| ----------- | -------------------------------------------------------------------------------------------- | ------------------------ |
| **context** | personal, client, commercial, internal, open_source, community, academic, nonprofit, startup | projects, plans          |
| **scale**   | micro, small, medium, large, epic                                                            | projects, plans, tasks   |
| **stage**   | discovery, planning, execution, launch, maintenance, complete                                | projects, plans, outputs |

**Usage**:

```typescript
{
  type_key: "project.writer.book",
  props: {
    facets: {
      context: "personal",
      scale: "large",
      stage: "execution"
    }
  }
}
```

---

## Cross-Cutting Query Patterns

The family-based taxonomy enables powerful queries:

```sql


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
```

---

## Validation Rules

Type keys are validated at the application level:

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
```

---

## Type Inference Mapping

For LLM/heuristic-based type inference:

### Written Outputs

- Keywords: write, draft, chapter, article, post → `output.written.*`

### Media Outputs

- Keywords: design, figma, mockup, thumbnail → `output.media.design_mockup`

### Software Outputs

- Keywords: feature, release, API → `output.software.*`

### Plan Families

- "sprint" → `plan.timebox.sprint`
- "weekly plan" → `plan.timebox.weekly`
- "campaign/launch/marketing plan" → `plan.campaign.marketing`
- "content calendar" → `plan.campaign.content_calendar`

### Document Families

- research → `document.knowledge.research`
- meeting notes → `document.decision.meeting_notes`
- specs → `document.spec.*`
- briefs → `document.context.brief`

### Risks

- tech debt → `risk.technical`
- dependency delay → `risk.schedule`
- headcount, skill gaps → `risk.resource`

### Events

- meeting → `event.collab.meeting.*`
- focus time → `event.work.focus_block`
- deadline → `event.marker.deadline`

---

## Related Documentation

- **[TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md)** - Architecture rationale and decision framework
- **[ONTOLOGY_NAMESPACES_CORE.md](./ONTOLOGY_NAMESPACES_CORE.md)** - Complete namespace reference
- **[DATA_MODELS.md](./DATA_MODELS.md)** - Complete database schema
- **[API_ENDPOINTS.md](./API_ENDPOINTS.md)** - API reference
- **[CURRENT_STATUS.md](./CURRENT_STATUS.md)** - Implementation status
- **[TEMPLATE_TAXONOMY.md](./TEMPLATE_TAXONOMY.md)** - Output deliverables catalog

---

## Changelog

### December 1, 2025 (Family-Based Taxonomy Update)

- **NEW**: Added family-based taxonomy pattern for plans, goals, documents, outputs, risks, and events
- **NEW**: Added abstract base templates (`*.base` and `*.{family}.base`)
- **NEW**: Added `event.*` namespace for calendar-bound entities
- **UPDATED**: Plan templates now use family pattern (timebox, pipeline, campaign, roadmap, process, phase)
- **UPDATED**: Goal templates now use family pattern (outcome, metric, behavior, learning)
- **UPDATED**: Document templates now use family pattern (context, knowledge, decision, spec, reference, intake)
- **UPDATED**: Output templates now use family pattern (written, media, software, operational)
- **UPDATED**: Risk templates now use family pattern (technical, schedule, resource, budget, scope, external, quality)
- **NEW**: Added type inference mapping heuristics
- **NEW**: Added cross-cutting query pattern examples

### December 1, 2025 (Project Prefix Update)

- **BREAKING**: Changed project template format from `{domain}.{deliverable}[.{variant}]` to `project.{domain}.{deliverable}[.{variant}]`
- Added `project.` to reserved scope prefixes
- Updated all project examples to use new format
- Updated validation regex for project type_keys
- See [PROJECT_PREFIX_MIGRATION.md](./PROJECT_PREFIX_MIGRATION.md) for migration details

### December 1, 2025 (Earlier)

- Added complete document taxonomy (8 templates)
- Added complete plan taxonomy (9 templates)
- Added complete risk taxonomy (8 templates)
- Added complete requirement taxonomy (6 templates)
- Formalized naming conventions across all entities
