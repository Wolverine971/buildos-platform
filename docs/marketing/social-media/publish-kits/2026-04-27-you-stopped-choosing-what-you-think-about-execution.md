---
title: 'Execution Notes — T35 Publish Kit'
created: 2026-04-27
status: in-progress
owner: DJ Wayne
related_kit: docs/marketing/social-media/publish-kits/2026-04-27-you-stopped-choosing-what-you-think-about-kit.md
related_blog: apps/web/src/content/blogs/philosophy/you-stopped-choosing-what-you-think-about.md
purpose: Step-by-step posting workflow + decisions for T35. Read this when you're ready to publish.
path: docs/marketing/social-media/publish-kits/2026-04-27-you-stopped-choosing-what-you-think-about-execution.md
---

# Execution Notes — T35 "You Stopped Choosing What You Think About"

Companion doc to the [publish kit](./2026-04-27-you-stopped-choosing-what-you-think-about-kit.md). Read top-to-bottom when you're ready to ship. Each section is one platform, one decision, one set of commands.

---

## 1. Cross-post sequence (the order matters)

| Step | When          | Action                                 |
| ---- | ------------- | -------------------------------------- |
| 1    | T-0           | Publish blog on build-os.com           |
| 2    | T+2 hours     | Post X / Twitter thread                |
| 3    | T+24 hours    | Post LinkedIn                          |
| 4    | T+48 hours    | Record + post TikTok #1 (30–45s)       |
| 5    | T+72 hours    | Post Instagram carousel                |
| 6    | T+7 days      | Record + post TikTok #2 (60–90s)       |
| 7    | First Wed     | r/podcasting Wednesday Product/Service |
| 8    | Within 7 days | r/Substack OP                          |
| 9    | Opportunistic | r/productivity comment-only            |

**Why this order:** the X thread Tweet 8 contains the blog URL. If you post X before the blog goes live, the link 404s.

---

## 2. Twitter / X — what to run

### Pre-flight (3 checks)

- [ ] Blog is live at `build-os.com/blogs/philosophy/you-stopped-choosing-what-you-think-about`
- [ ] Logged into the correct X account in Chrome
- [ ] Kit open in another tab for spot-checking

### Slash command

```
/twitter post the 8-tweet thread from docs/marketing/social-media/publish-kits/2026-04-27-you-stopped-choosing-what-you-think-about-kit.md — chain as a single thread (tweets 2–8 reply to tweet 1). Capture the URL of tweet 1 when done and report it back.
```

### What the skill will do

1. Open X compose
2. Paste Tweet 1 verbatim, post
3. Open the new tweet's reply chain
4. Paste Tweets 2–8 in order, posting each as a reply to the previous
5. Return the Tweet 1 permalink

### After the skill finishes

Send the tweet 1 URL back to me and I'll update:

- Kit status dashboard (`X thread posted (URL: ...)`)
- WS09 T35 task brief (`x_url:` field)

Or do it manually — find this line in the kit and paste your URL:

```
- [ ] X thread posted (URL: )
```

### Failure modes

- **Skill posts tweet 1 but stalls on the chain** → re-open tweet 1 manually, reply with tweets 2–8 by hand from the kit
- **Tweet rejected for length** → Tweet 5 is the tightest (~272 chars). Drop the trailing question if X complains
- **Don't add hashtags.** Brand voice is calm, not desperate

---

## 3. LinkedIn — manual posting (3 steps, ~90 seconds)

> **Note:** Browser automation tools aren't loaded in this Claude Code session, so I can't drive the browser directly. You'll do the 3 steps below — total time should be under 90 seconds. When done, send me the post URL and I'll handle all status updates.

### Decision: option (b) confirmed — post + first-comment link.

The blog URL is already verified live (HTTP 200): `https://build-os.com/blogs/philosophy/you-stopped-choosing-what-you-think-about`.

### Step 1 — Post the essay

1. Open `https://www.linkedin.com/feed/`
2. Click **Start a post**
3. Paste the post body in the box below (everything between the `=== POST BODY ===` markers, exclusive of the markers themselves)
4. Click **Post**

```
=== POST BODY (start) ===
The thing you lost wasn't attention. Attention is fine. It's upstream of attention.

The public internet flipped two years ago, and almost nobody named what flipped. You used to point your attention at things — books, links, friends, a search you actually typed. Now things point themselves at you, optimized to win, funded to win. The ranking model decides what you see, and importance is a product you can buy. One streamer paid $666,000 last month to flood the algorithm with 69,000 clips and reach 2.2 billion views. AI is about to make that playbook cost a few hundred dollars.

The feeling shows up in three forms. Curiosity collapse: you stopped wondering, because the feed will serve you something within the hour anyway. Feed paranoia: a sane response to a feed that is, in fact, mostly synthetic. Algorithm-shaped thoughts: your inner monologue starts to sound like a successful tweet. The feed didn't just take some of your time. It edited some of your voice.

The right unit of recovery isn't screen time or a digital detox. It's the chosen input — anything you read, watched, or thought about today because you pointed yourself at it. A book on the nightstand. A page in a journal. A brain dump before you open the feed. The specific surface matters less than the fact that you authored it.

I built BuildOS as a thinking environment for that surface — a brain dump in, a daily brief out, the first input of your day authored by you. But the habit is the habit, with or without the tool. The anti-feed isn't an app. It's the act of choosing again.
=== POST BODY (end) ===
```

### Step 2 — Drop the link in the first comment (within 60 seconds)

1. On your just-published post, click **Comment**
2. Paste the comment text below
3. Click **Post**

```
=== FIRST COMMENT (start) ===
Full piece, with a 60-second test that tells you how far gone it is for you: https://build-os.com/blogs/philosophy/you-stopped-choosing-what-you-think-about
=== FIRST COMMENT (end) ===
```

### Step 3 — Grab the post URL and send it to me

1. On your new post, click the timestamp ("now" / "1m" — top of the post, near your name)
2. Copy the URL from your browser address bar — should look like one of these:
    - `https://www.linkedin.com/feed/update/urn:li:activity:7XXXXXXXXXXXXXXXX/`
    - `https://www.linkedin.com/posts/<handle>_<slug>-activity-7XXXXXXXXXXXXXXXX-XXXX/`
3. Paste it back to me in chat

When I have the URL, I'll update:

- This file's status dashboard
- The kit's status dashboard
- The WS09 T35 task brief

### Spec reminder (in case you want to tweak)

- ~270 words · 5 paragraphs
- BuildOS mentioned once (paragraph 5)
- No hashtags, no emoji, no edits expected
- The post is essay-shaped — meant to stand alone

---

## ARCHIVED — option (a) vs (b) decision (resolved 2026-04-27)

### Final post text (ready to publish, asterisks already stripped)

```
The thing you lost wasn't attention. Attention is fine. It's upstream of attention.

The public internet flipped two years ago, and almost nobody named what flipped. You used to point your attention at things — books, links, friends, a search you actually typed. Now things point themselves at you, optimized to win, funded to win. The ranking model decides what you see, and importance is a product you can buy. One streamer paid $666,000 last month to flood the algorithm with 69,000 clips and reach 2.2 billion views. AI is about to make that playbook cost a few hundred dollars.

The feeling shows up in three forms. Curiosity collapse: you stopped wondering, because the feed will serve you something within the hour anyway. Feed paranoia: a sane response to a feed that is, in fact, mostly synthetic. Algorithm-shaped thoughts: your inner monologue starts to sound like a successful tweet. The feed didn't just take some of your time. It edited some of your voice.

The right unit of recovery isn't screen time or a digital detox. It's the chosen input — anything you read, watched, or thought about today because you pointed yourself at it. A book on the nightstand. A page in a journal. A brain dump before you open the feed. The specific surface matters less than the fact that you authored it.

I built BuildOS as a thinking environment for that surface — a brain dump in, a daily brief out, the first input of your day authored by you. But the habit is the habit, with or without the tool. The anti-feed isn't an app. It's the act of choosing again.
```

**Spec:** ~270 words · 5 paragraphs · BuildOS mentioned once near end · standalone (no blog link in body).

### The one decision

| Option  | What happens                                                                                       | When to pick                                                        |
| ------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **(a)** | Post standalone now. No link. The post stands alone as an essay.                                   | If blog isn't deployed yet, or you want LinkedIn doing its own work |
| **(b)** | Wait for blog deploy. Post, then add a "Full piece" link in the first comment under your own post. | If blog is going live today and you want the funnel                 |

**My read:** the LinkedIn post is essay-shaped and self-contained. (a) is the cleanest move unless the blog is going live within the hour. (b) is funnel-better but requires you to remember the comment within ~2 minutes of posting (LinkedIn's algorithm penalizes edits and late comments).

**Reply (a) or (b)** in chat and I'll invoke `/linkedin` immediately.

### After the LinkedIn post is up

I'll update:

- Kit status dashboard (`LinkedIn post posted (URL: ...)`)
- WS09 T35 task brief (`linkedin_url:` field)

---

## 4. Everything after LinkedIn

These are later. Don't think about them today.

### TikTok #1 (T+48h)

- Mobile workflow. Record straight-to-camera or over a screen recording of Devin Nash's video.
- Script lives at: kit § "TikTok Script 1 — 30–45s (hook-on-vocabulary)"
- Owns the term: **chosen input** (must appear ≥2× in your delivery)
- Caption: include "chosen input" in bold at least twice in on-screen text

### Instagram carousel (T+72h)

- Mobile workflow (carousel creation is friendlier on phone).
- 9 slides. Plain cards. No emoji. Slide-by-slide copy lives at: kit § "Instagram carousel"
- Slide 9 has the link-in-bio CTA — make sure your IG link-in-bio points to the blog before posting

### TikTok #2 (T+7d)

- Same drill as #1 but longer (60–90s)
- Script lives at: kit § "TikTok Script 2 — 60–90s (explainer)"

### Reddit (opportunistic, see kit)

- **r/podcasting** — Wednesday 7am ET Product/Service thread (sanctioned). Easiest first share.
- **r/Substack** — OP-shaped post when you have time for the comment-cycle 90/10.
- **r/productivity** — comment-only on someone else's thread. No OP. Karma-gated.

---

## 5. Status checkpoints (the three places)

After each post goes live, three files need the URL:

| File                                                                                                   | What to update                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| `docs/marketing/social-media/publish-kits/2026-04-27-you-stopped-choosing-what-you-think-about-kit.md` | Status dashboard (URL fields)               |
| `docs/marketing/distribution/workstreams/WS09-anti-feed-cluster.md`                                    | T35 task brief (status block)               |
| `docs/marketing/distribution/workstreams/WS10-short-form-video.md`                                     | T48 row for T35 (Recorded / Posted columns) |

If you'd rather just send me the URLs as you post, I'll do all three updates for you. That's the easier version.

---

## 6. Red flags to watch for as you ship

- **Tweet 8 link 404s** → blog isn't deployed yet. Stop, deploy, then post X.
- **LinkedIn post gets <50 views in first hour** → algorithm flagged it as low-signal. Don't edit. Comment on your own post within 5 min with one substantive line to re-trigger distribution.
- **TikTok captions don't match your audio** → platform autocaps will drift. Check captions before posting; lock to your script.
- **Reddit OP gets banned** → most likely r/productivity (strict). If it happens, message mods with founder disclosure, don't repost.

---

**TL;DR for you right now:**

1. Reply **(a)** or **(b)** above for LinkedIn → I post it.
2. When you're ready for X, run the slash command in §2.
3. Send me the URLs as you go and I'll handle the status updates.
