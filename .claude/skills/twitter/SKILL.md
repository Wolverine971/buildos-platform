---
name: twitter
description: Browser automation for X/Twitter. Use when navigating X, searching posts, reading notifications, drafting or posting tweets, replying, liking, reposting, or running Twitter warmup tasks.
---

# Twitter / X

Load this when interacting with X via browser automation. Detailed flows live in `references/workflows.md` — load that file when you need exact click/selector sequences.

## Prerequisites

- User is logged into X in Chrome.
- Start at `https://x.com`.

## URL map

| Purpose | URL |
|---------|-----|
| Home | `https://x.com/home` |
| Explore | `https://x.com/explore` |
| Notifications | `https://x.com/notifications` |
| Search | `https://x.com/search?q=<query>&src=typed_query` |
| Profile | `https://x.com/<handle>` |
| Tweet permalink | `https://x.com/<handle>/status/<id>` |
| Messages (X Chat) | `https://x.com/messages` |
| Bookmarks | `https://x.com/i/bookmarks` |
| Settings | `https://x.com/settings` |

## Keyboard shortcuts

`n` new post · `j/k` navigate feed · `l` like · `r` reply · `t` repost.

## Quick reference (one-liners)

```
Post    → click "What's happening?" → type → click Post
Reply   → click speech-bubble → type → click Reply
Like    → click heart icon
Repost  → click repost icon → Repost or Quote
Search  → click Search bar → type → Enter
```

## When to read `references/workflows.md`

Open that file when:

- You need exact selectors or the composer's layout details.
- You're building a thread (the "+" button flow).
- You're doing anything DM-related (X Chat passcode gotcha).
- Something isn't working as the quick-reference suggests — the file has edge cases and fallback paths.

## Naming & UI notes

- "Tweets" → "Posts" in current UI. Use "Post".
- Dark mode is default; no need to branch on theme for selectors.
- Verification badges: blue = Premium, gold = Business, gray = Government/official.
- View counts are public on every post.

## Integrations in this repo

This skill is loaded by `.claude/commands/twitter-warmup.md` before any X browser interaction.
