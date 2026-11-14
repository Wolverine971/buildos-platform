<!-- tasker/157-chat-audit-honest-record.md -->

# 157 — Chat audit: the honest record, and brain dumps that file first

**Opened 2026-11-13 (DJ).** Audit of agentic chat after [150](150-outline-first-document-context.md),
[152](152-document-cards-not-bodies.md), [153](153-threads-in-real-chat.md) and
[155](155-watch-it-sort-in-chat.md): is what the chat shows true, and does the model get what
the card says it got? DJ picked the ambitious fix set plus the brain-dump fix.

## What the audit found (19 real turns, 11-06 to 11-13, plus a five-slice code read)

- Answers were truthful. Outlines 628/628 fresh, no stale summaries, no cross-user leaks.
- "Pulled in 14" meant 3 to 7 cards: a leftover 5,000-char limit from option B capped cards.
- The Nov 8 Texas brain dump got scope `none`, ran 5 unasked web lookups, saved nothing and asked
  where to file one task. 3 of 5 global turns ran with no project context.
- The one real write since 155 shipped showed no highlight: its quote came from the previous
  message. Before → after had never fired on a real turn.
- The display overstated: a held change lit up as saved, Undo never reached rows or the receipt,
  "Pulled in" covered summaries nobody opened, calendar and move writes counted as reads.

## Built (2026-11-13)

**The honest record.** `context_selection` now says what the model was actually handed:

- per chip `given: 'text' | 'card' | 'line'` and `partial`;
- per turn `scope`, `snapshot`, `notes`, `counts.carried`, `injection {chars, sha256}`,
  and on global turns `workspace.capture` / `save_p`;
- chips are built from the rendered evidence, not the plan.

The exact injected text is stored on the turn's prompt snapshot:
`select prompt_sections->'context_injection' from chat_prompt_snapshots where turn_run_id = …`
(14 days, admin-only, never broadcast; listed in `DATA_INVENTORY.md`).

**Chat display** (`packages/agentic-chat-client` `deriveTurnLedger`, `ThinkingBlock.svelte`):
each record is **handed**, **opened** or **changed**: "Looked through 24 · 14 in view · 3 opened
· 1 changed". Held changes read "Waiting for your choice"; Undo and approval reach the row, the
receipt and the lit phrase; receipt counts are real; global picks are named ("Filing into: …").
The phone app still prints "Pulled in N".

**Cards and carry** (runtime `context-finder`, `working-set`):

- every pick gets its card (14k ceiling); flags follow anchors, so repeated headings work;
- a card says "Whole document" or "Text not shown (about N chars)"; tables show columns and rows;
- cut records are marked; the AI summary reaches ranking;
- a carried document stays rankable; a finder timeout no longer erases the carry.

**Read tools:** `get_document_outline` pages long outlines; anchors accept `#x` and unique
heading text; table documents redirect to the table tools; `props.body_markdown` no longer
duplicates the stored body.

**Writes:**

- `from_quote` is out of the review hash and the reviewer's view;
- calendar, move, table-row, task-doc, link, tag and delegate writes report what they touched;
- before → after covers more fields and windows long text around the change;
- the quote is stored at `chat_tool_executions.affected_entities[0].source_quote` for reloads;
- quotes match on the same words only (no 75% fuzzy) and look back three user messages;
- no internal model name in step text.

**Brain dumps:** hop 1 asks a new `save` question (threshold 0.5, uncalibrated). At or above it
the picked projects are framed as likely homes and the Workspace is named, even on scope `none`.
Guidance (routing message, actor and reviewer rules, web rules, global prompt, clarification
tool): save first, each item to its best home or the Workspace, say where; never ask where a new
item lives; research only when asked.

## Checks

- Typecheck: shared-types, shared-agent-ops, runtime, chat-client, worker (+ test types), mobile.
- Web `check` 0 errors (10,076 files); web lint and guardrails pass; worker lint 0 errors.
- Tests: worker agentic-chat files 2,118; runtime 857; web agent, session route and prompt 1,004;
  chat-client 171; shared-types 10; field changes 8.
- Tool surface re-pinned: global 63,412 B, project 79,688 B, project_create 9,327 B.

## Deploy state

`c3eba8749` ("updates", 22:41) swept the build mid-edit. The chat worker is live on it. The web
build failed on a type error that is fixed in the working tree, so the site is still on the
previous version. The rest is uncommitted and needs one push.

## Not done

- Stop during a write: the database fence rejects events after Stop, so live and reload can
  still differ until the session reloads.
- Document and table Undo is not known after a reload (rows read "Updated" again).
- Assignee, goal/milestone link and calendar-update before → after.
- A real-browser look at the new card (380 px, dark) and the paid check: one brain dump plus one
  update follow-up on the harness account, about 3¢ on DeepSeek V4.1 Flash (DJ approved 11-13).
- `save` threshold calibration: read `workspace.save_p` from real turns. The September eval
  harness was deleted in `1499e4d54`, so there is no free replay.
