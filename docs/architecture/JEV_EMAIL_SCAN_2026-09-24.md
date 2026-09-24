<!-- docs/architecture/JEV_EMAIL_SCAN_2026-09-24.md -->

# Jev Email Scan + Gmail Search Provenance (2026-09-24)

DJ's ask: in chat, "did I get any emails relevant to 9takes today?" should come back fast. Jev
scores each email's relevance as a percentage and keeps the ones that matter, then the acting model
triages them. No email text is stored.

## Before

Measured on DJ's own data (prod, 60 days):

- Email-reading chat turns replied in 38 s to 2 m 26 s, median about 50 s.
- A turn allowed one Gmail search. Worker rules blocked any further search.
- A regex allowed a search only when the message literally said "search/find/look up my email
  for X" (`web-egress-policy.ts`, since removed). "Check my djwayne35 email for interviews" was
  refused, and the rule violated AGENTS.md.
- The model saw 5 of the 12 fetched results. Snippet truncation cut the closing untrusted marker
  and left about 143 characters of real text.
- Full Gmail results (subjects, snippets, bodies) were written to `chat_tool_executions` and to turn
  events. `/privacy` promises no durable copy of message content.
- Calendar lists showed the model about 5 of 60 events. `next_offset` silently skipped events the
  size guard had dropped.

## `scan_email_inbox`

This is a new shared read tool, mounted with the Gmail group whenever a Gmail account is connected.

Arguments: `window` (today | last_24_hours | last_3_days | last_7_days | last_14_days),
optional `looking_for`, `connection_ids`, and `max_emails` (≤200 per account).

Flow (`apps/worker/src/workers/agentic-chat/tools/email-scan.ts`):

1. **List** each account's inbox for the window with `GmailReadGateway.scanInboxWindow`. The query
   `in:inbox after:<epoch> before:<epoch>` is built in code, so no model-written text reaches
   Google. That makes this a plain private read, not egress.
2. **Cursor.** The `email_scan_checks` ledger holds messages an earlier scan scored for the same
   scope. Earlier non-relevant messages are skipped entirely. Earlier relevant messages are
   re-read only to be shown again.
3. **Metadata** reads go through Gmail's batch endpoint (`/batch/gmail/v1`, multipart/mixed).
   Each request carries up to 50 reads, and each account runs two batches at a time. Items Google
   throttles or fails inside a batch, and whole batches it rejects, are read singly, eight at a
   time. A read that fails both ways drops that message, not the whole account. A 401 anywhere
   refreshes the token once. The audit row's `singleReadCount` shows how often the fallback ran.
4. **Jev** (`email-relevance.ts`) gives each new email one yes/no question, which returns a
   probability shown as a 0–100% score. The target is one of:
    - the focused project: name, description, START HERE opening, and recent task/document titles;
    - the model's `looking_for`. The tool description tells the model to omit it for general
      project questions, because the project context is sent automatically and a reworded
      `looking_for` gets a new ledger scope (the 09-24 live test missed the cursor this way);
    - otherwise "needs your attention".

    Decisions of up to 80 emails run in parallel on a hedged client (hedge at 1 s, 5 s timeout).

5. **Keep** an email if it scores ≥50%, or if it scores ≥30% and is within 60% of the top score.
   The rule is rank-relative because Jev's probabilities are uncalibrated.
6. **Body openings** for the top 3 are fetched in parallel, capped at 2.5 s, so the model can
   triage in one round trip.
7. **Return** up to 15 relevant emails with `relevance_pct`, Gmail links, the top senders of the
   rest, and per-account counts. Email text sits under `untrusted`. Results unlock
   `get_email_message` for the rest of the turn.

If Jev fails, the tool returns the newest mail with "scoring unavailable" and writes no ledger
rows. An account that fails for a non-auth reason comes back `unavailable`, with guidance telling
the model it is a temporary problem and not a reason to ask the user to reconnect.

Measured live on 09-24 before batching: 226 emails across 3 accounts, scan tool 5.19 s (Gmail
metadata ~4.5 s), Jev 209–273 ms for 3 parallel decisions ($0.0024), whole turn ~24 s. With
batching, 100 emails should take 2 requests instead of 100, but this is not yet measured. A repeat scan skips Gmail reads and Jev for mail
that was already scored. Jev costs about $0.001 per 100 emails.

## Gmail search provenance (regex removed)

`search_email_messages` now asks Jev whether the query serves the user's latest message
(`email-search-provenance.ts`):

- one decision per distinct query per turn;
- a score ≥0.5 allows the search;
- a Jev failure refuses the search, and the refusal points the model to `scan_email_inbox`.

The old "no Gmail search after private reads" block is gone. The query reaches only the user's own
mailbox, and Jev checks it against the request. The `max_results must equal 12` rule went with the
regex.

## Storage redaction

`redactAgenticChatEmailToolResultForStorageV1` (runtime `email-reads.ts`) runs in `read-tool-runner.ts`
before the ledger RPC, the `tool_result` event, and the terminal record. What gets stored depends
on the tool:

| Tool                    | Stored                               |
| ----------------------- | ------------------------------------ |
| `search_email_messages` | ids, dates, account statuses, counts |
| `get_email_message`     | ids, flags                           |
| `scan_email_inbox`      | ids, dates, `relevance_pct`, counts  |

The acting model still reads the full result in memory during the turn.

## Scan ledger (`supabase/migrations/20260924120000_email_scan_checks.sql`)

Each row holds `user_id`, `connection_id`, `scope_key`, `message_key`, relevance, `relevant`, and
timestamps.

- **`message_key`:** an HMAC-SHA256 of `connection:message`, keyed from
  `PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1`.
- **`scope_key` forms:**
    - `project:<uuid>:v1`, stable across phrasings;
    - `request:<sha256(looking_for)>:v1`, which never stores the text;
    - `attention:0:v1`.
- **Retention:** rows expire after 30 days, and each write sweeps the user's expired rows.
- **Access:** service-role only.
- **Failure behavior:** every ledger failure falls back to "nothing checked yet".

## Calendar (same change set)

`list_calendar_events` now reaches the model as compact rows under the 12K email/web budget, which
fits a busy two weeks in one call. Other changes:

- The continuation points at the first unseen event and never skips.
- Pages that end past the 299 offset cap switch to time-based paging.
- The worker's chat list sends Google a `fields` mask.

Not yet fixed: `calendar-reads.ts` waits for Google before its database reads, and
`set_default_calendar_source` writes on every read for users with no eligible default.

## Rollout

1. Apply the migration to prod. Until it is applied, scans work but re-score everything and log a
   warning.
2. Deploy the worker at the same SHA as web, or before it. Web mounts `scan_email_inbox` from the
   runtime catalog, and an older worker rejects it as not allowlisted.
3. Paid validation needs DJ's approval:
    - a one-turn live smoke on DJ's inbox, about $0.01;
    - `pnpm agentic:gate` on deepseek-v4.1-flash, about $0.30;
    - optionally, a threshold eval on about 100 real emails, about $0.01.
4. Check that the calendar `fields` mask works on the first real calendar list after deploy.
