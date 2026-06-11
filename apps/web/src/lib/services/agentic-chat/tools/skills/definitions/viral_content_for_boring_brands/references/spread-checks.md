<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/viral_content_for_boring_brands/references/spread-checks.md -->

# Spread Checks E–F: One-Line Sharer Test and Story Skeleton

Use this reference when executing audit checks 5–6 of the viral-content-for-boring-brands skill — the post-attention filters that gate spread and sustained engagement. Run only after filters A–D pass or their findings are logged. Cite the primitive ID on every finding.

## 5. One-line sharer test (filter E — gates spread)

**Principle.** The most-shared content is _not_ the content people personally enjoy most. People share what makes them look **smart, funny, knowledgeable, or ahead of the curve** to their friends. Sharing is social grooming, not recommendation. The hook must be explainable in one sentence — if a sharer can't describe the piece in one line, they won't share it. Drive emotions are specific: humor and surprise spread; sadness and anger generate views but don't pass along.

> _"You're not trying to impress the viewer. You're trying to impress the viewer's friend."_ — Tuan Le

### The one-line sharer test

For any draft, write the sentence the viewer would type when sharing:

```
"yo check this out — _________________________"
```

If the blank is hard to fill, the piece will not spread. If the blank reduces to "I'm sad" or "I'm angry," the piece will get views but not spread. The blank should land on **smart, funny, surprising, or ahead-of-the-curve**.

**Agent checks**

- Write the one-line sharer description out loud using the template above.
- If the blank is hard to fill, the piece will not spread. Flag as high-severity finding.
- Tag the **sharer identity payoff**: "this makes the sharer look \_\_\_" (smart, funny, surprising, ahead-of-the-curve, thoughtful, contrarian).
- Reject pieces whose only emotional engine is exhaustion, sadness, or anger. Those rack views but don't spread, and for BuildOS-tagged work they pull toward the manufactured-viral economy we reject.
- Verify humor or surprise is present _somewhere_ in the piece even when the topic is serious.
- Cite primitive ID `one-line-sharer-test` on findings.

Anti-patterns: **manufactured share-bait** (engineering "look at me" content with no substance — sharers feel used once and never share again); **outrage / sadness as primary engine** (generates views but doesn't spread; degrades audience health over months).

## 6. Story skeleton (filter F — gates sustained engagement)

**Principle.** Once a viewer is **inside a story**, critical thinking slows and emotional processing takes over. This is the most influence-dense state for any brand message. The universal skeleton:

```
HOOK → PROBLEM → STORY → PAYOFF
```

Two execution rules follow from neuroscience:

- **Cut any frame not delivering new information.** The brain tunes out anything that stops giving it something new. Every cut resets the novelty clock.
- **Captions are not optional.** Dual visual + audio processing activates multiple neural pathways simultaneously, locking the brain in.

### Default timing outline

```
0:00–0:02   HOOK     — open the curiosity gap, fire the credential.
0:02–0:15   PROBLEM  — name the pain in identity terms (layer 3).
0:15–end-5  STORY    — concrete receipt that mirrors the problem.
end-5:end   PAYOFF   — the name for the way out (or a one-line CTA).
```

If a draft is missing a beat, restructure before editing.

**Agent checks**

- Verify all four beats are present and identifiable. Restructure if missing.
- Score each frame / paragraph: "does this deliver new information?" Cut anything that scores no.
- Default to captions on every video. Default to typographic emphasis (bold, callouts, pull-lines) in long-form text as the structural analog.
- For BuildOS-tagged work, the **payoff** is rarely "buy now" — usually "you've named a feeling you couldn't name before." That counts. Don't force a CTA payoff if the named-feeling payoff is stronger.
- Verify zero dead-space frames in video drafts. Reference Bulldock's 2.2M-view post: every clip a few seconds, every clip new info.
- Cite primitive ID `story-skeleton-pass` on findings.

Anti-patterns: **story skeleton without a real story** (going through the Hook/Problem/Story/Payoff motions without an actual lived receipt in the Story beat); **cutting for cuts' sake** (hyper-cut editing that doesn't deliver new information per cut); **captions as decoration** (adding captions stylistically rather than for dual-pathway retention).
