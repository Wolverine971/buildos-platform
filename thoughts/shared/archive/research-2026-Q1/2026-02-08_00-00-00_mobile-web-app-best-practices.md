---
title: Mobile Web App Best Practices - BuildOS Audit & Optimization Guide
date: 2026-02-08
author: Claude Code
type: research
status: complete
tags:
  - mobile
  - pwa
  - performance
  - ux
  - css
  - accessibility
  - ios
  - android
path: thoughts/shared/archive/research-2026-Q1/2026-02-08_00-00-00_mobile-web-app-best-practices.md
---

# Mobile Web App Best Practices: BuildOS Audit & Optimization Guide

> **Goal:** Make BuildOS an exceptional mobile command center — high information density, fast, and native-feeling on phones.
>
> **User preference:** Smaller touch targets are acceptable in exchange for density. Everything else should be optimized.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Performance on Mobile](#2-performance-on-mobile)
3. [Mobile-First Layout & CSS](#3-mobile-first-layout--css)
4. [Navigation & UX Patterns for a Command Center](#4-navigation--ux-patterns-for-a-command-center)
5. [Information Density Tactics](#5-information-density-tactics)
6. [Mobile Input & Interaction](#6-mobile-input--interaction)
7. [PWA Enhancements](#7-pwa-enhancements)
8. [iOS Safari Gotchas](#8-ios-safari-gotchas)
9. [Android-Specific Considerations](#9-android-specific-considerations)
10. [Accessibility While Maintaining Density](#10-accessibility-while-maintaining-density)
11. [Priority Action Items](#11-priority-action-items)

---

## 1. Current State Assessment

BuildOS already has strong mobile foundations. Here's a full audit of what exists today.

### What's Already Well-Implemented

| Feature | Status | Details |
|---------|--------|---------|
| Viewport meta tags | ✅ Excellent | `width=device-width, initial-scale=1`, `viewport-fit=cover` for notch support |
| PWA manifest | ✅ Comprehensive | Standalone mode, portrait orientation, maskable icons, light/dark theme colors |
| Apple mobile web app | ✅ Complete | `apple-mobile-web-app-capable`, status bar styling, splash screens for all device sizes |
| Responsive breakpoints | ✅ Modern | 6 breakpoints: `xs:480`, `sm:640`, `md:768`, `lg:1024`, `xl:1280`, `2xl:1536` |
| Safe area handling | ✅ Excellent | `env(safe-area-inset-*)` on body, layout, modals. PWA-specific padding class |
| Dynamic viewport height | ✅ Correct | Uses `100dvh` instead of `100vh` — accounts for mobile browser chrome |
| Input zoom prevention | ✅ Handled | `font-size: max(16px, 1rem)` on inputs prevents iOS auto-zoom |
| Input keyboard types | ✅ Supported | `inputmode` (`email`, `tel`, `url`, `numeric`) and `enterkeyhint` attributes |
| Touch action | ✅ Set | `touch-action: manipulation` on inputs/buttons prevents double-tap zoom |
| CSS containment | ✅ Applied | `contain: layout style paint` on cards, GPU acceleration hints |
| Reduced animations on mobile | ✅ Implemented | 150ms transitions below 768px, `prefers-reduced-motion` support |
| Image optimization | ✅ Good | `ProgressiveImage` component with IntersectionObserver, blur-up placeholders |
| Modal bottom sheets | ✅ Implemented | Bottom-sheet variant with swipe-to-dismiss gesture |
| PWA install prompt | ✅ Handled | `beforeinstallprompt` event, standalone detection, theme color updates |
| Dark mode | ✅ Full system | Semantic Inkprint color tokens with light/dark variants via CSS custom properties |
| Overscroll containment | ✅ In PWA mode | `overscroll-behavior: contain`, pull-to-refresh prevention |
| Text selection control | ✅ In PWA mode | `-webkit-user-select: none` on UI chrome |
| Touch highlight removal | ✅ Set | `-webkit-tap-highlight-color: transparent` |
| Minimum touch targets | ✅ 44px | WCAG AA standard applied to buttons and interactive elements |
| Z-index hierarchy | ✅ Organized | Nav(10) → Overlays(100) → Modals(9999) → Toasts(10000) |
| Sticky navigation | ✅ Implemented | `sticky top-0 z-10` with hamburger menu on mobile |
| Skeleton loaders | ✅ Present | Shimmer animation for loading states |
| Accessibility | ✅ Good | Skip links, ARIA labels, focus-visible, semantic HTML, reduced motion |

### What's Missing or Needs Improvement

| Feature | Status | Impact |
|---------|--------|--------|
| Bottom navigation bar | ❌ Missing | Primary actions require reaching top of screen — bad for one-handed use |
| Content-visibility on lists | ❌ Missing | Long task/project lists render all items, hurting scroll performance |
| Hover state guards | ❌ Missing | `:hover` styles likely stick on touch devices |
| Swipe gestures on list items | ❌ Missing | No swipe-to-complete or swipe-to-archive on tasks |
| Long-press context menus | ❌ Missing | No way to access quick actions via long-press |
| PWA shortcuts | ❌ Missing | No home screen long-press quick actions (Android) |
| Web Share Target | ❌ Missing | Can't share content INTO BuildOS from other apps |
| Background sync | ❌ Missing | No offline action queuing |
| Haptic feedback | ❌ Missing | No vibration feedback on key interactions |
| Visual viewport keyboard handling | ❌ Missing | Chat/input screens may have keyboard overlap issues |
| Hide-nav-on-scroll | ❌ Missing | Navigation doesn't hide on scroll-down to reclaim space |
| Mobile density pass | ❌ Needed | Spacing is desktop-comfortable, not command-center tight |
| Service worker caching | ⚠️ Unclear | PWA config exists but service worker caching strategy unclear |
| Font loading optimization | ⚠️ Unclear | Inter UI font loading/subsetting/preload status unknown |

---

## 2. Performance on Mobile

Performance is the foundation of good mobile UX. A slow app feels broken on a phone.

### 2.1 Bundle Size & Code Splitting

**Why it matters:** On mobile networks (3G/4G), every KB of JavaScript delays interactivity. The median mobile page loads ~450KB of JS, but top-performing apps target under 200KB for initial load.

**Tactics:**

- **Route-based code splitting** — SvelteKit does this by default per route, but verify heavy features (agentic chat, calendar integration, ontology system) aren't bundled into the main chunk
- **Dynamic imports for heavy components:**
  ```js
  // Don't load the full chat system until the user navigates to it
  const AgenticChat = await import('$lib/components/chat/AgenticChat.svelte');
  ```
- **Analyze bundle** — Run `npx vite-bundle-visualizer` to identify large dependencies
- **Tree-shake aggressively** — Ensure imports are specific: `import { format } from 'date-fns'` not `import * as dateFns from 'date-fns'`

**Common mistakes:**
- Importing entire icon libraries when only a few icons are used
- Including development-only code in production bundles
- Loading analytics/tracking libraries synchronously

### 2.2 Network-Aware Loading

**Why it matters:** Users on slow connections should get a functional experience, not a loading spinner.

**Tactics:**

```js
// Detect connection quality and adapt
const connection = navigator.connection;

function getLoadingStrategy() {
  if (connection?.saveData) return 'minimal';
  if (connection?.effectiveType === '2g') return 'minimal';
  if (connection?.effectiveType === '3g') return 'conservative';
  return 'full';
}

// Apply strategy
const strategy = getLoadingStrategy();
if (strategy === 'minimal') {
  // Skip animations entirely
  // Load text-only previews
  // Defer all non-critical images
  // Use smaller/compressed API responses if available
}
```

### 2.3 Font Loading

**Why it matters:** Unoptimized fonts cause invisible text (FOIT) or layout shifts (FOUT). Inter UI at full weight coverage can be 200KB+.

**Tactics:**

```html
<!-- Preload the primary font weight -->
<link rel="preload" href="/fonts/inter-400.woff2" as="font" type="font/woff2" crossorigin>

<!-- Font-face with swap for fast first render -->
@font-face {
  font-family: 'Inter';
  font-display: swap; /* or 'optional' for fewer layout shifts */
  src: url('/fonts/inter-400.woff2') format('woff2');
  unicode-range: U+0000-00FF; /* Latin subset only if sufficient */
}
```

- Subset to Latin characters if you don't need full Unicode
- Only load weights actually used (400, 500, 600, 700 — skip others)
- Consider `font-display: optional` — it prevents layout shift entirely (uses fallback if font isn't cached)

### 2.4 Cumulative Layout Shift (CLS)

**Why it matters:** On a small mobile screen, even a 10px layout shift is disorienting. Google penalizes CLS > 0.1 in search rankings.

**Tactics:**

- Set explicit `width` and `height` (or `aspect-ratio`) on ALL images
- Skeleton loaders must match exact dimensions of loaded content
- Reserve space for dynamic content (badges, status indicators) even before data loads
- Never inject banners or notifications above the fold after initial render — push from the top or use toast overlays
- Use `min-height` on containers that will receive dynamic content

### 2.5 Service Worker Caching Strategy

**Why it matters:** A good service worker makes the app feel instant on repeat visits and functional offline.

**Recommended strategy for BuildOS:**

```
App Shell (HTML, CSS, JS) → Cache-first (update in background)
API data (projects, tasks) → Stale-while-revalidate
Images/avatars → Cache-first with expiration
Font files → Cache-first (long-lived)
```

**Offline fallback:** Show cached data with a subtle "offline" indicator rather than a blank error page.

### 2.6 Content-Visibility for Long Lists

**Why it matters:** If you have 50+ projects or 100+ tasks, the browser renders all DOM nodes even if they're off-screen. `content-visibility: auto` tells the browser to skip rendering off-screen items.

**Implementation:**

```css
.task-list-item,
.project-card {
  content-visibility: auto;
  contain-intrinsic-size: 0 72px; /* estimated height of one item */
}
```

**Impact:** Can reduce rendering time by 50-90% for long lists. This is one of the highest-impact, lowest-effort optimizations available.

---

## 3. Mobile-First Layout & CSS

### 3.1 Overscroll Containment

**Why it matters:** Without containment, scrolling to the end of an inner scrollable area "chains" to the outer page, causing unintended page scrolling or iOS rubber-banding.

**Tactic:** Apply to ALL scrollable containers, not just body:

```css
.scrollable-panel,
.task-list,
.chat-messages {
  overscroll-behavior: contain;
}
```

### 3.2 Scroll Performance

**Why it matters:** Janky scrolling is the #1 thing that makes a web app feel non-native.

**Tactics:**

```css
/* Momentum scrolling on iOS */
.scroll-container {
  -webkit-overflow-scrolling: touch;
  overflow-y: auto;
}

/* Prevent layout recalculations during scroll */
.scroll-item {
  contain: layout style paint;
  will-change: auto; /* Only set to 'transform' during active animation */
}

/* Passive scroll listeners — critical for performance */
```

```js
// Always use passive listeners for scroll/touch events
element.addEventListener('scroll', handler, { passive: true });
element.addEventListener('touchstart', handler, { passive: true });
```

### 3.3 Responsive Typography for Density

**Why it matters:** Good typography scaling means readable text at every screen size without wasting space.

**Recommended scale for command-center density:**

```css
:root {
  /* Mobile-first (tight) */
  --text-xs: 0.6875rem;   /* 11px — metadata, timestamps */
  --text-sm: 0.75rem;     /* 12px — secondary text, labels */
  --text-base: 0.8125rem; /* 13px — primary body text on mobile */
  --text-lg: 0.9375rem;   /* 15px — headings, emphasis */
  --text-xl: 1.125rem;    /* 18px — page titles */
}

/* Desktop — breathe a little more */
@media (min-width: 768px) {
  :root {
    --text-base: 0.875rem;  /* 14px */
    --text-lg: 1rem;        /* 16px */
    --text-xl: 1.25rem;     /* 20px */
  }
}
```

### 3.4 Preventing Text Selection on UI Chrome

**Tactic:** Be selective — disable on navigation, buttons, and toolbars. KEEP enabled on content:

```css
/* UI chrome — no selection */
nav, .toolbar, .bottom-bar, .tab-bar {
  -webkit-user-select: none;
  user-select: none;
}

/* Content areas — allow selection */
.task-description, .note-content, .brain-dump-text {
  -webkit-user-select: text;
  user-select: text;
}
```

---

## 4. Navigation & UX Patterns for a Command Center

### 4.1 Bottom Navigation Bar (Highest Priority)

**Why it matters:** The bottom of the screen is the easiest area to reach with one thumb. Top navigation requires full arm extension on phones 6"+. Every major mobile app (Linear, Todoist, Things 3, Notion, Slack) uses bottom navigation.

**Recommended structure for BuildOS:**

```
┌─────────────────────────────────────┐
│                                     │
│          Content Area               │
│          (scrollable)               │
│                                     │
├─────────────────────────────────────┤
│  🏠      📋      💬      ＋       │
│ Home   Projects   Chat   Create    │
│                                     │
│  ▬▬▬▬ safe-area-inset-bottom ▬▬▬▬  │
└─────────────────────────────────────┘
```

**Design decisions:**

- **4 items max** — keeps touch targets reasonable even at high density
- **Active state:** filled icon + label text + subtle accent underline
- **Inactive state:** outline icon, muted text
- **Badge indicators:** small dot or number for unread notifications
- **Safe area:** `padding-bottom: env(safe-area-inset-bottom)` for notched devices
- **Height:** 48-56px (tight but usable)

**Hide on scroll-down, show on scroll-up** — reclaims vertical space:

```js
let lastScrollY = 0;
let navVisible = true;

function handleScroll() {
  const currentScrollY = window.scrollY;
  const scrollingDown = currentScrollY > lastScrollY;
  const scrolledEnough = Math.abs(currentScrollY - lastScrollY) > 10;

  if (scrolledEnough) {
    navVisible = !scrollingDown || currentScrollY < 50;
  }
  lastScrollY = currentScrollY;
}
```

```css
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  transform: translateY(0);
  transition: transform 200ms ease-out;
  padding-bottom: env(safe-area-inset-bottom);
}

.bottom-nav.hidden {
  transform: translateY(100%);
}
```

### 4.2 Contextual Bottom Action Bar

**Why it matters:** When viewing a detail screen (project, task, brain dump), primary actions should be in the thumb zone.

**Pattern:**

```
┌─────────────────────────────────────┐
│  ← Back    Project Name      ⋯     │  ← Slim top bar (context only)
├─────────────────────────────────────┤
│                                     │
│          Detail Content             │
│                                     │
├─────────────────────────────────────┤
│  [✏️ Edit] [Status ▾] [⋯ More]     │  ← Contextual actions
│  ▬▬▬▬ safe-area-inset-bottom ▬▬▬▬  │
└─────────────────────────────────────┘
```

### 4.3 Floating Action Button (FAB)

**Why it matters:** The primary create action should always be one tap away. BuildOS's core innovation is brain dumps — that capture action needs to be friction-free.

**Pattern:**

```css
.fab {
  position: fixed;
  bottom: calc(72px + env(safe-area-inset-bottom)); /* above bottom nav */
  right: 16px;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  z-index: 50;
  /* Inkprint styling */
  background: hsl(var(--accent));
  box-shadow: var(--shadow-ink-strong);
}
```

**Speed dial variant** — tap FAB to expand options:
- New Brain Dump
- New Task
- New Project

### 4.4 Pull-to-Refresh

**Why it matters:** Users expect this gesture on mobile for refreshing content. You currently prevent the native one in PWA mode — implement a custom one.

**Pattern:**

```js
// Custom pull-to-refresh
let startY = 0;
let pullDistance = 0;
const THRESHOLD = 80;

function onTouchStart(e) {
  if (window.scrollY === 0) {
    startY = e.touches[0].clientY;
  }
}

function onTouchMove(e) {
  if (startY === 0) return;
  pullDistance = Math.max(0, e.touches[0].clientY - startY);

  if (pullDistance > 0) {
    // Show pull indicator with progress
    indicator.style.transform = `translateY(${Math.min(pullDistance, THRESHOLD * 1.5)}px)`;
  }
}

function onTouchEnd() {
  if (pullDistance >= THRESHOLD) {
    refreshData();
  }
  pullDistance = 0;
  startY = 0;
}
```

**Apply to:** Project list, task list, daily brief, brain dump history.

### 4.5 Swipe Actions on List Items

**Why it matters:** Swiping is the most natural mobile gesture for quick actions on individual items. Used by Apple Mail, Todoist, Things 3, and most task apps.

**Pattern:**

```
← Swipe Left:  [Archive] [Delete]  (destructive actions, red)
  Swipe Right: [✓ Complete]         (positive action, green/accent)
```

**Implementation considerations:**
- Short swipe (< 40% width) → reveals action buttons
- Long swipe (> 60% width) → auto-executes the primary action
- Haptic feedback at the threshold point
- Spring-back animation if released before threshold
- Only one item can be swiped open at a time

---

## 5. Information Density Tactics

Since the goal is a **mobile command center**, maximize information per pixel.

### 5.1 Compact List Views

**Principle:** Show more items per screen without sacrificing readability.

```
┌─────────────────────────────────────┐
│ ● Project Alpha              3 ↗   │  ← Single line: dot + name + task count
│ ● Beta Launch               12 ↗   │
│ ○ Client Proposal            0 ↗   │  ← Open dot = inactive
│ ● Website Redesign           7 ↗   │
└─────────────────────────────────────┘
```

**For tasks, use two-line items:**

```
┌─────────────────────────────────────┐
│ ☐ Review PR for auth module         │  ← Line 1: checkbox + title
│   Alpha · Due Mon · 🔴              │  ← Line 2: project + due + priority
├─────────────────────────────────────┤
│ ☑ Set up CI pipeline                │
│   Beta · Done · 🟢                  │
└─────────────────────────────────────┘
```

**Sizing:**
- Single-line items: 40-44px height
- Two-line items: 56-64px height
- Avoid three-line items — they waste vertical space

### 5.2 Inline Status Indicators

**Principle:** Use visual shorthand instead of text labels.

| Instead of | Use |
|------------|-----|
| "Active" | `●` green dot |
| "Paused" | `○` gray outline dot |
| "3 tasks remaining" | `3↗` (number + arrow icon) |
| "Due Monday" | `Mon` in muted text |
| "High priority" | `🔴` or colored left border |
| "In Progress" | thin accent-colored progress bar at bottom of card |

### 5.3 Collapsible Sections

**Principle:** Let users control density per section.

```
▼ Active Projects (5)
  ● Alpha         3↗
  ● Beta         12↗
  ● Website       7↗
  ● Client        2↗
  ● Marketing     1↗

▶ Paused (3)           ← collapsed, shows count only
▶ Completed (12)       ← collapsed
```

- Persist collapse state in localStorage per user
- Default: show active/in-progress, collapse completed/archived

### 5.4 Smart Truncation

```css
/* Single-line truncation */
.title-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Multi-line truncation (2 lines) */
.description-truncate {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

### 5.5 Dense Spacing Scale

**Recommended for mobile command center:**

```css
/* Tight spacing for mobile */
@media (max-width: 768px) {
  .card-padding { padding: 8px 12px; }      /* was 12px 16px */
  .list-gap { gap: 4px; }                   /* was 8px */
  .section-gap { gap: 12px; }               /* was 20px */
  .section-title { margin-bottom: 6px; }    /* was 12px */
}
```

### 5.6 Data Tables on Mobile

When structured data needs to be shown:

**Option A: Horizontal scroll with sticky column**
```css
.table-container {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.table-container th:first-child,
.table-container td:first-child {
  position: sticky;
  left: 0;
  background: hsl(var(--card));
  z-index: 1;
}
```

**Option B: Transform to stacked cards on mobile** (better for most cases)

---

## 6. Mobile Input & Interaction

### 6.1 Virtual Keyboard Handling

**Why it matters:** When the virtual keyboard opens, it resizes the viewport. Fixed elements can end up behind the keyboard, and the focused input might not be visible.

**The `visualViewport` API — the correct modern solution:**

```js
function setupKeyboardHandling() {
  if (!window.visualViewport) return;

  const viewport = window.visualViewport;

  viewport.addEventListener('resize', () => {
    // Keyboard height = window height minus visual viewport height
    const keyboardHeight = window.innerHeight - viewport.height;

    // Move fixed bottom elements above keyboard
    document.documentElement.style.setProperty(
      '--keyboard-height', `${keyboardHeight}px`
    );
  });
}
```

```css
.chat-input-bar {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom) + var(--keyboard-height, 0px));
  transition: bottom 100ms ease-out;
}
```

### 6.2 Quick Input Patterns

**Why it matters:** Typing on mobile is slow. Minimize it.

**Tactics:**
- Suggestion chips above text inputs (recent projects, common tags)
- Tappable pills for status selection instead of dropdowns
- Toggle switches instead of checkboxes (larger, easier to tap)
- Swipe to select (e.g., priority slider)
- Voice input button for brain dumps (Web Speech API):

```js
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.onresult = (event) => {
  const transcript = Array.from(event.results)
    .map(r => r[0].transcript)
    .join('');
  inputField.value = transcript;
};
```

### 6.3 Haptic Feedback

**Why it matters:** Subtle vibration makes interactions feel physical and confirmed.

```js
// Utility function
function haptic(pattern = 'light') {
  if (!navigator.vibrate) return;

  const patterns = {
    light: [10],          // Quick tap — button press, selection
    medium: [20],         // Checkbox toggle, status change
    success: [10, 50, 10], // Task completed, action confirmed
    warning: [30, 30, 30], // Destructive action confirmation
  };

  navigator.vibrate(patterns[pattern] || patterns.light);
}
```

**When to use:**
- Completing a task ✓
- Swiping past the action threshold
- Long-press triggering context menu
- Destructive action (delete confirmation)
- Pull-to-refresh threshold reached

### 6.4 Long-Press Context Menu

**Pattern:**

```js
function useLongPress(element, callback, duration = 500) {
  let timer;
  let moved = false;

  element.addEventListener('touchstart', (e) => {
    moved = false;
    timer = setTimeout(() => {
      if (!moved) {
        haptic('medium');
        callback(e);
      }
    }, duration);
  });

  element.addEventListener('touchmove', () => { moved = true; clearTimeout(timer); });
  element.addEventListener('touchend', () => clearTimeout(timer));
  element.addEventListener('touchcancel', () => clearTimeout(timer));
}
```

**Context menu items for a task:**
- Edit
- Change status
- Change priority
- Move to project
- Duplicate
- Delete

---

## 7. PWA Enhancements

### 7.1 App Shortcuts (Android)

**Why it matters:** Long-pressing the app icon on Android shows shortcuts — instant access to key features.

**Add to `site.webmanifest`:**

```json
{
  "shortcuts": [
    {
      "name": "Brain Dump",
      "short_name": "Dump",
      "description": "Capture thoughts quickly",
      "url": "/brain-dump?source=shortcut",
      "icons": [{ "src": "/icons/shortcut-braindump.png", "sizes": "96x96" }]
    },
    {
      "name": "Today's Brief",
      "short_name": "Brief",
      "description": "View your daily brief",
      "url": "/brief?source=shortcut",
      "icons": [{ "src": "/icons/shortcut-brief.png", "sizes": "96x96" }]
    },
    {
      "name": "Projects",
      "short_name": "Projects",
      "description": "View all projects",
      "url": "/projects?source=shortcut",
      "icons": [{ "src": "/icons/shortcut-projects.png", "sizes": "96x96" }]
    }
  ]
}
```

### 7.2 Web Share Target

**Why it matters:** Users can share content FROM other apps INTO BuildOS. Reading an article? Share it to BuildOS as a brain dump or reference.

**Add to `site.webmanifest`:**

```json
{
  "share_target": {
    "action": "/api/share",
    "method": "POST",
    "enctype": "application/x-www-form-urlencoded",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url"
    }
  }
}
```

**Then create a `/api/share` route** that receives the shared content and creates a brain dump or task from it.

### 7.3 Background Sync

**Why it matters:** A command center needs to work in the subway, on a plane, in areas with spotty reception.

**Pattern:**

```js
// When offline, queue the action
async function addTask(task) {
  if (navigator.onLine) {
    return await api.createTask(task);
  }

  // Store in IndexedDB
  await offlineQueue.add({ type: 'CREATE_TASK', payload: task });

  // Register for background sync
  const reg = await navigator.serviceWorker.ready;
  await reg.sync.register('sync-tasks');

  // Show optimistic UI
  return { ...task, id: crypto.randomUUID(), _offline: true };
}
```

```js
// In service worker
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-tasks') {
    event.waitUntil(processOfflineQueue());
  }
});
```

### 7.4 Notification Badges (iOS 16.4+)

```js
// Set badge count on app icon
if ('setAppBadge' in navigator) {
  navigator.setAppBadge(unreadCount);
}

// Clear badge
navigator.clearAppBadge();
```

---

## 8. iOS Safari Gotchas

These are the most common mobile bugs that break web apps on iPhone.

### 8.1 `position: fixed` + Virtual Keyboard

**Problem:** When the iOS keyboard opens, `position: fixed` elements can jump or get hidden.

**Fix:** Use `position: sticky` where possible, or use the `visualViewport` API (see section 6.1).

### 8.2 Rubber-Band Scrolling Leaks Through Modals

**Problem:** Scrolling to the end of a modal on iOS causes the background page to scroll.

**Fix:**

```css
/* On the modal backdrop */
.modal-backdrop {
  touch-action: none; /* Prevent all touch scrolling on backdrop */
}

/* On the modal scroll container */
.modal-content {
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
```

Also, set `overflow: hidden` on `<body>` when a modal is open.

### 8.3 Hover States Stick on Touch

**Problem:** After tapping an element, the `:hover` state persists until the user taps elsewhere. This makes buttons look "stuck."

**Fix:**

```css
/* Only apply hover effects on devices that support hover */
@media (hover: hover) and (pointer: fine) {
  .card:hover {
    background: hsl(var(--accent) / 0.1);
    transform: translateY(-1px);
  }
}

/* Touch devices get active-state feedback instead */
.card:active {
  transform: scale(0.98);
  opacity: 0.9;
}
```

**This should be audited across the entire codebase.** Every `:hover` style that isn't inside a `@media (hover: hover)` query is a potential sticky-hover bug.

### 8.4 Back-Forward Cache (bfcache)

**Problem:** iOS Safari caches pages aggressively. Navigating back shows stale data.

**Fix:**

```js
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    // Page was restored from bfcache — refresh stale data
    refreshCurrentPageData();
  }
});
```

### 8.5 `backdrop-filter` Performance

**Problem:** `backdrop-filter: blur()` causes janky scrolling on older iPhones (pre-iPhone 12).

**Fix:** Limit `backdrop-filter` to small, non-scrolling areas (modals, tooltips). Avoid it on elements that scroll with the page. On older devices, fall back to a solid semi-transparent background.

### 8.6 iOS Safe Area Edge Cases

**Problem:** `env(safe-area-inset-bottom)` returns 0 when the page is NOT in `viewport-fit=cover` mode.

**Fix:** Already handled — BuildOS has `viewport-fit=cover` in the viewport meta tag. Just ensure all bottom-fixed elements account for it.

### 8.7 iOS PWA State Persistence

**Problem:** iOS PWA doesn't persist state when the app is backgrounded for a while. Returning to the app shows the initial route.

**Fix:** Save current route to `sessionStorage` and restore on app resume:

```js
// Save on navigation
window.addEventListener('beforeunload', () => {
  sessionStorage.setItem('lastRoute', window.location.pathname);
});

// Restore on app resume (in +layout.svelte)
onMount(() => {
  if (isPWAInstalled()) {
    const lastRoute = sessionStorage.getItem('lastRoute');
    if (lastRoute && lastRoute !== window.location.pathname) {
      goto(lastRoute);
    }
  }
});
```

---

## 9. Android-Specific Considerations

### 9.1 Material You / Dynamic Colors

Android 12+ supports dynamic color theming based on the user's wallpaper. This is hard to implement on the web, but you can at least match the status bar:

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5f0eb">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f0f11">
```

Already implemented in BuildOS — good.

### 9.2 Android Back Button in PWA

The hardware back button should work as expected. SvelteKit's client-side routing handles this via the History API, but test that:
- Modals close on back press (not navigate away)
- Bottom sheets close on back press
- Multi-step flows can be navigated backwards

### 9.3 Display Cutouts

Samsung and other Android phones have various cutout shapes (punch-hole cameras, etc.). The `env(safe-area-inset-*)` values handle this, which BuildOS already uses.

---

## 10. Accessibility While Maintaining Density

Even with high density and smaller touch targets, certain accessibility practices are non-negotiable.

### 10.1 Color Contrast (Non-Negotiable)

**WCAG AA minimum: 4.5:1 for normal text, 3:1 for large text.**

With small, dense text, contrast becomes MORE important, not less. Audit:
- Muted text (`text-muted-foreground`) against card backgrounds
- Status indicator colors against their backgrounds
- Accent colors used for text (not just decoration)

```css
/* Test these combinations specifically */
.text-muted-foreground on .bg-card    → must be 4.5:1+
.text-muted-foreground on .bg-muted   → must be 4.5:1+
.text-accent on .bg-card              → must be 4.5:1+
```

### 10.2 Focus Management

- All interactive elements must have visible focus indicators
- Focus ring should use `outline` (not `box-shadow`) for accessibility tool compatibility
- Tab order should be logical (especially with bottom nav + content + FAB)

```css
:focus-visible {
  outline: 2px solid hsl(var(--accent));
  outline-offset: 2px;
}
```

### 10.3 Screen Reader Announcements

For dynamic content changes (task completed, status updated, data refreshed):

```html
<div aria-live="polite" aria-atomic="true" class="sr-only">
  {statusMessage}
</div>
```

### 10.4 Reduced Motion

Already implemented. Verify that ALL animations (not just CSS transitions) respect this:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 10.5 Semantic HTML

Ensure:
- `<button>` for all clickable actions (not `<div onclick>`)
- `<nav>` for navigation regions (both top and bottom)
- `<main>` for primary content
- `<aside>` for secondary panels
- Heading hierarchy is logical (`h1` → `h2` → `h3`, no skipping)

---

## 11. Priority Action Items

Ranked by impact for the "mobile command center" goal.

### Tier 1: Transformative (Do First)

| # | Action | Impact | Effort | Status |
|---|--------|--------|--------|--------|
| 1 | **Add bottom navigation bar** | Transforms mobile UX entirely. Puts primary actions in thumb zone. | Medium | ⏭️ Skipped — complexity vs. density tradeoff |
| 2 | **Mobile density pass** | More content visible per screen. Feels like a command center, not a website. | Low | ✅ Phase 1 done (Card system + projects page). Phase 2 in progress. |
| 3 | **Add `content-visibility: auto`** to all list items | 50-90% rendering perf boost on long lists. | Low | ✅ Phase 1 done (chat, project cards, drafts). Phase 2 in progress. |

### Tier 2: High Impact

| # | Action | Impact | Effort | Status |
|---|--------|--------|--------|--------|
| 4 | **Hide-on-scroll navigation** | Reclaims ~64px of vertical space while scrolling. More content visible. | Low | ✅ Done |
| 5 | **Add `@media (hover: hover)` guards** | Eliminates sticky hover states on touch devices. | Low | ✅ Done (Tailwind config + CSS) |
| 6 | **Contextual bottom action bar** on detail views | Primary actions in thumb zone on project/task detail screens. | Medium | Pending |
| 7 | **PWA shortcuts in manifest** | Quick access to Brain Dump, Brief, Projects from home screen long-press. | Low | 🔄 In progress |

### Tier 3: Polish & Delight

| # | Action | Impact | Effort | Details |
|---|--------|--------|--------|---------|
| 8 | **Swipe actions on list items** | Natural mobile interaction for completing/archiving tasks. | Medium | Implement swipe gesture handler with threshold + spring animation. |
| 9 | **Visual viewport keyboard handling** | Fixes keyboard overlap on chat/input-heavy screens. | Medium | `visualViewport` API to adjust fixed elements when keyboard opens. |
| 10 | **Haptic feedback** | Makes interactions feel tactile and confirmed. | Low | `navigator.vibrate()` on task complete, swipe threshold, destructive actions. |
| 11 | **Pull-to-refresh** | Expected mobile gesture for refreshing data. | Medium | Custom implementation since native is prevented in PWA mode. |
| 12 | **Web Share Target** | Users can share content INTO BuildOS from other apps. | Medium | Manifest addition + API route to receive shared content. |

### Tier 4: Advanced (When Ready)

| # | Action | Impact | Effort | Details |
|---|--------|--------|--------|---------|
| 13 | **Service worker caching** | Instant repeat loads, offline support. | High | Cache app shell, stale-while-revalidate for API data. |
| 14 | **Background sync** | Actions taken offline sync when connection returns. | High | IndexedDB queue + service worker sync event. |
| 15 | **Font loading optimization** | Faster first paint, fewer layout shifts. | Low | Preload primary weight, subset to Latin, `font-display: optional`. |
| 16 | **Long-press context menus** | Quick actions without navigating away. | Medium | Touch timer + context menu component. |
| 17 | **iOS PWA state restoration** | Returning to app shows last viewed screen, not home. | Low | Save/restore route in sessionStorage. |
| 18 | **Bundle size audit** | Faster initial load on slow connections. | Medium | `vite-bundle-visualizer`, dynamic imports for heavy features. |

---

## Reference: Mobile UX Patterns from Best-in-Class Apps

| App | What They Do Well | Applicable to BuildOS |
|-----|-------------------|-----------------------|
| **Linear** | Ultra-dense information display, keyboard shortcuts on mobile, fast transitions | Density approach, list design |
| **Things 3** | Beautiful bottom navigation, swipe gestures, quick-add from anywhere | Bottom nav, FAB, swipe actions |
| **Todoist** | Bottom nav, swipe actions, smart input with NLP, offline support | Navigation, input, offline |
| **Notion** | Bottom toolbar on detail views, clean typography, collapsible blocks | Action bar, typography |
| **Slack** | Bottom nav, thread navigation, keyboard handling in chat | Navigation, keyboard |
| **Apple Reminders** | Pull-to-refresh, swipe actions, haptic feedback, compact lists | Gestures, density, haptics |
| **Superhuman** | High density email list, swipe gestures, speed over chrome | Density, gestures, performance |

---

## Implementation Progress

### Sprint 1 — Completed (2026-02-08)

| # | Item | Status | Files Changed |
|---|------|--------|---------------|
| 2 | **Mobile density pass (phase 1)** | ✅ Done | Card.svelte, CardBody.svelte, CardHeader.svelte, CardFooter.svelte, ProjectCard.svelte, projects/+page.svelte — responsive padding tightened on mobile |
| 3 | **Content-visibility (phase 1)** | ✅ Done | AgentMessageList.svelte, ProjectCard.svelte, DraftsList.svelte, performance-optimizations.css — `.cv-auto` utility added |
| 4 | **Hide-on-scroll navigation** | ✅ Done | Navigation.svelte — passive scroll listener, mobile-only, `-translate-y-full` on scroll-down |
| 5 | **Hover guards** | ✅ Done | tailwind.config.js (`future.hoverOnlyWhenSupported: true`), inkprint.css (`.pressable:hover`), animation-utils.css (`.hover-scale-*:hover`) |

**Decision:** Bottom navigation bar (#1) skipped — adds complexity and permanent screen chrome that conflicts with information density goals. May revisit later if hamburger menu becomes a friction point.

### Sprint 2 — Completed (2026-02-08)

| # | Item | Status | Files Changed |
|---|------|--------|---------------|
| 3b | **Content-visibility (phase 2)** | ✅ Done | OperationsList.svelte, TimeBlockList.svelte, VoiceNoteList.svelte, EntityListItem.svelte |
| 7 | **PWA shortcuts in manifest** | ✅ Done | site.webmanifest — added Brain Dump, Projects, History shortcuts |
| 15 | **Font loading optimization** | ✅ Done | Removed unused Google Fonts preconnect hints from +layout.svelte and +page.svelte (app uses system fonts only) |
| 2b | **Expand density pass** | ✅ Done | Dashboard.svelte (grid gaps, section spacing), calendar/+page.svelte (container, settings panel, grid), time-blocks/+page.svelte (container gaps/padding), voice-notes/+page.svelte (gaps/padding), projects/[id]/+page.svelte (mobile command center margin) |

### Not Planned (Deferred)

| # | Item | Reason |
|---|------|--------|
| 1 | Bottom navigation bar | Complexity vs. value tradeoff; revisit if needed |
| 8 | Swipe actions on list items | Not needed right now |

---

## Conclusion

BuildOS has a **strong mobile foundation** — the hard infrastructure work (PWA, viewport, safe areas, responsive layout, dark mode) is done well. The biggest opportunities are in the **interaction layer**:

1. ~~**Hover guards** fix touch bugs~~ ✅
2. ~~**Tighter spacing** transforms density~~ ✅ (phase 1)
3. ~~**Content-visibility** transforms scroll performance~~ ✅ (phase 1)
4. ~~**Hide-on-scroll nav** reclaims vertical space~~ ✅
5. **Gestures** (swipe, pull-to-refresh, long-press) make it feel native — future work

These changes are taking BuildOS from "works on mobile" to "designed for mobile" — a true pocket command center.
