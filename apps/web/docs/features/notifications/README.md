# Notification System Feature

Generic stackable notification system for long-running processes with minimized and modal views.

## Documentation in This Folder

- `NOTIFICATION_SYSTEM_CHECKPOINT.md` - Development checkpoint
- `NOTIFICATION_SYSTEM_DOCS_MAP.md` - Complete documentation map
- `NOTIFICATION_SYSTEM_IMPLEMENTATION.md` - Phase 1 implementation summary
- `URGENT_NOTIFICATION_BUG.md` - Critical bug documentation
- `generic-stackable-notification-system-spec.md` - Full technical specification

## Features

- **Stackable Design**: Multiple concurrent notifications
- **Minimized View**: Compact notification bar
- **Modal View**: Expanded detail view
- **Background Processing**: Continues while user works
- **Progress Tracking**: Real-time progress updates
- **Type-Safe**: Strongly typed notification system

## Key Files

**Components:**
- `/src/lib/components/notifications/NotificationModal.svelte` - Modal container
- `/src/lib/components/notifications/MinimizedNotification.svelte` - Minimized bar
- `/src/lib/components/notifications/types/` - Notification type implementations

**Services:**
- `/src/lib/services/notification-bridge.service.ts` - Bridge pattern for notifications

**Types:**
- `/src/lib/types/notification.types.ts` - Type definitions

## Notification Types

- **Brain Dump Processing**: Brain dump progress notifications
- **Phase Generation**: Phase generation progress
- **Calendar Sync**: Calendar sync status (future)

## Related Documentation

- Component README: `/src/lib/components/notifications/README.md`
- Design patterns: Component code documentation
