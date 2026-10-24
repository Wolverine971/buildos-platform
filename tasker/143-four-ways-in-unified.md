<!-- tasker/143-four-ways-in-unified.md -->

# 143 — The four ways into a project behave the same

**Status:** IMPLEMENTED LOCALLY — focused validation passed; full web check blocked by unrelated work; external explainer update awaiting authorization · **Priority:** P1 · **Opened:** 2026-10-23 · **Size:** ~1–2 days

**Owner:** Claude · **Policy decisions needed from DJ:** none; all three recommendations accepted on 2026-10-23

## Implementation (Codex, 2026-10-23)

DJ authorized implementation, focused free tests, and migration rehearsal. Review in three pieces:

1. **Database correctness:** `20261024023325_four_ways_project_join.sql` adds one private
   completion helper and wires direct acceptance (both signatures), link joins, and approvals
   through it. A per-person transaction lock precedes row locks across all entrances. Direct
   acceptance returns actual membership and cannot apply stale invitation permissions. Rejoin
   approvals are restricted to their structured project. Only satisfied rejoin/upgrade requests
   settle; broad requests require the existing explicit owner approval. The current product has
   no separate “send an invitation in response to this request” action, so no association is
   inferred or fabricated. A future such action must retain the request ID explicitly.
2. **Completion delivery:** activity seeding evaluates the joiner's project/member setting and
   preserves inactive subscriptions; batching does the same. The shared helper enqueues owner
   delivery using the existing notification event/delivery/worker queue in the membership
   transaction, once per transition. Owner approvals and already-active memberships do not
   enqueue owner join notices. Delivery retries remain the existing worker's responsibility.
   This replaces the proposed HTTP helper and removes duplicated follow-up code from all three
   routes; there is no external notification request between membership commit and enqueue.
   Channel preferences and agent-connection grants remain explicit. Approval keeps task 140's
   per-project requesting-connection grants.
3. **Arrival and explanation:** shared destination toast/optional push affordance, both direct
   invitation pages, link page, authorized project choices in outgoing requests, preview/list
   agent settings, truthful consent copy, and individual project permissions in approval email.
   Existing-member upgrades open without a false joined message.

Validation: **114 focused tests across 12 files passed** (latest run of each file); the task-specific SQL behavior
check and all four standing checks passed against production's schema. Role probe: authenticated
0 failures before/after; anon retains one pre-existing failure with no regression. This migration
has **0 security, API, or data findings**; the private helper's server-only note is intentional.
Task 140 upgrade regression and the existing rejoin check also passed with task 140's pending
migration applied first. Four two-session races passed (approve/invite, invite/approve,
invite/link, link/invite), proving the second session waits and that final permissions and owner
notification counts are correct. The final rehearsal also covers legacy first-time actor creation.
No paid tests or production writes.

The required `pnpm --filter @buildos/web check` was run through `test-gate`. After rebuilding
`@buildos/shared-types`, task 143 reported no type errors. The check remains blocked by unrelated
workspace work: `proposal-cards/types.ts:30` and `proposal-card.service.ts:52` cannot import
`loadWorkspaceItemsV1` from the runtime's generated declarations. Rebuilding that dependency
through the gate fails in `packages/agentic-chat-runtime/src/tools/workspace-reads.ts:514–516`
(`entity: string` versus `WorkspaceItemEntity`) and `:630` (`name` on `never`). No unrelated source
was edited. The shared-types build, Svelte autofixer, Python race harness compilation, and
targeted diff whitespace check passed.

### Implemented matrix (local evidence)

| Rule | Result across the four entrances | Evidence |
| --- | --- | --- |
| Default agents Read, Write needs Editor, explicit Off/standing approval preserved | Pass | SQL cases, task 140 regression, shared-copy/UI tests |
| Immediate project arrival; asynchronous approvals link to one project or a choice | Pass | Arrival/page tests, notification URL SQL assertion, approval email tests |
| One owner notice for actual direct/link transitions; none for owner approvals | Pass | SQL notification/delivery assertions and four two-session races |
| Follow eligible activity without overriding project/member/global preferences | Pass | SQL join and batch-producer assertions |
| Shared role and agent-consent wording | Pass | Preview/list SQL assertions and copy/UI tests |
| Consistent emails with per-project permissions, including mixed upgrades | Pass | 14 email tests |
| Competing invites retired; only matching satisfied requests settled | Pass | SQL stale-invite, rejoin, broad-request and partial-upgrade cases |
| Former members ask through links; owner invites/approvals can restore them | Pass | Existing rejoin regression and new SQL cases |
| No new connection consent from joining elsewhere | Pass | Shared helper contains no connection writes; requesting-connection-only approval route and task 140 regression tests |

These are local implementation/test results, not claims of production deployment or delivery.

Reproduce the SQL checks with:

```sh
pnpm db:rehearse supabase/migrations/20261024023325_four_ways_project_join.sql \
  --check supabase/tests/20261024023325_four_ways_project_join.check.sql --role-probe --keep
python3 scripts/migration-rehearsal/check-project-join-races.py /tmp/buildos-rehearsal-<returned-directory>
```

The race script uses committed invented fixtures; use a fresh `--keep` directory on each run.

Deploy task 140's `20261024003000_agent_access_wall_fixes.sql` before this migration, then deploy
the web changes. The expanded RPC results are consumed by the new UI. This work has not applied
either migration to production or exercised real email/push delivery.

### Prepared explainer corrections

Update the existing [How BuildOS Sharing Works](https://claude.ai/artifact/JEk3EN2pfLzhc52kpD2kRG)
artifact in place, preserving its layout, unrelated sections, and historical production numbers.
Mark task 143 behavior **implemented and tested locally, awaiting deployment**:

- **Someone asks:** the owner chooses projects, roles, and agent settings. Approval opens one
  project from the notification/email, or offers a project choice for several. It does not
  redirect an unrelated live session. Only the requesting connection(s), per approved project,
  receive grants, and only when that project's agent setting is not Off.
- **Email / @handle:** default Editor, agents Read. Accept opens the named project immediately.
  The same applies to the pending-invites list. Notification setup is optional inside the
  project. A stale invite opens existing access without replacing newer role/agent settings.
- **Invite link / QR:** default Viewer, agents Read, seven days. A new member opens the named
  project immediately. Someone already in it keeps their current access.
- **Someone comes back:** a removed or departed member using a link asks the owner. Approval
  restores only that request's project. A valid direct invitation from the owner can restore
  them immediately. Denying a rejoin still prevents another request through that project's link.
- **Shared completion:** a new/restored direct or link join queues one named owner notice,
  subject to the owner's notification choices. The owner gets no redundant join notice for
  their own approval. Enabled project activity seeds a missing subscription, respecting the
  joiner's member override and any existing global opt-out. Push, email, and in-app preferences
  never switch on implicitly. Joining retires competing project invitations; it settles exact
  rejoin requests and only upgrade items whose requested permissions are now satisfied. Broad
  access requests stay open until an explicit owner decision; project names/notes are not matched.
  Settling a request through another entrance does not grant its agent connection access.
- **Connection consent correction:** “Projects shared with me” is off by default per connection.
  Turning it on includes standard shared projects, within the owner's agent setting and that
  connection's permission. Restricted projects still need individual grants. Replace “shared
  projects are never added automatically” and “shared and restricted projects always one by one.”
- **Open calls:** retain Editor for email invites and Viewer for links as the accepted decision;
  remove the stale proposal to make both Viewer. Mark the agents-Off refusal wording fixed in
  task 140's repository code, without claiming deployed/live verification.

The artifact's UI exposes “Chat with Claude” rather than a direct source editor. The corrections
above are the exact reviewable instructions for that update; the external artifact is unchanged.
Sending those instructions to its existing Claude chat is awaiting DJ's authorization. This
external update and a clean full web check remain open exit items; deployment is a separate step.

**Earlier research (Codex, 2026-10-23):** DJ initially requested research and a plan only. The audit below is
against the current repository and the latest checked-in RPC definitions, including task 140's
fixes as inspected then. During that research pass, no application code, migrations, production
data, or external pages were changed. The implementation above supersedes its gap findings.

## What users get

Whether someone gets in by asking, by an email or @handle invite, by the invite link, or by rejoining, they land in the project the same way, the owner hears about it the same way, and their agents get the same defaults.

## DJ direction (2026-10-23)

"The four ways someone gets into a project: just make sure all that's unified." Email invites defaulting to Editor is fine (links stay Viewer).

## The four paths

| Path                    | Code                                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| Ask → owner approves    | `create_people_request` / `decide_people_request` (`20261023140000`), `/api/people/requests/[requestId]/decide` |
| Email or @handle invite | `/api/onto/projects/[id]/invites`, `/invites/[token]`, `apply_project_invite_agent_access` trigger              |
| Invite link             | `accept_project_invite_link` (`20261023200000`), `/api/onto/invite-links/join`, `/join/[token]`                 |
| Rejoin                  | `kind = 'rejoin'` request, `/people` card, `decide_people_request`                                              |

## Check each path for the same answer

1. Agents default to **Read** (Write only for Editors).
2. The joiner lands in the project with a toast naming it.
3. The owner gets one notification "Sam joined 9takes" (not for approvals the owner just made).
4. The joiner follows project activity (`project.activity.batched` subscription) when the project has it on. The link path does this; check approve and invite accept.
5. The joiner gets the same role sentence and agent sentence (`people-copy.ts`).
6. Emails match in tone and layout (invite, approved, rejoin, request received).
7. Joining one way settles the others: a pending invite is revoked when they join by link (done); check approve and invite accept do the same, and that a pending request is closed when they join another way.
8. Removed or left members: link → rejoin request (done); invite by the owner → direct (by design); approve → direct (owner's choice).
9. Their agents: when an agent asked, approval adds the project to that connection (done). Decide with [140](140-agent-access-wall.md) whether joining any other way offers the same.

## Work

1. Build the matrix above from the code, mark gaps.
2. Pull the shared after-join steps (notify owner, follow activity, settle other invites and requests) into one helper used by all four paths.
3. Tests per path for the matrix rows; one rehearsal check if SQL changes.

## Exit

The matrix is all green, with tests, and the explainer page's "four ways in" section matches the code.

## Audit result (2026-10-23)

This is an implementation task with a research first step. The four entry paths already exist;
the remaining work is to make their completion behavior consistent. Keep the different role
defaults and the owner's control over rejoining. Do not rebuild invitations or agent consent.

The original file references are now partly stale:

- The current `decide_people_request` definition is in
  [`20261024003000_agent_access_wall_fixes.sql`](../supabase/migrations/20261024003000_agent_access_wall_fixes.sql),
  not the foundation migration. Preserve its upgrade request and connection-scoping fixes.
- `/people` now redirects to `/profile?tab=people`. Requests render in
  [`PeopleRequests.svelte`](../apps/web/src/lib/components/people/PeopleRequests.svelte).
- Email and @handle invitations share one acceptance endpoint, but have **two browser entry
  points**: `/invites/[token]` and `/invites`. Both need coverage.
- The legacy token-based SQL `accept_project_invite` is still defined alongside
  `accept_project_invite_by_id`; shared database invariants should cover both callable paths.

### Pre-implementation matrix

“Pass” means the inspected code implements the rule, not that production was exercised.
“Gap” and “Partial” identify work; intentional differences are called out explicitly.

| Requirement | Ask → approve | Email / @handle invite | Invite link | Rejoin → approve |
| --- | --- | --- | --- | --- |
| 1. Agents default Read; Write requires Editor | **Pass:** approve defaults Read; validates role | **Pass:** invite defaults Read; trigger applies/clamps it | **Pass:** link defaults Viewer + Read; validates Write | **Pass:** carries the link's chosen setting, defaults Read |
| 2. Project arrival + named toast | **Gap:** in-app approval goes to `/people`; email opens project(s), without a shared arrival message | **Gap:** generic “Invite accepted”; token page pauses for notification setup, list page goes directly | **Pass:** named toast + direct navigation | **Gap:** same approval delivery as ordinary requests |
| 3. One owner join notification, none for their own approval | **Pass:** no redundant owner join notice | **Partial:** deduplicates recipient ids, but owner subscription writes use the joiner's RLS client; no membership-transition result | **Partial:** admin-backed owner notice on `joined`, no notice on `already_member`; cross-path races unproven | **Pass:** approval itself does not notify owner again; initial rejoin request intentionally does |
| 4. Follow enabled activity consistently | **Partial:** preserves existing global subscription, but seeds it without checking project/member settings | **Gap:** conditional seed followed by an unconditional bulk seed; overwrites opt-outs and attempts other users' writes | **Partial:** checks effective settings, but overwrites an existing opt-out | **Partial:** same as ordinary approval |
| 5. Shared role + agent sentences | **Partial:** single-project approval email uses both; outgoing request card lacks granted-project details | **Gap:** token page uses role copy only; preview/list RPCs omit `agent_access` | **Pass:** uses both shared sentences | **Partial:** same as approval; rejoin card carries link settings |
| 6. Email tone and layout | **Pass:** shared email renderer | **Pass:** create/resend use shared email builder | **N/A:** successful link join has no email requirement | **Pass:** rejoin-received and approval use shared renderer |
| 7. Settle competing invitations and requests | **Gap:** source request approved, competing invitations untouched | **Partial:** already revokes other pending/declined invites for the same project/email; requests untouched | **Partial:** already revokes matching invites by user id/email; requests untouched | **Gap:** source request approved, competing invitations untouched |
| 8. Former-member rules | **Pass:** owner can restore membership | **Pass:** owner's direct invite can restore membership | **Pass:** removed/left → request, not direct join | **Pass:** owner approval restores membership |
| 9. Agent connection consent | **Pass by design:** requesting connection receives allowed projects | **Pass by task 140 policy:** explicit grant or opted-in connection required | **Pass by task 140 policy:** same rule | **Pass by task 140 policy:** same rule; web rejoin has no asking connection |

Row 1 describes the stored default. Task 140's explicit “Editors' agents can write here”
standing approval can make an editor's effective agent access Write while the stored setting
is Read. Preserve that rule, the explicit Off override, and the guest write limits.

### Findings that change the implementation plan

1. **Request settlement needs a defined scope.** Ordinary `kind = 'access'` requests are
   owner-scoped: the schema requires `project_id IS NULL`, and `project_hint` is free text.
   Joining one of an owner's projects does not prove that a request for another project was
   satisfied. Rejoin has an exact project id; upgrade has structured per-project needs.
   Never match the hint to decide automatically which request to close. A Viewer join also
   does not satisfy a pending request for Editor or agent Write.
2. **Stale acceptance can change an existing member's agent setting.** Direct invite RPCs
   leave an already-active member's role alone (`ON CONFLICT ... DO NOTHING`) but still mark
   the invite accepted. `apply_project_invite_agent_access` then applies that invite's agent
   setting. An approval currently leaves the invite pending, so this is a concrete cross-path
   scenario to prevent. The RPC also returns the invite's role, which may differ from actual
   membership. UI `alreadyMember` handling alone does not protect stale tabs or concurrent calls.
3. **Notification subscriptions are global by event type.** The key is `(user_id, event_type)`,
   not project id. Project/member overrides live in project props. The current settings RPC
   resolves the **calling user's** effective setting, so calling it as the approving owner
   would inspect the wrong person. Read the joiner's effective setting through a properly
   authorized database helper. Owner subscription writes need server authority: current RLS
   permits a user to write their own subscriptions (or an admin), not another member's.
4. **Preserving opt-outs requires inspecting the batch producer too.**
   `queue_project_activity_notification_batch` currently sets `is_active = true` on conflict
   whenever project activity is enabled. Changing only the join routes would not preserve a
   global opt-out after the next project edit. Decide whether the global subscription is a
   user preference or a derived delivery flag, then make both code paths honor that meaning.
5. **Approval is asynchronous and can grant several projects.** Do not redirect the owner's
   browser into the joiner's project or force navigation in a joiner's unrelated session.
   The joiner's notification/email/card should open the one project, or an explicit project
   list for a multi-project grant. Show the named arrival toast when they open it.
6. **Email layouts are already unified.** Keep the existing renderer. Tighten the multi-project
   approval email to show each project's actual role and agent setting. Its current “same access”
   sentence is ambiguous when project settings differ. The shared agent sentence should explain
   that owner permission still requires the user's connection grant or shared-project opt-in.

### Approved policy decisions (DJ, 2026-10-23)

DJ accepted all three recommendations before authorizing the implementation recorded above.

| Decision | Approved rule | Consequence |
| --- | --- | --- |
| Which requests does another join settle? | Automatically settle exact-project rejoin requests and only satisfied upgrade items. For broad access requests, require an explicit request association/owner action; leave unmatched requests open. | Row 7 applies only to matching, satisfied requests. Invitations issued in response to a request should retain a structured association. Never infer identity from prose. |
| What does an inactive activity subscription mean? | Preserve a deliberate global opt-out; create missing subscriptions only when the joiner's project activity is enabled. Make the batch producer follow the same rule. | Requires a small SQL change beyond extracting the route helper. |
| Where does notification setup happen? | Land directly in the project on every synchronous join; move the direct-invite notification prompt to an optional project-side affordance. | Keep push opt-in available without making only one entrance stop for it. |

Task 140 already answers the agent-connection decision: keep `include_shared_projects` off by
default, honor it when the person opted in, and keep explicit grants for restricted projects.
Do not connect every existing agent as an after-join side effect. Any optional “Connect an agent”
link should use the existing task 140 consent flow.

### Proposed implementation sequence

1. **Define one result contract and add regression cases.** Membership-changing RPCs should
   distinguish `joined`, `rejoined`, and `already_member`, with the actual resulting project,
   role, agent setting, and a stable transition identifier if needed for notification dedupe.
   Approvals must distinguish newly added/restored members from existing-member upgrades.
   Scope a rejoin approval to its structured project id at the SQL boundary, not just in the UI.
2. **One database settlement helper, inside the membership transaction.** Call it from direct
   invite acceptance (id and legacy token), invite-link join, and access/rejoin approval.
   Revoke competing invitations by project plus account/email; close only requests covered by
   the agreed structured rule. Preserve the current accepted invite and the approval being
   processed. Record that a request was satisfied through another entrance and display that
   plainly; do not fabricate an owner approval or grant the requesting agent new access merely
   because its request was closed. Use a consistent lock order across membership, invite and
   request rows; test
   accept-versus-approve and accept-versus-link races. Do not put this correctness step in
   best-effort HTTP follow-up code.
3. **One server after-join helper.** Replace the duplicated activity-subscription and owner
   notification blocks in the three routes. Pass explicit source/initiator/transition context.
   Seed eligible missing subscriptions using the joiner's settings, preserve preferences under
   the chosen policy, notify the current owner once, and suppress notices for owner approvals
   and already-active membership. Keep membership success independent of delivery failures;
   add a durable dedupe/retry mechanism if “one notification” must survive worker/network retries.
   Keep approval emails and targeted connection grants in their existing specialized handlers.
4. **Unify arrival and truthful copy.** Return the project name and actual resulting permissions;
   use one named-toast/arrival helper for `/join/[token]`, `/invites/[token]`, and `/invites`.
   Point single-project approval notifications to that project's arrival flow; provide a choice
   for multiple projects. Extend preview/list RPCs and generated types with `agent_access`, then
   use `inviteeRoleSentence` and `inviteeAgentSentence` consistently. Keep hidden invitee email
   protections. Show granted projects on outgoing approved requests if that card is an entry point.
5. **Validate, then update the explanation.** Run the focused route/helper/UI tests and one new
   SQL rehearsal against production's schema, including the standing checks and `--role-probe`
   where grants/policies change. After Svelte edits, run the repository's web `check` gate.
   Update the explainer only after behavior is implemented and tested; no deployment is part
   of this research pass.

This is better as two shared layers than the original single “after-join” helper: database
settlement must commit with membership; notification delivery can fail independently.

### Validation plan and evidence

**Executed, free and offline:** five existing test files, **56 tests passed**:

- `apps/web/src/routes/api/onto/invite-links/join/server.test.ts` — 13
- `apps/web/src/routes/api/onto/invites/[inviteId]/accept/server.test.ts` — 4
- `apps/web/src/routes/api/people/requests/[requestId]/decide/server.test.ts` — 12
- `apps/web/src/lib/server/people/people-emails.test.ts` — 12
- `apps/web/src/lib/components/people/people-copy.test.ts` — 15

Run through `test-gate run` with the repository worker limits. These tests mock RPCs and
delivery; passing does not prove the SQL matrix, RLS behavior, or live email delivery. No new
tests were written and no SQL rehearsal was needed for this documentation-only pass.

Add coverage for:

- Every entrance: default Read, Viewer cannot receive Write, explicit Off preserved, standing
  editor approval respected, correct project arrival and role/agent copy.
- Activity enabled/disabled, member override, existing inactive subscription, batch activity
  after a join, and owner subscription creation for a non-admin joiner under real RLS.
- One owner notification for a new join; none for owner approval, already-member acceptance,
  repeated requests, or existing-member upgrades. Follow-up failure must not report join failure.
- Approval settles competing invites; direct invite/link settles exact matching requests;
  unrelated owner/project requests remain open; multi-project upgrades retain unsatisfied items.
- Stale invite after approval cannot change permissions, even from a stale tab or another
  callable acceptance RPC. Concurrent entrances must produce one membership transition.
- Removed and voluntarily left members: link asks, owner invitation restores, approval restores,
  denied rejoin remains denied. Include recoverable declined invitations (48-hour rule).
- Agent connection toggle on/off, explicit restricted-project grant, requesting-connection-only
  approval, and no automatic connection broadening from ordinary joins.

Do not reuse the old invite-link rehearsal's removed-member expectations unchanged: task 145
already notes those predate the rejoin migration. Rehearsal alone does not simulate concurrency;
use a focused local two-session database test for the races. Real two-account/browser/email
checks remain a later validation step; paid model tests still require separate approval.

### Main source map

- Join/link follow-ups: [`join/+server.ts`](../apps/web/src/routes/api/onto/invite-links/join/+server.ts).
- Direct invite follow-ups: [`accept/+server.ts`](../apps/web/src/routes/api/onto/invites/[inviteId]/accept/+server.ts).
- Approval follow-ups: [`decide/+server.ts`](../apps/web/src/routes/api/people/requests/[requestId]/decide/+server.ts).
- Direct invite RPCs and preview shapes: [`recoverable_project_invite_declines.sql`](../supabase/migrations/20260521000000_recoverable_project_invite_declines.sql).
- Invite agent-setting trigger: [`people_layer_foundation.sql`](../supabase/migrations/20261023140000_people_layer_foundation.sql).
- Link/rejoin behavior: [`people_rejoin_requests.sql`](../supabase/migrations/20261023200000_people_rejoin_requests.sql).
- Latest approvals: [`agent_access_wall_fixes.sql`](../supabase/migrations/20261024003000_agent_access_wall_fixes.sql).
- Effective activity settings: [`project_notification_settings_rpc.sql`](../supabase/migrations/20260422000000_project_notification_settings_rpc.sql).
- Batch subscription behavior: [`notification_priority2_activity_alignment.sql`](../supabase/migrations/20260426000007_notification_priority2_activity_alignment.sql).
- Subscription RLS: [`phase0_rls_lockdown_remaining_tables.sql`](../supabase/migrations/20260730020000_phase0_rls_lockdown_remaining_tables.sql).
- Email builders: [`people-emails.ts`](../apps/web/src/lib/server/people/people-emails.ts).
- Connection consent: [`project-access.service.ts`](../apps/web/src/lib/server/agent-call/project-access.service.ts) and [task 140](140-agent-access-wall.md).

### Explainer follow-up

**Checked on 2026-10-23 after DJ explicitly authorized opening it.** Task 145 links to
[How BuildOS Sharing Works](https://claude.ai/artifact/JEk3EN2pfLzhc52kpD2kRG). Read the full page
and all four flow tabs in the signed-in browser. The earlier access blocker is resolved. No
external page was edited. DJ subsequently approved the three policies above.

The four flow tabs broadly match the code: owner-picked grants for requests, direct invitation
acceptance, link defaults of Viewer/Read/7 days, and former members asking to rejoin. The page
does not specify enough about request settlement, activity opt-outs, or the post-accept prompt
to resolve the three policy choices.

Concrete corrections for a later explainer edit:

- **Email role default:** the reference table correctly says Editor for email invites and Viewer
  for links, but Open calls still proposes Viewer for both. Remove that stale proposal; DJ's
  direction in this task explicitly accepts the different defaults.
- **Shared-project connection consent:** the simulator says shared projects are never added
  automatically, and the connection-projects row says they must always be added one by one.
  The same table already includes task 140's off-by-default shared-project toggle. Explain that
  shared standard projects are included when the person enables that toggle; restricted projects
  still need explicit grants, and the owner's agent setting still applies.
- **Agents-off refusal:** Open calls describes the old misleading grant-your-agent message as
  unresolved. Task 140 addresses that in repository code. Update its implementation status;
  do not claim live deployment or verification from this audit.
- **Requesting agent:** the request flow says the asking connection gets the approved projects.
  Qualify that this only covers projects whose agent setting is not Off.
- **Completion behavior:** add the agreed rules for opening the joined project, one named success
  message, owner notification suppression for owner-made approvals, preserved notification
  choices, and which competing requests are actually satisfied. These are proposed task 143
  behavior until implementation and validation are complete.

After implementation, its four-way section should state: direct invites default Editor, links
default Viewer, agents default Read subject to owner settings and connection consent, former
members using a link request reentry, approvals avoid redundant owner notices, and all completed
joins use the same arrival/activity/settlement rules. Explain that broad access requests stay
open unless an explicit association or owner action establishes that they were satisfied.
