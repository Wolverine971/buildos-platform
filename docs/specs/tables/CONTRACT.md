<!-- docs/specs/tables/CONTRACT.md -->

# Tables — Build Contract (2026-10-04)

The shared interfaces every Tables work stream builds against. Product context and research:
`docs/specs/tables/README.md` + `research/`. If you must change anything here, change this file
in the same edit and say so in your report.

## Product shape (DJ's vision, ambitious scope)

DJ's acceptance story: he imports his **job-applications spreadsheet** into a project, clicks it
open and sees a usable grid, then chats about it. In chat the agent reads the table, searches and
filters it, does small analyses (counts, groupings, totals), researches individual rows on the web,
and writes findings back into the table (new columns, filled cells with sources, new rows). Rows
can turn into follow-up tasks.

Decided forks: name **Tables**; Airtable-lite (typed columns, no formulas in v1, totals footer);
effort tracking later as a column on tasks; ambitious scope (question columns, sourced AI cells,
board view, save-as-table from chat, upgrade markdown tables).

Plain words in UI copy: "table", "column", "row". Never "database", "schema", "property",
"relation", "base", "collection".

## Storage (DONE — migration `supabase/migrations/20261004230000_document_table_rows.sql`)

- A table is an `onto_documents` row, `type_key = 'document.table'`. Table id == document id.
  Links, tree placement, archive, search, versions, MCP doc reads work as for any document. The
  entity kind for edges stays `document`.
- Schema at `onto_documents.props.table` (`TableSchema`). Rows in `public.onto_document_rows`
  (`TableRow`), keyed cells by column id, `row_number` = agent handle `r12`.
- **All row writes go through `rpc('onto_document_table_apply', {p_document_id, p_ops, p_table,
p_expected_revision, p_actor_id})`** → `TableApplyResult`. It is SECURITY INVOKER: call it with
  the user's Supabase client from the web (RLS decides), or the admin client from the gateway
  (pass `p_actor_id`). It regenerates `content` (markdown projection) and maintains
  `props.table.revision/row_count`. Errors surface as message prefixes (`TableErrorCode`).
- Functional SQL check: `supabase/tests/document_table_rows.check.sql`.
- Generated DB types do not include the new table/RPC until the migration is applied and
  `pnpm gen:all` runs. Until then cast at the call site (`client.rpc('onto_document_table_apply'
as never, ...)`, `.from('onto_document_rows' as never)`) inside `table-repository.ts` only.

## Shared module — `@buildos/shared-agent-ops/tables`

Source: `packages/shared-agent-ops/src/tables/`. Types: `table-types.ts` (DONE). Owned by the
**core** stream. Browser-safe except `table-repository.ts` (takes a Supabase client as an
argument; no env access). Exported from `src/tables/index.ts`, tsup entry
`src/tables/index.ts`, package export `"./tables"`.

| File                  | Exports (exact names)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `table-types.ts`      | all types/consts above (`isTableTypeKey`, `rowHandle`, `parseRowHandle`, `TABLE_LIMITS`, …)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `table-schema.ts`     | `createColumnId(existingIds: Iterable<string>): string` · `normalizeTableSchema(raw: unknown): TableSchema` (repairs missing fields; never throws) · `buildTableSchema(columns: TableColumnInput[], opts?: {source?: TableSchema['source']}): TableSchema` · `resolveColumn(schema, ref: string): TableColumn \| null` (id, then case-insensitive name) · `coerceCellValue(column, raw: unknown): {value: TableCellValue; error?: string}` (strings like "$150k", "yes", "2026-10-04", "Oct 4" → typed; unknown select values are kept and reported via `newChoices`) · `coerceRowInput(schema, input: Record<string, unknown>): {cells: Record<string, TableCellValue>; errors: string[]; newChoices: Record<string, string[]>}` (keys are column names or ids) · `applyColumnChanges(schema, rows: TableRow[], changes: TableColumnChange[]): {schema: TableSchema; rowOps: TableRowOp[]; warnings: string[]}` (retype emits coercion update ops; delete emits ops clearing the cells) · `cellToText(column, value): string` · `primaryColumn(schema): TableColumn \| null`                                                                                                                                                                        |
| `table-query.ts`      | `queryTable(table: LoadedTable, query: TableQuery): TableQueryResult` (pure, in memory; filters/match/search/sort/columns/group_by/aggregates/limit/offset; numbers compare numerically, dates as ISO strings, text case-insensitive; unknown columns → warnings, not throws) · `computeColumnTotals(schema, rows): Record<string, TableAggregateValue>` (sum for number columns, count filled otherwise — the grid footer)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `table-csv.ts`        | `parseDelimitedText(text: string): {headers: string[]; rows: string[][]; delimiter: ',' \| '\t' \| ';'}` (RFC 4180 quotes, CRLF, BOM; auto-detects TSV pasted from Sheets/Excel) · `parseMarkdownTable(markdown: string): {headers: string[]; rows: string[][]} \| null` (one GFM table) · `findMarkdownTables(markdown: string): Array<{start: number; end: number; headers: string[]; rows: string[][]}>` · `inferColumns(headers: string[], rows: string[][]): TableColumnInput[]` (type inference from values: number/currency, date, checkbox, url, email, select when ≤12 distinct values over ≥8 rows, long_text when long) · `importRowsToOps(schema, rows: string[][], headerOrder: string[]): {ops: TableRowOp[]; errors: string[]}` · `tableToCsv(schema, rows): string` (neutralizes formula injection: prefix `'` when a cell starts with `= + - @` tab or CR)                                                                                                                                                                                                                                                                                                                                                                          |
| `table-llm-format.ts` | `formatTableForModel(schema, rows, opts?: {columns?: string[]; offset?: number; totalMatched?: number; maxChars?: number}): string` (markdown table, first column `row` = `r12`, cells capped at `TABLE_LIMITS.modelCellChars` with `…[+N chars]`, AI-filled cells suffixed `†`; switches to key-value blocks when > 8 columns; drops whole rows — never truncates cells — to fit maxChars and ends with a footer like `Rows 1–25 of 142 · next offset 25`) · `describeTableSchemaForModel(schema): string` (one line per column: name · type · choices · description · AI prompt) · `summarizeTableForContext(table: LoadedTable, opts?: {sampleRows?: number; maxChars?: number}): string` (schema + row count + first rows for the focused-table prompt block, default ≤3,000 chars)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `table-change.ts`     | `buildTableChangeReceipt(args: {table: LoadedTable \| {document: TableDocumentSummary; schema: TableSchema}; apply: TableApplyResult; previousSchema?: TableSchema \| null}): TableChangeReceipt` (inverse ops: insert→delete, delete→restore, update→update with before cells+meta, move→move to old position) · `previewTableRowChanges(table: LoadedTable, ops: TableRowOp[]): {rows_added; rows_updated; rows_deleted; cells_changed; sample: TableChangeSample[]; errors: string[]}` (dry run; unknown row ids/columns become errors)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `table-repository.ts` | `loadTable(client, documentId: string, opts?: {includeDeleted?: boolean}): Promise<LoadedTable>` (throws `TableServiceError('TABLE_NOT_FOUND'\|'NOT_A_TABLE')`) · `listProjectTables(client, projectId: string): Promise<TableDocumentSummary & {row_count: number; columns: string[]}[]>` · `createTableDocument(client, args: {projectId: string; actorId: string \| null; title: string; description?: string \| null; columns: TableColumnInput[]; rows?: Record<string, unknown>[]; parentId?: string \| null; position?: number \| null; source?: TableSchema['source']; typeKey?: string}): Promise<{table: LoadedTable; apply: TableApplyResult \| null; warnings: string[]}>` (inserts the document with `props.table`, places it in the doc tree via the existing doc-structure service, records a document version, then applies initial rows) · `applyTableChanges(client, args: {documentId: string; ops: TableRowOp[]; schema?: TableSchema \| null; expectedRevision?: number \| null; actorId?: string \| null}): Promise<TableApplyResult>` (chunks > `maxOpsPerApply` only when no expectedRevision; maps RPC errors to `TableServiceError`) · `class TableServiceError extends Error { code: TableErrorCode; details?: unknown }` |
| `index.ts`            | re-exports all of the above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

Rules: no regex over natural language anywhere (AGENTS.md). Parsing CSV/markdown/number/date
formats is structured parsing and is allowed. Column meaning comes from its declared `type`,
never its name.

Core-stream notes (built 2026-10-04, additive):

- **Browser entry.** `package.json` `"./tables"` has a `"browser"` condition →
  `dist/tables/browser.mjs`: every export above **except** `loadTable`, `listProjectTables`,
  `createTableDocument`, `applyTableChanges` (they pull `node:crypto` via document versions).
  Client components import only the pure helpers; call the `/api/onto/tables` endpoints for I/O.
- Keys: `computeColumnTotals` and `coerceRowInput().newChoices` are keyed by **column id**.
  `withNewChoices(schema, newChoices)` merges new select options into a schema.
- Extra helpers: `formatTableForModelDetailed` (→ `{text, rows_shown, next_offset}`),
  `parseNumberText`, `parseDateText`, `parseBooleanText`, `normalizeUrlText`,
  `normalizeEmailText`, `isEmptyCellValue`, `cellValuesEqual`, `TableDataClient` (loose client type).
- `createTableDocument` is lenient (unreadable cells → `warnings`); the gateway validates strictly
  first. If initial rows fail, the new document is soft-deleted and the error rethrown.
- Gateway: all six `onto.table.*` ops are registered as gateway custom ops
  (`op-execution-gateway.tables.schemas.ts`) with the chat tool names above, so MCP exposes them
  with these schemas regardless of the chat catalog. `onto.table.get` also takes
  `format: 'csv'` (whole table in `table.content`; MCP `fetch table:<id>` /
  `buildos://table/<id>` use it). `previewGatewayTableRowsUpdate` accepts `({admin, userId,
scope, args})` or `(context, args)` and returns `{ok, data: {preview: {rows_added,
rows_updated, rows_deleted, cells_changed, sample}, new_options?, summary}}` or `{ok:false, error}`.

## Web API — `apps/web/src/routes/api/onto/tables/` (owned by the **web-data** stream)

All JSON endpoints use `ApiResponse` from `$lib/utils/api-response`; user-scoped Supabase client;
activity logged as `entity_type = 'document'`.

| Method + path                                  | Body / query                                                                                                                                                                                                                                                   | Returns                                                                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/onto/tables`                        | `{project_id, title, description?, columns?: TableColumnInput[], rows?: Record<string,unknown>[], csv?: string, markdown?: string, parent_id?, source?}` — exactly one of columns+rows / csv / markdown (csv or markdown → `inferColumns` + `importRowsToOps`) | `{table: LoadedTable, warnings}`                                                                                                                                                  |
| `GET /api/onto/tables/[id]`                    | —                                                                                                                                                                                                                                                              | `{table: LoadedTable, totals}`                                                                                                                                                    |
| `PATCH /api/onto/tables/[id]`                  | `{title?, description?, column_changes?: TableColumnChange[], views?: TableView[], primary_column_id?, expected_revision?}`                                                                                                                                    | `{table: LoadedTable, receipt: TableChangeReceipt \| null}`                                                                                                                       |
| `POST /api/onto/tables/[id]/rows`              | `{ops: TableRowOp[], expected_revision?}` (grid edits send per-row `expected_version`)                                                                                                                                                                         | `{apply: TableApplyResult, receipt: TableChangeReceipt}` ; 409 with `{code:'ROW_CONFLICT'\|'TABLE_CONFLICT'}`                                                                     |
| `POST /api/onto/tables/[id]/revert-change`     | `{receipt: TableChangeReceipt}`                                                                                                                                                                                                                                | `{apply, table}` ; 409 when rows moved on                                                                                                                                         |
| `GET /api/onto/tables/[id]/export.csv`         | —                                                                                                                                                                                                                                                              | `text/csv` download (raw response)                                                                                                                                                |
| `POST /api/onto/tables/[id]/rows/[rowId]/task` | `{title?, link_column?: string}`                                                                                                                                                                                                                               | creates a task in the table's project, links task ↔ table doc with an edge (`props.row_id`, `props.row_number`), writes a `link` cell when `link_column` given → `{task, apply}` |
| `POST /api/onto/tables/[id]/ai-fill`           | `{column: string, row_ids?: string[], only_empty?: boolean}`                                                                                                                                                                                                   | enqueues a `table_ai_fill` job → `{run_id, row_count}` (owned by the **ai-columns** stream)                                                                                       |
| `GET /api/onto/tables/[id]/ai-fill/[runId]`    | —                                                                                                                                                                                                                                                              | `{status: 'queued'\|'running'\|'done'\|'error', filled, failed, total}` (ai-columns stream)                                                                                       |

## Web client + components — `apps/web/src/lib/components/tables/` (owned by the **grid** stream)

- `table-client.ts`: thin fetch wrappers for every endpoint above (`createTable`, `getTable`,
  `patchTable`, `applyRows`, `revertChange`, `exportCsvUrl`, `createTaskFromRow`, `startAiFill`,
  `getAiFillStatus`).
- `TableWorkspace.svelte` — the one component every surface mounts:
  `<TableWorkspace documentId projectId initialTable?={LoadedTable} layout?="page"|"panel"|"sheet" readonly? onChanged? />`.
  It loads the table, renders toolbar (search, filter, sort, view switch grid/board, add row,
  add column, import/paste, export, "Ask about this table" → opens chat focused on the doc),
  the grid (desktop) or record cards (phone), totals footer, column header menus (rename, type,
  choices, description, hide, delete, "Make this a question column" → AI config + "Fill"), row
  menu (open row, make task, delete), AI-cell provenance (cells with `cell_meta.by` render a
  subtle marker; popover shows sources/note/confidence), and polls an active AI fill.
- `TableEmbed.svelte` — read-only compact preview (first 8 rows, row count, "Open table") for doc
  embeds and chat cards: `<TableEmbed documentId projectId />`.
- `NewTableDialog.svelte` — create blank / paste from spreadsheet / upload CSV, with a preview of
  inferred columns before creating. Props: `{projectId, parentId?, onCreated(table)}`.
  Added by web-data (2026-10-04): `onClose?: () => void` (cancel/dismiss; hosts mount the dialog
  inside `{#if open}` and unmount it on close or after `onCreated`), `initialText?: string` (CSV/TSV
  text to start in the paste step — used by chat "Save as table"), `initialTitle?: string`.
- `TableWorkspace` also takes `onAsk?: () => void` (added by web-data): when present, "Ask about
  this table" calls it so the host opens its own chat about the document (reader chat pane,
  DocumentModal chat, page Document Interact dock).

## Surfaces (owned by the **web-data** stream)

- Doc tree: `document.table` nodes get a table icon + row-count pill (`props.table.row_count`);
  tree menu + empty state get "New table" (opens `NewTableDialog`).
- DesktopReader, DocumentModal, and `routes/projects/[id]/documents/[document_id]` branch on
  `isTableTypeKey(type_key)` and mount `TableWorkspace` instead of the markdown editor (reader
  defaults to Focus width for tables; modal uses `contentScrollable={false}`). Body text editing
  is refused for table documents in the UI and in `onto.document.update` (core stream).
- Document embeds: toolbar "Table" inserts a fenced block ` ```buildos-table\n<document-id>\n``` `
  that renders post-sanitize as `TableEmbed`; `[[document:uuid|label]]` renders as a link in
  document bodies.
- "Make live table" on markdown tables inside a document (structured `findMarkdownTables`):
  creates a table doc as a child of the document and replaces the markdown block with an embed.
- Chat: "Save as table" button on tables rendered in agentic chat (reads the rendered table's
  cells — structured DOM, not text classification) → `NewTableDialog` prefilled.

## Gateway ops + MCP (owned by the **core** stream)

Ops (add to `BUILDOS_AGENT_READ_OPS`/`BUILDOS_AGENT_WRITE_OPS`, `EXTERNAL_OP_HANDLERS`, new
`op-execution-gateway.tables.ts`): `onto.table.get`, `onto.table.rows.query`, `onto.table.list`
(MCP-only custom op), `onto.table.create`, `onto.table.update`, `onto.table.rows.update`. Handlers
use the admin client with the gateway's existing project access checks and pass `p_actor_id`.
Write responses include `table_change: TableChangeReceipt`. Also export
`previewGatewayTableRowsUpdate(context, args)` for the worker's preview-before-review.
MCP: labels in `AgentKeysTab.svelte`, `MCP_FETCH_CONFIG`/resources so `fetch` of a table returns
CSV/markdown. `onto.document.update` refuses body edits (`content`, `edits`, `section_edits`) on
table documents with a message pointing at the table tools.

## Chat tools (owned by the **chat** stream; ops implemented by core)

| Tool                     | Op                       | Args                                                                                                                                                                                                                                |
| ------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_onto_table_details` | `onto.table.get`         | `{table_id, row_limit?: number (≤50, default 15)}` → schema description, row_count, totals, first rows (formatted), `csv_path`                                                                                                      |
| `read_table_rows`        | `onto.table.rows.query`  | `{table_id, filters?, match?, search?, sort?, columns?, group_by?, aggregates?, limit? (≤100, default 25), offset?}` → formatted rows + groups/aggregates + `next_offset`                                                           |
| `create_onto_table`      | `onto.table.create`      | `{project_id, title, description?, columns: [{name, type?, description?, options?: {choices?, format?}, ai?: {prompt, research}}], rows?: [{<column name>: value}] (≤200), csv?: string, parent_id?}`                               |
| `update_onto_table`      | `onto.table.update`      | `{table_id, title?, description?, column_changes?: TableColumnChange[], fill_ai_columns?: string[] (enqueue question-column fills), archived?: boolean}`                                                                            |
| `update_onto_table_rows` | `onto.table.rows.update` | `{table_id, add?: [{values: {<column>: value}, sources?: {<column>: {urls?, note?, confidence?}}}], update?: [{row: "r12", values, sources?}], delete?: ["r12"]}` (≤200 rows total; `sources` become `cell_meta` with `by:'agent'`) |

Rows are addressed by handle (`r12`), columns by name. Reads return handles as the first column.
Agent writes never do arithmetic; analysis uses `read_table_rows` aggregates. Focused table
context: `summarizeTableForContext`. Table docs are listed in the Knowledge Map with
`· table · N rows · col, col…`.

## AI question columns (owned by the **ai-columns** stream)

- New queue type `table_ai_fill` (own migration `ALTER TYPE queue_type ADD VALUE`), worker
  processor under `apps/worker/src/workers/tables/`. Per row (concurrency ≤3): build a prompt from
  the column's `ai.prompt` + the row's other cells; if `ai.research`, use the existing web search
  service; ask the model for a structured `{value, note, source_urls, confidence}`; coerce with
  `coerceCellValue`; write with `applyTableChanges` (cell_meta `{by:'ai_column', state:'filled',
run_id, source_urls, note, confidence, at}`; failures → `{state:'error', error}`). Marks cells
  `pending` at enqueue so the grid can show progress. Spend is recorded through the existing LLM
  usage logging. Model: the code-default cheap lane (no env pins).
- Endpoints `POST /api/onto/tables/[id]/ai-fill` + `GET .../ai-fill/[runId]` (see Web API), thin wrappers over the shared functions below.
- One enqueue function, used by the web endpoint and by the gateway (`update_onto_table`
  `fill_ai_columns`): `packages/shared-agent-ops/src/tables/table-ai-fill.ts` exporting
  `enqueueTableAiFill(client, {documentId, column: string, rowIds?: string[], onlyEmpty?: boolean,
userId: string, actorId: string | null}): Promise<{run_id: string; row_count: number}>` (marks
  target cells `pending`, inserts the queue job through the existing queue RPC) and
  `getTableAiFillStatus(client, {documentId, runId}): Promise<{status, filled, failed, total}>`.
  Owned by ai-columns; core re-exports it from `tables/index.ts` and calls it from the gateway.

## Validation rules for every stream

- Shared 24 GB machine: run only targeted vitest files
  (`pnpm --filter <pkg> exec vitest run <files>`). **Do not run typecheck, svelte-check, lint,
  builds of the web/worker apps, root test suites, or the dev server.** The orchestrator runs the
  heavy checks centrally. Exception: the core stream builds `@buildos/shared-agent-ops` when its
  module is ready (`pnpm --filter @buildos/shared-agent-ops build`) because web/worker import its
  `dist`.
- No paid model/API calls of any kind.
- Never edit an existing migration file; add new ones. Rehearse new migrations with
  `pnpm db:rehearse <file> --role-probe`. Do not apply anything to production.
- Edit only files your stream owns (below). If you need a change in another stream's file, put
  the exact request in your final report instead.

## File ownership

| Stream     | Owns                                                                                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core       | `packages/shared-agent-ops/src/tables/**` (except `table-types.ts`, change only with a contract note), `packages/shared-agent-ops/package.json` + `tsup.config.ts`, `packages/shared-agent-ops/src/gateway/**` table additions, `packages/shared-types/src/agent-call.types.ts`, MCP connector + `AgentKeysTab.svelte` |
| web-data   | `apps/web/src/routes/api/onto/tables/**` (except `ai-fill`), `apps/web/src/lib/server/tables/**`, doc tree / reader / DocumentModal / document page / markdown renderer integration, chat "Save as table" button                                                                                                       |
| grid       | `apps/web/src/lib/components/tables/**`, `apps/web/package.json` (grid dependency), `$lib/icons/lucide` additions                                                                                                                                                                                                      |
| chat       | `packages/agentic-chat-runtime/**`, `apps/worker/src/workers/agentic-chat/**` + worker tests, `apps/web/src/lib/services/agentic-chat*/**`, `apps/web/src/lib/components/agent/**`, skills definitions                                                                                                                 |
| ai-columns | `packages/shared-agent-ops/src/tables/table-ai-fill.ts` (+ its test), `apps/worker/src/workers/tables/**`, worker queue registration for `table_ai_fill`, its migration, `apps/web/src/routes/api/onto/tables/[id]/ai-fill/**`                                                                                         |
