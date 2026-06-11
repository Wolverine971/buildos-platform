<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/delightful_product_review/references/delight-audit-core.md -->

# Delight Audit Core: Motivators, Opportunities, the Delight Grid, the Three Pillars

Use this reference when running the delight audit itself — identifying motivators, converting them to opportunities, placing candidates on the delight grid, and auditing surfaces against the three pillars. Cite the specific named rule or pattern in each finding.

## Definitions (load-bearing)

- **Delight = joy + surprise** (Plutchik's wheel of emotion). Both halves must be present. Joy without surprise is mere satisfaction; surprise without joy is shock.
- **Functional motivators + emotional motivators must both be honored.** A perfectly functional product that ignores emotion loses to a slightly-less-functional product that does not.
- **Move from delight _vs._ functionality to delight _in_ functionality.** "Should we polish or ship features?" is a false dichotomy. Deep delight collapses it.
- **Surface delight without underlying value is anti-delight.** Confetti for routine actions, animations that delay critical paths, and aesthetics layered on a broken funnel actively erode trust.
- **B2H — business-to-human.** As long as humans use the product, emotion is load-bearing. "B2B is exempt from delight" only holds in green-field markets; once a competitor honors the emotional need, the older product loses.
- **Craft is the moat (Dylan Field).** AI lowers the floor of "shipping working software," which raises the value of taste and judgment. "Good enough is mediocre" — delight is one expression of craft, not garnish on top of it.

## Step 1 — Identify motivators (motivational segmentation)

Most teams segment by demographic (who they are) or behavioral (what they do). Add a third axis — **motivational segmentation** (_why_ they use the product).

- **Functional motivators** — what they're trying to _do_. Examples: book a flight, find a song, capture a thought before losing it, schedule a meeting.
- **Personal emotional motivators** — how they want to _feel_. Examples: feel less lonely, feel productive, feel secure, feel nostalgic, feel in control, feel relief, feel proud.
- **Social emotional motivators** — how they want others to _see them_. Examples: appear cool, appear competent, appear connected, appear thoughtful. Spotify Wrapped is the textbook example — the share-out _is_ the product.
- **Demotivator inversion** — when emotional motivators are hard to articulate, ask for _frustrations_ instead. Frustrations are easier to verbalize; invert them and you have the emotional design brief. (Google Meet during COVID couldn't get clean emotional motivators; they got three demotivators — _bored_, _low interaction_, _Zoom fatigue_ — and inverted them into reactions, self-view minimize, and immersive backgrounds.)

**Motivator template (fill per surface):**

```
Surface: <feature or screen name>
Functional motivators (what users do here):
  - <verb-noun pair>
Personal emotional motivators (how they want to feel):
  - <emotion>
Social emotional motivators (how they want to be seen):
  - <perception>
Demotivators (what frustrates them, even if they can't name what they want):
  - <frustration> → invert to → <emotional motivator>
```

## Step 2 — Convert motivators to opportunities

Translate the motivator list into an opportunity space — _not_ a feature list. Think in terms of **honoring needs**, not just **solving problems**. Stay in opportunity-space long enough to consider non-obvious solutions before locking into a feature.

- For each motivator, write at least one opportunity statement.
- Cross-reference: does the same opportunity appear under multiple motivators? Those are deep-delight candidates.
- Opportunities that only show up under functional motivators → low delight territory.
- Opportunities that only show up under emotional motivators → surface delight territory (use sparingly).

## Step 3 — The Delight Grid

A 2-axis matrix (functional motivators × emotional motivators). Place every candidate solution on it.

| Type                | Solves Functional? | Solves Emotional? | Examples                                                                                    |
| ------------------- | ------------------ | ----------------- | ------------------------------------------------------------------------------------------- |
| **Low Delight**     | Yes                | No                | Faster search, performance fixes, mobile parity, calendar conflict detection                |
| **Surface Delight** | No                 | Yes               | Spotify Wrapped, Apple Watch birthday balloons, Airbnb Superhost confetti, easter eggs      |
| **Deep Delight**    | Yes                | Yes               | Spotify Discover Weekly, Chrome Inactive Tabs, Google Meet self-view minimize, Revolut eSIM |

- **Goal = deep delight.** Force-rank candidates here before sprint planning.
- **Surface delight should be ~10% of the roadmap.** Rare and intentional. If the candidate list is dominated by surface-delight ideas, the upstream emotional-motivator work is incomplete.
- **Low delight is half the work.** The framework does not say skip functional reliability — it says don't _stop_ there.

## The Three Pillars (operating lenses)

Every delightful feature satisfies at least one. Use these during ideation and audit; record which pillar each finding serves.

### Pillar 1 — Remove friction (valley moments)

Identify **valley moments** — points in the journey where emotional state is at its lowest (anxious, stressed, frustrated, embarrassed). The pillar is _not_ "make the happy path smoother"; it's "rescue the user from the valley."

- **Uber refund example.** Driver canceled, user grabbed a taxi, app auto-assigned a new driver who charged a no-show fee. User expected to write an essay to support; instead got a 2-click refund flow. Valley moment → rescue.
- **Buffer refund-the-inactive example.** Buffer emailed paying users who hadn't logged in for months: "Want a refund?" Some took it; many stayed _because_ of the integrity. **Trust is delight on a long timescale.**
- **Lenny's distillation:** "Just making it easy to do something you expect to be really hard is delightful." Cancellation, unsubscribe, refund, account deletion — anti-delight by default; making them frictionless is delight.
- **Audit move:** walk the journey and mark every surface where the user's emotional state bottoms out. For each, ask: do we have a rescue, or did we ship a default error/cancel/support page?

### Pillar 2 — Anticipate needs

If you wait for users to tell you what they need, you're only **honoring** needs — not anticipating. Surprise requires getting there first.

- **Revolut eSIM example.** Heavy international traveler lands in Singapore, operator charges roaming. Revolut's eSIM tab — €7, applied in seconds — because Revolut anticipated its expat users' travel context.
- **Rahul Vohra (Superhuman):** "For a product to be loved, you need to set the bar higher than the users themselves."
- **Audit move:** for each surface, ask "what could the product surface here that the user has not asked for, but would recognize as theirs the moment they see it?" Then check: do we have the data signal to do that without being creepy?

### Pillar 3 — Exceed expectations

Once a need is anticipated, over-deliver — give users more than they asked for.

- **Edge coupon example.** At checkout for a €120 coffee machine, Edge surfaced an autofill coupon — 15% off, found and applied automatically. The user wasn't asking for a discount.
- **Set the bar outside the category.** Google Meet didn't compare itself to Zoom — it compared itself to "what if we were all in a room together." Dyson compared its vacuum to "what if I hired a real cleaner," not to other vacuums.
- **Audit move:** for each surface, identify the user's stated expectation, then ask: what's the smallest move that delivers more than the expectation, without becoming busywork?

## Delight pattern catalog (cite by name in fixes)

- **Personalized year-end recap** — Spotify Wrapped, GitHub Wrapped, Apple Music Replay. High social-emotional motivator (shareable). Run yearly. Failure mode: stale or shallow.
- **Tasteful celebration on milestone** — Airbnb Superhost confetti, only when the underlying moment matters. Confetti for routine actions is noise; confetti for genuine status change is delight.
- **Magic-moment redesign** — Google Meet self-view minimize. Friction hidden in something users assumed was fixed. Redesigning the obvious-but-overlooked is deep delight.
- **Pre-context anticipation** — Revolut eSIM on travel, calendar-aware briefings, location-aware utility. Requires an honest data signal; creepy if the signal is invisible to the user.
- **Auto-completion / coupon discovery** — Edge coupon at checkout. Background work the user did not ask for but immediately recognizes.
- **Refund-the-inactive trust play** — Buffer's integrity gesture. Long-cycle delight: loses revenue short-term, builds defensible trust long-term.
- **Demotivator-inversion onboarding** — post-COVID Meet positioning around "less Zoom fatigue, more interaction." Lead with what users hate about the category, not features.
- **Easter egg + craft moment** — Cursor's light-theme detail, Linear's command palette aesthetic, Figma's cursor-chat. Visible to power users, invisible to first-timers, signals taste without breaking flow.
- **Recognition without gamification** — Airbnb Superhost as the model: status that recognizes effort. Avoid Duolingo-style streaks (status that punishes drop-off) anywhere lapses correlate with stress, illness, or burnout.
- **Proud-users moment** — surfaces that make the user think "I want to show this to a peer." The strongest word-of-mouth lever.
