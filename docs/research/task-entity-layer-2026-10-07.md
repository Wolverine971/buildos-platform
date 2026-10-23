<!-- docs/research/task-entity-layer-2026-10-07.md -->

# Task Entity Layer

**Status (2026-10-08):** v2 (no chip wall; names link to cards; key details; prompt v5) deployed in
935707537 + a48730434. The 236 tasks updated since 2026-08-07 were re-read with v5 ($0.0365, 0
errors). Follow-up fixes (file names are not links, past times are not key, names match before
quotes, person pills open their card) are uncommitted. Tables and trigger are live; no task has
been edited since the trigger went live, so no queued read has run yet.

Research page (mock, data, other products, playground):
https://claude.ai/artifact/AuiT1qnUHVKpmPKCNYaXH7

## What it does

The model reads each task's text in the background; the app shows little of it directly.

- **The text stays the place to read.** The first mention of each person, organization and place
  in a task's title and description is a dotted-underlined link. Phone numbers and emails are
  tap-to-call / tap-to-email links. No chip wall.
- **A tap opens a card** (`TaskEntityPopover`, anchored on desktop, bottom sheet on phones): who
  or what it is, who it is with (Casey Fenske → Dauntless Dogs), the numbers, emails and
  addresses the task ties to it (Call / Email / Map + copy), the people around it, numbers other
  tasks know for it ("From other tasks"), and the other tasks that name it ("Also in N other
  tasks"). "Hide" dismisses a wrong entity for good, with Undo.
- **Key details** (`TaskKeyDetails`): at most three pills above the text, only for what the owner
  needs at hand to do the task now (the link to join, the meeting time, the address to go to, the
  one number to call). The model marks them `key: true` (prompt v5); meeting links always count.
  Nothing renders when nothing earns the space.
- **Today rows show nothing**: the list stays scannable; details show when a task is opened.
- Jev and the MCP connector get the same entities, with `about` and `key`, in
  `get_onto_task_details`.

## Linking (the light graph)

No graph database. Two joins do the work:

1. **Within a task**, the model's `about` field names who a number, email, place or person belongs
   to. `buildTaskEntityCards()` matches it to a person/org entity by collapsed name
   (`entityTextKey`), never by reading the prose.
2. **Across tasks**, the same person, organization or place has the same `(kind, natural_key)`.
   `GET /api/onto/task-entities/related?kind=&key=&task_id=` (user-scoped, RLS) returns the other
   tasks that name it and the contacts those tasks tie to it. A first name alone ("Louis", in 16
   tasks) can mean different people; the card shows each task's project so the owner can tell.
   An index on `(kind, natural_key)` is not needed at today's size (~2k rows).

## Where entities come from

| Lane       | What                                                          | How                                                                                                             | Stored?                  |
| ---------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Known      | start/due, linked events                                      | Existing task fields (already in the reader's facts row)                                                        | Existing                 |
| Detected   | phone, email, URL, meeting link                               | `detectTaskTextEntities()`: structured formats only, so pattern matching is allowed (AGENTS.md)                 | No: recomputed on render |
| Understood | people, orgs, places, times in prose, and which number to use | Fast JSON lane (DeepSeek V4 Flash first, code-default fallbacks), checked by `normalizeExtractedTaskEntities()` | `onto_task_entities`     |

Roles the model assigns: `primary`, `secondary`, `avoid` ("not 201 Holsum Way"), `hours`, `log`,
`follow_up`, `meeting`, `deadline`, `owner_self` (the owner's own number or email, matched exactly
against the sign-in email, connected mail and calendar accounts, and the SMS number).

## Keeping them correct (the hard part)

1. **Hash gate.** The trigger fires only when the title or description changes (md5 digest, like
   embeddings). The worker skips text whose hash `onto_task_entity_state` already holds.
2. **Match by value.** Rows are keyed `(task_id, kind, natural_key)`: E.164 phone, lowercased email,
   canonical URL, collapsed name or address, ISO time plus role. Rewording never churns them.
3. **People's choices stick.** `confirmed` rows are kept forever (flagged `in_text=false` when their
   words leave the text). `dismissed` rows are tombstones: re-reads never bring the entity back.
   Only machine `suggested` rows are refreshed or removed.
4. **Quotes.** Every entity must quote the text exactly or it is dropped. The quote powers the
   chip tooltip and the stale flag.
5. **No stale writes.** If the text changes while the model reads, the job stops; the newer text
   has its own job (the dedup key includes the digest).

## Code

- Shared, browser-safe: `packages/shared-agent-ops/src/task-entities/` (detector, checks, merge
  plan, chip ordering) → `@buildos/shared-agent-ops/task-entities`.
- Worker: `apps/worker/src/workers/task-entities/` (`extract_task_entities` job, prompt).
- Runner (dry free, live paid): `apps/worker/scripts/task-entities-run.ts`.
- Web: `apps/web/src/lib/components/task-entities/` (`task-entities.svelte.ts` loader shared by
  the reader and the task modal, `entity-mentions.ts` linking, `TaskEntityPopover`,
  `TaskKeyDetails`, `TaskMentionText`), `GET /api/onto/task-entities?task_ids=`,
  `GET /api/onto/task-entities/related`, `PATCH /api/onto/task-entities/[entityId]` (status only;
  RLS + column grant).
- Jev: `loadTaskEntitySummaries()` in `packages/agentic-chat-runtime/src/tools/ontology-task-detail.ts`.
- Tap-to-call numbers inside task descriptions: `renderTaskMarkdown()` in
  `apps/web/src/lib/utils/markdown.ts` (reader and task modal; chat and docs unchanged).

## Cost

Fast lane measured $0.000305/call at ~1,400 tokens in (table_ai_fill, DeepSeek V4 Flash). Entity
reads should land around $0.0003–0.0006 per text change; per-call cap $0.003. Backfilling all
1,337 live tasks: about $0.40–0.80.

## Live results (2026-10-07, DJ's tasks, DeepSeek V4 Flash)

- **10-task live check:** with hidden reasoning on, 5 of 10 failed (≈1,700 reasoning tokens, then
  empty or cut-off JSON). With `reasoning: { enabled: false }`: 10 of 10, $0.00004–0.00035 each.
  Highlights: the recruiter screen read as a meeting at Wed Oct 7, 1:15 PM; the old Headquarters
  Dr address marked `avoid`; "Friday is the shop day, 10–7" filed as `hours`.
- **200-task sample (v2 prompt):** 200 of 200 completed, $0.0327 total (≈$0.00016 each); 133
  with entities vs 134 by hand label. Against the hand labels (labeler read only 600 characters
  per description, so some "extras" are real finds):

    | Entity       | Recall | Precision |
    | ------------ | ------ | --------- |
    | Phone        | 100%   | 86%       |
    | Link         | 100%   | 66%       |
    | Person       | 87%    | 87%       |
    | Place        | 82%    | 50%       |
    | Email        | 74%\*  | 83%       |
    | Organization | 74%    | 64%       |
    | Future time  | 72%    | 62%       |

    \*All 7 email misses were DJ's own addresses, correctly marked `owner_self` and hidden.

- **Fixed after the sample (v3):** references dropped (file paths, slugs, commit hashes came back
  as chips), owner details only when the text holds them (112 echoed emails were dropped by the
  quote check), no generic places ("front desk", a state). Fixed-format values must be written in
  the text ("contact form on their website" had become an invented URL). Failed reads retry.
- **200-task rerun on v3 (after the 0bccb9a47 deploy):** 200 of 200, $0.0286. Echoed owner
  emails dropped 112 → 15; references gone.

    | Entity       | v2 recall / precision | v3 recall / precision |
    | ------------ | --------------------- | --------------------- |
    | Phone        | 100% / 86%            | 100% / 86%            |
    | Link         | 100% / 66%            | 100% / 67%            |
    | Person       | 87% / 87%             | 86% / 86%             |
    | Place        | 82% / 50%             | 82% / 51%             |
    | Email        | 74% / 83%             | 70%\* / 79%           |
    | Organization | 74% / 64%             | 82% / 71%             |
    | Future time  | 72% / 62%             | 80% / 70%             |

    \*All 8 misses are DJ's own addresses (`owner_self`, hidden). Places are the weak spot: the
    extras mix real locations past the labeler's 600 characters (Maysville NC, 111 Annapolis St)
    with noise ("front desk", "United States", "Glen Burnie" from DJ's signature). With references
    gone the model sends document names as links; the grounding check drops them (44).

- **v5 (2026-10-08), re-read of the 236 recent tasks:** $0.0365, 0 errors, 145 with entities, 91
  empty. `key` flag for the few details shown above the text; `about` also links a person to their
  organization; the owner's sign-off (town, number) is `owner_self`; AI tools are not people;
  slugs are not orgs. Results: 75 tasks have key details (125 flagged rows, at most 3 each), e.g.
  Murtech drop-off → address, directions, Thursday; Chesapeake Tax → Pat Svehla, number, Oct 15
  deadline. Slug orgs 0 (were common in v4); "Glen Burnie" from the sign-off marked owner_self on
  4 tasks. Left over: file names sent as links (README.md, robots.txt, `*.md`; now dropped by
  `looksLikeFileName()` on read and hidden at display), 3 AI tools still read as people (Claude ×2,
  Jev ×1, secondary), a list of five callbacks got three phones marked key (cap keeps the first
  three).
- **v4 (all named people and orgs, room for 20), same 153 tasks as v3:** people found 88% → 96%,
  future times 82% → 91%; precision a few points lower (slugs like `dauntless-dogs` read as orgs,
  "Claude" as a person). Louis now appears on both of his tasks; "Second call…" keeps Thursday.

## Rollout steps

1. Live check on ~10 of DJ's tasks (paid, about $0.005), then the 200-task accuracy sample
   against the hand labels (paid, about $0.06–0.12).
2. Deploy web + worker; apply `20261007120100_task_entities_trigger.sql` and record it.
3. Backfill existing tasks with the runner (`--all`, capped by `--max-usd`).

## Not built yet

- Searching entities (find every task that names Casey, or every number for Dauntless Dogs) from
  app search or a Jev tool. The related endpoint is the first piece.
- Saving a confirmed person to `user_contacts` (so their number follows them across tasks).
- One-tap "Put on calendar" / "Set exact time" from a time chip.
- Jev writing entities at task creation (tool argument), and Jev confirm/dismiss tools.
- Storing Google's Meet link, attendees and location on synced events.
- `pnpm gen:all` (needs `SUPABASE_ACCESS_TOKEN`) to drop the loose table types.
