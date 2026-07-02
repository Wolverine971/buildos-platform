<!-- docs/reports/buildos-loose-ends-inventory-2026-06-11.md -->

# BuildOS Loose Ends Inventory

Date: 2026-06-11
Scope: local markdown/docs/code scan focused on the Canvas/Faker/influencer, Instagram warm-up, Corsair, MCP, and project-forking workstreams.

This is an inventory of unfinished loops, not a fresh strategy. I did not delete source docs. The main conclusion: the research phase has outrun execution. The immediate value is in closing a few concrete loops, not opening more research threads.

## 2026-06-20 Review Update — Past 48-96 Hours

Scope reviewed on 2026-06-20: recent git history since 2026-06-18, the listed handoff/strategy docs, the current dirty worktree, and focused tests around the shipped engineering areas. Treat this section as the current top-of-file status; the older June 11 inventory below remains useful background, but several items have moved.

### Current Executive Read

The last 48-96 hours closed a lot of engineering substrate work:

- **Agent Work is mostly built, not merely planned.** Durable Agent Runs, worker-side read/write ops, review-before-commit Change Sets, Work Panel, chat delegation, steering/answer continuation, manual dispatch, and saved/scheduled Operatives V1 are in place.
- **Agentic chat search is materially healthier.** Search is confirmed lexical FTS/trigram, not semantic; body search is wired to canonical document content; telemetry is now written on the live v2 path; scoped search from global context is easier; legacy zero-use chat search tools are hidden from chat discovery while preserved for external Agent API callers.
- **Project Knowledge Layer P1 is built.** L0 outline artifact, L1 Project Knowledge Map, and L2 outline/section-read tools are implemented for the chat path.
- **Post-chat refresh/delight work landed.** Project-page mutation refresh, staged-commit refresh, created-entity cards, new-entity entrance, and task completion polish are shipped.
- **The document append / `merge_llm` focus cluster is resolved.** The failure was a stale test harness missing the current project-member access RPC mock, not a verified production append regression.
- **Marketing strategy docs are now clearer, but execution is still the constraint.** LinkedIn action state was consolidated into a single action board; the engagement strategy and personal-brand strategy notes are useful, but posting/reply execution and the DJ throughline decision remain open.

### Completed Or Substantially Completed

| Area                              | Current state                                                                                                                                                       | Evidence                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Agent Work substrate              | Phases 0-4 plus Work Panel/manual dispatch and Operatives V1 are implemented. Write ops and stage-to-commit are documented as live-confirmed; headless checks pass. | `apps/web/docs/technical/architecture/agent-work/HANDOFF_2026-06-20.md`, `START-HERE.md`                                               |
| Shared worker-safe op layer       | `@buildos/shared-agent-ops` builds and typechecks; worker safety tests pass.                                                                                        | `packages/shared-agent-ops/src/*`, verification below                                                                                  |
| Calendar worker port              | Initial worker-safe `CalendarPort` exists and is env/token-gated; review mode hides calendar writes.                                                                | `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.ts`, `apps/worker/tests/calendarInRuns.endstate.test.ts`               |
| Saved/scheduled Operatives        | V1 table, API, editor UI, run-now endpoint, and scheduler path exist.                                                                                               | `supabase/migrations/20260620090000_agent_operatives.sql`, `apps/web/src/routes/api/agent-operatives/`, `apps/worker/src/scheduler.ts` |
| Search telemetry and search eval  | Live v2 persistence writes `result_count` / `zero_result`; eval found 7/8 correct results and root-caused the miss to query formulation, not index failure.         | `AGENTIC_CHAT_SEARCH_AUDIT_2026-06-17.md`, `AGENTIC_CHAT_SEARCH_EVAL_2026-06-19.md`                                                    |
| Chat search discovery cleanup     | Four zero-use legacy entity search tools are hidden from chat discovery, while external API compatibility remains covered.                                          | `AGENTIC_CHAT_TOOL_DISCOVERY_VISIBILITY_TASKER_2026-06-19.md`, `tool-search.test.ts`, `external-tool-gateway.test.ts`                  |
| Project Knowledge Layer P1        | L0/L1/L2 are built and tested for chat. The old `tool-surface-size-report` red budget guard is now green.                                                           | `PROJECT_KNOWLEDGE_LAYER_HANDOFF_2026-06-19.md`, verification below                                                                    |
| Document append / merge behavior  | Focused `update_onto_document` tests now verify append preserves existing content, `merge_llm` calls the LLM when available, and fallback paths append.             | `tool-executor.test.ts`, verification below                                                                                            |
| Brain Dump chat-session hardening | Partial failures after session creation now clean up the seed message/session before returning the DB error.                                                        | `apps/web/src/routes/api/onto/braindumps/[id]/chat-session/+server.ts`, verification below                                             |
| Refresh/delight pass              | Universal project mutation refresh, staged commit refresh, created-entity chips, entity entrance, and task-completion polish are done.                              | `AGENTIC_CHAT_REFRESH_AND_DELIGHT_2026-06-19.md`                                                                                       |
| LinkedIn source-of-truth cleanup  | Per-day LinkedIn warmup/reply docs were consolidated into `linkedin-action-board.md`.                                                                               | `docs/marketing/social-media/linkedin-action-board.md`                                                                                 |
| Marketing strategy synthesis      | Engagement growth, receipt-post, collab, IG repurpose, and personal-brand/polymath throughline strategy notes exist.                                                | `ENGAGEMENT_GROWTH_STRATEGY_2026-06-18.md`, `dj-wayne-personal-brand-vs-projects-2026-06-19.md`, `youtube-vid.md`                      |

### Bugs, Risks, And Incomplete Work Found

| Priority | Item                                                                    | Current finding                                                                                                                                                                                                                                       | Needed next                                                                                                                                      |
| -------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| P2       | Brain Dump chat-session creation is cleanup-hardened, not transactional | The verified orphan/duplicate-session bug is mitigated: downstream seed-message and braindump-link failures now delete the created session and any seed message. This is still not a single DB transaction, so a cleanup failure could leave residue. | Optional later hardening: replace the multi-step route with an RPC transaction if all-or-nothing DB semantics are required.                      |
| P1       | Live calendar smoke is still pending                                    | Headless calendar catalog/port checks pass, but no Google-connected user/project live create/read/delete has been run in this review.                                                                                                                 | Run direct-commit calendar create/read/delete with stored user tokens; verify review-mode catalog exposes reads only.                            |
| P1       | Work Panel / Operatives live UI smokes are still pending                | UI/API/scheduler code exists and typechecks, but handoff still calls out live Work Panel dispatch, review apply, and scheduled Operative smoke.                                                                                                       | Browser smoke: manual run, `review:true` run to `proposal_ready`, apply Change Set, create due scheduled Operative and confirm worker queues it. |
| P1       | Search snippet migration needs deployment confirmation                  | Migration `20260619120000_onto_search_entities_document_content_snippet.sql` exists; search eval still labels it "pending apply."                                                                                                                     | Apply/verify in the target DB before dropping `props.body_markdown`; confirm snippets highlight canonical `content`.                             |
| P2       | Project Knowledge behavior layers are not started                       | L0-L2 are done. L3 proactive read, L4 capture, and L5 Librarian are open.                                                                                                                                                                             | Prioritize L3 proactive read next; then decision artifact/PDR capture and glossary work from the product reflection.                             |
| P2       | MCP parity for document outline/section read is open                    | New L2 tools are chat-path only; external BuildOS Agent API/MCP parity is explicitly deferred.                                                                                                                                                        | Add `onto.document.outline.get` and `onto.document.section.get` ops if external agents need knowledge-layer retrieval.                           |
| P2       | Search remains lexical, not semantic                                    | pgvector infra exists but is still unused by agentic chat. This is now documented, not fixed.                                                                                                                                                         | Decide later with telemetry whether semantic/chunked search is actually needed.                                                                  |
| P2       | Known refresh follow-ups remain                                         | Brief chat still refreshes briefs only; history page still ignores entity mutations unless message state changes; staged change-set path does not emit created-entity cards.                                                                          | Keep as polish unless user-visible reports show stale data.                                                                                      |
| P2       | DB type/migration hygiene                                               | Some handoffs mention hand-edited generated DB types and migrations needing apply/backfill verification.                                                                                                                                              | Run `pnpm gen:all` against the DB when safe; verify outline, search, and Operatives migrations are applied in the intended environment.          |
| P2       | Concurrent dirty worktree                                               | The worktree has many untracked docs and active edits. During this review, `apps/web/src/routes/api/chat/sessions/[id]/*` became modified by another actor; tests pass, but do not accidentally mix it into unrelated commits.                        | Separate commits by workstream before merging or deploying.                                                                                      |

### Marketing / Distribution Still Needed

| Area                             | Current state                                                                                                                                                                       | Needed next                                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| LinkedIn posting                 | The action board says the real failure was zero posting, not target sourcing. As of 2026-06-20, the "fresh" 2026-06-18 items are now older and should be reverified before posting. | Reverify top posts live, ship only still-credible comments, and stop carrying aged-out queues.                              |
| DJ personal brand throughline    | The strategy note is useful but explicitly blocked on the one-sentence throughline across BuildOS, 9takes, and the cadre.                                                           | DJ defines 9takes/the cadre in his own words, then writes the throughline sentence before building a larger content system. |
| Receipts/proof assets            | Strategy now says receipt moments are enough; flagship recommendation is DJ's own marketing operation or Church Ladies.                                                             | Record the first 2-3 real receipt assets: migration post, Church Ladies slice, BuildOS-go-to-market recursion.              |
| Organic-to-paid loop             | `youtube-vid.md` identifies this as the biggest missing growth loop.                                                                                                                | Pick top organic outliers and test hooks with low-budget Meta only after proof assets exist.                                |
| Instagram                        | Recommended as repurpose-only, not a new content job. Older Instagram reply execution still appears to be an execution bottleneck.                                                  | If doing IG, only repurpose receipt assets; do not revive the old ADHD-front-door strategy.                                 |
| Influencer/public artifact loops | Target-influencer docs exist, but Swyx artifact, Riley first touch, Simon-grade MCP artifact, and Operator Index public asset are not proven shipped.                               | Build one public artifact first; do not keep adding profiles before a sendable artifact exists.                             |

### Verification Run During This Review

Passed:

- `pnpm --filter @buildos/shared-agent-ops build`
- `pnpm --filter @buildos/shared-agent-ops typecheck`
- `pnpm --filter @buildos/worker typecheck`
- `pnpm --filter @buildos/web check` — 0 errors, 0 warnings
- `pnpm --filter @buildos/web test -- src/lib/services/agentic-chat/tools/core/search-telemetry.test.ts src/lib/services/agentic-chat/tools/registry/tool-search.test.ts src/lib/server/agent-call/external-tool-gateway.test.ts` — 54 tests
- `pnpm --filter @buildos/web test -- src/lib/components/agent/agent-chat-session.test.ts src/lib/components/agent/agent-chat-step-export.test.ts src/lib/components/agent/agent-chat-tool-presenter.test.ts` — 69 tests
- `pnpm --filter @buildos/worker test -- tests/calendarInRuns.endstate.test.ts tests/packageWorkerSafety.endstate.test.ts tests/scheduler.test.ts` — 27 tests
- `pnpm --filter @buildos/web test -- src/routes/api/chat/sessions/[id]/server.test.ts` — 2 tests
- `pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts src/lib/services/agentic-chat-v2/tool-selector.test.ts` — 21 tests
- `pnpm --filter @buildos/web test -- src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.search.test.ts src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.search-url.test.ts src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.outline.test.ts` — 15 tests
- `pnpm --filter @buildos/web test -- src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.payload.test.ts src/lib/services/agentic-chat/tools/core/tool-executor.test.ts` — 22 tests; resolves the previous document append / `merge_llm` focus cluster.
- `pnpm --filter @buildos/web test -- src/lib/components/agent/agent-chat-timeline.test.ts src/routes/api/chat/sessions/[id]/server.test.ts` — 6 tests
- `pnpm --filter @buildos/web test -- src/routes/api/onto/braindumps/[id]/chat-session/server.test.ts` — 2 tests
- `pnpm --filter @buildos/web test -- src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.payload.test.ts src/lib/services/agentic-chat/tools/core/tool-executor.test.ts src/lib/components/agent/agent-chat-timeline.test.ts src/routes/api/chat/sessions/[id]/server.test.ts src/routes/api/onto/braindumps/[id]/chat-session/server.test.ts` — 30 tests
- `pnpm --filter @buildos/web check` — 0 errors, 0 warnings

### Updated Next 7 Days

1. Run the live Work Panel + review Change Set pass.
2. Run the Google-connected calendar live smoke.
3. Run a scheduled Operative live smoke from UI through worker queue.
4. Verify/apply the search snippet migration and any pending Agent Work/outline/Operatives migrations in the target environment.
5. Decide whether Brain Dump chat-session creation needs a true RPC transaction beyond cleanup hardening.
6. Ship a small number of reverified LinkedIn comments; stop carrying stale action-board rows.
7. Decide DJ's throughline sentence and record the first receipt asset.

## Executive Read

### P0: Close These First

| Loop                         | Current state                                                                                                                                                                                                                          | Next action                                                                                                                                                                          | Source                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram reply execution    | Warmups keep producing queues, but reply runs repeatedly do not execute. 2026-06-11 explicitly says 6/10's best queue in a month produced zero touches.                                                                                | Run `/instagram-reply` against the current queue after live re-verification. If not posting that day, stop generating new warmup docs.                                               | `docs/marketing/social-media/daily-engagement/2026-06-11_instagram-warmup.md`                                                                                   |
| MCP hardening                | Docs now market `/mcp/buildos` as ready, and code has a working facade plus static-key fallback test. But route still has wildcard CORS and GET still returns a challenge-shaped 401 instead of the spec's authenticated 405 behavior. | Make MCP security/compliance the engineering unlock: protocol/header checks, Origin/Host validation, authenticated integration tests, one-command repro, lethal-trifecta self-audit. | `docs/specs/buildos-mcp-server-spec-2026-05-21.md`, `apps/web/src/routes/mcp/buildos/+server.ts`, `apps/web/src/lib/server/agent-call/mcp-connector.service.ts` |
| Swyx artifact                | Swyx is the cleanest now-actionable influencer target because it does not require product/MCP. But the actual artifact does not exist yet.                                                                                             | Build and publish the "Agent Context Layer" living map. BuildOS should be one honest entry, not the hero. Credit Horthy/Willison.                                                    | `docs/marketing/growth/target-influencers/ai-native-builders/swyx.md`                                                                                           |
| Riley first touch            | Riley is no longer a "build him a workspace" recruit. He is a peer-founder with adjacent execution-layer infrastructure. Draft is sendable after verification.                                                                         | Verify handle, current post wording, and product naming; warm with a real reply; send the peer-to-peer DM.                                                                           | `docs/marketing/growth/target-influencers/ai-native-builders/riley-brown.md`                                                                                    |
| Instagram target maintenance | The daily logs carry 7+ unapplied target-doc updates. The source-of-truth target doc is stale.                                                                                                                                         | Patch `instagram-engagement-targets.md`: Greg hold, Hampton monitor-only, Notion mining-only, ADHD Tools count, Perell reopened, Pixie count/recheck, Justin demote trigger.         | `docs/marketing/social-media/daily-engagement/2026-06-11_instagram-warmup.md`                                                                                   |

### P1: Decide This Week

| Decision                                                        | Why it matters                                                                                                 | Recommended call                                                                                                                  | Source                                                                                                                                  |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Does the AI-Native Operator Index ship before scaffold/forking? | It is the fastest credibility artifact and overlaps Swyx/Riley/Simon research.                                 | Yes, as a lightweight public research asset. Do not wait for forking.                                                             | `ai-influencers.md`, `docs/brainstorms/2026-05-21-buildos-canvas-strategy-and-phased-plan.md`                                           |
| First 60 seconds: voice/text and scaffold-vs-clarify            | The whole Canvas strategy depends on the "mess -> structure" moment.                                           | Prototype text-first with voice affordance; scaffold by default; ask one clarifying question only for ambiguous/emotional dumps.  | `docs/brainstorms/2026-05-21-first-60-seconds-design.md`                                                                                |
| Project Group model                                             | The 7-primitives language is locked, but Project Group is doc-only.                                            | Decide whether Project Group is a real table now or a deferred navigation/grouping layer. Do not expose it in APIs until modeled. | `docs/brainstorms/2026-05-21-buildos-canvas-strategy-and-phased-plan.md`, code search                                                   |
| Corsair dependency                                              | Corsair MCP client/tools now exist, but public demo readiness depends on auth, latency, reliability, and gaps. | Pressure-test GitHub first and answer DevJane §10 questions before promising integrations in outreach.                            | `docs/specs/buildos-corsair-plugin-priority-matrix-2026-05-21.md`, `apps/web/src/lib/services/agentic-chat/tools/corsair-mcp/client.ts` |

## Product And Strategy Loops

### 1. Canvas Strategy Is Actionable, But Phase A/B Are Not Closed

The Canvas plan is marked `ready-for-action`. Its thesis is coherent: BuildOS as a durable thinking canvas for long-horizon projects, with the "future AI Faker" as the north-star user. It already resolves one old question: goals and plans are primitives.

Open loops:

- Project Group is part of the 7-primitives language but does not appear to have a first-class model in the repo.
- The first 5-10 SME scaffold workflows have not been chosen.
- The first 60 seconds doc needs DJ reaction, design iteration, and a prototype.
- Scaffold artifact/version model is not specified.
- Cold-user testing for scaffold flow has not happened.
- AI-Native Operator Index timing is undecided.

Next move:

1. Lock a 2-week Phase A/B sprint around first-60-seconds prototype + 3 scaffold templates.
2. Treat Project Group as explicitly deferred unless engineering chooses a model now.
3. Start the AI-Native Operator Index separately as marketing/research, not product infrastructure.

Key files:

- `docs/brainstorms/2026-05-21-buildos-canvas-strategy-and-phased-plan.md`
- `docs/brainstorms/2026-05-21-first-60-seconds-design.md`

### 2. First 60 Seconds Needs Prototype, Not More Copy

The draft is strong enough to build against. The core flow is: one input, visible AI work, structured project appears within 60 seconds.

Open loops:

- Voice vs text default.
- Streaming progress vs batched result.
- Template suggestion timing.
- Returning-user equivalent of the first 60 seconds.
- Brain-dump history.
- Recovery when the scaffold is wrong.
- Clarify-first vs scaffold-first.

Recommended call:

- Text-first default, voice prominent but not blocking.
- Stream progress because trust matters here.
- Templates only after the initial scaffold appears.
- Scaffold-first by default; ask one clarifying question only when the input is too ambiguous or emotional.

Next move:

Build a clickable/prototype flow with one canonical example: "I want to launch a podcast in 90 days but don't know where to start."

### 3. Forking Is Specified, Not Built

The forking spec correctly separates peer invites from template/fork instantiation. Current invite infrastructure grants membership; it does not deep-copy projects or preserve provenance.

Open loops:

- Visibility model: private, link-only, public-discoverable, org-only?
- Dedicated fork/source tables or fields.
- Snapshot review flow.
- Field/export allowlist.
- Secrets/private-data scanner.
- Idempotent clone service.
- Fork count/author metrics.
- Republish rules.
- Whether scaffold templates are just BuildOS-authored public projects.
- Storage/cost model for N deep copies.
- Optional "soft fork" browse-before-copy mode.

Recommendation:

Do not start with full marketplace. Build the public project publish/snapshot model first, then one internal scaffold-template instantiation path. Forking can follow once publish safety exists.

Key files:

- `docs/brainstorms/2026-05-21-project-forking-spec.md`
- `docs/brainstorms/2026-05-21-buildos-canvas-strategy-and-phased-plan.md`

## MCP And Agent-Host Loops

### 4. MCP Is Both Shipped Enough To Talk About And Not Hardened Enough For Simon

Current state from docs/code:

- `/mcp/buildos` exists.
- It supports `initialize`, `tools/list`, `tools/call`, and `notifications/initialized`.
- OAuth connector routes and metadata exist.
- Static BuildOS agent keys can authenticate through the MCP facade; there is a test for `boca_` fallback and successful `tools/list`.
- Public docs say MCP is ready at `/mcp/buildos`.

Still open:

- The route uses `Access-Control-Allow-Origin: *`.
- Authenticated GET behavior still does not match the hardening spec.
- Protocol version, Accept, Content-Type, Host, and Origin validation still need a focused pass.
- No local stdio bridge package exists.
- Search/fetch compatibility profile remains planned.
- Resources/prompts are planned but not v1.
- Simon/Hamel outreach is blocked until a public hardened MCP artifact plus self-audit exists.

Recommended sequence:

1. Protocol hardening and authenticated integration tests.
2. Lethal-trifecta self-audit with explicit threat model for untrusted brain dumps + private project data + outbound tools.
3. One-command repro.
4. Only then approach Simon/Hamel.

Key files:

- `docs/specs/buildos-mcp-server-spec-2026-05-21.md`
- `docs/brainstorms/2026-05-21-agent-host-story.md`
- `apps/web/src/routes/mcp/buildos/+server.ts`
- `apps/web/src/lib/server/agent-call/mcp-connector.service.ts`
- `apps/web/src/lib/server/agent-call/mcp-connector.service.test.ts`

### 5. Agent-Host Strategy Still Has Product Decisions

The strategic direction is clear: BuildOS is the persistent project layer agents connect to. The open decisions are mostly sequencing/pricing/scope.

Open loops:

- MCP-first vs API-first sequencing. The docs recommend both, MCP primary.
- Who is first integration partner/community: Riley/Vibecode, Pietro/MagicPath, AI Engineer community?
- Should the MCP server be open-source?
- Agent-access pricing.
- Whether background agents are v2 or never.
- How native BuildOS AI and external agents share infrastructure.
- Whether daily brief is the prototype for background agents.

Recommendation:

Treat external-agent access as a productized connector surface, not just an engineering endpoint. It is the unlock for the influencer strategy.

## Corsair Loops

### 6. Corsair Is Partly Implemented, But Not Productized

Docs frame Corsair as the third-party integration layer. Code now includes a Corsair MCP client and agent tools:

- `list_corsair_mcp_tools`
- `call_corsair_mcp_tool`

So this is no longer just a matrix/spec. The remaining gap is demo-readiness and UX.

Open loops:

- Confirm S-tier plugins end-to-end: GitHub, X, Google Calendar, Gmail, Notion, Linear.
- Answer DevJane protocol/auth/reliability/commercial questions.
- Decide whether Corsair gives BuildOS per-user vault tokens.
- Build settings/onboarding UX for "Connect Corsair" and connected plugin status.
- Confirm tool schemas/descriptions and override rules.
- Confirm latency target for demo calls.
- Define fallback if Corsair is down or pivots.
- Close catalog gaps: LinkedIn, Instagram, Substack/Beehiiv.
- Confirm Cursor/Figma if targeting Riley/Pietro.

Recommendation:

Spike GitHub through Corsair first. If GitHub works, do one demo recording. Do not claim 52 integrations in outreach; only claim tools that are tested.

Key files:

- `docs/specs/buildos-corsair-plugin-priority-matrix-2026-05-21.md`
- `docs/marketing/strategy/ai-influencer-plugin-stack-map-2026-05-21.md`
- `apps/web/src/lib/services/agentic-chat/tools/corsair-mcp/client.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts`

## Influencer / Faker Loops

### 7. `ai-influencers.md` Needs To Become A Real Asset Or Be Archived

The root `ai-influencers.md` file is useful but currently loose. It contains the top target list and the "AI-Native Operator Index" idea.

Open loops:

- Move it out of repo root into a real research/marketing path.
- Verify any current facts before outreach.
- Score the list with the Faker filter.
- Decide whether each profile becomes part of the public Operator Index.
- Create a tracking row/project for each target.

Recommendation:

Move/synthesize it into the target-influencer system rather than delete it. It is upstream of multiple other docs.

### 8. Riley Brown Is Sendable Now, But Not As Originally Planned

Current state:

- Profile is drafted.
- Artifact status is `not started`.
- First touch is not sent.
- The old workspace-recruit pitch is obsolete because Riley/Vibecode overlaps at the execution layer.

Open loops:

- Verify canonical handle.
- Verify exact "Vibe State" wording/date before quoting.
- Confirm current product/CLI naming.
- Warm with a genuine public reply before DM.
- Optionally prepare a layer diagram for later.

Recommended action:

Send the peer-founder DM after verification. Do not build a fake Riley workspace.

Key file:

- `docs/marketing/growth/target-influencers/ai-native-builders/riley-brown.md`

### 9. Swyx Is The Highest-Leverage Send-Now Target, But The Artifact Is Missing

Current state:

- Profile is drafted.
- No product/MCP dependency.
- Artifact is actionable now but not built.

Open loops:

- Build the Agent Context Layer living map.
- Verify AI Engineer dates/CFP and Latent Space guest path.
- Confirm current handles for Horthy/Willison before tagging.
- Gut-check that the map is not a stealth BuildOS ad.

Recommended action:

Make this the first public research artifact. It also becomes the seed for the AI-Native Operator Index.

Key file:

- `docs/marketing/growth/target-influencers/ai-native-builders/swyx.md`

### 10. Simon Is Blocked By MCP Quality, Not More Research

Current state:

- Profile is drafted.
- Artifact status is explicitly blocked.
- First touch not sent.

Open loops:

- Public or access-granted MCP server.
- One-command repro.
- Internal lethal-trifecta self-audit.
- Contact-page verification.
- Current Datasette Agent / `llm` state verification.

Recommended action:

Do not contact Simon until the artifact exists. The correct ask is "break this MCP server," not "look at BuildOS."

Key file:

- `docs/marketing/growth/target-influencers/ai-native-builders/simon-willison.md`

### 11. Remaining Influencer Profiles Are Unstarted Or Stale

Missing or not yet fully reconciled:

- Pietro Schirano.
- Hamel Husain.
- Harrison Chase.
- Nick St. Pierre.
- Rowan Cheung.
- Allie K. Miller.
- Maor Shlomo / Base44 case study.

Recommendation:

Do not profile all at once. After Swyx/Riley and MCP hardening, profile Hamel or Harrison next depending on which artifact is closer: eval layer vs infra/project-memory layer.

## Instagram Warm-Up Loops

### 12. The Binding Constraint Is Reply Execution

The latest warmup says the previous day's 6-item queue did not execute and that the reply side is the binding constraint.

Current top queue as of the 2026-06-11 scan:

1. @davidperell: ultra-fresh "Excel Is a Writer's Best Friend" clip.
2. @oleg_poskotin: first touch on the first peer-tier AI discovery in 16 runs.
3. @dickiebush: strongest thesis-fit productivity-system-complexity post.
4. @nathanbarry: held first-commenter window.
5. @jayclouse: 22-day held first-commenter window, warmest peer.
6. @gregisenberg: conditional mining only; decline if no 1K+ builder.

Immediate action:

Run `/instagram-reply` after live re-verifying counts. If the queue is stale, re-scan only enough to choose replacements, then post and log.

### 13. Warm Relationships Need Follow-Up

High-signal relationships already found:

- @an.nalogy liked and replied with an @build.os mention. This is called the strongest individual signal in the audit.
- @leaturnerholt liked a @build.os comment and had sent an earlier DM.
- @chloedigital.ai and @justyn.ai had unopened attachment DMs around late March.
- @the_mini_adhd_coach has multiple comment likes, but ADHD lane is now supporting only.

Open loops:

- Profile @an.nalogy and add relationship history.
- Audit/respond/close @build.os DMs.
- Decide whether @justyn.ai is monitor-only due CTA-bait even though there was a DM.
- Add `posted_via` to forward-looking comment-log rows.
- Decide @djwayne3 vs @build.os per slot.

Key files:

- `docs/marketing/social-media/comment-log.md`
- `docs/marketing/social-media/discovery/instagram/candidates.md`

### 14. Discovery Has Mostly Failed Except Oleg

Current state:

- Stage 0 has one active candidate: @oleg_poskotin.
- The 16-run drought broke on 6/10 through Greg mining.
- Hashtag Recent surfaces appear broken on IG web.
- Comment mining often finds voice-fit/audience-fail accounts.
- Peer following-graph walk remains untested.

Open loops:

- Execute Oleg first touch and watch whether he replies like a human.
- Try peer following-graph walk from @jayclouse and @dickiebush.
- Try Perell commenter graph now that author lane reopened.
- Keep Greg as mining tier, not monitor-only.
- Stop relying on hashtag Recent from web.

### 15. Maintenance Backlog Should Be Applied, Then Old Logs Should Be Compressed

Unapplied target-doc updates:

- @gregisenberg: hold at watering-hole-mining tier.
- @hamptonfounders: monitor-only.
- @notionhq: watering-hole-mining-only.
- @theadhdtools: 80.2K, growth decelerating, funnel bio.
- @davidperell: 53.2K, author lane reopened, multiple How I Write clips/day.
- @theproductivitypixie: 6.4K, dormant since May 14, recheck around 6/24.
- @thejustinwelsh: if one more like-bait/hashtag-wall repeat, demote to weekly check.

Recommended cleanup:

- Keep `comment-log.md`, `candidates.md`, and profile docs as source of truth.
- Archive/compress old daily warmups into a weekly digest after all queued rows are either posted, skipped, or superseded.
- Do not delete raw logs until the pending statuses have been reconciled.

### 16. Delete / Skip / Keep Calls For Instagram

Skip / do not rediscover:

- @notion_for_productivity.
- @insightcompendium.
- @drlisaballehr.
- @daptonai.
- @lumi.estate.
- @jadasezer.
- @lacer2k.
- @ai_tools.lab.
- @buildwith.conrad.
- @solopreneur_jennie.

Monitor only:

- @mariepoulin.
- @mattragland.
- @notionwithro.
- @jodigrahamcoach.
- @notionflows.
- @deanmkoe.
- @rubenq24.
- @georgia_la.
- @nataliesalmon.
- @laurennextbigthing.
- @softgirlnocode.
- @hamptonfounders.
- @notionhq.
- Potentially @thejustinwelsh after one more like-bait run.

Keep active:

- @oleg_poskotin, pending first touch.
- @davidperell, author lane reopened.
- @jayclouse, warmest peer but reply overdue.
- @nathanbarry, held FCW and Kit launch surface.
- @dickiebush, recurring fit but avoid product-name repeats.
- @gregisenberg, mining only.

## Documentation Hygiene

### 17. Source-Of-Truth Problems

Loose files and stale docs:

- `ai-influencers.md` is at repo root and untracked.
- Daily warmup docs carry operational state that should live in `comment-log.md`, `candidates.md`, and per-profile docs.
- Some docs claim status changes that later docs supersede. Example: Greg downgrade was contradicted by later non-CTA posts.
- Public docs say MCP is ready, while implementation still has hardening gaps.

Recommended doc cleanup:

1. Move/synthesize `ai-influencers.md` into `docs/marketing/growth/target-influencers/`.
2. Create a current `TARGET_INFLUENCER_STATUS.md` table for Riley/Swyx/Simon/etc.
3. Apply Instagram maintenance updates.
4. Create a weekly Instagram synthesis and stop carrying every daily note forward indefinitely.
5. Add a "MCP public-readiness" status doc that distinguishes "usable" from "Simon-grade/security-hardened."

## Suggested Next 7 Days

1. Execute the Instagram reply queue or deliberately mark each slot skipped/superseded.
2. Apply the Instagram target maintenance backlog.
3. Build the Swyx Agent Context Layer map draft.
4. Verify and send Riley first touch.
5. Start MCP hardening: CORS/Origin/Host/protocol/header tests.
6. Decide whether AI-Native Operator Index is shipping before scaffold/forking.
7. Pick the 3 scaffold templates for the first-60-seconds prototype.

## One-Line Summary

The strategy is not lacking ideas. The open loops are now mostly execution and source-of-truth maintenance: post the warm comments, build one public research artifact, harden MCP, and prototype the first 60 seconds before doing more broad research.
