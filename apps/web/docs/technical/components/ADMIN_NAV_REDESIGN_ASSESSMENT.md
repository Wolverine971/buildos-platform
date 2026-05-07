<!-- apps/web/docs/technical/components/ADMIN_NAV_REDESIGN_ASSESSMENT.md -->

# Admin Nav Redesign Assessment

**Date:** 2026-05-06
**Status:** Assessment / proposal — not yet implemented
**Author:** DJ + Claude

## Problem

The admin dashboard's persistent left sidebar (`w-72` / 288px) is eating too much horizontal space. Data-heavy pages (users, sessions, errors, llm-usage, nlogs) feel cramped. We're considering moving the admin nav to a horizontal bar under the main app nav.

## Current state

- **Shell:** `apps/web/src/lib/components/admin/AdminShell.svelte`
- **Sidebar:** `apps/web/src/lib/components/admin/AdminSidebar.svelte`
- **Main app nav:** `apps/web/src/lib/components/layout/Navigation.svelte` — `sticky top-0`, `h-16`, ~64px tall
- **Content cap:** `mx-auto max-w-7xl` (1280px) on every admin route except `/admin/chat/sessions` (`AdminShell.svelte:271-275`)

### Nav inventory (15 top-level items in 3 groups)

**Overview** (3)

- Executive Summary (`/admin`)
- Revenue Insights (`/admin/revenue`)
- Subscriptions (`/admin/subscriptions`)

**Customer Ops** (4)

- User Directory (`/admin/users`)
- Feedback Desk (`/admin/feedback`)
- Email Sequences (`/admin/email-sequences`)
- Beta Program (`/admin/beta`)

**Platform Health** (8)

- Feature Flags (`/admin/feature-flags`)
- Chat Intelligence (`/admin/chat`) — 6 children: Overview, Agents, Costs, Sessions, Tools, Timing
- Notifications (`/admin/notifications`) — 4 children: Overview, Event Logs, SMS Scheduler, Test Bed
- Ontology (`/admin/ontology`)
- Public Pages (`/admin/ontology/public-pages`)
- Migration (`/admin/migration`)
- Error Control (`/admin/errors`)
- Security Center (`/admin/security`)

## Why a flat top nav is awkward here

1. **Too many items.** 15 top-level entries won't fit in a single horizontal row at typical laptop widths without overflow scrolling or aggressive abbreviation.
2. **Two-tier nesting.** Chat has 6 children, Notifications has 4. A horizontal nav forces these into a second row of tabs (when active) or a hover dropdown. Both options add complexity.
3. **Vertical space cost.** Main nav is already `sticky h-16`. Adding a single-row admin nav = ~112px before content. A two-row group+subnav approach = ~144-160px. On a 13" laptop that's a meaningful chunk.
4. **Sidebar isn't the only space culprit.** Even if you remove the sidebar entirely, `max-w-7xl` (1280px) caps the content. Wide monitors see large empty side margins regardless. The sidebar removes nothing useful from those margins until that cap is also relaxed.

## Options ranked

### 1. Collapsible icon-rail sidebar (recommended)

Default to icon-only width (~`w-16` / 64px), expand to current `w-72` on hover or via toggle button. Optionally persist user preference in localStorage.

**Pros**

- Recovers ~220px of horizontal space immediately
- Preserves the existing IA — no nav restructure needed
- Pattern is familiar (Linear, Supabase, Vercel, Notion sidebar)
- Works gracefully with two-tier nesting (children appear in the popover/expanded state)
- Low blast radius — touches `AdminShell.svelte` and `AdminSidebar.svelte`, nothing in route files

**Cons**

- Icons-only state needs tooltips for discoverability
- Still consumes 64px even when collapsed
- Doesn't address the `max-w-7xl` cap

**Effort:** small (1 PR)

### 2. Two-tier top nav (groups + section subnav)

Top row: 3 group buttons or a section switcher (Overview / Customer Ops / Platform Health). Second row: items in the active group. Sub-items (Chat children, Notifications children) appear in a third row only when one of those sections is active.

**Pros**

- Frees the entire left column for content
- Familiar pattern (GitHub repo nav, Stripe Dashboard)

**Cons**

- ~100-160px of vertical space lost permanently
- Forces a refactor of `adminNav.types.ts` — groups need to become navigable nodes, not just labels
- Worse for two-tier sections (Chat / Notifications) — third row of tabs gets noisy
- Harder to scan 15 items horizontally than vertically

**Effort:** medium (refactor nav types, rebuild header, update active-state logic for nested children)

### 3. Hybrid: section breadcrumb + scoped sidebar

Replace the global sidebar with a section switcher in the main content area (or a top breadcrumb), and show a thin sidebar listing only the current section's items.

**Pros**

- Most flexible long-term
- Sidebar is narrower because it only shows ~3-8 items at a time
- Section context is always visible

**Cons**

- Biggest IA shift — every admin page changes
- Adds a navigation step for cross-section moves
- Needs design work to decide where the section switcher lives

**Effort:** large

## Quick wins independent of the main decision

Regardless of which option you pick, these are cheap and immediately useful:

1. **Relax the content cap on data-heavy pages.** In `AdminShell.svelte:271-275`, expand `isWideContentRoute` to include:
    - `/admin/users`
    - `/admin/errors`
    - `/admin/llm-usage`
    - `/admin/notifications/nlogs`
    - `/admin/migration/errors`
    - `/admin/chat/costs`, `/admin/chat/timing`
      This is a one-line list change — biggest visible impact for least effort.

2. **Audit which pages actually need the wide treatment** by spot-checking each in dev. Some (Executive Summary, Revenue, Subscriptions) genuinely benefit from the centered `max-w-7xl` for readability of cards and charts.

## Recommendation

**Phase 1 (this PR):** Widen the content cap on data-heavy routes. No nav changes yet — see how much of the "cramped" feeling resolves with just this.

**Phase 2 (next PR, if still cramped):** Implement the collapsible icon-rail sidebar. Keep group structure, keep two-tier nesting, just make the rail collapsible with a toggle and persist the preference.

**Skip the top-nav rebuild** unless we also commit to consolidating the IA down to ~7-8 top-level items. With 15 items, top nav fights the structure.

## Open questions

- Do you want sidebar collapse state persisted per-user (localStorage) or per-session?
- Are there admin routes you'd like consolidated/removed before any nav change? (e.g. is "Public Pages" really separate from "Ontology"?)
- Should the icon rail show group dividers, or flatten to a single icon list?
