<!-- tasker/110-project-steward-beta.md -->

# Tasker 110: 9takes steward beta (project stewards, step 2)

> **Audit 2026-10-04 — WAITING ON DJ.** Shipped in `bd45c65b8` + `9eb09d1ff` (09-28/29) and
> deployed behind `project_steward`, which is on for DJ only. 111 dropped step 4 (the refresh loop).
> **Left:** DJ approves or rejects the pending charter edits (chip), runs the starter scorecard on
> 9takes in prod, and decides whether it earns a second project. **Priority:** P2. **Recommend:** keep.

**Status:** LIVE in local dev for DJ on 9takes (2026-09-26); adversarially reviewed and hardened
2026-09-27 (see "Adversarial review"). Charter doc created
(`2749c083-7d44-4f3e-a88b-d233d4fba96f`), START HERE rewritten (old text in document history),
`project_steward` on for DJ, charter approved from the chat header; a charter proposal from the
review awaits DJ's approval in the new review sheet. Trigger migration `20260927000000` applied to
prod and recorded. Code uncommitted and undeployed; production web still runs the old prompt. No
paid runs. ·
**Opened:** 2026-09-26 · **Plan:** [`docs/product/project-agents-plan-2026-09-25.md`](../docs/product/project-agents-plan-2026-09-25.md) ·
**Design page:** https://claude.ai/artifact/8dsgfxPw8LU2ufUPXQfhpg (DJ approved the 9takes packet)

**Owner ask (DJ, 2026-09-26):** "The agent should fluidly keep track of the goals and plans,
milestones, and tasks, and it should have an overview of the documents. If I say a goal is to do X,
Y, and Z, and then tomorrow I say I have a goal to do something else, it should … be like, 'Oh, okay,
are we shifting the goals? Are these getting deprioritized?' … I think I'm ready to try this."

## What it does

Project chat on 9takes speaks as the 9takes steward. On every turn the steward carries:

| Layer      | What                                                                                                                                                                                                                                   | Where it comes from                                                         | Trust        |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------ |
| Identity   | "You are the 9takes steward"; how stewards work (keep goals true, one question, no code, nothing goes out)                                                                                                                             | code                                                                        | instructions |
| Charter    | purpose, 6 rules with sources, moves, where work happens                                                                                                                                                                               | DJ's approved copy in `user_project_behavioral_profiles.agent_instructions` | instructions |
| Narration  | START HERE minus its machine-owned status and map blocks (≤6K chars)                                                                                                                                                                   | the START HERE doc                                                          | context      |
| Live Facts | goal → milestone/plan tree with states, dates and task counts; task counts, overdue, done this week; in-progress and blocked; next 14 days; last 7 days of changes by who (Codex, chat, app); document map, most recently edited first | code, per context load                                                      | context      |

It replaces the generic identity, the START HERE status/map blocks, the Knowledge Map, the one-line
"Primary goal / Active plan" picks and the stale saved next step. On 9takes' real records the prompt
comes out even with today's (22,971 vs 22,472 chars); on the test fixture it is 12% smaller.

**Goal shifts.** The identity rule: when DJ states an aim, priority or deadline that isn't among the
goals in Live Facts, conflicts with one, or revives work the story marks paused, the steward doesn't
record it yet: it checks feasibility against the records, asks once whether it's a shift and what
gets paused, then updates goals/milestones/plans. A pause changes no record state (there is no
"paused" goal state); capture writes it to START HERE Decisions, which the narration budget never
drops before custom sections. The worker pins `create_onto_goal`, `update_onto_goal`,
`update_onto_plan`, `update_onto_milestone` on steward turns so Jev can't drop them on the
confirming turn.

**Trust.** The approved charter lives in a row RLS lets DJ read but not write. Only
`POST /api/onto/projects/[id]/steward` (session auth, write access, `project_steward` flag, admin
client) writes it, by copying the charter document's text when DJ clicks Approve. No chat, connector
or worker tool can. When anyone (the steward, Codex) edits the charter doc, the prompt keeps the
approved text and says the edits are pending proposals. Approving opens a review sheet with the
exact text (or a line diff against the approved copy); the POST carries that text's SHA-256 and the
server refuses (409) if the document changed since. The loader re-verifies the stored copy against
`approved_sha256` and checks the `project_steward` flag (turning the flag off is a kill switch).
Approve/toggle write no project log row (it scored as a major project change and woke paid audits
and briefs); the profile table's own invalidation trigger (migration `20260927000000`) applies the
change from the next message.

**On/off.** The chip beside the project title in chat reads "steward" or "standard" (compare
mode), plus "Approve charter" or "Approve edits" when the charter doc differs from what's approved.
Hidden unless the `project_steward` flag is on and the project has a charter.

## Files (pathspec for the commit)

- `packages/agentic-chat-runtime/src/context/steward-packet.ts` (+ `.test.ts`): packet types, fact
  builder, loader, charter hashing.
- `packages/agentic-chat-runtime/src/context/context-loader.ts`: loads the packet beside START HERE,
  after the project RPC authorizes.
- `packages/agentic-chat-runtime/src/context/{context-models,index}.ts`: `steward` field, export.
- `apps/web/src/lib/services/agentic-chat-lite/prompt/steward-sections.ts`: identity, charter, Live
  Facts, document map.
- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`, `types.ts`: steward
  branch; section ids `steward_charter`, `steward_live_facts`.
- `apps/web/src/lib/services/agentic-chat-lite/prompt/steward-prompt.test.ts`,
  `build-lite-prompt.test.ts` (order filter).
- `apps/web/src/lib/services/agentic-chat-v2/prompt-cost-breakdown.ts`: section titles.
- `apps/web/src/lib/server/project-steward.service.ts` (+ `.test.ts`),
  `apps/web/src/routes/api/onto/projects/[id]/steward/+server.ts`.
- `apps/web/src/lib/components/agent/StewardChip.svelte`, `AgentChatHeader.svelte`.
- `apps/web/src/lib/utils/feature-flags.ts`, `packages/shared-types/src/feature-flags.types.ts`.
- `apps/web/src/lib/services/agentic-chat-v2/context-cache.ts` (cache version 5).
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-preparation.server.ts`,
  `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`: context-load stage failures logged.
- `apps/worker/src/workers/agentic-chat/provider/request-builders.ts`: steward planning-tool pins;
  `apps/worker/src/workers/agentic-chat/provider/review/turn-contract.ts`: reviewer section titles;
  `apps/worker/tests/agenticChatTurnProvider.test.ts` (pin test).
- `supabase/migrations/20260927000000_steward_profile_context_invalidation.sql` (APPLIED to prod
  2026-09-27 and recorded).

## Checks (free)

- Runtime package: 682/682 (steward-packet 11). Web: 180/180 across prompt, cost breakdown, steward
  service, worker turn preparation, prepared prompt and materialized context. `pnpm --filter
@buildos/web check`: 0 errors. ESLint clean on new files; route, column, select and icon
  guardrails OK. (`guardrails:styles` flags stale Inkprint CSS from 9e2327f92, not this change.)
- Real-data render: 9takes' live records (read-only SQL, 2026-09-26) + the drafts below, rendered
  locally with no model calls.
- Classic project chat is unchanged by construction: every change is behind a steward packet, which
  exists only when a user has an approved charter row.

## Done 2026-09-26 (DJ: "Yes, create the charter doc, rewrite the start here story sections, turn on the steward setting for my account, and also make sure it's just live properly in dev.")

- Charter doc created through the connector, placed right after START HERE.
- START HERE authored sections replaced with the narration below; the snapshot worker refreshed the
  status block on write ("37 open tasks · 11 overdue").
- `feature_flags(project_steward)` on for DJ (prod row).
- Dev check on `localhost:5175` (DJ's session): the chip showed "Approve charter"; clicking it wrote
  the approved copy and flipped the chip to "steward". A typed-but-unsent draft triggered prewarm, and
  the prepared prompt in `agentic_chat_prepared_prompts` is the steward prompt (24,251 chars, cache
  v5, charter + Live Facts, no knowledge map, no saved next step). The draft was cleared; nothing sent.
- `FASTCHAT_CONTEXT_CACHE_VERSION` 4 → 5 (`apps/web/src/lib/services/agentic-chat-v2/context-cache.ts`):
  dev and production share one database and snapshot table, so a snapshot written by pre-steward
  code must not satisfy steward code.

## Adversarial review (2026-09-27)

DJ: "do an adversarial review of your work and make it better … or have another agent do" it. Two
fresh-context reviewers (code/trust and behavior-on-the-real-prompt), every finding checked against
code or prod data before fixing.

Fixed:

- **Paid side effects (high).** The approve/toggle log row (`project`/`updated`) scored 5 = major in
  `project-audits.ts`; two in 72 h met the paid critical-change audit, and it could route the daily
  brief to the paid per-project path and notify collaborators. Row removed; statement trigger on
  `user_project_behavioral_profiles` invalidates instead (rehearsed, applied, recorded).
- **Goal tree read one edge direction (high).** Real graph uses child-first rels too
  (`supports_goal` 50, `contributes_to` 31, `implements` 25, `supports` 9 across prod) and legacy
  `has`. Edges now fetched by an allowlist of containment rels and normalized parent → child; plans
  under a milestone roll up to its goal; sequence/dependency rels (`led_to`, `precedes`,
  `depends_on`) are ignored. Milestones now show task counts.
- **Blind approve (high).** Review sheet + hash-pinned approve (above). Once approved, only the
  approved document counts (no newer charter-typed doc becomes approvable by recency).
- **Failed reads rendered as facts (medium).** Failed stages are marked unavailable and rendered as
  "Not loaded this time … treat as unknown"; context-load `onError` now logs.
- **Flag not a kill switch; stored copy not re-verified (medium).** Both checked in the loader.
- **Stale next step via Location (high).** The digest's "Next step: Deploy /book-session …" reached
  the prompt through Location's status block. Steward Location skips the status/overdue/upcoming/
  recent-changes block (Live Facts carries all four); overdue tasks keep their id lines.
- **"Facts win" contradicted newer decisions (high).** Now: facts win on counts, dates and recent
  changes; the story wins on decisions; a record untouched since a later decision is stale.
- **Narration truncation dropped Decisions (high).** Budget 6K; over budget, custom sections drop
  (last first) before standard ones (`START_HERE_AUTHORED_SECTION_NAMES`).
- **Codex/"released" hallucination bait (high).** Identity says no tool reaches Codex or Claude
  Code (`delegate_task` starts a BuildOS agent), never say sent/released/underway, name only tools it
  has.
- **Generic construction contract (medium).** Steward-only evidence bullet (the rule, no permit
  exemplars) and no "three questions" interview bullet; classic contract unchanged.
- **Dates (low).** Midnight-UTC timestamps render as calendar dates in steward sections ("May 25",
  was "May 24"); a date-only plan end runs through its whole day.
- **Chip.** Flag checked before project access (one read for non-steward accounts, then memoized);
  project-switch guard; refresh after each finished turn; errors toast at every width; label-in-name
  aria. Reviewer sees Live Facts as evidence and drops the charter like Identity.
- **Data (prod, via connector; counts as "Codex").** START HERE: "Decisions and guardrails" merged
  into the standard Decisions section with "Pre-reframe work is paused, not decided (Sep 23)"; the
  Apr 2025 move-only decision scoped to that reorganization (it read as a standing ban on editing
  documents); Ryan and Shaikh named in Threads #1 (they lived only in the stale next step). Charter
  proposal (pending DJ's approval): "therapy" implies licensed care; Moves "run in chat when asked;
  none is a tool"; pre-publish check reads the North Star first; "DJ hands it to Codex himself".

Measured: real 9takes steward prompt 24,251 → 22,142 chars (dev prepared prompt, 2026-09-27 05:00Z).
Checks: runtime 687/687; web prompt + chat-v2 + steward service 625/625; worker provider + review
evidence 177/177; worker typecheck clean; web `check` exit 0; eslint clean on changed files (the
worker provider test file has pre-existing lint errors elsewhere). Browser: chip showed "Approve
edits"; the sheet showed "+4 −4 lines since your last approval" with struck/green lines; cancelled,
nothing approved.

Not fixed (low, noted): two tabs approving/toggling at once can lose one write (read-modify-write of
`dimensions`); the packet also loads for project-scoped context types that never render it (a
workflow v4 path); if the approved charter document is deleted, the chip has no way to adopt a new
one (needs a product call).

## Pending (needs DJ)

1. **DJ's first real conversation** in 9takes project chat on local dev. Starter scorecard lines are
   on the design page ("Pick 9takes back up", "What's next?", a goal statement that isn't in the
   goals).
2. **Commit + deploy** so production renders the steward too.
3. **`pnpm agentic:prod-battery`** (paid, optional per AGENTS.md since 2026-09-24): re-proves
   standard chat after deploy. Needs DJ's OK and a cost estimate on the acting model.

## Landmines

- **"Codex" in Live Facts includes Claude Code sessions** that use DJ's `Codex-all-projects`
  connector key (this session's two writes counted as Codex). Attribution follows the key, so give
  Claude Code its own key to split the count.

- **Midnight-UTC due dates render a day early** outside steward sections: Codex stores "due
  2026-05-25" as `2026-05-25T00:00Z`, which generic prompt sections show as May 24. Steward sections
  read it as a calendar date (2026-09-27); the system-wide fix is still open.
- **Local dev chat turns run on the PROD Railway chat worker.** The web-side steward prompt applies
  in dev now; the worker-side tool pins and reviewer titles apply only after the worker deploys.
- **The narration goes stale without the loop.** Talk to DJ was deployed on Sep 26, after the design
  page's narration was written that morning. Until step 4 (the refresh loop, paid) lands, capture
  keeps "Current state" fresh from chat, and Live Facts shows what Codex changed.
- **Jev narrows tools per pass.** Fixed by the worker pins (steward turns only, detected from the
  `steward_charter` section id); live only after the worker deploys.
- The client-supplied session context cache can carry a `steward` field; it only reaches that
  user's own prompt, so it is not a third-party injection path.

## Draft: 9takes steward charter (doc title "9takes Steward Charter"), as approved 2026-09-26

The 2026-09-27 proposal lives in the document itself; review it from the chat chip.

```markdown
# 9takes Steward Charter

**Purpose:** keep 9takes moving and keep its record true. 9takes is a give-first Enneagram platform: you answer before you see how the nine types answered. A large personality-analysis corpus draws the search traffic.

**Accountable for:** the goal "Make money with 9takes" (a draft since Dec 2025).

**Rules** (each with its source)

1. Until DJ settles the naming, public copy calls sessions coaching, not therapy. No diagnosis, treatment, or promised outcomes. Show 988 wherever sessions are offered. _(Booking page, Sep 24 · T-17, Aug 2)_
2. Nothing goes out (email, DM, post) without DJ's send. Beta participants' words never land in the public repo. _(Therapy on Steroids doc, Sep 23 · T-17)_
3. Never bypass the publish gate. Growth and corpus claims cite a dated source. _(START HERE, Jul)_
4. Personality Series posts pass the North Star's six-box pre-publish test. Instagram is Reels-first. _(North Star, May 19 · Aug 3)_
5. No childhood-wound etiology claims, in posts or in sessions. _(Do-not-write list, Jul 15)_
6. No new strategy docs while activation, publishing, and distribution are stuck. _(START HERE, Jul)_

**Moves** (recipes run by hand for now)

- **Pre-publish check:** run a draft through the North Star's six boxes and name any that fail.
- **Beta session prep:** turn a booking into a recon sheet from the Beta Kit's questions.
- **Weekly review:** what moved, what's stuck, and what's next, from Live Facts and the story.
- **Work order to Codex:** a task with the goal, the exact doc sections, a definition of done, and what to report back. DJ releases it.

**Where work happens:** code, deploys, blog grading, and images run in the 9takes repo (Codex, Claude Code). The daily blog runs on OpenClaw crons. Email goes from dj@9takes.com. @9takesdotcom needs DJ's manual re-login.
```

## Draft: START HERE narration (authored sections; managed blocks unchanged)

```markdown
# START HERE - 9takes

<!-- (managed region kept as is) -->

## What this is

9takes turns the Enneagram into a place to see one situation through nine emotional reads. Its defining interaction is give-first: you answer before you see how the nine types answered. A large personality-analysis corpus draws the search traffic.

On Sep 23 DJ reframed it as "therapy on steroids": the framework lets people do their own inner work faster, and it should feel energizing, not shameful. Success now means the free 1-on-1 beta proves that with real people, then turning attention into participation and repeat use.

## The story so far

- **May:** 12-person long-form outreach. 4 sent by May 19, Schulz on Jun 30, 8 never sent. Ali Abdaal's draft is staged in Gmail.
- **May 19:** Personality Series North Star adopted, with an 8-post Instagram arc. Posts 1–4 done by Jun 30; posts 5–8 built, never posted.
- **Jul 22:** Streetlamp Symposium V5 homepage shipped. The publish gate blocks candidates missing a regrade or images. 5,357 new visitors the week of Jul 6, and 0 signups.
- **Aug 2:** T-17 revenue research scoped (paid decode session, identity capture, TikTok pilot). Not run.
- **Aug 3:** Instagram goes Reels-first.
- **Sep 23:** The reframe: a free 1-on-1 beta DJ leads, with AI helping off-platform. 14 of 18 waitlist rows were a bot wave, blocked Sep 24, leaving 2 real people.
- **Sep 24:** Discovery-call booking page live (30 min, Mon–Thu).
- **Sep 26:** Talk to DJ deployed; 0 notes so far. New-note alerts reach DJ's Gmail.

## Current state

The beta is the only active front. The booking page and Talk to DJ are live, and the two invites wait only on DJ's markup of the Beta Kit. Talk to DJ still needs its admin polish committed and one real end-to-end test from a phone. Everything from before the reframe (the Instagram series, the outreach backlog, the T-17 research) is paused, not decided.

## Threads in flight

1. **Therapy beta:** mark up the Beta Kit, then send invites to the 2 real signups. One may be in Australia, so check the time zone.
2. **Talk to DJ:** commit the admin polish, then leave a real note (text + voice) from a phone and reply from the admin. Repo work.
3. **Publishing pipeline:** last verified Jul 22 (391 published, 485 drafts). Its state since then is unknown.
4. **Distribution:** Instagram paused after post 4, 8 outreach sends open, and the marketing plan's window ended Sep 21.
5. **Parked:** SEO cleanup from the Jul 19 audit (thin category pages, Brené Brown duplicate rows).

## Watch

- The booking page checks only dj@9takes.com for conflicts, not DJ's personal calendar.
- @9takesdotcom needs DJ's manual re-login before any Instagram work.

## Decisions and guardrails

- Streetlamp Symposium V5 is the current design source. Older purple/teal/Noticia direction is historical.
- The homepage must explain the give-first emotional-perspective product above the fold and carry the **THE CIRCLE** brand story.
- Do not bypass the publishing quality gate or make stale growth claims.
- Do not create more strategy documents while the activation leak, publish-gate throughput, and distribution blockers are unresolved.
- Corpus and growth claims should point to dated generated sources.
- Instagram content strategy is Reels-first, not carousels. Reels get organic reach; carousels don't. All new Instagram content will be built as Reels. Existing carousel strategies are being reworked into Reel formats.
- The blog corpus (391 published + 485 drafts) is the primary source material for Reel scripts — each post is a pre-written hook + payoff waiting to be condensed.

## Vocabulary and mental model

- **Give-first:** answer before seeing other perspectives.
- **THE CIRCLE:** the homepage's gathering-place metaphor for multiple personality perspectives.
- **Activation leak:** traffic arrives but does not become a signup, comment, or other high-intent action.
- **Publish gate:** required quality checks (stable grade + hero/thumbnail images) between a generated draft and publication.
- **Streetlamp Symposium V5:** the current visual/design-system direction.
- **Therapy on steroids:** the Sep 23 reframe; the framework as a faster, shame-free way to do your own inner work.
- **Beta Kit:** the session run sheet, recon questions, invite email, and scorecard for the free 1-on-1 beta.

## Open questions

- Does the beta replace "The Decode" ($150 sessions) and the T-17 paid-session research, or run beside them?
- Are the Instagram series and the outreach backlog paused or finished? If finished, 12 tasks can close.
- What result would tell DJ the beta worked?

## Decisions

- **Document reorganization by move-only** - The user explicitly directed that documents be reorganized by moving them under a parent, without creating, editing, renaming, archiving, or deleting any document. _(2025-04-10)_

<!-- (managed region kept as is) -->
```
