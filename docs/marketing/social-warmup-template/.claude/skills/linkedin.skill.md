# LinkedIn Skill

> This skill file documents working workflows for interacting with LinkedIn via browser automation.

## Overview

LinkedIn automation skill for Claude Code. Contains proven workflows for posting, searching, and messaging.

**Key Discovery**: LinkedIn uses standard click + type interactions. No complex JavaScript injection required for basic operations.

---

## Prerequisites

- User must be logged into LinkedIn in Chrome
- Navigate to `https://www.linkedin.com`

---

## Workflows

### 1. Create a Post

**Steps:**
1. Navigate to LinkedIn feed: `https://www.linkedin.com/feed/`
2. Click on "Start a post" button (center of page, in the post composer card)
3. A modal opens with:
   - Profile selector dropdown (top left)
   - "Post to Anyone" visibility setting
   - Text editor area with placeholder "What do you want to talk about?"
   - Toolbar: emoji, "Rewrite with AI", photo, calendar, more options
   - "Post" button (bottom right, grayed out until content added)
4. Click in the text area to focus it
5. Type your post content
6. The "Post" button becomes active (blue) when text is entered
7. Click "Post" to publish

**Closing without posting:**
- Click the X button (top right of modal)
- A confirmation dialog appears: "Save this post as a draft?"
- Options: "Discard" or "Save as draft"

**Post visibility options:**
- Click the dropdown next to your name to change who can see the post
- Options include: Anyone, Connections only, etc.

---

### 2. Search for People/Companies

**Steps:**
1. Click the search bar (top left, "Search" placeholder)
2. A dropdown shows recent searches and trending topics
3. Type search query (e.g., "Anthropic")
4. Search suggestions appear in dropdown
5. Press Enter or click a suggestion to search
6. Results page shows tabs: Jobs, Companies, Posts, **People**, Courses, Groups, Schools, Events, Products, Services

**Finding people at a company:**
1. Search for company name
2. Click "People" tab in results
3. Results show:
   - Person's name and connection degree (1st, 2nd, 3rd+)
   - Current job title
   - Location
   - Mutual connections
4. Filter options: People dropdown, 1st, 2nd, 3rd+, Actively hiring, Locations, Current companies, All filters

**URL Pattern for people search:**
```
https://www.linkedin.com/search/results/people/?keywords={query}&origin=SWITCH_SEARCH_VERTICAL
```

---

### 3. Send Messages

**Navigate to Messaging:**
1. Click "Messaging" in the navigation bar (top)
2. URL: `https://www.linkedin.com/messaging/`

**Messaging interface:**
- Left panel: Conversation list
- Filters: Focused, Jobs, Unread, Connections, InMail, Starred
- Right panel: Active conversation
- Page inboxes: Access messages for company pages you manage

**Send a message in existing conversation:**
1. Click on a conversation in the left panel
2. Click in "Write a message..." input area at bottom
3. Type your message
4. Toolbar available: Image, attachment, GIF, emoji
5. Click "Send" button or press Enter

**Quick replies:**
- LinkedIn shows suggested quick reply buttons (e.g., "Hey, Nathan", "Hey")
- Click to auto-fill and send

**Compose new message:**
1. Click compose icon (pen/paper icon, top right of messaging panel)
2. Type recipient name in "To" field
3. Type message
4. Send

---

### 4. View Notifications

**Steps:**
1. Click "Notifications" in navigation bar (shows count badge)
2. URL: `https://www.linkedin.com/notifications/`

---

### 5. View/Edit Profile

**Steps:**
1. Click on your profile picture or name in left sidebar
2. Or navigate to: `https://www.linkedin.com/in/{username}/`
3. Edit sections by clicking pencil icons

---

### 6. Interact with Posts in Feed

**Like a post:**
- Click "Like" button under post (thumbs up icon)
- Long press for reaction options (Celebrate, Love, Insightful, etc.)

**Comment on a post:**
1. Click "Comment" button
2. Comment input expands
3. Type comment and press Enter or click Post

**Repost:**
- Click "Repost" button
- Options: Repost, Repost with your thoughts

**Send/Share:**
- Click "Send" button
- Select connection(s) to share with

---

## Key Selectors & Elements

| Element | How to Find |
|---------|-------------|
| Search bar | Top nav, "Search" placeholder |
| Start a post | Button in composer card on feed |
| Post editor | Modal with "What do you want to talk about?" |
| Post button | Bottom right of modal, blue when active |
| Message input | "Write a message..." in conversation view |
| Send button | Right side of message input toolbar |
| Navigation items | Top bar: Home, My Network, Jobs, Messaging, Notifications, Me |

---

## URL Patterns

| Page | URL |
|------|-----|
| Feed | `https://www.linkedin.com/feed/` |
| Messaging | `https://www.linkedin.com/messaging/` |
| Notifications | `https://www.linkedin.com/notifications/` |
| Jobs | `https://www.linkedin.com/jobs/` |
| My Network | `https://www.linkedin.com/mynetwork/` |
| Profile | `https://www.linkedin.com/in/{username}/` |
| Company | `https://www.linkedin.com/company/{company}/` |
| People Search | `https://www.linkedin.com/search/results/people/?keywords={query}` |

---

## Tips & Notes

1. **Click + Type works**: Unlike some apps, LinkedIn accepts standard keyboard input after clicking into text areas
2. **Modals close with X**: Post composer, settings modals have X button top-right
3. **Draft saving**: LinkedIn prompts to save drafts when closing with content
4. **Connection levels**: 1st = direct connection, 2nd = connected to your connections, 3rd+ = extended network
5. **InMail**: Premium feature for messaging people outside your network
6. **Page inboxes**: Company admins can access separate message inboxes for their pages
7. **Notification counts**: Shown as badges on nav items
8. **Sponsored content**: Some messages/posts marked "Sponsored" are ads

---

## Common Actions Quick Reference

```
# Create a post
1. Click "Start a post" → 2. Click text area → 3. Type content → 4. Click "Post"

# Search for people
1. Click search bar → 2. Type query → 3. Press Enter → 4. Click "People" tab

# Send a message
1. Click "Messaging" → 2. Click conversation → 3. Click message input → 4. Type → 5. Click "Send"
```

---

*Last updated: 2026-02-01*
*Tested with: LinkedIn web interface*
