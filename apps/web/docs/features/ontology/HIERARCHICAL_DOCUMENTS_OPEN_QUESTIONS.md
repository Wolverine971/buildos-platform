<!-- apps/web/docs/features/ontology/HIERARCHICAL_DOCUMENTS_OPEN_QUESTIONS.md -->

# Hierarchical Documents - Open Questions & Decisions

**Status:** Decisions Made
**Date:** 2026-01-29
**Last Updated:** 2026-01-29

These are areas that were underexplored, had edge cases, or needed decisions before implementation. **Decisions have now been made.**

---

## 1. Concurrency & Conflict Resolution

**Problem:** Two users editing the tree structure simultaneously.

**Scenarios:**

- User A moves Doc X to Folder A
- User B moves Doc X to Folder B (at the same time)
- Who wins?

**Also:**

- User A deletes a folder
- User B creates a child in that folder
- What happens?

### DECISION: Optimistic Locking

- Version number on `doc_structure` (already have `version: 1` in structure)
- On update, check version matches current
- If stale, reject with conflict error
- Client shows "Structure was modified by another user. Refresh to see changes."
- Simple, predictable, sufficient for expected usage patterns

---

## 2. Tree Structure Versioning

**Problem:** What if someone accidentally destroys the tree structure?

### DECISION: Store `doc_structure` history in a separate table

Create `onto_project_structure_history` table:

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

**Benefits:**

- Can restore any previous structure
- Audit trail of who changed what
- Documents themselves aren't lost even if structure is damaged
- Enables undo/redo in the future

**Retention:** Keep last 50 versions per project, or 90 days, whichever is greater.

---

## 3. Folder Semantics

**Problem:** What exactly IS a folder?

### DECISION: A document is a folder if it has children

No separate "folder" type. Any document can have children. The `type` field in `DocTreeNode` is purely a UI display hint based on whether the document has children.

**Implementation:**

- Add `children` JSONB column to `onto_documents` table
- This column stores lightweight references to child documents
- When a document is updated, parent documents' `children` columns update automatically
- The `doc_structure` column on `onto_projects` is the master structure, but documents know their immediate children
- `type` in `DocTreeNode` is optional; UI computes `folder` vs `doc` from `children.length > 0`

```typescript
// onto_documents.children structure
interface DocumentChildren {
	children: Array<{
		id: string;
		order: number;
	}>;
}
```

**Dynamic Updates:**
When document A is a child of document B:

1. Update to document A triggers update to B's `children` column (metadata like title change)
2. Update to B's structure triggers update to `doc_structure` on the project
3. This creates a cascading update pattern that keeps everything in sync

**UI Behavior:**

- Documents with `children.length > 0` show folder icon and expand/collapse
- Documents with no children show file icon
- A document can have both content AND children (like a README in a folder)

---

## 4. AI Organization Heuristics

**Problem:** How does the AI agent know WHERE to put a new document?

### DECISION: AI gets full doc_structure in context, uses judgment

When the agent is creating a document:

1. `doc_structure` column is included in project context
2. Structure includes `id`, `title`, and `description` of every document
3. Agent uses good judgment to place new documents appropriately
4. No dedicated "find best location" tool needed

**Agent Instructions:**

- When creating a document, the agent MUST update the `doc_structure` column
- Agent should place documents logically based on content and existing structure
- If creating a new category of content, agent can create a folder-style document first

**Auto-Organization:**

- AI can reorganize the `doc_structure` when asked
- Reorganization = updating the `doc_structure` column
- A separate service handles the mechanics of restructuring
- Agent shouldn't delete documents, just reorganize structure

**No confirmation step needed** - agent uses judgment. Users can always reorganize manually.

---

## 5. Search Integration

### DECISION: Defer - Document for later

**What should happen (for future implementation):**

- Search results show full breadcrumb path in results
- Path format: `Company > Executive > Fundraising > Pitch Deck`
- Clicking result opens document with breadcrumb visible
- Eventually: filter by subtree, search within specific folders
- Eventually: boost relevance based on tree position (closer to root = more authoritative?)

**Current state:** Documents have `search_vector` for full-text search. Hierarchy awareness is a separate enhancement.

**Research task:** Investigate how to include path info in search index efficiently.

---

## 6. Mobile UX

### DECISION: Nested display like document index / phone book

**Design Principles:**

- Display structure like HTML headings (h1, h2, h3, h4, h5)
- Flat but visually nested (indentation indicates depth)
- Similar to a document index or phone book
- Default shows first 3 levels of the tree, expand to see deeper

**Navigation:**

- Breadcrumb drill-down for mobile
- Tap folder to drill down, showing its children
- Breadcrumb at top shows current path
- Back button / breadcrumb tap to go up

**Desktop:**

- Full tree visible in sidebar
- Same expand/collapse behavior
- More screen real estate allows deeper visible nesting

**Implementation:**

```css
/* Document index style - flat list with indentation */
.doc-tree-mobile {
	/* Each level gets consistent indentation */
	--indent-level-1: 0;
	--indent-level-2: 1rem;
	--indent-level-3: 2rem;
	/* etc */
}
```

---

## 7. Wiki-Style Links

### DECISION: Use `[doc title](document:doc_id)` format with URL params

**Link Format:**

```markdown
See the [Pitch Deck](document:uuid-of-pitch-deck) for investor details.
```

**URL Pattern:**
Similar to history page: `/projects/[id]?doc=doc_id`

When visiting that URL, the document modal pops up.

**Example URLs:**

- `/projects/abc123?doc=xyz789` - Opens project with doc modal open
- Like history page: `/history?id=chat_id&itemType=chat_session`

**Unification Task (Deferred):**

- Next steps on project page also use markdown linking
- Need to unify the linking system across:
    - Document wiki links (`document:id`)
    - History page links (`?id=&itemType=`)
    - Next steps entity links

**Research task:** Create unified markdown link system spec. Reuse/extend existing patterns.

---

## 8. Import/Export

### DECISION: Defer

Note for future:

- Export tree as folder of markdown files
- Import folder structure to create documents
- Potential Notion/Confluence import

Not needed for MVP.

---

## 9. Invalid Parent IDs

**Problem:** Client requests a parent ID that doesn’t exist (stale tree / race).

### DECISION: Auto-fallback to root

- If `parent_id` / `new_parent_id` is invalid or self-referential, treat it as `null` (root).
- Clamp position to root length.
- This avoids hard failures and prevents “lost” nodes on bad input.

---

## 10. Delete Folder Behavior (Service Layer)

**Problem:** Users may want to delete a folder but keep its contents.

### DECISION: Support two modes at the service layer

- `cascade` (default): remove the node and its subtree from `doc_structure`
- `promote`: remove the node and lift its children to the parent level

**Plan for implementation:**

- Service: `removeDocumentFromTree({ mode: 'cascade' | 'promote' })`
- UI: prompt users when deleting a node with children
- API: accept `mode` param on DELETE endpoint (default `cascade`)

---

## 9. Empty States & Onboarding

### DECISION: Start with Overview doc, grow organically

**New Project Flow:**

1. When project is created (from brain dump or manually)
2. Auto-create `_Overview` or `_Context` document
3. Populate with brain dump context / initial project description
4. This is the only initial structure

**No templates.** AI creates documents as needed based on project activity.

**Growth Triggers (AI-suggested):**

- First goal added -> AI might suggest creating a Goals document
- Research content accumulated -> AI might suggest Research folder
- 5+ root documents -> AI might offer to help organize

**Empty State UI:**

- Show overview document
- Subtle prompt: "Add more documents as your project grows"
- No pressure to create structure upfront

---

## 10. Performance at Scale

### DECISION: Lazy load documents, single JSON structure is efficient

**Architecture:**

- `doc_structure` column stores lightweight tree (just IDs, types, order)
- Full document metadata loaded on demand
- When tree renders:
    1. Load `doc_structure` (fast, single column)
    2. Load visible document metadata (batch query for expanded nodes)
    3. Lazy load deeper content as nodes expand

**Benefits:**

- Single JSONB column is very fast to query
- No recursive queries needed
- Document content loads only when opened
- Can handle 500+ documents efficiently

**Limits:**

- Warn at 500+ documents (suggest archiving old docs)
- Maximum 10 levels deep (UI becomes unwieldy anyway)
- Consider pagination for 50+ siblings at one level

---

## 11. Deletion Behavior

### DECISION: Orphaned docs show as "unlinked", prompt user for folder deletion

**When a document is removed from structure (but not deleted):**

- Shows in a separate "Unlinked Documents" section
- AI agents should NOT delete documents, only reorganize
- Unlinked docs can be re-added to structure anytime

**When user manually deletes a folder:**

1. Show confirmation popup
2. Options:
    - "Delete folder and all contents" (cascade)
    - "Delete folder, keep contents" (children move to deleted folder's parent)
    - "Cancel"
3. Clear warning about what will happen

**When user deletes a leaf document:**

- Simple confirmation
- Document is soft-deleted (`deleted_at = now()`)
- Removed from `doc_structure`

**AI behavior:**

- Agents should NOT delete documents
- Agents can reorganize structure
- Agents can suggest cleanup but user must confirm deletion

---

## 12. Real-Time Updates

### DECISION: Polling with notification popup

**Not full real-time.** Too much complexity for now.

**Polling Strategy:**

- Poll for `doc_structure` changes every 30 seconds
- Compare version number with current
- If different, show notification:

```
+-------------------------------------------+
|  Document tree has been updated.          |
|  [Refresh]  [Dismiss]                     |
+-------------------------------------------+
```

**User Control:**

- "Refresh" - Reload structure, may lose local unsaved state
- "Dismiss" - Keep working with stale structure, merge on next action

**No live updates** to what's currently rendered. Prevents jarring changes mid-work.

---

## 13. Cross-Project Documents

### DECISION: No

Each document belongs to exactly one project. No sharing.

If content is needed across projects, copy it or link to it via markdown.

---

## 14. Template Structures

### DECISION: No templates

AI creates documents as needed. The example company wiki structure is aspirational, not a template to apply.

**Initial project context** is captured in the auto-created Overview/Context document.

**Growth is organic** based on:

- User creating documents
- AI creating documents based on brain dumps
- AI suggesting organization

---

## 15. Undo/Redo

### DECISION: Nice to have, enabled by structure history

Since we're storing `doc_structure` history (Decision #2):

- Undo = restore previous version from history
- Redo = restore next version if available

**UI:**

- Cmd+Z / Ctrl+Z for undo (within recent session)
- History panel shows previous structure versions
- "Restore this version" button

**Implementation:**

- Session tracks structure mutations
- Each mutation saves to history table
- Undo restores previous from session memory or history

**Priority:** After core functionality. Not MVP.

---

## 16. Edge Cases

### Circular References

- **Problem:** Moving a folder into its own descendant
- **Solution:** Validate on move, reject if would create cycle
- **Status:** Implement in `moveDocument()` service function

### Orphaned Documents

- **Problem:** Document exists in DB but not in tree structure
- **Solution:** Show in "Unlinked Documents" section, can be re-added
- **Status:** Part of core design

### Corrupted JSON

- **Problem:** `doc_structure` JSON is invalid or malformed
- **Solution:** Validate on read, rebuild from scratch if corrupt
- **Status:** Add validation in service layer

### Very Deep Nesting

- **Problem:** 10+ levels deep, UI becomes unwieldy
- **Solution:** Allow but use breadcrumb navigation, warn at depth 8+
- **Status:** UI handles gracefully

### Duplicate Titles

- **Problem:** Two docs with same title in same folder
- **Solution:** Allow it. Documents have UUIDs, titles don't need to be unique.
- **Status:** No action needed

---

## Summary of Decisions

| Question             | Decision                                                             |
| -------------------- | -------------------------------------------------------------------- |
| Concurrency          | Optimistic locking with version check                                |
| Structure versioning | Separate history table                                               |
| Folder semantics     | Document with children = folder, `children` column on onto_documents |
| AI organization      | Full context, agent judgment, no special tool                        |
| Search               | Defer - breadcrumb in results (future)                               |
| Mobile               | Phone book / document index style, breadcrumb nav                    |
| Wiki links           | `[title](document:id)` format, URL params                            |
| Import/export        | Defer                                                                |
| Onboarding           | Auto-create Overview doc, grow organically                           |
| Performance          | Lazy load, single JSON structure                                     |
| Deletion             | Orphan to "unlinked", prompt for folders                             |
| Real-time            | Poll + notification popup                                            |
| Cross-project        | No                                                                   |
| Templates            | No - AI creates as needed                                            |
| Undo/redo            | Enabled by history, implement later                                  |

---

## Research Tasks for Later

1. **Unified Markdown Linking System**
    - Unify `document:id`, history page, next steps linking
    - Create consistent URL param pattern
    - Research existing patterns in codebase

2. **Search Integration**
    - Include path in search index
    - Breadcrumb display in results
    - Subtree filtering

3. **Import/Export**
    - Folder -> documents conversion
    - Notion/Confluence import

---

## Related Documents

- [HIERARCHICAL_DOCUMENTS_HANDOFF.md](./HIERARCHICAL_DOCUMENTS_HANDOFF.md) - **Agent handoff doc (start here if picking up work)**
- [HIERARCHICAL_DOCUMENT_TREE_SPEC.md](./HIERARCHICAL_DOCUMENT_TREE_SPEC.md) - Full specification
- [DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md](./DOCUMENTS_VS_ENTITIES_ARCHITECTURE.md) - Architecture decisions
- [HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md](./HIERARCHICAL_DOCUMENTS_IMPLEMENTATION_CHECKLIST.md) - Implementation tracking
- [DATA_MODELS.md](./DATA_MODELS.md) - Database schema
