<!-- docs/product/product-promise-production-proof-baseline-2026-08-31.md -->

# Product Promise Production-Proof Baseline — 2026-08-31

**Program:** [Tasker 78](../../tasker/78-product-promise-production-proof.md)  
**Status:** Initial WP-0/WP-1 packet; founder ratification and live execution are pending  
**Current paid-launch decision:** **NO-GO**  
**Evidence cutoff:** 2026-08-31

## Decision snapshot

BuildOS should not enable paid billing yet. The repository and production receipts show substantial
working product, but they do not yet prove the complete promise presented to a new customer.

The launch decision is blocked by four independent facts:

1. [Tasker 76](../../tasker/76-production-database-security-containment.md) confirmed anonymous
   production access to three privileged database functions. Cross-user and anonymous isolation is
   therefore a demonstrated failing gate, not merely missing evidence.
2. [Tasker 77](../../tasker/77-billing-commercial-contract-reconciliation.md) found incompatible
   trial and consumption contracts, checkout behavior that does not match visible trial copy, and
   unfinished Stripe/invoice configuration. Paid billing is correctly disabled.
3. [Tasker 70](../../tasker/70-agentic-chat-production-battery-remediation.md) has strong partial
   production receipts, but the isolated repetitions and complete nine-scenario zero-retry battery
   are still open. [Tasker 20](../../tasker/20-agentic-chat-wave3-security-brief.md) also keeps the
   detached lifecycle flag off in Production pending its Preview smoke.
4. No retained receipt walks a clean customer account through public registration, mandatory first
   capture, durable project review, Today/Briefs, Agentic Chat, calendar, later-session re-entry,
   account control, and deletion. [Tasker 38](../../tasker/38-live-verification-debt.md) explicitly
   records the missing fresh-account onboarding branches.

Known calendar defects and customer-visible corruption add separate blocking or cohort-limiting
evidence: [Tasker 74](../../tasker/74-calendar-legacy-surface-cleanup.md) records false disconnected
state and broken recurrence editing, while
[Tasker 79](../../tasker/79-customer-visible-paid-launch-polish.md) records malformed Brief copy,
raw ontology syntax, leaked smoke-test data, obstructed content, and incomplete mobile review.

This packet does not change the existing free-beta operating decision. It defines what must be true
before BuildOS accepts money for the bounded cohort below.

## Evidence vocabulary

| Label      | Meaning                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| Automated  | A deterministic repository test or static contract passed; not a live customer receipt |
| Preview    | Verified on a deployed non-production environment                                      |
| Production | Exercised against the intended live release with durable identifiers and cleanup       |
| Partial    | Some steps or invariants passed, but the full journey did not                          |
| Stale      | Previously valid evidence that predates a relevant release or contract change          |
| Missing    | No acceptable receipt found                                                            |
| Fail       | The intended production contract was exercised and violated                            |

Source-complete implementation and green CI count as Automated evidence only. Screenshots prove
visible state at one moment; they do not prove durable mutation, tenant isolation, or cleanup.

## Proposed launch contract

### Product promise for founder ratification

> An individual creator can give BuildOS the messy version of one real project, inspect and correct
> the structured project it creates, return later to a useful next move, and let a permitted agent
> read or change that same project only with grounded context and a truthful receipt.

This is narrower and more testable than the current working sentence in Tasker 78 while preserving
its trust boundary. It makes five observable commitments:

1. rough input is accepted without pre-organization;
2. useful, editable project state is durably created;
3. the original context and later decisions survive re-entry;
4. the person and permitted agent operate on the same scoped state; and
5. every apparent write is backed by an effect receipt, with no silent loss, invention, or
   cross-tenant access.

**Ratification state:** proposed, not founder-ratified. DJ Wayne must accept or replace this sentence
before it becomes the release contract.

### Proposed paid-launch cohort

The most recent founder/market direction is narrower than the current public “creators” audience.
The recommended first paid cohort is:

- invited, English-speaking adult individual author-operators or working indie authors;
- one active book or book-adjacent project with a real deadline, collaborator, audience, or revenue
  consequence;
- a single account owner in the United States, working in a private workspace;
- normal creative/project work only—no emergency, regulated, medical-record, or high-impact
  decision workflow;
- one optional Google Calendar connection; Gmail, SMS, public sharing, team collaboration, and
  external agent clients remain optional preview lanes unless separately proven; and
- founder-led support through one monitored channel with an explicit response owner.

This cohort follows the active-project/value-at-risk recommendation in
[BuildOS market negative-space map](../research/buildos-market-negative-space-map-2026-08-29.md)
and the creator wedge in the
[homepage positioning source](../marketing/strategy/buildos-positioning-and-homepage-rewrite-2026-05-07.md).
The public homepage currently addresses a broader creator market; that is an acquisition audience,
not proof that every creator workflow belongs in the first paid cohort.

**Cohort ratification state:** proposed, not founder-ratified.

### Proposed browser and device contract

| Environment | Launch check                                                                |
| ----------- | --------------------------------------------------------------------------- |
| Desktop     | Latest stable Chrome on macOS/Windows at 1440×900                           |
| Desktop     | Latest stable Edge on Windows at 1440×900                                   |
| Tablet      | Chrome responsive/browser check at 768×1024                                 |
| Mobile      | Latest stable iOS Safari and Android Chrome at approximately 390×844        |
| Interaction | Keyboard-only and reduced-motion pass on desktop; touch/safe-area on mobile |

The [current getting-started guide](../user-guide/getting-started.md) only calls desktop Chrome or
Edge the best onboarding/capture experience. Mobile support is therefore a proposed launch
contract, not an existing claim with proof. Tasker 79 already requires a 390/768/1440 visual matrix;
Tasker 78 must add real mobile-browser interaction receipts rather than treating responsive
emulation as equivalent to a device run.

## Public claim inventory and disposition

The production homepage, pricing, help, Terms, and Privacy pages were re-read on 2026-08-31. The
live homepage currently promises rough-input capture, persistent project memory, grounded agent
writes, daily re-entry, calendar actions, and optional Google access. Pricing correctly says billing
is not live, but still advertises plan features whose boundaries are not coherent with the Terms or
the newer consumption model.

| Promise family     | Representative customer claim                                                                       | Best current evidence                                                                                                                                               | Disposition before paid launch                                                                                                                      | Owner         |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Capture            | “Type it, paste it, or say it out loud” and receive a working project                               | Mandatory inline onboarding capture is implemented; zero-project production branch and voice-first longitudinal run are Missing                                     | Keep text/paste only after Journey 2 passes. Treat voice as preview until microphone, transcript, retention, and cleanup pass on mobile and desktop | T38, T78, T79 |
| Organization       | Rough input becomes tasks, goals, docs, milestones, and a clear next step                           | Activation-packet route and project-create contracts have Automated coverage; no fresh-account production receipt                                                   | Keep only if the fixture produces useful, editable, source-grounded structure without duplication in Journey 2/3                                    | T38, T70, T78 |
| Persistent memory  | Return without rebuilding context; context becomes more useful over time                            | Agent session handoff has Partial Production proof; welcome-state logic is Automated; customer longitudinal return is Missing                                       | Keep after Journey 7 passes beyond cache/session expiry; otherwise narrow to “saved project state”                                                  | T70, T78      |
| Agent writes       | Chat/agents find the right item, make the change, and show what moved                               | Strong Partial Production receipts; final zero-retry battery and Production lifecycle flag remain open                                                              | Do not sell as a guaranteed paid capability until T70/T20 gates pass. Every final response needs an effect receipt                                  | T70, T20, T38 |
| External agents    | Claude, ChatGPT/Codex, and OpenClaw use the same live project state                                 | Gateway/tool authorization has substantial Automated coverage; cross-client longitudinal proof is Missing                                                           | Label preview or remove from the paid core promise until scoped read/write/revoke/audit journeys pass                                               | T20, T38, T76 |
| Daily guidance     | Daily project-aware briefs show what changed and what is next, in app/email                         | Worker and route coverage are Automated; production audit found malformed content and smoke data; IA/brief work is incomplete                                       | Narrow to an opt-in beta until Journey 4 passes quality, freshness, delivery, and recovery gates                                                    | T27, T52, T79 |
| Calendar           | Read availability and create/update/remove scheduled work; task scheduling works around commitments | Core source-aware route completed a Production create/read/update/delete recurring-series smoke with clean teardown; legacy connection and recurrence surfaces Fail | Narrow to the exact verified direct event route or close T74 before keeping general “calendar sync”/task recurrence copy                            | T74, T38      |
| Google privacy     | Calendar and Gmail are separate opt-in connections and can be disconnected                          | Legal/source contracts align; end-to-end connect/use/disconnect/revoke cleanup is Partial or Missing                                                                | Keep only after Journey 6 and deletion/revocation checks prove the exact scopes and cleanup                                                         | T74, T38, T78 |
| Isolation          | Private state is not exposed to anonymous or other users                                            | Three anonymous-executable privileged Production RPCs are confirmed                                                                                                 | Paid-launch blocker. Do not imply a paid trust contract until T76 containment and two-user probes pass                                              | T76           |
| Trial/price        | 14-day trial, $20/month, read-only grace, cancel anytime                                            | Pricing says billing is off; Terms/trial implementation and consumption plan conflict; checkout behavior conflicts with visible copy                                | Keep only “billing is not active and an account will not charge you.” Remove all launch offer specifics until T77 is ratified                       | T77           |
| Unlimited projects | Pro includes unlimited projects                                                                     | Conflicts with the proposed usage-threshold commercial model; no scale/entitlement proof                                                                            | Remove or replace with the exact ratified allowance                                                                                                 | T77           |
| Data export        | Pro includes “Data export”                                                                          | Individual artifact exports exist; Terms say not all data is available through self-service export                                                                  | Replace with an exact list of exportable artifacts or build/prove a complete portable export                                                        | T77, T78      |
| Priority support   | Pro includes priority email support                                                                 | A contact email exists, but no paid SLA, queue, coverage window, or escalation receipt is defined                                                                   | Remove “priority” or define the monitored channel, response owner, target, escalation, and incident path                                            | T77           |
| Account deletion   | Access ends immediately and active-system account data is deleted within 30 days                    | Deletion scheduling has Automated coverage; no retained full live purge/revocation receipt was found                                                                | Legal promise: must pass Journey 9 including Stripe, auth, storage, Google credentials, owned data, retained records, and 30-day completion         | T77, T78      |

Additional claim hygiene findings:

- Help says BuildOS “syncs tasks with due dates,” while Tasker 74 records a broken task recurrence
  path. This should be narrowed to the exact verified event behavior until the task contract is
  green.
- Pricing says “Data export,” while Terms explicitly warn that not all data is self-service
  exportable. The broad pricing phrase is not currently supportable.
- Homepage examples state “Every change stays attached to the project” and that agents “write
  results back.” These are launch-level correctness claims and inherit Tasker 70’s open gate.
- Current Terms correctly tell customers to review AI output. Product proof should establish useful
  and correctable structure, not imply that AI output is infallible.

## Canonical longitudinal fixture

Use one fictional, non-sensitive fixture through Journeys 1–9 so durable continuity can be observed.
Every created title must start with a run marker such as `PP78-20260831T153000Z`.

**Persona:** invited individual author-operator creating a six-episode narrative podcast as a
book-audience pilot. This stays inside the creator/book-adjacent cohort while exercising documents,
tasks, goals, dates, a collaborator, calendar, and a real next decision.

Before each run, resolve `PILOT_DEADLINE` to 45 days after the run date and `EDIT_DATE` to the first
Thursday 7–13 days after the run date. Render both as absolute dates and retain the resolved text in
the run manifest; relative date language is not allowed in the executed fixture.

**Messy input template:**

> I’m trying to launch a six-episode podcast pilot called Harborlight before PILOT_DEADLINE. I have
> interview notes from Maya and Devon, but Maya has not approved the quote about the marina fire.
> Episode one needs a rough script, fact check, music choice, and a 30-minute edit with Devon next
> on EDIT_DATE. I can work Tuesday and Thursday after 2pm America/New_York. The main risk is using the quote
> before approval. I keep bouncing between researching more and writing. Please turn this into one
> project, preserve the notes and uncertainty, and give me the safest next move. Do not invent an
> approval, a budget, or another deadline.

**Minimum semantic rubric:**

- exactly one new project for Harborlight, with the run marker and raw source traceable;
- at least one inspectable document or source note that preserves Maya, Devon, the unapproved quote,
  availability, and the resolved deadline;
- grounded tasks for quote approval, rough script, fact check, music decision, and edit session;
- a milestone/goal representing the six-episode pilot without inventing a budget or approval;
- the unapproved quote represented as a risk/open question, not as completed work;
- a next move that addresses approval or the rough script without claiming nonexistent state; and
- no duplicate project/entity after refresh, retry, reconciliation, or later-session continuation.

**Later commissioned mutations:**

1. “Move the edit with Devon to EDIT_DATE at 3pm America/New_York and put it on my connected
   calendar.”
2. “Mark quote approval complete and add this decision: Maya approved the quote for episode one.”
3. Ambiguous control: “Move the interview task to Friday.” Multiple matching tasks must cause a
   durable clarification, not an invented selection or claimed change.

**Accounts:** Account A owns the fixture. Account B is an unrelated ordinary user. Anonymous probes
use no session. No personal email, calendar text, phone number, or payment material belongs in the
retained packet.

**Run manifest:** retain release SHA/deployment IDs, account aliases, run marker, project/entity IDs,
chat session/turn/stream/effect IDs, calendar provider and mapping IDs, brief ID, Stripe test/live
object IDs, PostHog event timestamps, durable assertions, screenshots, timing/cost totals, cleanup
queries, and the person who verified the run. Secrets and customer content must not be copied.

## Golden journey matrix

### J1 — Discover and start

- **Persona/account state:** new invited cohort user; no BuildOS account or active session.
- **Fixture:** Account A alias and the Harborlight run marker.
- **Exact steps:** open homepage/pricing/help/Terms/Privacy; register with email/password; accept the
  exact policy versions; complete any required verification; sign in; land in mandatory onboarding;
  repeat the public auth entry with Google sign-in or remove that option from the supported contract.
- **Expected durable state:** one Auth user, one matching public user, policy acceptance version/time,
  no subscription or charge while billing is disabled, and one authenticated onboarding session.
- **Telemetry:** registration outcome, auth provider, verification outcome, `onboarding_started`,
  route/deployment version, and failure class without credentials.
- **Cleanup:** delete the test account through Journey 9; confirm no duplicate profile, acceptance
  intent, welcome-sequence, or orphan Auth row.
- **Owner / Automated coverage:** T38/T78;
  [registration](../../apps/web/src/routes/api/auth/register/server.test.ts),
  [login](../../apps/web/src/routes/api/auth/login/server.test.ts),
  [onboarding](../../apps/web/src/routes/api/onboarding/server.test.ts), authenticated-route tests,
  and [welcome-sequence logic](../../apps/web/src/lib/server/welcome-sequence.logic.test.ts).
- **Live evidence / last verification / result:** public claims re-read in Production 2026-08-31;
  fresh-account registration-to-onboarding receipt **Missing**. **OPEN — launch-blocking proof gap.**

### J2 — Capture messy input

- **Persona/account state:** Account A in the non-explore, zero-project onboarding branch.
- **Fixture:** exact Harborlight brain dump above, submitted once and retried once under an
  interrupted response.
- **Exact steps:** paste the fixture; submit; observe processing; refresh/reconnect if interrupted;
  close only after a durable mutation summary; inspect the activation receipt.
- **Expected durable state:** the semantic rubric passes; one project only; raw input/source is not
  silently lost; effect/mutation receipts agree with visible copy; retry creates no duplicate.
- **Telemetry:** `first_capture_started`, `first_capture_submitted`,
  `first_structure_generated`, `first_project_created`, `first_project_reviewed`, project/session/
  turn/effect IDs, latency, provider passes, tokens, cost, and retry/reconcile reason.
- **Cleanup:** remove every entity bearing the run marker, then query for projects, tasks, docs,
  edges, events, chat sessions, and pending worker rows.
- **Owner / Automated coverage:** T38/T70/T78;
  [activation packet](../../apps/web/src/routes/api/onto/projects/%5Bid%5D/activation-packet/server.test.ts),
  project-create executor tests, Agentic Chat fixture/assertion suites, and onboarding component
  logic.
- **Live evidence / last verification / result:** existing-project onboarding branch was exercised
  on DJ’s account before 2026-07-24; the mandatory fresh zero-project branch remains unchecked in
  T38. **OPEN — no acceptable fresh-account production receipt.**

### J3 — Understand the result

- **Persona/account state:** Account A immediately after J2 with one created project.
- **Fixture:** Harborlight project, its generated document/source, tasks, goal/milestone, risk, and
  next step.
- **Exact steps:** open every generated object from the activation receipt; compare it with the raw
  input; edit one title, task date, document paragraph, risk, and next step; refresh and reopen.
- **Expected durable state:** human-readable labels/links, correct project relationships, all edits
  persist, source uncertainty remains explicit, and no raw IDs/ontology tokens/Markdown fragments
  appear as customer copy.
- **Telemetry:** `first_project_opened`, entity-update/effect receipts, `loop_receipt_viewed`, route
  errors, and renderer/content-contract failures.
- **Cleanup:** included in the run-marker teardown; retain only sanitized screenshots and IDs.
- **Owner / Automated coverage:** T79/T78; activation-packet route test,
  [document export](../../apps/web/src/lib/utils/document-export.test.ts), ontology write-integrity
  tests, and project component tests.
- **Live evidence / last verification / result:** T79 found raw ontology syntax in a Production next
  step on 2026-08-31. **FAIL — customer-visible human-readable-state gate.**

### J4 — Act today

- **Persona/account state:** Account A on the creation day and the following scheduled brief window.
- **Fixture:** Harborlight due work, one completed task, one overdue task, the unapproved quote risk,
  and the connected edit event.
- **Exact steps:** open Today; identify the expected next work; submit one project update; generate/
  wait for the brief; open in-app and email versions; act on one item; refresh after stale/partial
  data and reopen the history.
- **Expected durable state:** one coherent brief for the date, grounded priorities, correct task and
  calendar state, a visible action/receipt path, no duplicate delivery, and safe fallback/retry.
- **Telemetry:** `loop_surface_shown`, `loop_surface_opened`, `loop_capture_submitted`,
  `loop_decision_made`, `brief_generated`, `brief_viewed`, delivery IDs/status, latency, stale/fallback
  reason, and affected entity IDs.
- **Cleanup:** delete test briefs, deliveries, notifications, scheduled jobs, and marked fixture data.
- **Owner / Automated coverage:** T27/T52/T79;
  [Today feed](../../apps/web/src/lib/server/today-feed.service.test.ts), Today component tests,
  [ensure-today route](../../apps/web/src/routes/api/daily-briefs/ensure-today/server.test.ts),
  [brief generator](../../apps/worker/tests/briefGenerator.test.ts), schedule/idempotency/stale tests,
  and email-template tests.
- **Live evidence / last verification / result:** T79 found malformed Markdown and smoke-test data
  in Production Today/Briefs on 2026-08-31; T27 retains incomplete IA/brief work; T52’s newer runtime
  was not deployed in its last update. **FAIL — quality and coherence gate.**

### J5 — Ask and delegate

- **Persona/account state:** Account A in the Harborlight project; Account B has no access.
- **Fixture:** grounded read, exact task update, three-item batch update, ambiguous interview task,
  external-content prompt-injection probe, and an unexecuted-write claim probe.
- **Exact steps:** ask project status; commission the exact date mutation; commission a batch;
  issue the ambiguous instruction; inject write instructions through external content; refresh and
  continue in a second turn; attempt Account B access.
- **Expected durable state:** correct scoped reads; only commissioned writes execute; ambiguous work
  persists clarification; external content cannot widen write authority; every success has a
  succeeded effect; session handoff persists; cross-user access fails.
- **Telemetry:** turn/stream/run/effect IDs, context source, tool graph, candidate/contract/mutation
  review SHAs, clarification ID, classified logical provider passes, tokens, cost, latency, and
  terminal/effect reconciliation.
- **Cleanup:** service-role cleanup proves zero harness projects/entities and no running/queued test
  turns remain.
- **Owner / Automated coverage:** T70/T20/T38; the Agentic Chat runtime/worker suites,
  [production E2E scenarios](../../apps/web/src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts),
  access/policy tests, and lifecycle/reconcile tests.
- **Live evidence / last verification / result:** reviewed execution, session handoff, and isolated
  reschedule have Partial Production proof through 2026-08-30. The final isolated repetitions,
  nine-scenario battery, manual R1–R8/security probes, and lifecycle flag are open. **OPEN — P0 gate.**

### J6 — Schedule work

- **Persona/account state:** Account A with one approved Google Calendar connection and Harborlight
  project access.
- **Fixture:** Thursday edit event, recurrence add/change/remove, provider timeout, revoked source,
  and duplicate request.
- **Exact steps:** connect; select the intended source; create/read/update/delete an event; add/
  change/remove recurrence from the task UI; perform the chat-requested move; interrupt/retry;
  disconnect and verify future access stops.
- **Expected durable state:** provider event, `onto_event`, sync mapping, edge/task state, recurrence,
  and visible UI agree; idempotent retries; revoked sources fail closed; deletion leaves no orphan.
- **Telemetry:** source ID, provider event ID, ontology event/mapping IDs, operation/idempotency key,
  sync job/status/error class, reconciliation result, and disconnect/revocation receipt.
- **Cleanup:** delete provider series/events, ontology events, mappings, edges, temporary tasks,
  grants/tokens, and pending sync jobs; record zero-orphan queries.
- **Owner / Automated coverage:** T74/T38;
  [calendar route](../../apps/web/src/routes/api/calendar/server.test.ts), service/source-routing/OAuth
  tests, task-event-sync tests, calendar executor tests, and Agent Run calendar tests.
- **Live evidence / last verification / result:** the source-aware route passed a full recurring
  series lifecycle with zero-orphan cleanup before 2026-08-29, but `/time-blocks` falsely reported
  disconnected and recurrence editing hit a removed column. **FAIL — two deterministic defects.**

### J7 — Return later

- **Persona/account state:** Account A signed out after J1–J6, returning after session/context caches
  expire and after at least one scheduled brief window.
- **Fixture:** Harborlight project, last decision, unresolved quote risk, chat clarification, next
  step, and calendar event.
- **Exact steps:** record the expected state; sign out; wait past the ratified cache/session window;
  sign in on the same and another supported device; open Today, project, and prior chat; continue
  without restating the fixture.
- **Expected durable state:** the same project, source, decision, next step, conversation context,
  clarification, and schedule are present; no stale cross-project state; later edits persist.
- **Telemetry:** authenticated visit/session ID, context-load source, cache hit/miss, project and chat
  IDs, welcome-sequence branch, `loop_surface_shown`, and re-entry latency/error.
- **Cleanup:** included in account deletion and run-marker teardown.
- **Owner / Automated coverage:** T70/T78;
  [worker session handoff](../../apps/worker/tests/agenticChatSessionHandoff.test.ts), history/context-
  cache tests, authenticated-user activity tests, and welcome-sequence state tests.
- **Live evidence / last verification / result:** Agentic Chat has a Partial Production two-turn
  handoff receipt, but no later-session customer longitudinal receipt was found. **OPEN.**

### J8 — Recover safely

- **Persona/account state:** Account A during capture, chat write, brief generation, and calendar
  mutation; two concurrent tabs.
- **Fixture:** network disconnect, provider timeout, expired auth, duplicate submit, partial success,
  stale data, worker restart, and conflicting-tab edit.
- **Exact steps:** inject each failure at the authoritative boundary; observe the visible state;
  retry/reconcile/resume; refresh and query durable/provider state; repeat duplicate submissions.
- **Expected durable state:** at most one mutation; no false success or hidden charge; explicit safe
  next action; terminal or reaped work; stale worker cannot overwrite newer state; cleanup succeeds.
- **Telemetry:** idempotency and execution generation, effect status, retry/reconcile reason,
  lifecycle heartbeat/terminal, stale-reaper receipt, provider attempt/cost, and customer-visible
  error class.
- **Cleanup:** terminate/reap test jobs, delete fixture state, and prove no running rows, provider
  orphans, pending notifications, or double usage entries.
- **Owner / Automated coverage:** T20/T70/T74/T77;
  [mutation partial recovery](../../apps/web/src/lib/services/agentic-chat-v2/mutation-partial-recovery.regression.test.ts),
  lifecycle, stale-reaper, reconciliation, idempotency, calendar compensation, webhook, and brief
  stale/idempotency tests.
- **Live evidence / last verification / result:** substantial Automated coverage and selected
  Production receipts exist, but the detached lifecycle remains off in Production and no composed
  cross-domain forced-failure run exists. **OPEN — launch-blocking proof gap.**

### J9 — Pay and control the account

- **Persona/account state:** Account A at the ratified free boundary, then paid, canceled/refunded,
  read-only/frozen as applicable, exported, and deleted.
- **Fixture:** exact ratified tier/price, Stripe test objects plus one bounded live payment, one
  failed payment, data-copy request, Google connections, and the Harborlight workspace.
- **Exact steps:** cross the boundary; see warning; checkout; process duplicate/out-of-order
  webhooks; use entitlements; download invoice/export; manage payment; cancel; resubscribe/refund;
  fail/recover payment; request account deletion; verify immediate lockout and final purge.
- **Expected durable state:** Stripe, billing state, ledger, entitlements, invoice, notices, analytics,
  support receipt, export, cancellation, retained records, Auth/storage/integration deletion, and
  30-day purge agree with one contract; no double charge or transition.
- **Telemetry:** checkout/session/customer/subscription/invoice/event IDs, canonical billing
  transition, idempotency key, entitlement decision, notification/support receipt, deletion job,
  remote revocations, and final purge counts.
- **Cleanup:** refund/cancel bounded live payment; remove test-mode objects where supported; complete
  deletion; retain only sanitized financial/audit identifiers required by policy.
- **Owner / Automated coverage:** T77/T78;
  [consumption billing](../../apps/worker/tests/agenticChatConsumptionBilling.test.ts),
  [billing-context cache](../../apps/web/src/lib/server/billing-context-cache.test.ts),
  [account deletion route](../../apps/web/src/routes/api/account/settings/server.test.ts), AccountTab
  tests, and the deletion cron. No focused Stripe checkout/webhook test was found in this pass.
- **Live evidence / last verification / result:** commercial contract is unratified, configuration
  is unfinished, paid billing is disabled, full self-service export is not present, and no complete
  live lifecycle receipt exists. **FAIL/OPEN — P0 paid-launch blocker.**

### J10 — Isolation and privacy

- **Persona/account state:** Account A owner, unrelated Account B, anonymous caller, revoked
  collaborator/agent, and service-only maintenance actor.
- **Fixture:** all Harborlight entity IDs plus guessed IDs, public-share states, agent credentials,
  realtime channels, APIs, RPCs, files, search, calendar, billing, and admin functions.
- **Exact steps:** probe UI/API/RPC/realtime/public-share/agent paths as B and anonymous; attempt reads
  and writes; revoke access and repeat; verify only the intended public projection; run known
  privileged-function probes; inspect logs without leaking data.
- **Expected durable state:** all private reads/writes fail closed; public views expose only the
  published projection; revoked access stops; service/admin functions reject client roles; no
  mutation, revenue disclosure, or side-channel receipt occurs.
- **Telemetry:** actor/role, route/RPC/tool, resource class, allow/deny reason, security event,
  response class, database effect count, and release/advisor snapshot—never secret values.
- **Cleanup:** revoke keys/shares/grants, remove probe data, confirm no mutation, and retain sanitized
  denial/advisor receipts.
- **Owner / Automated coverage:** T76/T20/T38; RLS/access tests, project access/tool policy tests,
  private realtime authorization tests, public-page tests, privilege drift checks, and two-user
  live probes.
- **Live evidence / last verification / result:** T76 directly confirmed three anonymously
  executable privileged functions in Production on 2026-08-31. **FAIL — P0 isolation blocker.**

## Owned blocker ledger

| Severity                         | Gate                                                                                 | Evidence state          | Narrowest owner | Required closure receipt                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------ | ----------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| P0                               | Anonymous privileged database access and unexplained definers                        | Production Fail         | T76             | Focused containment deployment, denied-role receipts, two-user probes, advisor rerun, same-user regression                         |
| P0                               | Commercial offer, Stripe configuration, entitlements, support, and policies disagree | Fail/Missing            | T77             | Founder-ratified state machine, aligned surfaces, full test lifecycle, one bounded live payment/refund, 48-hour cohort observation |
| P0                               | Agentic Chat complete correctness/cost release gate                                  | Partial Production      | T70             | Required isolated repetitions, nine-scenario zero-retry run, read fixture, reconciled telemetry, zero-data cleanup                 |
| P0                               | Detached lifecycle not enabled in Production                                         | Preview smoke Missing   | T20             | Preview detach/reconcile pass, controlled Production enablement, terminal/reaper receipt                                           |
| P0                               | Calendar customer contract has two deterministic defects                             | Production Fail         | T74             | Connection and recurrence repairs, deployed live create/change/remove pass, zero-orphan cleanup                                    |
| P1 → P0 if visible in golden run | Raw tokens, malformed generated copy, smoke data, obstruction, mobile gaps           | Production Fail/Partial | T79             | 390/768/1440 plus real mobile pass with representative content and no P0/P1 visible issue                                          |
| P1                               | Today/Brief IA and one-brief review behavior incomplete                              | Partial/undeployed      | T27, T52        | Deployed coherent one-brief/Today path, quality/delivery/recovery live receipt                                                     |
| P1                               | Fresh onboarding branches and PostHog ingestion not live-verified                    | Missing                 | T38             | Clean non-explore and explore runs, ingested telemetry, activation-funnel receipt, cleanup                                         |
| P1                               | Product promise, cohort, and browser support not founder-ratified                    | Proposed                | DJ Wayne, T78   | Signed decision recorded in this packet/Tasker 78                                                                                  |
| P1                               | Complete later-session longitudinal run absent                                       | Missing                 | T78             | J1–J9 on supported desktop/mobile with manifest, durable queries, and deletion cleanup                                             |

No launch-critical gap discovered in this pass is intentionally unowned. A new deterministic defect
must be routed to the narrowest domain tracker; Tasker 78 owns only orchestration, the longitudinal
fixture, evidence reconciliation, and the final decision.

## Release-order recommendation

1. Keep paid billing disabled. Ratify the product promise, cohort, browser/device contract, and
   Tasker 77 commercial state machine.
2. Contain Tasker 76’s confirmed production exposures before trusting subscriber, billing, or
   cross-user results.
3. Close the narrow production gates in Taskers 70, 20, and 74. Deploy Tasker 52’s runtime and the
   launch-critical Today/Brief changes from Tasker 27.
4. Clear Tasker 79’s P0/P1 customer-visible failures with representative fixture data.
5. Re-run existing isolated domain gates after those deployments; do not spend on the full
   longitudinal run while a known P0 is still open.
6. Execute J1–J9 with Account A on every supported environment, including a later session after
   caches expire. Execute J10 with Account B and anonymous clients.
7. Reconcile durable database/provider state, telemetry, costs, screenshots, and cleanup into one
   release-versioned packet. Re-run only failed journeys after a fix, then run the complete matrix
   once without harness retries.
8. Issue the final go/no-go decision. Any accepted P1 must name the owner, affected cohort, customer
   disclosure or claim narrowing, expiry/review date, and rollback trigger.

## Baseline launch decision

**NO-GO for paid launch as of 2026-08-31.**

The decision can change only after the founder-ratified promise and cohort are recorded, every P0
above has a passing Production receipt, all ten journeys pass on the supported matrix, cleanup is
complete, and the final packet contains no unowned P0/P1 failure. Until then, the only commercially
safe public statement is the one already visible on Pricing: billing is not active and creating an
account does not create a charge.
