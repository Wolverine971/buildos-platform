# Generic Stackable Notification System

**Location:** `/apps/web/src/lib/components/notifications/`
**Status:** ✅ Phase 1 Complete

## Quick Links

📚 **Documentation:**

- **[Documentation Map](../../../../../../NOTIFICATION_SYSTEM_DOCS_MAP.md)** - Guide to all notification docs and where to find things
- [Implementation Summary](../../../../../../NOTIFICATION_SYSTEM_IMPLEMENTATION.md) - Complete implementation details
- [Original Specification](../../../../../../generic-stackable-notification-system-spec.md) - Full technical spec
- [Main CLAUDE.md](../../../CLAUDE.md#feature-specific-documentation-root-level) - Project guidelines

🔗 **Key Files:**

- Store: `/src/lib/stores/notification.store.ts`
- Types: `/src/lib/types/notification.types.ts`
- Integration: `/src/routes/+layout.svelte`

---

## Component Overview

### NotificationStackManager.svelte

**Top-level orchestrator** - Add once to `+layout.svelte`

- Manages keyboard shortcuts (ESC to minimize)
- Coordinates single modal constraint
- Renders stack and modal components

### NotificationStack.svelte

**Bottom-right stack renderer**

- Shows max 5 notifications
- "+N more" overflow badge
- Fly-in animations

### MinimizedNotification.svelte

**Individual notification cards**

- Status icons and progress bars
- Click to expand
- Generic for all notification types

### NotificationModal.svelte

**Expanded modal view**

- Full progress displays (steps, percentage, streaming)
- Success/error states with actions
- Smart minimize/dismiss behavior

### NotificationTestButtons.svelte

**Testing interface** ⚠️ Remove before production

- 5 test scenarios (Brain Dump, Phase Gen, Calendar, Error, Clear All)
- See: [Testing Documentation](../../../../../../NOTIFICATION_SYSTEM_IMPLEMENTATION.md#testing)

---

## Quick Start

### 1. Enable the System

```bash
# In .env
PUBLIC_USE_NEW_NOTIFICATIONS=true
```

### 2. Basic Usage

```typescript
import { notificationStore } from '$lib/stores/notification.store';

// Create a notification
const id = notificationStore.add({
	type: 'brain-dump',
	status: 'processing',
	isMinimized: true,
	isPersistent: true,
	autoCloseMs: null,
	data: {
		brainDumpId: 'bd-123',
		inputText: 'User input...',
		processingType: 'dual'
	},
	progress: {
		type: 'streaming',
		message: 'Processing...'
	},
	actions: {
		view: () => console.log('View'),
		retry: () => console.log('Retry'),
		dismiss: () => notificationStore.remove(id)
	}
});

// Update progress
notificationStore.setProgress(id, {
	type: 'percentage',
	percentage: 75,
	message: 'Almost done...'
});

// Mark as complete
notificationStore.setStatus(id, 'success');
```

### 3. Add Test Buttons (Development Only)

```svelte
<!-- In any route -->
<script>
	import NotificationTestButtons from '$components/notifications/NotificationTestButtons.svelte';
</script>

<NotificationTestButtons />
```

---

## Notification Types

All types are defined in `/src/lib/types/notification.types.ts`

### Brain Dump

```typescript
type: 'brain-dump'
data: {
  brainDumpId: string
  inputText: string
  processingType: 'short' | 'dual' | 'background'
  selectedProject?: { id: string; name: string }
  parseResults?: BrainDumpParseResult
}
```

### Phase Generation

```typescript
type: 'phase-generation';
data: {
	projectId: string;
	projectName: string;
	isRegeneration: boolean;
	strategy: 'phases-only' | 'schedule-in-phases';
	taskCount: number;
}
```

### Calendar Analysis

```typescript
type: 'calendar-analysis'
data: {
  daysBack: number
  daysForward: number
  eventCount?: number
}
```

### Generic (Fallback)

```typescript
type: 'generic'
data: {
  title: string
  message?: string
}
```

---

## Progress Types

```typescript
// Binary (loading or done)
{ type: 'binary' }

// Percentage-based
{ type: 'percentage', percentage: 75, message?: 'Processing...' }

// Step-based (like phase generation)
{
  type: 'steps',
  currentStep: 2,
  totalSteps: 5,
  steps: [
    { name: 'Step 1', status: 'completed' },
    { name: 'Step 2', status: 'processing' },
    { name: 'Step 3', status: 'pending' }
  ]
}

// Streaming (SSE-based)
{ type: 'streaming', message: 'Analyzing...', percentage?: 50 }

// Indeterminate (unknown duration)
{ type: 'indeterminate', message?: 'Loading...' }
```

---

## Store Methods

See: [API Reference](../../../../../../NOTIFICATION_SYSTEM_IMPLEMENTATION.md#api-reference)

**Core Operations:**

- `add(config)` - Create notification, returns ID
- `update(id, updates)` - Update notification data
- `remove(id)` - Remove notification completely

**State Management:**

- `expand(id)` - Expand to modal (auto-minimizes others)
- `minimize(id)` - Minimize to stack
- `minimizeAll()` - Minimize all notifications

**Status Updates:**

- `setStatus(id, status)` - Update status ('processing' | 'success' | 'error' | 'cancelled')
- `setProgress(id, progress)` - Update progress display
- `setError(id, error)` - Set error state with message

**Cleanup:**

- `clear()` - Remove all notifications
- `clearCompleted()` - Remove only success/error notifications
- `clearHistory()` - Clear notification history

---

## Critical Patterns

### ⚠️ Svelte 5 Reactivity with Maps

**ALWAYS create new Map instances in store updates:**

```typescript
// ❌ WRONG - Doesn't trigger reactivity
update((state) => {
	state.notifications.set(id, notification);
	return state;
});

// ✅ CORRECT - Triggers reactivity
update((state) => {
	const newNotifications = new Map(state.notifications);
	newNotifications.set(id, notification);
	return {
		...state,
		notifications: newNotifications
	};
});
```

**Why?** Svelte 5's fine-grained reactivity with `$derived()` tracks object references. Mutating a Map in-place keeps the same reference, so reactivity doesn't detect the change.

See: [Full explanation](../../../../../../NOTIFICATION_SYSTEM_IMPLEMENTATION.md#4-svelte-5-map-reactivity-issue-critical-fix)

### SSR Safety

Always guard browser APIs:

```typescript
if (browser && typeof window !== 'undefined') {
	// Safe to use window, sessionStorage, etc.
}
```

### Timer Cleanup

Track and clean up all timers:

```typescript
const timers = new Set<ReturnType<typeof setTimeout>>();

onDestroy(() => {
	timers.forEach((t) => clearTimeout(t));
	timers.clear();
});
```

---

## Next Steps

**Phase 2: Brain Dump Integration** (2-4 hours)

- Integrate with actual brain dump flow
- Create type-specific minimized/modal views
- Wire up SSE streaming

**Phase 3-5:** Phase Generation, Calendar Analysis, Polish

- See: [Roadmap](../../../../../../NOTIFICATION_SYSTEM_IMPLEMENTATION.md#next-steps-future-phases)

---

## Need Help?

1. Check [Implementation Summary](../../../../../../NOTIFICATION_SYSTEM_IMPLEMENTATION.md) for complete details
2. Review [Original Specification](../../../../../../generic-stackable-notification-system-spec.md) for architecture
3. Look at `NotificationTestButtons.svelte` for usage examples
4. Check inline code comments in `notification.store.ts`
