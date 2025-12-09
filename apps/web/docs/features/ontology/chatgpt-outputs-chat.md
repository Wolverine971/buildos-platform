<!-- apps/web/docs/features/ontology/chatgpt-outputs-chat.md -->

Love this direction. You’re basically saying:

> “A project is the story of turning ideas into outputs. Outputs are the main characters. Everything else is supporting cast.”

Let’s lean into that.

I’ll break it into 3 layers:

1. **Core conceptual model** – what is the “central thing” and how others orbit it
2. **How to tweak your deliverable taxonomy** (document / event / multi-doc / external)
3. **How that maps to your existing `onto_*` tables + what the project UI should feel like**

---

## 1. Core conceptual model: Outputs in the center

### Mental model

On a project page:

- **Center of gravity:** `Output` / `Deliverable`
- **Orbits around each output:**
    - Tasks that move it forward
    - Plans that organize those tasks
    - Goals & metrics it ladders up to
    - Events (work sessions, launches, calls) related to it
    - Decisions that affect it
    - Risks, requirements, signals, sources, etc.

So instead of “a project is a pile of tasks,” it becomes:

> A project is a constellation of **outputs**, each with its own ecosystem of work.

You already have the right building block for this: **`onto_outputs`**.

I’d treat `onto_outputs` as the **canonical “Deliverable” table**, regardless of primitive (document, event, external artifact, etc.).

---

## 2. Taxonomy tweak: `deliverable.document.*`, `deliverable.event.*`, `deliverable.collection.*`, `deliverable.external.*`

You’re already close with the existing catalog; the only missing piece is **aligning type_keys to primitives and your actual capabilities.**

### 2.1. Introduce a simple primitive enum at the output level

For each row in `onto_outputs`, you already have `type_key`. Update the type_key s to have this naming convention like:

- `OUTPUT.DOCUMENT`
- `OUTPUT.EVENT`
- `OUTPUT.COLLECTION` (multi-doc book, course, etc.)
- `OUTPUT.EXTERNAL` (software, media, Notion doc, Figma file, etc.)
- (Later: `METRIC_DASHBOARD`, `DATASET`, etc., if you want)

You can encode it in one of two ways:

- In `onto_outputs.props.primitive`, **or**
- Conventionally via type_key prefix (e.g. `deliverable.document.*` → TEXT_DOCUMENT)

### 2.2. Reshape type_keys to match primitives

#### a) **Documents you can edit natively**

Prefix with `deliverable.document.*` and map to `onto_documents`:

Examples:

- `deliverable.document.blog_post`
- `deliverable.document.newsletter`
- `deliverable.document.case_study`
- `deliverable.document.technical_doc`
- `deliverable.document.whitepaper`
- `deliverable.document.email_sequence`
- `deliverable.document.coaching_report`
- `deliverable.document.business_plan`
- `deliverable.document.pitch_deck` (even if you start as markdown + images)
- `deliverable.document.sop`
- `deliverable.document.proposal`

These all use **TEXT_DOCUMENT** primitive and have:

- an **`onto_outputs` row** with `type_key = 'deliverable.document.X'`
- a linked **`onto_documents` row** that stores the editable content and versions

#### b) **Events as deliverables**

Events you care about as outputs (workshop, webinar, masterclass, performance) can be:

- `deliverable.event.workshop`
- `deliverable.event.webinar`
- `deliverable.event.lesson`
- `deliverable.event.retreat`
- `deliverable.event.keynote`

Primitive: **EVENT**

Each such deliverable would tie to an `onto_events` row.

#### c) **Multi-document / “collection” outputs**

For things like books, courses, curriculums, bundles of docs:

- `deliverable.collection.book`
- `deliverable.collection.course`
- `deliverable.collection.curriculum`
- `deliverable.collection.email_sequence_campaign` (if you want to group multiple sequences)
- `deliverable.collection.report_pack` (e.g. 4 related reports)

Primitive: **COLLECTION**

Semantics: a **Collection Output** is:

- One `onto_outputs` row (the collection itself)
- A set of **edges to other outputs/docs**:
    - collection → child outputs (`onto_edges.rel = 'collection.contains_output'`)
    - collection → child documents (`rel = 'collection.contains_document'`)

This is your “index doc” pattern you mentioned.

#### d) **External artifacts (software, media)**

For things BuildOS cannot create/edit directly (but you still want to track as central outputs):

- `deliverable.external.software_feature`
- `deliverable.external.release`
- `deliverable.external.media_video`
- `deliverable.external.media_podcast_episode`
- `deliverable.external.design_file` (points to Figma, etc.)

Primitive: **EXTERNAL**

These would:

- Live as `onto_outputs` rows
- Store the external URI in `onto_outputs.props.external_uri` **or** via an `onto_sources` link
- Have tasks, plans, events, decisions orbiting them like any other output

This solves the “I can’t create the software here” problem: you don’t need to; you’re tracking the **deliverable** and the work around it.

---

## 3. Promotions: from document/event → deliverable

You described something powerful: **promotion**.

> “A document that is being worked on can be promoted to a `deliverable.document.*` and same for an event.”

Implement this with a clean pattern:

### 3.1. Document → Output promotion

- Start with a “plain” `onto_documents` row (`type_key = 'doc.note'` or whatever).
- User hits **“Promote to Deliverable”** from the document view.
- You create:
    - An `onto_outputs` row:
        - `type_key = 'deliverable.document.blog_post'` (or selected subtype)
        - `props.document_id = <onto_documents.id>`

    - Optionally an `onto_edges` link: `src_kind='output', dst_kind='document', rel='output.document'`

Now that doc is **the** canonical content for that output.

### 3.2. Event → Output promotion

Same idea:

- Event exists in `onto_events` (synced from calendar or created locally).
- User hits **“Promote to Deliverable”** → choose subtype (`workshop`, `webinar`, etc.).
- Create `onto_outputs` row:
    - `type_key = 'deliverable.event.workshop'`
    - `props.event_id = <onto_events.id>`

Now you can attach tasks, decisions, etc., to that “Workshop” deliverable, not just the event row.

### 3.3. Multi-document promotion

For something like a book:

- First, you have multiple docs: each chapter = `onto_documents` rows.
- User creates **“Book” Output**:
    - `type_key = 'deliverable.collection.book'`

- Then either:
    - Use edges from the collection output to the chapter documents, or
    - Promote each chapter to `deliverable.document.chapter` outputs, then edges collection → outputs.

---

## 4. How this maps cleanly to your current tables

Here’s a concrete mapping layer by layer.

### 4.1. Canonical Deliverable

**`onto_outputs`** is the canonical deliverable/output:

- `id` – Output ID
- `name` – Name visible in UI (“Newsletter #12 – End of Year Recap”)
- `type_key` – e.g. `deliverable.document.newsletter`
- `state_key` – idea/drafting/review/published/archived
- `facet_stage` – optionally tied to your stages
- `props` – where you store foreign keys to primitive implementations:
    - `props.document_id`
    - `props.event_id`
    - `props.external_uri`
    - `props.collection_child_ids`, etc. (or push these into `onto_edges`)

### 4.2. Primitive Tables

- **TEXT_DOCUMENT → `onto_documents` / `onto_document_versions`**
    - `onto_documents.type_key` can be `doc.newsletter`, `doc.article`, etc.
    - Link: `onto_outputs.props.document_id` (or via `onto_edges`).

- **EVENT → `onto_events` / `onto_event_sync`**
    - `onto_events.type_key` for more granular event semantics.
    - Link: `onto_outputs.props.event_id`.

- **COLLECTION → `onto_edges`**
    - `src_kind = 'output'`, `dst_kind = 'output' or 'document'`.
    - `rel = 'collection.contains'` or variant.

- **EXTERNAL → `onto_sources` or just URI in props**
    - For “tracked external artifacts,” you might:
        - Create an `onto_sources` record for the external asset.
        - Link output → source via `onto_edges`.

### 4.3. Periphery orbiting the outputs

Connection model with `onto_edges`:

- Task ↔ Output:
    - `src_kind='task', dst_kind='output', rel='task.targets_output'`

- Plan ↔ Output:
    - `src_kind='plan', dst_kind='output', rel='plan.covers_output'`

- Goal ↔ Output:
    - `src_kind='goal', dst_kind='output', rel='goal.drives_output'`

- Metric ↔ Output:
    - `src_kind='metric', dst_kind='output', rel='metric.tracks_output'`

- Event ↔ Output:
    - `src_kind='event', dst_kind='output', rel='event.related_to_output'` (for secondary events beyond the “primary” one promoted)

- Decision ↔ Output:
    - `src_kind='decision', dst_kind='output', rel='decision.affects_output'`

This keeps your current tables intact and simply uses outputs as the hub.

---

## 5. What the project page UI should look like with this model

Now, translate this into an actual **project page UI vibe**.

### 5.1. Overall layout (high-level)

Think:

- **Left rail:** Project context
- **Center:** Outputs (the “deliverable board”)
- **Right:** Detail panel for selected item (output or task)

Concretely:

**Left sidebar**

- Project name, description, facets (`facet_context`, `facet_scale`, `facet_stage`)
- Key goals (`onto_goals`) and milestones (`onto_milestones`)
- Quick filters (by output type, stage, primitive)

**Center main area – Output-centric**

- A **board or timeline of Outputs** for this project:
    - Columns by `state_key`: Idea → Drafting → In Review → Shipped
    - Or grouped by primitive: Docs / Events / Collections / External

- Each Output card shows:
    - Name + type badge (`Newsletter`, `Workshop`, `Release`, `Book`)
    - Primitive icon (doc, event, collection, external link)
    - Stage / state
    - Tiny chips for:
        - # of tasks linked
        - # of events
        - # of decisions
        - Key metric snapshot (if any)

- Click Output → it becomes the primary context in the right pane.

**Right pane – Output detail**

Tabs or sections:

1. **Overview**
    - Output name, type, state
    - Summary (auto-generated from doc, tasks, and metrics)
    - Primary doc or external link

2. **Work**
    - List of tasks targeting this output (from `onto_tasks` via edges)
    - Inline creation: “Add task for this output”
    - Link to plan(s) that cover it

3. **Content** (if TEXT_DOCUMENT)
    - Inline editor for the main document (connected to `onto_documents`)
    - Version history from `onto_document_versions`

4. **Timeline**
    - Events (work sessions, reviews, launches) related to this output

5. **Intel**
    - Decisions, risks, requirements, metrics that touch this output
    - Signals/sources that informed it

This makes the **Output** feel like a mini “workspace inside the project.”

### 5.2. Where “promotion” lives in the UI

Practical placements:

- **From a document view**:
    - Button: “Promote to Deliverable”
    - Dialog: choose `deliverable.document.*` subtype
    - After creation, show chip “Deliverable: Newsletter #12” and a link back to its output detail view.

- **From an event view (calendar or list)**:
    - “Promote as deliverable event → [Workshop, Webinar, Keynote…]”

- **From project page**:
    - “New Output” → choose primitive:
        - Document (opens editor)
        - Event (create internal event or pick existing)
        - Collection (define container, then attach docs/outputs)
        - External (paste a URL / integration)

---

## 6. Handling the big catalog you pasted

You don’t have to throw it away; just **re-bucket it**:

- Stuff BuildOS can meaningfully **author/edit** →
    - map to `deliverable.document.*` or `deliverable.collection.*`

- Stuff that is **time-bounded experience** →
    - map to `deliverable.event.*`

- Stuff that is essentially a **wrapper around something external** →
    - map to `deliverable.external.*`

If you want, next step we can:

- Take your full catalog and **relabel** each line into:
    - `primitive`
    - `deliverable.type_key`
    - `supports_native_editing: boolean`

- Then you can generate **`onto_templates`** entries automatically (FSM, default_props, defaults for each deliverable type).
