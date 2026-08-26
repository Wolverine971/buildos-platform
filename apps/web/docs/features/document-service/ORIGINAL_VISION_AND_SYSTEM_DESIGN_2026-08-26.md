<!-- apps/web/docs/features/document-service/ORIGINAL_VISION_AND_SYSTEM_DESIGN_2026-08-26.md -->
<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-26; preserves the original product vision and the
> repository audit made at the start of the document-service effort. It is not a current reference.
> Verify implementation claims against code and use this folder's README for the current index.
>
> **Partially superseded 2026-08-26** by
> [`SWITCHING_BAR_AND_REVISED_ROADMAP_2026-08-26.md`](./SWITCHING_BAR_AND_REVISED_ROADMAP_2026-08-26.md),
> which replaces the workstream list (§11) and phase sequence (§12) after a design review against
> production data. Workstream F (realtime collaboration / CRDT) is cut; Workstream H interchange is
> promoted; open decisions #4 and #6 are closed by primitives that already ship. The domain model
> (§4), relationship authorities (§5), risks (§15), and non-goals (§17) below still govern.

# BuildOS Document Service: Original Vision and System Design

**Status:** Foundational product and architecture brief  
**Written:** 2026-08-26  
**Owner:** BuildOS  
**Purpose:** Preserve the founder's vision, establish the initial system model, record what BuildOS
already had at the start of the effort, and organize the bodies of work before implementation.

---

## Executive summary

BuildOS should treat document management as a substantial product within the product—not as a
file attachment feature inside projects.

The desired experience is a better alternative to Google Drive and Google Docs for project work:
documents should be easy to find, organize, understand, update, connect to real work, collaborate
on, and maintain. People should be able to work through typing, voice, or conversation with an
agent without leaving the document. Agent changes should be visible, reviewable, attributable,
and reversible. BuildOS should also understand useful structure inside the document—such as
headings, questions, references, images, and checklist progress—without sacrificing the
portability and simplicity of Markdown.

BuildOS already had a strong vertical slice when this effort began: a Markdown editor, autosave,
voice transcription, image assets, PDF/DOCX/HTML export, document trees with drag and drop,
full-text search, linked entities, comments, version comparison and restore, a document-scoped
agent workbench, and project audits that can reason about documentation gaps.

The system was not a greenfield rewrite. The core recommendation was to keep those working
surfaces and re-architect the trust and meaning underneath them:

1. Separate the current document head, edit sessions, immutable revisions, and fine-grained change
   events.
2. Route every human, agent, import, publish, and restore mutation through one atomic document
   mutation contract.
3. Keep Markdown as the canonical body while deriving structured projections for sections,
   checklists, internal references, external links, questions, media, and search.
4. Evolve Document Interact from direct background mutations into anchored, proposal-first,
   per-turn collaboration.
5. Add a dedicated document library and document-specific Librarian instead of relying only on a
   project tree.
6. Introduce realtime coediting only after the revision and mutation foundation is trustworthy.

The clearest first product slice is:

> Select part of a document, speak or type an instruction, see an anchored proposed diff, apply it,
> and immediately receive a meaningful revision plus updated checklist and reference state.

That interaction makes the distinctive BuildOS idea tangible while forcing the correct underlying
architecture.

---

## 1. Founder vision

### 1.1 The problem

Conventional drive products accumulate documents but do not make the collection feel understood.
It becomes difficult to remember where something lives, whether it is still current, what changed,
how it relates to active work, or which of several overlapping documents should be trusted.

The founder's motivating experience was straightforward: Google Drive contains many useful
documents, but finding and updating the right thing is regularly frustrating. BuildOS should make
working with documents a pleasure rather than an exercise in remembering folder locations and
filenames.

### 1.2 The intended experience

The document service should make all of the following fluid:

- Find a document quickly, even when the user does not remember its title or location.
- Organize documents through drag and drop, nesting, moving, and agent-assisted cleanup.
- Work with one document, several documents, or a whole document collection.
- Type directly in a document with unobtrusive autosave.
- Speak into a document and have the transcription inserted in the right place.
- Talk to an agent about the document in a clean side conversation while keeping the document
  visible and editable.
- Watch the agent's work become visible as it proposes or performs document changes.
- Understand what changed, who or what changed it, and recover a previous meaningful version.
- Collaborate with multiple people without silent overwrites or confusing history.
- Show useful document-derived state, such as “5 of 8 checklist items complete.”
- Connect document text to BuildOS tasks, goals, milestones, plans, documents, risks, sources, and
  people.
- Reference normal webpages and external URLs.
- Insert and manage images and richer media.
- Export documents to useful external formats.
- Let agents audit, consolidate, update, link, and reorganize documents without surprising the
  user.

### 1.3 Why this is more than a graph feature

BuildOS began with a project graph model: projects contain or relate to goals, milestones, plans,
tasks, documents, risks, and other entities. That graph remains useful, but a document has internal
structure and collaboration behavior that the graph alone cannot represent.

A document can contain:

- sections that agents should retrieve independently;
- questions that are answered over time;
- checklist items that may or may not become tasks;
- inline references to entities and external sources;
- images and files;
- comments and suggestions anchored to specific passages;
- multiple simultaneous editors;
- revisions whose boundaries differ from autosave boundaries.

The document service therefore needs its own domain model while remaining connected to the
project ontology.

### 1.4 Product kernel

The central product idea is:

> A BuildOS document is living project knowledge—findable by meaning and relationship, editable
> through typing, voice, or an agent, semantically connected to work, and safely reversible.

This is not primarily a “better folder tree.” It is a trustworthy interface between knowledge and
execution.

---

## 2. Product principles

### 2.1 Findability is more important than perfect filing

Organization should help, but the user should not need to remember a folder path. Search,
relationships, recency, ownership, document state, linked work, and agent understanding should all
help retrieve the right document.

### 2.2 Autosave should be invisible; revisions should be meaningful

Autosave protects current work. Revision history explains meaningful states. Those are different
promises and should not be represented as the same thing.

### 2.3 Agent changes must remain legible

An agent should not invisibly replace broad portions of a document while a person is editing it.
The system should show scope, intent, affected text, provenance, and conflicts. Broad or ambiguous
changes should default to proposals.

### 2.4 One canonical body, many derived views

The canonical document should remain portable and easy to inspect. Structured features should be
derived from that body unless they need an independent lifecycle.

### 2.5 Collaboration must not weaken trust

Realtime presence is attractive, but reliable version boundaries, attribution, conflict handling,
and recovery matter more. Collaboration should be layered on top of a sound mutation model.

### 2.6 Documents connect to work without becoming work automatically

Not every checkbox is a task. Not every link is a durable semantic relationship. The user should
be able to promote or connect document content deliberately, while BuildOS may suggest useful
connections.

### 2.7 Maintenance should compound knowledge

Document audits should reduce duplication, staleness, contradictions, and missing context over
time. Maintenance agents should stage evidence-backed suggestions rather than silently rearranging
high-value knowledge.

### 2.8 Preserve what already works

The editor, tree, search foundation, exports, assets, history UI, and agent runtime already provide
substantial value. The effort should strengthen and compose them rather than restarting from a new
editor or storage model.

---

## 3. Initial BuildOS implementation audit

This section records what existed in the repository on 2026-08-26.

### 3.1 Editing and single-document interaction

BuildOS already had:

- A CodeMirror 6 Markdown editor with a formatting toolbar and preview.
- Two-second debounced autosave.
- Optimistic concurrency through `expected_updated_at` and explicit conflict handling.
- Manual save that forces a version snapshot.
- Voice recording, transcription, cursor insertion, and stored voice-note metadata.
- Inline image insertion backed by ontology assets.
- Details, links, media, history, comments, publish controls, and activity panels.
- PDF, DOCX, and standalone HTML export.
- Version comparison, split/unified diff, and restore flows.

The main implementation surface was `apps/web/src/lib/components/ontology/DocumentModal.svelte`,
a large and capable component that had become responsible for most of the document lifecycle.
`apps/web/src/lib/components/ui/RichMarkdownEditor.svelte` provided the reusable editor.

**Assessment:** Keep the editor and interaction design. Extract a reusable document workspace and
move domain behavior behind explicit services. Do not rewrite the editor as a block editor at the
start of this effort.

### 3.2 Document organization

BuildOS already had:

- A project document tree with desktop and mobile presentations.
- Mouse, touch, and keyboard-aware movement behavior.
- Drag-and-drop reordering and nesting.
- Move, archive, create-child, public-link, and publish actions.
- Unlinked and archived-document handling.
- Optimistic locking and atomic structural mutation functions.
- Structure history for recovery.

The visible hierarchy was stored in project `doc_structure`, not in document-to-document graph
edges. This was the correct separation: containment and semantic relationships are different
things.

**Assessment:** Keep this system as the authority for project-tree containment. Extend discovery
beyond it with a document library; do not make the tree the only way to find documents.

### 3.3 Search and retrieval

The document body participated in generated full-text search and search results could include a
body-derived snippet. The project workspace exposed a debounced, keyboard-accessible entity search
that could return documents alongside other project entities.

The knowledge layer also had deterministic document outlines and agent tools for fetching an
outline and reading a bounded section.

**Assessment:** The search engine foundation existed. The major missing product surface was a
document-focused library with cross-project navigation, saved views, filters, previews, and bulk
operations.

### 3.4 Versioning

The existing version service used a 60-minute window:

- Create the first version.
- Create a new version when the actor changes, the window expires, or the caller forces one.
- Merge later changes from the same actor into the newest version within the window.
- Skip no-op changes unless a version is explicitly forced.

The version row stored a full snapshot in JSON properties and the UI could compare and restore it.

This was directionally aligned with the founder's desire to cluster related changes. The important
architectural problems were:

1. A version being presented as history could still be mutated while its coalescing window was
   open.
2. The document update completed before version creation, and version creation ran as best-effort
   post-save work.
3. Version-number selection and insertion did not form one atomic document mutation.
4. A version attributed changes to one actor, which does not model a multi-person edit session.
5. The model conflated a durable head, a coalescing session, a checkpoint, and an audit trail.

**Assessment:** Preserve the history, comparison, and restore UX. Re-architect the write semantics
around edit sessions, immutable sealed revisions, and append-only change events.

### 3.5 Collaboration

The system protected against silent stale writes through compare-and-swap behavior. When agent or
remote work changed a document while the local editor was dirty, it warned the user instead of
overwriting local changes.

No realtime coediting or CRDT dependency was present. Collaboration therefore meant safe
sequential editing rather than simultaneous cursors, presence, and merged keystrokes.

Comments were attached to the document entity rather than anchored to a selection or passage.

**Assessment:** The existing conflict protection was worth preserving. Realtime collaboration and
anchored review should be added after the revision foundation.

### 3.6 Internal references, external links, and checklists

BuildOS already had a shared internal-reference syntax:

```text
[[entity_type:entity_id|display text]]
```

Supported entity types included projects, tasks, documents, goals, milestones, plans, risks,
requirements, sources, edges, notes, and users.

The parser and HTML renderer existed, but the document editor did not expose first-class entity
autocomplete and the normal document Markdown renderer did not complete the entity-reference
rendering loop. Linked Entities existed as a side panel through ontology edges, but authoring an
inline task or document mention was not yet a coherent end-to-end experience.

GitHub-style Markdown checkboxes could be authored, but there was no durable checklist projection,
progress calculation, stable managed-item identity, or task-promotion/synchronization model.

External URLs worked as ordinary sanitized Markdown links.

**Assessment:** Extend the current syntax and edge model. Add editor autocomplete, safe interactive
rendering, derived indexes, checklist progress, and explicit “Promote to task” behavior.

### 3.7 Document Interact and agent mutations

BuildOS already had a document-scoped interaction dock that reused the main chat runtime with a
fixed document focus. Users could type or record voice, the conversation remained visible, and the
document stayed in place.

The agent could create, update, search, place, move, and retrieve documents through ontology tools.
It understood that document hierarchy belonged in `doc_structure` and semantic relationships
belonged in edges.

The important limitations were:

- The document refreshed after the dock closed rather than after each mutating turn.
- Interaction was scoped to the document but not to a selection, heading path, or viewport.
- Broad agent edits wrote through normal tools instead of producing reviewable anchored proposals.
- The document editor could not show an in-place proposed change while preserving the user's local
  selection and edits.

**Assessment:** Keep the shared chat/session runtime. Extend it with document anchors, typed
per-turn mutation events, proposal diffs, base-revision checks, and immediate clean-editor refresh.

### 3.8 Audits and document maintenance

The project-audit system could already evaluate documentation coverage and flag stale, unlinked,
or orphaned documents, missing documents for important workstreams, and possible duplicate or
overlapping work. Audit suggestions could enter the existing review/inbox flow.

**Assessment:** Build a document-specific Librarian on top of this existing audit and suggestion
pipeline. Do not create a second background-agent platform.

### 3.9 Initial audit summary

| Area              | 2026-08-26 state                                | Initial direction                    |
| ----------------- | ----------------------------------------------- | ------------------------------------ |
| Editing           | Strong Markdown, voice, image, autosave surface | Keep and extend                      |
| Organization      | Strong project tree and movement behavior       | Keep                                 |
| Search            | Body-aware project search                       | Extend into a document library       |
| Versions          | Useful UI; coupled and best-effort persistence  | Re-architect                         |
| Collaboration     | Safe conflict detection, no realtime coediting  | Add later                            |
| Links/checklists  | Partial primitives, incomplete semantic loop    | Extend                               |
| Agent interaction | Strong v0 dock and tools                        | Add anchors, proposals, live updates |
| Maintenance       | Project audits and suggestion infrastructure    | Specialize into Librarian            |
| Export/media      | PDF, DOCX, HTML, assets, inline images          | Keep and polish                      |

---

## 4. Target domain model

### 4.1 Document head

The document head is the current working state:

- document identity and project membership;
- title, description, type, and state;
- canonical Markdown body;
- properties and permissions;
- current head revision identifier;
- current content hash;
- created and last-updated attribution.

The existing ontology document row should continue to fill this role.

### 4.2 Edit session

An edit session groups related activity without pretending every autosave is a revision.

Suggested fields and behavior:

- document and base-revision identifiers;
- open, sealed, or abandoned state;
- start time and last activity time;
- participant actor identifiers;
- source set: editor, voice, agent, import, API, restore, publish;
- accumulated change count;
- optional session label or generated summary.

An edit session may remain open through a coalescing window. The exact timeout is a product
decision; 60 minutes is the starting behavior already present in BuildOS.

### 4.3 Immutable revision

A revision is a human-meaningful, sealed checkpoint.

It should contain:

- monotonically increasing document revision number;
- parent/base revision;
- full document snapshot for reliable restore;
- snapshot hash;
- generated diff and summary where useful;
- participating actors and sources;
- edit-session identifier;
- creation/seal reason;
- sealed timestamp;
- agent run, chat turn, publish, or restore provenance where applicable.

Once visible as a sealed revision, it must not change.

### 4.4 Change event

A change event is append-only provenance, finer grained than a revision. It explains what happened
without forcing the history UI to display every autosave.

Examples:

- body autosaved;
- title changed;
- agent proposal created;
- proposal applied;
- checklist item promoted to a task;
- document moved;
- public version published;
- prior revision restored.

The current activity system may provide part of this behavior, but document mutation provenance
should be explicit enough to reconstruct a trustworthy story.

### 4.5 Derived projections

Projections are recomputable representations of structure inside the canonical body. Each should
be keyed by document identity plus content hash or revision identity so stale projections are
detectable.

Initial projections:

- outline and section anchors;
- checklist items and completion summary;
- internal entity references;
- external URLs and sources;
- questions and unresolved items;
- images, files, and other media references;
- search chunks and section-level retrieval data.

Projections can be refreshed asynchronously after the canonical mutation commits. Agent read tools
should be able to recompute critical bounded structure when a cached projection is stale.

### 4.6 Agent proposal

An agent proposal represents a reviewable document change:

- document and base revision;
- one or more anchored patches;
- bounded surrounding context and hashes;
- rationale and change summary;
- originating agent run and chat turn;
- status: proposed, applied, revised, dismissed, superseded, or conflicted;
- resulting revision after apply.

Applying a proposal is a mutation, not a client-side text replacement. It must revalidate its base
and anchors, then commit through the document mutation service.

### 4.7 Collaboration state

When realtime coediting is introduced, collaborative operations should have their own storage and
compaction lifecycle. A CRDT handles simultaneous editing; it does not replace revisions.

The document head remains the durable current state, and sealed revisions snapshot meaningful CRDT
states. Collaboration participants feed into the edit session and revision attribution.

---

## 5. Relationship authorities

BuildOS should preserve distinct sources of truth for different kinds of relationships.

### 5.1 Project containment

`doc_structure` is the authority for the project document tree: ordering, nesting, movement, and
unlinked state.

### 5.2 Semantic relationships

Ontology edges connect documents to tasks, goals, milestones, plans, people, risks, sources, and
other documents when the relationship has durable meaning.

Task-associated documents remain canonical project documents linked through task-document edges.
“Task document” describes a workspace relationship; it should not create a second document storage
system or make the document disappear from the global library.

### 5.3 Inline internal references

Inline references originate in Markdown and are indexed as derived relationships. They should
render as interactive chips or links with a lightweight preview and a route to the referenced
BuildOS entity.

An inline reference does not automatically need a durable ontology edge. The system can offer to
promote frequently important references into semantic relationships.

### 5.4 External references

External URLs originate in the document and are indexed for retrieval, validation, previews, and
source audits. Captured source metadata may become a BuildOS source entity when useful.

---

## 6. Revision and autosave rules

### 6.1 Terminology

- **Autosave:** Persist the latest document head for durability.
- **Version/revision coalescing:** Group a series of related changes into one meaningful checkpoint.
- **Edit session:** The open grouping construct used while coalescing.
- **Revision:** The immutable checkpoint exposed in history.
- **Change event:** Fine-grained provenance that need not appear as a revision.

### 6.2 Recommended behavior

- Continue short-debounce autosave for the current head.
- Autosave should not create a visible revision each time.
- Keep one relevant edit session open while activity continues.
- Seal a revision when:
    - the user explicitly chooses **Save version**;
    - the edit session reaches the inactivity boundary;
    - an agent proposal is applied;
    - a document is published;
    - a revision is restored;
    - a meaningful collaborative session ends;
    - a system rule requires a safety checkpoint before a high-impact transformation.
- Attribute a collaborative revision to the participant set, not just the final writer.
- Allow the user to label an important revision.
- Do not create a new revision for a forced save with no changes unless the user is explicitly
  creating a named checkpoint.

### 6.3 Atomicity requirement

Every authoritative write should use one mutation boundary that:

1. checks access and the expected head/base revision;
2. updates the canonical document head;
3. appends required provenance;
4. updates or seals the edit session;
5. creates a revision when the boundary rules require one;
6. publishes a durable projection-refresh event;
7. returns the new head and revision/session state.

Revision persistence is part of the trust contract and should not be best-effort background work.
Search, outline, notifications, public-page synchronization, and other projections may remain
asynchronous when their failure cannot erase authorship history.

---

## 7. Checklist and task semantics

### 7.1 Local checklist items

A plain Markdown checkbox is local document state. BuildOS should derive:

- text;
- checked/unchecked state;
- section/heading path;
- source anchor;
- optional assignee or due-date text when recognized;
- optional linked task identity;
- projection confidence and content hash.

The UI can display document progress such as “5 of 8 complete” without creating eight ontology
tasks.

### 7.2 Promotion to task

The user may explicitly promote an item to a task. Promotion should:

- create or link the canonical task;
- assign the checklist item a managed stable identity;
- create the semantic document-task relationship;
- record which side controls completion, title, assignee, and due date;
- make synchronization direction visible.

The default should be conservative. BuildOS may suggest promotion when an item clearly represents
durable project work, but should not silently promote it.

### 7.3 Stable identity

Pure positional Markdown anchors are fragile after editing. A managed checklist item needs a
stable identity once it participates in task synchronization. The exact representation—hidden
directive, structured Markdown attribute, or sidecar anchor mapping—requires an ADR and prototype.

---

## 8. Document user experience

### 8.1 Document library

Build a top-level document sub-application with:

- Recent;
- Favorites;
- Owned by me;
- Shared with me;
- Project documents;
- Task-linked documents;
- Unfiled documents;
- Archived documents;
- saved views and filters.

Core interactions:

- full-text and semantic search;
- project and hierarchy breadcrumbs;
- filters for project, type, state, author, update time, linked entity, and health;
- tree, list, and optional grid views;
- fast preview;
- keyboard navigation and command actions;
- multi-select, bulk move, bulk archive, and bulk export;
- drag and drop where it improves organization;
- clear recency, owner, revision, and collaboration indicators.

The library should make filing useful without making filing mandatory for retrieval.

### 8.2 Single-document workspace

Extract one adaptive `DocumentWorkspace` composition shared by modal and full-page contexts.

Suggested regions:

- **Header:** breadcrumb, title, document state, presence, autosave state, revision action, share,
  export, and close/navigation controls.
- **Primary canvas:** editor, preview, comparison, or proposal mode.
- **Context drawer:** details, relationships, media, history, comments, publish, and activity.
- **Interaction workbench:** document-scoped agent conversation and proposal controls.
- **Navigation affordances:** outline, questions, checklist summary, and relevant linked work.

The existing right-edge Details drawer and in-flow bottom Document Interact workbench should be
preserved as strong interaction patterns. The workspace extraction is about composition and domain
boundaries, not visual reinvention.

### 8.3 Multiple-document work

Support workflows that span more than one document:

- multi-select and bulk organization;
- opening related documents without losing the current place;
- agent-assisted comparison and consolidation;
- move/copy/link choices that distinguish containment from semantic relationships;
- conflict and duplicate previews before merging;
- source and target selection for consolidation;
- clear preservation of revisions and provenance when documents merge.

### 8.4 Internal mentions and references

Typing a trigger such as `@` or `[[` should open a unified BuildOS entity picker. Results should be
scoped and ranked by the current project while still allowing permitted cross-project references.

Inserted references should:

- remain readable in Markdown;
- render as compact interactive chips;
- expose type and current state;
- open or preview the entity;
- tolerate renamed entities because identity is stable;
- degrade gracefully in exports.

### 8.5 Comments and suggestions

Entity-level comments remain useful for general discussion. Add anchored comments and suggestions
for collaborative review.

An anchor should include semantic section context and surrounding-text hashes, not just a DOM
coordinate. If edits invalidate it, the system should attempt reattachment and clearly mark an
orphaned comment when confidence is low.

### 8.6 One deliberate delight

The most valuable high-craft interaction is an agent proposal appearing directly against the
relevant document passage: a restrained ghost/diff layer that lets the user inspect, revise, apply,
or dismiss without losing scroll position. This should be the signature interaction, not one of
many competing animations.

---

## 9. Agentic document processes

### 9.1 Read and context plane

Agents should read documents through bounded, structured retrieval:

- document metadata and current revision;
- project tree path;
- outline;
- selected section or anchored surrounding content;
- checklist, question, link, and media projections;
- semantically linked tasks, goals, plans, and documents;
- relevant revision/change context when the request depends on what changed.

The full body remains available when genuinely required, but section-aware reads reduce noise and
cost.

### 9.2 Proposal plane

For broad, ambiguous, or high-impact changes, the agent should create a proposal containing:

- the user's instruction;
- selected or inferred anchor;
- base revision;
- affected passages;
- proposed replacement or insertion patches;
- rationale and summary;
- any planned task/link/checklist side effects.

The proposal should be visible while the conversation continues. The user can apply, revise,
dismiss, or narrow it.

### 9.3 Apply plane

Applying a proposal should:

- revalidate document head and anchors;
- rebase safely when possible;
- surface a conflict instead of overwriting uncertain work;
- commit through the atomic mutation service;
- seal a revision;
- refresh projections;
- publish a typed per-turn mutation summary;
- preserve editor selection and scroll where possible.

Direct writes remain appropriate for explicit, bounded instructions whose target and outcome are
unambiguous.

### 9.4 Live interaction plane

“Live agent updates” should mean truthful, inspectable progress—not uncontrolled token-by-token
rewriting of the same text a person is editing.

Useful live states include:

- reading a named section;
- checking linked tasks or sources;
- drafting a proposal;
- showing the proposed diff;
- applying the accepted change;
- refreshing derived state;
- reporting the resulting revision.

### 9.5 Document Librarian

The Librarian should specialize the current project-audit and review pipeline to detect:

- duplicate or overlapping documents;
- stale documents or stale sections;
- unlinked, misplaced, or orphaned documents;
- active goals/plans that lack supporting documentation;
- contradictions between documents;
- broken external links and missing sources;
- orphaned assets;
- unanswered questions;
- long-running incomplete checklists;
- documents that should be split or consolidated;
- document titles, summaries, or tree placement that harm retrieval.

Each finding should include evidence, impact, confidence, and the smallest useful correction.
Suggested mutations should enter the existing review flow rather than executing silently.

---

## 10. System architecture

```text
Typing ---------+
Voice ----------+
Import ---------+--> Document Mutation Service --> Atomic document transaction
API/connector --+              |                    |- update current head
Agent proposal -+              |                    |- append change event
                                |                    |- update/seal edit session
                                |                    `- create immutable revision when required
                                |
                                `--> Durable projection-refresh event
                                          |
                                          v
                                  Projection pipeline
                                  |- outline/sections
                                  |- checklist progress
                                  |- internal references
                                  |- external links/sources
                                  |- questions/open items
                                  |- media references
                                  `- search chunks

Consumers:
Document library | Document workspace | Agent tools | Project graph | Audits | Exports
```

### 10.1 Mutation service responsibilities

- authentication and authorization;
- expected-head/base-revision validation;
- update strategy and patch validation;
- source and actor provenance;
- head update;
- session lifecycle;
- revision boundary decisions;
- durable change events;
- outbox/projection event publication;
- consistent mutation response for UI and agents.

### 10.2 Projection pipeline responsibilities

- deterministic extraction where possible;
- version/content-hash association;
- idempotent rebuilds;
- stale-projection detection;
- bounded failure and retry;
- no authority over the canonical body;
- observability for lag and extraction errors.

### 10.3 Realtime collaboration responsibilities

- CRDT document state and update transport;
- presence and cursor metadata;
- reconnect and offline merge;
- periodic compaction;
- mapping active collaborators into the edit session;
- sealing meaningful CRDT states as normal document revisions.

The CRDT should not become a second business-data model for document metadata, semantic edges, or
task state.

---

## 11. Bodies of work

### Workstream A — Document trust foundation

**Outcome:** Every document mutation is durable, attributable, conflict-aware, and recoverable.

- Define the domain vocabulary and mutation contract.
- Add edit-session and change-event concepts.
- Make sealed revisions immutable.
- Move revision creation into the authoritative transaction.
- Make restore and agent apply use the same contract.
- Rename **Save** to **Save version** and clarify autosave status.
- Backfill or reinterpret existing versions safely.
- Add concurrency, restore, and revision-integrity tests.

### Workstream B — Semantic document projections

**Outcome:** BuildOS can understand useful structure without replacing Markdown.

- Formalize outline and section anchors.
- Add checklist extraction and progress.
- Complete internal entity-reference authoring and rendering.
- Index external URLs and source metadata.
- Add question/open-item extraction.
- Unify media-reference projection.
- Add content-hash/versioned projection contracts and rebuild tooling.

### Workstream C — Document workspace

**Outcome:** One coherent, adaptive editing surface replaces duplicated lifecycle implementations.

- Extract `DocumentWorkspace` from modal-specific orchestration.
- Separate editor state, persistence state, document data, and panel composition.
- Preserve the existing Details and Document Interact patterns.
- Add outline/checklist/question navigation.
- Add proposal and comparison modes.
- Add anchored comment/suggestion UI later in the stream.

### Workstream D — Document library and multi-document operations

**Outcome:** Users can reliably find and organize documents without knowing folder paths.

- Build global document navigation and saved views.
- Add document-specific search, facets, previews, and breadcrumbs.
- Add favorites, shared/owned, task-linked, unfiled, and archived views.
- Add multi-select and bulk actions.
- Support consolidation and relationship-aware movement.
- Measure search success and time to open the intended document.

### Workstream E — Agent change engine

**Outcome:** Talking to a document feels like collaborating with an accountable editor.

- Capture selection, heading path, cursor, viewport, and base revision.
- Add typed per-turn mutation callbacks.
- Add anchored proposal creation and diff UI.
- Add apply/revise/dismiss lifecycle.
- Revalidate and rebase against concurrent edits.
- Preserve selection and scroll after clean refresh.
- Report provenance and resulting revision.

### Workstream F — Realtime collaboration and review

**Outcome:** Multiple people can work simultaneously without weakening revision trust.

- Choose and prototype the CRDT provider/transport.
- Add presence, cursors, and collaborator indicators.
- Model participant-aware edit sessions.
- Add anchored comments and suggestions.
- Handle reconnect, offline changes, and compaction.
- Snapshot meaningful collaborative states into revisions.

### Workstream G — Document Librarian

**Outcome:** The collection becomes easier to trust and navigate over time.

- Add document-health evaluators to project audits.
- Generate evidence-backed document suggestions.
- Add consolidation, stale-section, broken-link, and missing-context proposals.
- Reuse inbox/review workflows and agent chat handoff.
- Track suggestion acceptance, dismissal, and recurring failure modes.

### Workstream H — Interchange, assets, and sharing

**Outcome:** Documents move into and out of BuildOS without losing their usefulness.

- Continue PDF, DOCX, and HTML export quality improvements.
- Define Markdown and external-document import behavior.
- Preserve internal references gracefully in exports.
- Support richer image/media presentation and captions.
- Clarify sharing, public-page, and live-sync revision semantics.
- Add batch export from the library.

---

## 12. Recommended implementation sequence

### Phase 0 — Architecture contracts

Write and approve:

1. canonical body and projection ADR;
2. containment, semantic edge, and inline-reference authority ADR;
3. mutation, edit-session, revision, and change-event ADR;
4. agent direct-write versus proposal policy;
5. collaboration boundary and CRDT decision record.

Also inventory every current document write path so none bypasses the eventual mutation contract.

### Phase 1 — Trust kernel

- Introduce the atomic mutation boundary.
- Add immutable revision sealing and edit sessions.
- Route editor saves, agent writes, and restore through it.
- Preserve existing APIs through adapters while clients migrate.
- Relabel Save and expose autosave/session/revision status truthfully.

This is the highest-priority re-architecture because every later feature depends on trustworthy
change semantics.

### Phase 2 — Document Interact v1

- Capture selection and section anchors.
- Add per-turn mutation summaries.
- Stage broad changes as proposals.
- Show an in-context diff.
- Apply through the trust kernel and create a revision.

This is the first differentiated visible product slice.

### Phase 3 — Semantic projections

- Checklist progress and task promotion.
- Inline entity autocomplete and rendering.
- Question/open-item navigation.
- External-link and media indexes.
- Projection health and rebuild tooling.

### Phase 4 — Document library

- Dedicated library shell.
- Search, saved views, filters, preview, and breadcrumbs.
- Favorites, shared/owned, task-linked, unfiled, and archived views.
- Bulk organization and export.

### Phase 5 — Realtime collaboration

- CRDT prototype and transport.
- Presence and cursors.
- Participant-aware sessions and revision sealing.
- Anchored comments and suggestions.
- Reconnect and offline hardening.

### Phase 6 — Librarian and compounding maintenance

- Document-specific health evaluations.
- Consolidation and stale-content proposals.
- Review/inbox integration.
- Outcome measurement and recurring maintenance loops.

---

## 13. Recommended first vertical slice

The first slice should demonstrate the product kernel rather than only invisible infrastructure.

### User journey

1. Open a document.
2. Select a paragraph or section.
3. Open Document Interact.
4. Type or speak: “Rewrite this as a concise decision record and turn the action items into a
   checklist.”
5. See the agent read the selected section and linked context.
6. Review an anchored proposed diff while the document remains visible.
7. Apply the proposal.
8. See the document update without losing position.
9. See a new immutable revision and a derived checklist summary.
10. Optionally promote one checklist item to a BuildOS task.

### Why this slice

It requires and validates:

- semantic selection anchors;
- bounded agent context;
- proposal-first changes;
- conflict-aware apply;
- revision boundaries;
- checklist projection;
- task linking;
- live UI updates;
- provenance.

It makes the differentiated value visible while testing the architecture's highest-risk seams.

---

## 14. Important open decisions

These should be resolved through prototypes and ADRs rather than assumptions.

1. **Revision boundary:** Is the inactivity window 60 minutes, and does any active collaborator
   extend it?
2. **Explicit checkpoint:** Should Save version create a no-change checkpoint only when the user
   names it?
3. **Patch representation:** Heading-anchored text patches, Markdown AST patches, or a hybrid?
4. **Managed checklist identity:** Hidden Markdown directives, structured attributes, or sidecar
   anchor mapping?
5. **Task synchronization:** Which fields are document-controlled, task-controlled, or optionally
   bidirectional?
6. **Entity-reference trigger:** `@`, `[[`, slash command, or a combination?
7. **Document library scope:** All accessible documents by default or a project-first home with a
   global switch?
8. **Agent direct-apply threshold:** Which precise operations can bypass proposal review?
9. **Realtime provider:** Supabase Realtime plus Yjs persistence, a hosted collaboration provider,
   or another transport?
10. **Anchored comments:** How should anchors survive major rewrites and revision restores?
11. **Cross-project references:** What permissions and previews are safe when a document links to an
    entity in another project?
12. **Consolidation semantics:** How are source documents, links, history, and redirects preserved
    after a merge?

---

## 15. Risks and constraints

### 15.1 Turning Markdown into a hidden block editor

Adding invisible identifiers and special syntax everywhere could make the canonical body difficult
to read or export. Add managed metadata only when an item needs an independent lifecycle.

### 15.2 Treating every derived signal as authoritative

Question, checklist, link, and section extraction can be stale or imperfect. Projections need
content hashes, confidence where relevant, and recomputation paths.

### 15.3 Agent and user editing the same text simultaneously

Streaming direct agent rewrites into an active local editor creates race conditions and destroys
trust. Stream progress and proposals; commit accepted changes atomically.

### 15.4 Building realtime collaboration before revision semantics

A CRDT solves concurrent text operations, not meaningful history, provenance, or business-level
conflicts. The trust kernel should come first.

### 15.5 Overloading ontology edges

Folder containment, inline references, semantic relationships, and task associations have
different meanings. Making one graph structure own all of them would recreate ambiguity.

### 15.6 Expanding the current modal indefinitely

The existing modal proved the experience but accumulated too many responsibilities. New behavior
should enter a shared workspace composition and domain services rather than another large branch in
the modal.

### 15.7 Duplicating agent infrastructure

Document Interact and the Librarian should reuse the existing agent runtime, audit, suggestion,
review, and inbox systems. The document service owns domain contracts and UI, not a second agent
platform.

---

## 16. Success signals

### Findability

- Median time from search/navigation start to opening the intended document.
- Search-to-open conversion.
- Repeated-query and abandoned-search rate.
- Percentage of opens originating from content/relationship search rather than remembered paths.

### Editing and trust

- Autosave failure and stale-write conflict rates.
- Revision-integrity failures.
- Restore success rate.
- Percentage of revisions with clear actor/source attribution.
- Frequency of users manually creating or labeling versions.

### Agent collaboration

- Document Interact open-to-turn conversion.
- Voice stop-to-turn-start latency.
- Proposal apply, revise, dismiss, and conflict rates.
- Percentage of applied proposals that are subsequently reverted.
- Time from completed agent turn to reflected editor state.

### Semantic usefulness

- Documents with actionable outline/checklist/reference projections.
- Checklist-item promotion-to-task rate.
- Broken or stale internal-reference rate.
- Navigation from document references to related work.

### Library and maintenance

- Favorites/saved-view usage.
- Bulk organization completion rate.
- Librarian suggestion acceptance and dismissal rates.
- Reduction in unlinked, duplicate, stale, and broken-link findings over time.

---

## 17. Explicit non-goals for the first stages

- Replacing Markdown with a fully block-native editor.
- Treating every checkbox as an ontology task.
- Making semantic edges represent folder containment.
- Creating a visible revision for every autosave.
- Allowing broad agent rewrites to bypass conflict checks or review by default.
- Building a separate chat, audit, queue, or inbox platform for documents.
- Completing realtime collaboration before atomic revisions and provenance.
- Rebuilding the existing tree, export, asset, or editor systems without evidence that they block
  the target experience.

---

## 18. Immediate next steps

1. Create the document-domain vocabulary and mutation-contract ADR.
2. Enumerate all current human, agent, API, import, restore, publish, and sync write paths.
3. Design the edit-session, revision, change-event, and projection data contracts.
4. Define compatibility and migration behavior for existing document versions.
5. Extract a `DocumentWorkspace` boundary without changing the visible experience.
6. Implement the first selection-to-proposal-to-revision vertical slice.
7. Prototype checklist projection and one-way promotion to a task.
8. Design the first document-library screen using the existing search and tree capabilities.

The effort should continue from this document by turning uncertain choices into dated ADRs,
bounded implementation plans, prototypes, and evidence. The founder vision should remain stable;
the architecture should evolve as implementation teaches us where the real constraints are.
