<!-- apps/web/docs/features/ontology/HIERARCHICAL_DOCUMENT_TREE_SPEC.md -->

# Hierarchical Document Tree - Specification

**Status:** Draft → In Design
**Author:** User + Claude
**Date:** 2026-01-29
**Last Updated:** 2026-01-29

---

## Vision

Transform the project page from a flat entity-listing view into a **document-driven knowledge base** with a hierarchical tree structure. Documents become the primary organizational unit, with other entities (tasks, events, goals, milestones, plans) serving as peripheral/supporting elements.

The structure mirrors how organizations actually organize knowledge - like a company wiki or internal documentation system.

**Related:** See [DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md](./DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md) for how documents and ontology entities (goals, tasks, plans) interact.

---

## The Analogy: Org Chart → Document Structure

A company's org chart maps directly to what knowledge each department needs:

```
COMPANY ORG CHART                    DOCUMENT STRUCTURE
─────────────────                    ──────────────────

BuildOS/                             BuildOS Wiki/
├── Company                          ├── 🏢 Company
│   ├── CEO                          │   ├── Mission & Vision
│   └── Board                        │   ├── Strategic Plan (OKRs)
│                                    │   └── Company History
│
├── Executive                        ├── 👔 Executive
│   ├── CFO                          │   ├── Business Model
│   ├── Fundraising                  │   ├── Fundraising/
│   │                                │   │   ├── Pitch Deck
│   │                                │   │   ├── Financial Model
│   │                                │   │   └── Investor Updates/
│   └── Board Relations              │   └── Governance/
│                                    │       └── Board & Advisors
│
├── Product (CEO/Technical)          ├── 🛠️ Product
│   ├── Engineering                  │   ├── Architecture/
│   │   ├── Backend                  │   │   ├── System Design
│   │   ├── Frontend                 │   │   ├── Tech Stack
│   │   └── Infrastructure           │   │   └── ADRs/
│   │                                │   │
│   ├── Product Management           │   ├── Vision & Roadmap
│   │                                │   ├── Features/
│   └── Design                       │   └── Research/
│                                    │       └── User Feedback
│
├── Growth (CMO)                     ├── 📈 Growth
│   ├── Brand                        │   ├── Brand/
│   │                                │   │   ├── Identity & Guidelines
│   │                                │   │   └── Voice & Tone
│   ├── Marketing                    │   ├── Marketing/
│   │                                │   │   ├── Strategy
│   │                                │   │   ├── Content Calendar
│   │                                │   │   └── Campaigns/
│   └── Community                    │   └── Community/
│
├── Sales & Customer Success         ├── 💰 Sales & CS
│   ├── Sales                        │   ├── Pricing & Packaging
│   │                                │   ├── Sales Playbook
│   └── Customer Success             │   └── Customer Success/
│                                    │       ├── Onboarding
│                                    │       └── Case Studies
│
└── Operations                       └── ⚙️ Operations
    ├── Finance                          ├── Finance/
    │                                    │   └── Budget & Runway
    ├── Legal                            ├── Legal/
    │                                    │   └── Terms of Service
    └── IT/Tools                         └── Tools & Vendors/
```

**The key insight:** Each role/department in the org chart corresponds to a knowledge domain that needs documentation. The document structure mirrors the organizational structure because that's how people think about where information "lives."

---

## The Problem

Currently, the `/projects/[id]` page lists ontology entities (tasks, plans, goals, documents, risks) in flat lists within insight panels. This works for small projects but doesn't scale well for:

1. **Knowledge organization** - No clear place for "where does this information live?"
2. **Contextual discovery** - Hard to find related information
3. **AI agent navigation** - Agents need clear paths to find/update information
4. **Growing projects** - As projects mature, they accumulate context that needs structure

---

## The Solution: Document Hierarchy via `doc_structure`

A wiki-like document tree where:

- Documents belong directly to projects via `project_id` FK (no edge-based containment)
- The hierarchy is stored as a JSONB column `doc_structure` on `onto_projects`
- The JSON holds minimal structural data; full metadata is joined from `onto_documents`
- The tree grows organically as the project develops
- External entities (tasks, events, goals) remain as "insight panels" but are **peripheral** to the document structure

---

## Data Model

### The `doc_structure` Column

**Location:** `onto_projects.doc_structure` (JSONB)

```typescript
interface DocTreeNode {
	id: string; // onto_documents.id (UUID)
	type?: 'folder' | 'doc'; // optional hint; UI derives from children
	order: number; // Sibling ordering (0-indexed)
	children?: DocTreeNode[];
}

// The root structure stored on the project
interface DocStructure {
	version: 1; // Schema version for future migrations
	root: DocTreeNode[]; // Top-level nodes
}
```

**Example (type optional):**

```json
{
	"version": 1,
	"root": [
		{
			"id": "uuid-overview",
			"type": "doc",
			"order": 0
		},
		{
			"id": "uuid-planning-folder",
			"type": "folder",
			"order": 1,
			"children": [
				{ "id": "uuid-roadmap", "type": "doc", "order": 0 },
				{ "id": "uuid-decisions", "type": "doc", "order": 1 }
			]
		},
		{
			"id": "uuid-research-folder",
			"type": "folder",
			"order": 2,
			"children": [{ "id": "uuid-competitor-analysis", "type": "doc", "order": 0 }]
		}
	]
}
```

**Note:** `type` is computed at render time from `children.length > 0`. Any stored `type` value is treated as a hint and can be ignored by UI.

### What's Computed vs Stored

| Stored in JSON         | Computed from `onto_documents` |
| ---------------------- | ------------------------------ |
| `id`                   | `title`                        |
| `type` (optional hint) | `description`                  |
| `order`                | `content`                      |
| `children`             | `state_key`                    |
|                        | `type_key`                     |
|                        | `created_at`                   |
|                        | `updated_at`                   |
|                        | `created_by`                   |

### Enriched Node (For UI Rendering)

When fetching the tree for display, we JOIN with `onto_documents`:

```typescript
interface EnrichedDocTreeNode {
	// From JSON structure
	id: string;
	type: 'folder' | 'doc'; // computed from children
	order: number;
	children?: EnrichedDocTreeNode[];

	// From onto_documents JOIN
	title: string;
	description: string | null;
	state_key: string;
	type_key: string;
	has_content: boolean; // computed: content IS NOT NULL AND content != ''
	created_at: string;
	updated_at: string;

	// Computed for UI
	icon?: string; // derived from type_key or props
	depth: number; // tree depth for indentation
}
```

### The `children` Column on `onto_documents`

Each document knows its immediate children via a `children` JSONB column:

```typescript
// onto_documents.children structure
interface DocumentChildren {
	children: Array<{
		id: string;
		order: number;
	}>;
}
```

**Why both `doc_structure` and `children`?**

- `doc_structure` on project = master tree for full hierarchy
- `children` on document = quick lookup for a document's immediate children
- Keeps documents self-aware of their subtree
- Enables efficient queries without walking full tree

**Dynamic Updates:**
When document A is a child of document B:

1. Update to document A triggers update to B's `children` column (metadata changes)
2. Update to B's structure triggers update to `doc_structure` on the project
3. Cascading updates keep everything in sync

### Structure History Table

For undo/redo and audit trail:

```sql
CREATE TABLE onto_project_structure_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  doc_structure JSONB NOT NULL,
  version INTEGER NOT NULL,
  changed_by UUID REFERENCES onto_actors(id),
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  change_type TEXT NOT NULL  -- 'create', 'move', 'delete', 'reorder', 'reorganize'
);
```

**Retention:** Keep last 50 versions per project, or 90 days, whichever is greater.

---

## Removing Documents from Edge-Based Containment

### Current State

- Documents linked via `onto_edges` with `has_part` relationship
- `ALLOWED_PARENTS['document'] = ['document', 'project']` in `containment-organizer.ts`

### Migration Plan

1. **Update `containment-organizer.ts`:**
    - Remove `document` from `ALLOWED_PARENTS`
    - Remove `has_part` handling for documents
    - Keep edge system for all other entities

2. **Clean up existing document edges:**
    - Delete document-to-document containment edges (`src_kind = 'document' AND dst_kind = 'document' AND rel = 'has_part'`)
    - Keep semantic document edges (e.g., task → document)
    - Containment now lives in `doc_structure`

3. **Documents use FK only:**
    - `onto_documents.project_id` remains the authoritative link to project
    - Position in hierarchy comes from `onto_projects.doc_structure`

---

## Organic Growth Model

Projects should naturally get more organized over time. Here's the progression:

### Stage 1: Seed (Project Created)

When a project is first created:

```json
{
	"version": 1,
	"root": [
		{
			"id": "uuid-overview",
			"type": "doc",
			"order": 0
		}
	]
}
```

The `_Overview` doc is auto-created with the brain dump context. Tasks exist as ontology entities but aren't in the doc tree.

### Stage 2: Sprouting (First Few Weeks)

As the user adds goals, notes, or AI suggests structure:

```json
{
	"version": 1,
	"root": [
		{ "id": "uuid-overview", "type": "doc", "order": 0 },
		{ "id": "uuid-goals", "type": "doc", "order": 1 },
		{ "id": "uuid-notes", "type": "doc", "order": 2 }
	]
}
```

### Stage 3: Branching (Active Development)

Folders emerge to organize related content:

```json
{
	"version": 1,
	"root": [
		{ "id": "uuid-overview", "type": "doc", "order": 0 },
		{ "id": "uuid-goals", "type": "doc", "order": 1 },
		{
			"id": "uuid-planning-folder",
			"type": "folder",
			"order": 2,
			"children": [
				{ "id": "uuid-roadmap", "type": "doc", "order": 0 },
				{ "id": "uuid-decisions", "type": "doc", "order": 1 }
			]
		},
		{
			"id": "uuid-research-folder",
			"type": "folder",
			"order": 3,
			"children": [
				{ "id": "uuid-competitor-analysis", "type": "doc", "order": 0 },
				{ "id": "uuid-user-interviews", "type": "doc", "order": 1 }
			]
		}
	]
}
```

### Stage 4: Mature (Full Wiki)

The full structure from the example in the appendix.

### Growth Triggers (AI-Assisted)

Rather than templates, use intelligent triggers:

| Trigger                     | Suggestion                     |
| --------------------------- | ------------------------------ |
| First goal added            | "Create a Goals document?"     |
| 3+ related docs at root     | "Group these into a folder?"   |
| External link added         | "Create a References section?" |
| AI detects research content | "Move to Research folder?"     |
| 5+ root-level docs          | "Let me help organize this"    |

---

## API Design

### 1. Get Document Tree

```typescript
// GET /api/onto/projects/[id]/doc-tree
interface GetDocTreeResponse {
	structure: DocStructure;
	documents: Record<string, OntoDocument>; // keyed by id for O(1) lookup
}
```

### 2. Update Tree Structure

```typescript
// PATCH /api/onto/projects/[id]/doc-tree
interface UpdateDocTreeRequest {
	structure: DocStructure;
}
```

### 3. Create Document (Auto-Updates Tree)

```typescript
// POST /api/onto/documents
interface CreateDocumentRequest {
	project_id: string;
	title: string;
	content?: string;
	description?: string;
	type_key?: string;
	// Placement in tree
	parent_id?: string; // null = root level
	position?: number; // index in siblings, default = append
}
```

When a document is created:

1. Insert into `onto_documents`
2. Recompute `doc_structure` to include new doc
3. Return the updated tree

**Invalid parent handling:** If `parent_id` doesn’t exist (stale client), treat as `null` and append to root.

### 4. Delete Document (Auto-Updates Tree)

When a document is deleted:

1. Soft-delete in `onto_documents` (`deleted_at = now()`)
2. Recompute `doc_structure` to remove the node
3. If folder, choose:
    - `cascade` (default): delete folder + remove subtree from `doc_structure`
    - `promote`: remove folder, lift children to the folder’s parent

### 5. Move Document

```typescript
// POST /api/onto/projects/[id]/doc-tree/move
interface MoveDocumentRequest {
	document_id: string;
	new_parent_id: string | null; // null = root
	new_position: number;
}

**Invalid parent handling:** If `new_parent_id` is invalid or self-referential, treat as `null` (root).
```

---

## Recomputation Strategy

### When to Recompute

The `doc_structure` should be recomputed when:

1. **Document created** - Add new node to tree
2. **Document deleted** - Remove node from tree
3. **Document moved** - Update parent/position
4. **Reorder siblings** - Update order values

### Recomputation Logic

```typescript
async function recomputeDocStructure(
	supabase: SupabaseClient,
	projectId: string
): Promise<DocStructure> {
	// 1. Fetch current structure
	const { data: project } = await supabase
		.from('onto_projects')
		.select('doc_structure')
		.eq('id', projectId)
		.single();

	const currentStructure = project?.doc_structure as DocStructure | null;

	// 2. Fetch all active documents for project
	const { data: docs } = await supabase
		.from('onto_documents')
		.select('id')
		.eq('project_id', projectId)
		.is('deleted_at', null);

	const activeDocIds = new Set(docs?.map((d) => d.id) ?? []);

	// 3. If no current structure, build fresh
	if (!currentStructure) {
		return buildInitialStructure(docs ?? []);
	}

	// 4. Prune deleted docs from structure
	const prunedRoot = pruneDeletedNodes(currentStructure.root, activeDocIds);

	// 5. Find orphaned docs (in DB but not in structure)
	const structureDocIds = collectDocIds(prunedRoot);
	const orphanedDocs = [...activeDocIds].filter((id) => !structureDocIds.has(id));

	// 6. Append orphans to root
	const maxOrder = Math.max(...prunedRoot.map((n) => n.order), -1);
	const orphanNodes: DocTreeNode[] = orphanedDocs.map((id, i) => ({
		id,
		type: 'doc' as const,
		order: maxOrder + 1 + i
	}));

	return {
		version: 1,
		root: [...prunedRoot, ...orphanNodes]
	};
}
```

### Consistency Guarantees

- **Source of truth:** `onto_documents` table (what exists)
- **Structure of truth:** `doc_structure` JSON (how it's organized)
- **Reconciliation:** On every mutation, ensure JSON reflects DB reality
- **Orphan handling:** Docs in DB but not in structure get appended to root

---

## UI Behavior

### Tree View (Desktop)

- Collapsible/expandable nodes
- Visual distinction for folders vs. leaf documents
- Folder icon for documents with children
- File icon for leaf documents
- Indentation shows depth
- Click to open document in modal/editor
- Drag-drop to reorder or move between parents
- Right-click for context menu (create child, move, delete)
- Default: show first 3 levels expanded

### Tree View (Mobile) - Document Index Style

Mobile uses a **phone book / document index** display:

- Flat but visually nested (indentation indicates depth)
- Similar to HTML headings (h1, h2, h3, h4, h5)
- Default shows first 3 levels, expand to see deeper
- Breadcrumb drill-down navigation:
    - Tap folder to drill down, showing its children
    - Breadcrumb at top shows current path
    - Back button / breadcrumb tap to go up

```css
/* Document index style */
.doc-tree-mobile {
	--indent-level-1: 0;
	--indent-level-2: 1rem;
	--indent-level-3: 2rem;
	/* etc */
}
```

### Unlinked Documents Section

Documents that exist in DB but aren't in the tree structure show in a separate "Unlinked Documents" section:

- Displayed below the main tree
- Can be dragged into the tree to re-link
- Helps users find orphaned content
- AI agents should NOT delete documents, only reorganize
- Unlinked documents may still have `children` metadata; the tree remains the source of truth

### Insight Panels (Right Column)

Remain as they are today:

- Goals panel
- Plans panel
- Tasks panel
- Events panel
- Risks panel

These show entities that may or may not be linked to specific documents.

### Document Modal/Editor

When a document is opened:

- Show breadcrumb path (e.g., `Executive > Fundraising > Pitch Deck`)
- Full markdown editor
- Option to create child document
- Option to move to different parent
- Links to related entities (tasks, goals, etc.)

### Wiki-Style Document Links

Documents can link to each other using markdown format:

```markdown
See the [Pitch Deck](document:uuid-of-pitch-deck) for investor details.
```

**URL Pattern:** `/projects/[id]?doc=doc_id`

- Visiting this URL opens the project with the document modal open
- Similar to history page: `/history?id=chat_id&itemType=chat_session`

**Research task (deferred):** Unify linking system across documents, history page, and next steps.

### Deletion Behavior

**Deleting a leaf document:**

- Simple confirmation dialog
- Soft-delete (`deleted_at = now()`)
- Removed from `doc_structure`

**Deleting a folder (document with children):**

- Confirmation popup with options:
    - "Delete folder and all contents" (`cascade`)
    - "Delete folder, keep contents" (`promote` → children move to parent)
    - "Cancel"
- Clear warning about what will happen

**AI behavior:** Agents should NOT delete documents, only reorganize structure.

### Real-Time Updates

**Strategy:** Polling with notification (not full real-time)

- Poll for `doc_structure` changes every 30 seconds
- Compare version number with current
- If different, show notification:

```
+-------------------------------------------+
|  Document tree has been updated.          |
|  [Refresh]  [Dismiss]                     |
+-------------------------------------------+
```

- "Refresh" reloads structure
- "Dismiss" keeps working with current view

---

## Implementation Plan

### Phase 1: Database & Core Services

1. **Migration: Add `doc_structure` column**

    ```sql
    ALTER TABLE onto_projects
    ADD COLUMN doc_structure JSONB DEFAULT '{"version": 1, "root": []}';
    ```

2. **Migration: Clean up document edges**

    ```sql
    DELETE FROM onto_edges
    WHERE src_kind = 'document' OR dst_kind = 'document';
    ```

3. **Update `containment-organizer.ts`**
    - Remove `document` from `ALLOWED_PARENTS`
    - Remove document-related edge logic

4. **Create `doc-structure.service.ts`**
    - `getDocTree(projectId)`
    - `updateDocStructure(projectId, structure)`
    - `recomputeDocStructure(projectId)`
    - `addDocumentToTree(projectId, docId, parentId?, position?)`
    - `removeDocumentFromTree(projectId, docId)`
    - `moveDocument(projectId, docId, newParentId, position)`

### Phase 2: API Endpoints

1. `GET /api/onto/projects/[id]/doc-tree`
2. `PATCH /api/onto/projects/[id]/doc-tree`
3. `POST /api/onto/projects/[id]/doc-tree/move`
4. Update `POST /api/onto/documents` to auto-update tree

### Phase 3: UI Components

1. `DocTreeView.svelte` - Collapsible tree component
2. `DocTreeNode.svelte` - Individual node with expand/collapse
3. Update document creation flow to include placement
4. Drag-drop reordering

### Phase 4: AI Integration

1. Tree structure suggestions based on content analysis
2. Auto-organization prompts
3. Agent navigation using tree paths

---

## AI Organization

### Agent Context

When an AI agent is creating or organizing documents:

1. `doc_structure` is included in project context
2. Structure includes `id`, `title`, and `description` of every document
3. Agent uses good judgment to place new documents appropriately

### Agent Responsibilities

- When creating a document, agent MUST update the `doc_structure` column
- Agent should place documents logically based on content and existing structure
- If creating a new category, agent can create a folder-style document first
- Agent can reorganize structure when asked (just update `doc_structure`)
- Agent should NOT delete documents, only reorganize

### No Special Tools Needed

- No "find best location" tool - agent uses judgment
- No confirmation step - users can reorganize manually
- Reorganization = updating the `doc_structure` column via existing tools

---

## Decisions Made

All open questions have been resolved. See [HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md](./HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md) for full decision log.

| Question             | Decision                                                                  |
| -------------------- | ------------------------------------------------------------------------- |
| Templates            | No templates - start with Overview doc, grow organically                  |
| Folder semantics     | Any document can have children; `type` is optional and computed at render |
| Cross-linking        | No - single location only, use markdown links for cross-references        |
| Search               | Deferred - show breadcrumb path in results (future)                       |
| Folder deletion      | Prompt user: "delete all" vs "move children up"                           |
| Concurrency          | Optimistic locking with version check                                     |
| Structure versioning | Separate history table for undo/redo                                      |
| Mobile UX            | Phone book / document index style with breadcrumb navigation              |
| Wiki links           | `[title](document:id)` format with URL params                             |
| Real-time            | Poll + notification popup (not full real-time)                            |
| AI organization      | Full context, agent judgment, no special tool                             |

---

## Example Full Structure

For a company/startup project at maturity:

```
BuildOS Wiki/
│
├── 🏢 Company
│   ├── _Company Overview.md
│   ├── Mission & Vision.md
│   ├── Core Values.md
│   └── Glossary.md
│
├── 👔 Executive
│   ├── _Executive Overview.md
│   ├── Business Model.md
│   │
│   └── /Fundraising
│       ├── Pitch Deck.md
│       ├── Financial Model.md
│       └── /Updates
│           └── [Monthly Updates]
│
├── 🛠️ Product
│   ├── _Product Overview.md
│   ├── Roadmap.md
│   │
│   ├── /Architecture
│   │   ├── System Design.md
│   │   └── Tech Stack.md
│   │
│   └── /Features
│       ├── Brain Dump.md
│       └── Calendar Integration.md
│
├── 📈 Growth
│   ├── _Growth Overview.md
│   │
│   ├── /Brand
│   │   └── Brand Identity.md
│   │
│   └── /Marketing
│       ├── Content Strategy.md
│       └── /Campaigns
│
└── ⚙️ Operations
    ├── _Operations Overview.md
    │
    ├── /Finance
    │   └── Budget.md
    │
    └── /Legal
        └── Terms of Service.md
```

---

## Related Documents

- [HIERARCHICAL_DOCUMENTS_HANDOFF.md](./HIERARCHICAL_DOCUMENTS_HANDOFF.md) - **Agent handoff doc (start here if picking up work)**
- [HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md](./HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md) - All decisions made
- [HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md](./HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md) - Implementation tracking
- [DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md](./DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md) - How docs vs entities work
- [DATA_MODELS.md](./DATA_MODELS.md) - Database schema

## Related Code Files

- Current project page: `/apps/web/src/routes/(app)/projects/[id]/+page.svelte`
- Doc structure service: `/apps/web/src/lib/services/ontology/doc-structure.service.ts`
- Containment organizer: `/apps/web/src/lib/services/ontology/containment-organizer.ts`
- Type definitions: `/apps/web/src/lib/types/onto-api.ts`
