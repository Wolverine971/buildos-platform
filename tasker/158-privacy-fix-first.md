<!-- tasker/158-privacy-fix-first.md -->

# 158 — Privacy and security: fix first

**Status:** OPEN · **Priority:** P0 · **Opened:** 2026-11-15 · **Size:** ~1 day
**Owner:** an agent DJ assigns · **DJ authorized (2026-11-15):** "fix first" — fix these and apply
the migrations they need, one file at a time, following the repo migration rules below.

## Status 2026-11-15 (Claude session)

- §1 DONE: all 8 audit migrations + `20261109180053` applied and recorded one at a time after a
  joint prod dry run (ROLLBACK). Pre-checks clean (0 email mismatches, 0 reserved handles,
  0 non-admin admin-event subscribers, 0 stray assignees, DJ is_admin). `.check.sql` files were
  NOT run in prod (they insert fake auth.users outside a transaction); they passed in the
  rehearsal. Instead a signed-in smoke (as DJ + an editor, ROLLBACK) ran after every apply:
  normal edits OK; editor takeover/trash/publish, queue insert, email rewrite all refused.
  Railway: all 3 workers on node v22.23.4, no crash loop, no `RAILPACK_NODE_VERSION`.
- §2 DONE 11-15 PM: web deploy `47374107d` live, then `20261115180000` re-rehearsed
  (`--role-probe` PASSED), dry run with ROLLBACK, APPLIED + recorded. Checked: `authenticated`
  has no SELECT on `onto_actors.email` / `onto_project_invites.invitee_email`; as a member of DJ's
  Family Weekly Tasks the project load returns only their own email; as DJ (owner) the People hub,
  members, invites, entity collaboration and 3 shared project pages all 200, owner still sees
  member emails.
- §3 DONE: `show_writing` was already false (set 11-14); logged-out /@djwayne shows no Writing.
- 00:51 mystery deploy explained: §4's env change + "web redeployed" re-shipped the build that was
  live then, over DJ's still-building `fa3db38bc` (rolled back by promote 11-15 AM). Lesson: after
  setting Vercel env, wait for any in-flight production build, then redeploy the newest one.
- §4 DJ chose "finish isolation": agent client env set on Vercel prod + agentic-chat-worker +
  daily-brief-worker, both redeployed, web redeployed. New `agent_access_required` code so chat
  says "turn on Agent access in Profile → Calendar/Email" (needs web + worker deploy).
  **DJ must click Enable under Agent access** for each Gmail + Calendar account in Profile.
  Failure mode before: every caller hit `not_configured` (env checked before the table).
- §5 not started.
- Follow-up: `ensure_actor_for_user` / `decide_people_request` name a nameless actor after its
  email (0 such actors today; every user has a name).

Source: the 11-14 tasker sweep. The people layer and builder pages are live, so these leaks can
be reached on production now.

## What users get

- Collaborators can't read each other's email addresses, in the app or through the raw database API.
- An editor in someone's shared project can't make themselves owner, trash the project, publish it,
  or change who can bring agents in.
- DJ's public page stops showing a show-notes document nobody chose to publish.

## Read first

- `AGENTS.md` → "Database migrations" (rehearse, apply one file at a time, record, never edit an
  applied or committed migration file; add a new one).
- `~/security-audit-skill/buildos-platform/run-1/FIXES-2026-11-05.md`: the Nov 5 fix list,
  read-only pre-apply checks, apply order, and Railway landmines.
- Memory: `project_security_audit_run1_2026-11-05.md`, `reference_migration_apply_gotchas.md`
  (rehearsal runs as superuser; dry-run with ROLLBACK in prod first; never `&& repair` after a
  piped apply).

## 1. Apply the Nov 5 security-audit migrations (biggest item)

Checked 2026-11-14 with `supabase migration list --linked`. The app code for these fixes shipped
(committed and pushed), but **all 8 migrations are NOT applied** in production:

| File                                                   | Closes                                                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261105120000_queue_jobs_server_only_writes.sql`     | signed-in users writing queue jobs                                                                                                                              |
| `20261105120100_user_identity_columns_guard.sql`       | users editing their own email/username columns directly                                                                                                         |
| `20261105120200_project_owner_columns_guard.sql`       | **editors changing `created_by`, `deleted_at`, `is_public`, `icon_svg` and `external_agent_access`** (tasker 140's open gap); assignee rows that name strangers |
| `20261105120300_notification_rows_guard.sql`           | forged notification deliveries/subscriptions/links                                                                                                              |
| `20261105120400_public_role_policies_rescope.sql`      | PUBLIC `WITH CHECK (true)` policies                                                                                                                             |
| `20261105120500_onto_membership_attribution_guard.sql` | joining without an invite; forged log authors                                                                                                                   |
| `20261105120600_user_pointer_rows_guard.sql`           | calendar/voice-note/attachment pointer rows                                                                                                                     |
| `20261105120700_account_deletion_lock_gaps.sql`        | deletion lock takes down builder pages and shares                                                                                                               |

Steps:

1. Run the read-only production checks in FIXES-2026-11-05.md ("Before applying"): users.email vs
   auth.users.email mismatches, reserved handles already taken, non-admin subscriptions to admin
   events, assignee rows naming non-members (19 at audit time). Decide what each result means for
   the apply. Report anything that would break a real user.
2. Confirm DJ's `users.is_admin = true` (120300 filters admin alerts by it).
3. Re-rehearse all 8 together against today's schema: `pnpm db:rehearse supabase/migrations/<file>.sql`
   for each, in order, with `--role-probe` (they touch grants and policies). Prod has moved since
   11-05 (migrations `20261114190000..210000` landed). If one conflicts, add a new migration;
   do not edit these files if they are committed (they are).
4. Dry-run each with ROLLBACK in prod, then apply one at a time
   (`supabase db query --linked -f <file>`), check, then
   `supabase migration repair --status applied <version> --linked`.
5. After each: the matching `supabase/tests/<same>.check.sql`, and a quick signed-in smoke on
   production that normal flows still work (edit a task, open a shared project, send an invite).
6. Railway: FIXES says the worker exits on unsafe Node. Railway has deployed since 11-05
   (`b6e04ab4a` on 11-10), so check each service's deploy log for the `[runtime] … node=v…` line
   and confirm none is crash-looping (agentic-chat-worker `RAILPACK_NODE_VERSION`; libri-worker
   config path `/railway.libri.toml`). Report; do not change Railway settings without DJ.

## 2. Close the collaborator email leak

`onto_actors_select` lets any co-member read every member's `onto_actors.email` through
PostgREST. The screens strip emails for non-owners (tracker 141); the database rule doesn't.
Same family: an owner who sent an @handle invite can read the invitee's email (tracker 145).

- Audit every user-client read of `onto_actors.email` (web, worker user-scoped clients, MCP) first.
- Fix at the database: column-level `REVOKE SELECT (email)` from `authenticated` plus a definer
  function or view for the cases that legitimately need it (owner's member list, yourself), or an
  equivalent. Pick the smallest change that leaves no REST path.
- The @handle invite path: the invitee's email must not come back to the inviter.
- Rehearse with `--role-probe`; add a `.check.sql` that proves member B can't read member C's email.

## 3. DJ's public page shows "Julian Episode 390"

`show_writing` is on by default, so /@djwayne lists a show-notes doc DJ never chose to publish.

- Now: turn Writing off on DJ's builder profile in production (DJ authorized 11-15). Verify the
  live page logged out.
- The lasting fix (Writing as a per-document opt-in) belongs to tracker 147, which another agent
  is finishing now. Don't change the Writing code here.

## 4. Shipped code reads a table that doesn't exist yet

`20261109180053_google_agent_oauth_isolation.sql` (creates `google_agent_grants`) is **not
applied**, but `packages/shared-agent-ops/src/google/google-agent-oauth.ts` reads it and shipped
in `d55dff839`.

**Confirmed live 2026-11-15 (Claude, paid email dry run): this path is LIVE and broken.** Every
`GmailReadGateway(admin, { agentAccess: true })` and calendar agent port goes through
`GoogleAgentOAuthService`, which needs (a) the `google_agent_grants` table and (b) a separate
Google OAuth client: `PRIVATE_GMAIL_AGENT_CLIENT_ID/SECRET`, `PRIVATE_GOOGLE_CALENDAR_AGENT_*` and
their key. None of those env vars exist on Vercel or the agentic-chat-worker. Result: the email
cards cron read 0 of DJ's 3 Gmail accounts ("No Gmail account could be read", run
`3468cd90-…`). Callers on this path: `external-tool-gateway.ts` (MCP/agent tools),
`calendar-analysis.service.ts`, `calendar-executor.ts`, the email-updates cron, and in the worker
`email-read-port.ts`, `calendar-write-port.ts`, `table-adapter.ts`. So chat's email reading,
calendar reads and writes, and external agents' Google tools fail for every user.

**Seen in the paid prod battery 2026-11-15 (`output/agentic-prod-battery/2026-11-15T05-08-40-917Z`):**
case 10 failed 3/3; production `list_calendar_events` returned `error_code: credentials_not_configured`,
`coverage: unavailable`. The same case passed on 11-06, before the isolation code shipped. Any user
asking chat "what's on my calendar" gets no Google events now. **Do this item first.**

To do:

1. Confirm the failure mode for each caller (not_configured vs missing table) with a free local
   call; write it down.
2. Rehearse and apply `20261109180053` (one file, dry run with ROLLBACK first).
3. **DJ decision (ask, with a recommendation):** finish the isolation (DJ creates the separate
   Google OAuth clients in Google Cloud, env vars on Vercel + Railway, users grant agent access
   once, with a clear "Allow BuildOS agents to use Gmail/Calendar" prompt in chat), or fall back
   to the user's existing grant until the separate clients exist. Until he picks, the chat
   should say plainly that agent email/calendar access needs setup, not fail vaguely. Check what it
   says today.

## 5. Small, if time allows

- Rate limit find-by-handle (exact match only; low risk) — tracker 145.
- Builder page view/tap counters accept any POST — tracker 147 owns it; skip here.

## Rules

- Work on `main`, no worktrees. Don't commit; DJ commits. Touch only the files you need.
- No paid model runs.
- Never generate images.
- Another agent is editing builder-profile code (tracker 147) and another is building Workspace
  search (tracker 159). Don't edit their files.

## Exit

All 8 audit migrations applied and recorded (or a stated reason per file); email leak closed with a
check SQL; DJ's Writing section off on the live page; agent Google access working again (or DJ's
fallback call recorded and built);
a short report to DJ of anything users will notice. Then delete this file and its README row.
