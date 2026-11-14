<!-- tasker/155-watch-it-sort-in-chat.md -->

# 155 — Watch it sort, in real chat

**Opened 2026-11-07 (DJ, ambitious).** Bring the homepage brain-dump demo into real agentic chat:
"the thinking logs on steroids". While a turn runs you see where each piece of your message went:
updated a doc, updated a task, created a task. Every record it reads or changes is a link that
opens in a new tab. Same look as the demo, finished and polished.

DJ's words: "Did it go to update a document? Did it go to update a task? Did it create a task?…
If it looks at certain tasks… or updates a certain task, I want to be able to click on that task
and have it open up in a new window or a new tab… Everything should be clickable… The demo we did
in the beginning was really good. I want to bring that forward."

Follows [153](153-threads-in-real-chat.md) (turn cards, carry). Research: the
[watch-it-sort brief](https://claude.ai/artifact/H9Mc9H6gqqCNkwQdPhfQt1) and `/lab/sort`.

## Decisions (made in build, DJ can veto)

- **Which words a change came from:** writes get one optional tool argument, `from_quote`, with
  the exact words from the user's latest message. It is split off when the call is parsed, like
  `call_ref`/`after`, so validation, the gateway, the review hash and effect identity never see it.
  The worker finds it in the message by string match (`locateQuote`: exact → close → fuzzy). No
  quote, or no match, means that change has no highlight; its row still shows. No regex on meaning.
- **When it animates:** writes run after the model's pass (and after review), so a phrase lights
  up when its write starts and flies to its row when the write lands. Reads show live in the
  card as they happen.
- **Every surface:** every chat, not just onboarding. A turn with no writes simply shows its
  read rows.

## Phases

- [x] **P1. Backend (worker + shared), built 11-07, uncommitted:**
    - `from_quote` on reviewed writes → `source_quote` on `tool_call`/`tool_result` (the browser
      finds it in the message with the shared finder);
    - `field_changes {field: {before, after}}` from gateway updates (task, goal, milestone, plan,
      risk, project, document metadata), on the receipt (the model sees the same short list);
    - `duration_ms` on `tool_result`.
- [x] **P2. Rich step rows (web), built 11-07, uncommitted:**
    - one link builder for every kind, opening in a new tab;
    - rows name what they touched: Read · Updated · Created · Moved, with entity chips;
    - updates show before → after; doc edits show the section and the size of the change;
    - a receipt at the end ("2 projects · 3 updated · 2 created").
- [x] **P3. Watch it sort (web), built 11-07, uncommitted:**
    - the user's message lights up by kind as writes start (demo `KIND_TONE`);
    - the phrase flies to its row (shared flight extracted from `BrainDumpDemo`) and the row glows;
    - reduced motion lands instantly.
- [ ] **P4. Finish:**
    - restore after a reload (stored events and executions);
    - phone width;
    - the old Changes tab dedupe;
    - browser check;
    - live paid check (ask DJ).

## Findings (2026-11-07 scouts)

- Demo flight = WAAPI 5-keyframe arc in `landing/home-variants/c/BrainDumpDemo.svelte:285-342`,
  copied into `lab/sort`. Generic: `flight`, `fly`, `relative`, `KIND_TONE`.
- `tool_call` arrives once, at execution start, with full arguments; `tool_result` carries
  `affected_entities` for writes only (reads: `[]`, names only inside `result`).
- No old values reach the chat: gateway updates load the existing row but return only the new
  one. The project log skips task due dates.
- Links: three URL shapes built in about six places; `buildRecordHref` covers only project, task
  and doc; relative links in replies open in the same tab.

## Build log (2026-11-07)

**Files:**

- shared-types: `source-quote.ts` (+test; the lab's `locateQuote` now uses it), `buildEntityHref`
  in `record-routes.ts`, and `source_quote` on the `tool_call` SSE type.
- shared-agent-ops: `gateway/field-changes.ts` (+test). Task, goal/milestone/plan/risk, project
  and document-metadata updates return `field_changes`.
- worker:
    - `stream-tool-calls.ts` (split `from_quote`);
    - `tool-surface.ts` (advertise it on reviewed writes);
    - `steps.ts`/`contracts.ts` (`sourceQuote` on the step);
    - `mutation-tool-runner.ts` (`source_quote` + `duration_ms` on events);
    - `table-adapter.ts` (`field_changes` on entity receipts);
    - tests: `agenticChatSourceQuote.test.ts`, the adapter test, and pinned schemas in
      `agenticChatTurnProvider.test.ts`.
- web:
    - `agent-chat-step-details.ts` (+test);
    - `agent-chat-phrase-marks.ts` (+test);
    - `phrase-flight.ts`;
    - `UserMessageText.svelte`;
    - `ThinkingBlock.svelte` (badge, links in new tab, quote, before → after, doc size, receipt
      in the header);
    - `AgentMessageList.svelte` (marks + flight queue);
    - `agent-chat-sse-handler.ts` (keeps `sourceQuote`).

**Checks:**

- shared 4 + 3 tests; worker 107 + 156 + the related suites (395) pass;
- worker and package typechecks are clean;
- web check reports 0 errors (10,057 files); eslint is clean;
- web agent tests pass (105).

**Seen in the browser:** the temporary `/design-system/zz-sort-preview` replays a scripted turn
through the real components:

- phrases light up and fly to their rows;
- there's no overflow at phone width (380px);
- midnight-UTC due dates read as whole days ("Nov 4 → Nov 9").

**Delete that route before committing.**

**Not yet:**

- whether the live model fills `from_quote` (needs a paid turn with DJ's OK);
- quote highlights after a reload: rows restore with before → after (it's in the stored
  receipt), but the quote lives only in the 7-day turn events;
- needs a worker + web deploy.
