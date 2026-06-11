<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/ai_era_craft_and_quality_moat/references/hiring-and-roadmap-rubrics.md -->

# Hiring & Roadmap Rubrics

Use this reference when running a hiring loop, evaluating a candidate, writing a hiring rubric, arbitrating a roadmap, scoping a feature, or setting release discipline. Apply the rubric lines directly — they are decision rules, not inspiration.

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
