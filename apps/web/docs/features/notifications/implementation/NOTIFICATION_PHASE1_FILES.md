<!-- apps/web/docs/features/notifications/implementation/NOTIFICATION_PHASE1_FILES.md -->

# Notification System Phase 1 - Files Created

All files have been created for Phase 1 of the Extensible Notification System. Below is a complete list organized by category.

## Database Migrations

### Migration File

- `apps/web/supabase/migrations/20251006_notification_system_phase1.sql`
    - Creates all notification tables
    - Adds RPC functions
    - Sets up RLS policies
    - Seeds admin subscriptions
    - **Action Required:** Run this migration against your Supabase database

## Shared Types

### Type Definitions

- `packages/shared-types/src/notification.types.ts`
    - Event types and payloads
    - Channel and delivery interfaces
    - Job metadata types
    - Analytics types
    - **Action Required:** Run `pnpm build` in packages/shared-types

### Index Update

- `packages/shared-types/src/index.ts`
    - Updated to export notification types

## Worker Service

### Notification Worker

- `apps/worker/src/workers/notification/notificationWorker.ts`
    - Main notification processor
    - Browser push adapter (using web-push)
    - In-app notification adapter
    - Delivery tracking and retry logic
    - **Action Required:** Install `web-push` package

## Web App Services

### Notification Preferences Service

- `apps/web/src/lib/services/notification-preferences.service.ts`
    - Get/update preferences
    - Subscribe/unsubscribe from events
    - Default preferences

### Browser Push Service

- `apps/web/src/lib/services/browser-push.service.ts`
    - Push subscription management
    - Permission handling
    - Service worker integration

## Static Assets

### Service Worker

- `apps/web/static/sw.js`
    - Service worker for push notifications
    - Handles push events
    - Notification click handling
    - **Action Required:** Ensure service worker is registered in your app

## Documentation

### Implementation Guide

- `docs/architecture/NOTIFICATION_SYSTEM_PHASE1_IMPLEMENTATION.md`
    - Complete setup instructions
    - Usage examples
    - Testing procedures
    - Troubleshooting guide
    - Monitoring queries

### Design Specification

- `docs/architecture/EXTENSIBLE-NOTIFICATION-SYSTEM-DESIGN.md`
    - Already exists (design spec)
    - Referenced for Phase 1 implementation

## Files Checked (Auto-updated)

### Database Schema (Web)

- `apps/web/src/lib/database.schema.ts`
    - **Status:** ✅ Automatically updated with new tables
    - Shows notification_events, notification_subscriptions, notification_deliveries, push_subscriptions, user_notification_preferences

### Shared Types (Packages)

- `packages/shared-types/src/database.schema.ts`
    - **Status:** ✅ Will be updated after migration runs

---

## Setup Checklist

### 1. Environment Variables

**Generate VAPID keys:**

```bash
npx web-push generate-vapid-keys
```

**Add to apps/web/.env:**

```bash
PUBLIC_VAPID_PUBLIC_KEY=BN...your-public-key
```

**Add to apps/worker/.env:**

```bash
VAPID_PUBLIC_KEY=BN...your-public-key
VAPID_PRIVATE_KEY=...your-private-key
VAPID_SUBJECT=mailto:support@buildos.com
```

### 2. Install Dependencies

```bash
# Worker - install web-push
cd apps/worker
pnpm add web-push

# Shared types - rebuild
cd packages/shared-types
pnpm build
```

### 3. Run Migration

```bash
cd apps/web
npx supabase db push
```

Or manually apply:

```bash
psql your_database_url -f apps/web/supabase/migrations/20251006_notification_system_phase1.sql
```

### 4. Update TypeScript Types

```bash
cd apps/web
pnpm run db:types
```

### 5. Integrate Worker

Add notification worker to your worker process. In `apps/worker/src/worker.ts`, add:

```typescript
import { processNotification } from './workers/notification/notificationWorker.js';

// In your job processor switch/if statement:
case 'send_notification':
  await processNotification(job);
  break;
```

### 6. Test

1. Create a test user signup event
2. Verify admin receives notification
3. Check delivery records in database

---

## Quick Start

```bash
# 1. Generate VAPID keys
npx web-push generate-vapid-keys

# 2. Add keys to .env files (see above)

# 3. Install web-push in worker
cd apps/worker && pnpm add web-push

# 4. Run migration
cd apps/web && npx supabase db push

# 5. Start services
cd apps/worker && pnpm dev  # Terminal 1
cd apps/web && pnpm dev     # Terminal 2
```

---

## Next Steps

- [ ] Run migration against Supabase
- [ ] Set up VAPID keys in environment
- [ ] Install web-push dependency
- [ ] Integrate notification worker
- [ ] Test user signup flow
- [ ] Monitor notification deliveries

---

## Support Files

All implementation details are in:

- **Setup:** `docs/architecture/NOTIFICATION_SYSTEM_PHASE1_IMPLEMENTATION.md`
- **Design:** `docs/architecture/EXTENSIBLE-NOTIFICATION-SYSTEM-DESIGN.md`

**Migration File:** `20251006_notification_system_phase1.sql`
