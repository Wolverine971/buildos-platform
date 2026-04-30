---
name: ai-era-craft-and-quality-moat
description: Decide where craft still matters when AI makes shipping working code cheap. Apply when prioritizing quality investments, evaluating "good enough vs. excellent" tradeoffs, defending craft hires against AI-substitution arguments, defining a quality north star, or building a moat in a category where everyone now ships fast. Use to back product strategy, hiring rubrics, and roadmap arbitration — not as a per-screen audit (use `visual-craft-fundamentals`, `ui-ux-quality-review`, or `calm-software-design-review` for that).
path: docs/research/youtube-library/skill-drafts/ai-era-craft-and-quality-moat/SKILL.md
---

# AI-Era Craft And Quality Moat

Use this skill to make **strategic** decisions about where craft is your moat in a world where AI has commoditized "shipping working software." This is a playbook for founders, product leaders, and design leaders deciding which dimensions of craft to over-invest in, which to delegate to AI, and how to defend the craft posture against the gravitational pull of "AI can do this fast enough."

This is the **strategy layer** above per-surface audits. The CEO/founder thesis (Field, Wen, Lu) and the operator backbone (Saarinen, Schoger, Changuel) converge on the same conclusion: speed without judgment produces mediocrity at scale; speed plus taste compounds. The job of this skill is to translate that conclusion into a decision framework you can hand to a roadmap meeting, a hiring loop, or a board deck.

## When to Use

- Prioritizing quality investments — deciding which features, surfaces, or polish work deserves disproportionate craft effort
- Evaluating a "good enough vs. excellent" tradeoff on a roadmap arbitration
- Defending craft hires against AI-substitution arguments ("can't an LLM do this?")
- Defining a quality north star for a small team that has to choose what to over-invest in
- Building a moat in a category where every competitor now ships features at AI speed
- Diagnosing why a product feels like "AI slop" despite functional parity with competitors
- Setting the hiring rubric for a team in the AI era — generalist product builders vs. specialists

**Do not use this skill for:**

- Per-screen visual reviews → use `visual-craft-fundamentals` (Schoger / Refactoring UI)
- In-app UI/UX audits → use `ui-ux-quality-review`
- Calm-software / restraint review of a flow → use `calm-software-design-review` (Saarinen)
- Marketing site section-by-section audit → use `marketing-site-design-review`
- Tactical "fix this button" requests — this skill answers _whether to fund_ the fix, not how to do it

## Core Thesis (The Consolidated Argument)

Five independent sources arrive at the same conclusion from different vantage points. The thesis distills as:

1. **Models lower the floor of "shipping working code." That raises the value of taste, judgment, and design.** Anyone can now ship a v0/Lovable/Cursor-generated screen that functions. The differentiator moves up the stack to whether the screen was _judged_, not whether it was _shipped_. Field: "good enough is mediocre." Saarinen: "technology makes it faster to build, but harder to care."

2. **Speed without judgment produces mediocrity at scale; speed plus taste compounds.** AI ships every prompt. A team without taste discipline ships every prompt _too_, and accumulates mediocrity as legacy. A team with taste discipline ships fewer prompts at a higher standard, and compounds quality into a brand.

3. **Quality is _strategy_, not aesthetics.** Linear became profitable in year two on quality differentiation, with effectively zero marketing spend and no sales team for four years. The mechanism is rarity: when most competitors ship at the AI floor, hitting the craft ceiling is the marketing channel.

4. **The craft cycle has repeated for centuries.** Earnest Elmo Calkins complained in 1927 (_Atlantic_) about "the directing minds absorbed in the new wonder of so many things made so easily, only aggravated by the fact that producing these bad designs in incredible quantities." Mass production → process focus → quality decline → renewed longing for craft. AI is the latest acceleration; the cycle is not new.

5. **The AI-era twist: prior tech cycles outsourced labor; AI tries to outsource judgment.** This is the reason the craft argument has new urgency. The team that refuses to outsource judgment wins the next decade.

The five sources agree because they're describing the same underlying mechanic from five vantage points: a CEO of a $20B design platform (Field), a former design director now Head of Design at Anthropic (Wen), a Head of Design at Cursor shipping live (Lu), a CEO/co-founder of a profitable craft-moat product (Saarinen), and a tactical-craft operator behind Tailwind/Refactoring UI (Schoger). The convergence is the argument.

## Where Craft Still Matters Most (The Priority Ladder)

Not all craft dimensions deserve equal investment. This is the opinionated ranking. For each, the question is: _what does AI do well, what does it do badly, and where does the moat live?_

### 1. Taste & Judgment (Highest Moat)

- **What AI does well:** generates options, drafts, explores possibility space.
- **What AI does badly:** chooses. Selecting which of 20 generated variants is the right one is taste; AI cannot do it without a curator.
- **Where the moat lives:** the team that has internalized a point of view — Saarinen's "this is what Linear is" — is the team whose AI output is consistently good. Without taste, AI is a slot machine.
- **Hiring implication:** every hire is a taste hire. Field: "if you use Figma and think they could do so much better here — come tell us." A bold critique is the application.

### 2. Time-to-Value & First-Moment Polish

- **What AI does well:** scaffold the surface area of an onboarding flow.
- **What AI does badly:** identify and remove the specific friction that prevents the first "magic moment."
- **Where the moat lives:** the experience that proves the product (multiplayer collab in Figma; first prompt response in Make; brain-dump → structured project in BuildOS). Field: run a "blockers team" whose only job is to find and kill friction.
- **Hiring implication:** someone has to own this surface end-to-end and have permission to break the roadmap to fix it.

### 3. Information Architecture & Opinionated Defaults

- **What AI does well:** generate every possible configuration option.
- **What AI does badly:** pick the default.
- **Where the moat lives:** Saarinen's opinionated-design thesis. "Productivity software designed for everyone becomes mediocre everywhere." A configurable surface is a confession that the team didn't decide. AI makes it cheap to ship configurability; that's why opinionated defaults are now scarce.
- **Hiring implication:** product leaders who will make the call and live with it.

### 4. Performance & Responsiveness

- **What AI does well:** not this. Performance is engineering discipline.
- **What AI does badly:** ship a fast app. AI-generated code converges to working-but-not-fast.
- **Where the moat lives:** Linear's keyboard responsiveness, local-first sync architecture, sub-100ms perceived latency. Performance is _felt_ as quality even when users can't articulate it. The moat is in the engineering culture that refuses to ship a 600ms paper cut.
- **Hiring implication:** performance budgets enforced from PR review onward.

### 5. Visual Craft (Typography, Color, Density)

- **What AI does well:** baseline-passable layouts. Inter font, slate-500, rounded-2xl, lucide icons.
- **What AI does badly:** hue rotation for perceived brightness (Schoger), constrained palettes, custom type-system pairing, specific spacing/density decisions that feel intentional.
- **Where the moat lives:** the operator-level moves Schoger documents — Refactoring UI fundamentals. Tailwind defaults are a baseline; the moat is in how you _depart_ from them with intent.
- **Hiring implication:** at least one person on the team must have the visual-craft sensibility to override AI defaults.

### 6. Component & Primitive Consistency

- **What AI does well:** generate a new component on demand.
- **What AI does badly:** enforce that every prompt generates the _same_ button.
- **Where the moat lives:** an enforced design system (BuildOS Inkprint, Linear's Vector, Granola's tokens). Without a system, AI generates 47 button variants over six months. With one, AI extends the system.
- **Hiring implication:** designate a design-system owner; treat token drift as a defect.

### 7. Copy and Microcopy

- **What AI does well:** drafts.
- **What AI does badly:** voice. AI defaults to a generic, helpful, slightly cheerful tone that erodes brand.
- **Where the moat lives:** consistent voice across error states, empty states, success messages, support copy. Saarinen's Linear tweet — "the product just feels right; support fixed my issue in 45 minutes" — is voice.
- **Hiring implication:** at least one founder/leader edits all user-facing copy until the voice is set.

### 8. Accessibility

- **What AI does well:** boilerplate ARIA attributes.
- **What AI does badly:** keyboard navigation flows, focus management, screen-reader narrative ordering, contrast ratio decisions on colored backgrounds.
- **Where the moat lives:** an accessibility floor enforced as a non-negotiable. As regulation tightens, this becomes a legal moat too.
- **Hiring implication:** an accessibility champion; a11y as part of definition-of-done.

### What AI Does Well — Delegate Confidently

- Boilerplate components and CRUD scaffolding
- Layout scaffolding for new screens (then hand-tune)
- Dark-mode variant generation
- Copy drafts and content variations
- Visual exploration alts (give it a prompt, harvest options)
- Test generation, refactor passes, type derivations
- Documentation drafts (then edit for voice)

Delegate aggressively to AI on these. Save human judgment for the ladder above.

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

## Quality As A Hiring Rubric

Saarinen's framework, adapted for the AI era. Apply when hiring engineers, designers, PMs — anyone making product decisions.

- **Look for makers across functions, not specialists.** Field's "product builder" merger thesis. Wen's "three archetypes" all have generalist instinct + deep craft in one area. Lu at Cursor: "the roles between designers, PMs, engineers are really muddy. We just do the part that does our unique strength."
- **Bias toward "high judgment + roll up sleeves."** Field: "Required traits — craft excellence, growth mindset, self-awareness, humility, integrity, ability to push craft forward."
- **The candidate's bar critique of your product _is_ the application.** Don't ask candidates to do generic case studies; ask them what's broken in your product and what they'd do. Their answer reveals taste in 15 minutes.
- **Small teams with judgment beat large teams with handoffs.** Saarinen: "It was always easier to work with a smaller team of very high quality people than with a very large team of more average people." Linear ran below 50 employees through 10,000+ paying organizations.
- **No specialized product teams that fragment quality.** Saarinen: "Users don't care about your org chart — they care about the experience." Permanent feature ownership creates org-chart-shaped quality.
- **Paid work trials over take-home tests.** Saarinen's pattern: vague problem, real codebase access, multi-day paid contract. Both sides see the actual fit.
- **Hire wider than the title.** Engineers who can think product. Marketers with taste in writing. Operations people who understand HR. The Linear pattern: "when you have these people that are a little bit more than their title, the company is much easier to manage."

The AI-era addition: **filter for taste in AI use.** Candidates who claim "I 5x'd my output with Cursor" without showing the discipline to evaluate that output are red flags. Candidates who can articulate _where they refuse to delegate to AI_ are demonstrating exactly the judgment you're hiring for.

## Quality As A Roadmap Framework

Apply Saarinen's 10 Rules to roadmap arbitration. The rules don't change because AI shipped — they get _more_ useful, because the cost of shipping went down and the cost of shipping mediocre work went up.

- **The spec is the baseline, not the goal ("a door is a door" rule).** A door that opens functions. A door whose open-and-close motion feels right is craft. AI ships the first; it cannot ship the second without explicit direction. Codify the door test in design review.
- **Scope reduction increases quality.** Teams missing the bar are usually attempting too much. Saarinen's roadmap feature shipped narrower than the team thought it needed — then expanded based on real use. AI makes it _feel_ free to keep features in scope; the cost is hidden in the quality decline.
- **Internal MVP before external launch.** Ship to production gated behind a feature flag for the team. Use the product. Find the gaps. Then opt in 1–10 customers. Public release means the standard is hit.
- **No A/B testing as a crutch.** A/B tests resolve which of two mediocre options is less mediocre. They do not resolve "is this any good." Saarinen's rule: trust intuition trained by direct customer contact (founder-handled support, weekly customer calls, customer Slack channels).
- **Trust intuition + user conversations over metrics.** Per-feature engagement goals incentivize the wrong behavior in retention businesses. Company-level WAU is a fine metric; per-feature WAU is a corrupting one.
- **7-day zero-bug fix window.** Bugs are defects. Backlogged bugs compound. AI-generated code accumulates more bug surface area, not less; the zero-bug discipline gets _harder_ to enforce in the AI era, which is exactly why it's the moat.
- **Avoid side quests; fund the main quest.** Every feature has to pass: _does this progress the main quest line?_ If side quest, defer or delete. Small teams cannot afford side quests, and the AI-era trap is that side quests feel cheap (because shipping them is) — but the support, bug, and legacy debt is not free.

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

## The Craft-vs-Speed Tradeoff Matrix

Where does your product sit, and where do you want it to sit?

|                       | Low Speed                                     | High Speed                                                          |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------- |
| **High Craft**        | Product moat (Linear, Things, Apple, Granola) | Premium price + small team (Cursor, Linear early, Granola, Stripe) |
| **Low Craft**         | Dying — no advantage on either axis            | Commoditizes; AI-output baseline; race to the bottom                |

- **High craft + low speed → product moat.** The Linear / Things 3 / Apple posture. Slow shipping creates anticipation; quality creates word-of-mouth. Sustainable for retention businesses with switching inertia.
- **High craft + high speed → premium pricing, small team.** The Cursor / Granola / Linear-early posture. Possible only with senior generalists who don't need handoffs. Field's "product builder" team is built for this quadrant.
- **Low craft + high speed → commoditizes.** This is where AI-only product teams default. Every shipped feature looks the same as the last AI-built feature. The race is to the bottom; whoever has the cheapest cost structure wins.
- **Low craft + low speed → dying.** No advantage on either axis. Most legacy enterprise software lives here.

The strategic move: pick a quadrant deliberately. Most teams drift toward "low craft + high speed" because AI makes it cheap. The drift _is_ the failure mode.

## The Saarinen / Field / Wen / Lu Consensus

Four leaders, four independent vantage points, one consensus.

| Claim                                                  | Saarinen | Field | Wen | Lu  |
| ------------------------------------------------------ | -------- | ----- | --- | --- |
| Craft is the moat in the AI era                        | Yes      | Yes   | Yes | Yes |
| Hire for taste + judgment, not for skills + output     | Yes      | Yes   | Yes | Yes |
| Roles merge into "product builder"                     | Yes      | Yes   | Yes | Yes |
| Generic AI output ≠ shipped product                    | Yes      | Yes   | Yes | Yes |
| Founder-led design at the start scales                 | Yes      | Yes   | —   | Yes |
| Small teams of generalists beat large teams of specialists | Yes  | Yes   | Yes | Yes |
| The traditional "discover → mock → iterate" is obsolete | Partial | Yes   | Yes | Yes |
| Prototype-in-code beats static mocks                   | —        | Yes   | Yes | Yes |
| Refuse to outsource judgment                           | Yes      | Yes   | Yes | Yes |

The four diverge on tactics — Saarinen avoids A/B tests, Field uses evals; Saarinen rejects metric-driven feature goals, Field optimizes time-to-value with telemetry — but they converge on the strategic frame. _Whether_ to bet on craft is settled. _How_ to operate craft is the variable.

## Comparison: Craft Moat (Saarinen / Field) vs. Delight Moat (Changuel)

Both schools are valid; they apply to different categories and audience postures. Naming both lets you pick.

| Dimension              | Craft Moat (Saarinen / Field)                                | Delight Moat (Changuel)                                         |
| ---------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| Quality target         | "Feels right" — door test; perception of judgment            | Joy + surprise; emotion at the heart of the experience           |
| Where it shines        | B2B power-user retention; trust-driven categories            | Crowded B2C / B2H categories; emotional differentiation needed   |
| What it forbids        | Engagement features unrelated to the main quest              | Inhumane delight (Mother's Day call notification, etc.)          |
| Roadmap discipline     | Reduce scope; opinionated defaults; main quest only          | 50-40-10 split (functional / deep delight / surface delight)     |
| Audience emotion       | Calm, trust, focus; respect for the user's time              | Joy, surprise, belonging                                          |
| AI posture             | Refuse to outsource judgment; AI as scaffolding only         | Use AI to maintain habituation-fighting cadence (Meet backgrounds) |
| BuildOS fit            | Strong — anti-feed positioning maps 1:1                      | Weak — would push BuildOS toward confetti                         |

The two schools share the same parent: _both_ argue against feature-count-as-strategy. They differ on what fills the gap. For BuildOS, the craft-moat school is the right parent.

## Application To BuildOS

This skill, applied to BuildOS in 2026, gives concrete posture decisions.

### 1. Anti-Feed Positioning Is A Quality-As-Moat Positioning

The BuildOS brand promise — "thinking environment for people making complex things" — is structurally identical to Linear's "issue tracking you'll love using." Both define audience by exclusion. Both promise craft + restraint, not feature parity. Both refuse to compete on AI-feature count.

The marketing implication: stop hedging the audience. BuildOS is not "a productivity tool with AI." It is "a thinking environment for the small set of people who refuse to outsource their judgment to a feed." Every public claim should pass the Saarinen test — _is this opinionated, or is it trying to appeal to everyone?_

### 2. Surface Triage

Apply the priority ladder concretely:

| Surface                              | Posture          | Reasoning                                                                |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------ |
| Brain-dump entry + processing        | High-craft       | Competitive surface; first-impression; the thing the brand promises      |
| Daily brief                          | High-craft       | Competitive surface; the user's daily moment of value                    |
| Project structuring / context        | High-craft       | The proof of intelligence; users compare against ChatGPT/Notion          |
| Agentic chat                         | High-craft       | The new surface where taste in AI shows                                  |
| Calendar sync                        | Hybrid           | Functional surface; AI baseline + manual polish on conflict UX           |
| Settings / billing                   | AI-baseline      | Internal admin; ship competently and move on                             |
| Onboarding                           | High-craft       | First-impression surface; disproportionate investment                    |
| Error states across the product      | High-craft       | Voice + trust signal; cannot be left to AI                               |
| Marketing site                       | High-craft       | Competitive surface; users compare against Linear, Granola, Things       |

The trap: spreading craft effort uniformly. The right move: invest disproportionately in the brain-dump → brief → structure pipeline; ship billing/settings at AI-baseline.

### 3. Inkprint Design System As The Craft-Token Enforcement Layer

[Inkprint](../../../../apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md) is BuildOS's craft-token layer. The framing improves how it's positioned:

- Inkprint is the calm-software design system — texture-based, halftone-inspired, field-notes-coded. Structurally the opposite of Material Design's confetti. Lean into the contrast publicly.
- Tokens are the spec; the application is the craft. A `bg-card` and `tx-bloom` are the door's hinges; how they combine on a specific screen is the swing.
- Every AI-generated component gets normalized through Inkprint tokens before it ships. No exceptions. Token drift is a defect (Saarinen 7-day fix window applies).

### 4. Hiring Posture

Apply directly:

- **Judgment > years.** A two-year senior with strong taste beats a five-year senior who waits for specs.
- **One craft-strong builder > three "AI-supercharged" generalists.** The latter accumulate convergent-mean output; the former produces _difference_.
- **Paid work trial as the final stage.** Saarinen's pattern. Real codebase access, real Slack, real meetings, vague problem.
- **Filter for AI taste.** Candidates who can articulate _where they refuse to delegate to AI_ are demonstrating the judgment you need. Candidates who lead with "I 5x'd my output with Cursor" are red flags.

### 5. Roadmap Posture

- Internal MVPs first; external launch only when the standard is hit.
- Default-no on external feature requests that don't progress the main quest.
- 7-day zero-bug rule on competitive surfaces; longer tolerance on AI-baseline surfaces.
- No A/B tests on the brain-dump flow; trust intuition trained by direct customer contact.
- Reduce scope to increase quality on every feature in flight.

## Output Format

When applying this skill to a decision (a feature ship/cut call, a hire/no-hire call, a roadmap arbitration), return:

```
Decision Summary
  - what is being decided
  - the candidate options

Craft-Moat Dimensions Implicated
  - which of the priority-ladder dimensions are at stake (taste, time-to-value, IA, performance, visual, components, copy, a11y)

Where AI Helps vs. Where Craft Must Lead
  - delegated to AI: <list>
  - human judgment required: <list>

Surface Posture
  - high-craft / hybrid / AI-baseline
  - reasoning anchored to the 5-question filter

Recommended Decision
  - ship / cut / hire / pass / arbitrate
  - what the decision protects (moat-wise) and what it risks

Risks If You Optimize The Wrong Axis
  - specific failure modes from the AI-era list
  - which sources predict the failure (Saarinen / Field / Wen / Lu / Schoger)

Counter-Position (steel-man)
  - the strongest argument _against_ this decision
  - the conditions under which the counter-position would be right
```

The output is always opinionated. The point of the skill is to make the call, not to enumerate options.

## Guardrails

- **Do not use this skill as an excuse for "all surfaces deserve maximum craft."** Cost matters; some surfaces are AI-baseline + manual polish only. The skill _allocates_ craft, it doesn't maximize it everywhere.
- **Do not conflate "craft" with "polished aesthetic."** Judgment > pixel-perfect. A well-judged plain interface beats a beautifully-rendered confused one.
- **Do not assume craft applies equally across B2B / B2C / consumer / enterprise.** Saarinen's framework works best in B2B retention with switching inertia. Apply with adjustment elsewhere.
- **Do not skip evals on AI features.** Field is direct: vibes is not eval. Build adversarial QA, real benchmarks, willingness to pull (Make Design → First Draft).
- **Do not pull this skill for tactical per-screen reviews.** Use `visual-craft-fundamentals`, `ui-ux-quality-review`, or `calm-software-design-review`. This skill is about _whether_ to fund the review, not how to do it.
- **Do not assume "ship faster" is always the answer.** Saarinen ships slower than competitors and wins on quality. Speed is a knob; not every position should turn it up.
- **Do not assume the calm-software school and the craft-moat school disagree.** They're the same school applied at different layers. Saarinen embodies both: calm is the user-facing posture, craft is the operational discipline that produces calm.
- **Do not let AI-era failure modes go unnamed in the room.** If "looks great in screenshots, fails on use" is happening, say it. If "Shadcn slop" is happening, say it. If "naming inflation" is happening, say it. The failure modes have names; use them.

## Source Attribution

Distilled from five sources, all 2026.

- **Karri Saarinen / Linear** — _Inside Linear: Building with taste, craft, and focus_ ([Lenny's Podcast](https://www.youtube.com/watch?v=4muxFVZ4XfM)), _Crafting quality that endures_ ([Config 2025](https://www.youtube.com/watch?v=pCil7YNhNCU)), _Conversations on Quality, Ep. 02_ ([Linear](https://www.youtube.com/watch?v=R1bwdtQL5uU)), _10 Rules for Crafting Products That Stand Out_ (Figma blog), _Why is Quality So Rare?_ (linear.app/now). Local consolidated analysis: `docs/research/youtube-library/analyses/2026-04-29_karri-saarinen-linear_craft-and-calm-software_analysis.md`.
- **Dylan Field / Figma** — _On Design, Craft & Quality as the New Moat_ ([Lenny's Podcast](https://www.youtube.com/watch?v=WyJV6VwEGA8)). Local analysis: `docs/marketing/growth/research/youtube-transcripts/2026-04-28-dylan-field-figma-ceo-design-craft-moat-ANALYSIS.md`.
- **Jenny Wen / Anthropic** — _The design process is dead. Here's what's replacing it._ ([Lenny's Podcast](https://www.youtube.com/watch?v=eh8bcBIAAFo)). Local transcript: `docs/marketing/growth/research/youtube-transcripts/2026-03-01_jenny-wen_design-process-dead.md`.
- **Ryo Lu / Cursor** — _Full Tutorial: Design to Code with Cursor's Head of Design_ ([YouTube, with Peter Yang](https://www.youtube.com/watch?v=bdh8k6DyKxE)). Local transcript: `research-library/transcripts/podcast-ryo-lu-peter-yang.md`.
- **Steve Schoger / Refactoring UI** — _Practical Solutions to Common UI Design Problems_ ([CSS Day 2019](https://www.youtube.com/watch?v=7Z9rrryIOC4)). Local analysis: `docs/research/youtube-library/analyses/2026-04-29_steve-schoger_refactoring-ui_analysis.md`.

Contrast source (delight-moat school, useful for triangulation):

- **Nesrine Changuel** — _4-Step Delightful Products Framework_ ([Lenny's Podcast](https://www.youtube.com/watch?v=tX6nwT1Bsuo)). Local analysis: `docs/marketing/growth/research/youtube-transcripts/2026-04-28-nesrine-changuel-4-step-delightful-products-framework-ANALYSIS.md`.

## Cross-Linked Skills

- `calm-software-design-review` — operational layer of Saarinen's framework applied per-flow
- `visual-craft-fundamentals` — Schoger's tactical visual moves
- `ui-ux-quality-review` — in-app UI audit applying both
- `marketing-site-design-review` — public-facing surface audit
- `delightful-product-review` — Changuel's school, the contrast position
- `taste-driven-toolmaking` — applies the same lens to internal tools / dev tooling
