# LinkedIn — Detailed Workflows

Step-by-step browser flows for LinkedIn. Load this file when SKILL.md points you here.

## 1. Create a post

1. Go to `https://www.linkedin.com/feed/`.
2. Click **Start a post** in the composer card.
3. Modal opens. Controls visible:
   - Profile selector (top-left)
   - Visibility dropdown ("Post to Anyone")
   - Text area with placeholder "What do you want to talk about?"
   - Toolbar: emoji, Rewrite with AI, photo, calendar, more
   - **Post** button (bottom-right; disabled until there's text)
4. Click the text area.
5. Type the post.
6. Click **Post** (turns blue when text is present).

**Close without posting:** click the X (top-right). Dialog: *"Save this post as a draft?"* — pick **Discard** or **Save as draft**.

**Visibility change:** click the dropdown next to your name. Options: Anyone, Connections only, etc.

## 2. Reply / comment

1. Click **Comment** under the post.
2. Comment input expands.
3. Type the comment.
4. Press Enter or click **Post**.

## 3. Like / react

- Click **Like** (thumbs-up) under the post.
- **Long-press** for reactions: Celebrate, Love, Insightful, etc.

## 4. Repost

- Click **Repost**.
- Options: **Repost** or **Repost with your thoughts**.

## 5. Share (Send)

- Click **Send** under the post.
- Pick connection(s) to share with.

## 6. Search — people / companies

1. Click the search bar (top-left). Dropdown shows recent + trending.
2. Type the query. Suggestions appear.
3. Press Enter or click a suggestion.
4. Results page tabs: Jobs · Companies · Posts · **People** · Courses · Groups · Schools · Events · Products · Services.

**People at a company:**
1. Search the company name.
2. Click the **People** tab.
3. Filters: connection degree (1st / 2nd / 3rd+), Actively hiring, Locations, Current companies, All filters.

People-search URL:
`https://www.linkedin.com/search/results/people/?keywords=<query>&origin=SWITCH_SEARCH_VERTICAL`

## 7. Messaging

- **Open:** nav bar → **Messaging** (`https://www.linkedin.com/messaging/`).
- Left panel: conversations. Filters: Focused, Jobs, Unread, Connections, InMail, Starred. Page inboxes available for company pages you admin.
- Right panel: the open conversation.

**Send in an existing thread:**
1. Click the conversation in the left panel.
2. Click **Write a message…** at the bottom.
3. Type; toolbar supports image, attachment, GIF, emoji.
4. Click **Send** or press Enter.

**Quick replies:** LinkedIn may surface one-tap suggested replies — clicking one auto-sends.

**Compose new:**
1. Click the compose icon (pen/paper, top-right of messaging panel).
2. Type the recipient in **To**.
3. Type and send.

## 8. Notifications

Nav bar → **Notifications** (`https://www.linkedin.com/notifications/`). Badge on the nav item shows unread count.

## 9. Profile — view / edit

- Click your name / avatar in the left sidebar, or visit `https://www.linkedin.com/in/<username>/`.
- Click pencil icons to edit each section.

## 10. Extract a direct post URL (required for warmup docs)

**Every post** captured in a warmup doc must include a clickable direct URL. Never dump "search for X → click Y" instructions.

**Method A — click the timestamp** (preferred):

1. Find the post in the feed, search results, or the author's activity page.
2. Look for the timestamp ("2h", "1d", "3w"). It's a link.
3. Click it. The browser URL is now the direct post URL — e.g. `https://www.linkedin.com/feed/update/urn:li:activity:7309XXXXXXXXX/`.
4. Capture that URL.

**Method B — click the "X comments" link**:

1. Click the "N comments" / engagement summary text below the post.
2. Detail view opens.
3. Capture the URL.

**Method C — three-dot menu → Copy link**:

1. Click **⋯** on the post.
2. **Copy link to post** (when available) puts the URL in the clipboard.

**Method D — read HTML fallback**:

1. `read_page` on the current page.
2. Find `href` values containing `/feed/update/` or `/posts/`.
3. Match the href to the target post by surrounding text/author.

**Valid formats:**
- `https://www.linkedin.com/feed/update/urn:li:activity:7309XXXXXXXXX/`
- `https://www.linkedin.com/posts/<handle>_slug-activity-7309XXXXXXXXX-XXXX/`

**Never accept:**
- Profile activity URLs (`/in/<handle>/recent-activity/all/`)
- Search result URLs (`/search/results/content/?keywords=…`)
- Text like "search for X, then click Y"

## Selector cheat-sheet

| Element | Locator |
|---------|---------|
| Search bar | Top nav, "Search" placeholder |
| Start a post | Button in composer card on feed |
| Post editor | Modal with "What do you want to talk about?" |
| Post button | Bottom-right of modal; blue when active |
| Message input | "Write a message…" in conversation view |
| Send button | Right side of message input toolbar |
| Top nav items | Home · My Network · Jobs · Messaging · Notifications · Me |

## Gotchas

- Standard click + keyboard input works; no synthetic events needed.
- Draft prompt appears when closing the composer with unsaved text.
- Connection degrees: 1st = direct, 2nd = through a connection, 3rd+ = extended network.
- **InMail** = Premium feature for messaging people outside your network.
- Some posts tagged **Sponsored** are ads; skip unless the task explicitly includes them.
- Company-page admins get a separate "page inboxes" view in Messaging.
