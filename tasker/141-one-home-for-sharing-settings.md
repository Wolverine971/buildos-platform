<!-- tasker/141-one-home-for-sharing-settings.md -->

# 141 — One home for sharing and agent settings (and a new People tab)

**Status:** BUILT, UNCOMMITTED (ambitious); migration APPLIED; live two-account check pending · **Priority:** P2 · **Opened:** 2026-10-23 · **Size:** ambitious ~5 days  
**Owner:** Claude · **DJ picked (2026-10-23):** Profile → People & agents hub; Google Docs-style Share window; ambitious; Restricted moves into Share

## What users get

One place in Profile to see and change everything about who you share with and what agents can reach, plus a clean per-project Share window. Today the same ideas are spread over about eight screens.

## DJ direction (2026-10-23)

- "This is spread around a bunch of different places, we need to think about maybe unifying this."
- Manage it cohesively at the profile level, and cleanly per project. Look for chances to combine and simplify.
- The share window's People tab "needs to be rethought and reanalyzed because that's old."

## Interview + mock (2026-10-23)

- DJ picked the tasker proposal for the hub (You / People / Agents in Profile) and a Google Docs-style Share window (invite box on top, one list, you first, no tabs).
- Mock on real data: https://claude.ai/artifact/4eb6ghWUHwQRdTRUXYrGuN (hub, Share owner + member views, grid, history).
- Real-data findings that shaped it: 6 people across 5 shared projects (Ian on two), none with a handle, every collaborator's agents on Write; 6 invites still say "pending" months after expiring; 15 live agent connections, 10 unused for 3+ months (5 OpenClaw), every one reaching all 48 projects; 0 people requests ever.
- Picks: **ambitious** (adds person × project grid with bulk changes, and an access-history log); **Restricted moves from Edit project into the Share window** ("Agents in this project").

## Where things lived before

| Surface                                                              | What's there                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Profile → Account, "Finding you" card                                | @handle, "People with my handle can find me", accept agent requests                                        |
| Profile → Agent keys (+ `/profile/agent-keys/[callerId]/grant`)      | Each connection, its projects, read or read & write                                                        |
| Profile → Notifications                                              | Notification preferences                                                                                   |
| `/people` (People nav item)                                          | Find by handle, ask, requests in and out, shared with you                                                  |
| Project Share window (Share button, or ··· → Collaboration settings) | Invite (email, @handle, invite link + QR) · People (members, role, agents dial, pending invites) · My role |
| Project ··· menu                                                     | Collaboration settings, project notifications on/off                                                       |
| Onboarding People step, signup                                       | Claim a handle, invite someone                                                                             |
| Project "restricted" flag                                            | Agents need an explicit grant                                                                              |

Known problems: the People tab shows every member's email to other members; "My role" is a separate tab for one row of information; agent connections live far from the people they affect; `/people` is a top-level page while the same settings live in Profile.

## Proposal to react to (not built)

- **Profile → "People & agents"**, three sections:
    - **You:** handle, findable, accept agent requests.
    - **People:** everyone you share with across all your projects (role and agents per project), requests waiting, projects shared with you. This absorbs `/people`; the nav item links here.
    - **Agents:** each connection with the projects it reaches (yours and shared), its permission, last used, and the shared-projects toggle from [140](140-agent-access-wall.md).
- **Per project, the Share window stays the one place:** Invite (email, @handle, link) and People (members with role + agents dial, pending invites, requests for this project). "My role" folds into People as your own row. Names and handles only for non-owners.

**Lean:** build the hub by moving existing pieces, fold "My role", hide emails from non-owners, point every entry (nav, onboarding, docs) at one place.
**Ambitious:** add a person × project grid (role and agents in one table, bulk change), and an access history ("Sam's agent got Write on 9takes, Oct 23").

## Built (2026-10-23, ambitious)

**Profile → People & agents** (`?tab=people`; old `?tab=agent-keys` and `/people` land here):

- **You:** handle editor (also the public URL) + "People with my handle can find me" + "Accept requests sent by agents", moved out of Account (Account keeps a one-line pointer).
- **Requests:** the old `/people` request cards, moved as-is into `PeopleRequests.svelte` (shown on top when someone is waiting, otherwise "Find someone" + "You asked" below People).
- **People:** one row per person across your projects (open it: role + their agents per project, "their agents everywhere", remove from one or all). **Grid** view: person × project, role and agents per cell, pick rows and set agents everywhere at once, "+ Add" invites someone already in another of your projects (`invitee_actor_id`, email stays on the server). Invites nobody answered (expired ones labeled, Resend / Remove, Clear expired). Shared with you (your role and your agents there). People without a handle show the email you invited them with (owner only); Ian has two accounts, so he shows twice.
- **Agents:** the old Agents tab, compact header, setup guide folded when you have connections, list split into active / unused 3+ months (collapsed, "Disconnect all N") / revoked, and a per-connection **Projects shared with me** switch (new `PATCH /api/agent-call/callers/shared-projects`).
- **History:** "who got access, and when" from the new `project_access_events` log.
- "Share a project" picks a project and opens its Share window (`/projects/<id>?share=1`).

**Share window:** one Docs-style list, no tabs. Owners: add people, everyone with access (you first; your row holds your role + notifications, replacing "My role"), role menu with Make owner / Remove, agents menu, invites nobody answered + Clear expired, "Agents in this project" (Editors' agents can make changes + **Only agents you pick can reach this project**, moved from Edit project), invite link. Members: names and handles only, their own agents line and who set it. Menu item renamed "Share…" / "People".

**Server:** members API strips emails for non-owners and adds handles; invites GET owner-only with `effective_status`; `POST …/invites/clear-expired`; `GET /api/people/hub` (one call for the hub); `GET /api/people/history`.

**Migration** `20261024000500_project_access_events.sql`: table + triggers on members, invites, projects, agent settings (logging can't break a write) + backfill (16 sent, 9 expired, 7 joins). Rehearsed (0 security findings), dry-run with ROLLBACK in prod, APPLIED + recorded 2026-10-23.

**Checks:** svelte-check 0 errors; 27 related test files green (214 tests, plus alias tests); browser check on DJ's account (hub, grid, Share window on Cadre, old agent-keys link) clean, no console errors. Member view checked by tests only.

**Open:**

- **Emails still readable at the database.** `onto_actors_select` lets any co-member read every member's email through the REST API; the screens hide it, the rule doesn't. Closing it needs a column-level revoke or a view plus an audit of user-client reads of `onto_actors.email`. Needs DJ's OK as a follow-up.
- Live two-account check (member view, grid "+ Add", Clear expired) is folded into [145](145-people-layer-launch.md).
- Updated the explainer (JEk3EN2p…) and `connect-agents.md`.

## Work (after DJ picks)

1. Interview DJ: "Describe what you picture when you open sharing settings." Then mock the hub on real data (his projects, his collaborators) as an artifact before building.
2. Build the chosen version; keep every existing route working (redirect `/people` if it moves).
3. Update the explainer page and `connect-agents.md`.

## Exit

DJ can answer "who can see 9takes, and what can their agents do?" and change it from one screen, and the per-project Share window matches it.
