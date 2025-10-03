---
title: User Preferences & Onboarding Database Schema Research
date: 2025-10-03
status: complete
tags: [database, schema, onboarding, preferences, notifications, research]
related_docs:
  - /apps/web/src/lib/database.schema.ts
  - /apps/web/supabase/migrations/20250102_add_email_daily_brief_preference.sql
  - /apps/web/supabase/migrations/20250928_add_sms_messaging_tables.sql
  - /apps/web/supabase/migrations/20241220_trial_system.sql
  - /apps/web/src/routes/onboarding/+page.svelte
---

# User Preferences & Onboarding Database Schema Research

## Executive Summary

This research document provides a comprehensive analysis of the BuildOS database schema related to user preferences, settings, onboarding data, and notification preferences. The schema is well-structured with clear separation of concerns across multiple tables.

## Schema File Location

**Primary Schema Definition:**
- `/Users/annawayne/buildos-platform/apps/web/src/lib/database.schema.ts`
- Auto-generated TypeScript types (Generated: 2025-09-30T13:56:44.836Z)

**Key Migration Files:**
- `/Users/annawayne/buildos-platform/apps/web/supabase/migrations/20250102_add_email_daily_brief_preference.sql`
- `/Users/annawayne/buildos-platform/apps/web/supabase/migrations/20250928_add_sms_messaging_tables.sql`
- `/Users/annawayne/buildos-platform/apps/web/supabase/migrations/20241220_trial_system.sql`

## Core User Tables

### 1. `users` Table

**Purpose:** Primary user account table with authentication and subscription data.

**Schema:**
```typescript
users: {
  // Identity
  id: string;
  email: string;
  name: string | null;
  bio: string | null;

  // Onboarding & Access
  completed_onboarding: boolean | null;
  access_restricted: boolean | null;
  access_restricted_at: string | null;

  // Admin & Beta
  is_admin: boolean;
  is_beta_user: boolean | null;

  // Subscription (Stripe integration)
  stripe_customer_id: string | null;
  subscription_plan_id: string | null;
  subscription_status: string | null;  // 'trialing', 'active', 'free', etc.
  trial_ends_at: string | null;        // 14-day trial by default

  // Timestamps
  created_at: string;
  updated_at: string;
  last_visit: string | null;
}
```

**Key Fields:**
- `completed_onboarding`: Boolean flag - set to `true` when user completes 4-question onboarding
- `subscription_status`: Trial system with states: 'trialing', 'active', 'free', etc.
- `trial_ends_at`: Auto-set to 14 days from signup (configurable via `app.trial_days`)
- `is_beta_user`: Special beta user status (30-day grace period for existing users)

**Onboarding Logic:**
- User is considered "onboarded" if `completed_onboarding = true` OR if at least 3 of 4 `user_context` input fields are filled
- Current implementation in `/apps/web/src/routes/profile/+page.server.ts` (lines 154-172)

### 2. `user_context` Table

**Purpose:** Rich user profile data collected during onboarding for AI personalization.

**Schema:**
```typescript
user_context: {
  id: string;
  user_id: string;

  // NEW: 4-Question Onboarding Input (Current System)
  input_projects: string | null;        // "What are you building?"
  input_work_style: string | null;      // "How do you work?"
  input_challenges: string | null;      // "What's blocking you?"
  input_help_focus: string | null;      // "What do you need help with?"

  // Tracking last parsed values for change detection
  last_parsed_input_projects: string | null;
  last_parsed_input_work_style: string | null;
  last_parsed_input_challenges: string | null;
  last_parsed_input_help_focus: string | null;

  // AI-Generated Context (Legacy/Processed fields)
  active_projects: string | null;
  background: string | null;
  blockers: string | null;
  collaboration_needs: string | null;
  communication_style: string | null;
  focus_areas: string | null;
  goals_overview: string | null;
  habits: string | null;
  help_priorities: string | null;
  organization_method: string | null;
  preferred_work_hours: string | null;
  priorities: string | null;
  productivity_challenges: string | null;
  schedule_preferences: string | null;
  skill_gaps: string | null;
  tools: string | null;
  work_style: string | null;
  workflows: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
  onboarding_completed_at: string | null;
}
```

**Current Onboarding Flow (4-Question System):**

From `/apps/web/src/routes/onboarding/+page.svelte`:

1. **Step 1: Projects** (`input_projects`)
   - Icon: Rocket
   - Question: "Tell me about your current projects, goals, and initiatives"
   - Placeholder: "List your active projects, business goals, creative works..."
   - Examples: Building SaaS platform, writing blog, learning React

2. **Step 2: Work Style** (`input_work_style`)
   - Icon: Settings
   - Question: "Describe your work habits, preferred schedules, tools you use"
   - Placeholder: "Share your daily routines, peak productivity hours..."
   - Examples: Deep work 9-11am, use Notion, prefer async communication

3. **Step 3: Challenges** (`input_challenges`)
   - Icon: HelpCircle
   - Question: "What challenges are you facing with productivity?"
   - Placeholder: "Describe productivity challenges, time management issues..."
   - Examples: Switching tasks, projects pile up, time estimation struggles

4. **Step 4: Help Focus** (`input_help_focus`)
   - Icon: Target
   - Question: "What aspects of productivity do you want BuildOS to focus on?"
   - Placeholder: "Project organization, task scheduling, daily planning..."
   - Examples: Focus on project organization, help with scheduling

**Features:**
- Auto-save every 1.5 seconds to prevent data loss
- Voice recording support with live transcription
- Progress tracking (considered complete when 3/4 fields filled)
- Can skip back/forward between steps
- Data stored in raw form for AI processing

**API Endpoint:**
- POST `/api/onboarding` with actions: 'save_inputs' or 'complete'

### 3. `user_brief_preferences` Table

**Purpose:** Daily brief notification preferences and scheduling.

**Schema:**
```typescript
user_brief_preferences: {
  id: string;
  user_id: string;

  // Scheduling
  frequency: string | null;          // 'daily' or 'weekly'
  day_of_week: number | null;        // 0-6 (Monday=1) for weekly
  time_of_day: string | null;        // HH:MM:SS format (e.g., '09:00:00')
  timezone: string | null;           // IANA timezone (default: 'UTC')

  // Status
  is_active: boolean | null;         // Enable/disable brief generation

  // NEW: Email delivery preference
  email_daily_brief: boolean | null; // Opt-in for email delivery (default: false)

  // Timestamps
  created_at: string;
  updated_at: string;
}
```

**Key Features:**
- Added in migration `20250102_add_email_daily_brief_preference.sql`
- `email_daily_brief` defaults to `false` (opt-in required)
- Used by worker service to schedule daily brief generation
- API endpoint: `/api/brief-preferences` (GET/POST/PUT)

**Default Values:**
```typescript
{
  frequency: 'daily',
  day_of_week: 1,           // Monday
  time_of_day: '09:00:00',
  timezone: 'UTC',
  is_active: true,
  email_daily_brief: false
}
```

### 4. `user_sms_preferences` Table

**Purpose:** SMS notification preferences and phone verification.

**Schema:**
```typescript
user_sms_preferences: {
  id: string;
  user_id: string;

  // Phone Contact
  phone_number: string | null;
  phone_verified: boolean | null;      // Twilio verification status
  phone_verified_at: string | null;

  // Notification Preferences
  task_reminders: boolean | null;      // Task reminder SMS (default: false)
  daily_brief_sms: boolean | null;     // Daily brief via SMS (default: false)
  urgent_alerts: boolean | null;       // Urgent task alerts (default: true)

  // Timing Preferences
  quiet_hours_start: string | null;    // TIME format (default: '21:00')
  quiet_hours_end: string | null;      // TIME format (default: '08:00')
  timezone: string | null;             // Default: 'America/Los_Angeles'

  // Rate Limiting
  daily_sms_limit: number | null;      // Max SMS per day (default: 10)
  daily_sms_count: number | null;      // Current count (default: 0)
  daily_count_reset_at: string | null; // Reset timestamp

  // Opt-out
  opted_out: boolean | null;           // Master opt-out (default: false)
  opted_out_at: string | null;
  opt_out_reason: string | null;

  // Timestamps
  created_at: string | null;
  updated_at: string | null;
}
```

**Key Features:**
- Added in migration `20250928_add_sms_messaging_tables.sql`
- Twilio integration for phone verification
- Quiet hours support (no SMS during quiet hours)
- Rate limiting (10 SMS/day default)
- Master opt-out switch
- API endpoints: `/api/sms/verify`, `/api/sms/verify/confirm`

**Related Tables:**
- `sms_messages`: Message delivery tracking (linked to `queue_jobs`)
- `sms_templates`: Reusable message templates

### 5. `user_calendar_preferences` Table

**Purpose:** Calendar integration and scheduling preferences.

**Schema:**
```typescript
user_calendar_preferences: {
  id: string;
  user_id: string;

  // Work Schedule
  work_start_time: string | null;            // HH:MM:SS (e.g., '09:00:00')
  work_end_time: string | null;              // HH:MM:SS (e.g., '17:00:00')
  working_days: number[] | null;             // Array of day numbers [1,2,3,4,5]
  timezone: string | null;

  // Task Duration Preferences
  default_task_duration_minutes: number | null;  // Default: 60
  min_task_duration_minutes: number | null;      // Minimum allowed
  max_task_duration_minutes: number | null;      // Maximum allowed

  // Scheduling Preferences
  prefer_morning_for_important_tasks: boolean | null;
  exclude_holidays: boolean | null;
  holiday_country_code: string | null;      // ISO country code

  // Timestamps
  created_at: string;
  updated_at: string;
}
```

**Usage:**
- Used by phase generation strategies for intelligent task scheduling
- Google Calendar integration settings
- Work hours define "available" time slots for task scheduling

### 6. `user_notifications` Table

**Purpose:** In-app notification system (generic stackable notifications).

**Schema:**
```typescript
user_notifications: {
  id: string;
  user_id: string;

  // Content
  title: string;
  message: string;
  type: string;                 // Notification category

  // Actions
  action_url: string | null;    // Optional action link

  // Priority & Expiry
  priority: string | null;      // Display priority
  expires_at: string | null;    // Auto-expire timestamp

  // Status
  read_at: string | null;       // Marked as read
  dismissed_at: string | null;  // Dismissed by user

  // Timestamps
  created_at: string | null;
}
```

**Related Documentation:**
- See `/NOTIFICATION_SYSTEM_DOCS_MAP.md` for complete notification system docs
- Components in `/src/lib/components/notifications/`

## Supporting Tables

### `trial_reminders`

Tracks which trial reminder emails have been sent:

```typescript
trial_reminders: {
  id: string;
  user_id: string;
  reminder_type: string;  // '7_days', '3_days', '1_day', 'expired', 'grace_period'
  sent_at: string | null;
  created_at: string | null;
}
```

### `user_calendar_tokens`

Stores Google OAuth tokens for calendar integration:

```typescript
user_calendar_tokens: {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  expiry_date: number | null;
  google_email: string | null;
  google_user_id: string | null;
  scope: string | null;
  token_type: string | null;
  created_at: string | null;
  updated_at: string | null;
}
```

## Notification Preferences Summary

| Preference Type | Table | Field | Default | Description |
|----------------|-------|-------|---------|-------------|
| **Email Daily Brief** | `user_brief_preferences` | `email_daily_brief` | `false` | Receive daily brief via email |
| **SMS Daily Brief** | `user_sms_preferences` | `daily_brief_sms` | `false` | Receive daily brief via SMS |
| **SMS Task Reminders** | `user_sms_preferences` | `task_reminders` | `false` | Task reminder notifications |
| **SMS Urgent Alerts** | `user_sms_preferences` | `urgent_alerts` | `true` | Urgent task alerts |
| **In-App Notifications** | `user_notifications` | N/A | Always on | Generic notification system |

## Database Changes Needed for New Onboarding Flow

Based on the current schema analysis, here are recommended database changes for the new onboarding flow:

### Option A: Extend `user_context` Table (Recommended)

Add new fields to existing `user_context` table for consolidated onboarding data:

```sql
ALTER TABLE user_context
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS preferred_contact_method TEXT DEFAULT 'email',
ADD COLUMN IF NOT EXISTS onboarding_version TEXT DEFAULT 'v2_consolidated';

COMMENT ON COLUMN user_context.notification_preferences IS 'Consolidated notification preferences collected during onboarding';
COMMENT ON COLUMN user_context.preferred_contact_method IS 'Preferred contact method: email, sms, in-app, or none';
```

Benefits:
- Single source of truth for onboarding data
- Backward compatible with existing `input_*` fields
- Easy to version onboarding iterations

### Option B: Create New `user_onboarding_v2` Table

Create a new table specifically for the revamped onboarding:

```sql
CREATE TABLE user_onboarding_v2 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Core identity & context
  user_background TEXT,
  current_projects TEXT,
  work_style TEXT,

  -- Notification preferences
  preferred_contact_method TEXT DEFAULT 'email',
  email_notifications BOOLEAN DEFAULT true,
  sms_notifications BOOLEAN DEFAULT false,
  phone_number TEXT,
  phone_verified BOOLEAN DEFAULT false,

  -- Daily brief preferences
  daily_brief_enabled BOOLEAN DEFAULT true,
  daily_brief_time TIME DEFAULT '09:00',
  daily_brief_timezone TEXT DEFAULT 'UTC',

  -- Metadata
  onboarding_version TEXT DEFAULT 'v2',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT unique_user_onboarding_v2 UNIQUE(user_id)
);
```

Benefits:
- Clean separation from legacy onboarding
- Can coexist with old system during migration
- Easier to drop if pivot needed

### Option C: Use Existing Tables + Migration Strategy

Leverage existing tables with a migration plan:

1. **Store onboarding context in `user_context`** (already working)
2. **Store notification prefs in respective tables:**
   - Email: `user_brief_preferences.email_daily_brief`
   - SMS: `user_sms_preferences` (already has all fields needed)
   - Phone: `user_sms_preferences.phone_number`
3. **Add tracking field to `users` table:**
   ```sql
   ALTER TABLE users
   ADD COLUMN IF NOT EXISTS onboarding_v2_completed_at TIMESTAMPTZ,
   ADD COLUMN IF NOT EXISTS primary_contact_method TEXT;
   ```

Benefits:
- No new tables needed
- Reuses existing infrastructure
- Minimal schema changes

## Recommended Approach

**Use Option C (Existing Tables + Migration)** because:

1. ✅ Minimal database changes
2. ✅ Reuses existing, well-tested tables
3. ✅ Backward compatible
4. ✅ Easy rollback if needed
5. ✅ Fits BuildOS pattern of extending existing tables

### Implementation Checklist

- [ ] Add `onboarding_v2_completed_at` to `users` table
- [ ] Add `primary_contact_method` to `users` table (email, sms, or in-app)
- [ ] Ensure `user_sms_preferences` table is created (migration exists)
- [ ] Update `user_brief_preferences` to support new scheduling options
- [ ] Create API endpoint `/api/onboarding/v2` for new flow
- [ ] Add onboarding flow state tracking (which step user is on)
- [ ] Consider adding `onboarding_context` JSONB field to store flow-specific data

## Missing Functionality

Based on schema analysis, here's what's **missing** for the new onboarding:

1. **No phone verification flow** for SMS (partially exists, needs testing)
2. **No unified notification preference API** (scattered across tables)
3. **No onboarding progress tracking** beyond boolean flag
4. **No user timezone detection** (defaults to UTC)
5. **No contact method validation** (email vs SMS preference)

## API Endpoints Currently Available

| Endpoint | Method | Purpose | Table(s) |
|----------|--------|---------|----------|
| `/api/onboarding` | POST | Save onboarding inputs | `user_context`, `users` |
| `/api/brief-preferences` | GET/POST/PUT | Daily brief settings | `user_brief_preferences` |
| `/api/sms/verify` | POST | Initiate phone verification | `user_sms_preferences` |
| `/api/sms/verify/confirm` | POST | Confirm verification code | `user_sms_preferences` |
| `/api/users/calendar-preferences` | POST | Update calendar prefs | `user_calendar_preferences` |

## Next Steps for New Onboarding Implementation

1. **Design new onboarding API contract**
   - Consolidated endpoint: `/api/onboarding/v2`
   - Single POST with all data (context + preferences)
   - Return unified response with validation errors

2. **Create database migration**
   - Use Option C approach (extend existing tables)
   - Add tracking fields to `users` table
   - Create indexes for performance

3. **Build Svelte onboarding component**
   - Multi-step form (5-7 steps recommended)
   - Real-time validation
   - Progress saving (auto-save like current onboarding)
   - Phone verification integration

4. **Update services**
   - Extend `OnboardingProgressService`
   - Create `NotificationPreferenceService` for unified prefs
   - Update `SMSService` for verification flow

5. **Testing strategy**
   - Unit tests for new API endpoints
   - Integration tests for onboarding flow
   - E2E tests for complete user journey

## References

**Code Files Analyzed:**
- `/apps/web/src/lib/database.schema.ts` (lines 1-1219)
- `/apps/web/src/routes/onboarding/+page.svelte` (lines 1-802)
- `/apps/web/src/routes/profile/+page.server.ts` (lines 154-172)
- `/apps/web/src/routes/api/brief-preferences/+server.ts`
- `/apps/web/src/routes/api/sms/verify/+server.ts`

**Migration Files:**
- `20250102_add_email_daily_brief_preference.sql`
- `20250928_add_sms_messaging_tables.sql`
- `20241220_trial_system.sql`

**Documentation:**
- `/apps/web/docs/features/onboarding/README.md`
- `/NOTIFICATION_SYSTEM_DOCS_MAP.md`

---

**Research completed:** 2025-10-03 14:30:00
**Researcher:** Claude Code (Sonnet 4.5)
