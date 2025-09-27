# Build OS Design System Guide

## 🎨 Design Philosophy

Our design system follows Apple-inspired principles with subtle gradients, refined typography, and thoughtful use of space. The aesthetic combines modern glassmorphism with clean, functional interfaces that feel premium yet approachable.

### Core Principles

1. **Clarity**: Information hierarchy through size, weight, and color
2. **Deference**: Content comes first, UI supports it
3. **Depth**: Subtle shadows and layers create spatial relationships
4. **Consistency**: Unified patterns across all components
5. **Delight**: Smooth animations and thoughtful micro-interactions

---

## 🎨 Color System

### Semantic Colors

#### Primary Actions & Information

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

#### Success & Creation

```scss
// Emerald/Green - Success, creation, positive actions
emerald-50:  #ecfdf5
emerald-100: #d1fae5
emerald-500: #10b981
emerald-600: #059669
green-50:  #f0fdf4
green-500: #22c55e
green-600: #16a34a
```

#### Warnings & Attention

```scss
// Amber/Orange - Warnings, attention, medium priority
amber-50:  #fffbeb
amber-100: #fef3c7
amber-500: #f59e0b
amber-600: #d97706
orange-50:  #fff7ed
orange-500: #f97316
orange-600: #ea580c
```

#### Errors & Deletions

```scss
// Rose/Red - Errors, deletions, high priority
rose-50:  #fff1f2
rose-100: #ffe4e6
rose-500: #f43f5e
rose-600: #e11d48
red-500: #ef4444
red-600: #dc2626
```

#### Neutrals

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

---

## 📐 Spacing System

### Base Scale

```scss
0:   0px
0.5: 2px   // Micro adjustments
1:   4px   // Tightest spacing
1.5: 6px   // Icon padding
2:   8px   // Compact spacing
2.5: 10px
3:   12px  // Standard small spacing
4:   16px  // Standard spacing
5:   20px
6:   24px  // Section spacing
8:   32px  // Large spacing
10:  40px
12:  48px  // Extra large spacing
16:  64px  // Page sections
```

### Component Spacing Patterns

- **Card Padding**: `p-4` (16px) mobile, `p-5` (20px) tablet, `p-6` (24px) desktop
- **Section Gaps**: `gap-4` (16px) mobile, `gap-6` (24px) desktop
- **Form Fields**: `space-y-4` (16px) between fields
- **Inline Elements**: `gap-2` (8px) for icons and text

---

## 🔤 Typography System

### Font Families

```scss
font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
font-mono: ui-monospace, SFMono-Regular, "SF Mono", Consolas, monospace
```

### Type Scale

```scss
text-xs:   0.75rem  // 12px - Badges, captions
text-sm:   0.875rem // 14px - Secondary text, labels
text-base: 1rem     // 16px - Body text
text-lg:   1.125rem // 18px - Emphasized body
text-xl:   1.25rem  // 20px - Section headings
text-2xl:  1.5rem   // 24px - Page headings
text-3xl:  1.875rem // 30px - Hero headings
text-4xl:  2.25rem  // 36px - Display headings
text-5xl:  3rem     // 48px - Large display
```

### Font Weights

```scss
font-normal:   400  // Body text
font-medium:   500  // Emphasized body, buttons
font-semibold: 600  // Headings, important labels
font-bold:     700  // Hero headings, CTAs
```

### Text Colors by Context

- **Headings**: `text-gray-900 dark:text-white`
- **Body Text**: `text-gray-700 dark:text-gray-300`
- **Secondary**: `text-gray-600 dark:text-gray-400`
- **Muted**: `text-gray-500 dark:text-gray-500`
- **Links**: `text-blue-600 hover:text-blue-700 dark:text-blue-400`

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

## 🎭 Component Patterns

### Cards

```jsx
// Base Card
<div class="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-lg transition-all duration-300">
	// Card Header with Gradient
	<div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gradient-to-r from-blue-50/50 to-indigo-50/50 dark:from-blue-900/10 dark:to-indigo-900/10 rounded-t-xl">
		<div class="flex items-center gap-2">
			<div class="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
				<Icon class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
			</div>
			<h4 class="text-sm font-semibold text-gray-900 dark:text-white">Card Title</h4>
		</div>
	</div>
	// Card Body
	<div class="p-4">// Content</div>
</div>
```

### Buttons

```jsx
// Primary Button with Gradient
<button class="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all">
  Primary Action
</button>

// Secondary Button
<button class="px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium transition-all">
  Secondary Action
</button>

// Ghost Button
<button class="px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-xl font-medium transition-all">
  Ghost Action
</button>

// Danger Button
<button class="px-4 py-2 bg-gradient-to-r from-rose-500 to-red-600 hover:from-rose-600 hover:to-red-700 text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all">
  Delete
</button>
```

### Form Fields

```jsx
// Input with Gradient Background
<input class="w-full px-3 py-2 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />

// Select with Status Color
<select class="w-full px-3 py-2 bg-gradient-to-br from-blue-50/30 to-indigo-50/30 dark:from-blue-900/10 dark:to-indigo-900/10 border border-gray-200 dark:border-gray-700 rounded-lg">
  <option>Option 1</option>
</select>

// Textarea
<textarea class="w-full px-3 py-2 bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg resize-none focus:ring-2 focus:ring-blue-500" />
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

### Modals

```jsx
// Modal Container
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
	<div class="w-full max-w-4xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl">
		// Modal Header
		<div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
			<div class="text-center">
				<div class="inline-flex items-center gap-2 mb-2">
					<div class="p-2 bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 rounded-xl">
						<Icon class="w-5 h-5 text-blue-600 dark:text-blue-400" />
					</div>
					<h2 class="text-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
						Modal Title
					</h2>
				</div>
				<p class="text-sm text-gray-600 dark:text-gray-400">Subtitle text</p>
			</div>
		</div>
		// Modal Body
		<div class="px-6 py-6">// Content</div>
		// Modal Footer
		<div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
			// Actions
		</div>
	</div>
</div>
```

---

## 🎬 Animations & Transitions

### Transition Classes

```scss
transition-all      // All properties
transition-colors   // Color changes only
transition-shadow   // Shadow changes
transition-transform // Transform changes

duration-150  // Fast (hover states)
duration-300  // Standard
duration-500  // Smooth
duration-700  // Emphasis

ease-in-out  // Standard easing
ease-out     // Decelerate (enter animations)
ease-in      // Accelerate (exit animations)
cubic-bezier(0.4, 0, 0.2, 1) // Custom smooth
```

### Animation Patterns

```scss
// Hover Effects
hover:shadow-lg      // Lift on hover
hover:scale-105      // Subtle grow
hover:-translate-y-1 // Slight rise

// Loading States
animate-spin   // Spinning loader
animate-pulse  // Skeleton screens
animate-bounce // Attention

// Entrance Animations (with Svelte)
in:fly={{ y: 20, duration: 300, delay: 50, easing: cubicOut }}
in:fade={{ duration: 300 }}
in:scale={{ duration: 200, start: 0.95 }}
transition:slide={{ duration: 300 }}
```

---

## 🌓 Dark Mode

### Color Mappings

```scss
// Backgrounds
bg-white           → dark:bg-gray-800
bg-gray-50         → dark:bg-gray-900
bg-gray-100        → dark:bg-gray-800

// Text
text-gray-900      → dark:text-white
text-gray-700      → dark:text-gray-300
text-gray-600      → dark:text-gray-400
text-gray-500      → dark:text-gray-500

// Borders
border-gray-200    → dark:border-gray-700
border-gray-300    → dark:border-gray-600

// Gradients (reduce opacity in dark mode)
from-blue-50/50    → dark:from-blue-900/10
to-indigo-50/50    → dark:to-indigo-900/10
```

---

## 📱 Responsive Design

### Breakpoints

```scss
sm: 640px   // Tablet portrait
md: 768px   // Tablet landscape
lg: 1024px  // Desktop
xl: 1280px  // Large desktop
2xl: 1536px // Extra large
```

### Mobile-First Patterns

```jsx
// Text sizing
class="text-sm sm:text-base lg:text-lg"

// Padding
class="p-4 sm:p-5 lg:p-6"

// Grid columns
class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"

// Flex direction
class="flex flex-col sm:flex-row"

// Display
class="hidden sm:block"
class="sm:hidden" // Mobile only
```

---

## 🎯 Usage Guidelines

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

### Accessibility

- **Contrast Ratios**: Minimum 4.5:1 for body text, 3:1 for large text
- **Focus States**: Always visible with ring-2 ring-blue-500
- **Touch Targets**: Minimum 44px on mobile
- **Color Blind**: Don't rely on color alone, use icons and text

### Performance

- **Transitions**: Keep under 300ms for responsiveness
- **Shadows**: Use sparingly, prefer border for definition
- **Gradients**: Use CSS gradients, not images
- **Animations**: Respect prefers-reduced-motion

---

## 🔧 Implementation

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

### Component Library Structure

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

---

## 📋 Quick Reference

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

### Color Status Mapping

- **Blue/Indigo**: Information, in progress, primary actions
- **Emerald/Green**: Success, completed, positive
- **Amber/Orange**: Warning, attention needed
- **Rose/Red**: Error, danger, deletion
- **Purple**: Special, premium, recurring
- **Gray**: Neutral, disabled, secondary

This design system ensures consistency across the Build OS application while maintaining flexibility for unique component needs. Follow these patterns to create cohesive, beautiful interfaces that users will love.
