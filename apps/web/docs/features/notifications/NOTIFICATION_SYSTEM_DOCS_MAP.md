<!-- apps/web/docs/features/notifications/NOTIFICATION_SYSTEM_DOCS_MAP.md -->

# Notification System - Documentation Map

This file provides a complete overview of all notification system documentation and how the files interlink.

---

## 📚 Documentation Hierarchy

```
Root Documentation
├── NOTIFICATION_SYSTEM_IMPLEMENTATION.md ⭐ START HERE
│   ├── Links to: generic-stackable-notification-system-spec.md
│   ├── Links to: CLAUDE.md (repo root)
│   └── References: All component files
│
├── generic-stackable-notification-system-spec.md
│   ├── Links to: NOTIFICATION_SYSTEM_IMPLEMENTATION.md
│   └── Links to: CLAUDE.md (repo root)
│
└── apps/web/
    ├── /CLAUDE.md
    │   └── Links to: Both root docs + component README
    │
    └── src/lib/
        ├── stores/notification.store.ts
        │   └── Inline docs reference: Implementation Summary
        │
        ├── types/notification.types.ts
        │   └── Referenced by: All docs
        │
        └── components/notifications/
            ├── README.md ⭐ QUICK REFERENCE
            │   ├── Links to: All root docs
            │   └── Usage examples + patterns
            │
            ├── NotificationStackManager.svelte
            │   └── Inline docs reference: Spec + Implementation
            │
            ├── NotificationTestButtons.svelte
            │   └── Inline docs reference: Testing section
            │
            └── [Other components...]
```

---

## 🎯 Where to Start Based on Your Goal

### "I want to understand the system quickly"

👉 Start here: [`apps/web/src/lib/components/notifications/README.md`](../../../src/lib/components/notifications/README.md)

- Quick overview
- Code examples
- Common patterns

### "I want complete implementation details"

👉 Start here: [`NOTIFICATION_SYSTEM_IMPLEMENTATION.md`](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md)

- Full feature list
- All bug fixes with solutions
- API reference
- Testing guide

### "I am fixing admin notification analytics, tracking, or audit logs"

👉 Start here: [`admin-notifications-remediation-plan-2026-04-12.md`](./admin-notifications-remediation-plan-2026-04-12.md)

- Current remediation checklist
- Metric definitions for `/admin/notifications`
- Tracking and correlation work log

👉 Then read: [`notification-audit.md`](./notification-audit.md)

- System-level audit history
- Runtime emitter inventory
- Channel-by-channel tracking flow

### "I want to understand the original design decisions"

👉 Start here: [`generic-stackable-notification-system-spec.md`](./generic-stackable-notification-system-spec.md)

- Architecture rationale
- Detailed component hierarchy
- Edge cases and error handling
- Performance considerations

### "I'm starting a new feature and need project guidelines"

👉 Start here: [`CLAUDE.md`](../../../../../CLAUDE.md)

- Project-wide patterns
- Essential commands
- Testing strategy
- Link to notification system docs

---

## 📄 Document Summaries

### [NOTIFICATION_SYSTEM_IMPLEMENTATION.md](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md) ⭐

**Purpose:** Complete implementation summary and reference
**Length:** ~400 lines
**Best for:** Developers working on or integrating with the notification system

**Contents:**

1. Overview & Key Features
2. Architecture & Data Flow
3. Implementation Details (all files with line counts)
4. **Critical Bug Fixes** (including Svelte 5 Map reactivity)
5. Notification Behavior (minimized vs expanded)
6. Testing & Validation
7. Next Steps (Phases 2-5)
8. Key Learnings & Patterns
9. File Structure
10. **API Reference** (complete store methods)
11. Success Metrics

**Cross-References:**

- Links to: `generic-stackable-notification-system-spec.md` (original design)
- Links to: `CLAUDE.md` (project guidelines)
- Links to: Component files (file structure section)
- Referenced by: All other docs

---

### [generic-stackable-notification-system-spec.md](./generic-stackable-notification-system-spec.md)

**Purpose:** Original comprehensive specification
**Length:** ~67 pages (detailed spec)
**Best for:** Understanding design decisions and future roadmap

**Contents:**

1. Executive Summary & Goals
2. Current State Analysis (existing systems)
3. Requirements (functional & non-functional)
4. **Architecture Overview** (diagrams & patterns)
5. **Store Structure** (state management design)
6. **Component Hierarchy** (component tree)
7. Stack Management Rules
8. Modal Coordination
9. UI/UX Behavior Specifications
10. **Implementation Phases** (1-5 with estimates)
11. Migration Strategy
12. Edge Cases & Error Handling
13. Performance Considerations

**Cross-References:**

- Links to: `NOTIFICATION_SYSTEM_IMPLEMENTATION.md` (implementation status)
- Links to: `CLAUDE.md` (project guidelines)
- Referenced by: Implementation doc, component README

---

### [CLAUDE.md](../../../../../CLAUDE.md)

**Purpose:** Project-wide development guidelines
**Length:** ~500 lines
**Best for:** New developers or general project work

**Notification System Section:**

- Quick links to both main docs
- Component location
- Important patterns callout (Svelte 5 Map reactivity)

**Cross-References:**

- Links to: Both notification system docs
- Links to: `/docs/README.md` (general docs)
- Referenced by: All notification docs

---

### [apps/web/src/lib/components/notifications/README.md](../../../src/lib/components/notifications/README.md) ⭐

**Purpose:** Quick reference for component usage
**Length:** ~250 lines
**Best for:** Quick lookups while coding

**Contents:**

1. Quick Links to all docs
2. Component Overview (what each file does)
3. **Quick Start** (enable system, basic usage, test buttons)
4. **Notification Types** (all 4 types with examples)
5. **Progress Types** (all 5 types with examples)
6. **Store Methods** (quick reference)
7. **Critical Patterns** (Svelte 5 reactivity, SSR, timers)
8. Next Steps
9. Help section

**Cross-References:**

- Links to: All root docs
- Links to: Store file, types file
- Referenced by: CLAUDE.md

---

## 💻 Code Documentation

### [src/lib/stores/notification.store.ts](../../../src/lib/stores/notification.store.ts)

**Inline Documentation:**

```typescript
/**
 * 📚 Documentation:
 * - API Reference: /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#api-reference
 * - Architecture: /generic-stackable-notification-system-spec.md#4-store-structure
 *
 * ⚠️ CRITICAL: This store uses Svelte 5 reactivity patterns with Maps.
 * All update functions create NEW Map instances to trigger reactivity.
 * See: /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#4-svelte-5-map-reactivity-issue-critical-fix
 */
```

**Key Functions with Doc References:**

- `add()` - Links to usage examples
- `expand()` - Links to behavior details
- All updates create new Map instances (critical pattern)

---

### [src/lib/components/notifications/NotificationStackManager.svelte](../../../src/lib/components/notifications/NotificationStackManager.svelte)

**Inline Documentation:**

```typescript
/**
 * 📚 Documentation:
 * - Component hierarchy: /generic-stackable-notification-system-spec.md#5-component-hierarchy
 * - Architecture: /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#architecture
 * - Usage: Add to +layout.svelte (see /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#2-integration)
 */
```

---

### [src/lib/components/notifications/NotificationTestButtons.svelte](../../../src/lib/components/notifications/NotificationTestButtons.svelte)

**Inline Documentation:**

```typescript
/**
 * 📚 Usage Documentation: /NOTIFICATION_SYSTEM_IMPLEMENTATION.md#manual-test-interface
 * ⚠️ IMPORTANT: Remove this component before production deployment
 *
 * Test Scenarios:
 * 1. Brain Dump - Simulates dual processing with streaming progress
 * 2. Phase Generation - Step-based progress (5 steps)
 * 3. Calendar Analysis - Indeterminate progress
 * 4. Error State - Error with retry action
 * 5. Clear All - Tests cleanup logic
 */
```

---

## 🔍 Finding Specific Information

### How do I create a notification?

1. **Quick answer:** [Component README - Quick Start](../../../src/lib/components/notifications/README.md#quick-start)
2. **Complete reference:** [Implementation - API Reference](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#api-reference)

### What are the notification types?

1. **Quick answer:** [Component README - Notification Types](../../../src/lib/components/notifications/README.md#notification-types)
2. **Complete types:** `apps/web/src/lib/types/notification.types.ts`

### How do I handle progress updates?

1. **Quick answer:** [Component README - Progress Types](../../../src/lib/components/notifications/README.md#progress-types)
2. **Examples:** [Implementation - API Reference](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#store-methods)

### Why isn't my Map triggering reactivity?

⚠️ **Critical Pattern:** [Implementation - Svelte 5 Map Reactivity Fix](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#4-svelte-5-map-reactivity-issue-critical-fix)

Also in: [Component README - Critical Patterns](../../../src/lib/components/notifications/README.md#critical-patterns)

### How do I integrate with existing features?

1. **Architecture:** [Specification - Architecture Overview](./generic-stackable-notification-system-spec.md#3-architecture-overview)
2. **Migration:** [Specification - Migration Strategy](./generic-stackable-notification-system-spec.md#10-migration-strategy)
3. **Next phases:** [Implementation - Next Steps](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#next-steps-future-phases)

### What's the component hierarchy?

1. **Visual diagram:** [Specification - Component Hierarchy](./generic-stackable-notification-system-spec.md#5-component-hierarchy)
2. **Implementation:** [Implementation - Architecture](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#architecture)

### How do I test the notification system?

1. **Quick test:** [Component README - Quick Start #3](../../../src/lib/components/notifications/README.md#3-add-test-buttons-development-only)
2. **Complete guide:** [Implementation - Testing](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#testing)
3. **Test component:** `apps/web/src/lib/components/notifications/NotificationTestButtons.svelte`

---

## 🎨 Diagram: Documentation Flow

```
Developer Journey:

Step 1: Initial Understanding
    ↓
[Component README] ─→ Quick examples
    ↓
[Implementation Summary] ─→ Complete details
    ↓
[Original Spec] ─→ Design rationale

Step 2: Development
    ↓
[Component README] ─→ Quick reference
    ↓
[Inline Code Docs] ─→ Specific patterns
    ↓
[Implementation Summary] ─→ Bug fixes & learnings

Step 3: Integration
    ↓
[Original Spec] ─→ Migration strategy
    ↓
[Implementation Summary] ─→ Next steps & phases
    ↓
[CLAUDE.md] ─→ Project guidelines
```

---

## 📌 Quick Reference Table

| I need to...                      | Go here                                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Understand the system quickly** | [Component README](../../../src/lib/components/notifications/README.md)                                                   |
| **See code examples**             | [Component README - Quick Start](../../../src/lib/components/notifications/README.md#quick-start)                         |
| **Create a notification**         | [Implementation - API Reference](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#api-reference)                                   |
| **Fix a Map reactivity bug**      | [Implementation - Svelte 5 Fix](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#4-svelte-5-map-reactivity-issue-critical-fix)     |
| **Test the system**               | [Component README - Quick Start](../../../src/lib/components/notifications/README.md#3-add-test-buttons-development-only) |
| **Integrate with brain dump**     | [Implementation - Phase 2](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#phase-2-brain-dump-integration-est-2-4-hours)          |
| **Understand design decisions**   | [Original Specification](./generic-stackable-notification-system-spec.md)                                                 |
| **See all notification types**    | [Component README - Types](../../../src/lib/components/notifications/README.md#notification-types)                        |
| **Follow project guidelines**     | [CLAUDE.md](../../../../../CLAUDE.md)                                                                                     |
| **Find a specific file**          | [Implementation - File Structure](./NOTIFICATION_SYSTEM_IMPLEMENTATION.md#file-structure)                                 |

---

## 🚀 Next Steps

After reading the docs, you can:

1. **Test the system:** Add `NotificationTestButtons` to any page
2. **Create notifications:** Use the store methods with your features
3. **Integrate Phase 2:** Start brain dump integration (see roadmap)
4. **Reference patterns:** Copy critical patterns (Map reactivity, SSR safety, timer cleanup)

---

**Last Updated:** 2025-10-01
**Status:** Phase 1 Complete ✅
