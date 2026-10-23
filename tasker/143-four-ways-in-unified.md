<!-- tasker/143-four-ways-in-unified.md -->

# 143 — The four ways into a project behave the same

**Status:** READY · **Priority:** P1 · **Opened:** 2026-10-23 · **Size:** ~1 day  
**Owner:** Claude · **Needs from DJ to start:** nothing

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
