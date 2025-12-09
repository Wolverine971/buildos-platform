<!-- apps/web/docs/technical/components/modals/VISUAL_GUIDE.md -->

# Modal Components Visual Reference Guide

**Last Updated**: November 4, 2025
**Status**: Active Reference
**Category**: Component Documentation
**Location**: `/apps/web/docs/technical/components/modals/`

## Overview

Visual diagrams and architecture documentation for Modal and FormModal components, including layout structure, focus management flow, animations, and component hierarchy.

## Component Hierarchy

```
┌─ Modal.svelte (Base)
│  ├─ Portal action (renders outside DOM)
│  ├─ Backdrop (fixed inset-0)
│  ├─ Content container (centered, responsive)
│  │  ├─ Header slot
│  │  │  ├─ Title
│  │  │  └─ Close button [X]
│  │  ├─ Content slot (scrollable)
│  │  └─ Footer slot
│  │
│  ├─ Focus trap (keyboard navigation)
│  ├─ Escape key handler
│  └─ Animations (fade + scale/slide)
│
└─ FormModal.svelte (Extended)
   ├─ Modal.svelte wrapper
   ├─ Form handling
   │  ├─ Error display
   │  ├─ Field rendering
   │  ├─ Validation
   │  └─ Loading state
   └─ Action buttons
      ├─ Delete (optional)
      ├─ Cancel
      └─ Submit
```

---

## Modal Layout Diagram

### Desktop Layout (≥640px)

```
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║ ┌──────────────────────────────────────────────────────┐  ║
║ │ Title                                            [X] │  ║ Header
║ ├──────────────────────────────────────────────────────┤  ║
║ │                                                      │  ║
║ │  Modal Content (scrollable)                         │  ║ Content
║ │                                                      │  ║
║ ├──────────────────────────────────────────────────────┤  ║
║ │ [Delete]                  [Cancel]  [Submit Button] │  ║ Footer
║ └──────────────────────────────────────────────────────┘  ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
      Semi-transparent Backdrop (bg-black/50)
```

### Mobile Layout (<640px)

```
┌──────────────────────────┐
│   ╶─ Grab handle ─╴      │
│                          │
│  Modal Content           │ Slides up
│  (full width)            │ from bottom
│                          │
├──────────────────────────┤
│  [   Submit Button   ]   │
├──────────────────────────┤
│ [Cancel]  [Delete or ·]  │
└──────────────────────────┘
       Semi-transparent
          Backdrop
```

---

## FormModal Field Layout

Each field renders in a card-style container:

```
┌────────────────────────────────────────────────┐
│  [Icon] FIELD LABEL *                [Copy]   │ Card Header
├────────────────────────────────────────────────┤
│ Field description or placeholder text           │ Description
│                                                │
│ ┌──────────────────────────────────────────┐  │
│ │ User input or field content              │  │ Input
│ └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘

Legend:
  [Icon]     = Context-specific icon based on field name
  *          = Required indicator (red asterisk)
  [Copy]     = Optional copy button for textarea fields
  Card       = Gradient background (context-dependent)
```

### Field Type Icons

| Field Name/Type     | Icon     | Color  |
| ------------------- | -------- | ------ |
| `context`           | FileText | Green  |
| `executive_summary` | Sparkles | Purple |
| Date fields         | Calendar | Indigo |
| `tags`              | Tag      | Gray   |
| Number fields       | Hash     | Gray   |
| Default             | Type     | Gray   |

### Gradient Backgrounds

| Field               | Background            |
| ------------------- | --------------------- |
| `context`           | Green-50 → Emerald-50 |
| `executive_summary` | Purple-50 → Pink-50   |
| Date fields         | Indigo-50 → Blue-50   |
| Default             | White                 |
| Dark mode           | Gray-800              |

---

## Focus Management Flow

```
User Opens Modal
       ↓
Modal.svelte detects isOpen=true
       ↓
$effect triggers handleModalOpen()
       ↓
trapFocus() function executes
       ↓
1. Save current focused element
2. Find all focusable elements in modal
3. Focus first focusable element
4. Add Tab/Shift+Tab event listener
       ↓
User presses Tab at last element
       ↓
preventDefault()
Focus loops back to first element
       ↓
User closes modal
       ↓
focusTrapCleanup() removes listener
       ↓
restoreFocus() returns focus to opener
```

---

## Animation Sequence

### Mobile (<640px)

```
Time 0ms          Time 150ms

[Full screen]     [Full screen]
[with modal]      [with modal
 sliding up]       at rest]

Bottom: Y: 100%   Bottom: Y: 0%
Opacity: 0-100%   Opacity: 100%
```

### Desktop (≥640px)

```
Time 0ms          Time 150ms

Centered,         Centered,
Scale: 0.95       Scale: 1.0
Opacity: 0%       Opacity: 100%

Center origin
```

---

## Event Handling Priority

```
User Input
    │
    ├─ Escape pressed
    │  └─ Modal.handleKeydown()
    │     ├─ If closeOnEscape && !persistent
    │     │  └─ Call onClose()
    │     └─ preventDefault()
    │
    ├─ Tab pressed (in modal)
    │  └─ Modal.handleTabKey()
    │     ├─ If at last focusable element
    │     │  └─ Focus first element
    │     └─ preventDefault()
    │
    ├─ Backdrop clicked
    │  └─ Modal.handleBackdropClick()
    │     └─ If closeOnBackdrop && !persistent
    │        └─ Call onClose()
    │
    └─ Form submitted
       └─ FormModal.handleSubmit()
          ├─ Validate required fields
          ├─ Call onSubmit() with form data
          └─ On success: call onClose()
```

---

## FormModal Data Flow

```
┌─────────────────────────────────────┐
│      initialData (from parent)       │
└────────────┬────────────────────────┘
             │
             ├─ Deep clone (preserve Dates)
             │
             ↓
    ┌─────────────────────┐
    │  Local formData      │  $state
    │  (reactive copy)     │
    └────────┬────────────┘
             │
             ├─ User modifies form
             │
             ↓
    ┌─────────────────────┐
    │ User clicks Submit   │
    └────────┬────────────┘
             │
             ├─ Validate required fields
             │
             ├─ On error: show error banner
             │
             ├─ On valid: call onSubmit(formData)
             │
             ↓
    ┌─────────────────────┐
    │  API request        │  loading=true
    │  (async/await)      │
    └────────┬────────────┘
             │
             ├─ Success: call onClose()
             │           close modal
             │
             └─ Error: display error
                      loading=false
                      (form stays open)
```

---

## Size Comparison

```
sm (max-w-md)
├─ ~448px (28rem)
│
│  ┌──────────────────────────┐
│  │                          │
│  │  Small dialog box        │
│  │  Confirmations, etc      │
│  │                          │
│  └──────────────────────────┘
│

md (max-w-2xl) [DEFAULT]
├─ ~672px (42rem)
│
│  ┌─────────────────────────────────┐
│  │                                 │
│  │  Standard form modal             │
│  │  Most modals use this size       │
│  │                                 │
│  └─────────────────────────────────┘
│

lg (max-w-4xl)
├─ ~896px (56rem)
│
│  ┌──────────────────────────────────────────┐
│  │                                          │
│  │  Large modal                             │
│  │  Two-column layouts, detailed content    │
│  │                                          │
│  └──────────────────────────────────────────┘
│

xl (max-w-6xl)
├─ ~1152px (72rem)
│
│  ┌────────────────────────────────────────────────────┐
│  │                                                    │
│  │  Extra large modal                                │
│  │  Complex dashboards, tabbed interfaces            │
│  │                                                    │
│  └────────────────────────────────────────────────────┘
```

---

## Keyboard Navigation Map

```
MODAL OPEN
│
├─ Escape
│  └─ onClose() [if !persistent]
│
├─ Tab (from any element)
│  └─ Focus next focusable element in order:
│     button → input → textarea → select → link → ...
│     └─ At last element: wrap to first
│
├─ Shift + Tab
│  └─ Focus previous focusable element
│     └─ At first element: wrap to last
│
└─ Click Backdrop
   └─ onClose() [if closeOnBackdrop]
```

---

## Slot Rendering Order

### Modal.svelte

```
1. ┌─────────────────┐
   │    Portal div    │
   │   (z-[100])      │
   ├─────────────────┤
   │ 2. Backdrop      │
   │    (fixed inset) │
   ├─────────────────┤
   │ 3. Container    │
   │    (center)     │
   │  ┌────────────┐ │
   │  │4a. Header  │ │ ← Default or custom header slot
   │  ├────────────┤ │
   │  │4b. Content │ │ ← Default slot (scrollable)
   │  ├────────────┤ │
   │  │4c. Footer  │ │ ← Footer slot
   │  └────────────┘ │
   └─────────────────┘
```

### FormModal.svelte

```
1. Modal wraps form
   │
   ├─ Header slot (custom or FormModal default)
   │
   ├─ before-form slot
   │  (outside form tag)
   │
   ├─ <form>
   │  ├─ Error banner (if errors)
   │  ├─ Form fields (from formConfig)
   │  ├─ Default/after-form slots
   │  │
   │  └─ </form>
   │
   └─ Footer
      (auto-generated buttons)
```

---

## Error Display States

### No Errors

```
┌────────────────────────────────┐
│ Form content...                │
├────────────────────────────────┤
│ [Cancel] [Submit]              │
└────────────────────────────────┘
```

### With Errors

```
┌────────────────────────────────┐
│ ⚠ Field required                │ ← AlertCircle icon
│   Invalid email format          │    + error list
├────────────────────────────────┤
│ Form content...                │
├────────────────────────────────┤
│ [Cancel] [Submit]              │
└────────────────────────────────┘
```

---

## Mobile Button Layout Transformation

### Desktop (≥640px)

```
[Delete]  [Cancel]  [Submit]
```

### Mobile (<640px)

```
[      Submit      ]

[Cancel]  [Delete]
```

---

## Responsive Breakpoint Reference

```
Tailwind Breakpoint: sm: 640px

0px ────────────────────── 640px ─────────────────
│                           │
├─ Mobile                   ├─ Desktop
│  - Full width             │  - Fixed max-width
│  - Slide up               │  - Centered
│  - Stack buttons          │  - Fade + scale
│  - Top rounded corners    │  - All rounded corners
│  - Safe area inset        │  - Standard padding
│                           │

CSS:
  < 640px:   Mobile styles (default)
  sm: ≥640px: Desktop styles (with @media)
```

---

## Z-Index Stacking Context

```
1000+ (Higher)
       │
   100 ├─ Modal backdrop
       │  Modal container
       │  Modal content
       │
    50 ├─ Notifications
       │  Tooltips
       │
     0 ├─ Normal page content
       │
```

---

## Svelte 5 Runes in Modals

### Modal.svelte Uses:

```typescript
let isOpen = $state(false); // Reactive state
let modalElement = $state<HTMLElement>; // Ref to DOM element
let previousFocus = $state<HTMLElement>; // Store previous focus

$effect(() => {
	// Watch isOpen changes
	if (isOpen) {
		handleModalOpen();
	} else {
		handleModalClose();
	}
});
```

### FormModal.svelte Uses:

```typescript
let formData = $state({}); // Form data
let errors = $state<string[]>([]); // Validation errors
let loading = $state(false); // Loading flag

const isDirty = $derived(
	// Computed value
	Object.keys(formData).length > 0
);

$effect(() => {
	// Watch initialData
	if (isOpen && initialData) {
		formData = deepClone(initialData);
	}
});
```

---

## Common Issues & Solutions

### Issue 1: Modal won't close

```
Check:
  1. Is onClose updating the state?
  2. Is isOpen bound to parent?
  3. Is persistent: true?

Solution:
  <Modal isOpen={isOpen} onClose={() => isOpen = false} />
```

### Issue 2: Focus doesn't trap

```
Check:
  1. Are there focusable elements?
  2. Is portal action working?
  3. Are elements disabled?

Solution:
  Add visible buttons/inputs
  Check browser console for errors
```

### Issue 3: Form data not persisting

```
Check:
  1. Is initialData correct format?
  2. Are keys matching formConfig?
  3. Is deep clone working?

Solution:
  initialData={{ name: 'value' }}
  Check formConfig keys match
```

### Issue 4: Mobile layout broken

```
Check:
  1. Are tailwind breakpoints set?
  2. Is viewport meta tag present?
  3. Responsive styles correct?

Solution:
  Use sm: prefix for desktop styles
  Test at <640px width
```

---

## Summary Flowchart

```
Need a modal?
│
├─ Form input?
│  └─ YES → Use FormModal.svelte
│     ├─ Define formConfig
│     ├─ Pass initialData
│     ├─ Handle onSubmit
│     └─ Built-in validation
│
└─ NO
   └─ Use Modal.svelte
      ├─ Custom content
      ├─ Custom footer
      ├─ Manual layout
      └─ Full control
```
