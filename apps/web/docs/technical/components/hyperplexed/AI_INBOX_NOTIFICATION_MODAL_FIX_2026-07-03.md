<!-- apps/web/docs/technical/components/hyperplexed/AI_INBOX_NOTIFICATION_MODAL_FIX_2026-07-03.md -->

# AI Inbox Notification Modal Fix — 2026-07-03

## Scope

This pass covers the project-loop notification stack and the AI inbox proposal surfaces that can hand off into Agentic Chat:

- `NotificationStack.svelte` and `MinimizedNotification.svelte`
- `AgentRunModalContent.svelte`
- `ChangeSetReview.svelte`
- `ChangeSetFailureSummary.svelte`
- `ProjectSynthesisModalContent.svelte`
- `DashboardInboxModal.svelte`
- `InboxDecisionControls.svelte`

The fix is a focused behavior and responsive-polish pass, not a full dashboard-inbox content audit.

## Problems Fixed

1. **Chat opened by collapsing the review modal.** The agent-run notification modal called `handleMinimize()` after dispatching `buildos:open-agent-chat`, so moving into chat removed the review context the user expected to keep open.
2. **Failed apply implicitly opened chat.** `ChangeSetReview.apply()` called `onChat()` when the commit API returned failed changes. That made Chat feel automatic instead of user-controlled.
3. **Accept/Dismiss did not share a clear modal-resolution contract.** The notification proposal review did not dismiss the notification after a commit path, while the user expectation is that Accept or Dismiss resolves the review item.
4. **Mobile modal chrome was not following the app modal standard.** Agent-run, project-synthesis, and dashboard-inbox modals were centered desktop-style at phone width instead of using the base modal bottom-sheet behavior.
5. **Notification stack and action controls could overflow on phones.** The minimized card kept a fixed mobile min-width and several action rows used raw compact buttons instead of the 44px `Button` primitive.

## Behavior Now

### Notification Review To Chat

`AgentRunModalContent.handleOpenChat()` still prepares or restores the shared agent-run chat session, then dispatches:

```ts
new CustomEvent('buildos:open-agent-chat', {
	detail: {
		sessionId,
		contextType,
		entityId,
		projectId,
		source: 'agent_run',
		runId
	}
});
```

It no longer calls `handleMinimize()`. The global navigation listener owns the chat modal:

- `Navigation.svelte` listens for `buildos:open-agent-chat`.
- `handleOpenAgentChatEvent()` sets the initial chat session/context and opens `AgentChatModal`.
- `handleChatClose()` only closes the chat modal and resets chat state.

Result: clicking Chat stacks the Agentic Chat modal above the notification review modal. Closing Chat leaves the review modal open underneath.

### Accept, Dismiss, And Failed Apply

`AgentRunModalContent` now passes `onApplied={handleDismiss}` into `ChangeSetReview`, and the proposal labels are normalized to user-facing language:

- per-change buttons: `Accept` / `Dismiss`
- all-changes buttons: `Accept all` / `Dismiss all`
- final button: `Accept N changes` or `Dismiss changes`

`ChangeSetReview.apply()` now has this contract:

- non-OK commit response: show an error toast and keep the review open
- OK commit response with failed changes: show a warning toast that tells the user to use Chat for follow-up, call `onApplied`, and do not call `onChat`
- OK commit response with applied changes: broadcast `notifyDataMutation(...)`, call `onApplied`, and do not call `onChat`

Result: Accept/Dismiss resolves the review item. Chat only opens from an explicit Chat button.

### Dashboard AI Inbox

`DashboardInboxModal` already had an embedded chat flow. This pass leaves that architecture intact:

- dashboard item Chat creates or loads an inbox chat session
- closing chat does not close the AI Inbox modal
- explicit chat resolution actions remain in `inboxResolutionActions` as `Mark handled` and `Dismiss`
- if chat closes with mutation summary changes, `resolve-from-chat` can still remove the inbox item

The modal shell now uses the base `Modal` `bottom-sheet` variant and a phone-safe height wrapper.

## UI Standards Applied

This pass follows the current Hyperplexed/Inkprint docs:

- `HYPERPLEXED_FIX_PATTERNS.md`
    - P1 overflow-safe rows: notification stack and mobile action rows avoid fixed mobile overflow.
    - P2 two-radius rule: large modal panels use `rounded-lg`; compact controls use primitives or `rounded-md`.
    - P5 `.micro-label`: metadata headers no longer repeat hand-rolled uppercase tracking stacks.
    - P9 one icon set: lucide imports now route through `$lib/icons/lucide`.
    - P13 control primitives: primary Accept/Dismiss/Chat/Retry/Refresh controls use `ui/Button.svelte`.
- `INKPRINT_DESIGN_SYSTEM.md`
    - base `Modal` remains the modal shell so `tx tx-frame tx-weak`, `wt-plate`, stack-aware Escape handling, focus/inert handling, `dvh`, and safe-area behavior stay centralized.
    - `ui/Button.svelte` provides 44px tap targets, focus rings, and reduced-motion loading state.

## Verification

Automated checks run for the implementation pass:

- `apps/web`: `./node_modules/.bin/vitest run src/lib/components/notifications/types/agent-run/AgentRunModalContent.test.ts src/lib/components/notifications/types/agent-run/ChangeSetReview.test.ts` — passed
- `apps/web`: `./node_modules/.bin/svelte-kit sync` — passed
- `apps/web`: `NODE_OPTIONS='--max-old-space-size=8192' ./node_modules/.bin/svelte-check` — 0 errors, 0 warnings
- repo root: `git diff --check` on touched files — passed

Focused browser fixture checks were also run because the authenticated inbox state was not available in the local browser:

- desktop: Chat opened the global Agentic Chat modal above the agent-run review modal; closing Chat left the review modal open
- desktop: clicking Accept dismissed the review modal and did not open Chat
- mobile 390px: agent-run review rendered as a bottom sheet with stacked full-width controls and no horizontal body overflow
- mobile 390px: project-synthesis modal used a bottom sheet and safe-area footer spacing
- mobile 390px: minimized notification stack fit inside the viewport with no body horizontal overflow
- the temporary fixture route was removed after verification

## Self-Review Notes

No blocking issue was found in the staged code review. The key intentional behavior change is that a partially failed commit no longer opens Chat automatically; it now dismisses via `onApplied` and points the user to explicit Chat in the warning toast. That matches the requested contract, but the next reviewer should confirm the product decision against real failed-commit data.

Remaining review/QA items:

- Run an authenticated smoke test against real inbox/project-loop data, not only the local fixture.
- Capture light-mode screenshots. The completed visual fixture pass covered desktop and iPhone-width behavior, but the observed browser theme was dark.
- Consider a later full `DashboardInboxModal` content audit. This pass fixed modal chrome, height, refresh/retry controls, and shared decision controls, but did not normalize every inherited small text or dense content block inside the dashboard inbox.
