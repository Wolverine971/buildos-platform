---
title: "Modern Mobile Modal and Bottom Sheet UX Patterns for 2025"
date: 2025-11-21
author: Claude Code
tags:
  - mobile-ux
  - bottom-sheets
  - modal-patterns
  - sveltekit
  - svelte-5
  - tailwind-css
  - touch-gestures
  - accessibility
  - responsive-design
context: "Research for BuildOS platform mobile modal/bottom sheet optimization"
related_components:
  - /apps/web/src/lib/components/modals/Modal.svelte
  - /apps/web/src/lib/components/modals/FormModal.svelte
current_implementation:
  - "640px breakpoint (sm:)"
  - "Slide-up animation on mobile, scale on desktop"
  - "Focus trap and keyboard navigation"
  - "iOS safe area support"
research_focus:
  - "Mobile-first modal/dialog patterns (bottom sheets, full-screen modals, slide-overs)"
  - "Touch gestures for modals (swipe to dismiss, pull to close, drag handles)"
  - "Mobile form UX best practices (input optimization, keyboard handling, validation)"
  - "Responsive breakpoint strategies beyond 640px"
  - "iOS and Android specific considerations"
  - "Accessibility on mobile (touch targets, screen readers)"
path: thoughts/shared/research/2025-11-21_15-38-14_mobile-modal-bottom-sheet-ux-patterns.md
---

# Modern Mobile Modal and Bottom Sheet UX Patterns for 2025

## Executive Summary

This research document provides a comprehensive overview of modern mobile modal and bottom sheet UX patterns for 2025, synthesizing best practices from industry leaders (Apple, Google, Material Design), leading design systems (shadcn/ui, Radix UI, Vaul), and contemporary web standards. The research is specifically contextualized for a SvelteKit + Svelte 5 + Tailwind CSS implementation.

**Key Findings:**
- Bottom sheets are the dominant mobile overlay pattern in 2025, replacing traditional full-screen modals
- Touch gestures (swipe-to-dismiss, pull-to-close, drag handles) are now expected standard behavior
- Responsive breakpoints need to go beyond 640px with custom strategies for phones, tablets, and desktop
- Mobile form optimization requires specific attention to keyboard handling, input types, and validation patterns
- Accessibility requirements have elevated, with 44-48px touch targets and comprehensive keyboard/screen reader support
- Platform-specific considerations (iOS safe areas, Android back gestures) are critical for native-feeling experiences

---

## Table of Contents

1. [Foundational Concepts](#foundational-concepts)
2. [Touch Gesture Patterns](#touch-gesture-patterns)
3. [Responsive Breakpoint Strategies](#responsive-breakpoint-strategies)
4. [Platform-Specific Considerations](#platform-specific-considerations)
5. [Accessibility Requirements](#accessibility-requirements)
6. [Implementation with SvelteKit + Tailwind](#implementation-with-sveltekit--tailwind)
7. [Mobile Form UX Best Practices](#mobile-form-ux-best-practices)
8. [Common Pitfalls and Anti-Patterns](#common-pitfalls-and-anti-patterns)
9. [Recommended Libraries and Tools](#recommended-libraries-and-tools)
10. [Implementation Recommendations for BuildOS](#implementation-recommendations-for-buildos)

---

## 1. Foundational Concepts

### What Are Bottom Sheets?

Bottom sheets are overlay components anchored to the bottom edge of the mobile viewport that display secondary content or contextual controls while preserving substantial visibility of the underlying primary interface. They maintain crucial contextual information that users may need to reference while interacting with the overlay.

**Key Characteristics:**
- Anchored to the bottom edge of the screen
- Preserve background visibility (unlike full-screen modals)
- Provide focused, temporary interactions without full-page transitions
- Balance spatial efficiency with intuitive gesture-based navigation

### Taxonomy: Modal vs. Nonmodal Bottom Sheets

**Modal Bottom Sheets:**
- Block user interactions with background content while visible
- Include a translucent dark scrim over background content
- Signal to assistive technologies that underlying content is inert
- Appropriate for tasks requiring dedicated user focus (forms, confirmations, destructive actions)

**Nonmodal Bottom Sheets:**
- Permit continued interaction with background content
- No scrim overlay (or minimal/transparent scrim)
- Allow users to reference and interact with primary interface elements
- Ideal for supplementary information users may reference alongside primary content (filtering options, additional details)

**Expandable/Hybrid Sheets:**
- Initially display in minimized, nonmodal configuration
- Can be expanded through user gestures to occupy greater screen real estate
- May transition from nonmodal to modal behavior when expanded
- Particularly valuable on small screens where space is constrained

### When to Use Bottom Sheets vs. Full-Screen Modals

**Use Bottom Sheets For:**
- Quick actions and confirmations
- Forms with 3-5 fields
- Filtering/sorting options
- Action menus and contextual controls
- Content that requires background context visibility
- Mobile-first experiences

**Use Full-Screen Modals For:**
- Complex multi-step workflows
- Forms with 6+ fields or multiple sections
- Content that requires user's complete attention
- Desktop-first experiences
- Tasks that would typically occupy a full page

**Anti-Pattern:** Using bottom sheets to replace typical page-to-page navigation flows. Sheets are transient, temporary overlays designed for brief interactions, not persistent application flows.

---

## 2. Touch Gesture Patterns

### Swipe-to-Dismiss

**Implementation:**
- Downward vertical swipe motion initiated from the top of the sheet
- Leverages intuitive spatial metaphor of "pulling" content off the bottom of the screen
- Most prevalent gesture pattern for closing bottom sheets

**Challenges:**
- **Swipe ambiguity**: Downward swipes serve multiple competing functions depending on context and position
  - Top of screen: May trigger notification drawer (Android) or control center (iOS)
  - Drag handle: Should close the sheet
  - Scrollable content area: Should scroll content, not dismiss sheet
- Users cannot reliably predict the outcome of their gestural input

**Best Practices:**
- Include a **tactile drag handle** at the top of bottom sheets
- Drag handle functions as both visual affordance and designated region for gesture initiation
- Distinguish swipe events from scroll events through careful touch event handling
- Material Design 3 specifies drag handle should be 4-5px in height with 48px accessible hit target

### Pull-to-Close with Direct Manipulation

**Implementation:**
- Users drag the sheet downward through continuous contact with the screen
- Creates a preview of the closed state as they drag
- Sheet snaps closed if user releases beyond a defined threshold distance
- Provides significantly richer feedback than simple swipe

**Technical Requirements:**
- Sophisticated animation interpolation to calculate sheet's position based on touch position
- Smooth transition to final state when user releases
- Visual feedback through opacity changes or scale transforms indicating dismissal threshold
- Leverage CSS `transform` properties (not `top`/`left`) for GPU acceleration
- Avoid expensive layout recalculation cycles

**User Experience Benefits:**
- Direct correspondence between finger movement and sheet position
- Clear visual feedback of dismissal threshold
- Cancellable action (user can drag back up before releasing)
- Feels like direct manipulation rather than command-based interaction

### Drag Handle Design

**Visual Specification (Material Design 3):**
- Small horizontal bar, approximately 4-5px in height
- Centered at top of sheet
- Subtle contrast with sheet background (not too prominent)
- Rounded corners for polish

**Accessibility Specification:**
- Minimum 48 density-independent pixels hit target
- Users with motor control difficulties require substantially larger targets than 44x44px standard
- Essential for users with reduced precision or hand tremors

**Implementation Example (Tailwind CSS):**
```html
<!-- Visual drag indicator -->
<div class="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>

<!-- Accessible hit target area (invisible but interactive) -->
<button
  aria-label="Close"
  class="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-12 -mt-6"
  onclick="closeSheet()"
></button>
```

### Gesture Disambiguation

**Challenge:** Multiple competing gestures on mobile devices:
- Platform back gesture (swipe from left edge on iOS/Android)
- Pull-to-refresh (downward swipe from top of scrollable content)
- Swipe-to-dismiss (downward swipe from drag handle)
- Content scrolling (vertical swipe in scrollable content area)

**Solution Strategies:**
1. **Designated gesture regions**: Use drag handle as exclusive region for dismissal gestures
2. **Threshold detection**: Require minimum drag distance before initiating dismissal
3. **Velocity detection**: Distinguish quick swipes from slow drags
4. **Multiple dismissal mechanisms**: Provide explicit close button in addition to gesture
5. **Respect platform gestures**: Don't intercept left-edge swipes for back navigation

---

## 3. Responsive Breakpoint Strategies

### Beyond Standard 640px Breakpoint

**Standard Tailwind Breakpoints:**
- `sm: 640px` - Small tablets and landscape phones
- `md: 768px` - Tablets
- `lg: 1024px` - Laptops and small desktops
- `xl: 1280px` - Large desktops
- `2xl: 1536px` - Extra large desktops

**Problem:** Bottom sheets require more nuanced breakpoints that align with specific device transitions and behavioral changes, not just screen size categories.

### Recommended Bottom Sheet Breakpoint Strategy

**Custom Breakpoints for Bottom Sheets:**
- `xs: 480px` - Large phones in landscape, small tablets in portrait
- `sm: 600px` - Transition point from phones to small tablets (Material Design breakpoint)
- `md: 768px` - Standard tablet threshold
- `lg: 1024px` - Large tablet and desktop
- `xl: 1440px` - Very large displays

**Implementation in Tailwind Config:**
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      screens: {
        'xs': '480px',
        'sheet-tablet': '600px',
        'sheet-desktop': '1024px',
      },
    },
  },
}
```

### Content-Driven Breakpoints

**Philosophy:** Rather than device-centric breakpoints, position breakpoints at the point where the current layout becomes ineffective for displaying content.

**Approach:**
1. Design for smallest screen first (320px width)
2. Gradually expand viewport width in browser dev tools
3. Identify the exact point where layout breaks or becomes ineffective
4. Place breakpoint at that specific width
5. Redesign layout for new breakpoint and repeat

**Result:** Breakpoints may occur at different thresholds than standard device-centric breakpoints, but they're optimized for your specific content and layout.

### Responsive Behavior Patterns

**Phone (< 600px):**
- Full-width sheet (`w-full`)
- Near-full-height expansion allowed (`max-h-[90vh]`)
- Bottom-anchored positioning
- Slide-up animation
- No maximum width constraint

```html
<div class="fixed bottom-0 left-0 w-full max-h-[90vh] rounded-t-2xl">
  <!-- Content -->
</div>
```

**Tablet (600px - 1024px):**
- Constrained width with side margins (`max-w-xl mx-auto`)
- Limited height to preserve context (`max-h-[80vh]`)
- Centered horizontally
- Maintain bottom anchoring
- Consider side sheets for landscape orientation

```html
<div class="fixed bottom-0 left-0 right-0 w-full max-w-xl mx-auto max-h-[80vh] rounded-t-2xl sheet-tablet:px-8">
  <!-- Content -->
</div>
```

**Desktop (≥ 1024px):**
- Significant width constraint (`max-w-2xl`)
- Centered with substantial side margins
- Consider transition to center modal or dialog instead of bottom sheet
- Maximum height constraint (`max-h-[70vh]`)
- Potentially change from bottom sheet to standard modal pattern

```html
<div class="fixed bottom-0 left-0 right-0 w-full max-w-2xl mx-auto max-h-[70vh] rounded-t-2xl sheet-desktop:rounded-2xl sheet-desktop:bottom-auto sheet-desktop:top-1/2 sheet-desktop:-translate-y-1/2">
  <!-- Content -->
</div>
```

### Material Design 3 Specifications

**Tablet and Desktop Layout:**
- Bottom sheets constrained to maximum width of 640dp (density-independent pixels)
- Side margins of 56dp when available screen width exceeds threshold
- Sheets transition from full-width on phones to constrained-width centered layout on larger screens

**Implementation Challenge:**
This requirement creates a design challenge where the sheet must transition from full-width layout on phones to constrained-width centered layout on larger screens—a transformation that cannot be adequately expressed through Tailwind's standard breakpoint utilities alone.

**Solution:**
Combine multiple Tailwind utilities with custom breakpoints:
```html
<div class="fixed bottom-0 left-0 right-0 w-full sheet-tablet:max-w-[640px] sheet-tablet:mx-auto sheet-tablet:left-auto sheet-tablet:right-auto">
  <!-- Content -->
</div>
```

---

## 4. Platform-Specific Considerations

### iOS Interaction Patterns

**Hardware and System Gestures:**
- **Swipe-from-left-edge**: Browser back navigation (captured by Safari/iOS)
  - Bottom sheets must NOT initiate dismissal on left-edge swipes
  - Would conflict with user's expectation of platform back gesture
- **Pull-to-refresh**: Downward pull from top of scrollable content
  - Avoid gesture ambiguity between pull-to-refresh and pull-to-close
  - Apple HIG recommends avoiding gesture conflicts through clear visual affordances

**Safe Area Insets:**
- iPhones with notches (iPhone X and later)
- Home indicator bar at bottom of screen
- Requires padding adjustments for bottom sheets

**Implementation:**
```html
<!-- HTML meta tag -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">

<!-- CSS using environment variables -->
<style>
  .bottom-sheet {
    padding-bottom: max(1rem, env(safe-area-inset-bottom));
  }
</style>

<!-- Tailwind with safe area utilities (if configured) -->
<div class="pb-4 safe-bottom:pb-8">
  <button class="w-full">Submit</button>
</div>
```

**Keyboard Behavior:**
- iOS does NOT automatically trigger layout adjustments when keyboard appears
- Input fields near bottom of sheet may be obscured by keyboard
- Requires explicit scroll or position adjustments

**Solution:**
```javascript
// Detect keyboard appearance and scroll focused input into view
function handleInputFocus(event) {
  const input = event.target;
  setTimeout(() => {
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300); // Delay to allow keyboard animation
}
```

### Android Interaction Patterns

**System Gestures:**
- **Edge-based back gesture**: Swipe from left edge of screen
  - Web applications must carefully accommodate this
  - Bottom sheets should not interfere with system back navigation
- **Recent apps gesture**: Swipe upward from bottom of screen
  - Bottom sheets must not interfere
- **Notification shade**: Swipe downward from top
  - Similar to iOS, avoid gesture conflicts

**Gesture Navigation System:**
- Requires careful gesture event handling
- Distinguish between user-initiated sheet interactions and system-level gestures
- Use `event.preventDefault()` judiciously to avoid blocking system gestures

**Keyboard Behavior:**
- Android automatically triggers scrolling to ensure input field remains visible above keyboard
- May push entire sheet upward if not handled properly
- Different from iOS: more automatic but can cause unexpected sheet positioning

**Solution Strategies:**
```javascript
// React Native bottom sheet approach (adaptable to web)
<BottomSheet
  keyboardBehavior="interactive"  // Push sheet up when keyboard appears
  keyboardBlurBehavior="restore"  // Return to original position when keyboard dismissed
>
  {/* Content */}
</BottomSheet>
```

**Web Implementation:**
```javascript
// Detect keyboard and adjust sheet position
window.visualViewport?.addEventListener('resize', () => {
  const keyboardHeight = window.innerHeight - window.visualViewport.height;
  if (keyboardHeight > 100) {
    // Keyboard is open
    bottomSheet.style.transform = `translateY(-${keyboardHeight}px)`;
  } else {
    // Keyboard is closed
    bottomSheet.style.transform = 'translateY(0)';
  }
});
```

### Cross-Platform Design Philosophy

**Apple Human Interface Guidelines:**
- Avoid gesture ambiguity through clear visual affordances
- Provide explicit controls (close buttons) rather than relying exclusively on gestures
- Maintain platform conventions for familiar interactions

**Material Design 3:**
- Comprehensive specifications for bottom sheet implementation across platforms
- Pixel specifications, typography systems, animation timing
- Platform-specific adaptations while maintaining visual consistency

**Recommendation:**
Design sheets that work well on both platforms by:
1. Providing multiple dismissal mechanisms (gesture + explicit button)
2. Respecting platform gesture conventions (don't intercept system gestures)
3. Adapting keyboard handling to platform behavior
4. Implementing safe area support for iOS
5. Testing on real devices, not just simulators/emulators

---

## 5. Accessibility Requirements

### Touch Target Sizing

**WCAG 2.5.5 Standard:**
- Minimum touch target size: 44 x 44 CSS pixels for pointer inputs
- This represents a minimum threshold, not an optimal target size

**Research-Based Recommendations:**
- **Frequently used controls**: 48 x 48 pixels (Material Design 3 standard)
- **Less frequently accessed elements**: 44 x 44 pixels (minimum)
- **Bottom of screen elements**: Substantially larger due to reduced precision

**Why Bottom Sheets Need Larger Targets:**
- Interface elements at bottom of screen have naturally reduced user precision
- Users achieve maximum precision near center of screen
- Moderate precision in upper portion
- Notably reduced precision at bottom where thumb must stretch

**Implementation:**
```html
<!-- Close button with proper touch target -->
<button
  aria-label="Close"
  class="absolute top-4 right-4 w-12 h-12 flex items-center justify-center rounded-full hover:bg-gray-100"
>
  <svg class="w-6 h-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
  </svg>
</button>

<!-- Drag handle with accessible hit target -->
<div class="relative">
  <!-- Visual indicator (small) -->
  <div class="w-12 h-1 bg-gray-300 rounded-full mx-auto"></div>

  <!-- Accessible hit target (large) -->
  <button
    aria-label="Drag to resize or close"
    class="absolute -top-6 left-1/2 -translate-x-1/2 w-20 h-12"
  ></button>
</div>
```

### Multiple Dismissal Mechanisms

**Why Multiple Mechanisms Matter:**
- Users with motor impairments may struggle with swipe gestures
- Users with limited gestural capability need alternatives
- Screen reader users cannot perceive visual gesture affordances
- Cognitive accessibility: Some users don't discover gesture patterns

**Required Dismissal Methods:**
1. **Explicit close button** (styled as "X" or "Close" text)
2. **Swipe-to-dismiss gesture** (for touch-capable users)
3. **Escape key** (for keyboard users)
4. **Back button** (browser/platform back navigation)
5. **Scrim click** (optional, can be problematic - see anti-patterns)

**Implementation:**
```svelte
<script>
  let isOpen = $state(false);

  function closeSheet() {
    isOpen = false;
  }

  // Keyboard handler
  function handleKeydown(event) {
    if (event.key === 'Escape') {
      closeSheet();
    }
  }

  // Mount keyboard listener
  $effect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeydown);
      return () => document.removeEventListener('keydown', handleKeydown);
    }
  });
</script>

<!-- Close button -->
<button
  onclick={closeSheet}
  aria-label="Close"
  class="absolute top-4 right-4 w-12 h-12"
>
  ✕
</button>

<!-- Drag handle with close capability -->
<div
  role="button"
  tabindex="0"
  aria-label="Drag to close"
  onkeydown={(e) => e.key === 'Enter' && closeSheet()}
  class="drag-handle"
>
  <div class="w-12 h-1 bg-gray-300 rounded-full mx-auto"></div>
</div>
```

### Screen Reader Accessibility

**Semantic Markup Requirements:**
- Use appropriate semantic HTML elements
- Declare role as dialog or modal through `role="dialog"` attribute
- Or use native HTML `<dialog>` element (with polyfill for older browsers)

**ARIA Attributes:**
```html
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="sheet-title"
  aria-describedby="sheet-description"
  class="bottom-sheet"
>
  <h2 id="sheet-title">Filter Options</h2>
  <p id="sheet-description">Select criteria to filter your search results</p>
  <!-- Content -->
</div>
```

**Key ARIA Properties:**
- `aria-modal="true"`: Informs assistive technologies that background content is inert
- `aria-labelledby`: Points to element providing sheet's title
- `aria-describedby`: Points to element providing sheet's description
- `aria-hidden="true"`: Apply to background content when modal sheet is open (optional, handled by browser for native dialog)

### Focus Management

**Focus Trap Pattern:**
- Keyboard focus must cycle within the sheet for modal sheets
- Prevents users from accidentally navigating outside modal context
- Tab key moves forward through interactive elements
- Shift+Tab moves backward through interactive elements
- When reaching last element, Tab returns to first element

**Focus Restoration:**
- Upon sheet closure, restore focus to trigger element that opened sheet
- Ensures keyboard users can understand navigation flow
- Allows users to intuitively undo actions through back navigation

**Implementation:**
```javascript
// Simple focus trap implementation
function createFocusTrap(element) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  element.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
  });

  // Focus first element when sheet opens
  firstElement.focus();

  // Store original active element for restoration
  return document.activeElement;
}
```

### Keyboard Navigation

**Required Keyboard Behaviors:**
- **Escape key**: Dismiss sheet
- **Tab**: Move to next interactive element
- **Shift+Tab**: Move to previous interactive element
- **Enter/Space**: Activate focused button or control
- **Arrow keys**: Navigate within radio groups, select elements, or custom controls

**Implementation Checklist:**
- ✅ Sheet dismissible via Escape key
- ✅ Tab navigation cycles through interactive elements within sheet
- ✅ Focus trap prevents navigation to background content (for modal sheets)
- ✅ Visual focus indicators (`:focus-visible` pseudo-class)
- ✅ Focus restored to trigger element on close
- ✅ Browser/platform back navigation supported when appropriate

---

## 6. Implementation with SvelteKit + Tailwind

### Using Shadcn-Svelte Components

Shadcn-Svelte provides pre-built, accessible implementations of bottom sheet patterns built on bits-ui (Svelte equivalent of Radix UI). This significantly accelerates development while ensuring baseline accessibility compliance.

**Installation:**
```bash
# Install shadcn-svelte
npx shadcn-svelte@latest init

# Add drawer/sheet component
npx shadcn-svelte@latest add drawer
```

**Basic Implementation:**
```svelte
<script lang="ts">
  import { Drawer } from "$lib/components/ui/drawer";

  let open = $state(false);
</script>

<Drawer.Root bind:open>
  <Drawer.Trigger>
    <button class="px-4 py-2 bg-blue-600 text-white rounded-lg">
      Open Options
    </button>
  </Drawer.Trigger>

  <Drawer.Portal>
    <Drawer.Overlay class="fixed inset-0 bg-black/40" />
    <Drawer.Content class="fixed bottom-0 left-0 right-0 max-h-[90vh] rounded-t-2xl bg-white p-6">
      <!-- Drag handle -->
      <div class="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-4"></div>

      <Drawer.Title class="text-xl font-semibold mb-2">
        Filter Options
      </Drawer.Title>

      <Drawer.Description class="text-gray-600 mb-4">
        Select criteria to filter your search results
      </Drawer.Description>

      <!-- Your content here -->
      <div class="space-y-4">
        <!-- Form fields, options, etc. -->
      </div>

      <Drawer.Footer class="mt-6 flex gap-3">
        <Drawer.Close>
          <button class="flex-1 px-4 py-2 border border-gray-300 rounded-lg">
            Cancel
          </button>
        </Drawer.Close>
        <button class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg">
          Apply Filters
        </button>
      </Drawer.Footer>
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

### Custom Implementation with Svelte 5 Runes

If you need more control or want to understand the underlying implementation:

```svelte
<!-- BottomSheet.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { portal } from 'svelte-portal';

  interface Props {
    isOpen?: boolean;
    onClose?: () => void;
    title?: string;
    description?: string;
  }

  let {
    isOpen = $bindable(false),
    onClose,
    title,
    description,
    children
  }: Props = $props();

  let sheetElement: HTMLDivElement;
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  // Handle Escape key
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
    }
  }

  // Handle touch start
  function handleTouchStart(event: TouchEvent) {
    startY = event.touches[0].clientY;
    isDragging = true;
  }

  // Handle touch move
  function handleTouchMove(event: TouchEvent) {
    if (!isDragging) return;

    currentY = event.touches[0].clientY;
    const deltaY = currentY - startY;

    // Only allow downward dragging
    if (deltaY > 0) {
      sheetElement.style.transform = `translateY(${deltaY}px)`;
    }
  }

  // Handle touch end
  function handleTouchEnd() {
    if (!isDragging) return;

    const deltaY = currentY - startY;
    const threshold = 100; // pixels

    if (deltaY > threshold) {
      close();
    } else {
      // Snap back to original position
      sheetElement.style.transform = 'translateY(0)';
    }

    isDragging = false;
    startY = 0;
    currentY = 0;
  }

  function close() {
    isOpen = false;
    onClose?.();
  }

  // Setup/teardown keyboard listener
  $effect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeydown);
      // Prevent body scroll when sheet is open
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeydown);
        document.body.style.overflow = '';
      };
    }
  });
</script>

{#if isOpen}
  <div use:portal={'body'}>
    <!-- Scrim/Overlay -->
    <div
      class="fixed inset-0 bg-black/40 z-40 animate-in fade-in duration-200"
      onclick={close}
      onkeydown={(e) => e.key === 'Enter' && close()}
      role="button"
      tabindex="-1"
      aria-label="Close"
    ></div>

    <!-- Bottom Sheet -->
    <div
      bind:this={sheetElement}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'sheet-title' : undefined}
      aria-describedby={description ? 'sheet-description' : undefined}
      class="fixed bottom-0 left-0 right-0 z-50 max-h-[90vh] rounded-t-2xl bg-white shadow-2xl animate-in slide-in-from-bottom duration-300"
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
    >
      <!-- Drag Handle -->
      <div class="flex justify-center pt-3 pb-2">
        <div class="w-12 h-1 bg-gray-300 rounded-full"></div>
      </div>

      <!-- Content -->
      <div class="px-6 pb-safe overflow-y-auto max-h-[calc(90vh-2rem)]">
        {#if title}
          <h2 id="sheet-title" class="text-xl font-semibold mb-2">
            {title}
          </h2>
        {/if}

        {#if description}
          <p id="sheet-description" class="text-gray-600 mb-4">
            {description}
          </p>
        {/if}

        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes slide-in-from-bottom {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .animate-in {
    animation-duration: 0.3s;
    animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
    animation-fill-mode: both;
  }

  .slide-in-from-bottom {
    animation-name: slide-in-from-bottom;
  }

  .fade-in {
    animation-name: fade-in;
  }

  @keyframes fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* iOS safe area support */
  .pb-safe {
    padding-bottom: max(1.5rem, env(safe-area-inset-bottom));
  }
</style>
```

**Usage:**
```svelte
<script lang="ts">
  import BottomSheet from '$lib/components/BottomSheet.svelte';

  let isOpen = $state(false);
</script>

<button onclick={() => isOpen = true}>
  Open Sheet
</button>

<BottomSheet
  bind:isOpen
  title="Filter Options"
  description="Select criteria to filter results"
>
  <div class="space-y-4">
    <!-- Your content -->
  </div>
</BottomSheet>
```

### Responsive Tailwind Utilities

**Custom Configuration:**
```javascript
// tailwind.config.js
export default {
  theme: {
    extend: {
      screens: {
        'xs': '480px',
        'sheet-tablet': '600px',
        'sheet-desktop': '1024px',
      },
      animation: {
        'slide-up': 'slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-down': 'slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
      },
    },
  },
  plugins: [],
}
```

**Responsive Sheet Styles:**
```html
<!-- Mobile: Full width, slide up from bottom -->
<div class="fixed bottom-0 left-0 right-0 w-full max-h-[90vh] rounded-t-2xl

            sheet-tablet:max-w-2xl sheet-tablet:mx-auto sheet-tablet:max-h-[80vh]

            sheet-desktop:max-w-3xl sheet-desktop:max-h-[70vh]
            sheet-desktop:bottom-8 sheet-desktop:rounded-2xl">
  <!-- Content -->
</div>
```

---

## 7. Mobile Form UX Best Practices

### Progressive Enhancement Foundation

SvelteKit's philosophy aligns perfectly with mobile-first form design. Start with native HTML forms that work without JavaScript, then progressively enhance when JavaScript is available.

**Baseline Form (no JavaScript):**
```svelte
<form method="POST" action="?/submitForm" novalidate>
  <input type="text" name="email" required />
  <input type="password" name="password" required />
  <button type="submit">Sign In</button>
</form>
```

The `novalidate` attribute disables browser validation popups so you can control the validation experience and display server-side errors clearly.

**Enhanced Form (with JavaScript):**
```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let isSubmitting = $state(false);
</script>

<form
  method="POST"
  action="?/submitForm"
  novalidate
  use:enhance={() => {
    isSubmitting = true;
    return async ({ result }) => {
      isSubmitting = false;
      // Handle result
    };
  }}
>
  <!-- Fields -->
  <button type="submit" disabled={isSubmitting}>
    {isSubmitting ? 'Submitting...' : 'Sign In'}
  </button>
</form>
```

### Input Type Optimization

Different input types trigger different keyboards on iOS and Android, significantly reducing user friction:

| Field Type | Input Type | Keyboard Behavior |
|------------|------------|-------------------|
| Email | `type="email"` | Email keyboard with @ and . keys |
| Phone | `type="tel"` | Numeric keyboard with +, -, (, ) |
| Number | `type="number"` | Numeric keyboard |
| URL | `type="url"` | Keyboard with / and . |
| Date | `type="date"` | Native date picker |
| Search | `type="search"` | Search-optimized keyboard |

**Implementation:**
```svelte
<input
  type="email"
  name="email"
  inputmode="email"
  autocomplete="email"
  class="w-full px-4 py-3 text-base rounded-lg border border-gray-300"
/>

<input
  type="tel"
  name="phone"
  inputmode="tel"
  autocomplete="tel"
  class="w-full px-4 py-3 text-base rounded-lg border border-gray-300"
/>

<input
  type="number"
  name="age"
  inputmode="numeric"
  pattern="[0-9]*"
  class="w-full px-4 py-3 text-base rounded-lg border border-gray-300"
/>
```

**Key Attributes:**
- `inputmode`: Backup for better keyboard control on older devices
- `autocomplete`: Enables browser autofill (reduces typing burden significantly)
- `pattern`: Additional validation hint for browsers
- `text-base`: **Critical** - 16px font size prevents iOS auto-zoom on input focus

### Mobile Validation Patterns

**Two-Tier Validation Approach:**
1. **Client-side validation**: Immediate feedback after field completion
2. **Server-side validation**: Mandatory for security and data integrity

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
  let fieldErrors = $state({});

  function validateEmail(email: string) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email) ? '' : 'Invalid email format';
  }

  function handleBlur(fieldName: string, value: string) {
    if (fieldName === 'email') {
      fieldErrors.email = validateEmail(value);
    }
  }
</script>

<form method="POST" use:enhance>
  <div class="space-y-2">
    <label for="email" class="block text-sm font-medium text-gray-700">
      Email <span class="text-red-500">*</span>
    </label>
    <input
      id="email"
      type="email"
      name="email"
      value={form?.email ?? ''}
      onblur={(e) => handleBlur('email', e.target.value)}
      aria-invalid={!!(fieldErrors.email || form?.errors?.email)}
      aria-describedby={fieldErrors.email || form?.errors?.email ? 'email-error' : undefined}
      class="w-full px-4 py-3 text-base rounded-lg border
             {fieldErrors.email || form?.errors?.email ? 'border-red-500' : 'border-gray-300'}"
    />
    {#if fieldErrors.email || form?.errors?.email}
      <p id="email-error" class="text-red-500 text-sm mt-1">
        {fieldErrors.email || form?.errors?.email}
      </p>
    {/if}
  </div>
</form>
```

**When to Show Validation:**
- ❌ **DON'T** validate while user is actively typing (overwhelming, anxiety-inducing)
- ✅ **DO** validate after user has completed input (blur event or form submission)
- ✅ **DO** mark required fields with asterisks (*)
- ✅ **DO** label optional fields explicitly as "optional"

### Keyboard Handling on Mobile

**Autofocus Considerations:**
```svelte
<input
  type="text"
  name="search"
  autofocus={typeof window !== 'undefined' && window.innerWidth >= 768}
  class="w-full px-4 py-3 text-base rounded-lg border"
  placeholder="Search..."
/>
```

**Why Conditional Autofocus:**
- Mobile keyboards cover ~50% of screen
- Autofocus immediately triggers keyboard, obscuring content
- Better UX: Let users explicitly tap field when ready
- Desktop: Autofocus is convenient and doesn't obscure content

**Return Key Behavior:**
```svelte
<!-- Single-line input that submits -->
<input
  type="text"
  name="message"
  enterkeyhint="send"
  class="w-full px-4 py-3 text-base rounded-lg border"
/>

<!-- Multi-line textarea that supports line breaks -->
<textarea
  name="description"
  enterkeyhint="enter"
  rows="4"
  class="w-full px-4 py-3 text-base rounded-lg border"
></textarea>
```

**`enterkeyhint` Values:**
- `send`: For messaging or submission
- `search`: For search inputs
- `next`: To advance to next field
- `done`: To close keyboard
- `enter`: Default behavior (new line)

### Virtual Keyboard Optimization

**Scroll Focused Input Into View:**
```svelte
<script lang="ts">
  function handleInputFocus(event: FocusEvent) {
    const input = event.target as HTMLInputElement;

    // Wait for keyboard animation to complete
    setTimeout(() => {
      input.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }, 300);
  }
</script>

<input
  type="text"
  name="email"
  onfocus={handleInputFocus}
  class="w-full px-4 py-3 text-base rounded-lg border"
/>
```

**Dismiss Keyboard on Submit:**
```svelte
<form
  onsubmit={() => {
    // Blur active input to dismiss keyboard
    if (document.activeElement instanceof HTMLInputElement) {
      document.activeElement.blur();
    }
  }}
>
  <!-- Fields -->
</form>
```

### Form Field Spacing

**Mobile-Optimized Spacing:**
```svelte
<form class="space-y-6 p-4 max-w-md mx-auto">
  <div class="space-y-2">
    <label for="firstName" class="block text-sm font-medium text-gray-700">
      First Name
    </label>
    <input
      id="firstName"
      type="text"
      name="firstName"
      class="w-full px-4 py-3 text-base rounded-lg border border-gray-300
             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  </div>

  <div class="space-y-2">
    <label for="lastName" class="block text-sm font-medium text-gray-700">
      Last Name
    </label>
    <input
      id="lastName"
      type="text"
      name="lastName"
      class="w-full px-4 py-3 text-base rounded-lg border border-gray-300
             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  </div>

  <button
    type="submit"
    class="w-full py-3 px-4 bg-blue-600 text-white text-base font-medium rounded-lg
           hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
           disabled:opacity-50 disabled:cursor-not-allowed
           transition-colors"
  >
    Continue
  </button>
</form>
```

**Spacing Guidelines:**
- `space-y-6`: Between form sections/field groups (1.5rem / 24px)
- `space-y-2`: Between label and input within a field (0.5rem / 8px)
- `px-4 py-3`: Input padding for comfortable touch targets (minimum 44px height)
- `p-4`: Form container padding for breathing room from edges

**Touch Target Sizing:**
- **Minimum**: 44 x 44 pixels (WCAG 2.5.5)
- **Recommended**: 48 x 48 pixels (Material Design 3)
- `py-3` (0.75rem/12px) + `text-base` (16px line height) ≈ 48px total height

### iOS Safe Area Handling

**HTML Meta Tag:**
```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1, viewport-fit=cover"
/>
```

**CSS with Environment Variables:**
```css
.form-submit-button {
  padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
}
```

**Tailwind Custom Utilities:**
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      spacing: {
        'safe-bottom': 'calc(1rem + env(safe-area-inset-bottom))',
        'safe-top': 'calc(1rem + env(safe-area-inset-top))',
      },
    },
  },
}
```

**Usage:**
```svelte
<form class="p-4 pb-safe-bottom">
  <!-- Fields -->
  <button type="submit" class="w-full mb-safe-bottom">
    Submit
  </button>
</form>
```

### OTP Input Pattern

**Segmented OTP with Auto-Advance:**
```svelte
<script lang="ts">
  let otpValues = $state(['', '', '', '', '', '']);
  let otpString = $derived(otpValues.join(''));

  function handleOtpInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // Handle paste - distribute characters
    if (value.length > 1) {
      const chars = value.split('').slice(0, 6);
      for (let i = 0; i < chars.length && (index + i) < 6; i++) {
        otpValues[index + i] = chars[i];
      }
      // Focus last filled input
      const lastIndex = Math.min(index + chars.length - 1, 5);
      document.getElementById(`otp-${lastIndex}`)?.focus();
      return;
    }

    // Handle single character input
    otpValues[index] = value;

    // Auto-advance to next field
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  }

  function handleOtpKeydown(index: number, event: KeyboardEvent) {
    // Backspace: Move to previous field if current is empty
    if (event.key === 'Backspace' && !otpValues[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  }
</script>

<div class="flex gap-2 justify-center">
  {#each otpValues as _, index (index)}
    <input
      id="otp-{index}"
      type="text"
      inputmode="numeric"
      pattern="[0-9]"
      maxlength="1"
      value={otpValues[index]}
      oninput={(e) => handleOtpInput(index, e)}
      onkeydown={(e) => handleOtpKeydown(index, e)}
      class="w-12 h-12 text-center text-lg font-semibold border border-gray-300 rounded-lg
             focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      aria-label="OTP digit {index + 1}"
    />
  {/each}
</div>

<!-- Hidden input for form submission -->
<input type="hidden" name="otp" value={otpString} />
```

**Features:**
- Auto-advance to next field on input
- Backspace navigates to previous field
- Paste support (distributes characters across fields)
- Numeric keyboard on mobile (`inputmode="numeric"`)
- Accessible labels for screen readers

---

## 8. Common Pitfalls and Anti-Patterns

### 1. Stacking Multiple Bottom Sheets

**Anti-Pattern:**
```
User opens Sheet A
  → User opens Sheet B from Sheet A
    → User opens Sheet C from Sheet B
      → User is now 3 layers deep and confused
```

**Problems:**
- Significantly increases cognitive load
- Users lose track of their position in hierarchy
- Difficult to navigate back through layers
- Creates accessibility challenges for assistive technology users
- Which dismissal action closes which sheet?

**Better Alternatives:**
- Sequential flows: Closing first sheet returns to primary interface
- Inline reveals: Expand/collapse sections within single sheet
- Full-page navigation: If task requires multiple steps, use full pages
- Sidebar layouts: Persistent side panel for complex interactions

**When Nested Sheets Might Be Acceptable:**
- Maximum 2 levels deep
- Clear visual hierarchy (second sheet distinctly styled)
- Explicit "Back" button (not just close)
- Non-modal first sheet, modal second sheet (clear blocking behavior)

### 2. Using Sheets for Primary Navigation

**Anti-Pattern:**
```
Bottom Sheet → "Features" page
Bottom Sheet → "Pricing" page
Bottom Sheet → "About" page
```

**Problems:**
- Breaks user expectations about navigation semantics
- Confuses distinction between temporary overlays and persistent pages
- Hurts SEO (sheets are not separate pages)
- Breaks browser back/forward navigation
- Prevents deep linking to specific content

**Correct Usage:**
- Sheets are transient, temporary overlays for brief interactions
- Pages are persistent, navigable destinations in information architecture

**Use Bottom Sheets For:**
- Quick actions and confirmations
- Filtering/sorting options
- Action menus and contextual controls
- Short forms (3-5 fields)

**Use Full Pages For:**
- Main navigation destinations
- Content that requires substantial user engagement
- Complex workflows
- Multi-step processes
- Content that should be bookmarkable/shareable

### 3. Ambiguous Dismissal Mechanisms

**Anti-Pattern:**
```
Close button → Closes only current sheet
Swipe down → Closes entire sheet stack
Scrim click → Sometimes closes sheet, sometimes doesn't
Back button → Navigates browser back (leaves app)
```

**Problems:**
- Users cannot predict outcome of dismissal action
- Leads to accidental data loss
- Frustration from lack of control
- Inconsistent behavior breaks mental model

**Solution:**
- **All dismissal mechanisms must produce identical effects**
- If different paths must have different effects, communicate explicitly:
  - "Back" button (with back arrow icon) → Returns to previous sheet
  - "Close" button (with X icon) → Closes entire stack
- Document behavior clearly in visual affordances
- Consider removing scrim click dismissal to avoid accidental closes

### 4. Obscuring Critical Context

**Anti-Pattern:**
```
Sheet: "Enter your verification code"
Critical Info (obscured by scrim): The verification code displayed on screen
```

**Problems:**
- Users must memorize information or close sheet to reference it
- Increases cognitive load
- Leads to errors and frustration
- Particularly problematic for users with memory difficulties

**Solutions:**
1. **Replicate information in sheet**: Include critical context within the sheet itself
2. **Use nonmodal sheets**: Allow users to interact with background while sheet is open
3. **Use different pattern**: Consider side panel, full page, or inline expansion
4. **Minimize scrim opacity**: Make background more visible (but ensure accessibility contrast)

### 5. Poor Scrim Click Handling

**Current Debate:**
Material Design 3 and many implementations allow clicking the scrim (overlay) to dismiss sheets. However, research shows this causes significant accidental dismissal problems.

**Problems with Scrim Click Dismissal:**
- Users frequently click scrim accidentally when trying to:
  - Scroll page content visible behind scrim
  - Reference background information
  - Dismiss keyboard (tapping outside input)
- No confirmation step → immediate data loss
- Particularly problematic on mobile where precision is reduced

**Recommendations:**
1. **Disable scrim click dismissal** (require explicit close button/gesture)
2. If scrim click must be supported:
   - Implement confirmation for forms with unsaved changes
   - Use `event.target === event.currentTarget` to prevent clicks on sheet content from propagating
   - Consider adding friction (hold to dismiss, double-click, etc.)

**Implementation:**
```svelte
<script lang="ts">
  let hasUnsavedChanges = $state(false);

  function handleScrimClick(event: MouseEvent) {
    // Only dismiss if click was on scrim itself, not sheet content
    if (event.target !== event.currentTarget) return;

    if (hasUnsavedChanges) {
      const confirmed = confirm('You have unsaved changes. Discard them?');
      if (!confirmed) return;
    }

    closeSheet();
  }
</script>

<div
  class="scrim"
  onclick={handleScrimClick}
>
  <div class="sheet" onclick={(e) => e.stopPropagation()}>
    <!-- Sheet content -->
  </div>
</div>
```

**Alternative: Disable Scrim Click Entirely**
```svelte
<div class="scrim" style="pointer-events: none;">
  <div class="sheet" style="pointer-events: auto;">
    <!-- Sheet content -->
  </div>
</div>
```

### 6. Insufficient Touch Targets

**Anti-Pattern:**
- 32x32px close button
- 24x24px icon buttons
- Densely packed action buttons without spacing

**Problems:**
- Difficult to tap accurately on mobile
- Particularly challenging for users with motor impairments
- Leads to repeated attempts and frustration
- Accidental taps on adjacent elements

**Solution:**
```svelte
<!-- ❌ Bad: Small touch target -->
<button class="w-6 h-6">✕</button>

<!-- ✅ Good: Proper touch target -->
<button
  class="w-12 h-12 flex items-center justify-center rounded-full hover:bg-gray-100"
  aria-label="Close"
>
  <svg class="w-6 h-6"><!-- Icon --></svg>
</button>

<!-- ✅ Good: Spaced action buttons -->
<div class="flex gap-3">
  <button class="flex-1 px-4 py-3 min-h-[44px]">Cancel</button>
  <button class="flex-1 px-4 py-3 min-h-[44px]">Confirm</button>
</div>
```

### 7. Missing Keyboard Navigation

**Anti-Pattern:**
- Only gesture-based dismissal
- No Tab navigation through interactive elements
- No focus indicators
- Escape key doesn't work

**Problems:**
- Excludes keyboard-only users
- Poor accessibility for users with motor impairments
- Violates WCAG guidelines
- Breaks expected keyboard behavior

**Solution:**
```svelte
<script lang="ts">
  let isOpen = $state(false);
  let firstFocusableElement: HTMLElement;
  let lastFocusableElement: HTMLElement;

  function handleKeydown(event: KeyboardEvent) {
    // Escape key closes sheet
    if (event.key === 'Escape') {
      closeSheet();
      return;
    }

    // Tab key focus trap
    if (event.key === 'Tab') {
      const focusableElements = sheetElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusableElement = focusableElements[0] as HTMLElement;
      lastFocusableElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      if (event.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusableElement) {
          event.preventDefault();
          lastFocusableElement.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusableElement) {
          event.preventDefault();
          firstFocusableElement.focus();
        }
      }
    }
  }

  $effect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeydown);
      return () => document.removeEventListener('keydown', handleKeydown);
    }
  });
</script>
```

### 8. Poor Animation Performance

**Anti-Pattern:**
```css
/* ❌ Bad: Animating layout properties */
.sheet.open {
  transition: height 0.3s, top 0.3s;
  height: 500px;
  top: 0;
}
```

**Problems:**
- Triggers expensive layout recalculation
- Causes jank and dropped frames
- Poor performance on low-end mobile devices
- Battery drain

**Solution:**
```css
/* ✅ Good: Animating transform */
.sheet.open {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  transform: translateY(0);
}

.sheet.closed {
  transform: translateY(100%);
}
```

**Performance Principles:**
- Animate `transform` and `opacity` only (GPU-accelerated)
- Avoid animating `width`, `height`, `top`, `left`, `padding`, `margin`
- Use `will-change` sparingly (memory cost)
- Remove `will-change` after animation completes

---

## 9. Recommended Libraries and Tools

### Shadcn-Svelte (Recommended for BuildOS)

**What:** Pre-built, accessible UI components for SvelteKit based on bits-ui (Svelte's Radix UI equivalent)

**Pros:**
- ✅ Svelte 5 native with runes syntax
- ✅ Built-in accessibility (ARIA, keyboard nav, focus management)
- ✅ Tailwind CSS styling (fully customizable)
- ✅ TypeScript support
- ✅ Tree-shakeable (only import what you need)
- ✅ Copy-paste source code (not npm dependency)

**Cons:**
- Limited touch gesture support compared to specialized libraries
- May need custom gesture handling for advanced interactions

**Installation:**
```bash
npx shadcn-svelte@latest add drawer
```

**Usage:**
```svelte
<script lang="ts">
  import { Drawer } from "$lib/components/ui/drawer";
</script>

<Drawer.Root>
  <Drawer.Trigger>Open</Drawer.Trigger>
  <Drawer.Portal>
    <Drawer.Overlay />
    <Drawer.Content>
      <!-- Content -->
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

**When to Use:**
- Standard bottom sheet implementations
- Forms, action menus, filters
- When accessibility is priority
- When you need customizable styling

### Vaul (via Svelte Wrapper)

**What:** Specialized drawer/bottom sheet library with advanced touch gestures, originally for React

**Pros:**
- ✅ Excellent touch gesture support
- ✅ Snap points (multi-height sheets)
- ✅ Smooth physics-based animations
- ✅ Drag to dismiss with momentum
- ✅ Responsive and mobile-optimized

**Cons:**
- ❌ Primarily React library (requires Svelte wrapper)
- ❌ Less Svelte-native than shadcn-svelte
- ❌ Additional dependency weight

**Note:** Shadcn-Svelte's Drawer component is inspired by Vaul and includes many similar features.

### Bits UI (Underlying Primitives)

**What:** Low-level, headless UI primitives for Svelte (equivalent to Radix UI for React)

**Pros:**
- ✅ Maximum control and customization
- ✅ Handles accessibility, focus management, keyboard nav
- ✅ No styling opinions (bring your own CSS)
- ✅ Composable and flexible

**Cons:**
- ❌ More implementation work required
- ❌ No pre-built styles
- ❌ Steeper learning curve

**When to Use:**
- Need maximum customization
- Building custom design system
- Want to understand low-level implementation

**Usage:**
```bash
pnpm add bits-ui
```

```svelte
<script lang="ts">
  import { Dialog } from "bits-ui";
</script>

<Dialog.Root>
  <Dialog.Trigger>Open</Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay />
    <Dialog.Content>
      <!-- Fully custom content and styling -->
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

### Melt UI

**What:** Another headless UI library for Svelte with builder pattern

**Pros:**
- ✅ Svelte-native with Svelte 5 support
- ✅ Builder pattern for flexible composition
- ✅ Comprehensive accessibility
- ✅ Active development

**Cons:**
- ❌ Different API than Radix/Bits UI (less familiar)
- ❌ Smaller ecosystem than Bits UI

**When to Use:**
- Prefer builder pattern over components
- Want alternative to Bits UI
- Building custom components

### Comparison Table

| Library | Accessibility | Touch Gestures | Styling | Svelte 5 | Recommendation |
|---------|---------------|----------------|---------|----------|----------------|
| **Shadcn-Svelte** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Tailwind CSS | ✅ | **Best for BuildOS** |
| Bits UI | ⭐⭐⭐⭐⭐ | ⭐⭐ | None (headless) | ✅ | Advanced use cases |
| Melt UI | ⭐⭐⭐⭐⭐ | ⭐⭐ | None (headless) | ✅ | Alternative to Bits |
| Vaul | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Basic CSS | ❌ React | Complex gestures only |

---

## 10. Implementation Recommendations for BuildOS

### Current State Analysis

**Existing Implementation:**
- `Modal.svelte` and `FormModal.svelte` components
- 640px breakpoint (sm:) for responsive behavior
- Slide-up animation on mobile, scale on desktop
- Focus trap and keyboard navigation
- iOS safe area support

**Strengths:**
- ✅ Solid foundation with accessibility features
- ✅ iOS safe area support already implemented
- ✅ Responsive design with breakpoint
- ✅ Focus management

**Opportunities for Enhancement:**
- 📈 Expand beyond 640px breakpoint with intermediate breakpoints
- 📈 Add touch gesture support (swipe-to-dismiss, pull-to-close)
- 📈 Implement drag handle for better mobile affordance
- 📈 Enhance mobile form UX (input types, keyboard handling)
- 📈 Add Android back gesture support
- 📈 Implement snap points for expandable sheets
- 📈 Optimize animation performance for mobile

### Recommended Enhancement Roadmap

#### Phase 1: Foundation Improvements (Quick Wins)

**1. Add Drag Handle to Existing Modals**
```svelte
<!-- Add to Modal.svelte and FormModal.svelte -->
<div class="relative">
  <!-- Drag handle -->
  <div class="flex justify-center pt-3 pb-2 sm:hidden">
    <div class="w-12 h-1 bg-gray-300 rounded-full"></div>
  </div>

  <!-- Existing content -->
</div>
```

**2. Expand Responsive Breakpoints**
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      screens: {
        'xs': '480px',
        'modal-tablet': '600px',
        'modal-desktop': '1024px',
      },
    },
  },
}
```

**3. Optimize Mobile Form Inputs**
- Audit existing forms in modals
- Add appropriate `type`, `inputmode`, `autocomplete` attributes
- Ensure `text-base` font size (16px) to prevent iOS zoom
- Add `enterkeyhint` for better keyboard UX

**4. Add Multiple Dismissal Affordances**
```svelte
<!-- Ensure all modals have: -->
<!-- 1. Close button (already exists) -->
<!-- 2. Escape key handler (already exists) -->
<!-- 3. Optional: Scrim click (consider disabling for forms) -->

<div
  class="modal-overlay"
  onclick={hasUnsavedChanges ? handleScrimClickWithConfirmation : closeModal}
>
  <div class="modal-content" onclick={(e) => e.stopPropagation()}>
    <!-- Content -->
  </div>
</div>
```

**Effort:** 1-2 days
**Impact:** High (immediate UX improvements)

#### Phase 2: Touch Gesture Implementation (Medium Priority)

**1. Implement Pull-to-Close Gesture**

Create a custom hook or action for touch gesture handling:

```typescript
// lib/actions/swipeable.ts
export function swipeable(node: HTMLElement, options: {
  onSwipeDown?: () => void;
  threshold?: number;
}) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  const threshold = options.threshold ?? 100;

  function handleTouchStart(event: TouchEvent) {
    startY = event.touches[0].clientY;
    isDragging = true;
  }

  function handleTouchMove(event: TouchEvent) {
    if (!isDragging) return;

    currentY = event.touches[0].clientY;
    const deltaY = currentY - startY;

    if (deltaY > 0) {
      node.style.transform = `translateY(${deltaY}px)`;
      node.style.opacity = `${1 - (deltaY / 500)}`;
    }
  }

  function handleTouchEnd() {
    if (!isDragging) return;

    const deltaY = currentY - startY;

    if (deltaY > threshold) {
      options.onSwipeDown?.();
    } else {
      node.style.transform = 'translateY(0)';
      node.style.opacity = '1';
    }

    isDragging = false;
    startY = 0;
    currentY = 0;
  }

  node.addEventListener('touchstart', handleTouchStart);
  node.addEventListener('touchmove', handleTouchMove);
  node.addEventListener('touchend', handleTouchEnd);

  return {
    destroy() {
      node.removeEventListener('touchstart', handleTouchStart);
      node.removeEventListener('touchmove', handleTouchMove);
      node.removeEventListener('touchend', handleTouchEnd);
    }
  };
}
```

**Usage:**
```svelte
<script lang="ts">
  import { swipeable } from '$lib/actions/swipeable';
  import { closeModal } from '$lib/stores/modal';
</script>

<div
  use:swipeable={{ onSwipeDown: closeModal, threshold: 100 }}
  class="modal-content"
>
  <!-- Content -->
</div>
```

**2. Add Snap Points for Expandable Sheets**

For modals that need multiple heights (e.g., minimized, half, full):

```svelte
<script lang="ts">
  type SnapPoint = 'minimized' | 'half' | 'full';
  let currentSnap = $state<SnapPoint>('half');

  const snapHeights = {
    minimized: '20vh',
    half: '50vh',
    full: '90vh'
  };
</script>

<div
  class="modal-content"
  style="height: {snapHeights[currentSnap]}"
>
  <!-- Content -->
</div>
```

**Effort:** 3-5 days
**Impact:** Medium-High (enhances mobile UX significantly)

#### Phase 3: Advanced Features (Future Enhancements)

**1. Migrate to Shadcn-Svelte Drawer (Optional)**

If you want to leverage a battle-tested library:

```bash
npx shadcn-svelte@latest add drawer
```

Replace existing Modal components with Shadcn Drawer for bottom sheets, keeping Modal for desktop dialogs.

**2. Implement Context-Aware Behavior**

```svelte
<script lang="ts">
  import { browser } from '$app/environment';

  let isMobile = $derived(
    browser && window.matchMedia('(max-width: 640px)').matches
  );

  let isTouch = $derived(
    browser && ('ontouchstart' in window || navigator.maxTouchPoints > 0)
  );
</script>

{#if isMobile && isTouch}
  <!-- Mobile bottom sheet with touch gestures -->
  <BottomSheet />
{:else}
  <!-- Desktop modal with click interactions -->
  <Modal />
{/if}
```

**3. Platform-Specific Optimizations**

```typescript
// lib/utils/platform.ts
export function getPlatform() {
  if (typeof window === 'undefined') return 'server';

  const ua = navigator.userAgent;

  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function getSafeAreaInsets() {
  if (typeof window === 'undefined') return { top: 0, bottom: 0, left: 0, right: 0 };

  const style = getComputedStyle(document.documentElement);

  return {
    top: parseInt(style.getPropertyValue('--safe-area-inset-top') || '0'),
    bottom: parseInt(style.getPropertyValue('--safe-area-inset-bottom') || '0'),
    left: parseInt(style.getPropertyValue('--safe-area-inset-left') || '0'),
    right: parseInt(style.getPropertyValue('--safe-area-inset-right') || '0'),
  };
}
```

**4. Performance Monitoring**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let animationDuration = $state(0);

  onMount(() => {
    const startTime = performance.now();

    // Trigger modal animation
    showModal();

    requestAnimationFrame(() => {
      animationDuration = performance.now() - startTime;

      // Log if animation is slow (> 16ms for 60fps)
      if (animationDuration > 16) {
        console.warn(`Modal animation took ${animationDuration}ms (target: <16ms)`);
      }
    });
  });
</script>
```

**Effort:** 5-7 days
**Impact:** Medium (polish and optimization)

### Recommended Implementation Priority

**Immediate (Sprint 1):**
1. ✅ Add drag handle to mobile modals
2. ✅ Expand responsive breakpoints
3. ✅ Optimize mobile form inputs
4. ✅ Review dismissal mechanisms

**Short-term (Sprint 2-3):**
5. ✅ Implement pull-to-close gesture
6. ✅ Add snap points for expandable sheets
7. ✅ Enhance keyboard handling for mobile forms

**Future (Backlog):**
8. Consider migration to Shadcn-Svelte Drawer
9. Add platform-specific optimizations
10. Implement performance monitoring

### Testing Checklist

**Mobile Testing (Required):**
- [ ] Test on real iPhone device (Safari)
- [ ] Test on real Android device (Chrome)
- [ ] Test with virtual keyboard open
- [ ] Test with different screen orientations
- [ ] Test with iOS safe areas (iPhone X+)
- [ ] Test with Android back gesture
- [ ] Test touch gesture responsiveness

**Accessibility Testing (Required):**
- [ ] Keyboard navigation (Tab, Shift+Tab, Escape)
- [ ] Screen reader (VoiceOver on iOS, TalkBack on Android)
- [ ] Touch target sizes (minimum 44x44px)
- [ ] Focus indicators visible
- [ ] ARIA labels present and descriptive
- [ ] Color contrast meets WCAG AA

**Cross-Browser Testing:**
- [ ] Safari (iOS and macOS)
- [ ] Chrome (Android and desktop)
- [ ] Firefox (desktop)
- [ ] Edge (desktop)

**Performance Testing:**
- [ ] Animation runs at 60fps on low-end devices
- [ ] No layout thrashing during gestures
- [ ] Memory usage within acceptable limits
- [ ] Battery drain acceptable on mobile

---

## Conclusion

Modern mobile modal and bottom sheet UX in 2025 represents a convergence of sophisticated interaction patterns, comprehensive accessibility requirements, and platform-specific considerations. The research reveals several key insights:

1. **Bottom sheets are the dominant pattern** for mobile overlays, largely replacing full-screen modals for most use cases

2. **Touch gestures are now expected** standard behavior, with swipe-to-dismiss and pull-to-close being the most prevalent patterns

3. **Accessibility is non-negotiable**, with elevated requirements for touch targets (44-48px), keyboard navigation, and screen reader support

4. **Platform-specific optimizations** for iOS and Android are critical for native-feeling experiences

5. **Progressive enhancement** remains the best strategy for resilient, mobile-first form experiences

6. **Responsive design requires nuance** beyond standard breakpoints, with content-driven breakpoints and adaptive behavior

7. **Libraries like Shadcn-Svelte** provide excellent foundations but may need custom gesture implementations for advanced interactions

For BuildOS specifically, the recommendation is to enhance existing Modal/FormModal components with:
- Drag handles for better mobile affordances
- Expanded responsive breakpoints (beyond 640px)
- Touch gesture support (pull-to-close)
- Optimized mobile form inputs (types, keyboard handling)
- Platform-specific optimizations (iOS safe areas, Android back gesture)

This research provides a comprehensive foundation for implementing world-class mobile modal and bottom sheet experiences that feel native, accessible, and performant across all devices and user capabilities.

---

## References and Further Reading

### Industry Standards and Guidelines

1. **Material Design 3 - Bottom Sheets**: https://m3.material.io/components/bottom-sheets
2. **Apple Human Interface Guidelines - Sheets**: https://developer.apple.com/design/human-interface-guidelines/sheets
3. **WCAG 2.5.5 - Target Size**: https://www.w3.org/WAI/WCAG21/Understanding/target-size.html
4. **Nielsen Norman Group - Bottom Sheets**: https://www.nngroup.com/articles/bottom-sheet/
5. **Nielsen Norman Group - Accidental Overlay Dismissal**: https://www.nngroup.com/articles/accidental-overlay-dismissal/

### Technical Documentation

6. **Shadcn-Svelte Documentation**: https://www.shadcn-svelte.com/
7. **Bits UI - Dialog**: https://www.bits-ui.com/docs/components/dialog
8. **Radix UI - Dialog**: https://www.radix-ui.com/primitives/docs/components/dialog
9. **Vaul - React Drawer**: https://github.com/emilkowalski/vaul
10. **Tailwind CSS - Responsive Design**: https://tailwindcss.com/docs/responsive-design

### Performance and Animation

11. **MDN - CSS Performance**: https://developer.mozilla.org/en-US/docs/Web/Performance/Guides/CSS_JavaScript_animation_performance
12. **Web.dev - Animations Guide**: https://web.dev/articles/animations-guide
13. **Web.dev - Responsive Web Design Basics**: https://web.dev/articles/responsive-web-design-basics

### Accessibility Resources

14. **Atomica11y - Accessible Dialogs**: https://www.atomica11y.com/accessible-web/dialog-modal/
15. **Smashing Magazine - Accessible Tap Target Sizes**: https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/
16. **A11y Project - Modal Dialog**: https://www.a11yproject.com/posts/how-to-accessible-modal-dialogs/

### Form UX

17. **Design Studio UX - Form Design Best Practices**: https://www.designstudiouiux.com/blog/form-ux-design-best-practices/
18. **SvelteKit - Form Actions**: https://kit.svelte.dev/docs/form-actions
19. **Criztec - SvelteKit Developers Guide**: https://criztec.com/sveltekit-complete-developers-guide-2025

### Platform-Specific

20. **Apple - iPhone Gestures**: https://support.apple.com/guide/iphone/gestures-iph77bcdd132/ios
21. **Android - Gesture Navigation**: https://developer.android.com/develop/ui/views/touch-and-input/gestures/navigation
22. **BrowserStack - Mobile Testing Guide**: https://www.browserstack.com/guide/mobile-testing

---

**Document Metadata:**
- Research Date: 2025-11-21
- Author: Claude Code
- Context: BuildOS Platform Mobile UX Optimization
- Related Issues: Modal/Form Modal enhancement, Mobile-first design
- Next Steps: Review with team, prioritize enhancements, begin Phase 1 implementation
