# Toast Notification System

> **Version:** 2.0
> **Last Updated:** 2026-01-06
> **Design System:** Inkprint

---

## Quick Reference

```typescript
import { toastService, TOAST_DURATION } from '$lib/stores/toast.store';

// Basic usage
toastService.success('Task completed!');
toastService.error('Something went wrong');
toastService.warning('Check your input');
toastService.info('New update available');
```

---

## Features

| Feature              | Description                                        |
| -------------------- | -------------------------------------------------- |
| **Mobile-first**     | Bottom positioning on mobile, top-right on desktop |
| **Swipe to dismiss** | Swipe right to dismiss on touch devices            |
| **Progress bar**     | Visual countdown for auto-dismiss                  |
| **Pause on hover**   | Timer pauses when hovering/touching                |
| **Action buttons**   | Optional action button with callback               |
| **Inkprint design**  | Semantic textures per toast type                   |

---

## Duration Constants

```typescript
import { TOAST_DURATION } from '$lib/stores/toast.store';

TOAST_DURATION.QUICK; // 1500ms - Quick confirmations
TOAST_DURATION.SHORT; // 3000ms - Simple confirmations
TOAST_DURATION.STANDARD; // 5000ms - Default for success/info
TOAST_DURATION.LONG; // 7000ms - Default for error/warning
TOAST_DURATION.EXTENDED; // 10000ms - Complex messages
TOAST_DURATION.PERSISTENT; // 0 - Won't auto-dismiss
```

---

## API Reference

### Basic Methods

```typescript
// Returns toast ID (useful for manual removal)
const id = toastService.success(message, options?);
const id = toastService.error(message, options?);
const id = toastService.warning(message, options?);
const id = toastService.info(message, options?);
```

### Options

```typescript
interface ToastOptions {
	duration?: number; // Auto-dismiss time in ms (default: STANDARD or LONG)
	dismissible?: boolean; // Show X button (default: true)
	action?: {
		label: string; // Action button text
		onClick: () => void; // Action callback
	};
}
```

### Advanced Methods

```typescript
// Manual control
toastService.remove(id); // Remove specific toast
toastService.clear(); // Remove all toasts
toastService.pause(id); // Pause auto-dismiss timer
toastService.resume(id); // Resume auto-dismiss timer

// Low-level (use convenience methods instead)
toastService.add({ message, type, ...options });
```

---

## Usage Examples

### Basic Toast

```typescript
toastService.success('Changes saved!');
```

### With Custom Duration

```typescript
toastService.info('Processing...', {
	duration: TOAST_DURATION.EXTENDED
});
```

### With Action Button

```typescript
toastService.error('Failed to save changes', {
	action: {
		label: 'Retry',
		onClick: () => saveChanges()
	}
});
```

### Persistent Toast (Manual Dismiss Only)

```typescript
toastService.warning('Connection lost. Reconnecting...', {
	duration: TOAST_DURATION.PERSISTENT,
	dismissible: true
});
```

### Undo Action Pattern

```typescript
const deletedItem = await deleteItem(id);

toastService.success('Item deleted', {
	duration: TOAST_DURATION.EXTENDED,
	action: {
		label: 'Undo',
		onClick: async () => {
			await restoreItem(deletedItem);
			toastService.success('Item restored');
		}
	}
});
```

### Copy to Clipboard

```typescript
await navigator.clipboard.writeText(text);
toastService.success('Copied to clipboard', {
	duration: TOAST_DURATION.SHORT
});
```

---

## Design System Integration

### Texture Mapping (Inkprint)

| Type      | Texture     | Semantic Meaning                    |
| --------- | ----------- | ----------------------------------- |
| `success` | `tx-grain`  | Execution, progress, work completed |
| `error`   | `tx-static` | Blockers, risk, failure             |
| `warning` | `tx-static` | Potential risk, attention needed    |
| `info`    | `tx-thread` | Information flow, relationships     |

### Icons

| Type      | Icon          | Color   |
| --------- | ------------- | ------- |
| `success` | Check         | Emerald |
| `error`   | AlertCircle   | Red     |
| `warning` | AlertTriangle | Amber   |
| `info`    | Info          | Blue    |

---

## Mobile Behavior

- **Position:** Bottom of screen (thumb-accessible)
- **Swipe:** Swipe right to dismiss
- **Touch targets:** 32px icons with adequate padding
- **Safe areas:** Respects notch/home indicator

## Desktop Behavior

- **Position:** Top-right corner
- **Hover:** Pauses auto-dismiss timer
- **Animation:** Slides in from right

---

## Accessibility

- **ARIA:** `role="alert"` with `aria-live`
- **Focus:** Visible focus rings on interactive elements
- **Reduced motion:** Respects `prefers-reduced-motion`
- **Screen readers:** Errors use `aria-live="assertive"`

---

## Migration Notes

### From Previous Version

No breaking changes. All existing code works as-is.

**Optional enhancements:**

- Add `action` for retry/undo patterns
- Use `TOAST_DURATION` constants for consistency
- Leverage pause-on-hover for important messages

---

## File Locations

| File                                          | Purpose                    |
| --------------------------------------------- | -------------------------- |
| `src/lib/stores/toast.store.ts`               | Store and service          |
| `src/lib/components/ui/Toast.svelte`          | Individual toast component |
| `src/lib/components/ui/ToastContainer.svelte` | Container with positioning |
