<!-- apps/web/docs/features/onboarding/README.md -->

# Onboarding Feature

**Last Updated**: January 7, 2026
**Status**: Active (V2 Complete)
**Category**: Feature
**Location**: `/apps/web/docs/features/onboarding/`

---

## Overview

The onboarding system helps new users understand BuildOS and get started effectively. It introduces core concepts, captures user preferences, and optionally imports existing projects.

---

## Documentation in This Folder

| Document                                                                   | Purpose                             |
| -------------------------------------------------------------------------- | ----------------------------------- |
| [README.md](./README.md)                                                   | This file - Overview and navigation |
| [ONBOARDING_V2_UPDATE_ASSESSMENT.md](./ONBOARDING_V2_UPDATE_ASSESSMENT.md) | V2 implementation spec and status   |
| [ONBOARDING_V2_UPDATED_SPEC.md](./ONBOARDING_V2_UPDATED_SPEC.md)           | Detailed V2 specification           |
| [ONBOARDING_FLOW_ANALYSIS.md](./ONBOARDING_FLOW_ANALYSIS.md)               | Original flow analysis              |
| [ONBOARDING_ASSETS_CHECKLIST.md](./ONBOARDING_ASSETS_CHECKLIST.md)         | Asset requirements checklist        |

---

## Onboarding V2 Flow

The current onboarding (V2) consists of the following steps:

| Step             | Component             | Required | Purpose                                         |
| ---------------- | --------------------- | -------- | ----------------------------------------------- |
| Welcome          | `WelcomeStep`         | Yes      | Introduction to BuildOS                         |
| Capabilities     | `CapabilitiesStep`    | No       | Educates on "Meet You Where You Are" philosophy |
| Projects Capture | `ProjectsCaptureStep` | No       | Brain dump + calendar connect/analysis          |
| Notifications    | `NotificationsStep`   | No       | SMS + email preferences                         |
| Flexibility      | `FlexibilityStep`     | No       | Feature tour                                    |
| Preferences      | `PreferencesStep`     | No       | Communication style + proactivity + context     |
| Profile          | `CombinedProfileStep` | Yes      | Archetype + challenges                          |
| Admin Tour       | `AdminTourStep`       | No       | Optional walkthrough                            |
| Summary          | `SummaryStep`         | Yes      | Review + finish                                 |

---

## Key Features

### Brain Dump Import

Users can write a brain dump during onboarding to create their first project. This creates:

- An ontology project (`onto_projects`)
- Context document with the brain dump content
- Initial plan and tasks

### Calendar Analysis

Users can connect Google Calendar and have BuildOS analyze their events to detect potential projects.

### Preference Capture

During onboarding, users set:

- Communication style preference
- Proactivity level preference
- Optional role and domain context

See [User Preferences Documentation](../preferences/README.md) for full details.

---

## Key Files

### Components

```
/src/lib/components/onboarding-v2/
├── WelcomeStep.svelte
├── CapabilitiesStep.svelte
├── ProjectsCaptureStep.svelte
├── NotificationsStep.svelte
├── FlexibilityStep.svelte
├── PreferencesStep.svelte
├── CombinedProfileStep.svelte
├── AdminTourStep.svelte
└── SummaryStep.svelte
```

### Routes

- `/src/routes/onboarding/+page.svelte` - Main onboarding page (V2)

### Services

- `/src/lib/services/onboarding-v2.service.ts` - Onboarding business logic
- `/src/lib/config/onboarding.config.ts` - Step configuration

---

## Implementation Phases

The V2 update was implemented in three phases:

### Phase 1: Ontology Integration (Complete)

- Brain dumps create ontology projects instead of legacy projects
- Calendar analysis creates ontology projects
- Summary step shows ontology counts

### Phase 2: Education + Core Preferences (Complete)

- Added CapabilitiesStep explaining "Meet You Where You Are"
- Added communication style and proactivity preference capture
- Added preferences injection into AI prompts

### Phase 3: Advanced Preferences (Complete)

- Added working context capture (role/domain)
- Created preferences settings tab in profile
- Added project-specific preferences UI
- Extended prompt injection for all preference types

See [ONBOARDING_V2_UPDATE_ASSESSMENT.md](./ONBOARDING_V2_UPDATE_ASSESSMENT.md) for detailed implementation status.

---

## Related Documentation

### Direct Dependencies

- **[User Preferences](../preferences/README.md)** - Preference system documentation
- **[Ontology System](../ontology/README.md)** - Project structure created during onboarding
- **[Brain Dump](../brain-dump/README.md)** - Brain dump processing system

### UI Components

- **[Modal Components](../../technical/components/modals/README.md)** - Modal patterns used
- **[Inkprint Design System](../../technical/components/INKPRINT_DESIGN_SYSTEM.md)** - Design system

### API

- **`/api/users/preferences`** - User preferences API
- **`/api/braindumps/stream`** - Brain dump processing
- **`/api/calendar-analysis`** - Calendar analysis

---

## User Guide

For end-user documentation, see:

- `/apps/web/docs/user-guide/getting-started.md`

---

**Document Author**: Claude
**Last Major Update**: January 7, 2026 - V2 Complete (All 3 Phases)
