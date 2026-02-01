# Twitter/X Skill

> This skill file documents working workflows for interacting with X (Twitter) via browser automation.

## Overview

Twitter/X automation skill for Claude Code. Contains proven workflows for posting, searching, and engaging.

**Key Discovery**: X uses standard click + type interactions. Dark mode is default.

---

## Prerequisites

- User must be logged into X in Chrome
- Navigate to `https://x.com`

---

## Workflows

### 1. Create a Post (Tweet)

**Steps:**
1. Navigate to home: `https://x.com/home`
2. Click on "What's happening?" text area in the composer
3. The composer expands showing:
   - **Audience selector**: "Everyone" dropdown (click to change who can see)
   - **Reply settings**: "Everyone can reply" (click to restrict)
   - **Text area**: Type your post content
   - **Toolbar**: image, GIF, poll, emoji, schedule, location, bold, italic
   - **Character counter**: Circle that fills as you type (280 char limit)
   - **"+" button**: Add more posts to create a thread
   - **Post button**: Click to publish
4. Type your post content
5. Click "Post" button

**Alternative - Sidebar Post Button:**
- Click the "Post" button in the left sidebar to open a modal composer

**Discarding a post:**
- Press Escape or click outside the composer
- Confirmation dialog appears: "Discard post? This can't be undone and you'll lose your draft."
- Options: "Discard" (red) or "Cancel"

**Thread creation:**
- After typing first post, click "+" button
- Add additional posts
- All posts in thread are published together

---

### 2. Search

**Steps:**
1. Click the Search bar (right sidebar or use Explore)
2. Type search query
3. Suggestions appear:
   - "Search for '[query]'" - full search option
   - Account suggestions matching the query
4. Press Enter to search or click a suggestion

**Search results page:**
- **Tabs**: Top, Latest, People, Media, Lists
- **Search filters** (right sidebar):
  - People: From anyone / People you follow
  - Location: Anywhere / Near you
  - Advanced search link

**URL Pattern:**
```
https://x.com/search?q={query}&src=typed_query
```

**Explore page:**
- URL: `https://x.com/explore`
- Shows trending topics, news, and categories

---

### 3. Direct Messages (X Chat)

**Important**: X has moved to encrypted "X Chat" which requires passcode setup.

**Navigate:**
- Click "Chat" in left sidebar
- Or go to: `https://x.com/messages` (redirects to chat)

**First-time setup:**
- "Welcome to the new X Chat" screen appears
- Features: End-to-End Encryption, State-of-the-Art Privacy
- Must click "Create Passcode" to enable messaging

**Note**: DMs cannot be automated without first manually setting up the passcode.

---

### 4. View Notifications

**Steps:**
1. Click "Notifications" in left sidebar
2. URL: `https://x.com/notifications`

**Notifications page:**
- **Header**: "Notifications" with settings gear icon
- **Tabs**: All, Mentions
- **Notification types**:
  - New posts from accounts you follow
  - New followers
  - Post recommendations
  - Replies and mentions
  - Likes and reposts on your posts

---

### 5. Interact with Posts

**Post action buttons** (bottom of each post):
1. **Reply** (speech bubble icon) - Opens reply composer
2. **Repost** (repost arrows icon) - Options: Repost, Quote
3. **Like** (heart icon) - Toggles like on/off
4. **Views** (bar chart icon) - Shows view count (not clickable)
5. **Bookmark** (bookmark icon) - Save post for later
6. **Share** (upload icon) - Copy link, share options

**To like a post:**
- Click the heart icon under the post
- Heart turns red/pink when liked

**To reply:**
1. Click the speech bubble icon
2. Reply composer opens inline or as modal
3. Type reply
4. Click "Reply" button

**To repost:**
1. Click the repost icon
2. Options appear:
   - "Repost" - Simple repost
   - "Quote" - Add your own comment

**To bookmark:**
- Click the bookmark icon
- Post saved to `https://x.com/i/bookmarks`

---

### 6. View Profile

**Your profile:**
- Click "Profile" in left sidebar
- Or: `https://x.com/{username}`

**Profile sections:**
- Posts, Replies, Highlights, Articles, Media, Likes

**Edit profile:**
- Click "Edit profile" button on your profile page

---

### 7. Explore/Discover

**Steps:**
1. Click "Explore" in left sidebar
2. URL: `https://x.com/explore`

**Explore page shows:**
- Trending topics
- News categories
- For You recommendations

---

## Navigation Elements

### Left Sidebar
| Item | Function |
|------|----------|
| X logo | Home |
| Home | Main feed |
| Explore | Trending/search |
| Notifications | Alerts |
| Chat | Direct messages (encrypted) |
| Grok | AI assistant |
| Premium | Subscription |
| Articles | Long-form content |
| Profile | Your profile |
| More | Settings, etc. |
| Post button | Open compose modal |

### Feed Tabs
- **For you**: Algorithmic recommendations
- **Following**: Chronological from followed accounts

---

## URL Patterns

| Page | URL |
|------|-----|
| Home | `https://x.com/home` |
| Explore | `https://x.com/explore` |
| Notifications | `https://x.com/notifications` |
| Messages/Chat | `https://x.com/messages` or `https://x.com/i/chat` |
| Profile | `https://x.com/{username}` |
| Search | `https://x.com/search?q={query}` |
| Bookmarks | `https://x.com/i/bookmarks` |
| Settings | `https://x.com/settings` |
| Post/Tweet | `https://x.com/{username}/status/{tweet_id}` |

---

## Key Selectors & Elements

| Element | Location/Identifier |
|---------|---------------------|
| Post composer | "What's happening?" text on home |
| Audience selector | "Everyone" dropdown in composer |
| Post button | Bottom right of composer |
| Search bar | Right sidebar, "Search" placeholder |
| Reply button | Speech bubble icon under posts |
| Like button | Heart icon under posts |
| Repost button | Repost arrows icon under posts |
| Bookmark button | Bookmark icon under posts |
| Share button | Upload icon under posts |

---

## Tips & Notes

1. **Click + Type works**: Standard keyboard input works after clicking text areas
2. **Dark mode default**: X uses dark theme by default
3. **Character limit**: 280 characters for regular posts (longer for Premium)
4. **Keyboard shortcuts**:
   - `n` - New post
   - `j/k` - Navigate posts
   - `l` - Like
   - `r` - Reply
   - `t` - Repost
5. **Draft saving**: X prompts to discard when closing with content
6. **Encrypted DMs**: New X Chat requires passcode setup
7. **Verification badges**: Blue checkmark = Premium subscriber, Gold = Business, Gray = Government/official
8. **Views are public**: Anyone can see view counts on posts

---

## Common Actions Quick Reference

```
# Create a post
1. Click "What's happening?" → 2. Type content → 3. Click "Post"

# Search
1. Click Search bar → 2. Type query → 3. Press Enter

# Like a post
1. Find post → 2. Click heart icon

# Reply to a post
1. Click speech bubble → 2. Type reply → 3. Click "Reply"

# Repost
1. Click repost icon → 2. Select "Repost" or "Quote"
```

---

## Differences from Old Twitter

- "Tweets" are now called "Posts"
- DMs moved to encrypted "X Chat"
- Grok AI assistant added
- Articles feature for long-form content
- Premium subscription for blue checkmark
- Views shown publicly on all posts

---

*Last updated: 2026-02-01*
*Tested with: X (Twitter) web interface*
