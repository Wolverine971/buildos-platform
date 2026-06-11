<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ai_era_craft_and_quality_moat/references/decision-filter-and-failure-modes.md -->

# Decision Filter, Craft-vs-Speed Quadrants & AI-Era Failure Modes

Use this reference when making a ship/cut or posture call on a specific feature, surface, or release; when picking a craft-vs-speed quadrant; when diagnosing AI slop; or when running a pre-launch review. Run the filter, place the quadrant, name the failure modes by name.

## The "Good Enough Is Mediocre" Decision Framework

When reviewing a feature, screen, or release, run this five-question filter. The answers determine the craft-investment posture.

1. **Is this a competitive surface — a place users compare us to alternatives?**
    - Yes → high-craft layer required. AI baseline is a liability.
    - No → AI baseline acceptable; manual polish optional.

2. **Is this a first-impression surface — onboarding, landing, brain-dump confirmation, first-day experience?**
    - Yes → invest disproportionately. The first 30 seconds determine whether the user comes back.
    - No → prioritize against later surfaces.

3. **Is this an internal admin / low-traffic surface?**
    - Yes → AI-generated baseline is the right answer. Ship it, move on.
    - No → escalate to question 4.

4. **Does this surface involve user data, trust, money, or privacy?**
    - Yes → no AI shortcuts. Every state, every error, every confirmation deserves human judgment.
    - No → use the priority ladder.

5. **Is this surface a candidate for evaluation by users with the highest taste in the category?**
    - Yes → it _will_ be screenshot-shared. Assume it gets evaluated alongside Linear, Things, Granola. Craft accordingly.
    - No → standard ladder.

The trap this filter prevents: spending equal craft effort on a billing settings page and the brain-dump flow. They are not equal. The framework forces you to name which is which.

## The Craft-vs-Speed Tradeoff Matrix

Where does your product sit, and where do you want it to sit?

|                | Low Speed                                     | High Speed                                                         |
| -------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| **High Craft** | Product moat (Linear, Things, Apple, Granola) | Premium price + small team (Cursor, Linear early, Granola, Stripe) |
| **Low Craft**  | Dying — no advantage on either axis           | Commoditizes; AI-output baseline; race to the bottom               |

- **High craft + low speed → product moat.** The Linear / Things 3 / Apple posture. Slow shipping creates anticipation; quality creates word-of-mouth. Sustainable for retention businesses with switching inertia.
- **High craft + high speed → premium pricing, small team.** The Cursor / Granola / Linear-early posture. Possible only with senior generalists who don't need handoffs. Field's "product builder" team is built for this quadrant.
- **Low craft + high speed → commoditizes.** This is where AI-only product teams default. Every shipped feature looks the same as the last AI-built feature. The race is to the bottom; whoever has the cheapest cost structure wins.
- **Low craft + low speed → dying.** No advantage on either axis. Most legacy enterprise software lives here.

The strategic move: pick a quadrant deliberately. Most teams drift toward "low craft + high speed" because AI makes it cheap. The drift _is_ the failure mode.

## AI-Era Specific Failure Modes

Name these by name in roadmap meetings and pre-launch reviews. They're the specific traps that didn't exist before models could generate working software.

- **"Looks great in screenshots, fails on use" — the AI-output trap.** v0/Lovable/Cursor-generated screens often photograph well and break on real interaction. Static review is no longer sufficient.
- **Convergence to a sterile mean (Inter + slate-500 + rounded-2xl + lucide).** AI defaults to the median of its training corpus. Without explicit visual departure, every AI-built product converges to the same look. This is "Shadcn slop" — Lu names it directly.
- **Component sprawl.** Every prompt creates a new variant; without a design system enforcing unity, six months later you have 47 button variants and zero coherence.
- **Naming inflation.** Field's "Make Design" → users expected finality; should have been "First Draft." AI features tempted to overpromise in the name. Naming sets user expectations more than any onboarding.
- **Quality eval theater.** Field: "vibes-only is not eval. Vibes get you somewhere, but it's not rigorous." Adversarial QA before launch — type "make me a weather app," not "make me a generic SaaS dashboard."
- **Speed-as-shipping-debt.** Every shipped-fast feature creates support, bug, and legacy debt. The faster you ship at low quality, the slower you ship in 18 months.
- **The "outsource judgment" trap.** Saarinen's central warning. AI doesn't just accelerate execution; it tries to make _judgment_ optional. The team that lets it succeed loses the moat.
- **Process collapse without taste replacement.** Wen: the traditional design process is dead — discover, mock, iterate is no longer how design happens. But teams that abandon the process without replacing it with taste discipline ship the convergent mean. The AI doesn't fill the judgment gap; it widens it.
