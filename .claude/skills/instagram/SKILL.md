---
name: instagram
description: Browser automation workflows for Instagram. Use when navigating Instagram, checking feed, stories, reels, profiles, hashtags, comments, likes, DMs, or running Instagram warmup tasks.
---

# Instagram Skill

> This skill file documents working workflows for interacting with Instagram via browser automation.

## Overview

Instagram automation skill for Claude Code. Contains proven workflows for engaging, searching, and navigating.

**Key Discovery**: Instagram web (`instagram.com`) supports most actions needed for warmup engagement. Mobile app has more features but web works for comments, likes, story viewing, and search.

---

## Prerequisites

- User must be logged into Instagram in Chrome
- Navigate to `https://www.instagram.com`

---

## Workflows

### 1. View & Interact with Feed Posts

**Steps:**
1. Navigate to feed: `https://www.instagram.com/`
2. Feed shows posts from followed accounts and suggested content
3. Each post shows:
   - Author profile picture and username (top)
   - Image/carousel/video content
   - Action buttons: Like (heart), Comment (speech bubble), Share (paper plane), Save (bookmark)
   - Like count
   - Caption text
   - Comments preview
   - Timestamp

**To like a post:**
- Click the heart icon under the post
- Heart turns red when liked
- Or double-click the image/video

**To comment:**
1. Click the speech bubble icon (or click "Add a comment..." text)
2. Comment input appears at bottom of post
3. Type your comment
4. Click "Post" button (appears blue when text entered)

**To save a post:**
- Click the bookmark icon (right side, under post)
- Can save to collections

**To share:**
- Click the paper plane icon
- Options: Send to people, Copy link, Share to Story

---

### 2. View & Comment on Reels

**Navigate:**
- Click "Reels" in left sidebar
- Or: `https://www.instagram.com/reels/`

**Reels interface:**
- Full-screen vertical video feed
- Scroll down to see next reel
- Action buttons on right side: Like, Comment, Share, Save, More (...)
- Audio attribution at bottom

**To comment on a Reel:**
1. Click the speech bubble icon on the right side
2. Comments panel opens
3. Type in "Add a comment..." input
4. Click "Post"

**To like a Reel:**
- Click the heart icon on the right side
- Or double-tap the video

---

### 3. Search & Explore

**Steps:**
1. Click "Search" in left sidebar (magnifying glass icon)
2. Search panel slides out from left
3. Type search query in "Search" input field
4. Results appear organized by:
   - **Accounts** - User profiles matching query
   - **Tags** - Hashtags matching query
   - **Places** - Location tags

**URL Pattern for hashtag:**
```
https://www.instagram.com/explore/tags/{hashtag}/
```

**Explore page:**
- URL: `https://www.instagram.com/explore/`
- Shows algorithmically recommended content
- Grid of posts and reels
- Personalized based on engagement history

---

### 4. View Profile

**Your profile:**
- Click profile icon in left sidebar (bottom)
- Or: `https://www.instagram.com/{username}/`

**Profile shows:**
- Posts count, Followers count, Following count
- Bio and profile picture
- Story highlights
- Post grid (or Reels tab, Tagged tab)

**Other profiles:**
- Navigate to: `https://www.instagram.com/{username}/`
- Shows: Follow/Following button, Message button
- Tabs: Posts, Reels, Tagged

---

### 5. View Stories

**Steps:**
1. Story circles appear at top of feed
2. Click a profile picture with colored ring to view their story
3. Stories auto-advance or click right side to skip
4. Click left side to go back

**Story interactions:**
- **Reply**: Text input at bottom "Send message"
- **React**: Quick reaction emojis (heart, clap, fire, cry, surprise, laugh)
- **Share**: Paper plane icon to share story

**Note:** Stories disappear after 24 hours.

---

### 6. Direct Messages

**Navigate:**
- Click "Messages" in left sidebar (paper plane icon)
- Or: `https://www.instagram.com/direct/inbox/`

**Messaging interface:**
- Left panel: Conversation list
- Right panel: Active conversation
- "New message" button (compose icon, top right)

**Send a message:**
1. Click on a conversation
2. Type in "Message..." input at bottom
3. Click "Send" or press Enter

---

### 7. View Notifications

**Steps:**
1. Click "Notifications" in left sidebar (heart icon)
2. Panel slides out showing:
   - Follow requests
   - Recent activity (likes, comments, follows, mentions)
   - Organized by time period (Today, This Week, This Month)

---

## Navigation Elements

### Left Sidebar
| Item | Function |
|------|----------|
| Instagram logo | Home feed |
| Home | Main feed |
| Search | Search accounts/tags/places |
| Explore | Discover content |
| Reels | Short-form video feed |
| Messages | Direct messages |
| Notifications | Activity alerts (heart icon) |
| Create | New post/reel/story |
| Profile | Your profile |
| More | Settings, activity, saved, etc. |

---

## URL Patterns

| Page | URL |
|------|-----|
| Home Feed | `https://www.instagram.com/` |
| Explore | `https://www.instagram.com/explore/` |
| Reels | `https://www.instagram.com/reels/` |
| Profile | `https://www.instagram.com/{username}/` |
| Hashtag | `https://www.instagram.com/explore/tags/{hashtag}/` |
| Post | `https://www.instagram.com/p/{post_id}/` |
| Reel | `https://www.instagram.com/reel/{reel_id}/` |
| Messages | `https://www.instagram.com/direct/inbox/` |
| Settings | `https://www.instagram.com/accounts/edit/` |

---

## Key Selectors & Elements

| Element | Location/Identifier |
|---------|---------------------|
| Search input | Left sidebar panel, "Search" placeholder |
| Comment input | "Add a comment..." under posts/reels |
| Post button | Appears after typing comment, blue text |
| Like button | Heart icon under posts, right side on reels |
| Save button | Bookmark icon under posts, right side on reels |
| Share button | Paper plane icon |
| Follow button | On profile pages, "Follow" / "Following" toggle |
| Story circles | Top of home feed, colored ring = new story |

---

## Tips & Notes

1. **Click + Type works**: Standard keyboard input works in comment and message fields
2. **Web vs Mobile**: Web supports most engagement actions but some features (Story creation, some Reels features) are mobile-only
3. **Rate limiting**: Instagram is aggressive about rate limiting - space out actions
4. **Comment limits**: Comments can be up to 2,200 characters
5. **Hashtags in comments**: Can put hashtags in first comment instead of caption
6. **Algorithm signals**: Saves and shares weight more than likes for reach
7. **Reels discovery**: Reels are the primary discovery mechanism on Instagram
8. **Story replies**: Go to DMs, creating a conversation thread
9. **Close Friends**: Some stories may be Close Friends only (green ring instead of rainbow)
10. **Verified badges**: Blue checkmark = verified account
11. **Professional accounts**: May show category label under name (Creator, Business)

---

## Common Actions Quick Reference

```
# Like a post
1. Find post → 2. Click heart icon (or double-tap image)

# Comment on a post
1. Click speech bubble → 2. Type comment → 3. Click "Post"

# Search for accounts
1. Click Search (sidebar) → 2. Type query → 3. Click account

# View someone's profile
1. Navigate to instagram.com/{username}

# View a hashtag feed
1. Navigate to instagram.com/explore/tags/{hashtag}/

# Save a post
1. Click bookmark icon under post
```

---

## Instagram-Specific Engagement Notes

### What Drives Reach
- **Saves** are the strongest signal (people bookmarking your content)
- **Shares** (sending to DMs or Stories) are second strongest
- **Comments** matter more than likes
- **Reel completion rate** - watching the full video
- **Time spent** on post (dwell time)

### Comment Best Practices
- Comments under 5 words get less algorithmic weight
- Meaningful comments (2+ sentences) are better for relationship building
- Reply to replies on your own posts within 1 hour
- Early comments on posts get more visibility

### Hashtag Behavior
- Instagram recommends 3-5 hashtags per post (down from old 30-hashtag advice)
- Hashtag pages show "Top" and "Recent" tabs
- Following hashtags puts top content in your feed

---

*Last updated: 2026-03-12*
*Tested with: Instagram web interface*
