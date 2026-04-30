---
name: calm-software-design-review
description: Audit a screen, feature, or roadmap for restraint instead of delight. Covers motion budget, surface count, attention cost, opinionated defaults, "subtract the obvious / add the meaningful," "tools should disappear during use," and the calm-company operating practices (no streaks, no engagement manufacturing, no urgency dark patterns). Use as the on-brand counterweight to `delightful-product-review` for productivity tools, thinking environments, and any product where users come under cognitive load — not under-stimulation.
path: docs/research/youtube-library/skill-drafts/calm-software-design-review/SKILL.md
---

# Calm Software Design Review

Use this skill to audit a screen, a feature, a roadmap, or an entire product for **restraint instead of delight**. The lens here is _calm software_ — products designed to disappear during use, hold the user's attention only when it serves the user's work, and never manufacture engagement. The audit treats motion, surface count, attention cost, opinionated defaults, and notification posture as the load-bearing variables; it treats confetti, streaks, badges, urgency timers, and celebration UX as failure modes.

This skill is the **BuildOS-on-brand counterweight to `delightful-product-review`**. It synthesizes Karri Saarinen's craft canon (Linear), Werner Jainek's Cultured Code design philosophy (Things), Jason Fried & DHH's calm-company doctrine (37signals), John Maeda's _Laws of Simplicity_, and Steph Ango's file-over-app thinking (Obsidian). Where the delight school says "joy + surprise," the calm school says "respect + restraint." Productivity tools and thinking environments live in the second school.

## When to Use

- Audit a productivity tool, knowledge tool, dev tool, financial tool, or any B2B power-user product where users arrive **already cognitively loaded**.
- Review a screen that feels "off" but isn't broken — the kind of "off" where the design checks every UX box and still feels like it's pulling at you.
- Triage a roadmap: which features are main-quest, which are side-quest, which are engagement manufacturing in disguise.
- Pre-launch a feature you suspect drifted toward delight when calm was the brief.
- Score a competitor's product to learn whether the calm signals (or lack of them) explain user love or user fatigue.
- Validate a new opinionated default before shipping it as configurable instead.
- Run the operator-side audit on a small team (calm-company practices) when the product feels stressed because the company is.

**Do not use this skill for:**

- **Entertainment, social, or under-stimulation B2C apps.** Use `delightful-product-review` — joy and surprise are correct targets when the user comes bored, not loaded.
- **Accessibility / WCAG audits.** Use `accessibility-and-inclusive-ui-review` — calm and inclusive overlap, but accessibility has its own hard guardrails.
- **Marketing-site reviews.** Use `marketing-site-design-review` — marketing pages have different rules (a marketing hero is allowed personality the product UI is not).
- **Generic UI quality.** Use `ui-ux-quality-review` for hierarchy, spacing, type, color, and 4-pixel-system fundamentals. Calm-software review **assumes** those fundamentals already pass.

## The Two Design Schools (And Which BuildOS Fits)

There are two coherent answers to "what should good software feel like?" — and most disagreements about a screen are actually disagreements about which school applies.

**Delight school** — Nesrine Changuel, Lovable, Spotify Wrapped, Albert Cheng, FigJam.

- Goal: joy, surprise, anticipation, emotional connection, shareability.
- Tools: animation moments, valley-moment rescues, anticipation features, the Delight Grid (low / surface / deep), the 50/40/10 roadmap split (functional / deep delight / surface delight).
- Audience emotion: under-stimulated, bored, ready to be charmed.
- Where it shines: B2C entertainment, social, creative tools, and any category whose user arrives under-stimulated.

**Calm school** — Karri Saarinen / Linear, Werner Jainek / Cultured Code, Jason Fried & DHH / 37signals, John Maeda, Steph Ango / Obsidian.

- Goal: restraint, focus, trust, the tool that disappears, opinionated defaults, "subtract the obvious / add the meaningful."
- Tools: reduced surface count, opinionated defaults, no engagement manufacturing, no A/B-driven feature decisions, internal-MVP discipline, written-async ops, 6-week cycles + cooldowns.
- Audience emotion: already loaded — under stress, time pressure, cognitive load, decision fatigue.
- Where it shines: B2B power-user retention products, productivity tools, thinking environments, dev tools, anything used while the user is trying to do hard work.

**The wedge:** _what state does the user arrive in?_ Under-stimulated → delight is correct. Already-loaded → calm is correct. Confetti for a user finishing a Spotify year is right; confetti for a user finishing a brain-dump after a stressful Tuesday is hostile.

**BuildOS is firmly in the calm school.** The product exists for people making complex things who are already under cognitive load. Every feature must pass the calm-school test, and the marketing must reinforce it (relief over delight, anti-feed over engagement, opinionated defaults over flexible everything).

## Foundational Principles

These are the load-bearing principles distilled across the four primary canons. Hold them in mind during every review — most calm-software failures trace back to a single principle being ignored.

- **"Subtract the obvious; add the meaningful."** (Maeda, Law 10.) The keystone of the entire school. For every element on the surface, ask: is this _obvious_ (every productivity tool has it, no one is differentiated by it) or _meaningful_ (specific to this product's identity)? Subtract the first; sharpen the second. The trap is reversed-priority engineering: spending the most design effort on the obvious features (because they're easier to scope) and shipping the meaningful features as undifferentiated MVPs.
- **"Tools should disappear during use."** (Jainek.) During use, the user should be looking at their own content, not at the app's UI announcing itself. Chrome that out-shouts content is the failure mode. Every UI element either earns its presence by being load-bearing for the user's content, or it gets stripped. The animation work, the calm color palette, the absence of dashboards-of-dashboards — all in service of disappearance.
- **"Quality is the moat; speed at the cost of care is debt."** (Saarinen.) The spec is the baseline minimum, not the goal. _"A door is a door, and if it opens, it technically functions. It's easy to meet the spec. It's harder to do the craft."_ Excellence is what happens after the spec is met — the animation timing, the keyboard handling, the cursor position after the modal closes. None of these are in the spec; all of them are felt. The team that stops at the spec leaves the moat unbuilt.
- **"It doesn't have to be crazy."** (Fried/DHH.) At work _or_ in the product. Stress in the product mirrors stress in the company; if the team is in dread-line mode, the UI will leak it. Calm operations is upstream of calm software. The phrase "it's crazy at work" reframes a series of choices as a force of nature — and stopping the language is part of stopping the pattern.
- **"Do not over-organize."** (Jainek.) More hierarchy makes things harder to find, not easier. Things ships only Projects + Areas — fifteen years in, top of the App Store. Folders-of-folders is a confession of indecision. Most "feature bloat" complaints are organization failures, not feature-count failures (Maeda Law 2): a product with 40 well-grouped features can feel simpler than a product with 12 ungrouped ones.
- **"Opinionated defaults beat flexible everything."** (Saarinen.) Configurability is a tax on the user. A strong default is a gift. Productivity software designed for everyone becomes mediocre everywhere. _"It's very hard to design everything for everyone, because you just end up with a very generalized solution. So we provide good defaults — this is how the workflow works, so you don't have to think about it and you can focus on the work you do."_ Pick the audience; pick the workflow; pick the default.
- **"More emotions are better than fewer — calm doesn't mean sterile."** (Maeda, Law 7.) The most common failure of calm-school imitators is stripping warmth in the name of clean. Maeda's direct repudiation of the modernist white-box school: _"We're human beings; we love complex things. We love relationships — very complex. The sky is not 41% gray."_ Calm is _restraint paired with strong opinion_, not minimalism applied to soul. Color, voice, texture, and signature interactions are simplicity allies, not enemies.
- **"Trust users; don't manufacture engagement."** (Fried/DHH; Saarinen.) Streaks, badges, daily-login bonuses, urgency timers, persistent notifications, fake FOMO — all evidence the team doesn't trust the product to retain the user on its merits. In a retention business, manufactured engagement is a leading indicator of churn. Saarinen's framework explicitly forbids per-feature engagement goals: company-level retention is fine; per-feature WAU optimization is the engine that ships streaks.
- **"Constraint-driven creativity over feature accumulation."** (Steph Ango.) A small, well-chosen set of primitives is more generative than a large set of customizations. Obsidian's plain-text-files, Linear's cycles, Things's Projects-and-Areas, Basecamp's six-week cycles — all examples of constraints that make the system stronger. The paradox: tools that constrain the user well give them more creative range than tools that try to do everything.
- **"Internal-only MVPs; ship to yourself first."** (Saarinen; Fried/DHH.) Features pass through internal-flag use before any external opt-in. Public release means the standard has been hit. Beta means rough edges are allowed _with explicit opt-in_. The team is the first customer and the oldest customer — and if the team isn't using the feature, it should not ship.
- **"Reduce scope to increase quality."** (Saarinen.) Teams missing the bar are usually attempting too much. Build a partial feature exceptionally; iterate. _"Quality isn't binary — it's about continuously refining a product to meet a standard."_ Most teams treat scope as a fixed input from leadership and quality as the variable that adjusts to fit. Calm software flips it: quality is fixed, scope is the variable.

## Calm-Software Audit Checklist

Walk this list against every primary surface (brain-dump entry, daily brief, project page, settings, onboarding). Findings group naturally into the categories below.

### Motion Budget

- [ ] **Count the animations.** How many distinct motion events fire on this screen — load, hover, focus, success, error, transition? If you can't list them in 10 seconds, there are too many.
- [ ] **Communicative or decorative?** Each animation should communicate state change (saved, loading, navigated). If it exists to perform — to make the screen feel "alive" — strip it.
- [ ] **Easing and duration intentional?** Default easing + default duration is "spec met, craft failed." Production-grade motion has chosen curves and chosen timing.
- [ ] **`prefers-reduced-motion` honored?** If the user has signaled they want less motion, every non-essential animation should disable. This is non-negotiable.
- [ ] **No celebration animations on routine actions.** Confetti for finishing a brain-dump, sparkles for completing a task, fireworks for daily brief delivery — all calm-school violations.

### Surface Count

- [ ] **How many primary surfaces compete for attention on this screen?** One should dominate; the rest visually subordinate. Multiple primaries = stress.
- [ ] **Whitespace is intentional, not leftover.** Whitespace _is_ the periphery (Maeda Law 6); it carries meaning. If the team thinks of whitespace as "empty," they've got it backwards.
- [ ] **No floating elements competing for the cursor.** Persistent badges, animated chat bubbles, "Pro tip" callouts that don't dismiss — all attention parasites.
- [ ] **Modal stacking is rare.** A modal over a modal is a sign the workflow has been deferred-into instead of resolved.

### Attention Cost

- [ ] **Does this screen demand or invite?** A demanding screen forces action (red dots, "you must finish setup," dismissable-but-loud banners). An inviting screen is available when the user wants it.
- [ ] **Time-to-first-meaningful-render** is short. Maeda Law 3: "Savings in time feel like simplicity." A page that loads instantly with skeleton state feels simpler than one that takes 800ms to settle.
- [ ] **No infinite scroll, no algorithmic feed, no "what's new" surfaces.** These are feed-school patterns and have no place in calm software.
- [ ] **The user can pause for 24 hours and come back without punishment.** Calm software does not punish absence.

### Defaults

- [ ] **Are defaults opinionated and good, or "configurable" (= unfinished)?** Configurability is what teams ship when they couldn't decide. A strong default is a gift.
- [ ] **Notification cadence is opinionated.** Daily brief at a chosen time, not a slider for the user to figure out.
- [ ] **Settings count is finite.** If the settings page exceeds one screen-height, the team has been making the user do its job.
- [ ] **The default workflow assumes one path.** Power-user shortcuts and escape hatches exist, but the front door is opinionated.
- [ ] **Defaults are recoverable.** Maeda Law 8 (Trust): the user trusts the defaults because undo, history, and export are visibly available. Calm without recoverability is hostile.

### Engagement Manufacturing

This is the section where the calm-school violations are most diagnostic. Any single one of these is a red flag; two or more is a structural problem.

- [ ] **No streak counters.** Saarinen, Fried/DHH, and the inclusion literature all reject streaks. Streaks punish lapse and create anxiety in the audience most likely to need calm.
- [ ] **No daily-login bonuses or "you've used X for N days" badges.** The product should not reward presence; it should reward outcome.
- [ ] **No persistent notification dots without action.** Red dots that never clear are visual debt.
- [ ] **No celebration confetti for routine actions.** Save = a calm "saved at 10:14"; not a fireworks display.
- [ ] **No gamification badges without an honest emotion underneath.** Airbnb Superhost is right (status that recognizes earned effort). Duolingo streaks is wrong (status that punishes drop-off).
- [ ] **No time-pressure prompts.** "Only 3 spots left." "Trial ends in 2 days, click now." Manufactured urgency is a trust-destroyer.
- [ ] **No faux-FOMO** ("3 people viewing this," "+47 this week"). If it isn't real social context, it's manipulation.
- [ ] **No "AI generated this for you!" celebration.** The AI work should disappear into the result. A brief that announces "AI made this special for you" is a delight-school anti-pattern in calm-school clothing.
- [ ] **No re-engagement nags.** "Your projects miss you" emails, "you have 12 unread tasks" anxiety meters, "we noticed you've been away" pop-ups — all leading indicators that the team is anxious about retention.

### Notification Posture

- [ ] **Push by default = bad. Opt-in by default + meaningful only = good.** The product should not send a single push or email until the user has opted in to a specific channel.
- [ ] **Default sound is silent.** No celebratory dings, no whooshes, no "successful save" chimes.
- [ ] **Email cadence is the cadence the user opted in to.** No bonus emails, no "we thought you might like" digests.
- [ ] **Calendar reminders are calendar's job.** Calm software does not duplicate other systems' notifications.
- [ ] **Trial / billing notifications are calmly stated, not panic-stated.** "Your trial ends April 30" is calm. "Only 2 days left to keep your work!" is panic.

### Empty / Loading / Error States

- [ ] **Empty states are calm and helpful, not anxious or gamified.** "Add your first project" with a clear primary action — not "Looks like you haven't started yet! Don't worry, we're here to help! 🎉"
- [ ] **Loading states show what's happening, not "fun" filler.** Skeleton states beat lottie animations of unrelated cartoons.
- [ ] **Errors are written like a calm human wrote them.** "We couldn't reach the server. Try again in a moment." Not "Oh no! Something went wrong! 😱 Please refresh!"
- [ ] **Permission-denied, offline, and recovery states get the same care as the happy path.** Saarinen: bugs in tail states are defects, not "polish later."

### Information Hierarchy

- [ ] **One primary, then breath.** Multiple primaries = stress. Maeda Law 5: contrast is what makes calm legible — the calm surface needs a dense surface adjacent to it for the calm to register.
- [ ] **The most important thing on screen takes the most visual weight** (size + color + position + whitespace). If the second-most-important thing is loud, primacy collapses.
- [ ] **Information density is moderate, intentional.** Not magazine-dense, not desert-thin. Maeda Law 1's _Embody_ — the residual elements must be high-quality enough that the empty space doesn't read as cheap.

### Onboarding

- [ ] **Show, don't tour.** Tooltips that point at elements one-by-one are a tax. The user learns by using.
- [ ] **No "welcome back, champion!" copy.** No badges for completing onboarding. Onboarding _disappears_ when complete; it does not celebrate itself.
- [ ] **The first moment of value is the user doing the actual work**, not completing a checklist. For BuildOS, that's the first brain-dump structuring into a project — not the "5 of 7 setup steps complete" progress bar.
- [ ] **Multi-step "let's set up your workspace" flows are hazing.** A single front-door surface beats a 7-step setup wizard every time.

### Microcopy Tone

- [ ] **Warm, brief, human.** Calm copy reads like a quiet adult wrote it — not like an over-eager startup mascot.
- [ ] **No emoji-laden enthusiasm.** No "🎉 Yay!" No "✨ Magic!" No "🚀 Let's go!" These are delight-school markers in a calm-school product.
- [ ] **No "champion," "rockstar," "amazing human."** The product is not your friend; it is your tool. Don't confuse the relationship.
- [ ] **Apologies are specific, not corporate-passive.** "We didn't save your last edit because the connection dropped — we have a draft from 2 minutes ago" beats "We apologize for any inconvenience."
- [ ] **Success confirmations are calm.** "Saved." Not "Saved! Great job! 🎊"

### The "Door Test" (Saarinen)

Before signing off on any surface, run the door test as a single yes/no question:

> _"When this interaction happens, does it feel right? Or does it merely function?"_

A door that opens is functional. A door whose open-and-close motion _feels right_ is craft. Most software ships the first; nothing in the workflow forces the second. Apply the door test to every primary interaction: the brain-dump submit, the daily-brief load, the project page transition, the save confirmation. If the answer is "it functions" — that is the spec being met, not craft being achieved. The fix is not always more animation; sometimes it is _less_ animation, better timing, better focus management, or a sharper transition.

### The "Disappearance Test" (Jainek)

Walk the surface. Ask one question of every visible element:

> _"Does removing this make the user's actual content harder to find, or easier?"_

If easier, remove it. If harder, the element earns its place. This is the rule that produces the Apple-style polish, the absence of dashboards-of-dashboards, and the calm color palette. Run it ruthlessly the first time; run it again when feature requests have piled up and the surface has bloated.

## Calm-Operations Audit (the org behind the product)

When reviewing a roadmap, hiring plan, or team operating model — not just the UI — apply these tests. They come from Fried/DHH and Saarinen and explain why some products _can't_ feel calm: the company shipping them isn't.

- [ ] **Default-no policy on new features.** The roadmap has visible refusals. If everything proposed makes it onto the plan, the team isn't editing.
- [ ] **Hire when it hurts** — not when revenue passes a threshold, not when a board deck says headcount should grow. Hire when work is observably breaking.
- [ ] **No mandatory meetings; written async first.** Decisions live as long-form posts in a persistent place, not as Slack threads or whiteboard photos. Verbal traditions tax everyone with repetition.
- [ ] **Profit > valuation framing.** The funding model is upstream of the culture. Profit funds calm; growth-at-all-costs funds crazy.
- [ ] **Internal MVP before external launch.** Every feature ships behind an internal flag and is used by the team for at least a week before any external opt-in.
- [ ] **7-day zero-bug fix window.** (Saarinen.) Bugs are defects. The team fixes within a week or pulls the feature back.
- [ ] **No A/B tests as a crutch.** A/B tests are appropriate for funnel optimization at scale; they are not a substitute for judgment on product direction. If the team can't decide between two designs without testing, the team doesn't have a point of view.
- [ ] **No engagement-driven feature goals.** Per-feature WAU targets are the engine that ships streaks. Company-level retention goals are fine; per-feature goals are calm-school violations.
- [ ] **Cycles + cooldowns** (6-week + 2-week, Basecamp; or 1–2 week, Linear). Time is fixed, scope is variable. Cooldowns are structured permission to fix the small things and breathe.
- [ ] **Sabbaticals or extended-rest mechanisms exist** (or are planned). Calm at scale requires structural rest.
- [ ] **Hiring is not hazing.** Real work samples, fewer rounds, shorter, sample-based. The interview is a sample of how the company operates — and if hiring is hazing, working there will be hazing.

## The 10 Laws of Simplicity (Maeda) — Operational Application

Maeda is the philosophical anchor; these laws are the rubric. For every surface under review, walk the laws in order.

| #   | Law           | Sub-rule                                            | Operational question for this surface                                                                                |
| --- | ------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | **Reduce**    | **SHE** — Shrink, Hide, Embody                      | What can shrink? What can hide behind disclosure? What must be _embodied_ (given quality, weight, finish) so the residual doesn't read as cheap? |
| 2   | **Organize**  | **SLIP** — Sort, Label, Integrate, Prioritize       | Are remaining elements sorted by user-meaningful axis, labeled in user vocabulary, deduplicated, and ranked by primacy? |
| 3   | **Time**      | Reduce wait, mask wait, make wait pleasant          | Where can optimistic UI, skeleton state, or pre-fetching cut perceived wait? Time-to-first-meaningful-render?         |
| 4   | **Learn**     | Teach what cannot be removed                        | What inherent complexity remains? Is it taught (tooltip, empty state, onboarding step) or hidden in a way that confuses later? |
| 5   | **Differences** | Contrast makes simple feel simple                 | Is there contrast between this surface and adjacent ones? If everything is equally minimal, is the calm legible at all? |
| 6   | **Context**   | The periphery is not peripheral                     | Is whitespace, framing, transition, empty state treated as primary, or as leftover? Cut them and the figure stops working. |
| 7   | **Emotion**   | More emotions are better than fewer                 | Has this been stripped to sterility? Where is the warmth, voice, or detail that makes this _this_ product?            |
| 8   | **Trust**     | Defaults must be trustworthy because users won't read | Are the defaults opinionated and good? Is undo / export / inspect available so the user can recover when defaults are wrong? |
| 9   | **Failure**   | Some things can never be made simple                | What inherent complexity is essential to the product's value? Frame it honestly; do not pretend it isn't there.       |
| 10  | **The One**   | Subtract the obvious; add the meaningful            | What's _obvious_ (generic, in every competitor) — subtract. What's _meaningful_ (specific to this product) — sharpen. |

**Three Keys** also applied: **Away** (state moved out of view is recoverable, not gone), **Open** (system is inspectable — view raw, see why, export anywhere), **Power** (use does not deplete the user's attention or energy over time).

## Failure Modes (red flags)

The list below is what "delight in a calm tool" or "engagement manufacturing" looks like when caught in the wild. Each one is sufficient on its own to flag the surface for rework.

- **Streak counters** — "You've used BuildOS 7 days in a row!" — calm-school violation.
- **Daily-login bonuses or rewards** — anything that pays the user for presence rather than outcome.
- **Persistent notification dots that never clear** — visual debt; the user learns to ignore the system.
- **Confetti / fireworks / sparkles on routine actions** — saving, completing, navigating.
- **Gamification badges without earned meaning** — Duolingo-style streak status, not Airbnb Superhost-style earned status.
- **Time-pressure prompts** — "Trial ends in 2 days," "Only 3 spots," "Limited time."
- **Faux-FOMO** — "3 people viewing this," "+47 users this week" injected into the UI.
- **"AI generated this for you!" celebration banners** — the AI should disappear into the result.
- **Push notifications by default** — opt-out instead of opt-in is a calm-school red flag.
- **Splash screens after first run** — once the user has seen the brand mark, it's chrome.
- **"Welcome back, champion!" copy** — over-eager mascot voice.
- **Multi-step setup wizards** — a single front-door surface always beats a 7-step funnel.
- **Re-engagement nags** — "Your projects miss you," "We noticed you've been away."
- **Per-feature engagement metrics on the team's wall** — leading indicator that engagement-manufacturing is coming.
- **A roadmap with no visible refusals** — if every proposed feature shipped, the team isn't editing.
- **Configurability instead of opinion** — settings panels growing past a single screen-height.
- **Verbal-tradition org** — decisions live in Slack threads and meeting memories instead of long-form persistent posts.

## The Main-Quest / Side-Quest Discipline (Saarinen)

The single most usable mental model from Saarinen for roadmap-and-feature audits. For every feature, every campaign, every partnership conversation, every UI element under review:

> _Does this progress the main quest line — the company's core value proposition — or is this a side quest?_

If side quest, defer or delete. The discipline does two things at once:

- **It kills feature creep at the source.** A team of <10 people cannot afford side quests. Even a team of 50 (Linear's scale through 10,000 paying customers) could not afford them.
- **It exposes engagement-manufacturing for what it is.** Streaks, badges, gamification, celebration confetti, re-engagement nags — almost always side quests. They appear when the team has stopped trusting the main quest to retain users on its merits.

The trap is treating "main quest" as ineffable. It isn't. For Linear: issue tracking and project management for software companies. For Things: personal task management as a private artifact. For Basecamp: low-stress project communication for small teams. For BuildOS: a thinking environment that turns messy thinking into structured work for people making complex things. _If a feature does not directly advance that, it is a side quest._

## The "Quality Without A Name" Audit (Saarinen + Christopher Alexander)

The deepest principle in the calm-software canon, and the hardest to teach. Saarinen calls it _"quality without a name"_ — the precise, objective sense that something feels alive, feels right, and you can't always say why. It comes from Christopher Alexander's _The Timeless Way of Building_; it is the philosophical priora behind every other rule in this skill.

When the door test, the disappearance test, the engagement-manufacturing checklist, and the Maeda Laws all pass — and the surface still feels off — the audit's last move is to ask what the surface lacks _quality without a name_. Three diagnostic questions:

- **Does this feel like one team made it, or like a sequence of decisions stacked on each other?** Calm software has a felt unity; design-by-committee leaks at the seams.
- **Does this feel like the team that made it cared, or like the team met the spec?** Caring is felt at the level of a single hover state, a single transition, a single error message.
- **Does this feel inevitable?** The strongest calm-software surfaces feel like there is only one way they could be — every other way is obviously worse. If the surface feels arbitrary, it has not yet earned the door test.

This audit is qualitative and resistant to checklists by design. The checklist gets the surface to "spec met"; the door test, disappearance test, and quality-without-a-name audit get it to _craft_.

## Output Format

Return findings grouped by category. For each finding, include _what's wrong_, _why it conflicts with calm-software_, _specific fix_, and _severity_.

```
Category: <Motion / Surface count / Defaults / Engagement manufacturing / Notification posture / Tone / States / Hierarchy / Onboarding / Operations>
Finding: <one-sentence description of the issue>
What's wrong: <concrete description, with screen / element reference>
Why it violates calm: <which principle or law is breached, with citation — Saarinen / Jainek / Fried / Maeda>
Specific fix: <numbered, ordered by impact>
Severity: high | medium | low
```

Then a roll-up:

- **Top 5 highest-leverage fixes** across all surfaces, ordered by impact.
- **Engagement-manufacturing red flags found**, listed with severity.
- **Calm-operations risks** (if any) — practices that will leak into the product if uncorrected.
- **Maeda Law 10 audit** — what is _obvious_ on this product (subtract) and what is _meaningful_ (sharpen).
- **Calm-vs-delight verdict** — does this product, as currently shipping, fit the calm school? If not, where is it leaking toward delight?

## Guardrails

- **Do not recommend animations to "fix" calm.** If the surface feels flat, the issue is likely Maeda Law 7 (emotion via voice, color, or detail), not motion.
- **Do not add streaks, badges, or celebrations** to "drive engagement." Engagement manufactured this way is leading-indicator churn in retention businesses.
- **Do not assume "more configurability" = better.** Opinionated defaults are the move. Configurability is what teams ship when they couldn't decide.
- **Do not push notifications by default.** Opt-in only. The default surface is the user opening the product on their cadence.
- **Do not manufacture urgency.** No "limited time," no "only N left," no FOMO. These trade short-term clicks for long-term trust.
- **Do not confuse calm with sterile.** Maeda Law 7 — emotion is allowed. Color, voice, texture, signature interactions belong in calm software. The failure mode of calm-school imitators is stripping warmth.
- **Do not strip features so aggressively the tool can't do real work.** Calm ≠ feature-thin. Calm = restraint paired with strong opinion on the main quest. If the team is shipping nothing because every feature feels like a side quest, the discipline has lost its bias-to-ship.
- **Do not apply this skill to entertainment apps** (use `delightful-product-review`). The under-stimulated audience needs joy + surprise; the loaded audience needs respect + restraint. Wrong school = wrong product.

## Calm School vs Delight School — Comparison

| Dimension              | Calm School (Saarinen / Jainek / Fried / Maeda)                              | Delight School (Changuel / Lovable / Cheng)                                  |
| ---------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Goal                   | Restraint, focus, trust, the tool that disappears                            | Joy, surprise, anticipation, emotional connection                            |
| Audience emotion       | Already loaded — under stress, time pressure, cognitive load                 | Under-stimulated — bored, ready to be charmed                                |
| Roadmap balance        | Main quest only; default-no on side quests                                   | 50% functional / 40% deep delight / 10% surface delight                      |
| Defaults               | Opinionated, strong, unconfigurable in the front door                        | Personalized, anticipated, surprise-shaped                                   |
| Notifications          | Off by default; opt-in; meaningful only                                      | On by default; engagement-shaped; re-engagement allowed                      |
| Celebrations           | Earned only — Superhost not Duolingo                                         | Confetti for valley-moment rescues and milestone moments                     |
| Engagement metrics     | Company-level retention; never per-feature                                   | Per-feature engagement; valley-rescue scores; surprise renewal cadence       |
| Quality target         | "Feels right" — door-test, disappearance test, craft-beyond-spec             | Joy + emotional resonance; delight grid pass; demotivator inversion          |
| Where it shines        | B2B power-user retention; productivity tools; thinking environments          | B2C entertainment; social; creative tools; under-stimulation categories      |
| Where it fails         | When applied without bias-to-ship — stagnation; calm-as-aesthetic            | When applied to loaded audiences — confetti during stress destroys trust     |
| BuildOS fit            | **Strong** — anti-feed positioning maps 1:1                                  | **Weak** — would push BuildOS toward confetti and engagement manufacturing   |

## Cross-Linked Skills

- `delightful-product-review` — the counterpart for under-stimulated audiences and entertainment categories. Use when the user arrives bored, not loaded.
- `ui-ux-quality-review` — foundational hierarchy, spacing, type, color, and 4-pixel-system rules that this skill assumes.
- `marketing-site-design-review` — sibling skill for marketing pages, where personality is allowed that product UI is not.
- `accessibility-and-inclusive-ui-review` — overlap on _no streaks, no shaming, no manufactured urgency_, but with WCAG-specific testing the calm-software lens does not cover.
- `ai-era-craft-and-quality-moat` (proposed) — Saarinen's "technology makes it faster to build, but harder to care" is the bridge skill for the AI-era version of this discipline.

## Source Attribution

This skill is distilled from five primary canons in the calm-software lineage. Each contributed a load-bearing pillar:

- **Karri Saarinen / Linear — _Craft, Quality, And Calm Software_** — primary operator-grade source. The 10 Rules, the door-test, "spec is baseline not goal," opinionated defaults, no A/B tests, internal-MVPs, 7-day zero-bug fix window, "main quest vs side quest." Local analysis: [`docs/research/youtube-library/analyses/2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md`](../../analyses/2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md).
- **Werner Jainek / Cultured Code — _Things Design Philosophy_** — calm-software philosophical anchor. "Tools should disappear during use," "a conversation with oneself," "do not over-organize," polish as never-finished, Apple-floor as floor not ceiling. Local analysis: [`docs/research/youtube-library/analyses/2026-04-29_werner-jainek-cultured-code_things-design-philosophy_analysis.md`](../../analyses/2026-04-29_werner-jainek-cultured-code_things-design-philosophy_analysis.md).
- **Jason Fried & DHH / 37signals — _It Doesn't Have To Be Crazy at Work_** — calm-operations canon. Calm-company doctrine, default-no, hire when it hurts, written async, profit-not-growth, no engagement manufacturing, deadlines-not-dread-lines, narrow-as-you-go. Local analysis: [`docs/research/youtube-library/analyses/2026-04-29_jason-fried-dhh_calm-company_analysis.md`](../../analyses/2026-04-29_jason-fried-dhh_calm-company_analysis.md).
- **John Maeda — _The Laws of Simplicity_ (TED 2007 + book)** — philosophical rubric. The 10 Laws (Reduce, Organize, Time, Learn, Differences, Context, Emotion, Trust, Failure, The One), the 3 Keys (Away, Open, Power), SHE and SLIP sub-rules, "subtract the obvious; add the meaningful." Local analysis: [`docs/research/youtube-library/analyses/2026-04-29_john-maeda_laws-of-simplicity_analysis.md`](../../analyses/2026-04-29_john-maeda_laws-of-simplicity_analysis.md).
- **Steph Ango / Obsidian — _Toolmaking, Constraints, File-Over-App_** — supporting source. Constraint-driven creativity, file-over-app permanence, malleable-software thinking, plain-text primitives over feature accumulation. Local transcript: [`research-library/transcripts/podcast-steph-ango-obsidian.md`](../../../../research-library/transcripts/podcast-steph-ango-obsidian.md).

Together these five form the **layered triangle** of the calm-software canon: Maeda is the philosophical rubric, Saarinen and Jainek are the product-level operator schools, Fried/DHH is the company-level operator school, and Ango is the malleable-tools cross-link. This skill is the synthesis — operator-grade and ready to ship audits against.
