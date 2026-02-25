<!-- apps/web/docs/START-HERE.md -->

# START HERE - Web App Docs

**Last Updated:** 2026-02-25
**Scope:** Accurate entrypoint for `apps/web/docs`

Use this page to find the right documentation quickly. For full route-level navigation, use [NAVIGATION_INDEX.md](./NAVIGATION_INDEX.md).

## Core Entry Points

- [Web Docs README](./README.md) - High-level web documentation hub
- [Navigation Index](./NAVIGATION_INDEX.md) - Full directory-by-directory index
- [Features Index](./features/README.md) - Feature docs and status
- [Technical Index](./technical/README.md) - Architecture, API, testing, deployment

## Common Tasks

### Understand a feature

1. Open [Features Index](./features/README.md)
2. Go to the feature README (for example [Onboarding](./features/onboarding/README.md), [Notifications](./features/notifications/README.md))
3. Cross-check implementation details in [Technical Docs](./technical/README.md)

### Work on API endpoints

1. Start at [Technical API README](./technical/api/README.md)
2. Use [Routes Reference](./technical/api/routes-reference.md)
3. Open resource docs in `./technical/api/endpoints/`

### Work on architecture or services

1. Start at [Architecture README](./technical/architecture/README.md)
2. Review focused docs (for example `CALENDAR_SERVICE_FLOW.md`, `SCALABILITY_ANALYSIS.md`)

### Prepare for deployment

1. Use [Deployment Checklist](./technical/deployment/DEPLOYMENT_CHECKLIST.md)
2. Follow runbooks in `./technical/deployment/runbooks/`
3. Review ops docs in `./operations/README.md`

### Implement or update prompts

1. Start at [Prompts README](./prompts/README.md)
2. Choose the prompt family (`brain-dump`, `agent`, `chat`, etc.)

## Canonical vs Archived

- Active docs stay in `apps/web/docs/*`.
- Archived/superseded docs are moved under [/docs/archive/](/docs/archive/README.md).
- If a doc is marked deprecated, treat it as historical unless a feature README explicitly calls it out for active maintenance.

## Notes

- Onboarding V3 is the active flow: [features/onboarding/README.md](./features/onboarding/README.md)
- Onboarding V2 is legacy archive: [features/onboarding-v2/README.md](./features/onboarding-v2/README.md)
- Agentic chat canonical flow doc: [features/agentic-chat/README.md](./features/agentic-chat/README.md)
