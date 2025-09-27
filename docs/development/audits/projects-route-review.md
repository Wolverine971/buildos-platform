# /projects/[id] Audit

## Outstanding Findings

- _None._

## Completed Fixes

- [x] **Fix double note deletion request**: Centralised note deletion through `handleNoteDelete`, updated `NotesSection`/`ProjectModals` to delegate to parent, and removed redundant fetch.
- [x] **Recalculate project stats after store mutations**: `setTasks`, `setPhases`, and `updatePhase` now normalise data and call `updateStats`, keeping header/tab metrics accurate.
- [x] **Use correct calendar connection flag**: Switched components to rely on `calendarStatus.isConnected`, ensuring scheduling modals respect actual connection state.
- [x] **Scope realtime phase task subscription**: Added guards in `RealtimeProjectService` to ignore phase-task events for other projects based on task and phase ownership.
- [x] **Correct Tasks tab badge**: Simplified the Tasks tab counter to the canonical task count to prevent double counting deleted/completed work.
- [x] **Ensure recurring filters work**: Normalised defaults/counts across store and phase components so recurring tasks surface in filters and toolbars.
- [x] **Remove stray debugger statements**: Deleted development breakpoints from TasksList, ProjectService, and BriefClient services.
