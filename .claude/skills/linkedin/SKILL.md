---
name: linkedin
description: Browser automation for LinkedIn. Use when navigating LinkedIn, searching posts or profiles, reading notifications, posting, commenting, messaging, or running LinkedIn warmup tasks. Critical for any flow that must capture direct post URLs.
---

# LinkedIn

Load this when interacting with LinkedIn via browser automation. Detailed step-by-step flows live in `references/workflows.md` — load that when you need exact click targets, selector details, or the full direct-post-URL extraction procedure.

## Prerequisites

- User is logged into LinkedIn in Chrome.
- Start at `https://www.linkedin.com`.

## URL map

| Purpose | URL |
|---------|-----|
| Feed | `https://www.linkedin.com/feed/` |
| Messaging | `https://www.linkedin.com/messaging/` |
| Notifications | `https://www.linkedin.com/notifications/` |
| My Network | `https://www.linkedin.com/mynetwork/` |
| Jobs | `https://www.linkedin.com/jobs/` |
| Profile | `https://www.linkedin.com/in/<handle>/` |
| Company | `https://www.linkedin.com/company/<company>/` |
| People search | `https://www.linkedin.com/search/results/people/?keywords=<query>` |

## Quick reference

```
Post      → Start a post → click text → type → Post
Comment   → Comment → type → Post
Like      → click Like (long-press for reactions)
Repost    → Repost → "Repost" or "Repost with your thoughts"
Search    → click search bar → type → Enter → (pick tab)
Message   → Messaging → open thread → type → Send
```

## Non-obvious rules

- **Every captured post URL must be direct.** `/feed/update/urn:li:activity:<id>/` or `/posts/<handle>_slug-activity-<id>-xxxx/`. Never accept profile-activity or search URLs, and never record "search for X → click Y" text. Full extraction procedure is in `references/workflows.md` — open it when capturing URLs.
- Connection degrees affect messaging reach: 1st direct, 2nd through a mutual, 3rd+ extended. **InMail** (Premium) bypasses this.
- **Sponsored** posts are ads; skip unless the task specifies otherwise.

## When to read `references/workflows.md`

- Extracting a direct post URL (mandatory read before doing this).
- You need the exact composer layout, visibility settings, or draft-saving dialog.
- You're running a messaging flow (inbox filters, quick replies, compose-new path).
- Selectors need confirming.

## Integrations in this repo

This skill is loaded by `.claude/commands/linkedin-warmup.md` and `.claude/commands/linkedin-reply.md` before any LinkedIn browser interaction.
