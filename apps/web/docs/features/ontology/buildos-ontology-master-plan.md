<!-- apps/web/docs/features/ontology/buildos-ontology-master-plan.md -->

# BuildOS Ontology Master Plan — AI‑Assisted Project Creation (v3.1 - Simplified)

> Purpose: Hand this to an "Implementer Agent" to iteratively ship the ontology layer with **simplified 3-facet metadata system**, migrations, seeding, minimal UI, AI‑assisted project/template creation, FSM actions, and lineage — all on Supabase/Postgres.

---

## -1) Vision & Glossary (feed this to any AI collaborator)

### Vision (one paragraph)

BuildOS turns any free‑form brain‑dump into a **structured, auditable project** using a compact **ontology** (Projects, Plans, Tasks, Deliverables, Documents), **typed Templates**, and **Finite State Machines (FSMs)**. Projects are categorized using a **simple human-readable type_key** (`writer.book`, `coach.client`) enhanced by **3 orthogonal facets** (context, scale, stage) that capture truly instance-specific dimensions. The AI proposes **configuration** (ProjectSpec, TemplateSpec, FSMDef); the **server validates and executes** transitions and actions. Result: creators and project people — from writers and coaches to students and solopreneurs — ship faster, with clear provenance, consistent UI, and safe automations.

### Product thesis

- **Type-first, not taxonomy-first:** The `type_key` (`writer.book`) is the primary identifier, carrying domain semantics naturally.
- **Facets for orthogonal dimensions:** Only 3 facets (context, scale, stage) that genuinely vary per instance.
- **Configuration over code:** New verticals = data (templates + FSM), not deployments.
- **Template metadata for discovery:** Domain info (realm, output_type) lives in template metadata for analytics/discovery, not as instance facets.
- **Explainable AI:** Every output has lineage and a readable state diagram.
- **Frictionless start:** Brain‑dump → clarifications → working project in minutes.

### Success criteria

- TTFP (time‑to‑first‑project) < 2 minutes.
- ≥60% of projects execute ≥1 FSM transition within 24h.
- Zero unsafe side‑effects from actions (idempotent + permissioned).
- Users understand facet system immediately (3 simple dimensions).

### Non‑goals (v1)

- No deep graph analytics (centrality, path finding) beyond 1–3 hops.
- No arbitrary codegen by AI (AI produces **data**, not server code).
- No custom facets (v1 uses 3 predefined facets only).
- No cross-entity facet bridge (removed for simplicity).

### Key Terms (canonical)

- **Ontology:** The minimal set of **entities** (Project, Plan, Task, Deliverable, Document, Source, Metric, Milestone, Risk, Decision, Actor, Tool) and the **relationships** between them. Meaning is created by **type_key**, **facets**, and **edges**.

- **type_key:** Lower‑case dot path naming a domain type. Format: `{domain}.{deliverable}` or optionally `{domain}.{deliverable}.{variant}` for specialized templates. Examples: `writer.book`, `coach.client`, `developer.app`, `writer.book.fiction`. The type_key:
    - Selects the template (schema, FSM, defaults)
    - Implies domain context (a `writer.book` is creative work producing content)
    - Is human-readable and memorable
    - Should be specific enough to be useful but general enough to be reusable

- **type_key Conventions:** (See [Type Key Taxonomy](./TYPE_KEY_TAXONOMY.md) for complete architectural framework)
    - **Domain** = the role/actor perspective (writer, coach, developer, founder, student, personal)
    - **Deliverable** = the primary output or relationship (book, client, app, startup, goal, routine)
    - **Variant** (optional) = specialization (writer.book.fiction, coach.client.executive)
    - Use underscores for multi-word components: `personal.morning_routine`
    - Keep it concise: 2-3 levels max
    - Never use hyphens or camelCase

- **Facets (3 only):** Orthogonal dimensions that genuinely vary per instance:
    1. **context** — organizational setting (personal, client, commercial, startup, etc.)
    2. **scale** — size/duration (micro, small, medium, large, epic)
    3. **stage** — lifecycle phase (discovery, planning, execution, launch, maintenance, complete)

- **Template Metadata (not facets):** Templates include `metadata` field with domain info for discovery/analytics:
    - `realm` — domain category (creative, technical, business, service, etc.) — informational only
    - `output_type` — deliverable nature (software, content, service, knowledge, etc.) — informational only
    - `typical_scale` — suggested scale hint for AI

- **Multi-type support:** Projects can have multiple `type_key` values via the `also_types` array, reflecting the multi-role nature of real work (e.g., a solopreneur project might be both `founder.startup` and `developer.app`).

- **Template:** A versioned, typed blueprint for a scope (`project|plan|task|deliverable|document`) containing `schema` (JSON Schema for props), `fsm` (FSMDef JSON), `default_props`, `default_views`, `facet_defaults`, and `metadata`. Supports inheritance via `parent_template_id`.

- **FSM (Finite State Machine):** A declarative config with **states**, **transitions** (events from→to), **guards** (pre‑checks), and **actions** (side‑effects). Executed by the server's FSM engine.

- **ProjectSpec:** A single JSON payload that describes the initial graph to instantiate (project + goals/plans/tasks/deliverables/docs + facets), plus optional draft FSM/Template definitions and clarifying questions.

- **TemplateSpec:** JSON describing a new or variant template, its FSM, facet defaults, and metadata. Saved as `draft` until promoted. Can inherit from parent template.

- **Action primitive:** A safe, idempotent operation the FSM engine can perform (e.g., `spawn_tasks`, `notify`, `email_user`).

- **Provenance:** Metadata that records why/how an artifact was produced (inputs, prompts, tool calls, derived‑from edges).

- **Lineage:** Graph links that let you trace any version back to its sources and tasks.

---

## 0) Executive Summary

- **Vision:** Any brain‑dump → structured project using a compact ontology (Projects, Plans, Tasks, Deliverables, Docs), **typed Templates with simplified 3-facet metadata**, and **FSMs** (finite state machines) with strict server validation.

- **Key insight:** `type_key` already carries domain semantics (`writer.book` is obviously creative content work). Only add facets for dimensions that **genuinely vary per instance**: context (who it's for), scale (how big), and stage (lifecycle phase).

- **Simplicity wins:** 3 facets instead of 5. No redundant data. Template metadata (realm, output_type) used for discovery/analytics without polluting instance data.

- **The AI proposes configuration** (ProjectSpec, TemplateSpec, FSMDef, facet assignments). The **server is authoritative** (validates, executes, persists).

- **Outcome:** A small UI where you can (1) create/inspect projects with simple faceted filtering, (2) chat with an agent to create a new project type & project, and (3) define templates/FSMs with versioning, inheritance, and lineage.

---

## 1) Data Model — Minimal Contract (Postgres, schema `onto`)

> The ontology lives in the `onto` schema. Entities are rows; meaning is bound by `type_key` + 3 facets + Template schema.

### 1.1 Entities (primitives)

- **Project**: container for a bounded initiative. Fields: `id, org_id?, name, description?, type_key, also_types[], state_key, props, facet_context, facet_scale, facet_stage (generated columns), start_at?, end_at?, context_document_id?, created_by, created_at, updated_at`.

- **Plan**: structured approach/workstream. Fields: `project_id, name, type_key, state_key, props, facet_context, facet_scale, facet_stage (generated columns)`.

- **Task**: smallest work unit. Fields: `project_id, plan_id?, title, state_key, priority?, due_at?, props, facet_scale (generated)`.

- **Deliverable**: tangible output; versioned. Fields: `project_id, name, type_key, state_key, props, facet_stage (generated)` + `deliverable_versions(number, storage_uri, props)`.

- **Document**: notes/briefs; versioned with embeddings. Fields: `project_id, title, type_key, props` + `document_versions(number, storage_uri, embedding?, props)`.

- **Edge**: typed relationships (`src_kind,id` → `rel` → `dst_kind,id`).

- **Template**: registry rows with `scope, type_key, schema, fsm, default_props, default_views, facet_defaults, metadata (stores realm/output_type), parent_template_id?, is_abstract?, status`.

- **Facet Definitions**: taxonomy of available facets (`key, name, allowed_values, applies_to`) — **3 facets only**.

- **Facet Values**: rich metadata for each facet value (label, description, color, icon, sort_order).

- **Actor/Tool**: provenance and assignments.

### 1.2 Type Key System — The Primary Identifier

**Philosophy:** The `type_key` is the main way to identify and categorize work. It should be:

- **Descriptive:** immediately understandable
- **Specific:** enough to be useful (not too generic)
- **Reusable:** general enough for multiple instances
- **Perspective-based:** reflects the actor's relationship to the work

**Format:** `{domain}.{deliverable}[.{variant}]`

**Domain Selection (who/role):**

- Use the **actor's perspective**: `writer.book` (I'm the writer) not `book.writing`
- Common domains: writer, coach, developer, designer, founder, student, personal, consultant, researcher, educator, marketer

**Deliverable Selection (what/output):**

- The primary thing being created or managed
- Examples: book, article, client, app, feature, startup, product, assignment, goal, routine

**Variant Selection (optional specialization):**

- Use when you need distinct schemas/FSMs for subtypes
- Examples: `writer.book.fiction` vs `writer.book.nonfiction`, `coach.client.executive` vs `coach.client.wellness`

**Type Key Examples by User Type:**

```
Writers:
- writer.book (novels, non-fiction)
- writer.book.fiction (specialized for fiction)
- writer.article (journalism, essays)
- writer.blog (blog content)
- writer.screenplay (scripts)

Coaches:
- coach.client (1:1 coaching)
- coach.program (group coaching)
- coach.workshop (single event)

Developers:
- developer.app (full application)
- developer.feature (single feature)
- developer.library (code library)
- developer.infrastructure (DevOps work)

Founders:
- founder.startup (company creation)
- founder.product (product launch)
- founder.fundraise (funding round)

Students:
- student.assignment (homework)
- student.project (term project)
- student.thesis (capstone work)
- student.application (college apps)

Personal:
- personal.goal (personal objectives)
- personal.routine (habit building)
- personal.event (trip, wedding, etc.)
- personal.learning (skill acquisition)
```

**Anti-patterns (avoid these):**

```
❌ book.writer (backwards perspective)
❌ writeBook (camelCase)
❌ write-book (hyphens)
❌ writer_book (underscores for main separator)
❌ writer (too vague - deliverable missing)
❌ writer.fiction.book.young_adult (too many levels)
```

**Decision tree for type_key:**

1. Who is doing this work? → domain
2. What's the primary deliverable? → deliverable
3. Does it need a specialized schema/FSM? → add variant
4. Can multiple projects share this type_key? → if no, it's too specific

### 1.3 Simplified Faceted Metadata System (3 Facets Only)

**Philosophy:** Keep primary `type_key` simple and descriptive. Add facets ONLY for dimensions that **genuinely vary per instance** of the same type.

**The 3 Facets:**

1. **context** — Work context and organizational setting
    - **Why it's a facet:** Same type_key can be personal OR client OR commercial
    - **Values:** personal, client, commercial, internal, open_source, community, academic, nonprofit, startup
    - **Applies to:** project, plan
    - **Example:** `writer.book` could be personal passion project OR commercial publishing deal

2. **scale** — Project size and typical duration
    - **Why it's a facet:** Same type_key can range from micro to epic
    - **Values:** micro (<1 week), small (1-4 weeks), medium (1-3 months), large (3-12 months), epic (>1 year)
    - **Applies to:** project, plan, task
    - **Example:** `developer.feature` could be micro (UI tweak) OR medium (major feature)

3. **stage** — Current phase in project lifecycle
    - **Why it's a facet:** Changes over time as project progresses
    - **Values:** discovery, planning, execution, launch, maintenance, complete
    - **Applies to:** project, plan, deliverable
    - **Example:** `founder.startup` moves through all stages over time

**What's NOT a facet (moved to template metadata):**

- **realm** (creative, technical, business, service, etc.) — already implied by `type_key`
    - `writer.book` → obviously creative
    - `developer.app` → obviously technical
    - `coach.client` → obviously service
    - Stored in `templates.metadata.realm` for discovery/analytics

- **output_type** (software, content, service, etc.) — already implied by `type_key`
    - `writer.book` → obviously content
    - `developer.app` → obviously software
    - `coach.client` → obviously service
    - Stored in `templates.metadata.output_type` for discovery/analytics

**Storage Strategy:**

- **Layer 1 (Taxonomy):** `onto.facet_definitions` and `onto.facet_values` define 3 facets
- **Layer 2 (Template Defaults):** Templates suggest default facets via `facet_defaults` field
- **Layer 3 (Instance Values):** Entities store facets in `props.facets` with generated columns for query performance
- **Layer 4 (Template Metadata):** Templates store realm/output_type in `metadata` field (not as facets)

**Generated Columns:** For fast SQL queries without JSON parsing, entities have generated columns like `facet_context`, `facet_scale`, `facet_stage`, extracted from `props->'facets'`.

**Example Usage:**

```typescript
// Project with facets
{
  type_key: "writer.book",
  also_types: ["creator.product"],  // Multi-type support if self-publishing
  props: {
    facets: {
      context: "commercial",  // publishing deal (vs personal)
      scale: "large",         // full novel (vs short story)
      stage: "execution"      // actively writing
    },
    genre: "science fiction",
    target_word_count: 90000,
    publisher: "Random House"
  }
}

// Template (not instance)
{
  type_key: "writer.book",
  metadata: {
    realm: "creative",           // for template discovery
    output_type: "content",      // for analytics
    typical_scale: "large"       // AI hint
  },
  facet_defaults: {
    context: "personal",         // most books start personal
    scale: "large",              // novels are typically large
    stage: "planning"            // start in planning
  }
}
```

**Query Examples:**

```sql
-- Find commercial projects (facet query)
SELECT * FROM onto.projects WHERE facet_context = 'commercial';

-- Find large-scale work in execution (multi-facet)
SELECT * FROM onto.projects
WHERE facet_scale = 'large' AND facet_stage = 'execution';

-- Find creative templates (metadata query for discovery)
SELECT * FROM onto.templates
WHERE metadata->>'realm' = 'creative';

-- Multi-role projects (founder who's also a developer)
SELECT * FROM onto.projects
WHERE type_key = 'founder.startup' OR 'developer.app' = ANY(also_types);

-- All writer projects (type_key pattern)
SELECT * FROM onto.projects WHERE type_key LIKE 'writer.%';
```

### 1.4 Schemas & validation

- **JSON Schema** on every write to `props` for typed rows.
- **FSMDef** validated on template save (unique `(from,event)`, 3–6 states, valid guard/action refs).
- **Facet validation:** Values must exist in `onto.facet_values` for their respective keys.
- **Type key format:** Must match `^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$` (allows 2 or 3 levels for variants).

### 1.5 Template Inheritance

Templates can inherit from parent templates via `parent_template_id`:

```sql
-- Base template (abstract)
{
  type_key: "writer.book",
  is_abstract: true,
  metadata: { realm: "creative", output_type: "content" },
  facet_defaults: { context: "personal", scale: "large", stage: "planning" },
  schema: { properties: { target_word_count: { type: "number" } } }
}

-- Specialized template (inherits from writer.book)
{
  type_key: "writer.book.fiction",
  parent_template_id: "<uuid of writer.book>",
  metadata: { realm: "creative", output_type: "content" },
  facet_defaults: {
    context: "personal",
    scale: "large",
    stage: "planning"
  },
  schema: {
    // inherits target_word_count
    properties: {
      genre: { type: "string", enum: ["scifi", "fantasy", "thriller", "romance"] }
    }
  }
}
```

### 1.6 Versioning & lineage

- _Never overwrite_ versions; append to `*_versions`.
- Use `edges` for: `has_goal`, `has_plan`, `has_deliverable`, `has_document`, `has_milestone`, `produces`, `derived_from`, `inherits_from`.

### 1.7 Dates & authorship

- `created_at/updated_at` set by triggers; `created_by` references `onto.actors(id)` (human or agent). `start_at/end_at` optional.

### 1.8 DDL Requirements (from v2 migration)

The migration file includes:

- All entity tables with proper constraints and indexes
- **Simplified facet system tables** (3 facets only)
- Generated columns on projects, plans, tasks, deliverables for facet queries
- Multi-type support (`also_types` array column with GIN index)
- Template inheritance fields (`parent_template_id`, `is_abstract`)
- **Template metadata field** (JSONB for realm/output_type)
- Type key format validation constraint
- Comprehensive indexes for facets (partial indexes where not null)
- **Seeded templates** with real type_keys covering all major user types
- Seed data for 3 facets with UI metadata (colors, descriptions, sort_order)

---

## 2) Seeding Strategy — Templates & Type Keys

**Why Seed Templates:** Prove end‑to‑end paths and give users immediate examples. Every seeded template demonstrates a pattern users can copy.

### 2.1 Seeding Philosophy

1. **Cover major user personas:** writer, coach, developer, founder, student, personal
2. **Show variety in each domain:** at least 2 templates per major domain
3. **Demonstrate inheritance:** include at least one parent-child template pair
4. **Real-world applicability:** each template should be immediately useful
5. **Complete FSMs:** every template has a working state machine
6. **Sensible defaults:** facet_defaults should reflect typical usage

### 2.2 Seeded Templates (24 total)

**Projects (16):**

- `writer.book` — Book Project (creative, personal/commercial, large)
- `writer.article` — Article/Essay (creative, client, small)
- `coach.client` — Coaching Client (service, client, medium)
- `coach.program` — Group Coaching Program (service, commercial, medium)
- `developer.app` — Application Development (technical, commercial, large)
- `developer.feature` — Feature Development (technical, internal, small)
- `founder.startup` — Startup Launch (business, startup, epic)
- `founder.product` — Product Launch (business, commercial, large)
- `student.assignment` — Assignment/Homework (education, academic, micro)
- `student.project` — Student Project (education, academic, medium)
- `personal.goal` — Personal Goal (personal_dev, personal, medium)
- `personal.routine` — Habit/Routine (personal_dev, personal, epic)
- Plus more for other domains as needed

**Plans (2):**

- `plan.weekly` — Weekly Plan (micro scale)
- `plan.sprint` — Sprint/2-week cycle (small scale)

**Deliverables (3):**

- `deliverable.chapter` — Book Chapter
- `deliverable.design` — Design Asset
- `deliverable.workout_plan` — Workout Plan

**Documents (3):**

- `doc.brief` — Project Brief
- `doc.notes` — Notes/Research
- `doc.intake` — Intake Form

### 2.3 Template Catalog Structure

Templates should be queryable for AI and UI:

```sql
-- Get all templates for project creation
SELECT type_key, name, metadata, facet_defaults
FROM onto.templates
WHERE scope = 'project' AND status = 'active'
ORDER BY metadata->>'realm', name;

-- Get templates by realm (for discovery)
SELECT type_key, name, description
FROM onto.templates
WHERE metadata->>'realm' = 'creative' AND scope = 'project';

-- Get templates for a specific domain pattern
SELECT * FROM onto.templates
WHERE type_key LIKE 'writer.%' AND status = 'active';
```

### 2.4 AI Agent Access to Templates

When the Intake Agent processes a brain-dump, it receives:

```typescript
// Template catalog snapshot
{
	templates: [
		{
			type_key: 'writer.book',
			name: 'Book Project',
			description: 'Long-form writing project like novels or non-fiction books',
			metadata: {
				realm: 'creative',
				output_type: 'content',
				typical_scale: 'large',
				keywords: ['writing', 'book', 'novel', 'author', 'manuscript']
			},
			facet_defaults: {
				context: 'personal',
				scale: 'large',
				stage: 'planning'
			}
		}
		// ... all other templates
	];
}
```

**Agent decision process:**

1. Parse brain-dump for domain signals (writing → writer, coaching → coach, etc.)
2. Match against template keywords and descriptions
3. Prefer existing templates over creating new ones
4. Suggest facet values based on brain-dump analysis
5. Create new template only if no good match exists

### 2.5 Example Seeded Project

After seeding templates, seed one complete example project:

```sql
-- "Coaching: Stacy" example
-- Demonstrates: coach.client template with all connected entities
```

Users can:

- Open it immediately
- See a working project structure
- Understand facets in context
- Test FSM transitions
- Use as reference for their own projects

---

## 3) Architecture — How pieces fit

### 3.1 Layers

- **Presentation (SvelteKit UI):** Brain‑dump creator, Project Home (Kanban + Pipeline with facet filters), Template/FSM Builder, Type Key Selector.

- **Application (Services):** Template Registry (with metadata search), Spec Service (includes facet suggestion), FSM Engine, Action Runner, Validation Gateways (including facet validation).

- **Domain (Ontology):** Entities in `onto.*` + Template/FSM definitions + Facet taxonomy (3 only).

- **Infrastructure:** Supabase Postgres (RLS), Storage (for versions), Email/Notifications connectors, LLM provider.

### 3.2 Data flow (happy path)

1. **User brain‑dump** → `/onto/specs/draft`.
2. **Intake Agent** proposes **ProjectSpec** (+ ≤3 clarifications) using **template catalog snapshot with metadata**.
3. User answers clarifications → `/onto/specs/patch`.
4. Server validates ProjectSpec (type_key format, facet values); **Instantiator** writes rows & edges → returns `project_id`.
5. UI renders boards from **FSM state**; actions invoke `/onto/fsm/transition`.
6. **Faceted filtering** allows quick navigation by context/scale/stage.

### 3.3 FSM execution model

- **Engine**: pure server module; loads the entity's template FSM by `type_key`.
- **Guards**: declarative ops (e.g., `has_property($.props.equipment)`, `facet_equals(context, 'client')`).
- **Actions**: run via **Action Runner** (idempotent, permission‑checked). No actions on creation; only on transitions.

### 3.4 Template governance

- Templates added as `status='draft'` (from AI or human). Used org‑locally until **promoted to `active`**.
- Templates can inherit from parents via `parent_template_id`; child templates extend/override parent properties.
- Version templates by row history (or explicit `version` field if needed later).

### 3.5 Facet Resolution

- **Template defaults:** When instantiating from template, apply `facet_defaults` to `props.facets`.
- **AI suggestion:** Intake Agent suggests facets based on brain-dump analysis (context from mentions of "client"/"startup", scale from time mentions, stage usually "planning").
- **User override:** Users can always manually set/change facets in UI.
- **Generated columns:** Automatically updated via generated column definition.

### 3.6 Type Key Selection

- **AI matching:** Agent matches brain-dump to existing type_keys using template metadata keywords
- **User browsing:** UI shows templates grouped by metadata.realm with type_key descriptions
- **Pattern search:** Support queries like "show me all writer templates" (type_key LIKE 'writer.%')
- **Create new:** If no match, AI proposes new type_key following conventions

### 3.7 Security & tenancy

- **RLS** on all project‑scoped tables; roles via `onto.assignments` (owner, contributor, reviewer, client).
- Action runner checks permissions before executing external side‑effects (email, webhooks).
- Facets are non-sensitive metadata; same RLS rules apply.

### 3.8 Observability

- Log every transition with: actor_id, from→to, event, guard results, actions list.
- Emit metrics: TTFP, transitions/day, clarification count, action error rate, **facet distribution**, **type_key popularity**.

### 3.9 Extensibility

- Add new verticals by inserting templates with new type_keys (no code change).
- Add new actions by extending the **Action Runner** (keep them small, idempotent, and flagged for permission).
- **Facets are fixed in v1** (3 only); extending facets requires migration.

### 3.10 API Endpoints

#### 3.10.1 Spec → Instantiate

- `POST /onto/specs/draft` → **in:** `{ brain_dump, org_id }` **out:** `{ project_spec (with type_key + facets), clarifications }`
- `POST /onto/specs/patch` → **in:** `{ project_spec_id, answers }` **out:** `{ project_spec }`
- `POST /onto/projects/instantiate` → **in:** `{ project_spec }` **out:** `{ project_id }`

#### 3.10.2 CRUD + Views

- `GET  /onto/projects/:id`
- `GET  /onto/projects?facet_context=client&facet_scale=large` (faceted filtering)
- `GET  /onto/projects?type_key_prefix=writer` (type-based filtering)
- `GET  /onto/projects/:id/views/:view_id` (server builds board/pipeline models)
- `POST /onto/fsm/transition` → `{ object_kind, object_id, event }` → guard/action execution, returns `{ state_after, actions_run[] }`

#### 3.10.3 Templates & FSMs

- `GET  /onto/templates?scope=project&realm=creative` (discover by metadata)
- `GET  /onto/templates?type_key_prefix=writer` (find all writer templates)
- `GET  /onto/templates/:id/with_defaults` (includes resolved facet defaults)
- `POST /onto/templates/propose` → **in:** `{ domain_brief, base_type_key? }` **out:** `{ template (with metadata + facets), clarifications }` (status `draft`)
- `POST /onto/templates/promote` (admin) → `{ template_id, status:'active' }`

#### 3.10.4 Facets & Discovery

- `GET  /onto/facets` (list 3 facet definitions)
- `GET  /onto/facets/:key/values` (get values for a facet)
- `GET  /onto/analytics/facet_distribution?entity_kind=project` (analytics)
- `GET  /onto/analytics/type_key_usage` (which type_keys are most popular)

---

## 4) Small UI — Screens & Component Contracts

### 4.1 Brain‑Dump Creator

- **Inputs:** textarea (or audio), optional org/project defaults.
- **Call:** `POST /onto/specs/draft` → render parsed structure + **suggested type_key** + **suggested facets** + ≤3 clarifications → `POST /onto/specs/patch` as user answers → `POST /onto/projects/instantiate`.
- **UX rule:** never show more than 3 questions at once; allow "Create with defaults" (uses template defaults).
- **Type Key Selector:** Searchable dropdown with templates grouped by realm (from metadata), shows type_key + description.
- **Facet UI:** Simple dropdown selectors for 3 facets (context, scale, stage), pre-populated from AI suggestions or template defaults.

### 4.2 Project List

- Table of projects (name, type_key, state, updated_at) with **faceted filters**.
- **Filter UI:** 3 multi-select dropdowns (context, scale, stage) + type_key pattern search.
- Quick search by name/description.
- "Save filter" option for common queries.
- **Type key grouping:** Option to group by domain (all writer.\* together).

### 4.3 Project Home

- **Header:** name, type_key badge, goal chips, dates (start/end), context doc link, **3 facet badges** (color-coded).
- **Tabs:**
    - **Tasks — Kanban:** columns = `state_key`. Card actions = `getAllowedTransitions`. Filter by facet_scale.
    - **Deliverables — Pipeline:** columns from deliverable FSM states; drag → `transition(event)`. Filter by facet_stage.
    - **Docs:** list + open latest version; "Set as Context" button wires `context_document_id`.
    - **Analytics** (optional): timeline view, facet changes over time.

### 4.4 Template Browser (Discovery)

- **Group by realm** (from metadata): Creative, Technical, Business, Service, etc.
- Each template shows: type_key, name, description, typical_scale hint.
- **Search:** by type_key pattern, keywords in metadata.
- **Preview:** shows schema, FSM diagram, facet_defaults.

### 4.5 Template & FSM Builder (Admin)

- Form for TemplateSpec (scope, type_key, schema JSON editor, default_views).
- **Metadata editor:** Fields for realm, output_type, typical_scale, keywords.
- **Facet defaults editor:** 3 dropdown selectors (context, scale, stage).
- **Parent template selector:** Choose parent for inheritance (optional).
- FSM editor: states (chips), transitions (rows with from/to/event), guard/action pickers limited to allowed ops.
- Guards can reference facets: `facet_equals(context, 'client')`.
- Save as `draft`; **Promote** button sets `active` after validation.
- **Preview inheritance:** Show what fields/FSM will be inherited from parent.
- **Type key validator:** Real-time validation of type_key format.

### 4.6 Faceted Navigation (Simple)

- **3 filter dropdowns** (not overwhelming): context, scale, stage.
- Real-time count updates as filters change.
- Clear all / Save filter options.
- Works across list views (projects, tasks, deliverables).

---

## 5) AI Agent Roles & Prompts (operational)

### Roles

1. **Intake Agent** (Project Specifier): converts brain‑dump → ProjectSpec + **type_key selection** + **facet suggestions** + clarifications using catalog snapshot; prefers existing templates.

2. **Template Agent** (Template Designer): when a new vertical is detected, drafts a TemplateSpec + FSMDef + **metadata** + **facet_defaults** (status `draft`), asks only blocking questions. Suggests parent template if close match exists.

3. **Critic Agent** (optional): validates the spec against style/consistency rules and **type_key conventions**; requests minimal fixes.

4. **Instantiator Service**: server process that validates JSON, type_key format, facets, and writes to DB (no model).

### Prompt anchors

- **System:** Ontology + Type Key Conventions + 3-Facet taxonomy + Output Contract. Stress: _output only JSON_, _3–6 states_, _short event names_, _suggest facets from 3 allowed dimensions only_, _follow type_key naming conventions_.

- **Function (`propose_project_spec`) inputs:** `brain_dump`, `org_prefs`, `template_catalog_snapshot` (includes metadata + facet_defaults).

- **Function (`propose_template`) inputs:** `domain_brief`, optional `base_type_key`, and the catalog snapshot.

- **Function (`suggest_type_key`) inputs:** `description`, `existing_templates`, returns suggested type_key following conventions.

- **Function (`suggest_facets`) inputs:** `description`, `type_key`, returns suggested values for 3 facets only.

### Guardrails in prompts

- Use only allowed guard/action ops.
- **Facet values must exist in the 3-facet taxonomy** (context, scale, stage only).
- **Type keys must follow format:** `{domain}.{deliverable}[.{variant}]` — lowercase, dots, underscores only in words.
- Prefer diffs to brand‑new templates when close matches exist.
- When suggesting facets, prefer template defaults but override based on specific context clues.
- Ask ≤3 blocking clarifications; never ask for information the server can infer.
- For multi-role projects, suggest `also_types` array.
- **Never suggest realm or output_type as facets** — these go in template metadata only.

### Example Prompt Snippet (Intake Agent)

```
You are given a brain-dump and must produce a ProjectSpec with type_key selection and facet assignments.

Type Key Selection:
- Format: {domain}.{deliverable}[.{variant}]
- Domain = actor perspective (writer, coach, developer, founder, student, personal)
- Deliverable = primary output (book, client, app, startup, goal, routine)
- Variant = optional specialization (book.fiction, client.executive)
- Use lowercase, dots, underscores only within words
- Match against existing templates first; only create new if no good match

Available templates (excerpt):
- writer.book (creative writing, large scale)
- coach.client (1:1 coaching, medium scale)
- developer.app (software development, large scale)
- founder.startup (company creation, epic scale)
[... full catalog provided]

Facet Assignment (3 dimensions only):
1. context: [personal, client, commercial, internal, open_source, community, academic, nonprofit, startup]
2. scale: [micro, small, medium, large, epic]
3. stage: [discovery, planning, execution, launch, maintenance, complete]

Rules:
1. Select best matching type_key from catalog or propose new one following conventions
2. Assign facets based on brain-dump content:
   - context: who is it for? (detect "client work" → client, "startup" → startup, no mention → personal)
   - scale: time mentions? ("3 months" → medium, "quick" → micro, "big project" → large)
   - stage: what phase? (new projects usually start at "planning")
3. Use template facet_defaults as starting point, override with specifics from brain-dump
4. For multi-role work, populate also_types array
5. NEVER suggest "realm" or "output_type" as facets (these are template metadata only)

Output ProjectSpec with type_key and props.facets populated.
```

### Example: Writer Brain-Dump Processing

**Input:**

```
"I'm writing a science fiction novel about AI consciousness.
Target is 90,000 words. I have a publishing deal with Random House.
Need to finish draft in 6 months."
```

**Agent Analysis:**

```typescript
{
  type_key: "writer.book",  // clear match to existing template
  also_types: [],            // single role
  facets: {
    context: "commercial",   // "publishing deal" signals commercial
    scale: "large",          // "90,000 words" + "6 months" = large scale
    stage: "planning"        // just starting, hasn't begun writing yet
  },
  props: {
    genre: "science fiction",
    target_word_count: 90000,
    publisher: "Random House",
    deadline: "2025-04-30"
  }
}
```

### Example: Solopreneur Brain-Dump Processing

**Input:**

```
"Building a SaaS tool for email automation.
Need MVP in 3 months, then launch to first 10 customers.
I'm coding it myself in Python/React."
```

**Agent Analysis:**

```typescript
{
  type_key: "founder.startup",     // primary type (business perspective)
  also_types: ["developer.app"],   // also acting as developer
  facets: {
    context: "startup",            // startup company
    scale: "large",                // MVP in 3 months = large
    stage: "execution"             // actively building (not just planning)
  },
  props: {
    product_name: "Email Automation SaaS",
    tech_stack: ["Python", "React"],
    target_customers: "first 10 customers",
    mvp_date: "2025-01-31"
  }
}
```

---

## 6) FSM Action Primitives (initial catalog)

All actions run inside your FSM engine. All must be **idempotent** and **permission‑checked**.

- `spawn_tasks` — create one or more tasks (args: titles[], plan_id?, props_template)
- `create_deliverable` — create deliverable (args: name, type_key, props)
- `create_doc_from_template` — create document version from a server‑side template (args: template_key, variables)
- `create_research_doc` — specialized doc generator (args: topic, sources[]?)
- `schedule_rrule` — create recurring tasks/events (args: rrule, task_template)
- `notify` — in‑app notification (args: to_actor_ids[], message)
- `email_user` — send email to project user (args: to, subject, body_template)
- `email_admin` — send email to admin (args: subject, body)
- `run_llm_critique` — generate critique/summary for a deliverable (args: deliverable_id, rubric_key)
- `update_facets` — update entity facets (args: entity_kind, entity_id, facets_patch) — useful for stage transitions

### Guards (facet-aware)

- `has_facet(key, value)` — check if entity has specific facet value
- `facet_in(key, values[])` — check if facet is in list
- `all_facets_set(keys[])` — verify required facets are populated
- `type_key_matches(pattern)` — check type_key pattern (e.g., 'writer.\*')

**Security model:**

- Bind external connectors (email, calendars) to org settings; actions resolve runtime credentials.
- Actions require role: e.g., `email_user` → owner/contributor; `email_admin` → owner only.
- Facet updates logged for audit trail.

---

## 7) Validation, Versioning, and Lineage

### 7.1 Validation gates

- **Template save:** validate TemplateSpec + FSMDef + facet_defaults + **metadata** + **type_key format** (schema correctness; guard/action refs; facet values exist in taxonomy). Reject with structured errors.

- **Entity writes:**
    - Validate `type_key` format matches `^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$`
    - Validate `props` against the Template JSON Schema by `type_key`
    - Validate `props.facets.*` values exist in `onto.facet_values` for their respective keys (3 only)
    - Validate `also_types` array contains valid type_keys
    - Validate parent template inheritance doesn't create cycles

- **Transition time:** evaluate guards (including facet guards); refuse transition with machine‑readable errors (code, guard, path).

### 7.2 Versioning rules

- **Documents/Deliverables:** updates create new rows in `*_versions`; do not mutate prior versions.
- **Latest helpers:** add materialized views later (`mv_deliverable_latest_version`).
- **Facet history:** Changes to facets logged in props history (consider separate audit table in v2).

### 7.3 Lineage

- Use `onto.edges` for:
    - `project has_goal goal`
    - `deliverable has_version deliverable_version`
    - `deliverable_version derived_from document_version|source|task`
    - `project uses_template template`
    - `template inherits_from parent_template`

### 7.4 Type Key Integrity

- Type keys must exist in templates (or be validated against format)
- Multi-type support: each value in `also_types` must be a valid type_key
- Pattern queries use indexed LIKE operations for performance

---

## 8) Security (RLS) & Permissions

- Enable RLS on `onto.projects` and children.
- Roles via `onto.assignments`: `owner`, `contributor`, `reviewer`, `client`.
- Policies join child tables to parent project's `org_id`.
- **Facet visibility:** Facets are non-sensitive; same RLS rules as parent entity.
- **Template access:** Draft templates visible only to creator's org; active templates visible to all.
- **Analytics queries:** Must respect RLS; faceted queries filtered by org membership.

---

## 9) Acceptance Tests (must pass)

1. **Seed check:** Templates exist with metadata + facet_defaults; type_keys follow conventions; you can create "Coaching: Stacy" with facets properly set.

2. **FSM check:** Deliverable transitions `draft→review→active→completed`; guard failure returns structured error. Facet-aware guards work.

3. **Chat create:** Brain‑dump → AI suggests type_key + 3 facets + ≤3 clarifications → project instantiated with facets; if new type, a draft template with metadata + facet_defaults is stored.

4. **Lineage:** A deliverable v1 cites its sources/doc versions via edges; latest version appears in the pipeline UI.

5. **Actions:** Trigger `approve` → engine runs `spawn_tasks` + `notify` + `update_facets(stage='launch')` idempotently.

6. **Faceted queries:**
    - Query "commercial projects" returns correct results
    - Query "large-scale work in execution" filters properly
    - Type key pattern query finds all `writer.*` projects

7. **Multi-type:** Create project with `type_key='founder.startup'` and `also_types=['developer.app']`; both type-based queries find it.

8. **Template inheritance:** Create `writer.book.fiction` inheriting from `writer.book`; verify schema and facets merge correctly.

9. **Generated columns:** Update `props.facets.stage` → verify `facet_stage` column updates automatically.

10. **Type key validation:** Attempt to create project with invalid type_key format → receive clear validation error.

11. **Metadata vs Facets:** Query templates by `metadata.realm = 'creative'` works; realm is NOT a facet on instances.

---

## 10) Implementation Order (sprintable)

1. **Migration + Seed Data:**
    - Apply v2-migration.sql (simplified 3 facets, template metadata, generated columns)
    - Seed 3 facet definitions and values (context, scale, stage)
    - Seed 24 templates with type_keys, metadata, and facet_defaults
    - Seed example project with facets

2. **Core Services:**
    - Template Registry + Metadata Search
    - Type Key Validator
    - Facet Resolver (3 only)
    - Validators (schema + FSM + facets + type_key format)
    - FSM Engine skeleton with facet-aware guards
    - Action Runner scaffold

3. **Spec Pipeline:**
    - Endpoints (draft/patch/instantiate) with type_key selection + facet handling
    - AJV validation + facet value validation + type_key format validation
    - Type key suggestion service
    - Facet suggestion service (3 dimensions)

4. **Minimal UI:**
    - Brain‑Dump Creator with type_key selector + 3 facet dropdowns
    - Project List with faceted filters (3 dimensions) + type_key search
    - Project Home with type_key badge + 3 facet badges
    - Template Browser grouped by realm (metadata)

5. **Advanced UI:**
    - Template/FSM Builder (Admin) with metadata editor + facet_defaults + inheritance
    - Type key validator UI (real-time format checking)
    - Faceted navigation component (simple 3-filter UI)

6. **Actions & Integrations:**
    - Wire initial action primitives (notify/email/spawn/schedule/critique)
    - Add facet-specific actions (update_facets)
    - Implement idempotency and permission checks

7. **Security & Analytics:**
    - RLS policies with facet-aware filtering
    - Assignments + invite flows
    - Facet distribution analytics endpoints
    - Type key usage analytics

8. **Observability:**
    - Transition logging with facet + type_key context
    - Materialized views (latest versions, facet distributions, type_key popularity)
    - Performance monitoring for faceted queries

9. **Optimization:**
    - Optimize facet query indexes
    - Add caching for facet taxonomy
    - Add caching for template catalog

---

## 11) Developer Notes for the Next Agent

- **Schemas:** Use `ProjectSpec.v1` and `FSMDef.v1` from prior deliverables. Extend with type_key + 3 facet fields.

- **Type Key Format:** Always validate against `^[a-z_]+\.[a-z_]+(\.[a-z_]+)?$`. Provide clear error messages for violations.

- **Catalog snapshot:** Always pass a fresh template snapshot (including metadata + facet_defaults) into prompts; prefer existing type_keys.

- **Facet Resolution:** When instantiating, merge template facet_defaults with user-specified values (user wins). Only 3 facets: context, scale, stage.

- **Generated Columns:** Trust the database; don't manually sync facet\_\* columns—they're generated.

- **Do not execute actions at creation**; only on FSM transitions.

- **Everything AI outputs is data**. Engine + validators enforce reality.

- **Facets are Fixed:** 3 facets only (context, scale, stage). No custom facets in v1; requires migration to add.

- **Realm/Output Type are Metadata:** Never treat realm or output_type as instance facets. They live in `templates.metadata` for discovery/analytics only.

- **Multi-type Support:** Always check both `type_key` and `also_types` when querying by type pattern.

- **Template Inheritance:** Recursively resolve parent templates; merge schemas, metadata, and facets appropriately.

- **Type Key Conventions:** Follow the `{domain}.{deliverable}[.{variant}]` pattern strictly. Guide AI and users toward good naming.

---

## 12) Type Key Registry (Seeded Examples)

**Writers:**

- writer.book (novels, non-fiction)
- writer.article (journalism, essays)

**Coaches:**

- coach.client (1:1 coaching)
- coach.program (group programs)

**Developers:**

- developer.app (applications)
- developer.feature (feature work)

**Founders:**

- founder.startup (company)
- founder.product (product launch)

**Students:**

- student.assignment (homework)
- student.project (term projects)

**Personal:**

- personal.goal (objectives)
- personal.routine (habits)

**Plans:**

- plan.weekly (week plans)
- plan.sprint (sprints)

**Deliverables:**

- deliverable.chapter (writing)
- deliverable.design (design work)
- deliverable.workout_plan (coaching)

**Documents:**

- doc.brief (briefs)
- doc.notes (research)
- doc.intake (forms)

_This registry grows as users create new templates. AI agents refer to it for matching._

---

**End of v3.1** — Ready for codebase discovery and iterative implementation with simplified 3-facet system, proper type_key conventions, and comprehensive seeding strategy.
