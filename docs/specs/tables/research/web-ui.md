<!-- docs/specs/tables/research/web-ui.md -->

# Tables in BuildOS web — UI slice research (2026-10-04)

All paths are relative to `apps/web/src/` unless noted. Line numbers are from the current
working tree (desktop reader work is committed as of c46356469). Nothing was edited, run or built.

---

## 1. Documents UI today

### Editor: CodeMirror 6 editing raw Markdown (not Tiptap)

- Tiptap is installed (`apps/web/package.json` `@tiptap/*`) but used **only** by
  `lib/components/email/EmailComposer.svelte`.
- Documents edit in `lib/components/ui/RichMarkdownEditor.svelte` (800 lines). It wraps
  `lib/components/ui/codemirror/CodeMirrorEditor.svelte` with an Edit/Preview segmented
  control (546-581), a toolbar (228-250 button defs; 584-656 markup), and voice dictation.
    - Toolbar actions: bold, italic, h1, h2, ul, ol, quote, code, link, image. Image appears only
      when the host passes `onInsertImageRequested` (245-247). **No table button.**
    - Exported `insertAtCursor(markdown)` (496-504) is the hook hosts use to drop content in.
    - Preview renders `{@html renderMarkdown(value)}` inside `getProseClasses()` (721-737).
    - Outer frame is `overflow-hidden` (541).
- `lib/components/ui/codemirror/extensions.ts:192` uses plain `markdown()` (no
  `base: markdownLanguage`), so GFM tables get no special syntax handling while editing: they are
  just pipe text in a monospace editor (`inkprint-theme.ts`).
- There is a widget precedent: `codemirror/voice-widget.ts` uses `StateField` +
  `Decoration.widget` + `WidgetType` (lines 24-28, 65, 124, 177-284). A table-embed block
  widget would follow the same pattern.

### Rendering Markdown (tables DO render, read-only)

- `lib/utils/markdown.ts`: `marked` with `gfm: true` (20-24). `renderMarkdown` (281-292)
  runs `normalizeMarkdownTables` (`lib/utils/markdown-text.ts:57`) then `sanitize-html`.
- The sanitizer allowlist includes `table/thead/tbody/tr/th/td` (51-56) with only `align` attrs
  (69-70). **No `div`/`span`, no `class` on anything except `code`/`pre` `language-*`
  (72-75), no `data-*`.** Anything richer, like an embed, has to hydrate after sanitizing.
- Styling: `getProseClasses()` adds `prose-table:overflow-x-auto prose-table:block`
  (`markdown-text.ts:156`). Borders come from `tailwind.config.js:306-307`. The result: a GFM
  table becomes a horizontally scrollable block with no sticky header and no editing.
- Chat has its own better table renderer: `lib/components/agent/agent-chat-markdown.ts:21-31`
  wraps each sanitized `<table>` in `.agent-markdown-table-shell > .agent-markdown-table-scroll`
  with a "Scroll →" cue. It sets role=region/aria-label when the table scrolls (364-395), uses a
  ResizeObserver (411+), and its CSS is in `AgentMessageList.svelte:1411-1470`.

### Where documents open

1. **Desktop reader** (the new Peek/Focus/Page reader)
    - `lib/components/projects/desktop/DesktopReader.svelte` (1101 lines). It handles one
      doc/task/goal at a time.
        - Loads with `fetchEntityModalData(kind,id)` (`lib/components/project/entity-modal-data.ts`,
          endpoint `/api/onto/{kind}s/{id}/full?include_linked=false`).
        - Read mode: `{@html renderMarkdown(current.doc.content)}` at 610.
        - Edits in place: `startEdit` lazy-imports RichMarkdownEditor (~186-200). Autosave is
          debounced 1500 ms and PATCHes `/api/onto/documents/{id}` with `expected_updated_at` +
          `expected_editor_revision` (202-257). On a 409 it shows a conflict note with
          "Load the latest" / "Keep mine" (264-278, 574-586).
        - Keys: E edit, F focus, J/K prev/next, Esc (handleKey ~380-398). Phone thumb bar with a
          drag handle (`data-sheet-drag`).
        - CSS: `.body { overflow-y:auto }` (942-949). **`.body > :global(*) { max-width: 72ch }`
          (953-955) would squeeze a grid.**
    - Model: `lib/components/projects/desktop/reader-model.ts`. It has
      `ReaderKind = 'document'|'task'|'goal'` (7) and the pane modes list|peek|focus|reader-chat|all|list-chat
      (14-33). Phone sheet detents come from `sheetAfterDrag` (62-73). Layout is remembered in
      localStorage (75-92). `KIND_WORD` is at 101-105.
    - Host: `lib/components/projects/desktop/DesktopProjectCard.svelte`. The phone breakpoint is
      `MediaQuery('max-width: 767px')` (213-214). The reader is lazy-loaded on mount (215-222).
      `DesktopChatPane.svelte` is the chat beside it, which embeds AgentChatModal with
      `focusType: item.kind`.
    - Shallow history: `ProjectDesktop.svelte:260-321` (`page.state.desktopPeek`, pushState).
2. **DocumentModal**: `lib/components/ontology/DocumentModal.svelte` (5193 lines).
    - The main surface is always RichMarkdownEditor (4252-4300). Title and metadata sit in a
      Details rail.
    - The rail holds LinkedEntities (4093-4104, mobile 4436), Images (4108-4136), Version history,
      Voice notes and Activity.
    - Mobile tabs are defined at 2960-2974 (Links / Media / History / ...).
    - It already reads `type_key` (209, 1695) for special cases (`document.context.project`,
      `document.context.thinking_log`, 455-456). That precedent shows type_key can switch UI.
3. **Full page**: `routes/projects/[id]/documents/[document_id]/+page.svelte` (1140 lines).
   It has RichMarkdownEditor (603), LinkedEntities (672) and a sidebar. The root is
   `overflow-x-hidden` (456), so its `sticky top-0` header (458) is inert. The `lg:sticky`
   sidebar (714) is inert too.

### Doc tree rendering (including image assets)

- The data is `onto_projects.doc_structure` JSON, `{version, root: DocTreeNode[]}`. Node ids are
  `onto_documents` ids, and folder vs doc is derived from whether a node has children
  (`packages/shared-agent-ops/src/ontology/onto-api.ts:296-366`). `EnrichedDocTreeNode` carries
  `type_key` (348), so the tree can branch on doc subtype with **no schema change**.
- `lib/components/ontology/doc-tree/DocTreeView.svelte` (1038 lines) fetches
  `/api/onto/projects/{id}/doc-tree`. It loads images separately from
  `/api/onto/projects/{id}/doc-tree/images` (402-420). The Images shelf renders at 786-800, and
  AssetDetailModal is the viewer (982+).
- `DocTreeNode.svelte` (639 lines): the icon is Folder/FolderOpen/FileText (355-365). The image
  count pill sits on collapsed docs (377-384). Filed images render as child rows with a thumbnail
  after child docs (488-517). A document that has images expands like a folder (`isExpandable`,
  ~117).
- `tree-images.ts`: images are placed through `onto_asset_links` (`entity_kind='document'`),
  **never in doc_structure**. Unfiled images go to the shelf (`groupTreeImages`). The viewer walk
  order is `treeImageViewerOrder`. `DocTreeImageShelf.svelte` is the shelf UI.
- Context menu actions (`DocTreeContextMenu.svelte`): open, create-child, copy-public-link,
  open-public-page, manage-public-page, publish-public-page, move, archive.
- Desktop card docs list: `DesktopProjectCard.svelte` `docRows` snippet (~810-890). It shows a
  FileText/FolderOpen glyph, an open button and Move.

---

## 2. Linking UX today

- **No @mention or slash-command linking in documents.** The doc editor has no autocomplete for
  entities.
- **Entity-reference grammar exists**: `[[type:id|Display]]`
  (`packages/shared-agent-ops/src/utils/entity-reference-parser.ts`).
    - Regex at 42. `VALID_ENTITY_TYPES` (47-60) covers project, task, document, note, goal,
      milestone, risk, plan, requirement, source, edge and user. **No `table` yet.**
    - `renderEntityReferencesAsHtml` (213-232) emits
      `<a class="entity-ref" data-entity-type data-entity-id>`.
    - It's used for comments/mentions (`[[user:id|Name]]`, `CommentTextareaWithVoice.svelte:320`,
      doc PATCH mention notifications in `routes/api/onto/documents/[id]/+server.ts:784-810`) and
      for next-step text (`OntologyProjectEditModal.svelte:703-725`, project-list,
      dashboard-presentation).
    - It is **not** rendered in document bodies: `renderMarkdown` would strip the class and data
      attributes anyway.
- **Inline links in doc bodies** are plain Markdown links to record routes. `buildRecordHref`
  (`packages/shared-types/src/record-routes.ts`) builds `/projects/{pid}/documents/{id}` and
  `/projects/{pid}/tasks/{id}`. Chat repairs model-made record links
  (`lib/utils/assistant-app-links.ts`). In-document clicks are plain navigations; nothing
  intercepts them to open the reader or a modal.
- **Linked-entities panel** = the main linking UX:
  `lib/components/ontology/linked-entities/LinkedEntities.svelte`.
    - Sections appear grouped by kind. "Add" opens `LinkPickerModal.svelte`.
    - Data comes from `/api/onto/edges/linked`, `/edges/available`, `POST /api/onto/edges` and
      `DELETE /api/onto/edges/{id}` (`linked-entities.service.ts:200-470`).
    - Kinds: `EntityKind` (`linked-entities.types.ts:12-20`). `ALLOWED_LINKS` lets a document link
      to task/plan/goal/milestone/document/risk (113-121). `ENTITY_SECTIONS` sets the colors
      (221-235).
    - Used in DocumentModal, TaskEditModal (53, 1503-1510, click router 959-976), the full doc page,
      and other modals.
- **Image insert = the best template for "embed a table in a doc"**:
    - DocumentModal `openImageInsertModal` → `<Modal title="Insert Image">` with
      `ImageAssetsPanel pickerMode linkRole="inline"` (4793-4820).
    - `handleInsertImageAsset` inserts `![alt](/api/onto/assets/{id}/render)` through
      `editor.insertAtCursor` (3248-3259). The `inline` link role also records an
      `onto_asset_links` row.

---

## 3. Project page surfaces

- `/projects` → `routes/projects/+page.svelte` renders **ProjectDesktop**
  (`lib/components/projects/desktop/ProjectDesktop.svelte`): tiles, dock and an opened
  **DesktopProjectCard**.
    - `CardTab = 'inside'|'docs'|'tasks'|'goals'` (`DesktopProjectCard.svelte:13`). Tabs are built
      at 160-173. "Nested projects" (`inside`) leads when the project has children and trails when
      it has none.
    - The tab panel is at 575-700. Clicking a row opens the reader (Peek/Focus/Page). Chat opens
      beside it.
    - Card data comes from `/api/onto/projects/{id}/card` (`desktop-moves.ts:74-76`, zod
      `cardSchema`).
- `/projects/[id]` → `routes/projects/[id]/ProjectWorkspace.svelte` (2326 lines).
    - `WorkspaceTab = 'work'|'overview'|'docs'|'activity'` (107). `TAB_ORDER` (132) is overview,
      work, docs, activity; the visible labels are Overview / Tasks / Docs / Activity (1144-1200).
    - The Tasks tab is `lib/components/project/v2/TaskKanbanBoard.svelte`. The Docs tab is
      `lib/components/project/ProjectDocumentsSection.svelte` → `DocTreeView` (1830-1872).
    - `openEntity(type,id)` (751-795) pushes `?entity=&entity_id=` and mounts lazy modals
      (DocumentModal at 1948-1970; TaskEditModal; `ProjectWorkspaceEntityModals.svelte` for the
      rest).
    - Chat "Created" chips deep-link to `/projects/{pid}?doc={id}`
      (`lib/components/agent/CreatedEntityCards.svelte:44-49`).
- Natural "Tables" entry points:
    - **Doc tree node** (both the workspace Docs tab and the desktop card Docs tab). Tables sit next
      to the docs they support, and move, archive, nest and link with no extra work.
    - **Optional project tab/filter**: a "Tables" CardTab and WorkspaceTab, or a filter chip on
      Docs, listing every table with its row count. This tab is the ambitious version; the doc tree
      is enough at first.

---

## 4. Chat UI: tool results and cards

- The message union is in `lib/components/agent/agent-chat.types.ts:129-142`: user, assistant,
  activity, thinking_block, clarification, agent_peer, `created_entities`, `document_changes`,
  `freshness_card` and `capture_receipt`.
- They render in `AgentMessageList.svelte:1076-1106`: CreatedEntityCards, DocumentChangeCards,
  FreshnessRadarCard and CaptureReceiptChip. SharedDocumentEditCard (a confirm card) is placed by
  `shared-document-edit-cards.ts`.
- **Pattern to copy for a table preview card: DocumentChangeCards.**
    - `document-change-cards.ts` reads a **structured** receipt (`document_change` field) from the
      tool result. It handles both live SSE and restored executions (`extractDocumentChangeReceipt`,
      ~75+), merges one card per document per turn, and calls the Undo endpoint.
    - `DocumentChangeCards.svelte` shows "+X −Y", expands to a diff (`ui/DocumentChangeDiff.svelte`),
      and offers Open and one-click Undo.
    - `AgentChatModal.svelte:2497-2520` (`addDocumentChangesMessage`) appends the
      `document_changes` message with replay dedupe.
- CreatedEntityCards covers "the agent made a table" for free if a table is a `document` kind.
- `DataMutation.entityKind` (`agent-chat.types.ts:204-209`) drives refreshes of open views. A
  document-subtype table reuses `'document'`.
- Agent replies containing GFM tables already render nicely, with a scroll shell (see §1). That
  is the seed of "produce tables from research".

---

## 5. Existing tabular UI and dependencies

- **No grid library installed.** `apps/web/package.json` has no AG Grid, TanStack, RevoGrid,
  Handsontable, Glide, papaparse, xlsx, exceljs or virtual-list package (confirmed with grep, plus
  the root, packages and worker manifests).
    - `d3-dsv` appears only transitively via `@antv/vendor` (pnpm-lock 7120-7146). Don't rely on it.
- 38 files use `<table>`, nearly all admin, plus `ContactImportPreview.svelte`,
  `routes/privacy`, `routes/profile/agent-keys/...` and `AnswerComparisonLab`.
    - The pattern is plain `div.overflow-x-auto > table` with `micro-label` thead
      (e.g. `lib/components/admin/chat-users/ChatUsersTable.svelte:43-75` with sort buttons).
    - None are editable or virtualized, none have sticky headers, and **no `aria-sort` exists
      anywhere**.
- Reusable pieces:
    - The chat table scroll shell (`agent-chat-markdown.ts` + CSS in `AgentMessageList.svelte`).
    - CSV parse: `lib/server/user-contact.service.ts:128` `parseCsvRows` (quoted fields, CRLF;
      caps 2 MB / 500 rows at 71-72).
    - CSV write: `lib/components/admin/chat-users/chat-user-export.ts:78-88` `csvCell`/`csvRows`.
    - Roving-tab keyboard helper: `lib/components/project/v2/board-a11y.ts`
      (`handleRovingTabKeydown`).
    - Task Kanban visuals for a future "Board" view: `TaskKanbanBoard.svelte`.
- No virtualization component exists (`lib/utils/performance-optimization.ts` only mentions it).

---

## 6. Recommendation: smallest credible UI integration

### Fork the data slice decides (affects UI cost a lot)

**A table is a document subtype** (`onto_documents.type_key = 'document.table'`, body = CSV or JSON
rows plus a column schema in props), versus a new entity. From the UI side the subtype is far
cheaper. These come for free:

- doc tree placement, nesting, move and archive
- public pages and version history
- LinkedEntities (doc↔task already allowed)
- reader/modal routing and chat focus (`focusType: 'document'`)
- CreatedEntityCards and DataMutation refresh

`type_key` is a structured channel (AGENTS.md allows it). A separate entity would need new
ReaderKind/EntityKind/DataMutation kinds, a doc-tree overlay like images
(`doc-tree/images` + `onto_asset_links`), new modal routing and a new card schema.

### Where a table opens and how it renders

New component `lib/components/tables/TableGrid.svelte` (plus `table-model.ts`, pure and tested),
mounted by branching on `type_key`:

1. **DesktopReader**: add a branch next to `current.doc` at ~588-614.
    - Read-only grid by default. **E** turns on cell editing, and autosave reuses the same
      debounced PATCH + `expected_updated_at` conflict flow (202-278).
    - Exempt the grid from the 72ch cap (953-955). Opening a table could default to **Focus**
      layout so the grid gets the full card width.
2. **DocumentModal**: when type_key is a table, render TableGrid instead of RichMarkdownEditor in
   the main area (4274-4299). Keep the Details rail (links, history, activity).
    - Use `Modal contentScrollable={false}` semantics so the grid owns its own scroll.
3. **Full page** `routes/projects/[id]/documents/[document_id]/+page.svelte`: same branch at ~600.

Read-only versus editing: read mode is a plain `<table role="grid">` (fast and accessible). Edit
mode makes the focused cell an `<input>`:

- Enter or typing starts an edit; Esc cancels; Tab and Enter commit and move.
- Add-row and add-column affordances, with column types text/number/date/select/checkbox.
- Numbers and dates use `.stamp` (tabular numerals).

### In the doc tree

- `DocTreeNode.svelte:355-365`: show a table icon (`Table2`) when `node.type_key === 'document.table'`,
  with a row-count pill styled like the image pill (377-384).
- DocTreeView and its context menu get "New table" (also from the empty state and the
  ProjectDocumentsSection "+").
- Desktop card `docRows` gets the same icon branch. Optional later: a Tables CardTab and
  WorkspaceTab.

### Document → table link and embed

- **Link (works today, zero code)**: a Markdown link to the table's record route, plus a
  LinkedEntities edge (doc↔document is allowed).
    - Small upgrade: intercept clicks on in-app record links inside rendered doc bodies so they open
      in the reader or modal instead of navigating away.
- **Embed (lean)**: mirror the image insert. RichMarkdownEditor gets `onInsertTableRequested`
  (copying 92/245) and a "Table" toolbar button. A picker modal lists project tables or offers
  "New table", and the chosen table is inserted at the cursor as a fenced block:
    ````
    ```buildos-table
    <table-uuid>
    ````
    ```
    This survives the sanitizer with no changes, because `code` keeps `language-*` classes
    (`markdown.ts:72-75`). After `{@html}`, an attachment finds `code.language-buildos-table`,
    validates the UUID (a structured format, so regex is allowed), and mounts a read-only
    `TableEmbed` (first ~10 rows, column headers, "Open table"). In the editor it stays a readable
    fence.
    - The server should keep a `references` edge for each embed (data slice).
    ```
- **Embed (ambitious)**: a CodeMirror block-widget decoration (the voice-widget pattern) that
  shows the live preview inside the editor as well.

### Chat

- A `table_changes` card (copying DocumentChangeCards): reads a structured `table_change` receipt
  and shows "+3 rows · 5 cells", a mini diff grid, Open and Undo.
- **Cheap bridge from research to table**: in the chat table shell, inject a "Save as table"
  button post-sanitize, the same way the scroll cue is injected (`agent-chat-markdown.ts:21-31`).
  The client reads the rendered `<table>` DOM, which is structured data, and creates a
  `document.table`.

### Phone

- The reader is a bottom sheet (`phone` below 768px). Opening a table jumps to the `full` detent
  (as `startEdit` does).
- The default phone view is **rows as cards**: the first column is the title, plus 2-3 key
  fields. Tapping a card opens a row editor sheet (a form of all columns). A "Grid" toggle gives a
  horizontally scrolling grid with a sticky first column.
- Inputs use `text-base sm:text-sm` (16px floor, so iOS doesn't zoom). Rows are at least 44px.

### Inkprint constraints for the grid

- Tokens only:
    - `bg-card`/`bg-background` surfaces, `border-border` gridlines
    - `border-border-strong` for cell inputs (meets 3:1)
    - `text-muted-foreground` + `.micro-label` headers
    - selection `bg-accent/15` (matches tree selection), `ring-ring` focus
    - no raw palette colors and no arbitrary `text-[..]` sizes
- Dense spacing (p-2, text-sm). Light/dark comes automatically from the tokens.
- Icons come through `$lib/icons/lucide`. `Table` is exported (`lib/icons/lucide.ts:229`).
  `Table2`, `Sheet` and `FileSpreadsheet` exist in lucide-svelte 0.536 but must be added to the
  wrapper (guardrail `scripts/check-lucide-wrapper-exports.cjs`). Add a "Table" row to the
  Inkprint §13 icon table. Note that §13 itself uses raw palette colors, which conflicts with
  Law 4; follow the code (tokens) instead.
- a11y:
    - `role=grid` + `aria-rowcount`/`aria-colcount`
    - `aria-sort` on sortable headers (a first for the app)
    - roving tabindex
    - visible focus
    - `prefers-reduced-motion`

### Landmines

1. **Sticky is still inert at page level.** `body { overflow-x:hidden }` (`app.css:26`) and
   `.layout-root overflow-x-hidden` (`routes/+layout.svelte:1048`) are unchanged. Only
   `.app-sheet` moved to `overflow: clip` (~1166).
    - Rule for the grid: **one bounded scroll container that scrolls both axes** (explicit height,
      `overflow:auto`), with a sticky `thead th { top:0 }` and a sticky first column `{ left:0 }`
      inside it. That works whatever the page does.
    - Never put an `overflow-x-auto` wrapper inside a vertical scroller and expect the header to
      stick to the outer scroller.
    - No `overflow:hidden` between a sticky cell and its scroller (use `clip` if clipping is
      needed).
2. The reader's `.body > * { max-width: 72ch }` caps grid width (`DesktopReader.svelte:953-955`).
3. Modal content wrappers are `overflow-hidden` (`ui/Modal.svelte:720, 788-789`). Use
   `contentScrollable={false}` and let the grid scroll itself.
4. The sanitizer strips class, data and div. Embeds must hydrate after rendering (use the
   `language-*` hook) rather than injecting HTML into Markdown.
5. RichMarkdownEditor `maxLength` defaults to 8000 and docs pass 50000. CSV-in-content tables
   would hit that cap, so tables should not go through the Markdown editor at all.
6. CodeMirror's plain `markdown()` doesn't parse GFM tables, so pipe tables are awkward to edit.
   That's another reason not to pitch "edit tables as Markdown".
7. Don't regex-classify chat text to decide "this is a table request". Use a tool argument or
   `type_key` (AGENTS.md).
