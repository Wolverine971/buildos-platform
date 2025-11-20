# AgentChatModal Project Context Initialization Specification

## Overview

When the AgentChatModal is opened from a project detail page (`/ontology/projects/[id]`), it should launch already scoped to that project, skipping the generic context picker and presenting project-specific actions immediately. The user can still back out to the general selector if they choose.

## Desired Behavior

When invoked from `/ontology/projects/[id]`:

1. Modal opens directly to a project action selector showing:
   - Project Workspace (project-wide work)
   - Audit Project (audit-oriented prompts/tools)
   - Forecast Project (timeline/what-if oriented)
   - Focus on a specific entity (opens the existing focus selector)
2. Selecting an action sets the modal context to `project`, `project_audit`, or `project_forecast` for the current project and enters the chat view immediately.

## Technical Implementation

### AgentChatModal props

```ts
type ProjectAction = 'workspace' | 'audit' | 'forecast';

interface Props {
  isOpen?: boolean;
  contextType?: ChatContextType;
  entityId?: string;
  onClose?: () => void;
  autoInitProject?: {
    projectId: string;
    projectName: string;
    showActionSelector?: boolean; // default true — show the action screen first
    initialAction?: ProjectAction; // if provided and selector is hidden, go straight into this mode
  };
}
```

### Auto-init rules

- Auto-init runs when the modal opens with `autoInitProject` present and the user has not dismissed the project preset. Closing the modal or switching to a different project ID re-enables auto-init.
- Auto-init flow:
  - Reset conversation/state (no preserved context).
  - Set selected context/entity from the project.
  - Default focus to project-wide for all project-like contexts.
  - Skip the generic context selector (`showContextSelection = false`).
  - If `showActionSelector` is true **and** no `initialAction` is provided, show the project action selector; otherwise, immediately set the chosen action context.
- If the user presses “Change context” to go back to the generic selector, mark the preset as dismissed so it is not re-applied until the modal is reopened or the project changes.

### Project context handling

- Treat `project`, `project_audit`, and `project_forecast` as “project-like” contexts:
  - Share default project-wide focus and focus selector support.
  - Keep the ProjectFocus indicator usable across these contexts.
  - Context shifts to any of these types should hydrate `projectFocus` with a project-wide default.

### ProjectActionSelector component

- New component `ProjectActionSelector.svelte`.
- Props:
  - `projectId: string`
  - `projectName: string`
  - `onSelectAction(action: ProjectAction): void`
  - `onBack(): void`
  - `onOpenFocusSelector(): void`
- UX:
  - Card-style buttons for workspace/audit/forecast with concise copy and icons.
  - “Focus on specific task/goal/plan” link that opens the existing `ProjectFocusSelector`.
  - Includes a back affordance to return to the general context selector.
  - Responsive + dark-mode friendly.

### AgentChatModal integration

- New state: `showProjectActionSelector`, `autoInitDismissed`, `lastAutoInitProjectId`.
- Derived helper: `isProjectContext` to cover project/audit/forecast.
- Initialization effect:
  - When `isOpen && autoInitProject && !autoInitDismissed`, set project context, clear conversation, hide generic selector, and either show the action selector or apply the initial action directly.
- Action handling:
  - Selecting an action maps to context types (`workspace -> project`, `audit -> project_audit`, `forecast -> project_forecast`), updates labels, resets conversation, hides the selector, and applies project-wide focus by default.
  - Back from the action selector returns to the generic context selection using `resetConversation({ preserveContext: false })`.
- UI branch:
  - When `showProjectActionSelector` is true, render `ProjectActionSelector` in place of the message list/automation wizard.

### Project page integration

- On `/ontology/projects/[id]/+page.svelte`:
  - Add a CTA to open the agent chat modal.
  - Mount `AgentChatModal` with `autoInitProject` populated from the current project and `contextType="project"` / `entityId=project.id`.
  - Default `showActionSelector` to true so the action screen is the first view for project launches.

## Implementation Checklist

- [x] Add `autoInitProject` prop and types to `AgentChatModal`.
- [x] Treat project/audit/forecast as project-like for focus defaults and UI.
- [x] Add `ProjectActionSelector.svelte` with desktop/mobile + dark-mode styles.
- [x] Wire auto-init effect + dismissal guard + action handling in `AgentChatModal`.
- [x] Render action selector branch in the modal body with back navigation to the generic selector.
- [x] Integrate `/ontology/projects/[id]` page with CTA + `AgentChatModal` props.
- [ ] Exercise back-navigation: selector → context picker, context picker → selector, selector → chat.
- [ ] Verify streaming still receives correct `context_type`, `entity_id`, and `projectFocus`.
- [ ] Update docs as code ships.

## Testing Scenarios

1. **Auto-init happy path**
   - Open chat from `/ontology/projects/[id]`.
   - Generic selector is skipped; project action selector is shown.
2. **Action selection**
   - Choose workspace/audit/forecast and confirm the header + context badge reflects the right type and project name.
   - Send a message; verify `context_type`/`entity_id` are set.
3. **Focus entry**
   - From the action selector, open the focus selector and pick a task/goal/plan; verify focus indicator updates.
4. **Back navigation**
   - Back from action selector → generic selector.
   - Change context to global, then reopen modal; auto-init should reapply for the project.
5. **Switching projects**
   - Navigate to a different ontology project and open chat; auto-init should hydrate the new project context.
6. **Close/reopen**
   - Close the modal mid-chat and reopen; project preset should reapply and not flash the generic selector.

## Progress Log

### 2025-11-20: Spec refreshed for auto-init implementation

- ✅ Clarified prop surface and project-like context handling
- ✅ Added auto-init dismissal rules
- ✅ Defined `ProjectActionSelector` UX requirements
- ✅ Documented `/ontology/projects/[id]` integration path
