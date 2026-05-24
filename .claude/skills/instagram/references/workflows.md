# Instagram — Detailed Workflows

Step-by-step browser flows for Instagram. Load this file when SKILL.md points you here.

## 1. Feed posts

**Like:**
- Click the heart under the post, or double-click the image/video.

**Comment:**
1. Click the speech-bubble (or click "Add a comment…" text).
2. Type.
3. Click **Post** (blue when text is present).

**Save:**
- Click the bookmark icon. Can be saved into collections.

**Share:**
- Click the paper-plane icon. Options: Send to people, Copy link, Share to Story.

## 2. Reels

**Open:**
- Sidebar → **Reels** (or `https://www.instagram.com/reels/`).

**Like:**
- Click heart on the right, or double-tap the video.

**Comment:**
1. Click the speech-bubble on the right.
2. Comments panel slides open.
3. Type in "Add a comment…" and click **Post**.

## 3. Search & explore

1. Sidebar → **Search** (magnifying glass).
2. Panel slides out from the left.
3. Type into "Search".
4. Results sections:
   - **Accounts** — user profiles
   - **Tags** — hashtags
   - **Places** — location tags

**Hashtag page:** `https://www.instagram.com/explore/tags/<hashtag>/` — tabs: **Top** and **Recent**.

**Explore:** `https://www.instagram.com/explore/` — algorithmic grid of posts + reels.

## 4. Profile view

- Your profile: sidebar bottom → avatar, or `https://www.instagram.com/<username>/`.
- Other profile: `https://www.instagram.com/<username>/`. Visible controls: **Follow / Following** toggle, **Message**. Tabs: Posts · Reels · Tagged.

Profile header shows Posts / Followers / Following counts, bio, profile pic, and story highlights.

## 5. Stories

- Story rings appear at the top of the home feed.
- Click a profile with a colored ring to open the story.
- Auto-advances; click right to skip, left to go back.
- **Reply:** text input at the bottom — "Send message". Replies create a DM thread.
- **React:** quick emojis (heart, clap, fire, cry, surprise, laugh).
- **Share:** paper-plane icon.

Stories expire after 24h. Green ring = Close Friends.

## 6. Direct messages

- Sidebar → **Messages** (paper-plane), or `https://www.instagram.com/direct/inbox/`.
- Left: conversation list. Right: active thread. "New message" compose icon top-right.

**Send:**
1. Click a conversation.
2. Type in "Message…".
3. Click **Send** or press Enter.

## 7. Notifications

- Sidebar → **Notifications** (heart icon). Panel slides out with:
  - Follow requests
  - Activity (likes, comments, follows, mentions) grouped by Today / This Week / This Month.

## 8. Account switching and picker recovery

Treat account switching as a required setup workflow, not a best-effort click. DJ's Chrome profile commonly has multiple Instagram accounts available:

- `djwayne3`
- `build.os`
- `9takesdotcom`
- `dj_pew_pew`

Before any scan, comment, like, save, or DM action:

1. Navigate to `https://www.instagram.com/`.
2. Determine the active account from at least two signals:
   - avatar alt text includes `<handle>'s profile picture`
   - profile link points to `/<handle>/`
   - sidebar/top-right widget text shows the intended handle/name
3. If the active account is wrong, use one of the known-good switch paths below.
4. After switching, reload once and repeat the two-signal verification.
5. If the target handle is not visible in the picker, stop and log `browser_limitation: instagram_account_not_in_picker`; do not proceed on a neighboring account.
6. If the target handle appears but a protected route redirects to `/accounts/login/`, stop and log `browser_limitation: instagram_session_logged_out`; DJ must refresh that account's login manually.

### Path A: Settings -> Switch accounts (logged-in session)

Use this when Instagram is already logged into a wrong account and the sidebar "Switch" label is collapsed or has a zero-size hit target.

1. Click the Settings gear in the left sidebar. If the visible text target is collapsed, click the parent link around `svg[aria-label="Settings"]`.
2. In the popup, click the `div[role="button"]` row labeled **Switch accounts**.
3. In the picker overlay, click the target handle row. Handles normally render as `div[role="button"]` rows.
4. Wait for the page to refresh, reload once if needed, then verify from two account signals before acting.

Known 2026-05-21 pattern: logged-in `@9takesdotcom` session switched to `@djwayne3` by Settings gear -> Switch accounts -> `djwayne3` row. The sidebar "Switch" span had `w=0/h=0`, so the Settings path was the reliable route.

### Path B: Login/account picker row (logged-out or relabeled picker)

When Chrome lands on the logged-out account picker but the target handle is visible, the account can often be restored without the normal Switch Accounts modal:

1. Confirm the target handle is listed in the picker.
2. Click the text row/span for the target handle, not a nearby blank area.
3. Wait for Instagram to load the home feed.
4. Verify the active account from at least two signals:
   - sidebar or top-right avatar alt text includes `<handle>'s profile picture`
   - profile link points to `/<handle>/`
   - sidebar widget text shows the intended handle/name
5. Only proceed to comments, notifications, or DMs after verification.

Known 2026-05-20 pattern: the picker-click workaround restored `@djwayne3`. For BuildOS posting, `/instagram-reply` should click the `build.os` row from the same picker screen, then verify `build.os` before posting or reading DMs.

If the handle appears in the picker but protected routes redirect to `/accounts/login/`, the account is listed but has no valid session cookie. Stop and require DJ to log in manually; do not attempt password entry.

## 9. Selector cheat-sheet

| Element | Locator |
|---------|---------|
| Search input | Left-sidebar panel, "Search" placeholder |
| Comment input | "Add a comment…" under posts/reels |
| Post button | Blue text label, appears once comment has content |
| Like button | Heart icon under posts; right side on reels |
| Save button | Bookmark icon under posts |
| Share button | Paper-plane icon |
| Follow button | Profile header, "Follow" / "Following" toggle |
| Story rings | Top of home feed; colored ring = unseen story |

## 10. Engagement gotchas

- **Rate-limiting is aggressive.** Space out actions; batches of likes/comments trigger challenges.
- **Saves and shares outweigh likes** in the algorithm. Reel completion and dwell time also matter more than like count.
- **Comments under 5 words** get less algorithmic weight; short "nice!" replies are visible but don't help reach.
- **Reply to replies on your own posts within the first hour** — this window dominates distribution.
- **Comment char limit:** 2,200.
- **Hashtags:** 3–5 per post is current guidance (ignore the 30-tag era). Put them in the caption or the first comment.
- **Web vs. mobile:** web covers likes, comments, saves, story viewing, DM, search; story creation and some Reels features are mobile-only.

## 11. Account-type signals (for warmup filtering)

- Blue check = verified.
- **Creator** or **Business** label under the name → professional account.
- Green story ring → Close Friends list, not public.
