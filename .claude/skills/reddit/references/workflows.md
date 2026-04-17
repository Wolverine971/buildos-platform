# Reddit — Detailed Workflows

Step-by-step flows for Reddit via JSON API + Chrome browser. Load this file when SKILL.md points you here.

## 1. Discover threads in a sub (JSON API — preferred)

Use for: the daily `/reddit-warmup` discovery pass. Much faster than browser scraping.

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
SUB="writing"

# Hot (what's trending now)
curl -sS -A "$UA" "https://www.reddit.com/r/$SUB/hot.json?limit=25" | \
  python3 -c "
import json, sys
d = json.load(sys.stdin)['data']['children']
for p in d:
    x = p['data']
    print(f\"↑{x['score']} c{x['num_comments']} {x['title'][:100]} | https://reddit.com/r/$SUB/comments/{x['id']}/\")
"

# New (freshest, for catching threads early)
curl -sS -A "$UA" "https://www.reddit.com/r/$SUB/new.json?limit=100"

# Search within sub (for thread-type matching — use each sub profile's "thread types" list)
QUERY="what tool"
ENC=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$QUERY")
curl -sS -A "$UA" "https://www.reddit.com/r/$SUB/search.json?q=%22$ENC%22&restrict_sr=1&t=month&sort=relevance&limit=10"
```

**Rate-limit aware fetch:** 7s sleep between requests. On HTTP 429, back off exponentially (7, 14, 28, 56s). The file returns ~1294 bytes of HTML when rate-limited — check HTTP status, not body length.

**What each endpoint is useful for:**

| Endpoint       | Use for                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `about.json`   | Subscriber count, `submit_text` (posting guidance), public description    |
| `about/rules.json` | Rules verbatim                                                         |
| `top.json?t=week`  | Culture signal — what the sub cares about right now                    |
| `top.json?t=month` | Evergreen thread patterns                                              |
| `new.json`         | Fresh threads (last hour–day) for real-time engagement                 |
| `hot.json`         | What's on the sub's front page right now                               |
| `search.json`      | Match sub-specific thread-type patterns from each sub's profile         |

## 2. Fetch a single thread with comments (JSON API)

```bash
UA="Mozilla/5.0 ..."
THREAD_ID="1sjmahf"
SUB="worldbuilding"
curl -sS -A "$UA" "https://www.reddit.com/r/$SUB/comments/$THREAD_ID/.json?limit=100&sort=top"
```

Returns a 2-element array: `[0]` is the post, `[1]` is the comment tree.

## 3. Open a thread in Chrome (for review)

```
https://www.reddit.com/r/{sub}/comments/{id}/
```

On macOS, opening from the command line:

```bash
open "https://www.reddit.com/r/worldbuilding/comments/1sjmahf/"
```

Open multiple at once for batch review:

```bash
for URL in $(cat /tmp/reddit-top-threads.txt); do open "$URL"; done
```

## 4. Read rules for a sub (before commenting)

**Option A — Chrome (human-readable):**
```
https://old.reddit.com/r/{sub}/about/rules/
```

Old Reddit renders rules in plain markdown. Much cleaner than new Reddit's UI for rule comprehension.

**Option B — JSON API:**
```bash
curl -sS -A "$UA" "https://www.reddit.com/r/{sub}/about/rules.json" | python3 -m json.tool
```

Cross-reference against the sub's profile at `docs/marketing/social-media/reddit/subreddit-profiles/{sub}.md` — the profile already has rules verbatim plus our interpretation.

## 5. Upvote a comment or post (Chrome)

1. Navigate to the thread URL.
2. Click the ▲ arrow to the left of the post/comment. It turns orange when upvoted.
3. Click again to remove.

**Keyboard shortcut (new Reddit, must be focused on the post):** `a` = upvote, `z` = downvote.

**Culture rule:** BuildOS doesn't use downvotes. We don't have the cultural standing.

## 6. Write a comment (Chrome)

1. Navigate to the thread URL.
2. Scroll to the comment box at the top of the comment tree. If it doesn't show, click the **Add a comment** button.
3. The box is a plain textarea with markdown support. Don't use rich-text-editor mode if it's offered — plain markdown is safer.
4. Check formatting preview (click **Markdown preview** or similar).
5. Click **Comment**.

**Reddit comment markdown:**

| Syntax                  | Effect               |
| ----------------------- | -------------------- |
| `**bold**`              | **bold**             |
| `*italic*`              | *italic*             |
| `> quoted line`         | blockquote           |
| `- item`                | bulleted list        |
| `1. item`               | numbered list        |
| `[text](url)`           | link                 |
| `` `code` ``            | inline code          |
| Blank line              | paragraph break      |

**BuildOS comment conventions:**

- Lowercase casual is fine in creator subs; match the thread's register.
- 2–4 sentences usually beats a wall of text.
- Always disclose founder relationship if mentioning BuildOS ("full disclosure, I'm the founder" is fine).
- Link to BuildOS only on the sub's sanctioned promo surface. Elsewhere, describe the workflow without the link.

## 7. Reply to a comment (Chrome)

1. Hover the comment → click **Reply**.
2. Same textarea/markdown as #6.
3. Click **Reply**.

## 8. Make a post to a sub (Chrome)

**Critical: check the sub's profile for flair requirements and posting gates first.**

1. Navigate to `https://www.reddit.com/r/{sub}/submit`.
2. Choose post type:
   - **Post** (text-only) — preferred for most BuildOS posts
   - **Link** — external URL only
   - **Images & Video**
   - **Poll**
3. Title: descriptive, non-clickbait.
4. Body: markdown.
5. **Flair:** click the flair icon next to the title — required in many subs. Pick the correct flair per the sub's profile.
6. Review, then click **Post**.

**Pre-flight checklist (always):**

- [ ] Does the sub require a minimum karma/age? (See the sub's profile's `Karma / account age requirements` section.)
- [ ] Is this post type allowed outside a weekly/fortnightly/monthly thread? (See `Self-promotion rules` section.)
- [ ] If it mentions BuildOS, is this the sanctioned surface?
- [ ] If it mentions BuildOS, does it include founder disclosure + honest limitation?
- [ ] Is the correct flair selected?
- [ ] Does the title avoid "I found this great tool…" / "I built [X]…" framing in a sub where that's a red flag?

## 9. Check inbox / notifications (Chrome)

```
https://www.reddit.com/message/inbox/
```

Tabs: **All**, **Mentions**, **Modmail**. Reply to mentions and direct replies to our comments to keep conversations alive.

## 10. Profile review (Chrome)

```
https://www.reddit.com/user/{username}/
```

Tabs: **Overview**, **Posts**, **Comments**, **Saved**, **Awards**, **Upvoted**. Useful for vetting whether a creator-adjacent redditor is real, active, and a fit for future outreach.

## Selector cheat-sheet (Chrome, new Reddit)

| Element                       | Reliable locator                                       |
| ----------------------------- | ------------------------------------------------------ |
| Post upvote                   | `button[aria-label="upvote"]` (to the left of post)    |
| Post downvote                 | `button[aria-label="downvote"]`                        |
| Comment box trigger           | Textarea labelled "Add a comment" or the **Add comment** button |
| Comment "Submit" button       | Button with text "Comment" at the bottom-right of the composer |
| Post flair picker             | Button with text "Select a flair" or the flair icon    |
| Submit form (text post)       | `/r/{sub}/submit` → **Post** tab → Title + Body fields |
| Submit form "Post" button     | Bottom-right of the submit form                         |

## Gotchas

- **WebFetch is blocked for reddit.com** (Claude Code). Use curl via Bash instead.
- **Old Reddit** (`old.reddit.com`) has cleaner HTML for reading rules and scanning old threads, but the JSON API is usually preferred.
- **Rate limiting** is ~10 req/min for anonymous. Paced 7s between requests is the sustainable floor. When rate-limited, Reddit returns an HTML error page (~1294 bytes) with HTTP 429.
- **Logged-in vs logged-out views can differ** — a sub may show a different submit_text to non-members, and private subs return 403 on about.json.
- **Account gates:** many subs silently shadow-filter posts from accounts <7–30 days old. The profile's `Karma / account age requirements` section captures the public ones.
- **Flair is mandatory** in many subs (r/screenwriting, r/getdisciplined, r/NewTubers, r/worldbuilding, r/ExperiencedDevs). Unflaired = removed.
- **AutoMod** removes posts for a dozen reasons that aren't in the public rules. If a post disappears silently within minutes of posting, it's probably AutoMod — check mod-mail or repost with a different title/framing.
- **Comment mod-removal** is invisible to the poster in most cases. Your comment shows to you but nobody else. If karma doesn't accrue after a day, assume shadow-removal and move on.

## Related

- `/.claude/commands/reddit-warmup.md` — Stage 1 engagement flow using this skill.
- `docs/marketing/social-media/reddit/reddit-subreddit-tracker.md` — subs to scan + recurring threads + cultural canaries.
- `docs/marketing/social-media/reddit/subreddit-profiles/` — per-sub rules, thread types, and voice notes.
