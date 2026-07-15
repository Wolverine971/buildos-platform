<!-- apps/web/docs/technical/components/hyperplexed/AGENT_WORK_DISPLAY_AUDIT_2026-07-14.md -->

# Agent Work and Notification Clarity Audit — 2026-07-14

## Scope

This follow-up starts from the richer bottom-right AI Inbox card and scans the adjacent places where
the same work becomes harder to understand again. The surface inventory is:

1. Minimized notification stack and expanded agent-work detail.
2. Agent chat run dock and the global Work panel.
3. Parked-chat notification cards.
4. Customer `/notifications` history.
5. Agent-work dispatch and automation editor terminology.
6. Legacy AI Inbox card families and the project-page inbox panel.

The product-level content contract is the same everywhere: identify the project or workspace, say
what BuildOS is doing in plain language, identify the target when one exists, give one useful preview,
and make the next action obvious.

## Tier 1 — approved for this pass

### T1-1 — Expanded agent work loses the useful card context (P4, P6, P20)

`AgentRunModalContent.svelte` falls back to the raw run label, trigger, and scope after the user opens
a detailed notification. Reuse the normalized project/action/entity/target preview contract, replace
technical trigger and scope values with plain-language source/access labels, and keep project context
visible in the header.

### T1-2 — Work panel and in-chat run dock expose internal lifecycle language (P4, P6, P20)

`WorkPanel.svelte` and `AgentRunDock.svelte` emphasize `run.label`, `run.goal`, and status mechanics.
Show project, action, target, preview, and a friendly status instead. Rename customer-facing “Runs,”
“Operatives,” “Dispatch,” “Scope,” and “Stage writes” language to “Recent work,” “Automations,”
“Start work,” “Access,” and “Ask before applying.”

### T1-3 — Notification overflow is visible but cannot be opened (P4, P13)

`NotificationStack.svelte` renders “+N more” as a non-interactive `div`, leaving older notifications
unreachable to pointer and keyboard users. Make overflow a real 44 px control that reveals the older
cards and can collapse back to the newest notifications.

### T1-4 — Parked chats omit context and nest interactive controls (P4, P6, P13)

The parked-chat payload and card do not preserve a project/workspace label. The dismiss button also
sits inside the outer notification’s button-like wrapper. Carry context into the payload and render
separate, labeled 44 px Open and End chat controls inside a semantic group.

### T1-5 — Customer notification history leaks delivery telemetry (P4, P6, P20)

`/notifications` exposes raw links/UUIDs, provider channel state, attempts, opened timestamps, and
raw delivery failures. Center the history on what happened, where it happened, when it happened, and
the action to take. Keep provider/debug telemetry out of the customer card and use a safe fallback for
unknown event types.

## Tier 2 — shipped 2026-07-14

1. Create one shared content contract for legacy project-synthesis, time-block, and calendar-event
   minimized cards; fix the project-synthesis spacing drift at the same time. (P2, P4, P5, P6)
2. Bring `ProjectInboxPanel.svelte` back to parity with the dashboard inbox: 44 px controls,
   reduced-motion gating, friendly failure states, consistent micro-labels, and bounded overflow.
   (P1, P5, P6, P11, P13)
3. Progressive-disclose advanced scheduling, timezone, model, and write-policy options in the agent
   dispatch and automation forms. (P4, P7, P8)
4. Replace the remaining hand-rolled Work panel overlay with the shared modal/drawer accessibility
   contract: focus trap, Escape close, scroll lock, focus restore, and inert background. (P13)

## Tier 3 — shipped 2026-07-15

1. Route remaining touched-surface icons through `$lib/icons/lucide` and remove decorative motion when
   reduced motion is requested. (P9, P11)
2. Normalize radius, micro-type, and compact icon-button treatment across older notification families.
   (P2, P5)
3. Harden legacy modal states: accessible names for custom-header dialogs, accurate terminal-state
   headings, one non-duplicated status message, and semantic percentage progress. (P4, P6, P13)

## Implementation status

- Tier 1: shipped. Expanded details, Work panel, in-chat dock, parked-chat cards, notification
  overflow, fallback close behavior, customer notification history, and user-facing agent-work
  terminology now follow the same project/action/target/preview contract.
- Tier 2: shipped. Legacy project-synthesis, time-block, calendar-analysis, and agent-run cards now
  render through one shared context/action/target/preview contract; project synthesis has consistent
  padding and reduced-motion progress. The project inbox now matches the dashboard's 44 px control,
  micro-label, friendly-error, reduced-motion, and overflow behavior. Dispatch and automation forms
  collapse access policy, instructions, expected output, and timezone behind visible summaries;
  existing non-default automation settings auto-expand. The current forms have no model selector, so
  this pass did not invent one. The Work panel now uses the shared modal stack for focus trapping,
  Escape, scroll lock, focus restoration, background inerting, and nested dialogs.
- Tier 3: shipped. Remaining touched-surface icons use the wrapper; continuous motion and transitions
  respect reduced motion; notification radii, micro-type, fixed icon boxes, focus rings, and 44 px
  controls follow the Inkprint recipes. The self-review also fixed unnamed custom-header dialogs,
  contradictory project-synthesis failure copy, duplicate time-block status content, and percentage
  progress semantics.
- Verification: 46 focused tests pass across 15 suites; full web `svelte-check` reports 0 errors and
  0 warnings; touched-file ESLint, Lucide wrapper guardrails, targeted Prettier, diff checks, and the
  Tier 3 inconsistency scan are clean. The external Svelte autofixer was not rerun for Tier 3 because
  it requires transmitting local component source; the safe local verification path was used instead.
- Verification owed: authenticated desktop and phone light/dark screenshots for the Work panel,
  expanded agent work, parked chat, project inbox, legacy cards, forms, and notification history.
  The 2026-07-14 regression pass tried both available local browser sessions, but neither had an
  authenticated BuildOS session.
