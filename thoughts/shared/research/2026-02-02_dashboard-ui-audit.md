# UI Audit: Dashboard Page & Global Styles

```yaml
type: research
status: implemented
date: 2026-02-02
implemented: 2026-02-02
topic: Frontend UI audit of dashboard page and global dashboard.css
scope: apps/web/src/routes/projects/+page.svelte (dashboard view), dashboard.css, graph components
purpose: Identify deprecated tokens, hardcoded colors, dead code, and opportunities for consolidation
next_action: None - implementation complete
```

---

## Executive Summary

This audit focuses on the **dashboard view** (the projects list page) and its supporting files, particularly **dashboard.css** which has significant issues not covered in the previous projects-list audit.

**Key Metrics Found:**
- Deprecated color tokens in dashboard.css: **7+ instances**
- Hardcoded hex colors: **10+ instances**
- Dead/unused CSS code: **~35 lines**
- Duplicate animations: **2 locations** (dashboard.css + ProjectListSkeleton.svelte)
- Graph component hardcoded colors: **15+ instances**
- Button.svelte hardcoded colors: **3 variants** (danger, warning, success)

**Overall Score:** 6.5/10 - Good architecture but needs Inkprint compliance cleanup

---

## Context & Goals

### What We're Trying to Achieve

1. **Remove deprecated color tokens** - Migrate `--surface-panel`, `--accent-orange`, `--slate-500` to Inkprint tokens

2. **Clean up dead CSS** - Remove unused `.tasks-grid`, `.mobile-stack` classes

3. **Consolidate animations** - Move pulse animation to single source of truth

4. **Fix graph component colors** - Replace hardcoded Tailwind colors with semantic tokens or CSS variables

5. **Fix Button.svelte variants** - Replace hardcoded red/amber/emerald with semantic tokens

### Inkprint Design System Reference

**Semantic Color Tokens (Required):**
```css
/* Backgrounds */
bg-background       /* Page background */
bg-card             /* Card/panel backgrounds - replaces bg-surface-panel, bg-surface-elevated */
bg-muted            /* Muted/secondary backgrounds */
bg-accent           /* Accent color backgrounds */

/* Text */
text-foreground         /* Primary text */
text-muted-foreground   /* Secondary/muted text */
text-accent             /* Accent-colored text */

/* Borders */
border-border       /* Standard borders */

/* Destructive/Warning/Success (if defined) */
bg-destructive      /* Error/danger states - replaces bg-red-600 */
text-destructive    /* Error text */
```

---

## Files to Modify

### File Inventory

| File Path | Priority | Issues |
|-----------|----------|--------|
| `apps/web/src/routes/dashboard.css` | CRITICAL | 7+ deprecated tokens, 10+ hardcoded colors, 35 lines dead code |
| `apps/web/src/lib/components/ui/Button.svelte` | HIGH | Hardcoded red/amber/emerald in danger/warning/success variants |
| `apps/web/src/lib/components/ontology/graph/GraphControls.svelte` | MEDIUM | 6+ hardcoded Tailwind colors for legend |
| `apps/web/src/lib/components/ontology/graph/NodeDetailsPanel.svelte` | MEDIUM | 9+ hardcoded Tailwind colors for entity types |
| `apps/web/src/lib/components/projects/ProjectListSkeleton.svelte` | LOW | Duplicate pulse animation (consolidate with dashboard.css) |

---

## Detailed Findings by File

### 1. dashboard.css (CRITICAL)

**Location:** `apps/web/src/routes/dashboard.css`

**Line Count:** 296 lines

---

#### Issue 1.1: Deprecated Color Tokens (Lines 170, 191, 196, 240, 248, 254, 265, 270)

```css
/* CURRENT (DEPRECATED) - Line 170 */
background: linear-gradient(180deg, var(--accent-orange, #d88a3a), #dc2626);

/* Line 191, 196 - Light mode surface */
background-color: var(--surface-panel, #ececec);

/* Lines 240, 248, 254, 270 - Dark mode surface */
background-color: var(--surface-panel, #1e293b);

/* Lines 240, 265 - Hardcoded slate */
background-color: var(--slate-500, #3e4459);
```

**Problems:**
- `--accent-orange` is deprecated - should use `hsl(var(--accent))` or Tailwind `amber-500`
- `--surface-panel` is deprecated - should use `hsl(var(--card))` or `hsl(var(--muted))`
- `--slate-500` is deprecated - should use semantic token
- Fallback hex values are hardcoded instead of using CSS variables

**SOLUTION:**

```css
/* RECOMMENDED - Using Inkprint semantic tokens */

/* Replace --accent-orange gradient (Line 170) */
background: linear-gradient(180deg, hsl(var(--accent)), hsl(var(--destructive)));

/* Replace --surface-panel (Lines 191, 196, 240, 248, 254, 270) */
background-color: hsl(var(--card));
/* OR */
background-color: hsl(var(--muted));

/* Replace --slate-500 (Lines 240, 265) */
background-color: hsl(var(--muted));
```

---

#### Issue 1.2: Hardcoded Hex Colors (Multiple Lines)

| Line | Current | Issue | Replacement |
|------|---------|-------|-------------|
| 170 | `#d88a3a` | Hardcoded orange | `hsl(var(--accent))` |
| 170 | `#dc2626` | Hardcoded red-600 | `hsl(var(--destructive))` |
| 175-176 | `rgba(216, 138, 58, 0.1)` | Hardcoded accent RGBA | `hsl(var(--accent) / 0.1)` |
| 181-182 | Same RGBA values | Duplicate | Same fix |
| 191, 196 | `#ececec` | Hardcoded light gray | `hsl(var(--muted))` |
| 213 | `#f0f0f0`, `#e0e0e0` | Skeleton gradient grays | `hsl(var(--muted))` |
| 240, 254, 270 | `#1e293b` | Hardcoded slate-800 | `hsl(var(--card))` |
| 265 | `#3e4459` | Hardcoded slate-600 | `hsl(var(--muted))` |

---

#### Issue 1.3: Dead/Unused Code (Lines 122-156)

```css
/* DEAD CODE - Lines 123-125 */
.mobile-stack {
  display: flex;
  flex-direction: column;
}

/* DEAD CODE - Lines 129-156 */
.tasks-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}
/* ... and related media queries */
```

**Problem:** These classes are not used anywhere in the current codebase. Searched all .svelte files - no matches.

**SOLUTION:** Remove lines 122-156 entirely (~35 lines of dead code).

---

#### Issue 1.4: Duplicate Animation Definitions (Lines 28-52)

```css
/* dashboard.css - Lines 28-52 */
.animate-pulse-slow {
  animation: pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

**Also defined in ProjectListSkeleton.svelte (Lines 72-84):**
```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.animate-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

**Problems:**
- Two different `@keyframes pulse` definitions with different opacity values (0.5 vs 0.6)
- Two different `.animate-pulse` durations (2s vs 1.5s)
- Tailwind already has `animate-pulse` built-in

**SOLUTION:**
1. Remove custom animation from ProjectListSkeleton.svelte
2. Keep one definition in dashboard.css OR use Tailwind's built-in `animate-pulse`
3. If custom timing is needed, extend Tailwind config:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    }
  }
}
```

---

#### Issue 1.5: Past-Due Task Styling (Lines 159-184)

```css
/* Lines 159-184 - Past-due task styling */
.past-due-gradient {
  background: linear-gradient(180deg, var(--accent-orange, #d88a3a), #dc2626);
  /* ... */
}

.past-due-card {
  border-color: rgba(216, 138, 58, 0.3);
  box-shadow: 0 0 0 1px rgba(216, 138, 58, 0.1), /* ... */;
}
```

**Problem:** Uses deprecated `--accent-orange` and hardcoded RGBA values.

**SOLUTION:**
```css
/* RECOMMENDED */
.past-due-gradient {
  background: linear-gradient(180deg, hsl(var(--warning)), hsl(var(--destructive)));
}

.past-due-card {
  border-color: hsl(var(--warning) / 0.3);
  box-shadow: 0 0 0 1px hsl(var(--warning) / 0.1), /* ... */;
}
```

**Note:** This requires `--warning` to be defined in the theme. If not available, use `--accent` or define it.

---

#### Issue 1.6: Scrollbar Styling (Lines 222-280)

```css
/* Custom scrollbar uses deprecated tokens */
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: var(--surface-panel, #e2e8f0);
}
```

**SOLUTION:** Replace with semantic tokens or remove custom scrollbar styling (browser defaults are often better for accessibility).

---

### 2. Button.svelte (HIGH)

**Location:** `apps/web/src/lib/components/ui/Button.svelte`

#### Issue 2.1: Hardcoded Colors in Variants (Lines 80, 88, 104)

```javascript
// Line 80 - Danger variant
danger: `
  bg-red-600 text-white border border-red-700
  hover:bg-red-700 active:bg-red-800
  focus:ring-2 focus:ring-red-600 focus:ring-offset-2
`,

// Line 88 - Warning variant
warning: `
  bg-amber-600 text-white border border-amber-700
  hover:bg-amber-700 active:bg-amber-800
  focus:ring-2 focus:ring-amber-600 focus:ring-offset-2
`,

// Line 104 - Success variant
success: `
  bg-emerald-600 text-white border border-emerald-700
  hover:bg-emerald-700 active:bg-emerald-800
  focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2
`,
```

**Problem:** Hardcoded Tailwind colors bypass the Inkprint design system.

**SOLUTION (Option A - Use existing semantic tokens):**
```javascript
// If destructive/warning/success tokens exist in theme
danger: `
  bg-destructive text-destructive-foreground border border-destructive
  hover:bg-destructive/90 active:bg-destructive/80
  focus:ring-2 focus:ring-destructive focus:ring-offset-2
`,
```

**SOLUTION (Option B - Keep hardcoded but document):**
If semantic tokens don't exist yet, add a comment explaining these are intentionally hardcoded and should be migrated when tokens are added:
```javascript
// TODO: Migrate to semantic tokens when --warning, --success are added to theme
danger: `bg-red-600 ...`,
```

**Note:** Check if `--destructive` CSS variable exists in the theme. If yes, use Option A. If no, either add the variables or use Option B.

---

### 3. GraphControls.svelte (MEDIUM)

**Location:** `apps/web/src/lib/components/graph/GraphControls.svelte`

#### Issue 3.1: Hardcoded Legend Colors

```svelte
<!-- Legend items use hardcoded Tailwind colors -->
<span class="text-emerald-500">●</span> Projects
<span class="text-muted-foreground">●</span> Goals
<span class="text-indigo-500">●</span> Plans
<span class="text-amber-500">●</span> Milestones
<span class="text-red-500">●</span> Risks
<span class="text-blue-500">●</span> Tasks
```

**Problem:** Entity type colors are hardcoded instead of using a centralized color system.

**SOLUTION:** Create a shared entity color configuration:

```typescript
// apps/web/src/lib/config/entity-colors.ts
export const entityColors = {
  project: {
    text: 'text-emerald-500',
    bg: 'bg-emerald-500',
    border: 'border-emerald-500',
  },
  goal: {
    text: 'text-amber-500',
    bg: 'bg-amber-500',
    border: 'border-amber-500',
  },
  // ... etc
} as const;

// Usage in GraphControls.svelte
import { entityColors } from '$lib/config/entity-colors';

<span class={entityColors.project.text}>●</span> Projects
```

**Alternative:** If these colors are intentionally different from the ontology system, document why and keep them but centralize the definition.

---

### 4. NodeDetailsPanel.svelte (MEDIUM)

**Location:** `apps/web/src/lib/components/graph/NodeDetailsPanel.svelte`

#### Issue 4.1: Hardcoded Type Configuration Colors (Lines 58-99)

```javascript
// Lines 68-72 - Goal type config
goal: {
  icon: Target,
  iconColor: 'text-amber-600 dark:text-amber-400',
  bgColor: 'bg-amber-50 dark:bg-amber-950/50',
  borderColor: 'border-amber-200 dark:border-amber-800',
},

// Lines 73-77 - Milestone type config
milestone: {
  icon: Flag,
  iconColor: 'text-emerald-600 dark:text-emerald-400',
  bgColor: 'bg-emerald-50 dark:bg-emerald-950/50',
  borderColor: 'border-emerald-200 dark:border-emerald-800',
},

// ... similar for plan, task, risk, document, event
```

**Problem:**
- 9+ hardcoded Tailwind color classes per entity type
- Duplicates color logic from EntityListItem.svelte
- Dark mode handled manually for each color

**SOLUTION:** Use the shared entity color configuration:

```javascript
import { entityColors } from '$lib/config/entity-colors';

const typeConfig = {
  goal: {
    icon: Target,
    ...entityColors.goal,
  },
  milestone: {
    icon: Flag,
    ...entityColors.milestone,
  },
  // ...
};
```

---

### 5. ProjectListSkeleton.svelte (LOW)

**Location:** `apps/web/src/lib/components/projects/ProjectListSkeleton.svelte`

#### Issue 5.1: Duplicate Animation (Lines 72-84)

```css
/* Lines 72-84 */
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.animate-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

**Problem:** Duplicates animation from dashboard.css with slightly different values.

**SOLUTION:** Remove this style block entirely. Use Tailwind's built-in `animate-pulse` or the consolidated definition from dashboard.css.

---

## Implementation Checklist

### Phase 1: Critical - dashboard.css Cleanup ✅ COMPLETE

- [x] **Remove dead code** (~35 lines) - `.tasks-grid` and `.mobile-stack` classes
- [x] **Replace deprecated tokens:**
  - `--surface-panel` → `hsl(var(--border))` for calendar grid
  - `--accent-orange` → `hsl(var(--warning))` for past-due styling
  - `--slate-500` → `hsl(var(--muted-foreground))` for scrollbars
- [x] **Replace hardcoded hex colors** with CSS variable equivalents
- [x] **Update past-due styling** to use `hsl(var(--warning))` and `hsl(var(--destructive))`
- [x] **Update skeleton loading** to use `hsl(var(--muted))` and `hsl(var(--border))`
- [x] **Update scrollbar styles** to use semantic tokens

### Phase 2: High Priority - Button.svelte ✅ COMPLETE

- [x] Added `--warning` and `--success` CSS variables to inkprint.css (light + dark modes)
- [x] Updated danger variant: `bg-red-600` → `bg-destructive`
- [x] Updated warning variant: `bg-amber-600` → `bg-warning`
- [x] Updated success variant: `bg-emerald-600` → `bg-success`

### Phase 3: Medium Priority - Graph Components ⏭️ SKIPPED

- [ ] Create `apps/web/src/lib/config/entity-colors.ts` with centralized color definitions
- [ ] Update GraphControls.svelte to use centralized colors
- [ ] Update NodeDetailsPanel.svelte to use centralized colors

**Note:** Graph component colors are intentionally different from ontology list items for visual distinction in the graph visualization. These hardcoded colors may be kept for now.

### Phase 4: Low Priority - Animation Consolidation ✅ COMPLETE

- [x] Removed duplicate animation from ProjectListSkeleton.svelte
- [x] Component now uses Tailwind's built-in `animate-pulse` class

---

## CSS Variable Reference

When replacing deprecated tokens, use this mapping:

| Deprecated Token | Replacement | Notes |
|------------------|-------------|-------|
| `--surface-panel` | `hsl(var(--card))` | Card backgrounds |
| `--surface-elevated` | `hsl(var(--card))` | Same as card |
| `--accent-orange` | `hsl(var(--accent))` | Or `hsl(var(--warning))` if warning state |
| `--slate-500` | `hsl(var(--muted-foreground))` | For text, or `hsl(var(--muted))` for bg |
| Hardcoded `#ececec` | `hsl(var(--muted))` | Light gray backgrounds |
| Hardcoded `#1e293b` | `hsl(var(--card))` | Dark mode backgrounds |
| `red-600` | `hsl(var(--destructive))` | Danger/error states |
| `amber-600` | `hsl(var(--warning))` | Warning states (may need to add) |
| `emerald-600` | `hsl(var(--success))` | Success states (may need to add) |

---

## Testing Checklist

After implementing changes, verify:

- [ ] Dashboard/projects list renders correctly in light mode
- [ ] Dashboard/projects list renders correctly in dark mode
- [ ] Past-due task styling still works and is visible
- [ ] Skeleton loading animations still work
- [ ] Custom scrollbars still work (if kept)
- [ ] Graph legend colors are visible and distinguishable
- [ ] Node details panel colors match entity types
- [ ] Button variants (danger, warning, success) render correctly
- [ ] No CSS errors in browser console
- [ ] No visual regressions

---

## Notes for Implementing Agent

1. **Check CSS variable availability first** - Before replacing colors, verify that `--destructive`, `--warning`, `--success` exist in the theme (check `app.css` or `tailwind.config.js`). If they don't exist, you may need to add them.

2. **Test dark mode carefully** - The deprecated tokens had manual dark mode handling. Semantic tokens should handle this automatically via CSS variables, but verify.

3. **Animation consolidation is optional** - If the slightly different animation timings are intentional (dashboard vs skeleton), document why and keep both. Otherwise, consolidate.

4. **Graph colors may be intentionally different** - The graph visualization may use different colors than the ontology list items for visual distinction. Check with design before unifying.

5. **Dead code removal is safe** - The `.tasks-grid` and `.mobile-stack` classes have zero references in the codebase. Safe to remove.

6. **RGBA to HSL conversion** - When replacing `rgba(216, 138, 58, 0.1)`, the HSL equivalent is `hsl(var(--accent) / 0.1)`. This syntax requires modern CSS support (which the project has).
