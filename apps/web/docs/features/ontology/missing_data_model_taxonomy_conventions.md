<!-- apps/web/docs/features/ontology/missing_data_model_taxonomy_conventions.md -->

Love this direction — you’re basically giving yourself a mini “type system” inside the type_key.

Below is an updated **master namespace doc** that bakes in your feedback:

- Consistent pattern: **`{data_type}.{family}[.{variant}]`**
- Explicit **meta families** so you can do queries like `output.written.%`, `event.collab.%`, `document.knowledge.%`, etc.
- Uses `*.base` for abstract roots.

You can drop this into something like `ONTOLOGY_NAMESPACES_CORE.md`.

---

# Core Ontology Namespaces

_Plans, Goals, Documents, Outputs, Risks, Events_

**Pattern:**
All autonomous entities use:

```text
{data_type}.{family}[.{variant}]
```

- `data_type` ∈ `plan`, `goal`, `document`, `output`, `risk`, `event`
- `family` = meta-category you want to query by (e.g. `written`, `context`, `timebox`, `collab`)
- `variant` = specific template within the family (e.g. `sprint`, `article`, `meeting.one_on_one`)

Abstract bases follow:

```text
{data_type}.base            # root abstract type for that data_type
{data_type}.{family}.base   # abstract type for that family
```

---

## 1. Plans (`plan.*`)

### 1.1 Purpose

Plans organize tasks across time/structure:

- Align to **goals**
- Provide **cadence & scope**
- Attach to **events** (calendar) and **tasks**

### 1.2 Namespace Pattern

```text
plan.{family}[.{variant}]
```

**Families (meta types):**

- `plan.timebox` – short, fixed time windows
- `plan.pipeline` – stage-based funnels/Kanban
- `plan.campaign` – multi-channel pushes over a period
- `plan.roadmap` – long-term directional plans
- `plan.process` – repeatable internal processes
- `plan.phase` – large phases inside a project

**Abstract roots:**

- `plan.base` – root, not instantiable
- `plan.timebox.base`
- `plan.pipeline.base`
- `plan.campaign.base`
- `plan.roadmap.base`
- `plan.process.base`
- `plan.phase.base`

### 1.3 Concrete Plan Templates

#### Timeboxed Plans

```text
plan.timebox.sprint          # 1–4 week dev sprint
plan.timebox.weekly          # weekly plan
plan.timebox.daily_focus     # (optional) daily focus plan
```

#### Pipeline Plans

```text
plan.pipeline.sales          # leads → opps → closed
plan.pipeline.content        # idea → draft → edit → published
plan.pipeline.feature        # backlog → in_progress → done
```

#### Campaign Plans

```text
plan.campaign.marketing      # marketing campaign (multi-channel)
plan.campaign.product_launch # launch campaign
plan.campaign.content_calendar  # editorial calendar (your existing one)
```

_(You can decide if `content_calendar` lives under `campaign` or as its own family; above keeps it under campaign.)_

#### Roadmap Plans

```text
plan.roadmap.product         # product roadmap (quarters / epics)
plan.roadmap.strategy        # business/strategy roadmap
```

#### Process Plans

```text
plan.process.client_onboarding  # client onboarding
plan.process.support_runbook    # support / ops process
plan.process.hiring_pipeline    # hiring process
```

#### Phase Plans

```text
plan.phase.project             # generic project phase
plan.phase.discovery           # discovery phase
plan.phase.execution           # execution phase
plan.phase.migration           # migration / cutover phase
```

> Query examples:
>
> - “All timeboxed plans”: `WHERE type_key LIKE 'plan.timebox.%'`
> - “All campaign-like plans”: `WHERE type_key LIKE 'plan.campaign.%'`

---

## 2. Goals (`goal.*`)

Goals already had a clean taxonomy; we’ll just express it in the same `family/variant` language.

### 2.1 Purpose

Goals define **what success looks like**:

- What must be **true**?
- What must we **hit** (numbers, habits, skills)?

### 2.2 Namespace Pattern

```text
goal.{family}[.{variant}]
```

**Families:**

- `goal.outcome` – discrete “done/not done” results
- `goal.metric` – numeric/quantitative targets
- `goal.behavior` – habits and recurring actions
- `goal.learning` – skills/knowledge to acquire

**Abstract roots:**

- `goal.base`
- `goal.outcome.base`
- `goal.metric.base`
- `goal.behavior.base`
- `goal.learning.base`

### 2.3 Concrete Goal Templates

```text
goal.outcome.project         # “Launch v1”, “Publish book”
goal.outcome.milestone       # intermediate project milestone
goal.metric.usage            # MAU, DAU, retention
goal.metric.revenue          # MRR, ARR, GMV
goal.behavior.cadence        # “post 3x/week”, “call 5 prospects/day”
goal.behavior.routine        # morning routine / weekly review
goal.learning.skill          # “learn React”, “learn copywriting”
goal.learning.domain         # “understand ICP”, “understand competitor landscape”
```

> Query example: all habit-like goals: `goal.behavior.%`

---

## 3. Documents (`document.*`)

You’re right: the key is to define **core document families** that are domain-agnostic and cross-project.

### 3.1 Purpose

Documents are **project memory**:

- Context & narrative
- Knowledge & evidence
- Decisions & specifications
- Reusable references

### 3.2 Core Families

We’ll formalize the triad you liked and extend it:

- `document.context` – big picture, intent, constraints
- `document.knowledge` – research, findings, raw learning
- `document.decision` – decisions and commitments
- `document.spec` – formalized “what/how” (requirements, specs)
- `document.reference` – reusable guides / handbooks
- `document.intake` – information gathered at the start of a relationship/project

**Abstract roots:**

```text
document.base
document.context.base
document.knowledge.base
document.decision.base
document.spec.base
document.reference.base
document.intake.base
```

### 3.3 Concrete Document Templates

#### Context Documents

```text
document.context.project      # canonical project context (your existing doc)
document.context.brief        # short creative brief / one-pager
```

#### Knowledge Documents

```text
document.knowledge.research          # general research notes
document.knowledge.market_research   # market/ICP specific research
document.knowledge.user_research     # user interviews, surveys
document.knowledge.brain_dump        # semi-structured brain dumps
```

#### Decision Documents

```text
document.decision.meeting_notes      # meeting notes + decisions
document.decision.rfc                # request for comment / design decision doc
document.decision.proposal.client    # proposal sent to client
document.decision.proposal.investor  # investor pitch/proposal
```

#### Spec Documents

```text
document.spec.product                # product spec
document.spec.technical              # technical/architecture spec
document.spec.requirement            # requirements doc (ties to requirement.*)
```

#### Reference Documents

```text
document.reference.handbook          # handbook / playbook
document.reference.sop               # standard operating procedure
document.reference.checklist         # reusable procedural checklist
```

#### Intake Documents

```text
document.intake.client               # client intake / discovery form
document.intake.user                 # user intake / onboarding form
document.intake.project              # project intake questionnaire
```

> Query example: all “knowledge” docs across projects:
> `WHERE type_key LIKE 'document.knowledge.%'`

---

## 4. Outputs (`output.*`)

You explicitly want to query “all written outputs”, “all media outputs”, etc. So the **family segment becomes the content modality**.

### 4.1 Purpose

Outputs are **the deliverables** a project produces.

### 4.2 Core Families

- `output.written` – long-form text, structured writing
- `output.media` – visual/audio/video artifacts
- `output.software` – code, releases, APIs
- `output.operational` – business/ops deliverables (reports, contracts, dashboards)

**Abstract roots:**

```text
output.base
output.written.base
output.media.base
output.software.base
output.operational.base
```

### 4.3 Concrete Output Templates

#### Written Outputs

```text
output.written.chapter          # book chapter
output.written.article          # article / essay
output.written.blog_post        # blog post
output.written.case_study       # case study
output.written.whitepaper       # technical/analysis whitepaper
output.written.newsletter       # newsletter edition
output.written.sales_page       # sales/landing page
output.written.script           # script for video/podcast
```

#### Media Outputs

```text
output.media.design_mockup      # design mockup / Figma frame
output.media.slide_deck         # presentation deck
output.media.video              # produced video
output.media.audio              # podcast / audio asset
output.media.asset_pack         # icon sets, banners, etc.
```

#### Software Outputs

```text
output.software.feature         # shipped feature
output.software.release         # versioned release
output.software.api             # API surface / endpoint bundle
output.software.integration     # integration with external service
```

#### Operational Outputs

```text
output.operational.report       # recurring or ad-hoc report
output.operational.dashboard    # live dashboard
output.operational.contract     # signed contract / agreement
output.operational.playbook     # implementation playbook for a client
```

> Query examples:
>
> - “All written outputs for this client”: `output.written.%` + filter by project/client facet
> - “All dashboards we produced”: `output.operational.dashboard`

---

## 5. Risks (`risk.*`)

You like the existing risk categories; we’ll keep them and just treat each as a **family** that can have variants.

### 5.1 Purpose

Risks track **potential negative outcomes** and mitigation.

### 5.2 Core Families

- `risk.technical` – tech/architecture feasibility, security, reliability
- `risk.schedule` – timing & deadlines
- `risk.resource` – people, skills, bandwidth
- `risk.budget` – money-related
- `risk.scope` – scope creep & ambiguity
- `risk.external` – market, regulatory, vendor
- `risk.quality` – bugs, UX, performance issues

**Abstract roots:**

```text
risk.base
risk.technical.base
risk.schedule.base
risk.resource.base
risk.budget.base
risk.scope.base
risk.external.base
risk.quality.base
```

### 5.3 Example Variants

You don’t have to define these all now, but the pattern is ready:

```text
risk.technical.security         # security-specific technical risk
risk.technical.scalability      # scalability / performance
risk.schedule.dependency        # timing risk from dependencies
risk.schedule.deadline          # hard deadline risk
risk.resource.headcount         # not enough people
risk.resource.skill_gap         # missing expertise
risk.budget.overrun             # budget overrun
risk.external.regulatory        # laws / compliance
risk.external.market_shift      # macro or competitor-based
risk.quality.defects            # high defect rate risk
risk.quality.usability          # UX / adoption risk
```

> Query examples:
>
> - All technical risks: `risk.technical.%`
> - All schedule-related risks: `risk.schedule.%`

---

## 6. Events (`event.*`)

You liked the concept: work sessions, collaboration, markers. We’ll encode those as families.

### 6.1 Purpose

Events are **calendar-bound time slots**: when something happens.

### 6.2 Core Families

- `event.work` – individual work sessions / focus time
- `event.collab` – coordination with others
- `event.marker` – deadlines, reminders, status markers

**Abstract roots:**

```text
event.base
event.work.base
event.collab.base
event.marker.base
```

### 6.3 Concrete Event Templates

#### Work Events

```text
event.work.focus_block        # deep work focus block
event.work.time_block         # generic working block
event.work.buffer             # buffer time between sessions
```

#### Collaboration Events

```text
event.collab.meeting.base     # abstract meeting
event.collab.meeting.one_on_one
event.collab.meeting.standup
event.collab.meeting.review       # design/code/plan review
event.collab.meeting.workshop     # longer collaborative session
event.collab.meeting.client       # client-facing meeting
event.collab.meeting.internal     # internal team meeting
```

#### Marker Events

```text
event.marker.deadline         # deadline reflected on calendar
event.marker.reminder         # short reminder ping
event.marker.out_of_office    # OOO block
event.marker.travel           # travel block
event.marker.hold             # calendar hold / tentative slot
```

> Query examples:
>
> - All collaboration events: `event.collab.%`
> - All work sessions (for focus analytics): `event.work.%`

---

## 7. Cross-Cutting Query Patterns

Because you’ve committed to **`{data_type}.{family}[.{variant}]`**, you get:

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
  AND start_at <  $week_end;

-- All technical risks across all projects
SELECT * FROM onto_risks
WHERE type_key LIKE 'risk.technical.%';
```

---

If you want, next step I can:

- Turn this into a **seed JSON** for `onto_templates` (one entry per `*.base` and concrete template), or
- Sketch how agents should **infer type_key** from natural language (e.g., “write chapter 3” → `output.written.chapter` + `task.create`).
