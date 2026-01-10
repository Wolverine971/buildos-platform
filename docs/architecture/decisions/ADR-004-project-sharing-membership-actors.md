<!-- docs/architecture/decisions/ADR-004-project-sharing-membership-actors.md -->

# ADR-004: Project sharing via actor memberships and invite tokens

**Date:** 2026-01-09  
**Status:** Accepted (partial implementation)  
**Deciders:** Platform  
**Related ADRs:** ADR-003-ontology-schema-public-prefix

## Context

The ontology system is actor-centric: ownership is stored as `onto_projects.created_by` (actor id), and RLS relies on `current_actor_id()`. Project sharing requires:

- Membership-based access (not just owner-only access).
- Actor-attributed activity logs and daily brief summaries.
- An invite flow for email-based collaboration.

Existing access-control tables (`onto_assignments`, `onto_permissions`) are not integrated into RLS or APIs, and activity logs currently reference `auth.users` instead of actors.

## Decision

1. **Introduce a dedicated `onto_project_members` table** for project membership and access control.
2. **Introduce `onto_project_invites`** with hashed invite tokens and expiry.
3. **Make actors the canonical provenance identity** by adding `changed_by_actor_id` to `onto_project_logs`.
4. **Centralize access checks** via a SQL helper `current_actor_has_project_access(project_id, access)` and use it in RLS policies for ontology tables and activity logs.
5. **Keep `onto_permissions`/`onto_assignments` reserved** for future fine-grained access (not used for project sharing v1).

## Consequences

### Positive

- Consistent identity model across ownership, membership, and activity attribution.
- Clear membership semantics, easier to extend with org/team features later.
- Centralized RLS logic avoids fragmented access checks in endpoints.

### Negative

- Additional joins for membership-aware queries (may need caching or access views).
- Requires migration/backfill for membership and activity logs.
- Worker/service-role jobs must filter by membership manually.

## Alternatives Considered

1. **Reuse `onto_permissions`** for project sharing:
    - Rejected due to unclear semantics and lack of explicit membership lifecycle.
2. **Reuse `onto_assignments`** for project sharing:
    - Rejected because assignments represent role allocation, not access control.
3. **Store shared access in `onto_projects.props`**:
    - Rejected due to poor queryability, weak RLS integration, and auditability.

## Notes

- Ownership remains immutable (`created_by`), with future optional `owner_actor_id` for transfer.
- Invite acceptance ties to authenticated users; no pre-creation of actors.
- Membership tables, RLS policies, log actor attribution, invite flow, share UI, and member/invite management actions are implemented.
