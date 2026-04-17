# Build a publish kit for a cluster blog

Load this when the user picks menu option 2, or when the draft-blog flow hands off.

## Inputs

- Target blog: path to a cluster post (`apps/web/src/content/blogs/philosophy/{slug}.md`)
- Topic-map vocabulary (for the term the blog owns)
- The two-most-recent published cluster posts (for cross-link logic on social)

## Output file

`docs/marketing/social-media/publish-kits/{YYYY-MM-DD}-{slug}-kit.md`

Where `{YYYY-MM-DD}` is today's date and `{slug}` matches the blog filename.

## File frontmatter

```yaml
---
title: 'Publish Kit — {blog title}'
created: {YYYY-MM-DD}
status: ready | drafted | published
owner: DJ Wayne
related_blog: apps/web/src/content/blogs/philosophy/{slug}.md
related_task: T## (WS09)
tiktok_tasks: T48 (WS10)
related_docs:
    - /docs/marketing/strategy/anti-feed-content-topic-map.md
    - /docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md
    - /docs/marketing/distribution/workstreams/WS10-short-form-video.md
    - /docs/marketing/brand/brand-guide-1-pager.md
path: docs/marketing/social-media/publish-kits/{YYYY-MM-DD}-{slug}-kit.md
---
```

## File body — exact section order

1. **Source thesis** (2 sentences from the blog — the hook + the reframe; quote verbatim)
2. **Vocabulary owned by this post** (list terms-to-own the blog repeats)
3. **Twitter / X thread** (5–8 tweets, see spec below)
4. **LinkedIn post** (180–280 words, see spec below)
5. **Instagram carousel** (9 slides, see spec below)
6. **TikTok script 1 — 30–45s hook-on-vocabulary** (see [tiktok-scripts.md](./tiktok-scripts.md))
7. **TikTok script 2 — 60–90s explainer** (see [tiktok-scripts.md](./tiktok-scripts.md))
8. **Reddit share angles** (3 subs max, each with sub-specific framing + promo-policy note)
9. **Cross-post order** (priority-ranked list: which platform first, which within 48 hours, which optional)
10. **Status dashboard** (checklist: drafted / reviewed / published per lane)

## Twitter / X thread spec

- 5–8 tweets
- Tweet 1 is the hook — felt experience or shocking receipt, **no hashtags**
- Tweets 2–6 build the argument with receipts
- Tweet 7–8 is the reframe + a one-line link to the blog
- No more than one tweet contains "BuildOS" by name
- No threads that use "🧵" as the opener
- Voice: sharpest version of the brand (per brand guide "Channel Adaptation — X")

## LinkedIn post spec

- 180–280 words, 4–6 short paragraphs
- First line is a standalone-quotable observation (not a question)
- Middle 2–3 paragraphs contain the mechanic + reframe
- Final paragraph is relief-oriented, not pitch
- BuildOS mentioned **once, near the end**, as a concrete example of what the reframe looks like in practice
- Voice: thoughtful founder-operator (per brand guide "Channel Adaptation — LinkedIn")

## Instagram carousel spec

- 9 slides
- Slide 1: hook headline (6–10 words max) on plain card
- Slides 2–8: one felt-feeling or one receipt per slide
- Slide 9: the term-to-own + a one-line CTA (link in bio)
- Copy is written for reading speed on phones: 10–20 words per slide, ideally less
- No emoji on slides unless user requests it
- Voice: most visual/relieving version (per brand guide "Channel Adaptation — Instagram")

## Reddit share angles

For each of up to 3 subs:

- **Sub name** + **rules tier** (strict / strict-structured / permissive — pull from `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md`)
- **Hook for that sub's culture** (the culture signal from the sub profile doc)
- **Promo policy note** — whether founder disclosure is required, whether self-promo needs a flair, what the 90/10 rule looks like for this sub
- **Don't post** if the sub is strict AND BuildOS karma is <500 in that sub (gated by T10 / T27)

Default sub shortlist (update if topic map vocabulary shifts):

- r/productivity
- r/Substack
- r/NewTubers (only if blog is creator-specific AND mod approval via DM)

## Cross-post order

Ship in this sequence unless the content demands otherwise:

1. Blog live on build-os.com
2. X thread (within 2 hours of blog going live)
3. LinkedIn post (within 24 hours)
4. TikTok script 1 recorded + posted (within 48 hours)
5. TikTok script 2 recorded + posted (within 7 days of blog)
6. Instagram carousel (within 72 hours)
7. Reddit share (only if karma gates are cleared per WS03)

## Status dashboard (append at bottom of kit file)

```
- [ ] Blog published
- [ ] X thread drafted
- [ ] X thread posted (URL: )
- [ ] LinkedIn post drafted
- [ ] LinkedIn post posted (URL: )
- [ ] IG carousel drafted
- [ ] IG carousel posted (URL: )
- [ ] TikTok 30–45s script recorded
- [ ] TikTok 30–45s posted (URL: )
- [ ] TikTok 60–90s script recorded
- [ ] TikTok 60–90s posted (URL: )
- [ ] Reddit shares evaluated (per sub: posted / declined / gated)
```

## Hand-off

After the kit file is written, update:

1. WS09 task brief — note "publish kit drafted {date}"
2. WS10 dashboard — mark T48 entry for this blog as 🔵 (2 scripts drafted)
3. Tell the user which platform-specific skill to invoke next (`twitter`, `linkedin`, `instagram`, `reddit`) for actual posting

## Common failure modes

- **Recycling the blog hook on every lane.** Each lane needs a platform-native hook that points at the same thesis. The blog's opening sentence almost never works verbatim as a tweet.
- **Linking to BuildOS too early.** First link on every lane except LinkedIn should be to the blog, not the product.
- **Over-formatting.** No "5 TIPS TO FIX YOUR MORNING 🔥" LinkedIn posts. Brand is calm-but-direct, not listicle.
- **Missing vocabulary.** If the term-to-own isn't on every lane at least once, the cluster isn't compounding.
