<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/calm_software_design_review/references/simplicity-rubric.md -->

# Simplicity Rubric & Calm-vs-Delight Verdict

Use this reference when the surface checklist passes but the screen still feels off, when triaging what to subtract vs. sharpen, or when rendering the calm-vs-delight verdict. This is the judgment layer: foundational principles, Maeda's 10 Laws as an operational rubric, the quality-without-a-name diagnostics, and the two-schools comparison.

## Foundational principles

Most calm-software failures trace back to one of these being ignored. Cite the named principle in findings.

- **"Subtract the obvious; add the meaningful."** (Maeda, Law 10.) For every element: is it _obvious_ (every competitor has it, no one is differentiated by it) or _meaningful_ (specific to this product's identity)? Subtract the first; sharpen the second. The trap is reversed-priority engineering — most design effort on the obvious features (easier to scope), meaningful features shipped as undifferentiated MVPs.
- **"Tools should disappear during use."** (Jainek.) During use the user looks at their own content, not at the app's UI announcing itself. Every UI element either earns its presence by being load-bearing for the user's content, or it gets stripped.
- **"Quality is the moat; speed at the cost of care is debt."** (Saarinen.) The spec is the baseline minimum, not the goal. "A door is a door, and if it opens, it technically functions. It's easy to meet the spec. It's harder to do the craft." Excellence is what happens after the spec is met — animation timing, keyboard handling, cursor position after the modal closes.
- **"It doesn't have to be crazy."** (Fried/DHH.) Stress in the product mirrors stress in the company; if the team is in dread-line mode, the UI will leak it. Calm operations is upstream of calm software.
- **"Do not over-organize."** (Jainek.) More hierarchy makes things harder to find. Things ships only Projects + Areas — fifteen years in, top of the App Store. Folders-of-folders is a confession of indecision. Most "feature bloat" complaints are organization failures, not feature-count failures (Maeda Law 2): 40 well-grouped features can feel simpler than 12 ungrouped ones.
- **"Opinionated defaults beat flexible everything."** (Saarinen.) Configurability is a tax on the user; a strong default is a gift. Productivity software designed for everyone becomes mediocre everywhere. Pick the audience; pick the workflow; pick the default.
- **"More emotions are better than fewer — calm doesn't mean sterile."** (Maeda, Law 7.) The most common failure of calm-school imitators is stripping warmth in the name of clean. "The sky is not 41% gray." Calm is restraint paired with strong opinion, not minimalism applied to soul. Color, voice, texture, and signature interactions are simplicity allies.
- **"Trust users; don't manufacture engagement."** (Fried/DHH; Saarinen.) Streaks, badges, login bonuses, urgency timers, fake FOMO — evidence the team doesn't trust the product to retain users on its merits. In a retention business, manufactured engagement is a leading indicator of churn.
- **"Constraint-driven creativity over feature accumulation."** (Ango.) A small, well-chosen set of primitives is more generative than a large set of customizations — Obsidian's plain-text files, Linear's cycles, Things's Projects-and-Areas, Basecamp's six-week cycles.
- **"Internal-only MVPs; ship to yourself first."** (Saarinen; Fried/DHH.) Features pass through internal-flag use before any external opt-in. Public release means the standard has been hit; beta means rough edges with explicit opt-in.
- **"Reduce scope to increase quality."** (Saarinen.) Teams missing the bar are usually attempting too much. "Quality isn't binary — it's about continuously refining a product to meet a standard." Calm software fixes quality and lets scope be the variable — not the reverse.

## The 10 Laws of Simplicity (Maeda) — operational rubric

Walk the laws in order for every surface under review.

| #   | Law             | Sub-rule                                              | Operational question for this surface                                                                                                            |
| --- | --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Reduce**      | **SHE** — Shrink, Hide, Embody                        | What can shrink? What can hide behind disclosure? What must be _embodied_ (given quality, weight, finish) so the residual doesn't read as cheap? |
| 2   | **Organize**    | **SLIP** — Sort, Label, Integrate, Prioritize         | Are remaining elements sorted by user-meaningful axis, labeled in user vocabulary, deduplicated, and ranked by primacy?                          |
| 3   | **Time**        | Reduce wait, mask wait, make wait pleasant            | Where can optimistic UI, skeleton state, or pre-fetching cut perceived wait? Time-to-first-meaningful-render?                                    |
| 4   | **Learn**       | Teach what cannot be removed                          | What inherent complexity remains? Is it taught (tooltip, empty state, onboarding step) or hidden in a way that confuses later?                   |
| 5   | **Differences** | Contrast makes simple feel simple                     | Is there contrast between this surface and adjacent ones? If everything is equally minimal, is the calm legible at all?                          |
| 6   | **Context**     | The periphery is not peripheral                       | Is whitespace, framing, transition, empty state treated as primary, or as leftover? Cut them and the figure stops working.                       |
| 7   | **Emotion**     | More emotions are better than fewer                   | Has this been stripped to sterility? Where is the warmth, voice, or detail that makes this _this_ product?                                       |
| 8   | **Trust**       | Defaults must be trustworthy because users won't read | Are the defaults opinionated and good? Is undo / export / inspect available so the user can recover when defaults are wrong?                     |
| 9   | **Failure**     | Some things can never be made simple                  | What inherent complexity is essential to the product's value? Frame it honestly; do not pretend it isn't there.                                  |
| 10  | **The One**     | Subtract the obvious; add the meaningful              | What's _obvious_ (generic, in every competitor) — subtract. What's _meaningful_ (specific to this product) — sharpen.                            |

**Three Keys**, also applied: **Away** (state moved out of view is recoverable, not gone), **Open** (system is inspectable — view raw, see why, export anywhere), **Power** (use does not deplete the user's attention or energy over time).

## The quality-without-a-name diagnostics (Saarinen / Christopher Alexander)

When the door test, the disappearance test, the engagement-manufacturing checklist, and the Maeda Laws all pass — and the surface still feels off — ask three questions:

- **Does this feel like one team made it, or like a sequence of decisions stacked on each other?** Calm software has a felt unity; design-by-committee leaks at the seams.
- **Does this feel like the team that made it cared, or like the team met the spec?** Caring is felt at the level of a single hover state, a single transition, a single error message.
- **Does this feel inevitable?** The strongest calm surfaces feel like there is only one way they could be — every other way is obviously worse. If the surface feels arbitrary, it has not yet earned the door test.

This layer is qualitative by design. The checklist gets the surface to "spec met"; the door test, disappearance test, and these diagnostics get it to craft.

## Calm school vs delight school

The wedge: **what state does the user arrive in?** Under-stimulated → delight is correct. Already-loaded → calm is correct. Confetti for a user finishing a Spotify year is right; confetti for a user finishing a brain-dump after a stressful Tuesday is hostile. BuildOS is firmly in the calm school.

| Dimension          | Calm school (Saarinen / Jainek / Fried / Maeda)                     | Delight school (Changuel / Lovable / Cheng)                              |
| ------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Goal               | Restraint, focus, trust, the tool that disappears                   | Joy, surprise, anticipation, emotional connection                        |
| Audience emotion   | Already loaded — under stress, time pressure, cognitive load        | Under-stimulated — bored, ready to be charmed                            |
| Roadmap balance    | Main quest only; default-no on side quests                          | 50% functional / 40% deep delight / 10% surface delight                  |
| Defaults           | Opinionated, strong, unconfigurable in the front door               | Personalized, anticipated, surprise-shaped                               |
| Notifications      | Off by default; opt-in; meaningful only                             | On by default; engagement-shaped; re-engagement allowed                  |
| Celebrations       | Earned only — Superhost, not Duolingo                               | Confetti for valley-moment rescues and milestone moments                 |
| Engagement metrics | Company-level retention; never per-feature                          | Per-feature engagement; valley-rescue scores                             |
| Quality target     | "Feels right" — door test, disappearance test, craft-beyond-spec    | Joy + emotional resonance; delight-grid pass                             |
| Where it shines    | B2B power-user retention; productivity tools; thinking environments | B2C entertainment; social; creative tools; under-stimulation categories  |
| Where it fails     | When applied without bias-to-ship — stagnation; calm-as-aesthetic   | When applied to loaded audiences — confetti during stress destroys trust |
