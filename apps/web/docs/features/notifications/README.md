<!-- apps/web/docs/features/notifications/README.md -->

# Notification System Feature

Generic stackable notification system for long-running processes with minimized and modal views, plus user notification preferences for daily briefs and events.

**Update (2026-02-05):** User notifications are now explicit opt-in. `user_notification_preferences` is one row per user (no `event_type` column), and `notification_subscriptions` are activated only via explicit opt-in (`created_by` set) or `admin_only=true`.

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
- **Event Subscriptions**: `notification_subscriptions` controls which events are delivered
- **Explicit Opt-In**: No auto-subscribe; defaults are disabled
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

### User Notification Preferences (Current Model)

**Global Preferences (one row per user):**

- Daily brief email: `should_email_daily_brief`
- Daily brief SMS: `should_sms_daily_brief`
- Channel toggles: `push_enabled`, `email_enabled`, `sms_enabled`, `in_app_enabled`

**Subscriptions (explicit opt-in):**

- `notification_subscriptions` determines which events are delivered
- Daily brief subscriptions are activated when a user opts in via `/profile` (API sets `created_by`)

**Architecture:**

```
user_brief_preferences
  ↓ (WHEN briefs are generated)
  frequency, time_of_day, timezone
  ↓
Brief Generated
  ↓
emit_notification_event('brief.completed')
  ↓
notification_subscriptions (explicit opt-in)
  ↓
user_notification_preferences (HOW users are notified)
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
