<!-- docs/user-guide/getting-started.md -->

# Getting Started with BuildOS

BuildOS starts new accounts with a short onboarding flow and a follow-up welcome email sequence. The goal is to help you get one real brain dump into the system, finish enough setup to stay in motion, and make it easy to come back for a second session.

---

## 1. Create Your Account

- **Device:** Desktop Chrome or Edge is still the best experience for onboarding and capture.
- **Google account:** Optional, but useful if you want calendar sync.
- **Phone number:** Optional, only needed if you want SMS follow-through.

### Account creation options

| Method           | Where it happens       | What to expect                                                                                           |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------- |
| Email + password | `/auth/register`       | Strong-password check, optional name field, and immediate sign-in unless email confirmation is required. |
| Google OAuth     | Same UI, Google button | Google consent flow, then return through `/auth/google/register-callback` into the app.                  |

Behind the scenes both paths create a Supabase Auth user, insert a matching `public.users` row, and start the 14 day trial. That same account-creation event also starts the welcome email sequence.

### Welcome emails

- Email 1 sends immediately after account creation.
- Later emails only send if they still match your product state.
- The sequence looks at whether you created a first project, finished onboarding, enabled a daily brief or SMS, connected calendar, and came back for another session.

---

## 2. Complete Onboarding

The current onboarding flow has four steps and usually takes about 3 to 6 minutes.

| Step            | What you do                                                          | What BuildOS stores or sets up                                                     |
| --------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Intent + stakes | Tell BuildOS why you are here and how important the current work is. | Saves `onboarding_intent` and `onboarding_stakes` on your user record.             |
| Brain dump      | Paste or speak the messy version of what you are working on.         | Creates real project data from the capture flow instead of collecting preferences. |
| Notifications   | Turn on email daily brief and optionally verify SMS.                 | Updates daily brief and notification preferences.                                  |
| Ready           | Review what was created and move into the app.                       | Marks onboarding complete and seeds the initial behavioral profile.                |

### What each step is for

1. **Intent + stakes**
   BuildOS asks for the few things behavior cannot reveal on its own: what kind of help you want and how high-stakes the work feels.

2. **Brain dump**
   This is the first value moment. You do not need a polished plan. You can start with rough notes, loose ends, blockers, and half-formed ideas.

3. **Notifications**
   You can turn on the email daily brief, enable SMS if you want it, or skip both and configure them later.

4. **Ready**
   BuildOS shows what it created and hands you into the main product with a real starting point.

### Resume behavior

- If you leave partway through onboarding, the flow resumes the next time you come back.
- You can revisit notification preferences later from Settings.

---

## 3. What The Welcome Sequence Uses

The welcome sequence is not a generic blast. It branches off live product state:

- whether you created a first project
- whether onboarding is complete
- whether the email daily brief is enabled
- whether SMS is verified and active
- whether calendar is connected
- whether you appear to have come back for another session

That means later emails can shift from "start your first brain dump" to "finish setup," "re-open your project," or "turn on one follow-through channel" depending on what you actually did.

---

## 4. After Onboarding

1. Open the project you started and add what changed.
2. Configure your [Daily Brief](features/daily-briefs.md) if you want email follow-through.
3. Connect Google Calendar if time and deadlines matter to your workflow.
4. Keep using brain dumps as new work, decisions, or loose notes show up.

---

## 5. Troubleshooting

- **Onboarding keeps reappearing.** Finish the required steps, especially the final Ready step that marks onboarding complete.
- **I did not get the welcome email.** Check spam first. If your workspace requires email confirmation, you may receive the confirmation email and the welcome email separately.
- **SMS verification never arrives.** Double-check that your phone number includes the country code and that you completed the verification step.
- **Google sign-up loops back.** Retry the consent flow and make sure you allow the requested scopes.

Once these steps are complete, you have a real BuildOS starting point: one project in motion, onboarding state saved, and at least one path for the product to help you follow through.
