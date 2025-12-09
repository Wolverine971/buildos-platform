---
date: 2025-10-23T19:00:00-08:00
researcher: Claude
git_commit: 22a885a6
branch: main
repository: buildos-platform
topic: 'Calendar Connection Overlay for Time-Blocks Page'
tags: [research, feature-spec, calendar-integration, time-blocks, ui-design]
status: complete
last_updated: 2025-10-23
last_updated_by: Claude
path: thoughts/shared/research/2025-10-23_19-00-00_calendar-connection-overlay-spec.md
---

# Feature Specification: Calendar Connection Overlay for Time-Blocks

**Date**: 2025-10-23T19:00:00-08:00
**Researcher**: Claude
**Git Commit**: 22a885a6
**Branch**: main
**Repository**: buildos-platform

## Executive Summary

Design and implement an elegant, Apple-inspired blocking overlay for the time-blocks page that prevents usage until Google Calendar is connected, while maintaining BuildOS design standards.

## Problem Statement

The time-blocks feature requires Google Calendar integration to function properly (for syncing time blocks to calendar, fetching existing events, and calculating available slots). Currently, users without a connected calendar see only a small warning banner that can be easily overlooked, leading to confusion when features don't work as expected.

## Solution Overview

Implement a sophisticated blocking overlay that:

1. Clearly communicates the requirement for calendar connection
2. Prevents interaction with the time-blocks page until connected
3. Provides a seamless, one-click path to connect calendar
4. Maintains navigation ability (users can leave the page)
5. Follows Apple's design philosophy with BuildOS styling

## Design Specification

### Visual Design

#### Layout Structure

```
┌────────────────────────────────────────────┐
│                                            │
│     [Soft backdrop blur - 8px]            │
│                                            │
│        ┌──────────────────────┐           │
│        │                      │           │
│        │    [Calendar Icon]   │           │
│        │       72x72px        │           │
│        │                      │           │
│        │  Connect Calendar    │           │
│        │  Required           │           │
│        │                      │           │
│        │  [Description text]  │           │
│        │                      │           │
│        │  ┌──────────────┐   │           │
│        │  │ Connect Now  │   │           │
│        │  └──────────────┘   │           │
│        │                      │           │
│        └──────────────────────┘           │
│                                            │
└────────────────────────────────────────────┘
```

#### Component Hierarchy

- **Overlay Container**: Full screen, fixed position, z-50
- **Backdrop**: Semi-transparent with glass morphism effect
- **Content Card**: Centered modal with subtle shadow and border
- **Icon Container**: Soft gradient background circle
- **Text Stack**: Title, subtitle, description
- **CTA Button**: Primary action with subtle animation

### Design Tokens

#### Colors

- **Backdrop**: `bg-white/40 dark:bg-black/40 backdrop-blur-lg`
- **Card Background**: `bg-white dark:bg-gray-900`
- **Card Border**: `border border-gray-200 dark:border-gray-800`
- **Icon Background**: `bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950`
- **Icon Color**: `text-blue-600 dark:text-blue-400`
- **Title**: `text-gray-900 dark:text-white`
- **Description**: `text-gray-600 dark:text-gray-400`
- **Button**: Blue gradient from BuildOS button styles

#### Typography

- **Title**: `text-2xl font-semibold tracking-tight`
- **Subtitle**: `text-lg text-gray-700 dark:text-gray-300`
- **Description**: `text-base text-gray-600 dark:text-gray-400`
- **Button**: `text-base font-medium`

#### Spacing

- **Card Padding**: `p-8 sm:p-10 lg:p-12`
- **Element Gaps**: `space-y-6`
- **Button Padding**: `px-6 py-3`

#### Animations

- **Backdrop fade-in**: 200ms ease-out, opacity 0→1
- **Card entrance**: 300ms ease-out, scale 0.95→1 + opacity 0→1
- **Button hover**: 150ms ease-out, subtle scale 1→1.02
- **Icon pulse**: Subtle 2s infinite pulse animation

### Component Structure

```svelte
<!-- CalendarConnectionOverlay.svelte -->
<div class="overlay-container">
	<div class="backdrop" />
	<div class="content-card">
		<div class="icon-container">
			<CalendarIcon />
		</div>
		<div class="text-stack">
			<h2>Calendar Connection Required</h2>
			<p class="subtitle">Connect your Google Calendar to use time blocks</p>
			<p class="description">
				Time blocks sync with your calendar to help you protect deep work time and see your
				full schedule in one place.
			</p>
		</div>
		<div class="actions">
			<Button variant="primary" on:click={connectCalendar}>Connect Google Calendar</Button>
			<p class="helper-text">Takes 30 seconds • We never read your private events</p>
		</div>
	</div>
</div>
```

### Interaction Design

#### States

1. **Initial Load**: Overlay fades in smoothly if calendar not connected
2. **Hover State**: Button scales slightly, cursor changes
3. **Loading State**: Button shows spinner during OAuth redirect
4. **Success State**: Overlay fades out, page becomes interactive
5. **Error State**: Shows inline error message if connection fails

#### User Flow

1. User visits `/time-blocks` without calendar connected
2. Overlay appears with smooth animation
3. User clicks "Connect Google Calendar"
4. OAuth flow initiates (redirect to Google)
5. User grants permissions and returns
6. Overlay automatically disappears
7. Time-blocks page is now fully functional

#### Accessibility

- **Focus Management**: Auto-focus on Connect button
- **Keyboard Navigation**: Tab cycles through interactive elements
- **Screen Readers**: Proper ARIA labels and role="dialog"
- **Escape Key**: Does NOT close (intentionally blocking)
- **Mobile**: Full-height sheet with safe area support

### Implementation Details

#### Files to Create

1. `/apps/web/src/lib/components/calendar/CalendarConnectionOverlay.svelte`

#### Files to Modify

1. `/apps/web/src/routes/time-blocks/+page.svelte` - Add overlay component
2. `/apps/web/src/routes/time-blocks/+page.server.ts` - Already checks connection status

#### Key Implementation Points

- Use existing `isCalendarConnected` prop from server load
- Leverage `Modal.svelte` patterns but make non-dismissible
- Reuse calendar connection logic from `CalendarTab.svelte`
- Add smooth transitions matching BuildOS patterns
- Handle OAuth redirect with loading state
- Auto-refresh on successful connection

### Technical Implementation

#### Data Flow

```typescript
// +page.server.ts (existing)
const isCalendarConnected = await calendarService.hasValidConnection(user.id);

// +page.svelte
{#if !data.isCalendarConnected}
  <CalendarConnectionOverlay />
{/if}
```

#### OAuth Connection

```typescript
// Reuse from CalendarTab.svelte
async function connectCalendar() {
	isConnecting = true;
	const response = await fetch('/profile/calendar', {
		method: 'POST',
		body: JSON.stringify({ redirect_path: '/time-blocks' })
	});
	const { authUrl } = await response.json();
	window.location.href = authUrl;
}
```

### Success Metrics

- Zero user confusion about calendar requirement
- 90%+ connection rate when visiting time-blocks
- Smooth, delightful connection experience
- No accessibility issues
- Mobile-friendly implementation

### Design Inspiration

- Apple's iOS permission prompts (clean, centered, minimal)
- Notion's workspace setup flow (progressive disclosure)
- Linear's onboarding overlays (subtle animations)
- BuildOS's existing modal patterns (consistency)

### Edge Cases

1. **OAuth Failure**: Show error message with retry button
2. **Already Connected**: Never show overlay
3. **Connection Lost**: Re-show overlay if tokens expire
4. **Mobile Safari**: Handle safe areas properly
5. **Slow Networks**: Show loading state during OAuth

## Next Steps

1. Implement CalendarConnectionOverlay component
2. Integrate into time-blocks page
3. Test OAuth flow end-to-end
4. Verify mobile responsiveness
5. Add analytics tracking for conversion
