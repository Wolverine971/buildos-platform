# Getting Started with BuildOS

BuildOS launches every new account into an onboarding flow that captures your priorities, syncs the right data sources, and enables accountability loops in under five minutes. This guide explains every step, the data that is stored, and how to restart or skip parts of the flow.

---

## 1. Before You Sign Up

- **Device:** Desktop Chrome or Edge is required for the guided experience (mobile read-only works but lacks voice input).
- **Google account:** Needed if you plan to sync calendar data during onboarding.
- **Phone number (optional):** Required only if you want SMS nudges or daily text recaps.

### Account creation options

| Method           | Where it happens       | What to expect                                                                                                       |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Email + password | `/auth/register`       | Strong-password check, optional name field, and immediate redirect to the app if email confirmation is not required. |
| Google OAuth     | Same UI, Google button | Uses the Google consent screen, then returns to `/auth/google/register-callback` before redirecting into the app.    |

Behind the scenes both paths create a Supabase Auth user, insert a matching `public.users` row, and trigger `handle_new_user_trial()` which starts your 14 day trial and flags the account for onboarding by appending `?onboarding=true` to the first redirect.

---

## 2. Guided Onboarding Flow

The onboarding modal appears on the homepage until you finish or skip each segment. Progress auto-saves every roughly 1.5 seconds in `user_context`, so you can close the tab at any point and resume from the same step.

| Step                      | What you do                                                                                    | What BuildOS configures                                                                            | Status      |
| ------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------- |
| Welcome                   | Review how brain dumps, calendar sync, and reminders work; start the flow.                     | Flags `onboarding_v2_started` and captures skipped steps for analytics.                            | Live        |
| Capture work              | Brain dump current projects, optionally import from Calendar, and let AI auto-create projects. | Auto-accepts brain dump output into Projects + Phases, stores examples for future reference.       | Live        |
| Notifications             | Verify a phone number, toggle SMS reminders, and pick email daily brief settings.              | Writes to `/api/sms/preferences` and `/api/brief-preferences`, enables SMS webhooks when verified. | Live        |
| Archetypes and challenges | Select archetype, top blockers, and focus areas (guides prompt tuning).                        | Populates `onboarding_archetypes` plus `productivity_challenges`.                                  | Rolling out |
| Summary and finish        | Review what was created, connect missing integrations, and jump into the dashboard.            | Marks `completed_onboarding_at`, clears modal flag.                                                | Planned     |

### Step-by-step detail

1. **Welcome screen**
    - Highlights brain dump, calendar sync, and smart reminders.
    - "Start Setting Up" drops you into the capture step without leaving the modal.

2. **Capture current projects**
    - Speak or paste a detailed brain dump (20+ characters required to run).
    - Auto-accept mode immediately creates projects and phases without the manual review queue.
    - "Use my calendar" opens the Calendar Analysis modal so you can mine existing events for projects before you have even connected anything else.

3. **Notification preferences**
    - Phone verification uses `smsService.verifyPhoneNumber()` and a six-digit confirmation; once verified we enable Morning Kickoff plus Event Reminders by default.
    - Email toggles call `/api/brief-preferences` (see [Daily Briefs](features/daily-briefs.md) for details). You can revisit both choices later from Settings -> Notifications.

4. **(Upcoming) Archetypes and challenges**
    - Coming releases add archetype selection, productivity challenges, and a summary step. These are already scaffolded in `onboarding-v2.service.ts`; you might see placeholders if you are on the beta channel.

### Auto-save and resume rules

- You can dismiss the modal, but it reappears on `/` until either every required field is complete or `onboarding_v2_force_skip` is toggled.
- Users who close the modal before 25 percent progress keep seeing it on login; once you cross that threshold you only see it after updates (for example, when the notifications step ships new options).

---

## 3. After Onboarding

1. **Connect Google Calendar** - follow [Calendar Sync Setup](features/calendar-sync.md) to pull events, enable free/busy lookups, and unlock the Phase Scheduling modal.
2. **Schedule your first Daily Brief** - see [Daily Briefs Configuration](features/daily-briefs.md) to pick time-of-day, timezone, and delivery channels.
3. **Drop a voice brain dump** - start in `/brain-dump`, enable auto-accept if you liked the onboarding experience, and keep training BuildOS with more context.

---

## 4. Troubleshooting and FAQs

- **Onboarding modal keeps re-opening.** Make sure every text area has content and you clicked "Save & Continue." You can confirm completion by checking Settings -> Account -> Onboarding progress.
- **SMS verification never arrives.** Double-check that your number includes the country code; the verification service rejects numbers shorter than 10 digits.
- **Google OAuth loops back to the register page.** This happens if Google blocks consent or the callback fails; refresh, ensure you allow the requested scopes, or fall back to email sign-up.
- **Need to restart onboarding.** Contact support via the in-app chat and ask them to reset `completed_onboarding_at` for your user ID; the modal will appear again on your next login.

Once these steps are complete you have the full BuildOS workspace: projects seeded from your own data, calendar-aware scheduling, and proactive notifications tuned to your preferences.
