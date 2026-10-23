<!-- tasker/140-agent-access-wall.md -->

# 140 — When an agent hits a wall, it gets through in one step

**Status:** BUILT + REVIEW FIXES, UNCOMMITTED (ambitious); 2 migrations APPLIED; live two-account check pending · **Priority:** P1 · **Opened:** 2026-10-23 · **Size:** ambitious ~4 days  
**Owner:** Claude · **DJ picked (2026-10-23):** ambitious; shared-projects toggle B, off by default

## What users get

DJ is working in Sam's project and tells his agent "update the launch task." Today the agent can fail with a dead-end or misleading error. After this, the agent says exactly what's in the way and the one step that clears it:

- "9takes isn't connected to me yet. Tap to allow: <link>" (DJ's own choice, one tap, the agent retries).
- "Sam turned off agents for you in 9takes. Want me to ask Sam to turn them back on?" (owner's choice; DJ says yes in chat; Sam gets a one-tap request).
- "That task isn't yours, so I can't edit it in Sam's project. You can edit it in BuildOS, or ask Sam to assign it to you." (a fixed rule, no request).

No settings hunting, no repeated permission chores.

## DJ direction (2026-10-23)

- Make it fluid: "so I don't spend a lot of time having to update permissions all the time."
- The agent should ask DJ ("do I have your permission?") or put the request in itself.
- "I don't know if it should just ping me or ping the owner of the project, because that's a tricky part."
- Agents-off must be accurate: if an owner turns someone's agents off, the agent must say the owner did it and that the person has to ask the owner again. Today it says "ask the user to grant access" plus a grant link, which can't help.

## The walls, who can fix each, and what the agent does

| Wall                                                              | Who fixes          | Agent does                                                                              |
| ----------------------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------- |
| 1. Project not given to this connection                           | The agent's person | Shows the one-tap grant link (`grant_url`), retries after                               |
| 2. Connection is read-only, agent wants to write                  | The agent's person | Shows a one-tap "allow changes" link for that connection                                |
| 3. Owner set this person's agents to Off                          | Project owner      | Says so plainly; asks its person "want me to ask the owner?"; on yes, sends the request |
| 4. Owner set agents to Read, agent wants to write                 | Project owner      | Same as 3, asking for Write                                                             |
| 5. The person is a Viewer, agent wants to write                   | Project owner      | Same as 3, asking for Editor + agents Write                                             |
| 6. Outside the guest lane (not the person's own or assigned work) | Nobody (rule)      | Explains; suggests editing in BuildOS or asking the owner to assign it                  |
| 7. Daily cap (50 changes/project/day)                             | Nobody (rule)      | Says it paused; resumes tomorrow; owner was told once                                   |

**Who gets pinged (the recommendation):** person-level walls (1, 2) go to the person, in the chat, as a link. Owner-level walls (3–5) go to the owner, but only after the person says yes in chat. An agent never pings an owner on its own initiative, which keeps owners from getting agent spam. The request goes out in the person's name, labeled "sent by DJ's agent."

## Work, in this order (lean)

1. **One structured refusal for every wall.** Every gateway refusal in a shared project returns
   `details.access_needed = { wall, who_can_fix: 'you' | 'owner' | 'nobody', project_id, project_name, owner_name, next, say_to_user }`.
   `next` is `{ open_url }` for walls 1–2 and `{ tool: 'request_project_access', args }` for 3–5. Tool descriptions tell agents to show `say_to_user`, ask before calling `next.tool`, and retry after.
    - Wall 3 today: `computeEffectiveAgentProjectScope` (`apps/web/src/lib/server/agent-call/project-access.service.ts`) drops agents-off shared projects, so they land in `ScopedProjectMap.ungrantedProjectIds` (`packages/shared-agent-ops/src/gateway/op-execution-gateway.access.ts`) and get the misleading `project_not_granted_to_connector` + grant link. Carry a separate `owner_blocked_project_ids` (with the reason) on the scope so the error is accurate and no grant link is offered.
    - Walls 4–6 today: `applyGuestAgentLane` reasons `guest_agent_write_off`, `outside_guest_lane`, `guest_agent_daily_limit` (`op-execution-gateway.guest-lane.ts`) and the viewer path through `assertProjectWriteAccess`. Map each to the payload.
2. **`request_project_access` MCP tool** (in `people-tools.service.ts`). Args: `project_id`, `need: 'agents_read' | 'agents_write' | 'edit'`, optional `note`. Only for a project the person is already a member of; the owner is the target (no handle needed). New RPC + `people_requests.kind = 'upgrade'` (needs `project_id`; extend `people_requests_kind_check`). Same limits as other agent requests (5/day per connection, 10 waiting, pair cooldown, silent block). Owner gets an in-app notification + email ("DJ's agent wants to edit 9takes").
3. **Owner one-tap approve.** `/people` card for `kind = 'upgrade'`: "Wants their agents to edit 9takes" with **Allow** / **Not now**. Allow goes through `decide_people_request` with the one project preselected (like the rejoin card). The decide route already adds the project to the requesting connection (`grantProjectsForUser` via `via_caller_id`), so the agent can retry right away.
4. **Fix the grant page loop.** `/profile/agent-keys/[callerId]/grant` must not offer projects the owner blocked (wall 3), and must handle shared projects (wall 1) and the write upgrade (wall 2). Static keys re-issue their secret when edited from the Agent Keys editor; the grant page must change permission without rotating.
5. **Agent docs** (`apps/web/src/content/docs/connect-agents.md`, "Other people's projects"): document the walls and the request tool.

Tests: one isolation-style test per wall in `cross-user-isolation.test.ts` asserting the payload, plus the new RPC in a rehearsal check. Free only.

## Ambitious adds

- **MCP URL elicitation:** clients that support it pop the consent page inline instead of showing a link.
- **Waiting, then resuming:** `check_project_access` returns pending/approved so the agent can pause the task and pick up when the owner says yes.
- **Standing approvals:** owner setting "Editors' agents can write in this project" so every new editor's agent is pre-approved.
- **Batch:** one request for several projects with the same owner.

## DJ calls

1. **Shared projects and connections.** Today, projects shared with you are never added to your agent connections automatically; you add them one by one. Option B: a per-connection toggle "Let this agent into projects shared with me" (off by default). The owner's per-person agent setting still applies, so owners keep control. **Pick: B.** It removes most of wall 1.
2. **Lean or ambitious.** **Pick: ambitious** (DJ, 2026-10-23).

## Build plan (ambitious, 2026-10-23)

Decisions made while building (veto any):

- **No project names in refusals for projects this connection can't read** (walls 1 and 3). The owner's name is included for wall 3 so the agent can say who to ask. Keeps the isolation suite's "hidden names never reach the agent" rule.
- **Standing approval is a live rule, not a data change.** While "Editors' agents can write here" is on, every editor's agents can write unless the owner turned that person's agents Off. Turning it off reverts instantly. Stored in its own owner-only table (`project_agent_settings`), not on `onto_projects`, because editors can update `onto_projects` rows directly.
- **Batch = merge.** A new upgrade request to an owner who already has one waiting from the same person adds the projects to it (one card, one tap) instead of being refused by the one-pending-request-per-pair rule.
- **Upgrade cooldown is 7 days per project** after "Not now" (access requests keep 30 days).
- **Inline consent (URL elicitation)** runs only on the 2026-07-28 MCP protocol for clients that declare `elicitation.url`. Older clients get the link in the tool result. The legacy path can't know client capabilities (stateless).
- **Wall 2 for OAuth connections** can't be widened in place (tokens keep their consented scope), so the page says to reconnect with changes allowed. Static keys switch to read+write in place without rotating.

Pieces:

1. Migration: `people_requests.kind = 'upgrade'` + `requested_items`, `project_agent_settings`, `external_agent_callers.include_shared_projects`, RPCs `create_project_upgrade_request`, `set_project_editor_agents_write`, `decide_people_request` (upgrade branch), `list_people_requests` (items).
2. Shared gateway: `op-execution-gateway.access-wall.ts` builds `details.access_needed` for every wall; scope carries `owner_blocked_project_ids`.
3. Web: links on "you" walls, `request_project_access` + `check_project_access` tools, MCP inline consent, shared-projects toggle in scope resolution.
4. Grant page: no agents-off projects, write upgrade without rotation, toggle. Connection page: toggle.
5. `/people` upgrade card with Allow / Not now and "let every editor's agents write here"; Share window standing-approval switch.
6. Emails + docs + tests (isolation suite per wall, people tools, rehearsal check).

## Built (2026-10-23)

All six pieces are in the working tree, not committed.

- Migration `20261023235900_agent_access_wall.sql`: rehearsed (check file `supabase/tests/20261023235900_agent_access_wall.check.sql` passes), dry-run with ROLLBACK in prod, applied, recorded.
- Tests, all free: shared gateway 233 pass; web agent-call + people + `/people` + Share window 606 pass (27 files); svelte-check 0 errors.
- Real dead end fixed on the way: an edit in a shared project without base write went to the permission-request path and answered "Permission requests are not enabled for this BuildOS deployment". It now falls through to the wall with `access_needed`.

Review fixes (2026-10-23, second pass). An outside review found five problems; all fixed:

1. **"Allow reading" could grant editing (P1).** A request can grow after the owner opens it (a second ask merges in; the stronger need wins), and Allow sent project ids only. Allow now sends every item as shown (`items: [{ project_id, need, allow }]`); if the request changed, the RPC refuses (`PT409` → 409) and the card reloads with "X changed this request. Look again."
2. **Merged requests could connect the wrong agent (P1).** Each requested project now keeps the connections that asked for it (`requested_items[].caller_ids`); approval connects each project only to those.
3. **"Allow changes" with no project was a dead end (P2).** The grant page now handles `?need=write` without a project: one tap for a key, reconnect steps for OAuth.
4. **Wall 6 missing for goals, plans, the project (P2).** Writes agents never make in someone else's project now get `outside_guest_lane` with "I can add this as a task instead", even for viewers (asking to be an editor wouldn't help).
5. **"Ask the owner" on the grant page forgot the connection (P2).** It now names the connection (`p_for_caller_id`), so approval also connects it.

Migration `20261024003000_agent_access_wall_fixes.sql`: rehearsed with `supabase/tests/20261024003000_agent_access_wall_fixes.check.sql` (reproduces 1, 2, 5), dry-run with ROLLBACK in prod, applied, recorded; `decide_people_request` body md5 matches the rehearsal. Prod had no people requests, so no backfill. Tests: shared gateway 233 pass, web 631 pass; the wall-6 test fails without the fix.

The `/people` cards moved to `apps/web/src/lib/components/people/PeopleRequests.svelte` (tasker 141 session); the approve fix lives there.

Not done:

- Browser check of the grant page and `/people` upgrade card (machine swap was full; no BuildOS dev server running).
- Live two-account run (Exit below). Free.
- `op-execution-gateway.entity-access.test.ts` fails 1 test from the workspace session's `toProjectKind` change (its mock lacks the export). Not this work.
- `people-emails.test.ts` fails 2 tests and svelte-check shows 9 errors, all from the tasker 141 hub session's in-progress files (told that session). Not this work.

Known gaps (small, left for later):

- Non-owner editors still see their own agent badge as "Read" while the owner's standing approval is on (only owners load the setting in the Share window). Their agents can write.
- No Block button on upgrade cards (Not now only).
- Existing gap, not new: editors can update `onto_projects.external_agent_access` directly through PostgREST. Worth its own fix.

## Exit

Live, free, two accounts: DJ's agent works in Sam's project and clears walls 1, 3, 4 and 5 with at most one tap or one "yes" each, and walls 6 and 7 explain themselves. Recorded in [145](145-people-layer-launch.md).
