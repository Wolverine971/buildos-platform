<!-- apps/web/docs/features/ontology/ONTOLOGY_NAMESPACES_CORE.md -->

# Ontology Namespaces Core Reference

**Last Updated**: December 1, 2025
**Status**: Canonical Reference
**Purpose**: Complete namespace definitions for all ontology entity type_keys

> This document serves as the **single source of truth** for all type_key namespaces in the BuildOS ontology system.

---

## Namespace Pattern

All type_keys follow a family-based taxonomy:

```
{scope}.{family}[.{variant}]
```

- **scope**: Entity type prefix (project, task, plan, goal, document, output, risk, event)
- **family**: Meta-category for grouping and querying
- **variant**: Specific template within the family (optional)

### Abstract Bases

Abstract templates (not instantiable) follow this pattern:

```
{scope}.base            # Root abstract type for that scope
{scope}.{family}.base   # Abstract type for that family
```

---

## Complete Namespace Reference

### Projects (`project.*`)

**Format**: `project.{domain}.{deliverable}[.{variant}]`

| Domain    | Type Key Example                 | Description                   |
| --------- | -------------------------------- | ----------------------------- |
| writer    | `project.writer.book`            | Writer creating a book        |
| writer    | `project.writer.article`         | Writer creating articles      |
| developer | `project.developer.app`          | Developer building an app     |
| developer | `project.developer.app.mobile`   | Developer building mobile app |
| coach     | `project.coach.client`           | Coach client engagement       |
| coach     | `project.coach.client.executive` | Executive coaching engagement |
| marketer  | `project.marketer.campaign`      | Marketing campaign            |
| founder   | `project.founder.startup`        | Startup founder               |
| personal  | `project.personal.routine`       | Personal routine/habit        |
| student   | `project.student.course`         | Student taking a course       |

**Regex**: `/^project\.[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/`

---

### Tasks (`task.*`)

**Format**: `task.{work_mode}[.{specialization}]`

#### 8 Base Work Modes

| Work Mode  | Type Key          | Description                          |
| ---------- | ----------------- | ------------------------------------ |
| execute    | `task.execute`    | Action tasks - do the work (default) |
| create     | `task.create`     | Produce new artifacts                |
| refine     | `task.refine`     | Improve existing work                |
| research   | `task.research`   | Investigate and gather information   |
| review     | `task.review`     | Evaluate and provide feedback        |
| coordinate | `task.coordinate` | Sync with others                     |
| admin      | `task.admin`      | Administrative housekeeping          |
| plan       | `task.plan`       | Strategic thinking and planning      |

#### 4 Specializations (v1)

| Type Key                  | Parent            | Use Case               |
| ------------------------- | ----------------- | ---------------------- |
| `task.coordinate.meeting` | `task.coordinate` | Scheduled meetings     |
| `task.coordinate.standup` | `task.coordinate` | Daily syncs            |
| `task.execute.deploy`     | `task.execute`    | Production deployments |
| `task.execute.checklist`  | `task.execute`    | Process-based tasks    |

**Regex**: `/^task\.[a-z_]+(\.[a-z_]+)?$/`

---

### Plans (`plan.*`)

**Format**: `plan.{family}[.{variant}]`

#### Families

| Family   | Abstract Base        | Description                        |
| -------- | -------------------- | ---------------------------------- |
| timebox  | `plan.timebox.base`  | Short, fixed time windows          |
| pipeline | `plan.pipeline.base` | Stage-based funnels/Kanban         |
| campaign | `plan.campaign.base` | Multi-channel pushes over a period |
| roadmap  | `plan.roadmap.base`  | Long-term directional plans        |
| process  | `plan.process.base`  | Repeatable internal processes      |
| phase    | `plan.phase.base`    | Large phases inside a project      |

#### Concrete Templates

**Timeboxed Plans**

| Type Key                   | Description         |
| -------------------------- | ------------------- |
| `plan.timebox.sprint`      | 1-4 week dev sprint |
| `plan.timebox.weekly`      | Weekly plan         |
| `plan.timebox.daily_focus` | Daily focus plan    |

**Pipeline Plans**

| Type Key                | Description                     |
| ----------------------- | ------------------------------- |
| `plan.pipeline.sales`   | leads → opps → closed           |
| `plan.pipeline.content` | idea → draft → edit → published |
| `plan.pipeline.feature` | backlog → in_progress → done    |

**Campaign Plans**

| Type Key                         | Description        |
| -------------------------------- | ------------------ |
| `plan.campaign.marketing`        | Marketing campaign |
| `plan.campaign.product_launch`   | Launch campaign    |
| `plan.campaign.content_calendar` | Editorial calendar |

**Roadmap Plans**

| Type Key                | Description                      |
| ----------------------- | -------------------------------- |
| `plan.roadmap.product`  | Product roadmap (quarters/epics) |
| `plan.roadmap.strategy` | Business/strategy roadmap        |

**Process Plans**

| Type Key                         | Description         |
| -------------------------------- | ------------------- |
| `plan.process.client_onboarding` | Client onboarding   |
| `plan.process.support_runbook`   | Support/ops process |
| `plan.process.hiring_pipeline`   | Hiring process      |

**Phase Plans**

| Type Key               | Description             |
| ---------------------- | ----------------------- |
| `plan.phase.project`   | Generic project phase   |
| `plan.phase.discovery` | Discovery phase         |
| `plan.phase.execution` | Execution phase         |
| `plan.phase.migration` | Migration/cutover phase |

**Regex**: `/^plan\.[a-z_]+(\.[a-z_]+)?$/`

---

### Goals (`goal.*`)

**Format**: `goal.{family}[.{variant}]`

#### Families

| Family   | Abstract Base        | Measurement             |
| -------- | -------------------- | ----------------------- |
| outcome  | `goal.outcome.base`  | Binary completion       |
| metric   | `goal.metric.base`   | Numeric/quantitative    |
| behavior | `goal.behavior.base` | Frequency & consistency |
| learning | `goal.learning.base` | Skill level progression |

#### Concrete Templates

| Type Key                 | Description                           |
| ------------------------ | ------------------------------------- |
| `goal.outcome.project`   | "Launch v1", "Publish book"           |
| `goal.outcome.milestone` | Intermediate project milestone        |
| `goal.metric.usage`      | MAU, DAU, retention                   |
| `goal.metric.revenue`    | MRR, ARR, GMV                         |
| `goal.behavior.cadence`  | "post 3x/week", "call 5/day"          |
| `goal.behavior.routine`  | Morning routine / weekly review       |
| `goal.learning.skill`    | "learn React", "learn copywriting"    |
| `goal.learning.domain`   | "understand ICP", "understand market" |

**Regex**: `/^goal\.[a-z_]+(\.[a-z_]+)?$/`

---

### Documents (`document.*`)

**Format**: `document.{family}[.{variant}]`

#### Families

| Family    | Abstract Base             | Purpose                          |
| --------- | ------------------------- | -------------------------------- |
| context   | `document.context.base`   | Big picture, intent, constraints |
| knowledge | `document.knowledge.base` | Research, findings, raw learning |
| decision  | `document.decision.base`  | Decisions and commitments        |
| spec      | `document.spec.base`      | Formalized "what/how"            |
| reference | `document.reference.base` | Reusable guides / handbooks      |
| intake    | `document.intake.base`    | Information gathered at start    |

#### Concrete Templates

**Context Documents**

| Type Key                   | Description               |
| -------------------------- | ------------------------- |
| `document.context.project` | Canonical project context |
| `document.context.brief`   | Short creative brief      |

**Knowledge Documents**

| Type Key                             | Description            |
| ------------------------------------ | ---------------------- |
| `document.knowledge.research`        | General research notes |
| `document.knowledge.market_research` | Market/ICP research    |
| `document.knowledge.user_research`   | User interviews        |
| `document.knowledge.brain_dump`      | Semi-structured dumps  |

**Decision Documents**

| Type Key                              | Description         |
| ------------------------------------- | ------------------- |
| `document.decision.meeting_notes`     | Meeting notes       |
| `document.decision.rfc`               | Request for comment |
| `document.decision.proposal.client`   | Client proposal     |
| `document.decision.proposal.investor` | Investor proposal   |

**Spec Documents**

| Type Key                    | Description            |
| --------------------------- | ---------------------- |
| `document.spec.product`     | Product spec           |
| `document.spec.technical`   | Technical/architecture |
| `document.spec.requirement` | Requirements doc       |

**Reference Documents**

| Type Key                       | Description             |
| ------------------------------ | ----------------------- |
| `document.reference.handbook`  | Handbook / playbook     |
| `document.reference.sop`       | Standard operating proc |
| `document.reference.checklist` | Reusable checklist      |

**Intake Documents**

| Type Key                  | Description             |
| ------------------------- | ----------------------- |
| `document.intake.client`  | Client intake/discovery |
| `document.intake.user`    | User intake/onboarding  |
| `document.intake.project` | Project intake form     |

**Regex**: `/^document\.[a-z_]+(\.[a-z_]+)?$/`

---

### Outputs (`output.*`)

**Format**: `output.{family}[.{variant}]`

#### Families (Content Modality)

| Family      | Abstract Base             | Description               |
| ----------- | ------------------------- | ------------------------- |
| written     | `output.written.base`     | Long-form text, writing   |
| media       | `output.media.base`       | Visual/audio/video        |
| software    | `output.software.base`    | Code, releases, APIs      |
| operational | `output.operational.base` | Business/ops deliverables |

#### Concrete Templates

**Written Outputs**

| Type Key                    | Description              |
| --------------------------- | ------------------------ |
| `output.written.chapter`    | Book chapter             |
| `output.written.article`    | Article / essay          |
| `output.written.blog_post`  | Blog post                |
| `output.written.case_study` | Case study               |
| `output.written.whitepaper` | Technical whitepaper     |
| `output.written.newsletter` | Newsletter edition       |
| `output.written.sales_page` | Sales/landing page       |
| `output.written.script`     | Script for video/podcast |

**Media Outputs**

| Type Key                     | Description         |
| ---------------------------- | ------------------- |
| `output.media.design_mockup` | Design mockup/Figma |
| `output.media.slide_deck`    | Presentation deck   |
| `output.media.video`         | Produced video      |
| `output.media.audio`         | Podcast/audio asset |
| `output.media.asset_pack`    | Icon sets, banners  |

**Software Outputs**

| Type Key                      | Description          |
| ----------------------------- | -------------------- |
| `output.software.feature`     | Shipped feature      |
| `output.software.release`     | Versioned release    |
| `output.software.api`         | API surface          |
| `output.software.integration` | External integration |

**Operational Outputs**

| Type Key                       | Description             |
| ------------------------------ | ----------------------- |
| `output.operational.report`    | Report                  |
| `output.operational.dashboard` | Live dashboard          |
| `output.operational.contract`  | Signed contract         |
| `output.operational.playbook`  | Implementation playbook |

**Regex**: `/^output\.[a-z_]+(\.[a-z_]+)?$/`

---

### Risks (`risk.*`)

**Format**: `risk.{family}[.{variant}]`

#### Families

| Family    | Abstract Base         | Category                    |
| --------- | --------------------- | --------------------------- |
| technical | `risk.technical.base` | Tech/architecture, security |
| schedule  | `risk.schedule.base`  | Timing & deadlines          |
| resource  | `risk.resource.base`  | People, skills, bandwidth   |
| budget    | `risk.budget.base`    | Money-related               |
| scope     | `risk.scope.base`     | Scope creep & ambiguity     |
| external  | `risk.external.base`  | Market, regulatory, vendor  |
| quality   | `risk.quality.base`   | Bugs, UX, performance       |

#### Concrete Templates

| Type Key                     | Description              |
| ---------------------------- | ------------------------ |
| `risk.technical.security`    | Security-specific        |
| `risk.technical.scalability` | Scalability/performance  |
| `risk.schedule.dependency`   | Timing from dependencies |
| `risk.schedule.deadline`     | Hard deadline risk       |
| `risk.resource.headcount`    | Not enough people        |
| `risk.resource.skill_gap`    | Missing expertise        |
| `risk.budget.overrun`        | Budget overrun           |
| `risk.external.regulatory`   | Laws/compliance          |
| `risk.external.market_shift` | Macro/competitor-based   |
| `risk.quality.defects`       | High defect rate         |
| `risk.quality.usability`     | UX/adoption risk         |

**Regex**: `/^risk\.[a-z_]+(\.[a-z_]+)?$/`

---

### Events (`event.*`)

**Format**: `event.{family}[.{variant}]`

#### Families

| Family | Abstract Base       | Description                   |
| ------ | ------------------- | ----------------------------- |
| work   | `event.work.base`   | Individual work sessions      |
| collab | `event.collab.base` | Coordination with others      |
| marker | `event.marker.base` | Deadlines, reminders, markers |

#### Concrete Templates

**Work Events**

| Type Key                 | Description           |
| ------------------------ | --------------------- |
| `event.work.focus_block` | Deep work focus block |
| `event.work.time_block`  | Generic working block |
| `event.work.buffer`      | Buffer time           |

**Collaboration Events**

| Type Key                          | Description           |
| --------------------------------- | --------------------- |
| `event.collab.meeting.base`       | Abstract meeting      |
| `event.collab.meeting.one_on_one` | 1:1 meeting           |
| `event.collab.meeting.standup`    | Daily standup         |
| `event.collab.meeting.review`     | Review session        |
| `event.collab.meeting.workshop`   | Workshop session      |
| `event.collab.meeting.client`     | Client-facing meeting |
| `event.collab.meeting.internal`   | Internal team meeting |

**Marker Events**

| Type Key                     | Description   |
| ---------------------------- | ------------- |
| `event.marker.deadline`      | Deadline      |
| `event.marker.reminder`      | Reminder ping |
| `event.marker.out_of_office` | OOO block     |
| `event.marker.travel`        | Travel block  |
| `event.marker.hold`          | Calendar hold |

**Regex**: `/^event\.[a-z_]+(\.[a-z_]+)?$/`

---

### Requirements (`requirement.*`)

**Format**: `requirement.{type}[.{category}]`

| Type Key                     | Focus                 |
| ---------------------------- | --------------------- |
| `requirement.base`           | Abstract base         |
| `requirement.functional`     | What it does          |
| `requirement.non_functional` | How it performs       |
| `requirement.constraint`     | Limitations           |
| `requirement.assumption`     | Working assumptions   |
| `requirement.dependency`     | External dependencies |

**Regex**: `/^requirement\.[a-z_]+(\.[a-z_]+)?$/`

---

## Validation Summary

### All Regex Patterns

```typescript
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

// General pattern for all type_keys
const GENERAL_TYPE_KEY_PATTERN = /^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/;
```

---

## Related Documentation

- **[NAMING_CONVENTIONS.md](./NAMING_CONVENTIONS.md)** - Complete naming reference with usage guidelines
- **[TYPE_KEY_TAXONOMY.md](./TYPE_KEY_TAXONOMY.md)** - Architecture rationale and decision framework
- **[DATA_MODELS.md](./DATA_MODELS.md)** - Complete database schema
- **[API_ENDPOINTS.md](./API_ENDPOINTS.md)** - API reference with examples

---

## Changelog

### December 1, 2025

- Initial creation of canonical namespace reference
- Added all families and variants for plans, goals, documents, outputs, risks, and events
- Added validation regex patterns for all scopes
- Added abstract base template documentation
