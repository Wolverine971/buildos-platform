<!-- docs/technical/project-access-auth-review-handoff-2026-05-14.md -->

# Project Access Auth Review Handoff

Date: 2026-05-14
Status: Review handoff

## Purpose

This document summarizes the project access/auth changes made after auditing the
ontology project API surface. It is intended for another agent or reviewer to
quickly understand the security model, the old behavior, the new behavior, and
the issues that were fixed.

This is not a file-by-file changelog. The important change is architectural:
public visibility, collaboration access, and external-agent access are now
treated as separate permission concepts.

## Old State

Several internal project APIs and database policies used
`current_actor_has_project_access(project_id, 'read')` as the read gate.

That helper includes a public-project shortcut:

- if `onto_projects.is_public = true`, read access could succeed even when the
  caller was not a project owner or collaborator.

That was acceptable only for intentionally public, shaped public payloads. It
was not safe for internal collaboration surfaces.

Because the same helper was used broadly, a public project could expose internal
payloads such as:

- document tree payloads and document bodies,
- full/skeleton project payloads,
- graph/entity payloads,
- member identities and emails,
- activity logs,
- archived/deleted project content,
- comments and comment mentions,
- assets and project snapshots,
- FastChat / agent context payloads.

The old model also made external-agent access easy to reason about incorrectly:
it blurred "this project has public visibility" with "an agent/caller may access
this project."

## New State

Project authorization now has three distinct concepts:

1. **Public visibility**
    - Public/example/published surfaces may expose a shaped public payload.
    - Public visibility does not grant internal collaboration access.

2. **Collaboration access**
    - Owners and active project members are the authority for internal project
      APIs.
    - Internal routes use member-only checks before returning private project
      data or accepting writes.

3. **External-agent access**
    - An external caller must pass both:
        - owner/member project access for the authorizing actor, and
        - the connector/caller grant scope.
    - Public project visibility does not make a project visible to Claude,
      ChatGPT, OpenClaw, or any other connector.

## Database Permission Model

The old helper still exists:

```text
current_actor_has_project_access(project_id, access)
```

It remains public-aware and should only be used by routes/RPCs that explicitly
intend to support public reads.

The new member-only helpers are:

```text
current_actor_has_project_member_access(project_id, access)
actor_has_project_member_access(actor_id, project_id, access)
```

Use `current_actor_has_project_member_access` for authenticated session routes.
Use `actor_has_project_member_access` from service-role code, workers, and
external-agent gateway flows where the intended actor must be checked
explicitly.

Service-role access is not authorization. Service-role code may bypass RLS for
implementation reasons, but it must still validate the intended actor/caller.

## Agent Auth Model

Agents should be modeled as ontology actors when they need durable project
authority.

The intended long-term model is:

- human users map to `onto_actors.kind = 'human'`;
- durable AI agents map to `onto_actors.kind = 'agent'`;
- project access is represented through `onto_project_members`;
- connector grants further restrict what an external caller can do.

In other words, an agent should not gain access because a project is public. It
should gain access because it has an actor identity and an explicit project
membership or because a human actor authorized a connector grant that is further
bounded by that human actor's project membership.

This keeps auditability clean:

- project mutations can be attributed to the responsible ontology actor;
- connector sessions/tool calls can be tied to caller IDs and call sessions;
- public page views remain public-surface activity, not collaboration activity.

## Issues Fixed

The audit fixed these classes of issues:

- **Public document/body leak:** internal document tree reads no longer use the
  public-project read shortcut.
- **Member identity leak:** member-list and member-related endpoints no longer
  expose collaborator names/emails through public project visibility.
- **Internal project payload leak:** full project, skeleton, graph, entity,
  logs, archived-content, asset, and snapshot surfaces are member-gated.
- **Comment overexposure:** comments no longer use project-level `is_public` as
  the public read/write gate. Public comment access is document-level and only
  applies to live public document pages.
- **Comment mention over-notification:** mentions no longer notify arbitrary
  users through a public-project shortcut; notifications are scoped to project
  members/owners.
- **Agent/context overexposure:** FastChat and agent tool context loading no
  longer treats public project visibility as project access.
- **Service-role ambiguity:** service-role context hydration now checks the
  intended actor instead of relying on service-role bypass.
- **Actor-row ordering bugs:** routes that use member-only helpers now resolve or
  require an ontology actor before checking access, so first-time collaborators
  do not fail accidentally.
- **RLS/RPC drift:** database policies and high-value RPC wrappers were tightened
  so direct table/RPC access follows the same member-only rule.

## Public Surfaces After The Change

Public surfaces still exist, but they are deliberately separate:

- public example project endpoints return shaped example/project-preview payloads;
- public pages expose published document-specific payloads;
- public comments are limited to live public document pages, not all project
  entities.

The rule for future work is: if an endpoint is public, it should be public by
design, have its own access check, and return a narrow DTO. It should not reuse
an internal collaboration endpoint just because `onto_projects.is_public` is
true.

## Review Focus For Another Agent

When reviewing this work, focus on these questions:

- Are any internal routes still using the public-aware helper for `read` access?
- Does every member-only access check happen after actor resolution?
- Do service-role code paths check the intended actor explicitly?
- Are public endpoints returning shaped payloads rather than internal DTOs?
- Do external-agent tools enforce both actor membership and connector grant
  scope?
- Are RLS policies aligned with the route-level model?
- Do comments and public pages stay document-scoped rather than project-scoped?

## Verification Already Performed

After the changes:

- Broad route/executor tests passed: 61 files, 195 tests.
- `pnpm --dir apps/web run check` passed with 0 errors and 0 warnings.
- `pnpm --dir packages/shared-types build` passed.
- Static scans found no runtime internal app code using public-aware project
  `read` access.
- Remote Supabase RPC smoke checks confirmed the new helpers and wrapped project
  RPCs are present and callable.
- Anonymous RLS smoke checks against an `is_public` project returned no rows for
  internal tables such as projects, documents, members, logs, assets, and edges.

## Known Boundaries

The new model intentionally does not remove `onto_projects.is_public`. That flag
can still be useful for public/example surfaces, but it must not be used as the
gate for collaboration data.

The function snapshots in `packages/shared-types/src/functions` are repository
documentation/reference definitions. The database source of truth is the applied
Supabase migrations plus the live database state.
