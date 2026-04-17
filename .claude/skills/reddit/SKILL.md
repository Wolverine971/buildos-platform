---
name: reddit
description: Browser + JSON-API automation for Reddit. Use when navigating Reddit, searching subreddits/threads, reading rules, scanning new/hot, discovering BuildOS engagement opportunities, or running the Reddit warmup flow. Prefers Reddit's public JSON API for fast read-only discovery and Chrome for review and interaction.
---

# Reddit

Load this when interacting with Reddit. Most discovery work uses Reddit's public JSON API (fast, read-only, no auth required). Use Chrome for review, rule reading, and any interaction (voting, commenting, posting).

Detailed flows and selectors live in `references/workflows.md` — load that when you need exact click patterns or the API query patterns.

## Two modes, and when to use each

| Mode                   | When                                                               | Why                                                             |
| ---------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| **JSON API** (curl)    | Bulk discovery: subscribers, rules, top/hot/new, search            | ~100x faster than browser scraping. Handles rate limits cleanly. |
| **Chrome browser**     | Reading individual threads, upvoting, commenting, profile review   | Reddit's rendering includes context the API flattens; interaction requires auth. |

**Default:** discover with JSON API, review/interact with Chrome.

## JSON API quick reference

**Base pattern:** append `.json` to any Reddit URL. Use a real User-Agent header.

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"

# Sub metadata + submit rules
curl -sS -A "$UA" "https://www.reddit.com/r/{sub}/about.json"

# Full rules
curl -sS -A "$UA" "https://www.reddit.com/r/{sub}/about/rules.json"

# Top posts (week / month)
curl -sS -A "$UA" "https://www.reddit.com/r/{sub}/top.json?t=week&limit=25"
curl -sS -A "$UA" "https://www.reddit.com/r/{sub}/top.json?t=month&limit=25"

# Hot / new
curl -sS -A "$UA" "https://www.reddit.com/r/{sub}/hot.json?limit=25"
curl -sS -A "$UA" "https://www.reddit.com/r/{sub}/new.json?limit=100"

# Search within a sub (pattern for thread-type matching)
curl -sS -A "$UA" "https://www.reddit.com/r/{sub}/search.json?q=%22what+tool%22&restrict_sr=1&t=month&sort=relevance&limit=10"
```

**Rate limits:** ~10 req/min for anonymous. Pace `sleep 7` between requests. Script in the repo: `docs/marketing/social-media/reddit/tools/fetch-sub.sh` (add if missing).

**429 response:** Reddit returns an HTML "Too Many Requests" page instead of JSON (size ~1294 bytes). Always check HTTP status; retry with exponential backoff.

**Blocked endpoints:**
- Claude Code's built-in `WebFetch` tool **cannot fetch reddit.com** — always use curl via Bash.

## URL map (browser)

| Purpose                        | URL                                                                    |
| ------------------------------ | ---------------------------------------------------------------------- |
| Sub front                      | `https://www.reddit.com/r/{sub}/`                                      |
| Sub rules                      | `https://www.reddit.com/r/{sub}/about/rules/`                          |
| Sub about (sidebar)            | `https://www.reddit.com/r/{sub}/about/`                                |
| Sub new                        | `https://www.reddit.com/r/{sub}/new/`                                  |
| Sub hot                        | `https://www.reddit.com/r/{sub}/hot/`                                  |
| Sub top (week)                 | `https://www.reddit.com/r/{sub}/top/?t=week`                           |
| Sub search                     | `https://www.reddit.com/r/{sub}/search/?q={q}&restrict_sr=1&t=month`   |
| Old Reddit (cleaner rules)     | `https://old.reddit.com/r/{sub}/about/rules/`                          |
| Single thread                  | `https://www.reddit.com/r/{sub}/comments/{id}/`                        |
| Inbox / notifications          | `https://www.reddit.com/message/inbox/`                                |
| User profile                   | `https://www.reddit.com/user/{username}/`                              |
| Submit a post                  | `https://www.reddit.com/r/{sub}/submit`                                |
| Site-wide search               | `https://www.reddit.com/search/?q={q}`                                 |
| Google restriction trick       | `site:reddit.com/r/{sub} "{q}"` — for when Reddit search is unhelpful  |

## Prerequisites for interaction

- User is logged into Reddit in Chrome with the burner account (per T10 karma task).
- Account has cleared any AutoMod karma/age gates required by the target sub (see each sub's profile in `docs/marketing/social-media/reddit/subreddit-profiles/`).

## Keyboard shortcuts (new Reddit)

`j/k` next/previous post · `a/z` upvote/downvote · `s` save · `.` expand comment tree. (Only relevant when already on the page; don't use for bulk discovery.)

## Quick reference (one-liners)

```
Read rules     → /r/{sub}/about/rules/  (or JSON API about/rules.json)
Find threads   → JSON API: hot.json / new.json / search.json?q=...&restrict_sr=1&t=month
Open thread    → /r/{sub}/comments/{id}/
Upvote         → click ▲ (or `a` key if focused)
Comment        → click "Add a comment" → write → click Comment
Post (text)    → /r/{sub}/submit → pick Text → title + body → Post
Flair a post   → during submission or via the flair icon next to the post title
```

## When to read `references/workflows.md`

Open that file when:

- You need exact selectors or submit-form layout details.
- You're crafting or posting a comment or reply (Stage 2 of the warmup flow).
- You need the per-sub flair rules (many subs require flair — unflaired posts get removed).
- Rate limits are mysteriously blocking you and you want the diagnosis table.
- Something isn't working as the quick-reference suggests.

## Critical rules (cross-sub, non-negotiable for BuildOS)

1. **Never mention BuildOS outside a sub's sanctioned self-promo surface.** Each sub's profile lists exactly where that is (daily/weekly/fortnightly threads, or nowhere).
2. **Never run user research or beta recruitment.** Almost every creator/ADHD/productivity sub bans this explicitly with permaban consequences.
3. **Never lead with "AI" as the product frame** in the 8 AI-hard-ban subs (see `reddit-subreddit-tracker.md` for the list).
4. **Always disclose founder relationship** when mentioning BuildOS in any sanctioned surface. Non-disclosure = ban in r/podcasting and culturally everywhere else.
5. **90/10 rule:** 90% value contribution, 10% product mention. Violating this gets 80%+ of SaaS companies banned within a month on Reddit.
6. **Respect cultural canaries.** Each sub has a pinned or high-upvote mod/community post that draws the anti-promo line. They're catalogued in the tracker's "Cultural canaries" section.

## Integrations in this repo

This skill is loaded by `.claude/commands/reddit-warmup.md` before any Reddit interaction. The command drives the daily engagement flow and references the tracker + per-sub profiles in `docs/marketing/social-media/reddit/`.
