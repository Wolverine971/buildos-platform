<!-- docs/user-guide/features/calendar-sync.md -->

﻿# Calendar Sync Setup

Connecting Google Calendar gives BuildOS real-time context for what is already on your schedule so the AI can propose realistic plans, fill gaps with TimeBlocks, and warn you about conflicts before they happen. This guide shows how to connect, what data is synced, and how to get the most from the scheduling UI.

---

## Why connect your calendar?

- **Calendar Analysis modal** can mine the last 90 days of events and turn recurring meetings into tracked projects.
- **Phase Scheduling modal** overlays existing events (gray), AI proposals (blue), and conflicts (amber) in Day/Week/Month views so you can drag tasks to realistic slots.
- **TimeBlock experiments** reuse the same free/busy detection plus your working-hours preferences to suggest deep work windows automatically.

---

## 1. Connect Google Calendar

1. Go to **Settings -> Integrations -> Calendar** or click **"Use my calendar"** during onboarding.
2. Select **Connect Google Calendar**. You will be redirected to the Google OAuth consent screen requesting:
    - `calendar.readonly` for event ingestion and free/busy checks
    - `calendar.events` for optional write access (creating slots directly from BuildOS)
3. Approve the scopes. You will return to BuildOS at `/auth/google/register-callback` and the UI will confirm the link.
4. Pick which calendars to include (primary only, or any shared calendars you own). Choices are stored in `user_calendar_preferences`.
5. Optional: enable **real-time updates**. This turns on Google push notifications so new events propagate without waiting for the hourly refresh.

> **Security:** Tokens are stored encrypted through Supabase, refreshed automatically, and can be revoked at any time from both Google Security Center and BuildOS Settings.

---

## 2. What gets synchronized

- **Events:** Title, start/end, attendees, and the native `htmlLink` so you can open the original invite.
- **Free/busy windows:** BuildOS calls Google's FreeBusy API to find gaps in increments as small as 30 minutes.
- **Working hours and timezone:** Stored per user and used by `TaskTimeSlotFinder` to keep proposals inside your day.
- **Manual overrides:** When you edit a scheduled task in BuildOS, the system tracks those overrides separately so AI suggestions do not overwrite them.

The sync currently pulls the upcoming seven days by default. You can extend to 30 days in Settings if you rely on long-range planning.

---

## 3. Using calendar data inside BuildOS

### Calendar Analysis (Projects capture)

- Open the analysis modal from onboarding or the Projects page to auto-create projects from existing events.
- BuildOS highlights recurring meetings, travel, or prep sessions and lets you accept or reject each suggested project.

### Phase Scheduling Modal

- Access from any Project -> Phase -> "Schedule with AI".
- Tabs for **Day**, **Week**, and **Month** views reuse the `CalendarView.svelte` component:
    - Existing events: light gray cards
    - AI proposals: blue cards
    - Conflicts: amber with warning icon
- Click any suggestion to expand the editable `TaskScheduleItem` form where you can adjust start time (datetime input) and duration (15-480 minutes). The UI recalculates the end time immediately.

### TimeBlock experiments

- When enabled, TimeBlocks reuse the same gap detection plus the energy labels you give tasks. BuildOS recommends the best task for each empty slot and explains why (for example, "Deep work fits your 9-11 AM peak block").

---

## 4. Manage working hours, timezone, and preferences

Open **Settings -> Calendar** to adjust:

- **Timezone** (IANA strings such as `America/Los_Angeles`).
- **Workday start/end** to keep suggestions inside your preferred hours.
- **Days of week** that should be considered for scheduling.
- **Default slot duration** used by TimeBlock suggestions.

These values populate the `user_calendar_preferences` table and are referenced everywhere scheduling logic runs.

---

## 5. Disconnect or re-authorize

1. Go to **Settings -> Integrations -> Calendar**.
2. Click **Disconnect** to revoke tokens locally (they are deleted immediately).
3. If Google revoked your token (common after password resets), press **Reconnect**; you will be sent through the OAuth flow again and BuildOS will resume syncing without losing preferences.

---

## 6. Troubleshooting

- **Events do not appear.** Confirm the correct calendars are selected and that the time range covers the dates you expect. The "Refresh now" button forces a sync outside the hourly schedule.
- **"Authorization error" banner.** Google rejected the last API call. Reconnect to refresh the access token.
- **Scheduling suggestions ignore my working hours.** Double-check your timezone and work hours; TaskTimeSlotFinder strictly follows those values.
- **Conflicts always show even after I move a meeting.** If the meeting moved on Google but BuildOS still highlights the old slot, manually refresh or wait for webhook delivery (up to 60 seconds).

Calendar sync is the backbone of AI scheduling in BuildOS. Keep it connected to unlock precise Phase planning, accurate TimeBlock recommendations, and smarter daily brief suggestions.
