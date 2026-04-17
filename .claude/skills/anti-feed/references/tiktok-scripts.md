# TikTok script templates — anti-feed cluster

Two scripts per cluster blog, both founder-led, both receipts-grounded, both counter-positioned. Enforces WS10's anti-clip-farm rules.

## The pair

Every cluster blog (T34–T43) gets two scripts:

1. **30–45s hook-on-vocabulary** — fast, one term, one claim, one flip, one CTA
2. **60–90s explainer** — sets up the mechanic, names the vocabulary, lands the reframe

User may request one or both. Default to both when generating for a publish kit.

## Rejection rubric — run BEFORE writing the script

A script that fails any of these cannot be produced by this skill. If the blog source can't support them, flag back to the user.

1. **Source receipts exist.** The claim in the script must be traceable to a specific blog, stat, quote, or named campaign. "Studies show" is not a receipt.
2. **One term-to-own.** Script repeats a single term from the topic map "terms to own" table — at minimum twice.
3. **Direction-of-the-arrow flip.** Script names what's being pointed at the viewer and flips it to viewer → self.
4. **Founder-led.** Script is written to be delivered by DJ on camera or over a screen recording. No AI voiceover, no faceless loop.
5. **CTA is not "follow me."** Valid CTAs: "read the piece," "try a brain dump," "subscribe to the daily brief," "find the vocab post," "send this to someone who needs it." Invalid: "follow for more," "drop a like," "let me know in the comments."
6. **Anti-clip-farm language.** If the script could fit into a clip-farm campaign (hook-bait, trend-jacking, outrage-spike), revise.

## Script 1 — 30–45s hook-on-vocabulary

### Structure

- **[0:00–0:04] Hook** — 1 sentence, names a feeling or receipt, NO product mention
- **[0:04–0:15] Claim** — 1–2 sentences, state the mechanic with one receipt
- **[0:15–0:30] Reframe** — 1–2 sentences, introduce the term-to-own and the flip
- **[0:30–0:45] CTA** — 1 sentence, "chosen input" CTA per rejection rubric

### Template

```
Title (working): "{Term being owned}"

HOOK [0:00–0:04]
{One sentence. Felt experience or shocking receipt. Example: "One streamer posted 69,000 clips in 30 days."}

CLAIM [0:04–0:15]
{1–2 sentences with a named receipt. Example: "He paid 1,610 people to post them. The algorithm saw the volume and decided he was the most important person on the internet."}

REFRAME [0:15–0:30]
{Name the term-to-own, flip the direction. Example: "This isn't social media. It's interest media. The thing you're using isn't built to reflect what you care about — it's built to reflect whoever bought the biggest distribution budget that week."}

CTA [0:30–0:45]
{A chosen-input CTA. Example: "Before you open your phone tomorrow, spend three minutes writing what YOU think matters today. Receipts in the comments."}
```

### Delivery notes for DJ

- Record straight-to-camera or over a screen recording of the cited receipt (e.g. the Devin Nash video, a tweet, a blog quote)
- No fast cuts. Anti-feed pacing — calm, direct, not hype-adjacent
- Audio: your own voice. No trending audio. No hook sounds.
- Caption file (on-screen text): include the term-to-own at minimum once in bold

## Script 2 — 60–90s explainer

### Structure

- **[0:00–0:06] Hook** — receipt-first. Lead with the specific number, campaign, or named source
- **[0:06–0:25] Mechanic** — 3–5 sentences explaining HOW the system works (use the blog's section on mechanics)
- **[0:25–0:55] Reframe** — 3–5 sentences naming the term-to-own, repeating it 2–3 times, explaining the flip
- **[0:55–1:15] The alternative** — 2–3 sentences sketching what the anti-feed practice looks like in concrete terms (brain dump, daily brief, etc.)
- **[1:15–1:30] CTA** — 1–2 sentences, "chosen input" CTA + pointer to the blog

### Template

```
Title (working): "{Thesis line from blog}"

HOOK [0:00–0:06]
{Receipt-forward. Example: "A single streamer generated 2.2 billion views last month. He didn't make any of it."}

MECHANIC [0:06–0:25]
{3–5 sentences on HOW. Example: "He paid 1,610 clippers through a Discord. They cut his long-form stream into 30-second pieces and posted them across 69,000 accounts. Every clip had to display the Kick watermark. If the watermark was in the wrong spot, they didn't get paid. The clipping campaign cost $666,000 that month. The algorithm saw all that volume and decided he was the most important person on the internet."}

REFRAME [0:25–0:55]
{Name the term, repeat it, flip the arrow. Example: "This isn't social media. There's nothing social about it. It's interest media. The thing you're scrolling at 10pm isn't a feed of your friends. It's a feed of whoever bought the largest distribution plan that week. You didn't choose any of it. You've been receiving, not choosing, for years. And you can feel it — you close the app a little more scattered, a little more anxious, a little less sure what you think."}

ALTERNATIVE [0:55–1:15]
{Concrete anti-feed practice. Example: "There's exactly one surface in your digital life where YOU decide what you think about. Not an algorithm. Not a clipper. You. Sit down, open a text box, and write what's on your mind before you open anything else. Three minutes. That's a brain dump. That's the anti-feed."}

CTA [1:15–1:30]
{Chosen-input CTA + link pointer. Example: "I wrote the full piece on build-os.com. Link in bio. Read your own notes before you read anyone else's tomorrow morning."}
```

### Delivery notes for DJ

- Script is intentionally longer than the blog's equivalent section — you need the runway to repeat the vocab
- OK to read from a teleprompter on first takes; re-record with eyes on camera once you know the beats
- Screen recording alternatives that work well here: a raw Devin Nash clip, a screenshot of a paid-clipping Discord, a scroll through the topic map document
- Do NOT add captions that don't match your script word-for-word. Platform autocaps are fine as long as they don't drift

## Vocabulary cheat sheet (pick ONE per script)

From `docs/marketing/strategy/anti-feed-content-topic-map.md`:

- **interest media** (credit Devin Nash on first TikTok use)
- **algorithm media** (synonym — use interchangeably to reinforce)
- **the anti-feed**
- **chosen input**
- **direction of the arrow**
- **the quiet half of the internet**
- **manufactured virality** (always pair with an alternative)
- **synthetic public internet**
- **algorithm-shaped thoughts**
- **curiosity collapse**
- **feed paranoia**
- **context sovereignty**

Pair rule: Script 1 and Script 2 for the same blog should own **the same term** — repetition is the entire compounding play.

## Output format

When generating scripts for a publish kit (menu option 2), write them inline in the kit file under "TikTok script 1" and "TikTok script 2" headings.

When generating a standalone script (menu option 3), create/append to:

`docs/marketing/social-media/tiktok/scripts/{YYYY-MM-DD}-{slug}.md`

with this frontmatter:

```yaml
---
title: '{term or thesis}'
created: {YYYY-MM-DD}
status: draft | recorded | posted
owner: DJ Wayne
term_owned: '{one term from topic map}'
source_blog: {path or "standalone"}
related_task: T48 (WS10) | standalone
---
```

## After generating

Update WS10 dashboard row for T48:

- If tied to a blog → the blog's T48 row goes from ⚪ to 🔵 (scripts drafted)
- If standalone → add a line under T48's "standalone scripts" log

## Common failure modes

- **Vocabulary sprawl.** Script tries to own 3 terms; lands none. Pick one.
- **Clip-farm-shaped script.** If your hook sounds like "you won't believe what this person did," rewrite.
- **Missing receipts.** "Studies show" / "research says" — no. Name the study, the streamer, the campaign, or the dollar figure.
- **Pitch-heavy ending.** If the last 15 seconds is about BuildOS features, rewrite. The CTA is the practice, not the product.
- **Trend audio.** Never.
