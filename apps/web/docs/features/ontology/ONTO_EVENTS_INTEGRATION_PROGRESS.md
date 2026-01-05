<!-- apps/web/docs/features/ontology/ONTO_EVENTS_INTEGRATION_PROGRESS.md -->

# onto_events Integration Progress Tracker

**Created:** 2026-01-05
**Status:** Complete

## Overview

This document tracks the integration of `onto_events` into the BuildOS ontology system, specifically:

1. Ensuring onto_events is properly hooked up on `/projects/[id]` page
2. Adding onto_events to LinkedEntities component
3. Ensuring API endpoints support event entity linking
4. Updating EventEditModal to match TaskEditModal design patterns

---

## Current State Analysis

### 1. /projects/[id] Page - onto_events Integration

**Status:** Complete

The page has events fully integrated:

- [x] Imports `OntoEvent` type from `$lib/types/onto`
- [x] Has `events` state variable (`OntoEventWithSync[]`)
- [x] Has `filteredEvents` derived state with filtering/sorting
- [x] Has `loadProjectEvents()` function to fetch events
- [x] Has `showEventCreateModal` and `editingEventId` state
- [x] Events panel is in the `insightPanels` array
- [x] Has `formatEventWindow()` and `isEventSynced()` utilities
- [x] Panel counts include events (showCancelled, showDeleted)
- [x] EventEditModal now receives `projectId` prop

---

### 2. LinkedEntities Component - Event Support

**Status:** Complete

Events are fully supported in LinkedEntities:

#### linked-entities.types.ts

- [x] `EntityKind` type includes `'event'`
- [x] `LinkedEntitiesResult` includes `events` array
- [x] `AvailableEntitiesResult` includes `events` array
- [x] `RELATIONSHIP_MAP` includes event relationships
- [x] `ENTITY_SECTIONS` includes event config

#### LinkedEntities.svelte

- [x] `linkedEntities` state includes `events` array
- [x] `availableEntitiesCache` state includes `event` key

#### LinkedEntitiesSection.svelte

- [x] Calendar icon imported for event entity type
- [x] `iconComponents` map includes `event: Calendar`

---

### 3. API Endpoints - Event Entity Linking

**Status:** Complete

#### edges/linked/+server.ts

- [x] `VALID_KINDS` array includes `'event'`
- [x] `LinkedEntitiesResult` interface includes `events`
- [x] `AvailableEntitiesResult` interface includes `events`
- [x] `fetchLinkedEntities()` fetches from `onto_events`
- [x] Parallel query for events added
- [x] Events mapped with edge info
- [x] Empty availableEntities includes `events: []`

#### edges/available/+server.ts

- [x] `VALID_KINDS` array includes `'event'`
- [x] `tableMap` includes `event: 'onto_events'`
- [x] `columnsMap` includes event columns: `['id', 'title', 'state_key', 'type_key', 'start_at']`

---

### 4. EventEditModal Design

**Status:** Complete

EventEditModal has been redesigned to match TaskEditModal:

| Feature                      | TaskEditModal | EventEditModal                   |
| ---------------------------- | ------------- | -------------------------------- |
| Header with icon             | Yes           | Yes (Calendar icon)              |
| Timestamps (created/updated) | Yes           | Yes                              |
| Two-column layout            | Yes           | Yes                              |
| LinkedEntities section       | Yes           | Yes (in sidebar)                 |
| Schedule card                | Yes           | Yes (in sidebar)                 |
| External link button         | Yes           | Yes (for calendar link)          |
| Delete confirmation modal    | Yes           | Yes (ConfirmationModal)          |
| Lazy-loaded modals           | Yes           | Yes (Task, Goal, Plan, Document) |
| Toast notifications          | Yes           | Yes                              |

---

## Implementation Tasks

### Task 1: Update linked-entities.types.ts

- [x] Add `'event'` to EntityKind union type
- [x] Add `events: LinkedEntity[]` to LinkedEntitiesResult
- [x] Add `events: AvailableEntity[]` to AvailableEntitiesResult
- [x] Add event relationships to RELATIONSHIP_MAP:
    - `'event-task': 'scheduled_for'`
    - `'event-plan': 'part_of_plan'`
    - `'event-goal': 'supports_goal'`
    - `'event-milestone': 'targets_milestone'`
    - `'event-document': 'references'`
    - `'event-output': 'relates_to'`
    - `'event-decision': 'references'`
    - `'task-event': 'has_event'`
    - `'plan-event': 'has_event'`
    - `'goal-event': 'has_event'`
    - `'milestone-event': 'has_event'`
    - `'document-event': 'referenced_by'`
    - `'output-event': 'has_event'`
    - `'decision-event': 'discussed_in'`
- [x] Add event config to ENTITY_SECTIONS

### Task 2: Update LinkedEntities.svelte

- [x] Add `events: []` to linkedEntities initial state
- [x] Add `event: []` to availableEntitiesCache initial state

### Task 3: Update LinkedEntitiesSection.svelte

- [x] Import Calendar icon from lucide-svelte
- [x] Add `event: Calendar` to iconComponents map

### Task 4: Update edges/linked/+server.ts

- [x] Add `'event'` to VALID_KINDS
- [x] Add `events: LinkedEntity[]` to LinkedEntitiesResult interface
- [x] Add `events: AvailableEntity[]` to AvailableEntitiesResult interface
- [x] Add `event: []` to idsByKind initialization
- [x] Add onto_events query to parallel fetch
- [x] Map events with edge info
- [x] Add `events: []` to empty availableEntities initialization

### Task 5: Update edges/available/+server.ts

- [x] Add `'event'` to VALID_KINDS
- [x] Add `event: 'onto_events'` to tableMap
- [x] Add event columns to columnsMap

### Task 6: Redesign EventEditModal.svelte

- [x] Add proper header with Calendar icon and timestamps
- [x] Convert to two-column layout (form + sidebar)
- [x] Add LinkedEntities section in sidebar
- [x] Add Schedule card in sidebar
- [x] Add lazy-loaded modals for linked entity navigation (Task, Goal, Plan, Document)
- [x] Add External link button for calendar-synced events
- [x] Use ConfirmationModal for delete confirmation
- [x] Add toast notifications for save/delete
- [x] Add all-day event toggle
- [x] Add calendar sync checkbox with linked status indicator

### Task 7: Update /projects/[id] Page

- [x] Add `projectId={project.id}` prop to EventEditModal

### Task 8: Add Events to MobileCommandCenter

- [x] Add `'events'` to PanelKey union type
- [x] Import `Clock` icon for events (Calendar already used for Plans)
- [x] Import `OntoEvent` type
- [x] Add `events` prop to Props interface
- [x] Add `onAddEvent` and `onEditEvent` callbacks to Props
- [x] Update pairs mapping to handle events as standalone (no partner)
- [x] Add `getEventStateColor()` function
- [x] Add Row 5: Events (Scheduling) as standalone panel
- [x] Update /projects/[id]/+page.svelte to pass events props to MobileCommandCenter
- [x] Update CommandCenterPanel.svelte PanelKey type to include 'events'
- [x] Update MOBILE_COMMAND_CENTER_SPEC.md documentation

---

## Progress Log

### 2026-01-05: Initial Analysis

- Completed codebase analysis
- Identified all required changes
- Created this tracking document

### 2026-01-05: Implementation Complete

- Updated linked-entities.types.ts with event support
- Updated LinkedEntities.svelte with events state
- Updated LinkedEntitiesSection.svelte with Calendar icon
- Updated edges/linked/+server.ts with full event support
- Updated edges/available/+server.ts with event table/columns
- Redesigned EventEditModal.svelte with:
    - Two-column layout
    - Proper header with Calendar icon and timestamps
    - LinkedEntities sidebar section
    - Schedule card in sidebar
    - Lazy-loaded modals for linked entity navigation
    - ConfirmationModal for delete
    - Toast notifications
- Updated /projects/[id]/+page.svelte to pass projectId to EventEditModal

### 2026-01-05: MobileCommandCenter Events Integration

- Added events to MobileCommandCenter.svelte:
    - Row 5: Events (Scheduling) - standalone panel with Clock icon
    - PanelKey union type updated to include 'events'
    - Props interface extended with events array and callbacks
    - getEventStateColor() function for state badge colors
    - Events handled as standalone panel (no partner pairing)
- Updated /projects/[id]/+page.svelte to pass events props to MobileCommandCenter
- Fixed CommandCenterPanel.svelte PanelKey type to include 'events'
- Updated MOBILE_COMMAND_CENTER_SPEC.md with:
    - Version 1.1, updated date
    - 9 data models in 5 rows (4 paired + 1 standalone)
    - Row 5 for Events (Scheduling)
    - Events in Props interface and PanelKey type
    - Events color palette (Clock icon, text-teal-500)
    - Events empty state message
    - Testing requirements for Events

---

## Files Modified

1. `apps/web/src/lib/components/ontology/linked-entities/linked-entities.types.ts`
2. `apps/web/src/lib/components/ontology/linked-entities/LinkedEntities.svelte`
3. `apps/web/src/lib/components/ontology/linked-entities/LinkedEntitiesSection.svelte`
4. `apps/web/src/routes/api/onto/edges/linked/+server.ts`
5. `apps/web/src/routes/api/onto/edges/available/+server.ts`
6. `apps/web/src/lib/components/ontology/EventEditModal.svelte`
7. `apps/web/src/routes/projects/[id]/+page.svelte`
8. `apps/web/src/lib/components/project/MobileCommandCenter.svelte`
9. `apps/web/src/lib/components/project/CommandCenterPanel.svelte`
10. `apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md`

---

## Testing Checklist

- [ ] Event can be linked to tasks from TaskEditModal
- [ ] Event can be linked to plans from PlanEditModal
- [ ] Event can be linked to goals from GoalEditModal
- [ ] Task/Plan/Goal can be linked to events from EventEditModal
- [ ] EventEditModal displays all event data correctly
- [ ] EventEditModal layout matches TaskEditModal style
- [ ] LinkedEntities shows events in relevant entity modals
- [ ] API endpoints return events in linked/available queries
- [ ] Calendar sync toggle works correctly
- [ ] Delete confirmation modal works with calendar delete option
- [ ] MobileCommandCenter displays Events panel in Row 5
- [ ] Events panel shows correct count and event list
- [ ] Add event button opens EventCreateModal
- [ ] Clicking an event opens EventEditModal
- [ ] Event state badges display correct colors
