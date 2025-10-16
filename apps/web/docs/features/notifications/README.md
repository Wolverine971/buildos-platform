# Notification System Feature

Generic stackable notification system for long-running processes with minimized and modal views, plus user notification preferences for daily briefs and events.

## Documentation in This Folder

- `NOTIFICATION_SYSTEM_CHECKPOINT.md` - Development checkpoint
- `NOTIFICATION_SYSTEM_DOCS_MAP.md` - Complete documentation map
- `NOTIFICATION_SYSTEM_IMPLEMENTATION.md` - Phase 1 implementation summary
- `implementation/NOTIFICATION_PHASE3_IMPLEMENTATION.md` - Phase 3: Daily brief notifications + 2025-10-13 refactor
- `URGENT_NOTIFICATION_BUG.md` - Critical bug documentation
- `generic-stackable-notification-system-spec.md` - Full technical specification

## Features

### UI Notifications (Phase 1)

- **Stackable Design**: Multiple concurrent notifications
- **Minimized View**: Compact notification bar
- **Modal View**: Expanded detail view
- **Background Processing**: Continues while user works
- **Progress Tracking**: Real-time progress updates
- **Type-Safe**: Strongly typed notification system

### User Notification Preferences (Phase 3)

- **Multi-Channel**: Email, SMS, push, and in-app notifications
- **Daily Brief Notifications**: User-level control over brief delivery
- **Event-Based Notifications**: Channel preferences for specific events
- **User-Level vs Event-Based**: Clear separation of preference types (2025-10-13 refactor)
- **SMS with Verification**: Phone verification required for SMS notifications

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

### UI Notification Types (In-App)

- **Brain Dump Processing**: Brain dump progress notifications
- **Phase Generation**: Phase generation progress
- **Calendar Sync**: Calendar sync status (future)

### User Notification Types (Multi-Channel)

- **Daily Brief Completed**: Email/SMS when daily brief is ready
- **Daily Brief Failed**: Notification if brief generation fails
- **Project Updates**: Future event-based notifications

## Architecture Overview

### Two-Tier System

**Tier 1: UI Notifications** (Phase 1)

- In-app notification stack (bottom-right)
- Progress tracking for async operations
- Modal/minimized views
- Session persistence

**Tier 2: User Notifications** (Phase 3)

- Multi-channel delivery (email, SMS, push, in-app)
- Event-based system with subscriptions
- User preference management
- Quiet hours and batching support

### User Notification Preferences (2025-10-13 Refactor)

The notification preferences system was refactored on 2025-10-13 to separate **user-level preferences** from **event-based preferences**:

**User-Level Preferences** (`event_type='user'`):

- Daily brief email: `should_email_daily_brief`
- Daily brief SMS: `should_sms_daily_brief`
- Controls delivery of user-level features (daily briefs)

**Event-Based Preferences** (`event_type='brief.completed'`, etc.):

- Push notifications: `push_enabled`
- In-app notifications: `in_app_enabled`
- Controls notification channels for specific events

**Architecture:**

```
user_brief_preferences
  ↓ (WHEN briefs are generated)
  frequency, time_of_day, timezone
  ↓
Brief Generated
  ↓
user_notification_preferences (event_type='user')
  ↓ (HOW users are notified)
  should_email_daily_brief, should_sms_daily_brief
  ↓
Notifications Delivered
```

**Key Benefits:**

- Clear separation of generation timing vs. notification delivery
- Flexible control: email, SMS, or both for daily briefs
- SMS requires phone verification
- No breaking changes (old field deprecated but preserved)

**Documentation:**

- Implementation: `/apps/web/docs/features/notifications/implementation/NOTIFICATION_PHASE3_IMPLEMENTATION.md`
- API: `/apps/web/docs/technical/api/endpoints/notification-preferences.md`
- Research: `/thoughts/shared/research/2025-10-13_06-00-00_daily-brief-notification-refactor-plan.md`

## Related Documentation

### Component Documentation

- Component README: `/src/lib/components/notifications/README.md`
- Design patterns: Component code documentation

### API Documentation

- Daily Briefs API: `/apps/web/docs/technical/api/endpoints/daily-briefs.md`
- Notification Preferences API: `/apps/web/docs/technical/api/endpoints/notification-preferences.md`

### Implementation Documentation

- Phase 1: UI notification system (stackable notifications)
- Phase 3: User notifications + daily brief delivery
- 2025-10-13 Refactor: Separated generation from notification delivery
