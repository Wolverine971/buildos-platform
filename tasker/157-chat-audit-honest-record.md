<!-- tasker/157-chat-audit-honest-record.md -->

# 157 — Chat audit: the honest record, and brain dumps that file first

**Opened 2026-11-13 (DJ).** Audit of agentic chat after 150 (closed tracker, in git history),
152 (closed tracker, in git history), 153 (closed tracker, in git history) and
155 (closed tracker, in git history): is what the chat shows true, and does the model get what
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

Everything above is live: `ce965833a` (23:07) on web and the chat worker. Checked on production
with the 11-13 Radar chat: "Looked through 24 · 14 in view · 3 opened", matching the turn's real
reads; no overflow at 340 px; no console errors.

## Paid check (2026-11-13, DJ approved, $0.0154 model + one judge call)

Workspace battery **case 7, "brain dump files first"** (new, reusable):
`AGENTIC_PROD_BATTERY_REPETITIONS=1 pnpm agentic:prod-battery --confirm-prod --battery=workspace-chat --cases=7`
(one repetition always exits 1 with "requires three repetitions"; read `scorecard.json`).
Evidence: `output/agentic-prod-battery/2026-11-14T04-16-50-876Z/`.

- **Turn 1, brain dump (10.3 s):** `save_p` 0.87, capture on, both projects picked. Four saves in
  one turn: the inspection task and a trip note in the bakery, the mulch task in the garden, the
  refund task in the Workspace. No web lookups, no filing question. Every write carried an exact
  quote; the stored injection hash matched the event's.
- **Turn 2, follow-up (12.1 s):** `state_key` todo → in_progress and `due_at` moved a week, with
  before → after and an exact quote. One reviewer revision round first.
- **Gap found:** the reply was the bare receipt ("Created task …") and named no homes (judge 3/3,
  borderline).

## Built after the paid check (uncommitted, not live-verified)

The receipt names the home of each new record on global turns: "Created task “Book the health
inspection” in Harbor Bakery Launch", "… in your Workspace". `WriteLedgerEntry.projectId`,
`renderDirectWriteReceipt(ledger, homes)`, homes from the workspace finder's ranked projects.
Worker typecheck clean; worker chat tests 2,121 and runtime loop tests 432 pass. Needs a push;
a re-run of case 7 (about 1.5¢, needs DJ's OK) would confirm the wording live.

## Not done

- Stop during a write: the database fence rejects events after Stop, so live and reload can
  still differ until the session reloads.
- **Document Undo after a reload: built 2026-11-14, uncommitted.** The session GET returns each
  edited document's current `content_hash` (`documentHashes`); a rebuilt card whose `beforeHash`
  equals it reads Undone (`markUndoneDocumentChanges`), and so do its row and the receipt.
  Tables are not covered (2 table documents in production).
- Assignee, goal/milestone link and calendar-update before → after.
- At phone width an opened chip's title truncates beside its "› sections" suffix.
- The reply does not offer the lookup it skipped (the refund call). **Decided 2026-11-14 (DJ):
  keep the instant receipt.** It is fast and built only from saved effects; a model-written
  closing reply would add 2 to 4 seconds per brain dump and could misstate what happened.
- `save` threshold calibration: two readings so far (0.87, 0.84); read `workspace.save_p` from
  real turns. The September eval harness was deleted in `1499e4d54`, so there is no free replay.

## Absorbed 2026-11-15 (from closed trackers 138, 150, 151, 152, 153, 155)

- \*\*Full prod battery, run 2026-11-15 on `1118ea9d0` (DeepSeek V4.1 Flash, $0.244 = $0.236 model
    - $0.008 judge): 46/52 (B).\*\* 11 of 13 cases 4/4, including card-only documents, carry, edits
      and grounded status. Case 10 (calendar) 1/4: production calendar reads return
      `credentials_not_configured` (tracker 158 item 4; passed on 11-06). Case 9 (hostile quoted note)
      1/4: one of three runs saved the note without the injected block (safe, didn't act on it, but
      not verbatim). Evidence: `output/agentic-prod-battery/2026-11-15T05-08-40-917Z/`.
- **Case 7 rerun 2026-11-15: 3/3.** The receipt names each home ("Created task … in Harbor Bakery
  Launch", "… in your Workspace"). Workspace battery cases 1, 2, 5, 7: 14/16, $0.075
  (`output/agentic-prod-battery/2026-11-15T05-18-20-573Z/`). Case 5 (broad opener) 2/4: the reply
  tells the user "BuildOS's Google Calendar credentials aren't configured on this server" (true,
  tracker 158 item 4) and the judge marks it down; rerun after 158.
- **Save threshold** (`workspace.save_p`, 0.5): keep reading it from real turns; two readings so far.
- **"Continue in X"** (153 C1): the first project turn after moving a chat was never felt live.
- **Not built, parked:** tap to drop or pin a carried item (151); C2 parallel read-only scouts
  (153, gate said not now: 4 multi-project turns in 30 days); progressive per-project reply (152
  lab idea).
- 155's phone-width item is covered by the record-list redesign in another session.

## Sized against production (2026-11-14, last 30 days, 52 turns)

0 stopped turns, 0 calendar edits, 0 link or assignee changes in chat, 3 document edits, 2 task
edits. Stop-during-write and the missing before → after kinds are parked until they show up.
The work log card (`ThinkingBlock.svelte`, `RecordList.svelte`) is mid-redesign in another
session (one record per row), which replaces the chip layout that truncated at phone width.
