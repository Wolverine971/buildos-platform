<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ai_era_craft_and_quality_moat/references/craft-priority-ladder.md -->

# Craft Priority Ladder: Where Craft Still Matters Most

Use this reference when allocating craft investment across dimensions or surfaces, deciding what to delegate to AI versus keep under human judgment, or setting a quality north star. Not all craft dimensions deserve equal investment — this is the opinionated ranking. For each, the question is: _what does AI do well, what does it do badly, and where does the moat live?_

## 1. Taste & Judgment (Highest Moat)

- **What AI does well:** generates options, drafts, explores possibility space.
- **What AI does badly:** chooses. Selecting which of 20 generated variants is the right one is taste; AI cannot do it without a curator.
- **Where the moat lives:** the team that has internalized a point of view — Saarinen's "this is what Linear is" — is the team whose AI output is consistently good. Without taste, AI is a slot machine.
- **Hiring implication:** every hire is a taste hire. Field: "if you use Figma and think they could do so much better here — come tell us." A bold critique is the application.

## 2. Time-to-Value & First-Moment Polish

- **What AI does well:** scaffold the surface area of an onboarding flow.
- **What AI does badly:** identify and remove the specific friction that prevents the first "magic moment."
- **Where the moat lives:** the experience that proves the product (multiplayer collab in Figma; first prompt response in Make; brain-dump → structured project in BuildOS). Field: run a "blockers team" whose only job is to find and kill friction.
- **Hiring implication:** someone has to own this surface end-to-end and have permission to break the roadmap to fix it.

## 3. Information Architecture & Opinionated Defaults

- **What AI does well:** generate every possible configuration option.
- **What AI does badly:** pick the default.
- **Where the moat lives:** Saarinen's opinionated-design thesis. "Productivity software designed for everyone becomes mediocre everywhere." A configurable surface is a confession that the team didn't decide. AI makes it cheap to ship configurability; that's why opinionated defaults are now scarce.
- **Hiring implication:** product leaders who will make the call and live with it.

## 4. Performance & Responsiveness

- **What AI does well:** not this. Performance is engineering discipline.
- **What AI does badly:** ship a fast app. AI-generated code converges to working-but-not-fast.
- **Where the moat lives:** Linear's keyboard responsiveness, local-first sync architecture, sub-100ms perceived latency. Performance is _felt_ as quality even when users can't articulate it. The moat is in the engineering culture that refuses to ship a 600ms paper cut.
- **Hiring implication:** performance budgets enforced from PR review onward.

## 5. Visual Craft (Typography, Color, Density)

- **What AI does well:** baseline-passable layouts. Inter font, slate-500, rounded-2xl, lucide icons.
- **What AI does badly:** hue rotation for perceived brightness (Schoger), constrained palettes, custom type-system pairing, specific spacing/density decisions that feel intentional.
- **Where the moat lives:** the operator-level moves Schoger documents — Refactoring UI fundamentals. Tailwind defaults are a baseline; the moat is in how you _depart_ from them with intent.
- **Hiring implication:** at least one person on the team must have the visual-craft sensibility to override AI defaults.

## 6. Component & Primitive Consistency

- **What AI does well:** generate a new component on demand.
- **What AI does badly:** enforce that every prompt generates the _same_ button.
- **Where the moat lives:** an enforced design system (BuildOS Inkprint, Linear's Vector, Granola's tokens). Without a system, AI generates 47 button variants over six months. With one, AI extends the system.
- **Hiring implication:** designate a design-system owner; treat token drift as a defect.

## 7. Copy and Microcopy

- **What AI does well:** drafts.
- **What AI does badly:** voice. AI defaults to a generic, helpful, slightly cheerful tone that erodes brand.
- **Where the moat lives:** consistent voice across error states, empty states, success messages, support copy. Saarinen's Linear tweet — "the product just feels right; support fixed my issue in 45 minutes" — is voice.
- **Hiring implication:** at least one founder/leader edits all user-facing copy until the voice is set.

## 8. Accessibility

- **What AI does well:** boilerplate ARIA attributes.
- **What AI does badly:** keyboard navigation flows, focus management, screen-reader narrative ordering, contrast ratio decisions on colored backgrounds.
- **Where the moat lives:** an accessibility floor enforced as a non-negotiable. As regulation tightens, this becomes a legal moat too.
- **Hiring implication:** an accessibility champion; a11y as part of definition-of-done.

## What AI Does Well — Delegate Confidently

- Boilerplate components and CRUD scaffolding
- Layout scaffolding for new screens (then hand-tune)
- Dark-mode variant generation
- Copy drafts and content variations
- Visual exploration alts (give it a prompt, harvest options)
- Test generation, refactor passes, type derivations
- Documentation drafts (then edit for voice)

Delegate aggressively to AI on these. Save human judgment for the ladder above.
