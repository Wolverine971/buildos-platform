<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/viral_content_for_boring_brands/references/honesty-overlays.md -->

# Honesty Overlays: Slop-Format Rejection and Performative-Credential Rejection

Use this reference whenever a format-steal candidate or a credential is being evaluated (overlays on filters A and D), and always for BuildOS-tagged work. These are rejection rules — they run before formats or credentials are adopted, and their rejections must be documented in the audit output with the failing mechanism named.

## 7. Slop-format rejection (overlay on filter A)

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

## 8. Performative-credential rejection (overlay on filter D)

**Principle.** The credential shortcut works either way — honest or performative. The brand must impose the honesty. Cosplaying authority works short-term and fails on retention; once a viewer detects the persona, trust is gone for good.

**Agent checks**

- Reject any credential that:
    - Implies expertise the founder doesn't have ("AI researcher" when they're a founder, not a researcher).
    - Borrows environmental credibility from a setting that isn't theirs (staged office, fake "studio," lab without a lab function).
    - Cites third-party association the brand hasn't actually earned.
    - Inflates numerical proof ("thousands of users" when there are tens).
- Replace rejected credentials with the closest _true_ tier-1/2/3 credential available (see the honesty tier in `attention-filters.md`). If none exists, the piece needs to earn its credential before publishing.
- For BuildOS-tagged work, the strongest available credentials are:
    - Founder using BuildOS to brief his own coding agents (real environmental signal).
    - Real screenshots of BuildOS in production use.
    - Real customer receipts (where consented).
    - Real shipped product (the product is the proof).
- Cite primitive ID `performative-credential-rejection` on findings.

## BuildOS posture

These overlays are BuildOS synthesis layered on Tuan Le's framework, derived from the anti-AI / anti-feed marketing doctrine: lead with relief, never with manufactured urgency or cosplayed authority. For BuildOS-tagged work, any tactic that tips the brand into the manufactured-viral economy is rejected regardless of projected reach.
