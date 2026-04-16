---
name: instagram
description: Browser automation for Instagram web. Use when navigating feed, stories, reels, profiles, hashtags, comments, likes, DMs, or running Instagram warmup tasks. Web covers everything needed for engagement; story creation and some Reels features are mobile-only.
---

# Instagram

Load this when interacting with Instagram via browser automation. Detailed flows, selectors, and engagement gotchas live in `references/workflows.md` — load that file when you need exact click sequences or nuance.

## Prerequisites

- User is logged into Instagram in Chrome.
- Start at `https://www.instagram.com`.
- Instagram web covers likes, comments, saves, story viewing, DMs, and search. Story creation and some Reels features are **mobile-only**.

## URL map

| Purpose | URL |
|---------|-----|
| Home feed | `https://www.instagram.com/` |
| Explore | `https://www.instagram.com/explore/` |
| Reels | `https://www.instagram.com/reels/` |
| Profile | `https://www.instagram.com/<username>/` |
| Hashtag | `https://www.instagram.com/explore/tags/<hashtag>/` |
| Post permalink | `https://www.instagram.com/p/<post_id>/` |
| Reel permalink | `https://www.instagram.com/reel/<reel_id>/` |
| Messages | `https://www.instagram.com/direct/inbox/` |
| Settings | `https://www.instagram.com/accounts/edit/` |

## Quick reference

```
Like        → click heart (or double-tap image)
Comment     → click speech bubble → type → Post
Save        → click bookmark
Search      → sidebar Search → type → pick result
Profile     → instagram.com/<username>
Hashtag     → instagram.com/explore/tags/<hashtag>
Message     → Messages → open thread → Message... → Send
Reels       → sidebar Reels → scroll, like/comment on right-rail buttons
Story reply → open story → "Send message" input → opens DM thread
```

## Non-obvious rules

- **Rate-limiting is aggressive.** Space out actions. Batched likes/comments trigger challenges.
- **Algorithm weights, strongest → weakest:** saves, shares to DM/Story, comments (meaningful ones), reel completion rate, dwell time — then likes.
- **Meaningful comments matter more than short ones.** ≥5 words, relevance > generic praise. Short "🔥" / "nice!" comments post but barely move reach.
- **Reply to comments on your own posts within ~1 hour** — that window dominates distribution.
- **Hashtags:** 3–5 per post is current guidance. Ignore the 30-tag era. Either caption or first comment.

## When to read `references/workflows.md`

- You need exact selectors, comment input label, or story reply behavior.
- You're building a DM flow (inbox filter / new message / send path).
- You need the engagement-signals rundown with specifics.
- A scripted flow is failing and you suspect a selector or permission check.

## Integrations in this repo

This skill is loaded by `.claude/commands/instagram-warmup.md` and `.claude/commands/instagram-reply.md` before any Instagram browser interaction.
