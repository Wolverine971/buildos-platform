<!-- docs/technical/project-access-and-agent-auth-model.md -->

# Project Access and Agent Auth Model

Date: 2026-05-14
Status: Current engineering guidance

## Purpose

BuildOS has three related but separate ideas:

- **Project visibility:** whether a project has a public-facing presentation.
- **Project collaboration access:** whether an actor can use internal project APIs.
- **Agent call scope:** which already-collaborative projects and operations an external connector may use.

Do not collapse these into one permission check.

## Core Rule

Public project visibility is not collaboration access.

A public project may be readable through a deliberately public endpoint, but that must be a shaped public payload. Internal collaboration endpoints must require owner/member access before returning documents, document bodies, member identity, archived data, or write surfaces.

This applies at both layers:

- SvelteKit routes should use member-only guards for internal payloads.
- Supabase RLS/RPCs should not allow `onto_projects.is_public` to select internal collaboration tables directly.

## Actors and Membership

BuildOS project authority should flow through ontology actors and project memberships:

- Human users resolve to `onto_actors.kind = 'human'`.
- Durable AI agents should resolve to `onto_actors.kind = 'agent'`.
- Owners are represented by `onto_projects.created_by`.
- Collaborators are represented by active `onto_project_members` rows.
- `onto_project_members.access` is the operational permission: `read`, `write`, or `admin`.
- `role_key` is the product-facing role label, not the source of truth for authorization.

For future first-class agents, create an agent actor and grant it project membership exactly like a human collaborator. That gives the system one way to answer "can this actor read/write this project?" and one way to audit who did the work.

## Database Helpers

Use the narrow helper that matches the caller:

- `current_actor_has_project_access(project_id, access)` includes public project reads and is only appropriate for public-aware read surfaces.
- `current_actor_has_project_member_access(project_id, access)` checks the current authenticated actor without the public-project read shortcut. Use this for normal internal user-session APIs.
- `actor_has_project_member_access(actor_id, project_id, access)` checks a specific ontology actor without public-read or service-role shortcuts. Use this from service-role code, workers, and future agent-principal flows.

Do not use service-role access as authorization. Service-role code may bypass RLS for implementation reasons, but it must still check the intended actor/caller.

## Route Policy

Internal collaboration APIs should use the shared server guard in:

```text
apps/web/src/lib/server/ontology-project-access.ts
```

Use `requireProjectMemberAccess` for endpoints that expose:

- document trees or document bodies,
- project members or member emails,
- archived/deleted project content,
- activity logs, comments, assets, or project snapshots,
- private project graph/context,
- project full/skeleton payloads,
- mutation surfaces.

Public endpoints should be separate routes with separate response shaping. A public route should return only fields that are safe for public consumption and should not reuse internal DTOs by default.

## External Agents and Connectors

External agents have two layers of restriction:

1. The authorizing user or agent actor must have owner/member access to the project.
2. The external caller grant narrows that further by mode, allowed ops, and optional `project_ids`.

The effective access is the intersection of those two layers.

Connector-visible tools must not imply that public projects are available. A project is visible to a connector only if the authorizing actor is an owner/member and the connector grant permits that project.

## Audit Model

Use these records together when answering "who did what?":

- `onto_project_logs.changed_by_actor_id`: ontology actor responsible for the project change.
- `onto_project_logs.change_source`: source path such as `form`, `chat`, `api`, or `agent_call`.
- `onto_project_logs.external_agent_caller_id`: external connector identity when applicable.
- `onto_project_logs.agent_call_session_id`: external call session when applicable.
- `agent_call_sessions` and `agent_call_tool_executions`: connector-level session and tool-call audit trail.
- `security_events`: auth, OAuth, token, denial, and suspicious activity audit trail.

Current interactive BuildOS chat generally acts under the user's human actor and can annotate agent-call/session context where applicable. Future autonomous agents should use their own `onto_actors.kind = 'agent'` actor IDs so logs can distinguish "the human did this" from "the agent did this."

## Review Checklist

When adding or reviewing a project endpoint:

- Does this route return internal data? If yes, use member access, not public read access.
- Does this route run with a service-role/admin client? If yes, check the intended actor explicitly.
- Does this route expose documents, members, emails, archived content, or deleted content? If yes, do not allow anonymous public-project access.
- Is this a public route? If yes, use a public-specific access check and shape the response explicitly.
- Is this an external-agent route or tool? If yes, enforce both actor membership and caller grant scope.
- Does the mutation write `changed_by_actor_id` and, for connector calls, `external_agent_caller_id` / `agent_call_session_id`?
