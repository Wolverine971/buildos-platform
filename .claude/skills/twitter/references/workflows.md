# Twitter/X — Detailed Workflows

Step-by-step browser flows for X/Twitter. Load this file when SKILL.md points you here — don't rely on memory for selectors.

## 1. Create a post

1. Go to `https://x.com/home`.
2. Click the "What's happening?" text area in the composer.
3. Composer expands. Controls visible:
   - Audience selector ("Everyone" dropdown)
   - Reply settings ("Everyone can reply")
   - Toolbar: image, GIF, poll, emoji, schedule, location, bold, italic
   - Character counter circle (280 default; longer with Premium)
   - "+" button (add posts to create a thread)
   - **Post** button (bottom-right)
4. Type content.
5. Click **Post**.

**Alt compose:** click the **Post** button in the left sidebar → modal composer.

**Discard:** press Escape or click outside the composer. Confirmation dialog: *"Discard post? This can't be undone and you'll lose your draft."* Pick **Discard** or **Cancel**.

**Thread:** after the first post, click **+**, add another. All posts publish together.

## 2. Reply

1. Click the speech-bubble icon under the post.
2. Composer opens inline or as a modal.
3. Type the reply.
4. Click **Reply**.

## 3. Like

Click the heart icon under the post. It turns red/pink when liked. Click again to unlike.

## 4. Repost / Quote

1. Click the repost (arrows) icon under the post.
2. Menu:
   - **Repost** — simple share.
   - **Quote** — adds your own comment.

## 5. Bookmark

Click the bookmark icon under the post. Bookmarks live at `https://x.com/i/bookmarks`.

## 6. Search

1. Click the Search bar (top of the right sidebar, or use **Explore**).
2. Type the query. Suggestions appear:
   - "Search for '<query>'" — full search
   - Matching account suggestions
3. Press Enter or click a suggestion.

Results tabs: **Top · Latest · People · Media · Lists**. Right sidebar has a filter panel and a link to advanced search.

## 7. Notifications

Sidebar → **Notifications** (or `https://x.com/notifications`). Tabs: **All**, **Mentions**.

## 8. Direct messages (X Chat)

X moved DMs to an encrypted "X Chat". First-time setup requires creating a passcode — that step must be done manually. After setup, sidebar → **Chat** (or `https://x.com/messages`).

## 9. Profile

Sidebar → **Profile** (or `https://x.com/<handle>`). Sections: Posts, Replies, Highlights, Articles, Media, Likes. **Edit profile** button on your own profile opens the edit dialog.

## 10. Explore / discover

Sidebar → **Explore** (`https://x.com/explore`). Trending topics, news categories, For You recommendations.

## Selector cheat-sheet

| Element | Reliable locator |
|---------|------------------|
| Post composer trigger | "What's happening?" placeholder text on `/home` |
| Post button | Bottom-right of composer |
| Audience selector | "Everyone" dropdown in composer |
| Search bar | Right-sidebar top, placeholder "Search" |
| Reply | Speech-bubble icon under a post |
| Like | Heart icon under a post |
| Repost | Arrows icon under a post |
| Bookmark | Bookmark icon under a post |
| Share | Upload icon under a post |

## Gotchas

- Standard click + keyboard input works — don't over-engineer with synthetic events.
- Dark mode is the default skin; visual selectors don't need light/dark branches.
- Premium gets longer posts and blue check. Gold = Business, Gray = Government.
- View counts are public on every post.
- DMs cannot be automated until the manual passcode setup has been completed once.
