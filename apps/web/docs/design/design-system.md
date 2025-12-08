---
title: 'BuildOS Design System (Legacy)'
description: 'DEPRECATED - See Inkprint Design System for current design patterns'
date_created: '2025-09-26'
date_modified: '2025-12-08'
status: 'deprecated'
category: 'design-system'
tags: [design-system, style-guide, legacy, deprecated]
related_files:
    - apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
---

# BuildOS Design System (Legacy)

> # ⚠️ DEPRECATED - DO NOT USE FOR NEW DEVELOPMENT
>
> **This design system has been superseded by the Inkprint Design System (December 2025).**
>
> **New Primary Reference:** [`/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`](/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md)
>
> This document describes the **previous** "Apple-inspired" design system and is retained for historical reference only.
>
> **Do NOT use these patterns for new development:**
>
> - ❌ Gradient buttons (`from-blue-50 to-purple-50`)
> - ❌ Hardcoded colors (`text-gray-700`, `bg-slate-100`)
> - ❌ The color palette and design tokens described below
>
> **Instead, use Inkprint patterns:**
>
> - Semantic tokens: `bg-card`, `text-foreground`, `border-border`
> - Inkprint shadows: `shadow-ink`, `shadow-ink-strong`
> - Texture classes: `tx tx-frame tx-weak`, `tx tx-grain tx-weak`

---

## Historical Documentation (Below)

> A comprehensive design system for BuildOS - High-end Apple-inspired design with ADHD-optimized UX

## Design Philosophy (Legacy)

BuildOS follows a **premium Apple-inspired aesthetic** with subtle gradients, generous whitespace, and smooth animations. The design prioritizes clarity, focus, and reduced cognitive load for ADHD users while maintaining a sophisticated, modern appearance.

### Core Principles

1. **Clarity First**: Every element should have a clear purpose and visual hierarchy
2. **Users First**: Prioritize user needs, workflows, and ease of use in every design decision
3. **Subtle Sophistication**: Use gradients and shadows sparingly but effectively
4. **Consistent Motion**: Smooth, predictable animations that don't distract
5. **Accessible by Default**: All components meet WCAG AA standards
6. **Progressive Disclosure**: Complex information revealed gradually
7. **Speed & Performance**: Design for fast load times and snappy, responsive interactions
8. **Delight**: Smooth animations and thoughtful micro-interactions

### Design Approach for Development

When styling pages or components, act as a high-end Apple designer creating simple and elegant interfaces:

#### Maintain Proper Spacing and Layout

- Use consistent margins and paddings
- Maintain proper layout hierarchy

#### Ensure Color Consistency

- Use the branded colors defined in this guide
- Follow the semantic color system

#### Smooth Transitions

- Transitions between screens and components should be buttery smooth
- Don't make big changes unless needed - if a big change is required, discuss it first

### Tailwind-First Implementation Update (Nov 2025)

- Favor Tailwind utilities for layout shells (`flex min-h-screen min-h-[100dvh] flex-col`, `max-w-[1200px] px-4 sm:px-6 lg:px-8`) and reserve bespoke CSS for component-level nuance
- The legacy `.pulse` / `.pulse-mobile` helpers are retired; use the shared `animate-pulse-accent` animation from `tailwind.config.js`
- Keep shared rules inside `app.css` under `@layer components` or `@layer utilities` so unused selectors are tree-shaken
- Apply safe-area padding inline on the root container instead of shipping cap-wide padding utilities
- Extend Tailwind keyframes for bespoke motion (see `pulseAccent`) rather than scattering `<style>` blocks through components

---

## Color System

### Brand Colors

#### Primary Palette (Blue to Purple Gradient)

```scss
// Core brand gradient
$gradient-primary: from-blue-600 to-purple-600;
$gradient-primary-hover: from-blue-700 to-purple-700;

// Light variants
$gradient-primary-light: from-blue-50 to-purple-50;
$gradient-primary-subtle: from-blue-50/50 to-purple-50/50;

// Dark mode
$gradient-primary-dark: from-blue-950/30 to-purple-950/30;
```

**Usage**: Primary actions, key CTAs, brand elements

#### Semantic Colors

##### Primary Actions & Information (Blues)

```scss
// Blues - Primary actions, links, information
blue-50:  #eff6ff  // Lightest backgrounds
blue-100: #dbeafe  // Light backgrounds
blue-200: #bfdbfe  // Borders, subtle elements
blue-500: #3b82f6  // Primary buttons, links
blue-600: #2563eb  // Hover states
blue-900: #1e3a8a  // Dark mode accents

// Indigo - Secondary information, complementary to blue
indigo-50:  #eef2ff
indigo-100: #e0e7ff
indigo-500: #6366f1
indigo-600: #4f46e5
```

##### Success (Green/Emerald)

```scss
$success-gradient: from-emerald-50 to-green-50;
$success-text: text-emerald-700;
$success-border: border-emerald-200;
$success-dark: from-emerald-900/20 to-green-900/20;

// Color values
emerald-50:  #ecfdf5
emerald-100: #d1fae5
emerald-500: #10b981
emerald-600: #059669
green-50:  #f0fdf4
green-500: #22c55e
green-600: #16a34a
```

##### Warning (Amber/Orange)

```scss
$warning-gradient: from-amber-50 to-yellow-50;
$warning-text: text-amber-700;
$warning-border: border-amber-200;
$warning-dark: from-amber-900/20 to-yellow-900/20;

// Color values
amber-50:  #fffbeb
amber-100: #fef3c7
amber-500: #f59e0b
amber-600: #d97706
orange-50:  #fff7ed
orange-500: #f97316
orange-600: #ea580c
```

##### Error (Red/Rose)

```scss
$error-gradient: from-rose-50 to-red-50;
$error-text: text-rose-700;
$error-border: border-rose-200;
$error-dark: from-rose-900/20 to-red-900/20;

// Color values
rose-50:  #fff1f2
rose-100: #ffe4e6
rose-500: #f43f5e
rose-600: #e11d48
red-500: #ef4444
red-600: #dc2626
```

##### Info (Blue/Indigo)

```scss
$info-gradient: from-blue-50 to-indigo-50;
$info-text: text-blue-700;
$info-border: border-blue-200;
$info-dark: from-blue-900/20 to-indigo-900/20;
```

### Text Colors

#### Light Mode

```scss
$text-primary: text-gray-900; // Headings, important content
$text-secondary: text-gray-700; // Body text
$text-tertiary: text-gray-600; // Descriptions
$text-muted: text-gray-500; // Labels, metadata
$text-subtle: text-gray-400; // Disabled, hints
```

#### Dark Mode

```scss
$text-primary-dark: text-white;
$text-secondary-dark: text-gray-300;
$text-tertiary-dark: text-gray-400;
$text-muted-dark: text-gray-500;
$text-subtle-dark: text-gray-600;
```

### Neutrals

```scss
// Gray - Text, borders, backgrounds
gray-50:  #f9fafb  // Lightest background
gray-100: #f3f4f6  // Light background
gray-200: #e5e7eb  // Borders
gray-300: #d1d5db  // Disabled borders
gray-400: #9ca3af  // Placeholder text
gray-500: #6b7280  // Secondary text
gray-600: #4b5563  // Primary text (light mode)
gray-700: #374151  // Headings (light mode)
gray-800: #1f2937  // Dark backgrounds
gray-900: #111827  // Darkest elements
```

### Gradient Patterns

#### Status Gradients

```scss
// For card headers and status indicators
.gradient-blue {
	background: linear-gradient(to right, from-blue-50/50 to-indigo-50/50);
}
.gradient-emerald {
	background: linear-gradient(to right, from-emerald-50/50 to-green-50/50);
}
.gradient-amber {
	background: linear-gradient(to right, from-amber-50/50 to-orange-50/50);
}
.gradient-rose {
	background: linear-gradient(to right, from-rose-50/50 to-red-50/50);
}
.gradient-purple {
	background: linear-gradient(to right, from-purple-50/50 to-indigo-50/50);
}
```

#### Text Gradients

```scss
// For headings and important text
.text-gradient-blue {
	background: linear-gradient(to right, #2563eb, #4f46e5);
	-webkit-background-clip: text;
}
.text-gradient-emerald {
	background: linear-gradient(to right, #059669, #16a34a);
	-webkit-background-clip: text;
}
.text-gradient-rose {
	background: linear-gradient(to right, #e11d48, #dc2626);
	-webkit-background-clip: text;
}
```

### Color Status Mapping

- **Blue/Indigo**: Information, in progress, primary actions
- **Emerald/Green**: Success, completed, positive
- **Amber/Orange**: Warning, attention needed
- **Rose/Red**: Error, danger, deletion
- **Purple**: Special, premium, recurring
- **Gray**: Neutral, disabled, secondary

### Implementation Rules

- **Always** provide dark mode variants using `dark:` prefix
- **Use gradients** for primary actions and key visual elements
- **Use solid colors** for secondary elements and data displays
- **Maintain 4.5:1 contrast ratio** for all text

---

## Typography

### Font Stack

```css
font-family:
	-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui,
	sans-serif;
```

Alternative specification:

```scss
font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
font-mono: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace
```

### Type Scale

#### Display (Heroes & Landing Pages)

```scss
.text-display-1 {
	@apply text-6xl font-bold leading-tight;
} // 56px
.text-display-2 {
	@apply text-5xl font-bold leading-tight;
} // 48px - Standard hero size
.text-display-3 {
	@apply text-4xl font-bold;
} // 36px
```

#### Headings

```scss
.heading-1 {
	@apply text-3xl font-bold;
} // 30px - Page titles
.heading-2 {
	@apply text-2xl font-bold;
} // 24px - Section headers
.heading-3 {
	@apply text-xl font-semibold;
} // 20px - Subsections
.heading-4 {
	@apply text-lg font-semibold;
} // 18px - Card titles
.heading-5 {
	@apply text-base font-medium;
} // 16px - Minor headings
```

#### Body Text

```scss
.body-large {
	@apply text-lg;
} // 18px - Prominent body text
.body-base {
	@apply text-base;
} // 16px - Default body text
.body-small {
	@apply text-sm;
} // 14px - Secondary text
.caption {
	@apply text-xs;
} // 12px - Labels, metadata
```

### Font Weights

- **Bold (700)**: Primary headings, CTAs
- **Semibold (600)**: Secondary headings, emphasis
- **Medium (500)**: Labels, subtle emphasis
- **Normal (400)**: Body text

### Usage Guidelines

- **Limit font sizes** per page: Maximum 4 different sizes
- **Consistent hierarchy**: Never skip heading levels
- **Line height**: Use `leading-relaxed` for body text
- **Letter spacing**: Use `tracking-tight` only for display text

### Letter Spacing

```scss
tracking-tighter: -0.05em  // Dense headings
tracking-tight:   -0.025em // Headings
tracking-normal:  0        // Body text
tracking-wide:    0.025em  // Buttons
tracking-wider:   0.05em   // Labels, badges
tracking-widest:  0.1em    // Uppercase labels
```

---

## Spacing System

### Base Unit

Our spacing system is based on an 8px grid with half-steps where needed.

### Spacing Scale

```scss
0:   0px
0.5: 2px   // Micro adjustments
1:   4px   // Tightest spacing
1.5: 6px   // Icon padding
2:   8px   // Compact spacing
2.5: 10px
3:   12px  // Standard small spacing
4:   16px  // Standard spacing - Base unit
5:   20px
6:   24px  // Section spacing
8:   32px  // Large spacing
10:  40px
12:  48px  // Extra large spacing
16:  64px  // Page sections
20:  80px
```

### Component Spacing Patterns

#### Padding Standards

```scss
// Buttons
.btn-sm {
	@apply px-3 py-2;
} // 12px / 8px
.btn-md {
	@apply px-4 py-2.5;
} // 16px / 10px
.btn-lg {
	@apply px-6 py-3;
} // 24px / 12px

// Cards
.card {
	@apply p-4 sm:p-6 lg:p-8;
} // Responsive padding

// Sections
.section {
	@apply py-20 px-4 sm:px-6 lg:px-8;
}
```

#### Margin Patterns

```scss
// Text hierarchy
.mb-text-xs {
	@apply mb-2;
} // 8px - Small elements
.mb-text-sm {
	@apply mb-4;
} // 16px - Paragraphs
.mb-text-md {
	@apply mb-6;
} // 24px - Section headers
.mb-text-lg {
	@apply mb-8;
} // 32px - Major sections
```

#### Gap Utilities

```scss
// Flex/Grid gaps
.gap-tight {
	@apply gap-2;
} // 8px
.gap-base {
	@apply gap-4;
} // 16px - Default
.gap-loose {
	@apply gap-6;
} // 24px
.gap-extra {
	@apply gap-8;
} // 32px
```

---

## Layout System

### Container Widths

```scss
.container-xs {
	@apply max-w-md mx-auto;
} // 448px - Forms, modals
.container-sm {
	@apply max-w-2xl mx-auto;
} // 672px - Articles
.container-md {
	@apply max-w-3xl mx-auto;
} // 768px - Content
.container-lg {
	@apply max-w-4xl mx-auto;
} // 896px - Wide content
.container-xl {
	@apply max-w-6xl mx-auto;
} // 1152px - Main layouts
.container-2xl {
	@apply max-w-7xl mx-auto;
} // 1280px - Full width
```

### Responsive Breakpoints

```scss
$breakpoint-sm: 640px; // Mobile landscape / Tablet portrait
$breakpoint-md: 768px; // Tablet landscape
$breakpoint-lg: 1024px; // Desktop
$breakpoint-xl: 1280px; // Large desktop
$breakpoint-2xl: 1536px; // Extra large
```

### Grid System

```scss
// Responsive grid patterns
.grid-responsive-2 {
	@apply grid grid-cols-1 md:grid-cols-2 gap-6;
}
.grid-responsive-3 {
	@apply grid grid-cols-1 md:grid-cols-3 gap-6;
}
.grid-responsive-4 {
	@apply grid grid-cols-2 lg:grid-cols-4 gap-6;
}
```

### Standard Layout Pattern

```html
<section class="py-20 px-4 sm:px-6 lg:px-8">
	<div class="max-w-6xl mx-auto">
		<!-- Content -->
	</div>
</section>
```

---

## Components

### Buttons

#### Variants

```scss
// Primary - Gradient with solid border
.btn-primary {
	@apply bg-gradient-to-r from-blue-50 to-purple-50
         text-blue-700 border-2 border-blue-600
         hover:from-blue-100 hover:to-purple-100
         hover:border-purple-600 hover:text-purple-700;
}

// Alternative: Solid gradient for high-emphasis actions
.btn-primary-solid {
	@apply bg-gradient-to-r from-blue-600 to-indigo-600
         hover:from-blue-700 hover:to-indigo-700
         text-white rounded-xl font-semibold
         shadow-md hover:shadow-lg transition-all;
}

// Secondary - Subtle gradient
.btn-secondary {
	@apply bg-gradient-to-r from-indigo-50 to-cyan-50
         text-indigo-700 border-2 border-indigo-400;
}

// Alternative: Solid secondary
.btn-secondary-solid {
	@apply bg-gray-100 dark:bg-gray-800
         hover:bg-gray-200 dark:hover:bg-gray-700
         text-gray-700 dark:text-gray-300
         rounded-xl font-medium transition-all;
}

// Ghost - Minimal style
.btn-ghost {
	@apply bg-transparent text-gray-700
         hover:bg-gradient-to-br hover:from-gray-50 hover:to-slate-50;
}

// Alternative: Simple ghost
.btn-ghost-simple {
	@apply hover:bg-gray-100 dark:hover:bg-gray-800
         text-gray-600 dark:text-gray-400
         rounded-xl font-medium transition-all;
}

// Danger - Destructive actions
.btn-danger {
	@apply bg-gradient-to-r from-rose-500 to-red-600
         hover:from-rose-600 hover:to-red-700
         text-white rounded-xl font-semibold
         shadow-md hover:shadow-lg transition-all;
}
```

**Decision**: Use gradient buttons for primary actions, solid for secondary

### Cards

#### Standard Card

```scss
.card {
	@apply bg-white dark:bg-gray-800
         rounded-xl p-6
         shadow-md hover:shadow-lg
         transition-all duration-300;
}
```

#### Interactive Card

```scss
.card-interactive {
	@apply card hover:scale-105 cursor-pointer;
}
```

#### Status Card (with gradient)

```scss
.card-processing {
	@apply bg-gradient-to-br from-blue-50 to-purple-50
         dark:from-blue-900/20 dark:to-purple-900/20;
}
```

#### Card with Gradient Header

```jsx
// Card Header with Gradient
<div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-t-xl">
	<div class="flex items-center gap-2">
		<div class="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
			<Icon class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
		</div>
		<h4 class="text-sm font-semibold text-gray-900 dark:text-white">Card Title</h4>
	</div>
</div>
```

**Decision**: Gradients for active/processing states only

### Modals

#### Size Classes

```scss
.modal-sm {
	@apply max-w-md;
} // 448px
.modal-md {
	@apply max-w-2xl;
} // 672px - Default
.modal-lg {
	@apply max-w-4xl;
} // 896px
.modal-xl {
	@apply max-w-6xl;
} // 1152px
```

**Decision**: Modal sizes standardized to 4 sizes (sm, md, lg, xl)

See [Modal Standards](./components/modal-standards.md) for complete modal implementation patterns.

### Forms

#### Input Fields

```scss
.input {
	@apply w-full rounded-lg border border-gray-300
         px-4 py-2.5 text-base
         focus:outline-none focus:ring-2 focus:ring-purple-500
         dark:bg-gray-800 dark:border-gray-600;
}

// Alternative: Gradient background
.input-gradient {
	@apply w-full px-3 py-2
         bg-gradient-to-br from-white to-gray-50
         dark:from-gray-800 dark:to-gray-900
         border border-gray-200 dark:border-gray-700
         rounded-lg focus:ring-2 focus:ring-blue-500
         focus:border-transparent transition-all;
}
```

#### Field Groups

```html
<div class="form-field mb-6">
	<label class="block text-sm font-medium text-gray-700 mb-2">
		Label <span class="text-red-500">*</span>
	</label>
	<input class="input" />
	<p class="mt-2 text-sm text-gray-500">Help text</p>
</div>
```

### Badges

```jsx
// Status Badge
<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200/50 dark:border-blue-700/50">
  Active
</span>

// Count Badge
<span class="inline-flex items-center justify-center min-w-[20px] px-1.5 py-0.5 rounded-full text-xs font-semibold bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
  42
</span>

// Priority Badge with Gradient
<span class="inline-flex items-center px-3 py-1.5 bg-gradient-to-br from-rose-100 to-red-100 dark:from-rose-900/30 dark:to-red-900/30 text-rose-800 dark:text-rose-200 rounded-lg text-sm font-medium border border-rose-200 dark:border-rose-700">
  High Priority
</span>
```

---

## Visual Effects

### Border Radius

```scss
$radius-sm: 0.375rem; // 6px - Small elements
$radius-md: 0.5rem; // 8px - Default
$radius-lg: 0.75rem; // 12px - Cards, modals
$radius-xl: 1rem; // 16px - Large elements
$radius-full: 9999px; // Pills, badges
```

### Shadows

```scss
$shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
$shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1); // Default cards
$shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1); // Hover states
$shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1); // Modals

// Custom shadows
$shadow-soft: 0 2px 8px -2px rgba(0, 0, 0, 0.1);
$shadow-glow: 0 0 20px rgba(59, 130, 246, 0.5);
```

### Animations & Transitions

#### Transition Classes

```scss
transition-all      // All properties
transition-colors   // Color changes only
transition-shadow   // Shadow changes
transition-transform // Transform changes

duration-150  // Fast (hover states)
duration-200  // Quick micro-interactions
duration-300  // Standard transitions
duration-500  // Smooth
duration-700  // Emphasis

ease-in-out  // Standard easing
ease-out     // Decelerate (enter animations)
ease-in      // Accelerate (exit animations)
cubic-bezier(0.4, 0, 0.2, 1) // Custom smooth
```

#### Standard Transition

```scss
.transition-standard {
	@apply transition-all duration-300 ease-out;
}
```

#### Hover Patterns

```scss
// Hover Effects
.hover-lift {
	@apply hover:shadow-lg hover:-translate-y-1 transition-all duration-300;
}

.hover-scale {
	@apply hover:scale-105 transition-transform duration-200;
}

// Icon hover
.hover-icon {
	@apply group-hover:scale-110 transition-transform duration-200;
}
```

#### Loading States

```scss
// Spinner
.loading-spinner {
	@apply animate-spin;
}

// Skeleton
.skeleton {
	@apply animate-pulse bg-gray-200 dark:bg-gray-700 rounded;
}

// Pulse animation
animate-pulse  // Skeleton screens

// Bounce animation
animate-bounce // Attention
```

#### Purpose and Performance

- **Purposeful Micro-interactions**: Use subtle animations and visual feedback for user actions (hovers, clicks, form submissions, status changes)
    - Feedback should be immediate and clear
    - Animations should be quick (150-300ms) and use appropriate easing (e.g., ease-in-out)
- **Loading States**: Implement clear loading indicators (skeleton screens for page loads, spinners for in-component actions)
- **Transitions**: Use smooth transitions for state changes, modal appearances, and section expansions
- **Avoid Distraction**: Animations should enhance usability, not overwhelm or slow down the user
- **Keyboard Navigation**: Ensure all interactive elements are keyboard accessible and focus states are clear

---

## Dark Mode

### Implementation Rules

1. **Always provide dark variants** for every color
2. **Use opacity modifiers** for dark backgrounds: `/20`, `/30`, `/40`
3. **Invert gray scale** appropriately
4. **Test contrast ratios** in both modes

### Color Mappings

```scss
// Background
.bg-primary {
	@apply bg-white dark:bg-gray-900;
}

// Alternative backgrounds
bg-white           → dark:bg-gray-800
bg-gray-50         → dark:bg-gray-900
bg-gray-100        → dark:bg-gray-800

// Text
.text-primary {
	@apply text-gray-900 dark:text-white;
}

// Text mappings
text-gray-900      → dark:text-white
text-gray-700      → dark:text-gray-300
text-gray-600      → dark:text-gray-400
text-gray-500      → dark:text-gray-500

// Borders
.border-primary {
	@apply border-gray-200 dark:border-gray-700;
}

// Border mappings
border-gray-200    → dark:border-gray-700
border-gray-300    → dark:border-gray-600

// Gradients
.gradient-primary {
	@apply bg-gradient-to-r from-blue-50 to-purple-50
         dark:from-blue-950/30 dark:to-purple-950/30;
}

// Gradient mappings (reduce opacity in dark mode)
from-blue-50/50    → dark:from-blue-900/10
to-indigo-50/50    → dark:to-indigo-900/10
```

---

## Responsive Design

### Mobile-First Approach

Always design for mobile first, then enhance for larger screens.

### Common Responsive Patterns

#### Text Sizing

```html
<h1 class="text-2xl sm:text-3xl lg:text-4xl">Responsive Heading</h1>
```

#### Padding

```html
<div class="px-4 sm:px-6 lg:px-8">Responsive padding</div>
<div class="p-4 sm:p-5 lg:p-6">Responsive all-around padding</div>
```

#### Grid Layout

```html
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
	<!-- Grid items -->
</div>
```

#### Flex Direction

```html
<div class="flex flex-col sm:flex-row">
	<!-- Items -->
</div>
```

#### Show/Hide

```html
<div class="hidden sm:block">Desktop only</div>
<div class="sm:hidden">Mobile only</div>
```

---

## Accessibility

### Core Requirements

1. **Color Contrast**: Minimum 4.5:1 for normal text, 3:1 for large text
2. **Focus States**: Visible focus rings on all interactive elements
3. **Touch Targets**: Minimum 44x44px for all interactive elements
4. **Screen Readers**: Proper ARIA labels and roles
5. **Keyboard Navigation**: All features accessible via keyboard

### Focus Styles

```scss
.focus-ring {
	@apply focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2;
}
```

### ARIA Patterns

```html
<!-- Loading state -->
<div role="status" aria-live="polite">
	<span class="sr-only">Loading...</span>
</div>

<!-- Required field -->
<input aria-required="true" aria-describedby="field-error" />
```

---

## Implementation

### CSS Framework

- **Tailwind CSS** with custom configuration
- **CSS-in-JS** avoided for performance
- **PostCSS** for optimizations

### Tailwind Config Extensions

```javascript
// Add to tailwind.config.js
module.exports = {
	theme: {
		extend: {
			// Custom animations
			animation: {
				'slide-up': 'slideUp 0.3s ease-out',
				'slide-down': 'slideDown 0.3s ease-out',
				'fade-in': 'fadeIn 0.3s ease-out'
			},
			// Custom gradients as utilities
			backgroundImage: {
				'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
				'gradient-conic': 'conic-gradient(var(--tw-gradient-stops))'
			},
			// Custom shadows
			boxShadow: {
				soft: '0 2px 8px -2px rgba(0, 0, 0, 0.1)',
				glow: '0 0 20px rgba(59, 130, 246, 0.5)'
			}
		}
	}
};
```

### Performance Considerations

1. **Lazy load** heavy components
2. **Use CSS containment** for animations
3. **Optimize images** with progressive loading
4. **Minimize bundle size** with tree-shaking

### Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- iOS Safari 14+
- Chrome Android 90+

---

## Component Library Structure

```
components/
├── ui/              # Base UI components
│   ├── Button.svelte
│   ├── Card.svelte
│   ├── Modal.svelte
│   └── Form/
│       ├── Input.svelte
│       ├── Select.svelte
│       └── Textarea.svelte
├── patterns/        # Composite patterns
│   ├── TaskCard.svelte
│   ├── StatusBadge.svelte
│   └── GradientHeader.svelte
└── layouts/         # Layout components
    ├── PageHeader.svelte
    ├── SectionCard.svelte
    └── GridContainer.svelte
```

### When to Use Each Component

#### Button.svelte

- Primary actions (gradient style)
- Secondary actions (solid colors)
- Destructive actions (danger variant)
- Loading states with spinner

#### Modal.svelte

- Forms and data entry
- Confirmations
- Information display
- Complex workflows

#### Card Components

- Content grouping
- Interactive selections
- Status displays
- Data presentation

#### Form Components

- Consistent form layouts
- Validation feedback
- Accessible input groups
- Error handling

---

## Usage Guidelines

### When to Use Gradients

- **Headers**: Card headers, section titles
- **CTAs**: Primary buttons, important actions
- **Status**: Success/error states
- **Empty States**: Make them visually interesting

### When to Use Solid Colors

- **Body Text**: Always solid for readability
- **Form Fields**: Subtle or no gradients
- **Data Tables**: Keep simple and scannable
- **Small UI Elements**: Avoid gradient noise

---

## Migration Guide

When adapting existing or new components to this style guide:

1. **Audit current styling** against this guide
2. **Update color usage** to match semantic color system
3. **Standardize spacing** using the 8px grid
4. **Ensure dark mode** support
5. **Add proper transitions** for interactions
6. **Test accessibility** with screen readers
7. **Verify responsive behavior** across breakpoints

### Example Migration

```svelte
<!-- Before -->
<button class="bg-blue-500 px-2 py-1 text-white"> Click me </button>

<!-- After -->
<Button
	variant="primary"
	size="md"
	class="bg-gradient-to-r from-blue-50 to-purple-50
         text-blue-700 border-2 border-blue-600"
>
	Click me
</Button>
```

---

## Quick Reference

### Common Combinations

```scss
// Card with gradient header
.card-gradient-header {
	@apply bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300;

	.header {
		@apply px-4 py-3 border-b border-gray-100 dark:border-gray-700 rounded-t-xl;
		@apply bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10;
	}
}

// Primary button
.btn-primary {
	@apply px-5 py-2.5 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all;
	@apply bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white;
}

// Status badge
.badge-status {
	@apply inline-flex items-center px-2 py-1 rounded-full text-xs font-medium;
	@apply border border-opacity-50;
}
```

---

## Decision Log

### Resolved Decisions

1. **Gradient buttons** for primary actions only
2. **Solid backgrounds** for static content
3. **Gradient backgrounds** for processing/active states
4. **text-5xl** as standard hero size
5. **Modal sizes** standardized to 4 sizes (sm, md, lg, xl)

### Pending Decisions

- [ ] Icon size standardization (currently mixed 4x4 and 5x5)
- [ ] Toast notification positioning (top vs bottom)
- [ ] Form validation approach (inline vs summary)

---

## Version History

- **v1.0.0** (2025-09-26): Initial style guide creation based on existing patterns
- **v1.0.1** (2025-09-27): Updated Button.svelte color refinements for improved contrast
- **v1.1.0** (2025-10-05): Merged BUILDOS_STYLE_GUIDE.md, DESIGN_SYSTEM_GUIDE.md, and STYLING_BASE_PROMPT.md
- Analysis based on commit: main branch snapshot
- Last Updated: October 5, 2025

---

## Resources

- [Tailwind CSS Documentation](https://tailwindcss.com)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
