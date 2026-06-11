<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/viral_content_for_boring_brands/references/attention-filters.md -->

# Attention Filters A–D: Format, Curiosity Gap, Identity Layer, Credential

Use this reference when executing audit checks 1–4 of the viral-content-for-boring-brands skill — the four pre-conscious filters that fire in under 2 seconds and gate initial attention. Each check lists the principle, then the runnable agent checks. Cite the primitive ID on every finding.

## 1. Format recognition (filter A — fires at 0.5s)

**Principle.** When scrolling, the brain runs the filter "Have I seen something like this before and enjoyed it?" Original formats fail this filter — the brain reads novelty as confusion, not opportunity. Familiar formats win because they are pre-validated (mere exposure effect: repeated exposure increases liking).

> _"When your brand encounters a format that has never seen before, it does not get excited. It gets confused. And confusion is the fastest path to a scroll."_ — Tuan Le

**Agent checks**

- Tag the format the content is borrowing. If the answer is "none, it's original," flag as high-risk.
- Verify the format has measurable evidence of working (e.g., 3+ accounts pulling >100K views with this format in the last 90 days).
- Score brand fit per format on three dimensions: voice match, value match, audience match. Reject if any score < 6/10.
- Reject any format candidate that fails slop-format rejection (load `honesty-overlays.md`).
- Cite primitive ID `format-recognition-audit` on findings.

Anti-pattern: **slop-format theft** — stealing rage-bait, fake-confession, or manufactured-drama formats inherits their audience and degrades brand trust.

## 2. Curiosity gap (filter B — fires at 1.0s)

**Principle.** Leading with the product triggers the brain's ad-recognition pattern → instant scroll. The loophole is the **information gap**: when the brain senses a gap between what it knows and what it wants to know, that gap creates discomfort the brain is hardwired to close. The discomfort overrides the scroll reflex until the gap closes. The product can appear later — once curiosity has neurologically committed the viewer to finishing.

> _"Open the curiosity gap in your first two seconds and the viewer is neurologically committed to finishing. Close that gap too early and they leave."_ — Tuan Le

**Agent checks**

- Examine the first sentence / frame / image. If it names the product, flag as high-severity finding.
- Identify the curiosity mechanism in use: disbelief, identity recognition, forbidden knowledge, surprising claim, in-progress action. Reject hooks that lack any.
- Verify the gap actually closes by the end of the piece. Open loops that never resolve degrade trust over the channel's lifespan.
- Reject hooks that promise a gap they don't deliver ("you won't believe what happened next" → mundane payoff).
- Cite primitive ID `curiosity-gap-hook-audit` on findings.

Anti-pattern: **curiosity gaps that don't close** — opening hooks that never deliver train audiences to scroll past your hooks.

## 3. Identity layer / means-end ladder (filter C — fires at 1.5s)

**Principle.** Every product has three layers:

1. **Attribute** — what it is.
2. **Functional consequence** — what it does.
3. **Psychological value** — what it means for the viewer's identity and emotional life.

Most brands stop at layer 1. The brain only cares about layer 3. Method: keep asking "why does someone actually care about this?" until the answer is an identity statement or an emotional state. When content speaks to identity, the viewer doesn't feel sold to — they feel **understood**.

> _"When your content speaks to identity and not features, the viewer does not feel sold to. They feel understood."_ — Tuan Le

### The means-end ladder

```
Layer 1 — Attribute:           "We have feature X."
   ↓ (ask: "so what?")
Layer 2 — Functional:          "Feature X lets you do Y faster."
   ↓ (ask: "so what does Y mean for them?")
Layer 3 — Psychological value: "Doing Y means they feel Z about themselves and their life."
```

Stop laddering only when the answer is an identity statement or an emotional state. Treat layer 3 as the headline. Treat layers 1 and 2 as evidence.

**Agent checks**

- Tag every claim in the piece with its layer (1, 2, or 3).
- Verify the lead claim is layer 3. If it's layer 1, demote it into evidence and surface a layer-3 alternative.
- Run the ladder method above if no layer-3 statement exists: start with the attribute ("this product has X"), ask "so what?" → functional consequence, ask "so what?" again → psychological value, stop at an identity statement ("I feel \_\_\_ about myself / my life") or an emotional state.
- For BuildOS-tagged work, the working layer-3 statements are: "thinking environment for people making complex things," "I'm the architect; the agents execute," "the context surface across my AI agents." Anchor to one of these unless the piece justifies a new ladder result.
- Cite primitive ID `means-end-ladder` on findings.

Anti-pattern: **identity claims at layer 1** — saying "this is identity-led" while writing about features. The ladder must actually reach layer 3.

## 4. Credential shortcut (filter D — fires at 2.0s)

**Principle.** Social media is shallow as a _biological fact_: the brain doesn't have time to deeply evaluate every piece, so it takes shortcuts. The biggest shortcut is **authority**. When a credential appears in the first 2 seconds, the brain accepts it as a cognitive proxy for "this is worth watching" — without critical evaluation. The credential can be a stated title, an environmental signal (kitchen, lab, office), a numerical proof, or a third-party association.

### The credential honesty tier

```
Tier 1 (preferred): Real numerical proof ("8,000 users," "shipped in 30 days").
Tier 2:             Real environmental signal (founder at his desk doing the work; product in actual use).
Tier 3:             Real third-party association (real customer logo, real co-sign).
Tier 4 (rejected):  Borrowed, implied, or inflated credentials (vague "experts say," staged office, lab coat without a lab).
```

Use the highest tier available that is _literally true_.

**Agent checks**

- Identify the credential firing in the first 2 seconds. If none exists, the piece needs one.
- Rank credential candidates by the honesty tier above.
- Reject any credential that fails performative-credential rejection (load `honesty-overlays.md`).
- Verify the credential is _visible or audible in the first 2 seconds_ — a credential at 0:30 doesn't trip the filter.
- Cite primitive ID `credential-shortcut-audit` on findings.

Anti-pattern: **performative credentials** — lab coats, fake offices, borrowed environments when the underlying authority isn't real.
