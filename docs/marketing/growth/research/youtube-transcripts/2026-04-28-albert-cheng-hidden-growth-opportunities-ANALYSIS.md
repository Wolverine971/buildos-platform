---
title: "Albert Cheng (Duolingo / Grammarly / Chess.com) — Finding Hidden Growth Opportunities"
source_video: "2026-04-28-albert-cheng-hidden-growth-opportunities.md"
video_url: "https://www.youtube.com/watch?v=2BKmNmnEj9w"
podcast: "Lenny's Podcast"
published: 2025-10-05
duration: "01:25:25"
analyzed_date: 2026-04-28
analyst: claude
relevance_to_buildos: high
tags:
  - growth
  - consumer-subscription
  - experimentation
  - retention
  - monetization
  - freemium
  - gamification
  - hiring
---

# Albert Cheng — Finding Hidden Growth Opportunities

> "Growth's job is to connect users to the value of your product."
> — Albert Cheng

Albert Cheng has led growth at three of the most successful consumer subscription products on earth: Duolingo, Grammarly, and Chess.com. His teams target ~1,000 experiments per year. This analysis pulls out the specific tactics, frameworks, and counterintuitive findings — with relevance notes for BuildOS where applicable.

---

## 1. The Big Frameworks

### 1.1 Explore vs. Exploit (the macro framework)

- **Explore mode** = finding the right mountain to climb. Lots of divergent ideas, broad hypotheses.
- **Exploit mode** = focusing resources on climbing that mountain — doubling down on what worked.
- **The two failure modes:**
  - Too much explore → scattershot, no through-line, no pattern recognition across wins.
  - Too much exploit → saturation and stagnation, locally maximizing a single feature.
- **Apply at the micro level**, not just macro. Use it inside a single feature/insight, not just at the company level.
- **Signal it's time to switch from exploit → explore:** rising rate of statistically insignificant experiments. "Not as much juice to squeeze."

### 1.2 The Three Pillars of Gamification (originally from Jorge Mazal)

Used at Duolingo. If you're building any habit-forming product, all three need to work together:

1. **Core loop** — the daily action. (Duolingo: lesson → reward → streak extend → next-day push.)
2. **Metagame** — long-term motivation layer. (Path, leaderboard, achievements.)
3. **Profile** — the user's accumulated investment in the product. Reflection of their journey.

**BuildOS relevance:** Daily brief is the core loop. Metagame and profile layers are weak/missing. Worth thinking about what "long-term motivation" + "your accumulated thinking" looks like.

### 1.3 Growth = "Connecting Users to the Value of Your Product"

Not metrics hacking. Not paywalls. The value changes for a user *over time* — what a non-user needs to grok is different from what a 3-year power user needs. Teams should be staffed around segments of the user journey (acquisition, activation, engagement, retention, resurrection).

---

## 2. Monetization Tips & Tricks

### 2.1 Grammarly's Biggest Win: "Reverse Trial in Real Time"

The setup: Grammarly is freemium. Free users only saw spelling/grammar suggestions. Paid users got tone, clarity, sentence rewrites.

The insight: **the lived product experience for a free user was that Grammarly = a spellchecker.** They had no idea what the paid product did.

The fix: **sample paid suggestions and intersperse them into free users' writing.** Cap the count (~3 max), then prompt to upgrade.

The result: **upgrade rates nearly doubled.**

- Worry was "if we give too much away, no one will pay." Wrong. The opposite happened — users finally understood the actual value of paid.
- Counterintuitive lesson: **make your free product a reflection of everything your product can do, with limits — not a stripped-down feature subset.**

**BuildOS relevance:** HIGH. If we're freemium / trial-based, are we letting free/trial users experience the *full surface area* of what BuildOS can do, or are we hiding the best stuff behind the paywall? The "show, don't tell" version of paid features.

### 2.2 Freemium vs. Trials — Albert's Heuristic

- **Freemium works for products that:**
  - Are mission-driven (mass-reach is a goal)
  - Grow through word of mouth / network effects
  - Have a B2C2B path (free users in companies → enterprise sales)
- **Reverse trials** (full access first, then drop to limited) work best for **B2B with lock-in** — the user invests time/data, doesn't want to lose it. No credit card needed up front.
- **Standard time-based trials** still tend to be the norm for consumer products.

### 2.3 The "Solo Indie Dev" Trap

> "Every indie dev dreams of building a consumer subscription product because it's easy to build. Cool, I'll build an app, I'll add a paywall. Then they realize this is a lot harder than they thought."

The unsolved part is **distribution + retention**, not the product. Most consumer subscription apps die because users don't retain — and if they don't retain, the entire monetization strategy collapses onto "convert on day one," which is brutal.

---

## 3. Retention Benchmarks (the actual numbers)

### 3.1 D1 Retention Heuristic for Consumer Apps

- **30–40% D1 retention** = solid for a consumer app.
- Below that → question user intent or top-of-funnel quality.
- Lenny's reaction: "That's surprisingly low. Feels achievable." Albert: "It's achievable in theory, but there's so much app and product bloat now."

### 3.2 The More Important Metric: Current User Retention Rate (CURR)

For products with daily frequency, **the existing user base's stickiness compounds far more than D1 of new users.** Mature companies focus most of their energy here.

### 3.3 Exception: Passive/Background Products

Grammarly is unusual — you install it and you don't proactively open it. So **activation + the aha moment** carries the user, not daily usage. Daily-active stats are misleading.

**BuildOS relevance:** Daily brief is the closest thing to a "you don't open the app" surface. Worth tracking activation + first-week aha separately from daily-open metrics.

### 3.4 The Resurrected User Insight (the most surprising stat)

For a mature consumer product like Chess.com:
- **~80% of weekly active users = current users**
- **~10% = new users**
- **~10% = resurrected users** (similar size to new)

> "After some period of time, you stack up hundreds of millions of dormant users. It's worth spending time making sure that resurrected experience is excellent."

**Tactics for resurrection:**
- Social notifications ("your friend started using X") — Duolingo's contact-sync push.
- Re-onboarding ("your French is rusty — let's do another placement test").
- Treat the resurrected user as a distinct UX persona, not a returning new-user.

**BuildOS relevance:** HIGH. We have churned trial users and inactive accounts. The "resurrection UX" is currently nonexistent. Reactivation flows for users who got stuck or fell off are an underdeveloped lever.

---

## 4. Experimentation at Scale (Tips & Tricks)

### 4.1 Just Start

- ~40% of product teams (per Atlassian's State of Product) don't run experiments at all.
- Albert's advice: pick a third-party tool (StatSig, etc.), run a single A/B test, get the muscle going. Crawl, walk, run.
- He doesn't recommend building experimentation in-house early — only at large scale.

### 4.2 The Win Rate Is Lower Than You Think

> "The typical win rate for experiments is 30–50%. Most hypotheses are wrong."

Even at world-class teams, half of experiments don't move the needle. The point is **what you do with the wins (and big losses)** — share them, encourage adjacent teams to swarm the insight.

### 4.3 The "Run 1,000 Experiments a Year" North Star

At Chess.com:
- Pre-2023: ~0 experiments
- 2024: ~50
- 2025: on pace for ~250
- 2026 target: 1,000

The number itself isn't the point — Albert openly admits he made it up. The *real* value is the conversation: "What would have to be true for us to hit 1,000?" Forces you to:
- Open experimentation to **lifecycle marketing** (push copy, email subject lines)
- Open it to **app store** (screenshots, keywords)
- Open it to **content marketing**
- Build **no-code surfaces** (home screen, pricing) so PMs can run tests without engineering

**BuildOS relevance:** We almost certainly run 0–5 experiments per year today. Setting an ambitious "north star" number forces the question of *how would we even instrument this?* — and the answer involves marketing copy, onboarding flows, brief templates, etc. — not just app code.

### 4.4 The System Matters More Than Any Single Experiment

- Have a **growth model** so you understand how the company actually grows.
- **Instrument everything.** Albert's horror story: an in-house tool had retention configured backward — every "winning" experiment was actually losing. Three months of work invalidated.
- Without proper instrumentation, you'll run experiments and get wonky results.

### 4.5 Insights Multiply via Cross-Team Sharing

When an experiment wins (or fails surprisingly), the original PM's job is to **clearly articulate the hypothesis and the finding** so other PMs can:
- Audit similar patterns in *their* features
- Run variations of the same insight
- 5–10x the original win across the org

This is the "exploit" phase from §1.1.

---

## 5. The Game Review Story (the canonical Chess.com win)

The setup: Chess.com's most-used learning feature. After every game, a virtual coach analyzes your moves.

The insight from the data: **80% of game reviews happen after a WIN, not a loss.** Counterintuitive — they'd designed it for losers wanting to learn from mistakes.

The fix: When you lose, **flip the framing.** Instead of surfacing your blunders, surface your *brilliant moves*, with encouraging coach copy ("Losing is part of learning, keep it up").

The result:
- **+25% game reviews**
- **+20% subscriptions**
- "User retention up by a lot"

The exploitation phase: that "positivity-reframe" insight got applied to the puzzles team, copy buttons, success ratings — propagating the win 10x across the org.

**BuildOS relevance:** Strong. Brain dump processing surfaces issues, missing context, project gaps. Are we "showing blunders after a loss" — or could we surface what worked, what they captured well, what's improving? The positivity reframe is a generalizable UX pattern for any product where users are confronting their own mess.

---

## 6. AI Tools in the Growth Workflow

### 6.1 Text-to-SQL Slack Bot (analysis, not just queries)

Chess.com built (or is building) a Slack bot that takes natural-language data questions and **runs the analysis**, not just generates SQL.

Why it matters:
- Data analysts get unblocked from one-off ad hoc requests
- **Latent demand** — people who were "too embarrassed to ask" suddenly ask, generating an explosion of useful questions
- Same effect as ChatGPT: the conversational interface itself unlocks usage

### 6.2 PM-Driven AI Prototypes

Not just one-off Figma mocks. Albert's team carved out the **main screens** of the product (onboarding, home, chessboard) as **AI-generated prototypes in v0 / Lovable** that any PM can fork as a starting point.

Result: every new idea starts from a clickable, testable representation — not a spec doc. Shortens the "explore" cycle dramatically.

### 6.3 The Honest Caveat

> "We haven't yet figured out the bridging from tinkering to workflow as seamlessly as I'd like."

Tools don't yet hand off cleanly between functions (PM → designer → engineer). At Chess.com scale, handoffs still exist. They're investing in design system MCPs to fix this. **For startups: PM should just ship it.**

### 6.4 The AI Stack at Chess.com

- PMs: **v0**
- Designers: **Figma Make**
- Engineers: **Cursor, Claude Code, GitHub Copilot**
- Marketing: translation, subtitles, content adaptation tools
- Customer support: **Intercom Fin**

---

## 7. Virality (The Duolingo Screenshot Trick)

This is one of the cleverest tactics in the whole episode.

Most companies trying to drive virality try to *manufacture* shareable moments. Duolingo did the opposite:

1. **Add screenshot tracking to the app** for a brief period.
2. Look at where users were *already* organically screenshotting.
3. Findings:
   - Streak milestones (expected)
   - Funny challenge moments (less expected)
   - Top-3 leaderboard advancement = NOT shared
4. **Staff those existing hot spots with illustrators and animators.** Make the moments people are already capturing dramatically more delightful and shareable.
5. Result: 5–10x growth in shared moments.

The principle: **lean into existing organic behavior — don't fight it.**

**BuildOS relevance:** What moments in BuildOS would users *already* want to screenshot? Brain dump → cleaned project tree? A weekly progress visualization? Worth instrumenting and finding out before designing share features.

---

## 8. Hiring & Team Building (Counterintuitive)

### 8.1 The Anti-Standard JD Take

Standard hiring: write a JD, find people from similar companies, hire for the resume match.

Albert's observation across Duolingo and startups: **the highest performers had high agency, fast clock speed, energy — but often NOT deep domain experience.**

> "Sometimes experience could be a crutch, especially in this world where the grounds are shifting so fast with AI. A lot of your learned habits actually need to be intentionally discarded."

### 8.2 What "High Agency" Looks Like (signals he watches for)

Most of these are *outside* the formal interview:
- Did they actually try your product? Did they go deep into it?
- What's the energy/clock speed in setting up the interview itself?
- What questions do they ask?
- What do references say about their pace, not just their skills?
- The "vibes" component (he names it explicitly) — supports work trials over pure interview-loop hiring.

### 8.3 Beginner's Mind Beats Expertise (in the AI era)

Specific to today's environment: deep prior expertise can become a liability. Speed of *learning* > depth of *prior knowledge*.

---

## 9. Picking Your Company Stage (Lifecycle Fit)

Albert's "Goldilocks zone" = **medium-sized companies, 500–1,000 people, 10–20 years old, durable, profitable, at an inflection point.**

His logic:
- **Big tech (Google):** scale + best practices, but slow. Drove him nuts.
- **Tiny startups:** fast, but no one knows your company. Recruiting + acquisition is one user at a time. Grueling unless you hyperscale.
- **Medium / mid-stage:** company-wide visibility, daily/weekly execution pace, real distribution leverage.

> "Everyone has a company stage that they shine best at."

(BuildOS = small startup. The lesson here is awareness of the trade-off, not necessarily a prescription.)

---

## 10. The Three Failure Lessons (Chariot Dynamic Routes)

Pre-Duolingo, Albert led product at Chariot (15-person commuter shuttles in SF). They tried "Chariot Direct" — Uber-like dynamic routing on top of fixed routes. It failed. Three lessons:

### 10.1 Solution Searching for a Problem
> "You never want to chase 'wouldn't it be nice if we did this' — start from 'this is our user, this is the problem, this is why it'll delight them.'"

### 10.2 Marketplace ≠ One User
They focused on the rider app and forgot **drivers and ops carry the brunt** of any product change. Confused/disgruntled drivers = broken experience.

### 10.3 PR Before Validation = Sunk Cost Trap
They did big PR before launch. Once it was out there, they were psychologically committed to seeing it through — even when data said stop. **PR has a place, but not before customer validation.**

**BuildOS relevance:** All three apply. The PR-before-validation point is especially relevant for any "anti-AI" public positioning we ship before we've validated the message lands.

---

## 11. Brand × Experimentation (the Rocket Fuel Insight)

Albert *used to* think growth experimentation and brand/marketing/mascots were opposed. Working at Duolingo flipped him:

- Duo the Owl developed personality through **product** push notifications + marketing TikToks reinforcing it
- Tracked back: "How did you hear about us?" — TikTok was driving 20–30% of new users on big days
- Chess.com: 15 years under-the-radar, then COVID + Queen's Gambit + Twitch streamers = quadrupled registrations overnight

The takeaway: **experimentation = fast-and-steady iteration. Brand/cultural moments = the wave that quadruples you. You need both. Be ready to ride the wave when it comes.**

---

## 12. Beginner Onboarding (Chess.com's specific problem)

- 75%+ of new users self-classify as "completely new" or "beginner."
- Less than 1/3 of new users win their first game.
- **Losing a game = 10% worse retention than winning a game.**

Their experiments:
- If user says they're new → route to "learn how to play" experience, not a live game
- **Hide ratings for the first ~5 games** so users don't see their number plummet
- Offer alternatives: play a coach, play a friend, play a bot
- Considering: real-time hints in early games

**BuildOS relevance:** STRONG. New BuildOS users almost certainly have a "first game I lose" moment — first brain dump that doesn't feel like it produced something useful, first project that didn't auto-organize the way they hoped. The principle: **identify the equivalent failure moments and engineer the system to soften them.** "Hide the rating" maps to something like "don't grade the brain dump quality early."

---

## 13. Lightning Round Highlights

- **Books recommended:**
  - *Ogilvy on Advertising* (40 years old, copy/creative testing — "compel users to action, not clever ads")
  - *Dark Squares* by Danny Rensch (Chess.com co-founder's memoir — chess prodigy who grew up in an abusive cult)
- **Life motto (from his mom):** "Nothing is more important than your reputation." Small daily decisions compound — and reputations are fragile.
- **Daily product habit:** Breville Bambino espresso machine. Latte art ritual. The point he makes: *the products that impact you most are the ones you use daily.*

---

## 14. Cross-Cutting Patterns (synthesis)

If I had to compress this whole episode into 7 high-leverage moves for any consumer subscription product:

1. **Show free users the full product surface area** (Grammarly's reverse-trial-in-real-time pattern). Make free a *taste* of everything, not a stripped feature subset.
2. **Treat resurrected users as a first-class persona.** They're the same size as new users at scale and far cheaper to win back.
3. **Reframe failure moments as positive ones** (Chess.com's game review insight). Find the equivalents in your product.
4. **Watch where users already screenshot.** Don't manufacture viral moments — amplify the existing organic ones.
5. **Run a system, not experiments.** Growth model + clean instrumentation > clever single tests. Audit your retention metric isn't backwards.
6. **Set ambitious experiment-volume goals to expose hidden levers.** The number forces you to instrument lifecycle, app store, content, and no-code surfaces — not just product code.
7. **Hire for clock speed and agency over pedigree.** Especially in the AI era, when prior habits are liabilities.

---

## 15. Direct Quotes Worth Saving

> "User retention is gold for consumer subscription companies. If you don't retain your users, then a lot of the onus is on getting them to pay on day one."

> "Make your free product a reflection of everything your product can offer."

> "Growth's job is to connect users to the value of your product."

> "The whole point of setting a goal is that you can have conversations about what would need to be true to actually hit that goal."

> "Sometimes experience could be a crutch — especially in this world where the grounds are shifting so fast with AI. A lot of your learned habits actually need to be intentionally discarded."

> "The structure is rigid, but the ideas are the farthest away from rigid as possible."
> — On Duolingo

> "Lean into where users are already screenshotting. Don't fight human intuition — amplify it."

> "PR has its time and place — but doing it before you have validation is quite risky. It can lead to a lot of sunk cost."

---

## 16. BuildOS Action Candidates

Rough ideas for follow-up — these are *not* commitments, just things this transcript surfaced as worth investigating:

1. **Audit the free/trial experience.** Are we showing the full BuildOS surface area, or hiding the best stuff behind paid?
2. **Resurrection UX flow.** Define what "comes back after 14+ days dormant" looks like. Onboard them as if rusty, not as if new.
3. **Find our "game review" moment.** Where in BuildOS do users confront their own mess (failed brain dump, stalled project, missed brief)? Can we reframe positively?
4. **Screenshot-tracking exercise.** Lightweight: ask power users which views they screenshot or share. Amplify those.
5. **Set an experiment volume goal.** Even 50/year forces instrumentation, lifecycle copy A/Bs, onboarding variant tests.
6. **Instrumentation audit.** Do we have a single source of truth for retention? Have we verified directionality? (Albert's horror story.)
7. **Reverse-trial framing for the marketing site.** Show what BuildOS does for power users early, not just the basic capture loop.

---

*Source: Lenny's Podcast, "Finding hidden growth opportunities in your product | Albert Cheng (Duolingo, Grammarly, Chess.com)" — published 2025-10-05, watched 2026-04-28.*
