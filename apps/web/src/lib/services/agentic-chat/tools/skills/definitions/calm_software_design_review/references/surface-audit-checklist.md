<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/calm_software_design_review/references/surface-audit-checklist.md -->

# Calm-Surface Audit Checklist

Use this reference when reviewing any screen, feature, flow, notification channel, or copy surface for calm. Walk the categories in order against every primary surface; cite the specific rule violated in each finding. Close every surface review with the door test and the disappearance test.

## 1. Motion budget

- **Count the animations.** How many distinct motion events fire on this screen — load, hover, focus, success, error, transition? If you can't list them in 10 seconds, there are too many.
- **Communicative or decorative?** Each animation should communicate state change (saved, loading, navigated). If it exists to perform — to make the screen feel "alive" — strip it.
- **Easing and duration intentional?** Default easing + default duration is "spec met, craft failed." Production-grade motion has chosen curves and chosen timing.
- **`prefers-reduced-motion` honored?** Every non-essential animation disables when the user has signaled they want less motion. Non-negotiable.
- **No celebration animations on routine actions.** Confetti for finishing a brain-dump, sparkles for completing a task, fireworks for a daily brief — all calm-school violations.

## 2. Surface count

- **How many primary surfaces compete for attention?** One should dominate; the rest visually subordinate. Multiple primaries = stress.
- **Whitespace is intentional, not leftover.** Whitespace _is_ the periphery (Maeda Law 6); it carries meaning. If the team treats it as "empty," they have it backwards.
- **No floating elements competing for the cursor.** Persistent badges, animated chat bubbles, "Pro tip" callouts that don't dismiss — attention parasites.
- **Modal stacking is rare.** A modal over a modal means the workflow was deferred-into instead of resolved.

## 3. Attention cost

- **Does this screen demand or invite?** A demanding screen forces action (red dots, "you must finish setup," dismissable-but-loud banners). An inviting screen is available when the user wants it.
- **Time-to-first-meaningful-render is short.** Maeda Law 3: "Savings in time feel like simplicity." Instant load with skeleton state feels simpler than 800ms of settling.
- **No infinite scroll, no algorithmic feed, no "what's new" surfaces.** Feed-school patterns have no place in calm software.
- **The user can pause for 24 hours and come back without punishment.** Calm software does not punish absence.

## 4. Defaults

- **Opinionated and good, or "configurable" (= unfinished)?** Configurability is what teams ship when they couldn't decide. A strong default is a gift.
- **Notification cadence is opinionated.** Daily brief at a chosen time, not a slider for the user to figure out.
- **Settings count is finite.** A settings page exceeding one screen-height means the team made the user do its job.
- **The default workflow assumes one path.** Power-user shortcuts and escape hatches exist, but the front door is opinionated.
- **Defaults are recoverable.** Maeda Law 8 (Trust): the user trusts defaults because undo, history, and export are visibly available. Calm without recoverability is hostile.

## 5. Engagement manufacturing

The most diagnostic category. Any single item is a red flag; two or more is a structural problem. Each is sufficient on its own to flag the surface for rework.

- **No streak counters.** Streaks punish lapse and create anxiety in the audience most likely to need calm.
- **No daily-login bonuses or "you've used X for N days" badges.** Reward outcome, not presence.
- **No persistent notification dots without action.** Red dots that never clear are visual debt; the user learns to ignore the system.
- **No celebration confetti for routine actions.** Save = a calm "saved at 10:14," not a fireworks display.
- **No gamification badges without an honest emotion underneath.** Airbnb Superhost is right (earned status). Duolingo streaks are wrong (status that punishes drop-off).
- **No time-pressure prompts.** "Only 3 spots left." "Trial ends in 2 days, click now." Manufactured urgency is a trust-destroyer.
- **No faux-FOMO.** "3 people viewing this," "+47 this week" — if it isn't real social context, it's manipulation.
- **No "AI generated this for you!" celebration.** The AI work should disappear into the result; a brief announcing "AI made this special for you" is a delight-school anti-pattern in calm-school clothing.
- **No re-engagement nags.** "Your projects miss you" emails, "you have 12 unread tasks" anxiety meters, "we noticed you've been away" pop-ups — leading indicators that the team is anxious about retention.
- **No splash screens after first run.** Once the user has seen the brand mark, it's chrome.
- **No multi-step setup wizards.** A single front-door surface beats a 7-step funnel.

## 6. Notification posture

- **Push by default = bad. Opt-in by default + meaningful only = good.** Not a single push or email until the user has opted in to a specific channel.
- **Default sound is silent.** No celebratory dings, no whooshes, no "successful save" chimes.
- **Email cadence is the cadence the user opted in to.** No bonus emails, no "we thought you might like" digests.
- **Calendar reminders are calendar's job.** Calm software does not duplicate other systems' notifications.
- **Trial / billing notifications are calmly stated, not panic-stated.** "Your trial ends April 30" is calm. "Only 2 days left to keep your work!" is panic.

## 7. Empty / loading / error states

- **Empty states are calm and helpful, not anxious or gamified.** "Add your first project" with a clear primary action — not "Looks like you haven't started yet! Don't worry, we're here to help! 🎉"
- **Loading states show what's happening, not "fun" filler.** Skeleton states beat lottie animations of unrelated cartoons.
- **Errors are written like a calm human wrote them.** "We couldn't reach the server. Try again in a moment." Not "Oh no! Something went wrong! 😱 Please refresh!"
- **Permission-denied, offline, and recovery states get the same care as the happy path.** Bugs in tail states are defects, not "polish later" (Saarinen).

## 8. Information hierarchy

- **One primary, then breath.** Multiple primaries = stress. Maeda Law 5: contrast makes calm legible — a calm surface needs a denser surface adjacent for the calm to register.
- **The most important thing takes the most visual weight** (size + color + position + whitespace). If the second-most-important thing is loud, primacy collapses.
- **Information density is moderate and intentional.** Not magazine-dense, not desert-thin. The residual elements must be high-quality enough that the empty space doesn't read as cheap (Maeda Law 1, Embody).

## 9. Onboarding

- **Show, don't tour.** Tooltips pointing at elements one-by-one are a tax. The user learns by using.
- **No "welcome back, champion!" copy, no badges for completing onboarding.** Onboarding _disappears_ when complete; it does not celebrate itself.
- **The first moment of value is the user doing the actual work**, not completing a checklist. For BuildOS: the first brain-dump structuring into a project — not a "5 of 7 setup steps complete" progress bar.
- **Multi-step "let's set up your workspace" flows are hazing.** A single front-door surface wins every time.

## 10. Microcopy tone

- **Warm, brief, human.** Calm copy reads like a quiet adult wrote it — not an over-eager startup mascot.
- **No emoji-laden enthusiasm.** No "🎉 Yay!" No "✨ Magic!" No "🚀 Let's go!" — delight-school markers in a calm-school product.
- **No "champion," "rockstar," "amazing human."** The product is not your friend; it is your tool.
- **Apologies are specific, not corporate-passive.** "We didn't save your last edit because the connection dropped — we have a draft from 2 minutes ago" beats "We apologize for any inconvenience."
- **Success confirmations are calm.** "Saved." Not "Saved! Great job! 🎊"

## Closing tests (run on every surface before sign-off)

**The door test (Saarinen).** One yes/no question per primary interaction:

> "When this interaction happens, does it feel right? Or does it merely function?"

A door that opens is functional; a door whose open-and-close motion _feels right_ is craft. If the answer is "it functions," the spec is met but craft is not. The fix is not always more animation — sometimes it is less animation, better timing, better focus management, or a sharper transition.

**The disappearance test (Jainek).** One question of every visible element:

> "Does removing this make the user's actual content harder to find, or easier?"

If easier, remove it. If harder, the element earns its place. Run it ruthlessly the first time; run it again whenever feature requests have piled up and the surface has bloated.
