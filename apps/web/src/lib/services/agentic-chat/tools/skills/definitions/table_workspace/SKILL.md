---
name: Table Workspace
catalog_line: 'Project tables: read schema first, filter and total with tools, research a row and write it back with sources, propose follow-up tasks.'
description: Project table playbook for reading, querying, researching, and writing table rows and columns safely, with every count and total coming from the table tools.
skill_type: procedure # procedure | reference | strategy | resource | policy | orchestration
altitude: task # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - onto.table.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/table_workspace/SKILL.md
---

# Table Workspace

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Procedure → Contract → Policy → Related Tools → Examples → Provenance.
  skill_type: procedure. Standalone root (no sibling dependencies), so there is no Routing block.

  BuildOS Tables (2026-10-04). A table is a project document (type_key document.table); its id is the
  document id. The worker preloads this playbook when the focused entity is a table
  (skill-gate-preload.ts resolveFocusedTableSkillPreload), so it renders under a one-line heading with no
  follow-up skill calls. Every tool named in Activation, Procedure, Policy, Contract, and the first Example
  must be mounted on the project worker surface (get_onto_table_details, read_table_rows, create_onto_table,
  update_onto_table, update_onto_table_rows, web_search, web_visit, create_onto_task, link_onto_entities).
  Related Tools stays in dotted op ids: it is the external gateway contract and the source of
  materialized_tools.
-->

## Identity

Project table playbook: read a table's columns and rows, answer questions with structured filters and totals, research rows and write the findings back with sources, change columns, and turn rows into follow-up tasks. This is a **procedure** skill at **task** altitude.

## Activation

- Answer a question about a table's rows: which, how many, grouped by, totals
- Add, fill, or correct rows and cells, including research for a row
- Add, rename, retype, or remove a column, or create a new table

## Procedure

1. Know the columns before acting. A focused table's columns and first rows are already in context; otherwise call get_onto_table_details once with the table_id. Use column names exactly as the schema lists them.
2. Rows are addressed by their handle, the first column of every read (r12). Copy handles from a read this turn; never invent one and never use a row UUID.
3. Never count, total, average, or filter rows yourself, not even rows already in view. Call read_table_rows with filters (op eq, contains, gt, lt, in, is_empty...), sort, group_by, and aggregates, and quote its matched_rows, groups, and aggregates. For a relative date ("older than two weeks"), compute the cutoff from today's date and filter the date column with lt.
4. A read returns at most 100 rows. When next_offset is set and the answer needs more, read again with that offset, or narrow with filters or columns.
5. To research a row: read the row, use web_search and web_visit, then write the finding with update_onto_table_rows update [{ row, values, sources }], where sources maps each written column to { urls: [the page it came from] }. Write only what a source supports; leave the cell empty otherwise.
6. Batch row writes: one update_onto_table_rows call carries add, update, and delete (up to 200 each). A new column is one update_onto_table call with column_changes [{ action: "add", name, type }]; fill it in the same turn with update_onto_table_rows, or pass fill_ai_columns when the column has an AI prompt.
7. Follow-up tasks from rows: read the rows, then one batch of create_onto_task, one per row, each with table_row { table_id, row: "r12" } and the row's key value in the title. table_row links the task to the table and that row, so no link_onto_entities call is needed; a receipt with table_row.linked false needs one link_onto_entities (src_kind task, dst_kind document, dst_id the table_id).
8. Deleting rows or columns, or changing many rows at once, needs the user's explicit ask this turn. When the ask is ambiguous, say what would change and ask first.

## Contract

After a table read or write, report:

- Reads: the matched count and the groups or totals exactly as read_table_rows returned them, naming the filter you applied; list rows by their key column, not by handle.
- Writes: rows added, updated, and deleted, cells changed, and columns changed, taken from the write receipt, plus the source for each researched value. The chat card shows the change and offers Undo, so do not paste the whole table back.

## Policy

- Do not answer a count, total, or "which rows" question from memory or from the preview in context; read it with read_table_rows.
- Do not invent row handles, column names, or select options; read the schema or rows first.
- Do not write a researched value without a source URL in sources.
- Do not use update_onto_document on a table; table content changes only through the table tools.
- Do not delete rows or columns the user did not ask to remove.
- Do not re-read rows a read this turn already returned with the same filters.

## Related Tools

- `onto.table.get`
- `onto.table.rows.query`
- `onto.table.create`
- `onto.table.update`
- `onto.table.rows.update`
- `onto.task.create`
- `onto.edge.link`

## Examples

### Update rows in the table in focus

- Question "which applications haven't heard back in 2 weeks?": `read_table_rows({ table_id, filters: [{ column: "Last contact", op: "lt", value: "<today minus 14 days>" }, { column: "Status", op: "neq", value: "Rejected" }], columns: ["Company", "Role", "Last contact", "Status"] })`, then report matched_rows and the companies.
- "group by status": `read_table_rows({ table_id, group_by: "Status", aggregates: [{ fn: "count" }] })`, then report each group's count as returned.
- "research the hiring manager for the Stripe row and add it": find the row with `read_table_rows({ table_id, filters: [{ column: "Company", op: "contains", value: "Stripe" }] })`, research with web_search and web_visit, then `update_onto_table_rows({ table_id, update: [{ row: "r4", values: { "Hiring manager": "Ana Ruiz" }, sources: { "Hiring manager": { urls: ["https://..."] } } }] })`.

### Add a column and fill it

- `update_onto_table({ table_id, column_changes: [{ action: "add", name: "Remote policy", type: "select", options: { choices: ["Remote", "Hybrid", "Onsite"] } }] })`
- Research each row, then one `update_onto_table_rows({ table_id, update: [{ row: "r1", values: { "Remote policy": "Hybrid" }, sources: { "Remote policy": { urls: ["https://..."] } } }, ...] })`; leave a row empty when no source says.

### Make follow-up tasks for rows

- `read_table_rows({ table_id, filters: [{ column: "Status", op: "eq", value: "Interview" }] })`
- One batch, one per row: `create_onto_task({ project_id, title: "Follow up with Stripe (interview)", table_row: { table_id, row: "r4" } })`. Each task is linked to its row; nothing else to call.

### Create a table

- `create_onto_table({ project_id, title: "Job applications", columns: [{ name: "Company", type: "text" }, { name: "Status", type: "select", options: { choices: ["Applied", "Interview", "Offer", "Rejected"] } }], rows: [{ "Company": "Stripe", "Status": "Applied" }] })`, or pass csv for pasted data.

## Provenance

- Counts and totals from the model's own arithmetic over a visible page are wrong when the table has more rows than the page; the server computes them over every matching row. (internal-default)
- Row handles (r12) are stable for the life of a row and short enough to copy exactly; row UUIDs are not shown to the model. (internal-default)
