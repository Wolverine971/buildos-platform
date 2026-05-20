---
title: 'Viral Content For Boring Brands: An Agent Skill For Brand-Account Content'
description: 'A source-lineaged agent skill for designing or auditing brand-account content (B2B SaaS, dev tools, commodity products) against the six pre-conscious filters that decide whether a viewer scrolls or stays in the first two seconds.'
author: 'DJ Wayne'
date: '2026-05-10'
lastmod: '2026-05-10'
changefreq: 'monthly'
priority: '0.9'
published: true
tags:
    [
        'agent-skills',
        'viral-content',
        'brand-content',
        'content-strategy',
        'identity-marketing',
        'means-end-chain',
        'marketing-and-content',
        'buildos'
    ]
readingTime: 14
excerpt: "Six pre-conscious filters fire in the viewer's brain before the first second is over. Pass all six, the viewer stays and shares. Fail one, they scroll. This skill turns that into an agent-readable audit and design playbook for brand and founder accounts."
skillId: 'marketing-and-content/viral-content-for-boring-brands'
skillType: 'combo'
skillCategory: 'marketing-and-content'
providers: ['YouTube source analysis', 'BuildOS YouTube library']
compatibleAgents: ['BuildOS-compatible agents', 'Claude Code', 'Codex', 'portable Agent Skills']
stackWith:
    [
        'hook-craft-short-form',
        'story-driven-content-craft',
        'viral-video-script-structure',
        'going-viral'
    ]
skillSource: 'docs/research/youtube-library/skill-drafts/viral-content-for-boring-brands/SKILL.md'
lineagePath: 'docs/research/youtube-library/skill-drafts/viral-content-for-boring-brands/lineage.yaml'
lineagePeople:
    - 'Tuan Le'
lineageStats:
    sources: 1
    primitives: 8
    sourceClaims: 10
    edges: 16
    candidateV2Sources: 3
lineageSources:
    - title: 'What Getting 3 Billion Views Taught Me About Human Psychology'
      creator: 'Tuan Le'
      creatorType: 'Person'
      creatorOrg: 'Shortscut'
      creatorUrl: 'https://www.youtube.com/@tuann_lee'
      channelName: 'Tuan Le'
      channelUrl: 'https://www.youtube.com/@tuann_lee'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=KkK-Y7GiQ2o'
path: apps/web/src/content/blogs/agent-skills/viral-content-for-boring-brands.md
---

# Viral Content For Boring Brands

A practical content skill for agents and humans designing or auditing **brand-account** content — B2B SaaS, dev tools, project-management software, supplements, commodity consumables, anything where the product is not inherently exciting.

The discipline this skill enforces is **sequencing**: don't ask whether the post is well-written until you've answered whether it survives the six pre-conscious filters that fire in the viewer's brain in the first two seconds. The viewer is not deciding whether to watch. Their brain is deciding for them, before they consciously notice.

Each principle in this skill ships in two layers:

- **Principle (human view)** — the readable guideline, in plain language.
- **Agent checks** — the same principle expressed as concrete, runnable rules an agent can execute against a draft.

This dual structure lets a human read the skill as a content playbook and an agent run it as a checklist.

The framework comes from a single source: Tuan Le, an agency operator who generated 3B+ views for brands like Bulldock (Korean instant ramen, 300K → 1.8M followers, 900M views in 12 months), Stan (creator platform, 20M views for the CEO's personal brand), and a Japanese restaurant (200 views → 1.8M+ per video, 300K followers in three months). The product never changed in any of those cases. The mechanics did.

## When To Use

- Plan or audit a single piece of content from a brand or founder account.
- Diagnose why a brand-account post that "should have worked" died.
- Translate a feature or release into content that doesn't read as an ad.
- Audit a draft against the six filters before recording or publishing.
- Pick the right format to "borrow" from a brand-aligned creator without stealing slop.
- Run the means-end ladder on a product or feature to find its layer-3 identity statement.
- Score a draft for shareability before posting.
- Audit a marketing-page hero, a video opener, or a thread first line for filter B (curiosity gap) and filter D (credential).

Do **not** use this skill for:

- **Creator-led content.** Use `hook-craft-short-form`, `story-driven-content-craft`, `viral-video-script-structure`. Those skills assume a personal-brand voice and creator-side checkpoints.
- **Pure paid acquisition / performance ads.** Different game; algorithm filters work differently when distribution is bought.
- **SEO blog content.** Use `content-strategy-beyond-blogging`.
- **Manufactured-virality / rage-bait playbooks.** This skill explicitly refuses those — see Guardrails.

## Skill Composition

This is a single-source skill distilled from Tuan Le's six-principle framework, with two BuildOS overlay primitives layered on top.

| Primitive ID                        | Job                                                                                                  | Primary source layer           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| `format-recognition-audit`          | Verify the content sits inside a format the viewer's brain has seen and liked before.                | Tuan Le — Principle 1          |
| `curiosity-gap-hook-audit`          | Verify the first 1–2 seconds open a knowledge gap the brain wants to close.                          | Tuan Le — Principle 2          |
| `means-end-ladder`                  | Ladder any product/feature claim from layer 1 (attribute) to layer 3 (psychological value).          | Tuan Le — Principle 3          |
| `credential-shortcut-audit`         | Verify a real, honest credential fires within the first 2 seconds.                                   | Tuan Le — Principle 4          |
| `one-line-sharer-test`              | Verify the piece is describable in one sentence the sharer would type in a DM.                       | Tuan Le — Principle 5          |
| `story-skeleton-pass`               | Verify the piece follows Hook → Problem → Story → Payoff with zero dead-space frames.                | Tuan Le — Principle 6          |
| `slop-format-rejection`             | Reject format-steal candidates whose audience-acquisition mechanism is rage-bait or fake-confession. | BuildOS overlay on Principle 1 |
| `performative-credential-rejection` | Reject credential candidates that are not literally true (cosplaying authority).                     | BuildOS overlay on Principle 4 |

Primitive IDs match `lineage.yaml` so findings can cite the underlying source claim.

## Preflight

Run preflight before producing findings or drafts. Same shape for humans and agents — different inputs.

### For humans

Have ready before running this skill:

- The product, feature, or message the content is supposed to communicate.
- The target sharer's identity ("who would share this and what does it say about them?").
- A list of formats currently going viral in adjacencies the brand voice can carry.
- The brand's authentic credentials (real numbers, real customer outcomes, founder-doing-the-work footage). Distinguish from credentials the brand wishes it had.
- An honest answer to: "Is the layer-3 statement of this product real, or am I projecting one I want to be true?"

### For agents

Before producing findings or drafts, capture or confirm:

- The product layer-3 statement (run `means-end-ladder` if not provided).
- The intended sharer-identity payoff (one sentence, written from the sharer's first-person POV).
- 5–10 currently-trending format candidates in topic adjacencies, with brand-fit score per format.
- The pool of available real credentials (founder receipts, customer outcomes, audited numbers, environmental proof).
- The four-beat skeleton draft (Hook / Problem / Story / Payoff) — even if rough.
- Confidence floor: if a finding can't be evidenced with a specific time-stamp, frame, or sentence, do not include it.

## Audit (in order)

The audit is sequential. Each step lists the **principle** (human view) followed by **agent checks** (the same principle as runnable rules). Findings should be produced as you go, in the order below.

### 1. Format recognition (filter A — fires at 0.5s)

**Principle.** When scrolling, the brain runs the filter "Have I seen something like this before and enjoyed it?" Original formats fail this filter — the brain reads novelty as confusion, not opportunity. Familiar formats win because they are pre-validated. The mechanism is the **mere exposure effect**: repeated exposure increases liking.

> _"When your brand encounters a format that has never seen before, it does not get excited. It gets confused. And confusion is the fastest path to a scroll."_ — Tuan Le

**Agent checks**

- Tag the format the content is borrowing. If the answer is "none, it's original," flag as high-risk.
- Verify the format has measurable evidence of working (e.g., 3+ accounts pulling >100K views with this format in the last 90 days).
- Score brand fit per format on three dimensions: voice match, value match, audience match. Reject if any score &lt; 6/10.
- Reject any format candidate that fails `slop-format-rejection` (see §7).
- Cite primitive ID `format-recognition-audit` on findings.

> **Receipt.** Bulldock (Korean instant ramen): stuck at 300K followers with manufacturing/ingredient content. Pivoted to spicy-challenge / reaction formats already going viral in the food space → 1.8M followers, 900M views in 12 months. **Product unchanged; format borrowed.**

### 2. Curiosity gap (filter B — fires at 1.0s)

**Principle.** Leading with the product triggers the brain's ad-recognition pattern → instant scroll. The loophole is the **information gap**: when the brain senses a gap between what it knows and what it wants to know, that gap creates discomfort the brain is hardwired to close. The discomfort overrides the scroll reflex until the gap closes. The product can appear later — once curiosity has neurologically committed the viewer to finishing.

> _"Open the curiosity gap in your first two seconds and the viewer is neurologically committed to finishing. Close that gap too early and they leave."_ — Tuan Le

**Agent checks**

- Examine the first sentence / frame / image. If it names the product, flag as high-severity finding.
- Identify the curiosity mechanism in use: disbelief, identity recognition, forbidden knowledge, surprising claim, in-progress action. Reject hooks that lack any.
- Verify the gap actually closes by the end of the piece. Open loops that never resolve degrade trust over the channel's lifespan.
- Reject hooks that promise a gap they don't deliver ("you won't believe what happened next" → mundane payoff).
- Cite primitive ID `curiosity-gap-hook-audit` on findings.

> **Receipt.** Stan (creator platform): instead of opening on the software, Tuan opened a video with "How much do you pay for rent?" delivered as an office tour using the CEO's space as the location. → 1M views TikTok, 5M LinkedIn on the first try. Over the following months, 20M views for the CEO's personal brand.

### 3. Identity layer / means-end ladder (filter C — fires at 1.5s)

**Principle.** Every product has three layers (Tuan invokes **means-end chain theory**, an established consumer-research model):

1. **Attribute** — what it is.
2. **Functional consequence** — what it does.
3. **Psychological value** — what it means for the viewer's identity and emotional life.

Most brands stop at layer 1. The brain only cares about layer 3. Method: keep asking "why does someone actually care about this?" until the answer is an identity statement or an emotional state. When content speaks to identity, the viewer doesn't feel sold to — they feel **understood**.

> _"When your content speaks to identity and not features, the viewer does not feel sold to. They feel understood."_ — Tuan Le

**Agent checks**

- Tag every claim in the piece with its layer (1, 2, or 3).
- Verify the lead claim is layer 3. If it's layer 1, demote it into evidence and surface a layer-3 alternative.
- Ladder method (run if no layer-3 statement exists):
    1. Start with the attribute: "this product has X."
    2. Ask "so what?" → functional consequence.
    3. Ask "so what?" again → psychological value.
    4. Stop when the answer is an identity statement ("I feel \_\_\_ about myself / my life") or an emotional state.
- For BuildOS-tagged work, the working layer-3 statements are: "thinking environment for people making complex things," "I'm the architect; the agents execute," "the context surface across my AI agents." Anchor to one of these unless the piece justifies a new ladder result.
- Cite primitive ID `means-end-ladder` on findings.

> **Receipt.** AG1 example: supplement → healthier body → energy/mood → "I feel in control of my body and life." Once the ladder reaches layer 3, content stops being about the supplement and starts being about sleep, stress, discipline, wellness — the things the viewer actually cares about.

### 4. Credential shortcut (filter D — fires at 2.0s)

**Principle.** Social media is shallow as a _biological fact_: the brain doesn't have time to deeply evaluate every piece, so it takes shortcuts. The biggest shortcut is **authority**. When a credential appears in the first 2 seconds, the brain accepts it as a cognitive proxy for "this is worth watching" — without critical evaluation. The credential can be a stated title, an environmental signal (kitchen, lab, office), a numerical proof, or a third-party association.

**Agent checks**

- Identify the credential firing in the first 2 seconds. If none exists, the piece needs one.
- Rank credential candidates by honesty:
    - **Tier 1 (preferred)**: real numerical proof ("8,000 users," "shipped in 30 days").
    - **Tier 2**: real environmental signal (founder at his desk doing the work; product in actual use).
    - **Tier 3**: real third-party association (real customer logo, real co-sign).
    - **Tier 4 (avoid)**: borrowed or implied credential (vague "experts say," staged office, lab coat without a lab).
- Reject any credential that fails `performative-credential-rejection` (see §8).
- Verify the credential is _visible or audible in the first 2 seconds_ — a credential at 0:30 doesn't trip the filter.
- Cite primitive ID `credential-shortcut-audit` on findings.

> **Receipt.** Japanese restaurant: 200–300 views per video on cinematic gourmet shots. Pivoted to "hey chef, can you make me something gourmet?" format — the chef in chef's outfit, in a professional kitchen, became the credential. → 1.8M, 2M views back-to-back. 300K followers in three months. Same food.

### 5. One-line sharer test (filter E — gates spread)

**Principle.** The most-shared content is _not_ the content people personally enjoy most. People share what makes them look **smart, funny, knowledgeable, or ahead of the curve** to their friends. Sharing is social grooming, not recommendation. The hook must be explainable in one sentence — if a sharer can't describe the piece in one line, they won't share it. Drive emotions are specific: humor and surprise spread; sadness and anger generate views but don't pass along.

> _"You're not trying to impress the viewer. You're trying to impress the viewer's friend."_ — Tuan Le

**Agent checks**

- Write the one-line sharer description out loud:
    ```
    "yo check this out — _________________________"
    ```
- If the blank is hard to fill, the piece will not spread. Flag as high-severity finding.
- Tag the **sharer identity payoff**: "this makes the sharer look \_\_\_" (smart, funny, surprising, ahead-of-the-curve, thoughtful, contrarian).
- Reject pieces whose only emotional engine is exhaustion, sadness, or anger. Those rack views but don't spread, and for BuildOS-tagged work they pull toward the manufactured-viral economy we reject.
- Verify humor or surprise is present _somewhere_ in the piece even when the topic is serious.
- Cite primitive ID `one-line-sharer-test` on findings.

### 6. Story skeleton (filter F — gates sustained engagement)

**Principle.** Once a viewer is **inside a story**, critical thinking slows and emotional processing takes over. This is the most influence-dense state for any brand message. The universal skeleton:

```
HOOK → PROBLEM → STORY → PAYOFF
```

Two execution rules follow from neuroscience:

- **Cut any frame not delivering new information.** The brain tunes out anything that stops giving it something new. Every cut resets the novelty clock.
- **Captions are not optional.** Dual visual + audio processing activates multiple neural pathways simultaneously, locking the brain in.

**Agent checks**

- Verify all four beats are present and identifiable. Restructure if missing.
- Score each frame / paragraph: "does this deliver new information?" Cut anything that scores no.
- Default to captions on every video. Default to typographic emphasis (bold, callouts, pull-lines) in long-form text as the structural analog.
- For BuildOS-tagged work, the **payoff** is rarely "buy now" — usually "you've named a feeling you couldn't name before." That counts. Don't force a CTA payoff if the named-feeling payoff is stronger.
- Verify zero dead-space frames in video drafts. Reference Bulldock's 2.2M-view post: every clip a few seconds, every clip new info.
- Cite primitive ID `story-skeleton-pass` on findings.

### 7. Slop-format rejection (BuildOS overlay on filter A)

**Principle.** Format-steal is brand-amoral. The brand must impose the morality. Stealing rage-bait, fake-confession, manufactured-drama, or fake before/after formats inherits their audience and degrades brand trust over time.

**Agent checks**

- Reject formats whose audience-acquisition mechanism is:
    - Rage-bait (manufactured outrage, dunking on out-groups, performative anger).
    - Fake confessions or fake personal disclosures.
    - Fake before/after (results that aren't real or aren't typical).
    - Manufactured drama (staged conflict for clicks).
    - Engagement-bait questions ("type YES if you agree").
- Allow format-steal only when the format itself is **aesthetic** (a way of framing) rather than **attention-arbitrage** (a way of bypassing critical thinking).
- Document the rejection: a one-line note explaining which mechanism failed. This trains the agent over time.
- Cite primitive ID `slop-format-rejection` on findings.

### 8. Performative-credential rejection (BuildOS overlay on filter D)

**Principle.** The credential shortcut works either way — honest or performative. The brand must impose the honesty. Cosplaying authority works short-term and fails on retention; once a viewer detects the persona, trust is gone for good.

**Agent checks**

- Reject any credential that:
    - Implies expertise the founder doesn't have ("AI researcher" when they're a founder, not a researcher).
    - Borrows environmental credibility from a setting that isn't theirs (staged office, fake "studio," lab without a lab function).
    - Cites third-party association the brand hasn't actually earned.
    - Inflates numerical proof ("thousands of users" when there are tens).
- Replace rejected credentials with the closest _true_ tier-1/2/3 credential available. If none exists, the piece needs to earn its credential before publishing.
- For BuildOS-tagged work, the strongest available credentials are:
    - Founder using BuildOS to brief his own coding agents (real environmental signal).
    - Real screenshots of BuildOS in production use.
    - Real customer receipts (where consented).
    - Real shipped product (the product is the proof).
- Cite primitive ID `performative-credential-rejection` on findings.

## Frameworks Or Templates

### The 6-Filter Pre-Conscious Stack

```
0.5s  Filter A — Format recognition          → Have I seen this and liked it?
1.0s  Filter B — Curiosity gap               → Is there a gap I want to close?
1.5s  Filter C — Identity layer (means-end)  → Does this speak to who I am?
2.0s  Filter D — Credential shortcut         → Should I trust the speaker?
post  Filter E — One-line sharer test        → Will sharing this make me look good?
post  Filter F — Story skeleton              → Am I inside a story I want to finish?
```

If any filter fails, the viewer scrolls. Filters A–D fire in \<2s and gate initial attention. Filters E–F gate sustained engagement and spread. **Fix in order — don't optimize for share-payoff if format-and-gap fail in the first second.**

### The Means-End Ladder

```
Layer 1 — Attribute:           "We have feature X."
   ↓ (ask: "so what?")
Layer 2 — Functional:          "Feature X lets you do Y faster."
   ↓ (ask: "so what does Y mean for them?")
Layer 3 — Psychological value: "Doing Y means they feel Z about themselves and their life."
```

Stop laddering only when the answer is an identity statement or an emotional state. Treat layer 3 as the headline. Treat layers 1 and 2 as evidence.

### The One-Line Sharer Test

For any draft, write the sentence the viewer would type when sharing:

```
"yo check this out — _________________________"
```

If the blank is hard to fill, the piece will not spread. If the blank reduces to "I'm sad" or "I'm angry," the piece will get views but not spread. The blank should land on **smart, funny, surprising, or ahead-of-the-curve**.

### The Hook → Problem → Story → Payoff Skeleton

```
0:00–0:02   HOOK     — open the curiosity gap, fire the credential.
0:02–0:15   PROBLEM  — name the pain in identity terms (layer 3).
0:15–end-5  STORY    — concrete receipt that mirrors the problem.
end-5:end   PAYOFF   — the name for the way out (or a one-line CTA).
```

Default outline. If a draft is missing a beat, restructure before editing.

### The Credential Honesty Tier

```
Tier 1 (preferred): Real numerical proof.
Tier 2:             Real environmental signal.
Tier 3:             Real third-party association.
Tier 4 (rejected):  Borrowed, implied, or inflated credentials.
```

Use the highest tier available that is _literally true_.

## Anti-Patterns

- **Slop-format theft**: Stealing rage-bait, fake-confession, manufactured-drama formats inherits their audience and degrades brand trust.
- **Performative credentials**: Lab coats, fake offices, borrowed environments when the underlying authority isn't real.
- **Identity claims at layer 1**: Saying "this is identity-led" while writing about features. The means-end ladder must actually reach layer 3.
- **Curiosity gaps that don't close**: Opening hooks that never deliver. Trains audiences to scroll past your hooks.
- **Manufactured share-bait**: Engineering "look at me" content with no substance. Sharers feel used once and never share again.
- **Story skeleton without a real story**: Going through the motions of Hook/Problem/Story/Payoff without an actual lived receipt in the Story beat.
- **Cutting for cuts' sake**: Hyper-cut editing that doesn't deliver new information per cut.
- **Captions as decoration**: Adding captions stylistically rather than for dual-pathway retention.
- **Outrage / sadness as primary engine**: Generates views but doesn't spread; degrades audience health over months.
- **Layer-1 hero on the landing page**: The single most common B2B SaaS mistake. "AI-powered productivity platform" is layer 1; the brain reads it as an ad.

## Output Schema

Every finding follows this canonical shape:

```txt
Filter: [A | B | C | D | E | F]
Finding: [named principle violated, e.g., "Lead with product (filter B failed)"]
Evidence: [specific frame, sentence, time-stamp, or claim]
Severity: [high | medium | low]
Fix: [concrete rewrite, layer-3 alternative, or format swap]
Source claim: [lineage primitive ID, e.g., primitive.curiosity-gap-hook-audit]
Delegated: [optional sibling skill if the fix is out of scope]
```

A finding without **Evidence** is not a finding. A finding without **Severity** is not actionable. Both fields are required.

### Severity rubric

- **high** — kills the piece (filter A or B fails; means-end never reaches layer 3; performative credential at slot 1; sharer-test blank is unfillable).
- **medium** — degrades retention or spread significantly (weak credential tier; story-skeleton beat missing; cuts deliver redundant info).
- **low** — stylistic preference, minor friction.

### Stop conditions

The audit is complete when:

- Every applicable filter has been checked or explicitly marked "no issues."
- Top 3 high-severity fixes are ranked by impact.
- All findings carry evidence and severity.
- Any rejected credentials or formats are documented with rejection reason.
- Out-of-scope concerns are tagged `Delegated:` to a sibling skill.

## Stack With (Workflow)

`stackWith` is not just metadata. The full brand-content workflow chains four sibling skills:

1. **`viral-content-for-boring-brands`** (this skill) — brand-side six-filter audit and design. Catches the ad-shaped hooks, layer-1 claims, performative credentials, and slop-format theft.
2. **`hook-craft-short-form`** — sentence-level hook polish once the curiosity gap is identified. This skill flags filter B; hook-craft polishes the line.
3. **`story-driven-content-craft`** — narrative-arc construction once the four-beat skeleton is in place. This skill enforces the skeleton; story-driven-content-craft strengthens the rungs.
4. **`viral-video-script-structure`** — full video script once the audit clears. This skill delivers the strategic brief; the script skill writes the recordable draft.
5. **`going-viral`** — orchestrator across platforms when the brand needs a multi-platform publishing system, not just one piece.

**Default order**: 1 → 2 → 3 → 4. Add 5 when the work is platform-strategic, not piece-specific. Skip 2 if the hook is already polished. Skip 4 if the surface is text-only.

**Handoff outputs**: Findings tagged `Delegated: <sibling-skill>` route to the appropriate sibling. Each sibling consumes the canonical schema directly without re-auditing the six filters.

## Guardrails

- Do not adopt format-steal blindly. Reject slop formats even when they're going viral.
- Do not stage credentials. Borrowed environments and inflated numbers violate the brand's own anti-AI doctrine.
- Do not lead with the product, even when the product is the point. Lead with the gap; let the product show up after curiosity commits the viewer.
- Do not skip the means-end ladder. Layer-1 claims read as ads; the brain never engages.
- Do not chase outrage or sadness as the primary engine. They get views but don't spread, and they erode audience trust over time.
- Do not return findings without specific evidence (frame, sentence, time-stamp).
- Do not assign severity without referencing the rubric.
- Do not optimize filters E–F if filters A–D are failing. Fix in order.
- For BuildOS-tagged work specifically, do not adopt any tactic that would tip the brand into the manufactured-viral economy Devin Nash critiques. The anti-feed posture is non-negotiable.

## Sources

### Source attribution

This skill is distilled from a single source layer:

- **Tuan Le** (founder of [Shortscut](https://shortscut.com/)) — [What Getting 3 Billion Views Taught Me About Human Psychology](https://www.youtube.com/watch?v=KkK-Y7GiQ2o). The six pre-conscious filters; format-steal mechanics; means-end-chain identity layers; credential shortcut; share-as-status framing; Hook → Problem → Story → Payoff skeleton. Receipts: Bulldock 900M views, Stan 20M views, Japanese restaurant 300K followers in three months.

The two BuildOS overlay primitives — `slop-format-rejection` and `performative-credential-rejection` — are original synthesis layered on Tuan's framework, derived from BuildOS's anti-AI and anti-feed marketing doctrine. They are documented in the deep-read analysis.

### Deep-read source analysis

Tuan Le's source video is also published as a standalone deep-read. Use it when you want the operating logic behind a check, not just the rule:

- [Tuan Le — What Getting 3 Billion Views Taught Me About Human Psychology (analysis)](/blogs/source-analyses/tuan-le-3-billion-views-psychology) — operating logic behind every check, with quotes, anti-patterns, cross-source notes, BuildOS use tally per principle, and immediate action items keyed to the BuildOS positioning rewrite, the Connect Your Agents promo, and the anti-feed cluster blogs.

### Related sibling skills

- [Hook Craft For Short-Form](/agent-skills/hook-craft-short-form) — sentence-level hook polish (creator-side perspective).
- [Story-Driven Content Craft](/agent-skills/story-driven-content-craft) — narrative-arc construction.
- `viral-video-script-structure` — full short-form video scripts.
- `going-viral` — cross-platform orchestrator.
- `algorithm-aware-publishing` — distribution-layer decisions.

### External references

- **Means-end chain theory** (Gutman 1982 and related consumer-research literature) — the academic backbone of Principle 3 (filter C). Worth supplementing the video's three-line summary with the original theory when laddering ambiguous products.
- **Mere exposure effect** (Robert Zajonc, 1968) — the academic backbone of Principle 1 (filter A). Decades of replication establish that repeated exposure increases liking even when subjects are unaware of the repetition.
