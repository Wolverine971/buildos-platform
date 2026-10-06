<!-- docs/specs/tables/README.md -->

# Tables in BuildOS — Research Synthesis (2026-10-04)

Status: research done, nothing built. Awaiting DJ's vision answers and fork picks.
Raw research (file:line refs, sources): `research/` — data-model, chat-tools, web-ui,
product-framing, llm-tables-grids.

## The insight

People don't resent Notion for missing features; they resent having to **design the system
before using it**. Every AI-native table product (Clay, Elicit, Hebbia, Notion 3 agents, Excel
Agent Mode) attacks that setup tax. BuildOS relief: **you never design the table** — you say what
you're tracking (or paste it, or ask a research question) and the agent builds it, fills it, links
it to the work, and keeps it current.

Demand is already in the data: **62 of 530 live docs (11.7%) contain markdown tables** — 142 tables
across 16 projects, mostly research/spec docs, median 13 table lines. Users are already writing
spreadsheets inside documents.

## Reconciled architecture (technical decisions made)

The research agents disagreed on storage (new entity vs document). Decision: **a table is a
document**, because a new ontology kind touches ~99 TS files + ~41 SQL functions; a document
subtype touches ~15–20.

- `onto_documents` row with `type_key = 'document.table'`. Column definitions in a small
  `props.table` (columns keyed by stable column ids so renames never rewrite rows; views).
- New `onto_document_rows`: uuid id, `document_id`, per-table `row_number` (agent handle `r12`,
  never reused), `sort_key text COLLATE "C"` (fractional indexing), `cells jsonb` keyed by column
  id, `version int`, `updated_by_actor`, `deleted_at` (soft delete for undo). **No `project_id`** —
  access via parent doc, so project fold / organize / delete need no changes and the fold coverage
  check stays green.
- New `onto_document_row_ops` (or reuse the change ledger): one entry per batch for undo +
  attribution ("agent changed 14 cells").
- One write RPC per batch: applies row ops with per-row version checks, then regenerates
  `content` as a capped markdown table in the same transaction. Search, embeddings, chat reads,
  versions, public pages keep working unchanged. Body text edits on `document.table` are refused
  (editor + `update_onto_document`).
- Links: table ↔ task/doc via existing edges (`task_has_document`, `link_onto_entities`); row ↔
  task via a `link` column type and/or edge `props.row_id`. Doc bodies get `[[document:id|label]]`
  rendering (benefits all mentions, not just tables).
- Row cap v1: ~10k rows × 50 columns. Generated `content` capped well under the 1 MB search-vector
  limit and 200 KB agent write cap.
- No formulas in v1 (HyperFormula is GPL/paid). Typed values + totals footer + server-side
  aggregates. v1.5: computed columns `{Price} * {Qty}` via an allow-list parser + `@formulajs`.
- CSV: Papa Parse (also parses TSV pasted from Sheets/Excel). Export neutralizes formula injection.

## Agent tool suite (5 tools, existing name prefixes)

| Tool                     | Kind  | Surface          | Purpose                                                                                              |
| ------------------------ | ----- | ---------------- | ---------------------------------------------------------------------------------------------------- |
| `get_onto_table_details` | read  | global + project | Schema, types, stats, row count, links, first page                                                   |
| `read_table_rows`        | read  | global + project | Structured filters/sort/columns/group_by/aggregates, paged (25 default, 100 max)                     |
| `create_onto_table`      | write | project          | Title, columns, initial rows (≤200) or CSV text — research → table in one call                       |
| `update_onto_table`      | write | project          | Title/description, column add/rename/retype/delete, views. Preview on destructive changes            |
| `update_onto_table_rows` | write | project          | `add[]`, `update[{row, values}]`, `delete[row]` by handle; ≤100–200 rows; bulk deletes preview first |

Design rules (from serialization evals + vendor docs): schema-first; short stable row handles,
columns by name, never UUIDs/A1; paged markdown reads with handle as first column (key-value for
wide rows); structured filters, never SQL; model never does arithmetic; conflicts resolved
server-side; preview → confirm for bulk/destructive; every change undoable.

Budget: suite ≈ 8 KB of schema → all prompt-size ratchet caps need a dated re-baseline. Jev
selector drops them on non-table turns; pin them when a table is the focused entity. MCP gets them
through the shared gateway (add ops + `MCP_FETCH_CONFIG`).

## UI plan

- Doc tree node with table icon + row-count pill; "New table" in tree menu and empty states.
- Opens in reader (Focus layout by default, lift the 72ch cap), DocumentModal, and full page by
  branching on `type_key`.
- Desktop grid: RevoGrid free core (MIT; only mature option with free Excel/Sheets range paste,
  fill-down, two-axis virtualization; CSS vars → Inkprint tokens), lazy-loaded, behind one
  `TableView` so it can be swapped. Phone: record cards + row editor sheet.
- Doc embed: toolbar "Table" button (copy the image-insert flow) inserting a fenced
  `buildos-table` block, mounted post-render as a read-only preview.
- Chat: `table_changes` card (copy DocumentChangeCards: +/- counts, open, undo); "Save as table"
  on any table rendered in chat; "Upgrade to live table" on markdown tables in existing docs.

## Landmines

1. `position: sticky` is still broken under `body`/`.layout-root` `overflow-x: hidden` — the grid
   must own its scroll container.
2. Modal content wrappers clip overflow; reader caps width at 72ch.
3. Doc-tree SQL assumes every node id is a document id (fine — tables are documents).
4. Prompt-size ratchet caps are at 37 B / 411 chars headroom; any tool needs a re-baseline.
5. Chat attachments are images only — v1 takes pasted CSV text; file upload needs a worker
   contract change.
6. Connector keys with explicit op lists won't see table ops until regranted.
7. `operational-skill-intent.ts` already regex-routes skills; do not add table keywords — key the
   table playbook off the focused entity.
8. Every row write changes `content` → embedding job; bulk edits must be one RPC call.
9. Fractional sort keys need `COLLATE "C"` or ordering breaks only in prod.
10. Supabase: never create real per-user Postgres tables (PostgREST schema-cache reload outages).

## Open forks for DJ

1. Name: **Tables** (rec) vs Sheets.
2. Feel: **Airtable-lite** (typed columns, cards on phone, no formulas v1 — rec) vs Sheets-lite
   (free cells + formulas).
3. Effort tracking: an effort column on existing tasks (rec, no double entry) vs a separate log
   table.
4. Scope: lean vs ambitious (below).

**Lean:** tables as documents, grid + phone cards, create by chat / paste / CSV / "save as table" /
"upgrade markdown table", typed columns + totals, 5 chat tools + MCP, change card with undo,
links + doc embed, CSV export.

**Ambitious (adds):** question columns (one prompt runs per row, sourced cells — Clay/Elicit;
costs model spend per run), views over your own tasks (Bases-style), brain-dump → row updates,
board view, live "watch the agent fill cells".
