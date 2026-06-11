<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/delightful_product_review/references/delight-gates-and-antipatterns.md -->

# Delight Gates & Anti-Patterns: Pre-Ship Checklist, Anti-Delight Rejections, 50-40-10 Roadmap Audit, Buy-In

Use this reference when validating a delight candidate before it ships, rejecting an anti-delight pattern, auditing roadmap balance, diagnosing a delight feature that landed flat, or framing the findings for a skeptical leader.

## The Delight Checklist (pre-ship validation gate)

Before shipping any candidate flagged as delight, every box must be checked. Report each gate as pass/fail per candidate.

- **User impact** — does it move a user metric we believe in? (Retention, activation, NPS, qualitative recall.)
- **Business impact** — is it tied to a business goal, not a vibe? Delight is not an aesthetic excuse.
- **Feasibility** — can we ship and _maintain_ it? Every delight feature has support cost, performance cost, accessibility cost.
- **Familiarity** — are we surprising too much? Pure novelty fails. Discover Weekly's launch metric _dropped_ when engineers fixed the "bug" that injected familiar tracks; the buggy version was reinstated. Surprise interleaved with familiarity is delight; pure surprise is shock.
- **Inclusion** — what's joyful for one user is painful for another. Audit edge cases hard: bereavement, mental-health context, cultural sensitivity, accessibility, neurodiversity. (See Anti-Delight Failure Modes.)
- **Maintainability of surprise** — is there a continuous-innovation plan? Surprise decays; without an iteration cadence the feature becomes invisible within weeks.

## Habituation risk

Habituation kills delight features that don't keep evolving. First use = wow, fifth use = wallpaper. Require a continuous-innovation cadence — the canonical model is Google Meet's background sequence: blur → static → video → immersive → AI-generated. A delight feature with no iteration plan fails the maintainability-of-surprise gate.

## Anti-Delight Failure Modes (reject on pattern-match)

The ways "delight" features actively destroy trust. Reject any candidate that pattern-matches one of these; cite the named failure mode in the finding.

- **Mother's Day fake-call notification (Deliveroo France).** Push notification designed to look exactly like a missed call from "Mom." Joyful for users with living mothers; gut-punch for users who'd lost theirs. Worst press of any feature in France that year. **Inclusion failure.**
- **Therapy-session fireworks (Apple gesture reactions).** OS-level gesture detection triggered animations during a video therapy call when the user gestured to show his hurt finger to his therapist. "What an appropriate time for fireworks." **Context-blind delight.**
- **Confetti for routine actions** — celebrating "you saved a draft" or "you logged in 3 days in a row" as if it's an Olympic medal. The underlying moment carries no weight; the animation reads as condescension.
- **Gamification that punishes lapses** — streak loss, shaming dashboards, daily-login pressure. Devastating to ADHD, burnout, depression, post-illness, or grief users. Productivity tools are especially exposed here.
- **Over-organization that defeats the calm tool's purpose** — adding "delightful" structure (categories, tags, taxonomies) to a tool whose value was being unstructured. Common failure mode for note-taking and brain-dump products.
- **Surface delight as substitute for functional reliability** — animations on a feature that crashes, tone of voice on a 503 page, polish on a broken funnel. Delight cannot fix broken; it amplifies the gap.
- **Default-on celebrations in unknown contexts** — anything that fires automatically without an opt-in toggle. Inclusion risk is too high; one bad press cycle erases the gain for everyone else.

## The 50-40-10 Roadmap Rule

Audit the roadmap (quarterly or per-release) against this ratio:

- **50% functionality** — performance, reliability, parity, table-stakes.
- **40% deep delight** — features that solve real problems with emotional resonance baked in.
- **10% surface delight** — celebrations, recaps, easter eggs, magic-moment redesigns.

**How to audit a roadmap against the ratio:**

1. List every feature/work-item in the next planning cycle.
2. Tag each as low / surface / deep delight using the delight grid.
3. Sum the engineering-effort estimates per category.
4. Compare against 50/40/10. Flag deviations.
5. **Common diagnoses:**
    - _Over 60% functionality_ — team is in foundation-fix mode (often correct for early-stage; the framework target is steady-state).
    - _Under 30% deep delight_ — root cause of "we're a tool, not a product people love."
    - _Over 15% surface delight_ — playing aesthetic games while functional gaps lose users.
    - _Zero surface delight_ — risk of habituation; users have no shareable moments.

**Caveats:** the 50-40-10 ratio is _guidance_, not data-derived. For early-stage products with broken fundamentals, 70-25-5 (or higher functionality) is often correct. The ratio is a planning gut-check, not a sacred number.

## Buy-in tactic for skeptical leaders (Changuel's reframing)

When the audit will be presented to a leader who pushes back with "we have features to ship":

- **Don't try to convince.** Trying to convince frames you as a threat to existing priorities. "It's a lost battle."
- **Distinguish perception from perspective.** _Perception_ = how you see delight (a strategy). _Perspective_ = how they see delight (a luxury, a cherry on top). Don't argue your perception; adopt their perspective and link delight to _their_ goals.
- **Ask the proud-users question** — _"Do you think your users are proud to use this product? Proud enough to recommend it to their most discerning peer?"_ Routes to the same destination without using the word "delight." If the answer is no, the conversation is now about word-of-mouth and retention — both languages skeptical leaders speak.
- **Reframe in their goals' language.** Retention → frame delight as habituation prevention. CAC → referral leverage. Competitive positioning → the moat.
- **The musician/curator startup case** — a founder rejected delight in favor of strategy/OKRs; the proud-users question alone made him pivot the entire strategy toward making users feel proud, because that was what would unlock word of mouth.
