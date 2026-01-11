<!-- apps/web/docs/features/project-sharing/README.md -->

# Project sharing

## Overview

Project sharing enables multiple people to collaborate on the same ontology project, with invites, membership roles, shared project visibility, and actor-attributed activity.

## Status

- [x] Membership tables + RLS + log actor attribution (migration applied).
- [x] Membership-aware project listings (home/projects + API summaries).
- [x] Shared-project activity in daily briefs (actor attribution).
- [x] Invite flow baseline (endpoints + email + accept).
- [x] Share UI (invite form + member list).
- [x] Types regenerated for project sharing tables and log fields.
- [x] Invite revoke/resend + member role updates/removals.

## Key documents

- `apps/web/docs/features/project-sharing/PROJECT_SHARING_SPEC.md` - End-to-end feature spec and implementation plan.
- `apps/web/docs/features/project-sharing/INVITE_REGISTRATION_FLOW_SPEC.md` - Invite signup + pending invite acceptance flow.
- `docs/architecture/decisions/ADR-004-project-sharing-membership-actors.md` - Architecture decision record.

## Scope

- Shared project listing on home and projects pages
- Invite flow (email + acceptance)
- Membership-based access control and activity attribution
- Shared-project activity in daily briefs
