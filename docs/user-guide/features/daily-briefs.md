<!-- docs/user-guide/features/daily-briefs.md -->

﻿# Daily Briefs Configuration

Daily Briefs turn everything BuildOS knows about your projects, calendar, and brain dumps into a concise morning or evening plan. The worker service generates each brief, queues follow-up emails or SMS, and respects the preferences you set in the app. Use this guide to configure delivery, understand timing, and troubleshoot missed briefs.

---

## 1. How Daily Briefs work

1. **Scheduler** (`/apps/worker/src/scheduler.ts`) runs every hour.
2. It reads `user_brief_preferences` to find users who opted in (`is_active = true`) and whose chosen time falls within the upcoming hour in their timezone.
3. Each match becomes a Supabase queue job (`queue_jobs` table) with a deduplication key of `brief-{userId}-{briefDate}` to prevent duplicates.
4. The `briefWorker` generates your brief, stores it in `daily_briefs`, and instantly notifies the app UI through `notifyUser()`.
5. If `email_daily_brief = true`, a second job (`generate_brief_email`) renders the email and sends it via the email worker. SMS delivery uses the same pattern for `sms_daily_brief`.

Because everything is transactional, pausing or changing preferences immediately affects the next scheduler run.

---

## 2. Enable and customize Daily Briefs

1. Navigate to **Settings -> Notifications -> Daily Briefs**.
2. Toggle **Keep me updated** to enable or disable `is_active`.
3. Pick your **time of day** (HH:MM). The UI stores it as `time_of_day` in 24 hour format.
4. Confirm your **timezone**. BuildOS uses IANA strings (for example `America/New_York`) to make sure "8 AM" means the correct local hour even when you travel.
5. Choose a **frequency**:
    - **Daily** - every day
    - **Weekdays** - Monday through Friday
    - **Custom** - specify exact days
6. Decide on **delivery channels**:
    - **In-app** (always on when `is_active = true`)
    - **Email**: toggle "Email me the brief" to set `email_daily_brief = true`
    - **SMS** (optional beta): requires a verified phone number from onboarding; turns on `sms_daily_brief`

Changes save instantly through `/api/brief-preferences` and trigger any necessary re-scheduling (existing jobs are cancelled if you pause or move the time).

---

## 3. What goes into your brief

Daily Briefs combine:

- Projects and phases created through brain dumps or manual entry
- Calendar events synced via Google Calendar
- Outstanding tasks, completions, and overdue work
- Recent AI insights (for example, phase synthesis or time block experiments)

If you want richer briefs, make sure to:

- Capture detailed brain dumps with auto-accept enabled
- Finish onboarding notification settings so BuildOS knows how to reach you
- Keep calendar sync active and define working hours (see [Calendar Sync Setup](calendar-sync.md))

---

## 4. Pause, resume, or delete schedules

- **Pause:** Toggle "Keep me updated" off. Scheduler drops you immediately (`is_active = false`) and any pending queue jobs are cancelled.
- **Resume:** Turn it back on, choose a time, and the next hourly cron run will schedule your first job.
- **Delete:** Use the "Disable and forget preferences" action to clear your `user_brief_preferences` row if you want to remove all stored data.

---

## 5. Troubleshooting

| Symptom                                 | What to check                                                                                                                                                                                                  | Fix                                                                                             |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| No brief arrived at the scheduled time  | Verify `is_active` is still on and that your timezone is correct. Remember the cron checks hourly, so allow up to 60 minutes.                                                                                  | Toggle off/on to force re-scheduling or hit "Send test brief" if available.                     |
| In-app badge shows a brief but no email | Confirm "Email me the brief" is enabled and that your email address in Profile is valid. Email jobs re-check `email_daily_brief` right before sending, so a recently disabled toggle stops delivery instantly. | Re-enable the toggle and wait for the next run, or trigger a resend from the brief detail page. |
| Duplicate briefs                        | Usually caused by manually changing time multiple times within the same hour. Check the history tab; if the same date is listed twice, report it so we can inspect `queue_jobs`.                               | Contact support; dedup keys should prevent this, so it may signal a bug.                        |
| SMS reminder missing                    | Ensure your phone number is verified (Settings -> Notifications -> SMS). The SMS worker skips delivery if verification failed or if you disabled a specific SMS type such as "Morning Kickoff."                | Re-verify your number and re-save preferences.                                                  |

---

## 6. Where to see past briefs

- **Timeline tab:** Access the "Daily Briefs" section to review, share, or regenerate previous briefs stored in `daily_briefs`.
- **Inbox notifications:** Clearing the in-app notification does not delete the brief itself; it simply marks the alert as read.

Daily Briefs work best when paired with calendar sync and consistent brain dumps. Configure all three and you will receive actionable plans that reflect reality every morning.
