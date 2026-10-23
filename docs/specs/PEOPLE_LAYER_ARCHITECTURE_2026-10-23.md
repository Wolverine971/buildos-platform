<!-- docs/specs/PEOPLE_LAYER_ARCHITECTURE_2026-10-23.md -->

# People Layer Architecture (2026-10-23)

**Status:** proposal. Nothing built. Waiting on DJ's calls (bottom of this doc).
**Ask (DJ, 10-23):** let people and their agents find other BuildOS users, send a request ("friend
request"), and get a full or scoped view of the other person's projects. Owners can also invite
people in. Everything must work over MCP, not only in the web app.

## The rule everything hangs on

**Share with a person. Their agents ride on that access and never go past it.**

There is no separate "Sam's agent may read DJ's project" grant. DJ grants Sam. Sam already decides
what each of his agents can do. The agent gets the overlap:

```
agent access(Sam's Claude, DJ's project P) =
      DJ → Sam on P            (lens: Pulse | Read | Contribute | Edit)
    ∩ DJ allows Sam's agents   (per share, on/off)
    ∩ Sam → Claude             (connector scope: read_only | read_write, project selected)
    ∩ P.external_agent_access  (standard | restricted = humans only)
```

This keeps one permission system (project membership, already enforced by RLS and the agent
gateway) and makes everything new a front door (find, ask, decide) plus lenses.

## What already exists (reuse, don't rebuild)

| Piece                                   | Where                                                                           | Notes                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Project members                         | `onto_project_members` (`mig/20260320000000`)                                   | `role_key` owner/editor/viewer, `access` read/write/admin, soft remove                   |
| Email invites                           | `onto_project_invites`, `/invites/[token]`, `api/onto/projects/[id]/invites`    | 7-day token, register/login redirect back, decline undo 48 h                             |
| Share UI                                | `ProjectCollaborationModal.svelte`                                              | members, invites, roles, handoff                                                         |
| Member's agent can read shared projects | `project-access.service.ts:37-78`                                               | shared projects never inherit; need an explicit `external_agent_project_permissions` row |
| Agent auth                              | OAuth + `boca_` keys, `mcp-connector.service.ts`, `oauth-connector.service.ts`  | credential = exactly one user; tools never take a target-user arg                        |
| Agent edit proposals                    | `agent_permission_requests` (`mig/20260930185213`)                              | approver today = the connection's own owner; **feature flag OFF**                        |
| Handle                                  | `users.username` (`mig/20260430000001`)                                         | unique (ci), 3–24 `[a-z0-9-]`, reserved list in `api/profile/me/username`                |
| Notifications                           | `emit_notification_event`, `user_notifications`, worker channels                | new event types need the 5-file checklist (see identity map)                             |
| Audit                                   | `agent_call_tool_executions`, `onto_project_logs` agent lane, `security_events` | reads logged per caller, not per project owner                                           |
| Agent callee handle                     | `user_buildos_agents` (`buildos:user:<uuid>`)                                   | cross-user dial blocked at `callee-resolution.ts:80-87` (keep for now)                   |

**Usage reality (prod, read-only, 10-23):** 16 invites ever, all from one inviter (DJ); 5 projects
with 2+ members; 7 editors, 0 viewers; 1 of 129 users has a username (DJ doesn't); 2 users have
ever connected an agent; 0 permission requests. The plumbing works. Nobody has a front door or a
reason to share.

## Three layers

1. **People (new):** handle, profile card, who-can-find-me, requests, connections.
2. **Project access (mostly built):** members (Read / Contribute / Edit) plus followers (Pulse) plus
   "Only me" items.
3. **Agent delegation (built):** each person's connector scope, intersected with layer 2.

## Lenses (what "scoped" means)

| Lens           | Stored as                                         | Sees                                                                                                                                             | Can do                                                      |
| -------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| **Pulse**      | `project_followers` (new table, **not** a member) | computed card: name, one-liner, active goals, upcoming milestones, what moved (done titles, last 14–21 d), in progress, stuck, owner's "one ask" | read the card                                               |
| **Read**       | member, `access='read'` (viewer)                  | everything except Only-me items                                                                                                                  | read                                                        |
| **Contribute** | member, `access='read'` + `can_suggest`           | same as Read                                                                                                                                     | comment; suggest tasks/edits that land in the owner's inbox |
| **Edit**       | member, `access='write'` (editor)                 | same as Read                                                                                                                                     | edit and create (today editors can also invite; see calls)  |

**Why Pulse is its own table.** About 30 app files read `onto_project_members` directly (brief data
loader, graph, chat context loader, overview reads, projects list, entity collaboration...), and
`current_actor_is_project_member` ignores the access level. A new `access='pulse'` value would leak
through those paths. A separate table fails closed: Pulse is served by one function,
`get_project_pulse(project_id)`, and no existing read path knows followers exist. The SQL access
helpers (`actor_has_project_member_access`) use explicit `IN` lists, so they would have been safe;
the app code is the risk.

Pulse is computed from data (no model call, no spend). The owner can add a one-line "ask".

### "Only me" items

`visibility text not null default 'project' check (visibility in ('project','owner_only'))` on
`onto_tasks` and `onto_documents` (later goals, risks, milestones). Owner-only rows are hidden from
everyone but the owner (and project admins, TBD) in:

- RLS select policies on those tables
- agent gateway visible-entity checks (`op-execution-gateway.access.ts`)
- search RPCs, chat context loaders, project graph, member briefs, embeddings search
- `get_project_pulse`
- public page publishing (block publishing an owner-only doc)

Add a rehearsal standing check next to the archived one in `DEFAULT_CHECKS`: member-facing read
RPCs never return `owner_only` rows to non-owners. This is the most expensive part of the build.

## Discovery

- Handle = `users.username`, shown as `@handle`. Prompt to claim it the first time someone shares,
  requests, or connects, and in onboarding.
- `users.discoverability`: `none` | `handle` (default once a handle exists) | `directory` (later).
  Nobody becomes findable until they claim a handle, so existing users are unaffected.
- `find_person_by_handle(p_handle)` (SECURITY DEFINER, `authenticated` + `service_role`) returns
  `{ handle, name, bio, accepts_requests, showcase_projects[], relationship }`. Never email.
  "Not found" and "not discoverable" return the same response. Rate limited per user and per
  connector.
- No fuzzy search over MCP. In the web app, autocomplete only among people you already share with.

## Requests and connections

```sql
create table public.people_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid null references public.onto_projects(id) on delete cascade, -- null = "whatever you'll share"
  lens_requested text not null check (lens_requested in ('pulse','read','contribute','edit')),
  note text check (char_length(note) <= 500),
  via text not null check (via in ('web','agent')),
  via_caller_id uuid null references public.external_agent_callers(id) on delete set null,
  via_oauth_grant_id uuid null references public.agent_oauth_grants(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','approved','declined','canceled','expired')),
  decision jsonb,            -- [{ project_id, lens, agents_allowed }]
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days'
);

create table public.people_connections (
  user_low uuid not null, user_high uuid not null,       -- ordered pair
  status text not null check (status in ('accepted','blocked')),
  blocked_by uuid null,
  created_at timestamptz not null default now(),
  primary key (user_low, user_high)
);

create table public.project_followers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.onto_projects(id) on delete cascade,
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  agents_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- plus: onto_project_members.agents_allowed boolean default true, .can_suggest boolean default false
-- plus: onto_project_invites.invitee_user_id uuid null (invite by handle), lens
```

**Limits:** 10 pending outgoing per person; 1 pending per pair; 30-day cooldown after a decline;
block is silent; agent-sent requests capped per connector per day; recipient setting "accept
requests sent by agents" (default on).

**Deciding:** `decide_people_request(id, decision)` (authenticated; checks `auth.uid() =
to_user_id`), called only from an owner web session POST with an origin check and digest, the same
pattern as `decide_agent_permission_request`. One transaction:

1. upsert `people_connections`
2. per selected project: member row (Read/Contribute/Edit) or follower row (Pulse), with
   `agents_allowed`
3. if the request came from an agent and `agents_allowed`: insert
   `external_agent_project_permissions` (`read_only`, `source='request_approved'`) for that
   connector, so the agent that asked has access on its next call
4. notify the requester (`people.request.approved`)

**Owner-initiated invites:** extend `onto_project_invites` with `invitee_user_id` (by handle) and
lens. Email invites stay as they are; they are the growth path for people not on BuildOS yet.

## Agent rules

1. **An agent never exceeds its person** (the intersection above).
2. **Agents ask; people grant.** No MCP tool approves, grants, shares, or changes a lens. Matches T8
   in the lethal-trifecta audit.
3. **Other people's words are data.** Tool results from projects the caller's user does not own
   carry provenance (`owner: '@dj', trust: 'other_person'`). The deferred "data, not instructions"
   framing becomes required for these results. Request notes render as quotes, length-capped.
4. **Writes into someone else's project:** Contribute → proposals through `agent_permission_requests`
   with the **project owner** as approver (today the approver is the connection owner; extend it).
   Edit + agents allowed + `read_write` connector → direct writes, as today, logged with the person
   and the connector.
5. **Owners see reads.** Record `project_id` on read executions so the owner gets "Who looked": reads
   of their project by other people's agents.
6. **Revocation cascades.** Removing a member or follower, or switching off agents, revokes the
   matching connector permissions (extend the existing `invalidate_agent_permissions` trigger).

## MCP surface

New tools (general profile; read-only data-app profile gets `find` and `list` only):

| Tool                                                          | Does                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `find_buildos_person({ handle })`                             | exact handle → profile card or "not found"                                   |
| `request_buildos_access({ handle, project_id?, lens, note })` | creates a request; returns `pending` and "they'll see it in BuildOS"         |
| `list_buildos_people()`                                       | connections, requests you sent, projects shared with you (owner + your lens) |
| `get_project_pulse({ project_id })`                           | the Pulse card, for Pulse followers and above                                |

Changed: project list and search tools include shared projects granted to this connector, each
labelled with `owner` and `your_access`. Pulse-only projects answer only `get_project_pulse`; other
tools return `project_not_granted_to_connector` without naming the project.

Not now: agent-to-agent ("ask DJ's BuildOS agent about 9takes"). The callee handle exists and the
cross-user dial block stays until the rest is proven.

## Web surfaces

- `/profile` Account tab: handle, bio, who can find me, accept requests from agents.
- `/people`: Requests (approve sheet), Connections, Shared with me, Sharing (who sees what, with or
  without their agents), Who looked.
- Share modal: add by handle or email, lens picker, "their agents too" toggle.
- Task and document menus: Only me.
- Notifications: `people.request.received`, `people.request.approved`, `project.shared_with_you`.

## Privacy docs that change

- `CLAIMS.md` K3 (cross-user read now exists, narrowly, via handle lookup) → new claim row.
- `CLAIMS.md` M1 (agents can now send requests, a capability outside project scope) → its own
  setting.
- `CLAIMS.md` H1 (email before privacy-reducing change): opt-in, and 128 of 129 users have no
  handle, so nobody becomes findable without acting.
- `DATA_INVENTORY.md` users row: new reader class "anyone with your handle: name, handle, bio".
- Bump `CURRENT_PRIVACY_VERSION` in `apps/web/src/lib/legal/policy-versions.ts`.

## Landmines

1. Pulse can't be a member access level (≈30 direct readers of the members table).
2. Only-me touches every read path; the rehearsal standing check is the safety net.
3. Viewers can't comment today (comment insert needs write). Contribute changes that policy.
4. Editors can invite others today, so a friend with Edit could re-share your project.
5. The permission-request system is flagged off with open release gates (task mover bug, live client
   acceptance). Contribute depends on it.
6. Injection framing for returned content is deferred hardening that becomes required.
7. Agent-sent requests are a spam surface: rate limits, the recipient toggle, block.
8. Account deletion must cascade followers, requests, connections.

## Phasing

**Lean, "Ask and share" (about a week, 3 migrations):** handles + `find` + `request` (web and MCP) +
approve sheet (Read/Edit + agents toggle) + invite by handle + auto connector grant on approval +
owner labels and provenance in MCP results + Sharing ledger. No Pulse, Only-me, or Contribute.

**Ambitious, "Projects with people" (3–4 weeks):** Lean + Pulse follow + circles (share a Pulse with
a group of 4–6 and give the group one page of everyone's pulses, which is the pod unit from the
10-17 limiting-factor analysis) + Contribute (turns on permission requests) + Only-me + Who looked +
`/@handle` profile pages with showcase projects.

## Calls for DJ

1. **Finding people:** exact handle only (recommended) or an opt-in browsable directory.
2. **Scoped means:** lenses + Only-me items (recommended) or hand-picking items per person.
3. **A friend's agent changing your stuff:** suggestions you approve (recommended for everyone below
   Edit) or direct edits whenever the person has Edit.
4. **Lean or ambitious.**

## DJ direction, 10-23 (supersedes parts above)

- **Pulse = external, START HERE = internal.** Pulse is a short computed card for people outside the
  project and their agents. START HERE stays the thorough internal pick-up-where-you-left-off doc
  (9takes' is 15,870 chars, arguably too long). An external agent with Read can still open START HERE.
  Pulse moves to "next", after V1.
- **Not now:** circles, Contribute (comments + suggestions), directory.
- **Paradigm (proposed):** people get a role; their agents get a lane inside it; every change is signed.
    1. Two keys: owner sets per person per project `agent_access` = off | read | write; the person sets
       their own connector scope (exists). Agent acts only where both allow. No per-action approvals.
    2. Lane: guest-agent write = create tasks/docs/comments + change items the person created or is
       assigned. No edits to the owner's items, goals, milestones, START HERE, settings; no delete; no
       invite. Enforced once in the agent gateway (all agent writes already pass through it).
    3. Signed, capped, quiet: logs show "Sam's Claude, for Sam"; daily write cap pauses the agent (the
       only ping); everything else goes to the existing `project.activity.batched` digest; one pause
       button per person.
    - Undo: agent writes log `after_data` but `before_data` is only `{ op }`
      (`agent-call-project-activity.service.ts:288`), so undoing additions is easy, undoing edits
      needs the before-state recorded.
    - Expandability: three stored dials per person per project (role, agent_access, later
      approval_mode). Suggestions, Pulse, circles, full-write agents become new values, not rewrites.
- **V1:** handles + find (web, MCP); invite by handle or email; request access (person or agent);
  per-person agent dial; signed changes + cap + pause; re-sharing owner-only.
- **Open:** agent default at invite (off vs read); lane = "created or assigned" vs "add-only".

## Build status, 10-23 (V1 built, UNCOMMITTED, not deployed)

DJ calls: agents default **Read** (one tap to change); lane = **created by or assigned to** the person.

**Database (APPLIED to production + recorded):**

- `20261023140000_people_layer_foundation.sql`: `users.discoverability` (default `none`) +
  `accepts_agent_requests`; `onto_project_members.agent_access` (editors backfilled to `write`);
  invite `agent_access` / `invitee_user_id` / `invitee_handle` + accept trigger; `people_requests`;
  `find_person_by_handle`, `create_people_request`, `list_people_requests`, `decide_people_request`,
  `set_project_member_agent_access`; notification types `people.request.received|approved`.
- `20261023150000_people_layer_owner_only_invites.sql`: invite RLS owner-only (editors can't re-share
  or read invite emails); trigger clamps `agent_access` to `read` for non-editors.
- Rehearsal check: `supabase/tests/20261023140000_people_layer_foundation.check.sql` (7 sections).

**Agent side:** `computeEffectiveAgentProjectScope` honors the owner's setting (off hides, read never
writes); `applyGuestAgentLane` (`op-execution-gateway.guest-lane.ts`) runs before every external write
(lane + 50/day/connector/project cap + one owner notice); MCP tools `find_buildos_person`,
`request_buildos_access`, `list_buildos_people` (`people-tools.service.ts`); shared projects in
list/search/get carry `shared_with_you`, `owner_name`, `shared_note`.

**Web:** `/people` (find, ask, approve sheet, you asked, shared with you), profile "Finding you"
toggles, share modal (@handle or email, "Their agents", per-member agents control, owner-only
invites), People nav item, `/api/people/*`, privacy page v2026-10-23 + CLAIMS M4/M5/K5 + inventory.

**Validation:** svelte-check 0 errors; shared-agent-ops typecheck clean; tests: shared gateway 225,
web agent-call 229, people/invites/members/profile 103; browser check on local dev (read-only: People
page, lookup, profile card, share modal). No live two-account MCP run yet.

**Open items:**

1. The owner who sent a handle invite can read the invitee's email via the raw database API.
2. No rate limit on `find_person_by_handle` (exact-handle only; low risk).
3. Members list already shows every member's email to co-members (pre-existing; product call).
4. When agent permission requests are switched on, "always allow" in someone else's project would
   bypass the lane on the member's approval alone; disable it there or route to the owner.
5. Generated DB types were hand-added (CLI generator needs `SUPABASE_ACCESS_TOKEN`); regenerate later.
6. Live end-to-end: a second account connects an agent, finds @handle, requests, owner approves, agent
   reads; needs DJ to claim a handle and a test account.

## Onboarding + signup front door, 10-23 (built, UNCOMMITTED)

DJ asked for a prominent, optional "claim your handle" moment that doubles as an invite mechanism.

- **Onboarding** now has 5 steps: Intent → Capture → Notifications → **People** → Ready
  (`ONBOARDING_STEPS` in `onboarding-state.ts`). Saved milestones 0-2 keep their meaning; a saved 3
  (old "Ready") now resumes on People, which is skippable. Migration
  `20261023180000_onboarding_people_step.sql` widens `users_onboarding_step_check` to 0..4
  (APPLIED + recorded in prod; safe for the old code, which never saves above 3).
- **People step** (`onboarding-v3/PeopleStep.svelte`): no handle → "Claim your handle" with three
  rows (find people, invite into {project}, their agents can read only if you allow), handle
  prefilled from the name, "Let people find me" on by default, and a live "what people see when
  they look you up" card (name, @handle, bio, never email). With a handle → "Bring someone in":
  copy handle, findability toggle, email invite to the onboarding project as Viewer with agents on
  Read. PostHog: `onboarding_handle_claimed`, `onboarding_invite_sent`,
  `onboarding_people_step_completed`.
- **Signup** (`/auth/register`): optional "Pick your handle" field at the top (covers Google and
  email). It is held in this tab's sessionStorage (`buildos:onboarding:signup-handle`, cleared on
  sign-out) and claimed automatically on the People step. A new tab after email confirmation loses
  it; the step then prefills from the name. No unauthenticated availability check (it would let
  logged-out visitors enumerate handles).
- `GET /api/profile/me/username` also returns the user's own `name` and `bio` for the preview card.

## Pre-push checks, 10-23 (both done, UNCOMMITTED)

**Access audit** (separate agent): one credential = one user holds; no cross-user path except
find → request → approve in BuildOS. Fixed: guest agent could retype its doc into START HERE
(high); agents got people's emails (project details/status/assignees/errors); lane allowed
archive/restore; permission requests could bypass the owner (now own projects only); linked rows
unscoped; refused plan create left an orphan. `cross-user-isolation.test.ts` (253 tests) aims every
tool at hidden projects. Open calls: guest agents linking to the owner's goals/plans and
reassigning owner tasks; guest-agent dated tasks syncing to the owner's Google Calendar; agents-off
refusal still says "ask the user to grant" (misleading).

**Invite flow** (separate agent): owner invite link + QR (`onto_project_invite_links`, migration
`20261023190000`, APPLIED + recorded), share window tabs (Invite / People / My role), `/join/[token]`,
better `/invites/[token]`, invite + request-received + approved emails
(`lib/server/people/people-emails.ts`; agent-sent requests email the owner too). The onboarding
People step embeds the same link panel. Defaults: links Viewer + agents Read + 7 days.

**Validation:** svelte-check 0 errors (9,709 files); web 114 files / 990 tests; shared-agent-ops
97 files / 1,006 tests + tsc clean; lint + prettier clean; read-only browser check (join page,
share window on 9takes, onboarding step and signup via a deleted preview route).
