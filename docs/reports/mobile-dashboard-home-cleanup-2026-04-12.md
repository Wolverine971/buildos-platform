<!-- docs/reports/mobile-dashboard-home-cleanup-2026-04-12.md -->

# Mobile Dashboard Home Cleanup

Date: 2026-04-12
Status: Implemented
Scope: Logged-in mobile dashboard home page

## Current Observations

The logged-in home page is a compact command center with a sticky top navigation, greeting/action row, daily brief widget, optional overdue triage panel, active projects, shared projects, recent activity, recent chats, compact totals, and an authenticated footer.

The page already has good mobile foundations: tight spacing, single-column stacking, truncation, compact metadata, and accessible touch targets. The active project rows are the strongest part of the page because they are dense, scannable, and useful.

The main issue is visual priority. On mobile, the first screen asks the user to parse several competing actions at once: brain/chat in the nav, hamburger/onboarding indicator, dashboard refresh, calendar, and new project. Repeated texture and color variety also make the page feel busier than it needs to.

## Light-Touch Changes

These are the changes to make now:

1. Normalize dashboard color semantics.
   Replace hardcoded red, amber, sky, and emerald utility colors in the dashboard/brief widgets with semantic tokens such as destructive, warning, success, and info.

2. Simplify authenticated app footer.
   Logged-in app pages should not end with a heavy marketing-style footer. Replace the authenticated footer with a compact support/legal row while leaving the guest footer intact.

3. Rename "Batch triage."
   Use clearer user-facing language such as "Review overdue" for the overdue task action.

4. Give Daily Brief one line of value on mobile.
   On mobile, the brief card should show a short value line, such as the number of priority actions or a one-line summary.

5. Reduce texture on repeated list items.
   Keep the Inkprint texture for important panels and empty states, but remove texture from repeated project rows so the list reads calmer.

6. Convert the greeting header to a two-row mobile layout.
   On mobile, put the greeting on its own row and actions on the next row. Keep desktop compact.

7. Simplify the top action area.
   Make "New Project" the primary action and demote calendar/refresh into smaller secondary actions.

8. Avoid duplicate overdue project lists.
   Keep the overdue panel as a summary and triage entry point, then mark affected project cards with a compact "Has overdue tasks" status pill.

## Deferred Changes

These were identified but are intentionally not part of this pass:

1. Cap the mobile feed length.
   The current activity and chat feed limits can make the page long, but this changes information density and should be handled separately.

2. Larger navigation/product model changes.
   Bottom navigation, progressive onboarding suppression, and deeper first-run CTA sequencing should wait for a dedicated pass.

## Files In Scope

- `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte`
- `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte`
- `apps/web/src/lib/components/layout/Footer.svelte`

## Implementation Notes

Completed in this pass:

1. The dashboard header now stacks into a greeting row and action row on mobile.
2. The top actions now prioritize "New Project" and keep calendar/refresh secondary.
3. The overdue CTA now says "Review overdue."
4. Dashboard/brief status colors now use semantic tokens.
5. Repeated project, activity, and chat list surfaces have less texture.
6. The Daily Brief card now shows one line of value on mobile.
7. The authenticated footer is now a compact support/legal row.
8. The Daily Brief now appears before overdue task cleanup.
9. The overdue task action uses a warning/attention tint instead of a filled red/destructive button.
10. The overdue panel no longer repeats project names; active/shared project cards now show a non-clickable "Has overdue tasks" marker when batch metadata reports overdue work.
