<!-- docs/specs/PROJECT_MEMBER_ROLE_CONTEXT_SPEC.md -->

# Project Member Role Context Spec

## Status

| Attribute | Value                                        |
| --------- | -------------------------------------------- |
| Status    | Complete (Phase 1 slice)                     |
| Created   | 2026-02-13                                   |
| Completed | 2026-02-16                                   |
| Owner     | Platform                                     |
| Scope     | Project collaboration + Agentic Chat context |

---

## Completion Summary (2026-02-16)

- Phase 1 scope in this spec is complete.
- `onto_project_members` now stores `role_name` and `role_description` with validation and owner backfill.
- FastChat project context now includes `members` with role profile fields, ordering, and app-side fallback defaults.
- Members API, self role-profile endpoints, alternatives generation endpoint, and admin member edit endpoint are live.
- Project collaboration UI supports generate-and-save, alternatives generation/selection, and admin role-profile editing for other members.
- Prompt guidance includes member role planning rules; prompt dumps include member role profile payload data.
- Regression coverage includes member fallback/ordering checks and member-role prompt guardrail checks.

---

## Problem

Project collaboration currently captures permission role (`role_key`: `owner`/`editor`/`viewer`) and access (`admin`/`write`/`read`), but does not capture _functional role context_ (who does what in the project).

This limits agentic chat because it cannot reason about team responsibilities and ownership semantics beyond permission levels.

---

## Goals

- Keep permission role (`role_key`) unchanged for authorization logic.
- Add member-authored role context fields:
    - `role_name` (short title, e.g., “Content Lead”)
    - `role_description` (responsibility summary)
- Include active project members (with role profile) in FastChat project context.
- Support an AI-assisted role authoring flow from a short user description.

---

## Non-goals (Phase 1)

- Replacing invite permission model (`editor`/`viewer`).
- Org-level role taxonomy across projects.
- Mandatory role profile completion before collaboration.

---

## Data Model

### Table: `onto_project_members`

Add columns:

- `role_name text null`
- `role_description text null`

Validation:

- `role_name` length 2-80 when provided.
- `role_description` length 8-600 when provided.

Backfill:

- Active owner memberships get default baseline profile:
    - `role_name = "Project Owner"`
    - `role_description = "Owns project direction, decision-making, and final approval."`

---

## Context Model (Agentic Chat)

### FastChat project payload

Add `members` array to `load_fastchat_context` project response:

- `id`
- `project_id`
- `actor_id`
- `role_key`
- `access`
- `role_name`
- `role_description`
- `created_at`
- `actor_name`
- `actor_email`

Ordering:

- Owners first, then editors, then viewers, then by `created_at`.

Fallback behavior in app context loader:

- If custom profile is missing, derive defaults by `role_key`:
    - owner → Project Owner
    - editor → Collaborator
    - viewer → Observer

---

## API Surface

### Implemented

- `GET /api/onto/projects/:id/members`
    - Returns `role_name` and `role_description` with each member row.
- `POST /api/onto/projects/:id/members/me/role-profile`
    - Input: freeform `role_context`
    - Generates AI role profile and saves by default.
- `PATCH /api/onto/projects/:id/members/me/role-profile`
    - Manually updates current member `role_name` / `role_description`.
- `POST /api/onto/projects/:id/members/me/role-profile/alternatives`
    - Generates multiple role profile alternatives from freeform role context.
- `PATCH /api/onto/projects/:id/members/:memberId/role-profile`
    - Admin endpoint to update any active member role profile.

Authorization:

- Must be an active project member for self endpoints.
- Project admin access required to edit other members' role profiles.

---

## AI Role Drafting Flow (Implemented UX)

1. User writes a short responsibility description.
2. AI generates:
    - one concise role name
    - one concrete role description focused on outcomes/responsibilities
    - optional alternatives for quick selection
3. User accepts or edits.
4. Save to `onto_project_members.role_name` + `role_description`.
5. Agentic chat immediately receives updated member context.

---

## Prompt/Agent Behavior Expectations

With `members` context available, the assistant should:

- Identify who owns decisions/workstreams.
- Suggest assignments aligned with existing roles.
- Avoid assigning work to viewers or non-owners for admin tasks.
- Ask for role clarification only when multiple members overlap responsibilities.

---

## Rollout Status

1. **Schema + context plumbing** (complete)
    - migration
    - FastChat RPC payload update
    - app context loader + type updates
    - members API payload update
2. **Role drafting API + UI** (complete)
    - AI generate + save flow for current member role profile
    - share modal input to describe role and generate profile
    - alternatives generation + quick apply in modal
    - admin role profile edit flow for other active members
3. **Prompt tuning** (complete)
    - add explicit instruction to leverage member role profiles during planning
4. **Quality checks** (complete)
    - prompt dump verification
    - behavior checks for multi-member scenarios

---

## Acceptance Criteria

- Project members can store `role_name` and `role_description`.
- FastChat project context contains `members` with role profile fields.
- Prompt dumps for project context show member role profile data.
- Existing permission checks continue using `role_key` and `access` unchanged.
