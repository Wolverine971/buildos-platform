---
date: 2025-10-06T19:30:38+0000
researcher: Claude (AI Assistant)
git_commit: 65b0c8047572e2b905909a2590a344b077484c5a
branch: main
repository: buildos-platform
topic: "SMS Notification Integration - Phone Verification & Channel Implementation"
tags: [research, notifications, sms, phone-verification, twilio, bug-fix]
status: complete
last_updated: 2025-10-06
last_updated_by: Claude (AI Assistant)
---

# SMS Notification Integration Research

**Date**: 2025-10-06T19:30:38+0000
**Researcher**: Claude (AI Assistant)
**Git Commit**: 65b0c8047572e2b905909a2590a344b077484c5a
**Branch**: main
**Repository**: buildos-platform

## Research Question

How to integrate SMS as a notification channel in the extensible notification system, including:

1. Fix the `api/admin/notifications/recipients/search` endpoint error (column `users.phone` does not exist)
2. Understand and document the existing phone verification system
3. Design the SMS notification channel integration
4. Cross-reference all related specifications

## Summary

The BuildOS platform has a fully implemented SMS infrastructure (Twilio, phone verification, messaging) that is **separate** from the extensible notification system. The notification system has a placeholder for SMS but it's not yet implemented. This research identified the gap, fixed a critical endpoint error, and created a comprehensive design document for integrating SMS as a notification channel.

## Key Findings

### 1. Phone Number Storage Architecture ✅

**Discovery**: Phone numbers are NOT stored in the `users` table.

**Actual Structure**:

- **Table**: `user_sms_preferences`
- **Columns**:
  - `phone_number TEXT` - The user's phone number
  - `phone_verified BOOLEAN` - Verification status
  - `phone_verified_at TIMESTAMPTZ` - Verification timestamp
- **Relationship**: One-to-one with `users` table via `user_id`

**Code Reference**: [apps/web/src/lib/database.schema.ts:1159-1184](apps/web/src/lib/database.schema.ts#L1159-L1184)

### 2. Existing Phone Verification System ✅

**Discovery**: A complete phone verification system already exists!

**Components**:

- **Frontend**:
  - `PhoneVerification.svelte` - Phone number entry and code verification UI
  - `PhoneVerificationCard.svelte` - Card variant for onboarding
  - `SMSPreferences.svelte` - SMS notification preferences
- **Backend**:
  - `POST /api/sms/verify` - Start verification (sends code via Twilio Verify)
  - `POST /api/sms/verify/confirm` - Confirm code
- **Service**: `smsService.verifyPhoneNumber()` and `smsService.confirmVerification()`

**Verification Flow**:

```
1. User enters phone number
2. POST /api/sms/verify
3. Twilio Verify sends 6-digit code
4. User enters code
5. POST /api/sms/verify/confirm
6. Twilio Verify checks code
7. user_sms_preferences.phone_verified = true
8. Welcome SMS sent automatically
```

**Code References**:

- Frontend: [apps/web/src/lib/components/settings/PhoneVerification.svelte](apps/web/src/lib/components/settings/PhoneVerification.svelte)
- API Verify: [apps/web/src/routes/api/sms/verify/+server.ts](apps/web/src/routes/api/sms/verify/+server.ts)
- API Confirm: [apps/web/src/routes/api/sms/verify/confirm/+server.ts](apps/web/src/routes/api/sms/verify/confirm/+server.ts)

### 3. Endpoint Error Fixed ✅

**Problem**: `api/admin/notifications/recipients/search` was querying `users.phone` which doesn't exist.

**Error**:

```
Error searching users: {
  code: '42703',
  details: null,
  hint: null,
  message: 'column users.phone does not exist'
}
```

**Root Cause**: Line 27 of the endpoint was selecting `phone` from the `users` table.

**Solution**: Updated query to join with `user_sms_preferences` table:

```typescript
// BEFORE (broken)
let usersQuery = supabase.from("users").select(`
  id, email, name, is_admin,
  phone,  // ❌ This column doesn't exist
  push_subscriptions!inner(id),
  notification_subscriptions!notification_subscriptions_user_id_fkey(event_type, is_active)
`);

// AFTER (fixed)
let usersQuery = supabase.from("users").select(`
  id, email, name, is_admin,
  push_subscriptions!inner(id),
  notification_subscriptions!notification_subscriptions_user_id_fkey(event_type, is_active),
  user_sms_preferences(phone_number, phone_verified)  // ✅ Join with SMS prefs table
`);

// Updated has_phone logic
has_phone: !!(
  u.user_sms_preferences?.[0]?.phone_number &&
  u.user_sms_preferences?.[0]?.phone_verified // ✅ Only count verified phones
);
```

**Code Reference**: [apps/web/src/routes/api/admin/notifications/recipients/search/+server.ts:22-54](apps/web/src/routes/api/admin/notifications/recipients/search/+server.ts#L22-L54)

### 4. SMS Infrastructure (Already Exists) ✅

**Discovery**: Complete SMS system already implemented!

**Components**:

- **Database**:
  - `sms_messages` - Message history and tracking
  - `sms_templates` - Reusable message templates
  - `user_sms_preferences` - User phone and notification settings
- **Services**:
  - `TwilioClient` (`packages/twilio-service/`) - Twilio API wrapper
  - `SMSService` (web) - Frontend SMS operations
  - `smsWorker` (worker) - Background message sending
- **Features**:
  - Phone verification via Twilio Verify
  - Template system
  - Queue-based delivery
  - Rate limiting and quiet hours
  - Opt-out support (STOP keyword)

**Code References**:

- Migration: [apps/web/supabase/migrations/20250928_add_sms_messaging_tables.sql](apps/web/supabase/migrations/20250928_add_sms_messaging_tables.sql)
- Worker: [apps/worker/src/workers/smsWorker.ts](apps/worker/src/workers/smsWorker.ts)
- Service: [packages/twilio-service/src/services/sms.service.ts](packages/twilio-service/src/services/sms.service.ts)

### 5. Notification System - SMS Gap ❌

**Discovery**: SMS channel is NOT integrated with the notification system.

**Current State**:

```typescript
// In notificationWorker.ts
case 'sms':
  console.log('SMS notifications not yet implemented');
  await updateDeliveryStatus(
    delivery.id,
    'failed',
    'SMS notifications not yet implemented'
  );
  break;
```

**What's Missing**:

1. SMS adapter in notification worker
2. Integration between `notification_deliveries` and `sms_messages`
3. Phone verification check in `emit_notification_event` RPC
4. Channel availability logic for SMS

**Code Reference**: [apps/worker/src/workers/notification/notificationWorker.ts](apps/worker/src/workers/notification/notificationWorker.ts)

### 6. Design Documentation ✅

**Created**: Comprehensive SMS Notification Channel Design document

**Location**: `/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md`

**Contents**:

- Complete architecture and data flow
- Database schema changes (single FK addition)
- 7-phase implementation plan
- User flows and UX considerations
- Security, privacy, and compliance
- Monitoring and metrics
- Error handling strategies
- Rollout plan

**Key Design Decisions**:

1. **No New Tables** - Leverage existing infrastructure
2. **Foreign Key Link** - Add `notification_delivery_id` to `sms_messages`
3. **Two-Stage Process**:
   - Notification worker creates `notification_deliveries` record
   - SMS adapter creates `sms_messages` record
   - Both tables updated via webhook
4. **Phone Verification Required** - Check `phone_verified` before creating SMS deliveries

---

## Detailed Findings

### Phone Verification Flow (Existing)

**Entry Points**:

1. **Settings Page**: `/profile?tab=notifications` → SMS Preferences → Verify Phone
2. **Onboarding**: Step 4 (Notifications) → Phone Verification Card

**Verification Steps**:

```typescript
// 1. Send Verification Code
const result = await smsService.verifyPhoneNumber("+15551234567");
// → POST /api/sms/verify
// → Twilio Verify sends SMS with code

// 2. Confirm Code
const confirmResult = await smsService.confirmVerification(
  "+15551234567",
  "123456",
);
// → POST /api/sms/verify/confirm
// → Twilio Verify checks code
// → Updates user_sms_preferences:
//    phone_verified = true
//    phone_verified_at = NOW()
// → Sends welcome SMS via queue_sms_message()
```

**Security Features**:

- Rate limiting: 5 attempts per hour per user
- Duplicate phone check: One phone per user
- E.164 format validation
- Twilio signature validation on callbacks

### SMS Messaging System (Existing)

**Message Queue Flow**:

```sql
-- Queue an SMS message
SELECT queue_sms_message(
  p_user_id := 'user-uuid',
  p_phone_number := '+15551234567',
  p_message := 'Your task is due soon!',
  p_priority := 'high'::sms_priority,
  p_scheduled_for := NOW() + INTERVAL '1 hour'
);
```

**Flow**:

1. `queue_sms_message()` creates record in `sms_messages` table
2. Creates `send_sms` job in `queue_jobs` table
3. SMS worker picks up job
4. Sends via Twilio API
5. Twilio webhook updates status
6. `sms_messages` status updated (pending → sent → delivered)

**Templates** (4 seeded):

- `task_reminder` - Task due notifications
- `daily_brief_ready` - Brief completion alerts
- `urgent_task` - Urgent task alerts
- `welcome_sms` - Welcome message after verification

### Integration Architecture (Designed)

**Two-Table System**:

```
notification_deliveries (Notification System)
├── id (UUID)
├── event_id (FK to notification_events)
├── channel = 'sms'
├── channel_identifier (phone number)
├── status (pending → sent → delivered)
├── external_id (links to sms_messages.id)
└── ...

sms_messages (SMS System)
├── id (UUID)
├── phone_number
├── message_content
├── twilio_sid
├── notification_delivery_id (NEW - FK to notification_deliveries) ← LINK
└── ...
```

**Why Two Tables?**

1. **Separation of Concerns**: Notification system tracks delivery across all channels; SMS system tracks Twilio-specific details
2. **Existing Infrastructure**: Leverages current SMS system without breaking changes
3. **Flexibility**: SMS can still be used standalone (tasks, reminders) without notifications
4. **Status Sync**: Webhook updates both tables for consistency

### Notification Event Flow (With SMS)

```
1. Event Triggered (e.g., daily brief completes)
   ↓
2. emit_notification_event('brief.completed', payload)
   ↓
3. RPC finds subscriptions with sms_enabled = true
   ↓
4. For each subscriber:
   a. Check user_sms_preferences.phone_verified = true
   b. If verified: Get phone_number
   c. Create notification_deliveries record
   d. Queue send_notification job
   ↓
5. Notification Worker picks up job
   ↓
6. Routes to SMS Adapter
   ↓
7. SMS Adapter:
   a. Format message from event payload
   b. Create sms_messages record (with notification_delivery_id)
   c. Call queue_sms_message()
   d. Update notification_deliveries.status = 'sent'
   ↓
8. SMS Worker sends via Twilio
   ↓
9. Twilio Webhook updates both tables
```

---

## Code References

### Database Schema

| Table                     | Location                                                                        | Purpose                                  |
| ------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| `user_sms_preferences`    | [database.schema.ts:1159-1184](apps/web/src/lib/database.schema.ts#L1159-L1184) | Phone numbers, verification, preferences |
| `sms_messages`            | [database.schema.ts:910-935](apps/web/src/lib/database.schema.ts#L910-L935)     | SMS message tracking                     |
| `sms_templates`           | [database.schema.ts:936-951](apps/web/src/lib/database.schema.ts#L936-L951)     | Message templates                        |
| `notification_deliveries` | [database.schema.ts:603-624](apps/web/src/lib/database.schema.ts#L603-L624)     | Multi-channel delivery tracking          |

### API Endpoints

| Endpoint                                         | Location                                                                                             | Purpose                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------- |
| `POST /api/sms/verify`                           | [+server.ts](apps/web/src/routes/api/sms/verify/+server.ts)                                          | Start phone verification  |
| `POST /api/sms/verify/confirm`                   | [+server.ts](apps/web/src/routes/api/sms/verify/confirm/+server.ts)                                  | Confirm verification code |
| `POST /api/webhooks/twilio/status`               | [+server.ts](apps/web/src/routes/api/webhooks/twilio/status/+server.ts)                              | Twilio status callbacks   |
| `GET /api/admin/notifications/recipients/search` | [+server.ts:22-54](apps/web/src/routes/api/admin/notifications/recipients/search/+server.ts#L22-L54) | Search users (FIXED)      |

### UI Components

| Component                        | Location                                                                                               | Purpose                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------- |
| `PhoneVerification.svelte`       | [PhoneVerification.svelte](apps/web/src/lib/components/settings/PhoneVerification.svelte)              | Phone verification UI      |
| `PhoneVerificationCard.svelte`   | [PhoneVerificationCard.svelte](apps/web/src/lib/components/onboarding-v2/PhoneVerificationCard.svelte) | Onboarding variant         |
| `SMSPreferences.svelte`          | [SMSPreferences.svelte](apps/web/src/lib/components/settings/SMSPreferences.svelte)                    | SMS notification settings  |
| `NotificationPreferences.svelte` | [NotificationPreferences.svelte](apps/web/src/lib/components/settings/NotificationPreferences.svelte)  | Notification channel prefs |

### Workers

| Worker                  | Location                                                                            | Purpose                   |
| ----------------------- | ----------------------------------------------------------------------------------- | ------------------------- |
| `smsWorker.ts`          | [smsWorker.ts](apps/worker/src/workers/smsWorker.ts)                                | Send SMS via Twilio       |
| `notificationWorker.ts` | [notificationWorker.ts](apps/worker/src/workers/notification/notificationWorker.ts) | Route to channel adapters |

### Services

| Service            | Location                                                   | Purpose                 |
| ------------------ | ---------------------------------------------------------- | ----------------------- |
| `TwilioClient`     | [twilio-service](packages/twilio-service/src/client.ts)    | Twilio API wrapper      |
| `SMSService` (web) | [sms.service.ts](apps/web/src/lib/services/sms.service.ts) | Frontend SMS operations |

---

## Architecture Insights

### Pattern: Dual-Table Integration

**Why This Works**:

1. **Notification System**: Unified delivery tracking across push, email, SMS, in-app
2. **SMS System**: Specialized Twilio integration with retry logic, templates, webhooks
3. **Link**: Foreign key creates relationship without coupling

**Benefits**:

- **Modularity**: SMS system can be used standalone
- **Consistency**: All channels tracked in notification_deliveries
- **Flexibility**: Easy to add metadata specific to SMS
- **Existing Code**: Minimal changes to current systems

### Pattern: Phone Verification as Prerequisite

**Implementation**:

```sql
-- In emit_notification_event RPC
IF v_sms_enabled THEN
  SELECT phone_verified INTO v_phone_verified
  FROM user_sms_preferences
  WHERE user_id = v_sub.user_id;

  IF v_phone_verified IS TRUE THEN
    -- Create SMS delivery
  ELSE
    -- Skip SMS (no error, expected state)
  END IF;
END IF;
```

**UX Flow**:

1. User enables SMS notification for event
2. System checks phone verification
3. If not verified → Show verification modal
4. User verifies phone
5. SMS notification enabled

**Benefits**:

- **Security**: No SMS to unverified numbers
- **Compliance**: User consent via verification
- **Quality**: Reduces failed deliveries

---

## Documentation Created

### Primary Documentation

**SMS Notification Channel Design**

- **Location**: `/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md`
- **Sections**:
  - Overview & Current State
  - Design Goals & Architecture
  - Database Schema Changes
  - 7-Phase Implementation Plan
  - User Flows & UX
  - Security & Privacy
  - Monitoring & Metrics
  - Error Handling
  - Rollout Plan
- **Status**: Complete, ready for review

### Cross-References Added

Updated existing documents to reference the SMS design:

1. **Notification System Implementation Status**
   - Added link to SMS design in SMS Adapter section
   - Enhanced Phase 4 tasks with specific implementation steps
   - Location: [thoughts/shared/research/2025-10-06_04-00-00_notification-system-implementation-status.md](thoughts/shared/research/2025-10-06_04-00-00_notification-system-implementation-status.md)

2. **Admin Notification Dashboard Spec**
   - Added note about SMS channel implementation requirement
   - Added SMS design to Related Documentation
   - Location: [thoughts/shared/research/2025-10-06_06-00-00_admin-notification-dashboard-spec.md](thoughts/shared/research/2025-10-06_06-00-00_admin-notification-dashboard-spec.md)

---

## Implementation Roadmap

### Immediate (Completed)

- ✅ Fixed `api/admin/notifications/recipients/search` endpoint
- ✅ Documented phone verification system
- ✅ Created SMS notification design document
- ✅ Cross-referenced all specifications

### Next Steps (Phase 1 - Week 1)

- [ ] Add `notification_delivery_id` FK to `sms_messages` table
- [ ] Create `get_user_sms_channel_info()` helper function
- [ ] Update `emit_notification_event` RPC to check phone verification

### Week 2

- [ ] Implement SMS adapter (`smsAdapter.ts`)
- [ ] Update notification worker to use SMS adapter
- [ ] Add SMS-specific notification templates

### Week 3

- [ ] Enhance notification preferences UI (phone verification modal)
- [ ] Update webhook handler to sync both tables
- [ ] Add onboarding SMS setup step

### Week 4

- [ ] Testing (unit, integration, E2E)
- [ ] Admin dashboard SMS metrics
- [ ] Documentation finalization

---

## Related Research

- [Notification System Implementation Status](2025-10-06_04-00-00_notification-system-implementation-status.md)
- [Admin Notification Dashboard Spec](2025-10-06_06-00-00_admin-notification-dashboard-spec.md)

## Related Documentation

- [SMS Notification Channel Design](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md) ⭐ NEW
- [Extensible Notification System Design](/docs/architecture/EXTENSIBLE-NOTIFICATION-SYSTEM-DESIGN.md)
- [Twilio Integration](/docs/integrations/twilio/README.md)
- [SMS API Reference](/docs/api/sms-api-reference.md)
- [SMS Setup Guide](/docs/guides/sms-setup-guide.md)
- [Web-Worker Architecture](/docs/architecture/diagrams/WEB-WORKER-ARCHITECTURE.md)

---

## Open Questions

### Q1: Should SMS bypass quiet hours for urgent notifications?

**Answer**: Yes

- Priority = 'urgent' should bypass quiet hours
- User preferences should have override option
- Default: respect quiet hours for normal/high priority

### Q2: How to handle users who opt out via STOP keyword?

**Answer**: Disable all SMS notifications

- Twilio Messaging Service handles STOP keyword
- Webhook sets `user_sms_preferences.opted_out = true`
- Future notifications skip SMS channel
- To re-enable: require phone re-verification

### Q3: Should we support international phone numbers?

**Answer**: Phase 2 feature

- Initial release: US numbers only (+1)
- Future: International with country code validation
- Twilio supports 200+ countries

---

## Summary

This research successfully:

1. ✅ **Fixed Critical Bug**: Endpoint now correctly queries `user_sms_preferences` for phone numbers
2. ✅ **Documented Existing Systems**: Complete understanding of phone verification and SMS infrastructure
3. ✅ **Designed Integration**: Comprehensive plan for SMS notification channel
4. ✅ **Cross-Referenced Specs**: All documents now properly linked
5. ✅ **Created Roadmap**: Clear 4-week implementation plan

**Key Insight**: BuildOS has all the pieces for SMS notifications (Twilio, verification, messaging), they just need to be connected to the event-driven notification system. The integration is straightforward with minimal schema changes.

---

## Implementation Updates

### Phase 1 & 2 Implementation ✅ (2025-10-06)

**Status**: Completed

**Key Changes**:

- Database migration adding `notification_delivery_id` FK to `sms_messages`
- Helper function `get_user_sms_channel_info()` for phone verification checks
- Updated `emit_notification_event` RPC to support SMS channel
- SMS adapter implementation in worker
- SMS templates for notification events
- Webhook handler enhancement for dual-table status updates

**Reference**: [SMS Notification Channel Design - Phases 1 & 2](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md#phase-1-channel-availability-check-week-1)

### Phase 3 Implementation ✅ (2025-10-06)

**Status**: Completed

**Summary**: UX enhancements for phone verification and SMS notification preferences

**Files Created**:

1. `apps/web/src/lib/components/settings/PhoneVerificationModal.svelte` - Modal for phone verification
2. `apps/web/src/routes/api/notification-preferences/+server.ts` - API endpoint for notification preferences

**Files Modified**:

1. `apps/web/src/lib/components/settings/PhoneVerification.svelte` - Added onVerified callback
2. `apps/web/src/lib/components/settings/NotificationPreferences.svelte` - Added SMS toggle with verification check
3. `apps/web/src/lib/components/onboarding-v2/NotificationsStep.svelte` - Integrated with notification system

**Features**:

- SMS toggle in notification preferences with automatic phone verification prompt
- Phone verification modal component (reusable)
- Phone verification status displayed in UI
- Onboarding flow enables SMS for `brief.completed` event when phone verified
- New API endpoint for notification preferences (GET/PUT)

**User Flows**:

1. Settings: Enable SMS → Verify phone if needed → Save preferences
2. Onboarding: Verify phone → Enable SMS options → Auto-enable for brief.completed

**Reference**: [SMS Notification Channel Design - Phase 3](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md#phase-3-user-onboarding--ux-week-2--implemented)

**Testing Guide**: [SMS Notification Testing - Phase 3](/docs/testing/SMS_NOTIFICATION_TESTING_GUIDE.md#phase-3-ux-testing-new)

### Phase 4 Implementation ✅ (2025-10-06)

**Status**: Completed - Enhanced

**Summary**: Comprehensive webhook handler enhancements for status synchronization and monitoring

**File Modified**:
- `apps/web/src/routes/api/webhooks/twilio/status/+server.ts` - Comprehensive enhancements

**Key Features**:
1. **Structured Logging**: Complete request/response tracking with context
2. **Error Categorization**: 20+ Twilio error codes mapped with severity levels
3. **Intelligent Retry Logic**: Error-based retry decisions with adaptive backoff
4. **Monitoring**: Processing time tracking, error metrics, dual-table update confirmation
5. **Enhanced Security**: Signature validation, early parameter validation

**Error Handling**:
- Permanent failures (invalid numbers, account issues) → No retry
- Temporary failures (carrier issues, unreachable) → Intelligent retry with backoff
- Rate limiting → 5min base delay + exponential backoff
- Carrier issues → 3min base delay + exponential backoff

**Monitoring Capabilities**:
- Processing time per webhook request
- Error severity levels for alerting (low, medium, high, critical)
- Retry attempt tracking with metadata
- Dual-table update success confirmation
- Legacy SMS message fallback support

**Reference**: [SMS Notification Channel Design - Phase 4](/docs/architecture/SMS_NOTIFICATION_CHANNEL_DESIGN.md#phase-4-status-synchronization-week-2-3--enhanced)

---

**Current Status**: Phases 1-4 Complete ✅

**Next Actions**:
- Test Phases 3 & 4 enhancements
- Monitor webhook logs in production
- Consider Phase 5 (Template Integration) if needed
- Consider Phase 6 (Admin Dashboard) for metrics visualization
