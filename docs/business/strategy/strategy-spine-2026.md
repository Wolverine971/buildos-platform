<!-- docs/business/strategy/strategy-spine-2026.md -->

# BuildOS Strategy Spine — 2026 H2

> Origin: Chocolate War strategic assessment, 2026-07-26 (source chat: `chocolate-wars-chat.md`).
> This is the one page that gets reviewed monthly. Every hypothesis gets marked
> **corroborated / falsified / unresolved** at review, same as an engineering gate.
> Numbers marked `[DJ: confirm]` are proposals awaiting veto, not decisions.

## Victory condition (two layers)

**Layer 1 — proof of business: BuildOS makes money.**

Pricing reality (verified 2026-07-27): $20/month Pro, 14-day free trial — and the pricing
page states paid billing **has not launched yet**. The money door is closed. Opening it is
V1's critical path, ahead of any marketing.

Milestone ladder (aggressive by DJ's call, 2026-07-27 — BuildOS runs in background mode
during the job hunt, no letting off the gas):

- **V0:** Paid billing LIVE end-to-end in prod (`PRIVATE_ENABLE_STRIPE`, checkout,
  dunning, trial→paid conversion path) — by **Aug 15, 2026**
- **V1:** First paying stranger (someone DJ has never spoken to) — by **Aug 31, 2026**
- **V2:** $500 MRR = 25 payers — by **Nov 30, 2026**
- **V3:** $2,000 MRR = 100 payers — by **Feb 28, 2027** (DJ-set, non-negotiable target)

Implied monthly gate curve (what "on track" means at each monthly review; ~1.6–1.7×/month
compounding after ignition):

| Review date | MRR floor | ≈ payers |
| ----------- | --------- | -------- |
| Sep 30      | $100      | 5        |
| Oct 31      | $250      | 13       |
| Nov 30      | $500      | 25       |
| Dec 31      | $850      | 42       |
| Jan 31      | $1,350    | 67       |
| Feb 28      | $2,000    | 100      |

Leading indicator: **trial starts**, which lead MRR by ~1 month (14-day trial + decision
lag). At a 30–40% trial→paid rate, 100 payers needs ~250–330 trials between now and
February. If trial starts aren't compounding by October, the February number is already
lost — react then, not in January.

**Layer 2 — proof of the vision: momentum stories.**

The vision in DJ's words: people who wouldn't normally use AI start using it to build
context on their life. AI is getting smarter than us, but it still needs the human
stories — it helps humans extract their story and build context, and context becomes
leverage. The funnel: **unload → context → clarity → leverage.**

Metric: **10 named, documented momentum stories by Dec 31, 2026** `[DJ: confirm]` — each
one a previously AI-hesitant person who unloaded their head into BuildOS, built context,
got organized, and visibly moved forward on something real. Testimonial-grade, publishable
with permission.

Why this is the metric: it fuses the vision with the biggest strategic gap (coalition = 0).
Ten momentum stories ARE the coalition — the visible allies, the social proof, the
distribution seed. Pursuing the vision and fixing the Jerry-gap are the same motion.

## The narrative spine

**Unload → Context → Clarity → Leverage.**

Continuous with the existing public promise ("turn messy thinking into structured work") —
this extends it to the end state: leverage on your own life. Not a rebrand; a deepening.

Public test-frame for all founder content:
**"They say AI chat makes you productive. I'm testing whether that's true."**
Framed this way, every big-lab release becomes evidence for the thesis instead of a threat.

## Central hypothesis — H0, the bridge

There is a growing divide: AI power users compounding leverage on one side, everyone else
drifting toward luddite-by-default on the other. **BuildOS is the on-ramp — the middle
ground where hesitant people use AI to build their story and context, not to chat.**

Corollary: DJ's solo-builder identity is a trust asset with exactly this audience. They
are suspicious of big labs; they can trust one visible person using these tools to gain
leverage on his own life. "I'm not the big model. I'm one person gaining leverage" is the
credibility wedge — which means founder-voice content is not optional marketing, it is
the product's front door.

### Sub-hypotheses, tests, dates

| #   | Claim                                                                               | Falsification test                                                                                                                                    | Review date      |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| H1  | AI-hesitant makers are reachable and respond to relief/story-first messaging        | Reactivation sends + creator outreach responses + atom engagement from non-AI audiences. Falsified if sends go out and response is ~zero.             | Sep 30, 2026     |
| H2  | Once in, they actually build context and come back                                  | Weekly activation rate on existing instrumentation (onboarding activation work, tasker/26). Falsified if activated users don't return within 14 days. | Rolling, monthly |
| H3  | Context → clarity → leverage is real, not poetic                                    | Momentum-story interviews with actual users. Falsified if zero stories surface by Oct 31 despite H1 sends landing.                                    | Oct 31, 2026     |
| H4  | One person + agent fleet can sustain distribution (the untested half of solo-scale) | Weekly atom fires ≥6 of 8 weeks. The status engine (`status.mjs`) already measures this. Falsified by <50% fire rate over any 8-week window.          | Sep 30, 2026     |

## Operating model — background mode (effective 2026-07-27)

DJ is actively job-hunting. BuildOS shifts to background: run asynchronously, agent-heavy,
full force. The binding constraint is no longer money or code velocity — it is **DJ-hours**.
Design rule for everything below: agents prepare, DJ fires.

- **Agents own:** drafting (atoms, extractions, emails, blogs), research, triage,
  status-engine monitoring, queue management, metric collection, monthly-review prep.
- **DJ-only actions (cannot be delegated):** posting from his accounts, approving sends,
  pricing/billing decisions, user calls, momentum-story interviews, interviews for the job.
- **The touch window:** DJ-only actions get batched into one short daily window
  (~20–30 min). Everything must arrive there _ready to fire_ — a post to paste, a send to
  approve, never a thing to finish. If an item needs DJ to finish it, it goes back to agents.
- **Cadence:** the status engine (`status.mjs`) is the source of truth for what's due.
  Monthly spine review (hypotheses marked corroborated/falsified/unresolved) is an
  agent-prepped brief DJ reads in one sitting.

## Tripwires — pre-decided strategy changes

The point: decide NOW, while calm, what forces a strategy change — so incremental bad news
never boils the frog. Jerry had no line that would make him change games; these are the lines.

**Platform risk**

- IF a major lab ships persistent life-context/organization that press credibly frames as
  "your AI life organizer" → do NOT feature-race. Double down on (a) ownership/portability
  of context and (b) the bridge audience labs can't credibly reach. Re-run positioning
  within 2 weeks of the announcement.
- IF model-provider pricing/access breaks unit economics → smart-llm rerouting (already
  multi-provider) + price pass-through. This is a solved-architecture problem, not a crisis.

**Distribution risk**

- IF the weekly atom fires <50% over any 8-week window → H4 is failing. Response is
  structural, not motivational: cut build scope to protect the engine, or recruit help.
  "Try harder" is explicitly not a listed response.

**Sustainability (rewritten 2026-07-27 — job hunt is now the active plan, not a contingency)**

- The job IS the infiltration move: it funds the campaign and teaches the enemy's
  machinery from inside. Strategic withdrawal, not surrender — Jerry's unlearned lesson,
  executed deliberately. BuildOS continues in background mode regardless of offer timing.
- The scarce resource is DJ-hours, not runway. IF the daily touch window collapses below
  ~2 hours/week for 2 consecutive weeks (job crunch, interviews, onboarding at a new
  role) → response is structural: shrink the engine to the two highest-leverage actions
  (weekly atom + momentum-story pipeline) rather than letting everything silently rot.
  A small engine that fires beats a big engine that stalls.
- IF the monthly gate curve is missed 2 reviews in a row → the Feb 2027 target gets an
  honest re-plan (price, audience, or channel — not just "more effort"). Missing a gate
  is data; ignoring a missed gate is how the frog boils.

**Vision risk**

- IF zero momentum stories exist by Oct 31 despite outreach landing → the funnel breaks
  somewhere between context and leverage. Response: 5 user calls in 2 weeks to find the
  break point before building anything new.

## Standing filters (from the Chocolate War assessment)

1. **No boxing matches.** Never compete on general-assistant chat parity, model
   benchmarks, or feed virality. Chat-as-context-capture is our arena;
   chat-as-assistant is theirs. Every chat feature must answer: does this deepen the
   user's owned context, or chase assistant parity?
2. **Ship-the-drawer rule.** Nothing outreach-shaped gets built without a send date
   attached. Drafts that never send are Jerry admiring his own poster.
3. **Endurance ≠ leverage.** Private grind must convert to public proof (atoms, essays,
   momentum stories, FDE narrative) or it's blood without leverage.

## Parked (deliberately)

- **User-side story export** (DJ, 2026-07-26): export project snippets tailored per
  social platform — users publishing their BuildOS-built story is a potential
  distribution loop (their story markets the product). Genuinely good; parked until the
  drawer is empty per filter #2. Candidate for the post-send build queue.
