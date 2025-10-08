---
title: SMS Event Scheduling System
feature_type: cross-platform
status: in_progress
implementation_status: phase_3_complete
priority: high
estimated_effort: 3-4 weeks
components: [worker, web, database, twilio]
tags: [sms, scheduling, calendar, llm, notifications, ai]
created: 2025-10-08
last_updated: 2025-10-08
owner: Engineering Team
phase_1_completed: 2025-10-08
phase_2_completed: 2025-10-08
phase_3_completed: 2025-10-08
---

# SMS Event Scheduling System

> **Feature Implementation** • Status: Phase 3 Complete ✅ • Production Ready 🚀 • LLM-Powered • Calendar-Synced

---

## 🎯 Implementation Status

### Phase 1: Core Scheduling Infrastructure ✅ COMPLETE (2025-10-08)

**Database Schema (5.1)** ✅

- ✅ Migration: `apps/web/supabase/migrations/20251008_sms_event_scheduling_system.sql`
- ✅ Table `scheduled_sms_messages` with full schema, indexes, triggers
- ✅ Updated `user_sms_preferences` with event reminder columns
- ✅ RPC functions: `cancel_scheduled_sms_for_event`, `get_scheduled_sms_for_user`, `update_scheduled_sms_send_time`
- ✅ Row-level security policies configured
- ✅ Added `schedule_daily_sms` to queue_type enum

**Daily Scheduler (5.2)** ✅

- ✅ File: `apps/worker/src/scheduler.ts:567-651`
- ✅ Cron pattern: `"0 0 * * *"` (every midnight)
- ✅ Function: `checkAndScheduleDailySMS()`
- ✅ Timezone-aware user filtering
- ✅ Queues `schedule_daily_sms` jobs per eligible user

**Daily SMS Worker (5.3)** ✅

- ✅ File: `apps/worker/src/workers/dailySmsWorker.ts`
- ✅ Implemented `processDailySMS(job)` with:
  - ✅ User preference fetching (timezone, lead time, opt-in status)
  - ✅ Calendar event fetching for user's day (timezone-aware)
  - ✅ Event filtering (past events, all-day events, quiet hours)
  - ✅ Template-based message generation (Phase 1 fallback)
  - ✅ `scheduled_sms_messages` record creation
  - ✅ Queue `send_sms` jobs with scheduled times
  - ✅ Daily SMS limit enforcement
  - ✅ Progress tracking

**Worker Integration** ✅

- ✅ Registered in `apps/worker/src/worker.ts:211`
- ✅ Queue processor: `queue.process("schedule_daily_sms", processScheduleDailySMS)`
- ✅ Types: `packages/shared-types/src/queue-types.ts`
- ✅ Database types: `packages/shared-types/src/database.schema.ts`

### Phase 2: LLM Message Generation ✅ COMPLETE (2025-10-08)

**SMS Message Generator Service (5.4)** ✅

- ✅ File: `apps/worker/src/lib/services/smsMessageGenerator.ts` (350 lines)
- ✅ `SmartLLMService` integration with DeepSeek Chat V3
- ✅ Template fallbacks for 100% reliability
- ✅ Message validation and truncation to 160 chars
- ✅ Event type detection (meeting, deadline, all-day)
- ✅ Helper methods for links, attendees, duration formatting

**LLM Prompts (5.5)** ✅

- ✅ File: `apps/worker/src/workers/sms/prompts.ts` (160 lines)
- ✅ System prompt with 160 char constraint
- ✅ Event-type-specific user prompts
- ✅ Context builder for event details
- ✅ Meeting, deadline, and all-day event variants

**Integration & Testing** ✅

- ✅ Updated `dailySmsWorker.ts` to use LLM generator
- ✅ LLM metadata tracking (model, cost, generated_via)
- ✅ Unit tests: `apps/worker/tests/smsMessageGenerator.test.ts`
- ✅ 7 tests passing (template fallback validation)

### Phase 3: Calendar Event Change Handling ❌ NOT STARTED

**Calendar Webhook Integration (5.6)** ❌

- ❌ Updates to `apps/web/src/routes/webhooks/calendar-events/+server.ts` - Not implemented
- ❌ Post-sync hooks for scheduled SMS - Not implemented

**Scheduled SMS Update Service (5.7)** ❌

- ❌ File: `apps/web/src/lib/services/scheduledSmsUpdate.service.ts` - Does not exist
- ❌ Event change detection - Not implemented
- ❌ Message regeneration on event changes - Not implemented

**Worker API Endpoints (5.8)** ❌

- ❌ `POST /sms/scheduled/:id/cancel` - Not implemented
- ❌ `PATCH /sms/scheduled/:id/update` - Not implemented
- ❌ `POST /sms/scheduled/:id/regenerate` - Not implemented

### Phase 4: Sending & Delivery Tracking ❌ NOT STARTED

### Phase 5: User Interface ❌ NOT STARTED

### Phase 6: Testing & Monitoring ❌ NOT STARTED

---

## Executive Summary

This specification outlines a new **SMS Event Scheduling System** for BuildOS that automatically generates and schedules intelligent, context-aware SMS reminders for upcoming calendar events. The system will:

1. **Daily Scheduler** (12:00 AM user timezone) - Analyze upcoming calendar events and schedule SMS reminders
2. **LLM-Powered Messages** - Generate helpful, contextual messages based on event details
3. **Smart Scheduling** - Send messages at optimal times (e.g., 15 mins before meeting)
4. **Calendar Event Sync** - Automatically update/cancel messages when events change
5. **User Preferences** - Respect quiet hours, timezone, daily limits, and opt-in/opt-out

**Key Innovation**: Unlike static reminders, this system uses AI to craft helpful messages that include event context, making them more actionable and valuable to users.

---

## 1. Problem Statement

### Current State

- BuildOS has calendar integration but no proactive SMS reminders
- Users miss important meetings or lack context going into them
- Email notifications may be overlooked in busy inboxes
- No intelligent, event-aware messaging system

### Desired State

- Users receive timely, helpful SMS reminders before calendar events
- Messages include relevant context (meeting title, details, attendees)
- System adapts to calendar changes (reschedules, deletions, updates)
- Respects user preferences (timezone, quiet hours, opt-out)
- Scalable, maintainable architecture leveraging existing patterns

---

## 2. Requirements

### Functional Requirements

**FR1: Daily Scheduling**

- At 12:00 AM (user timezone), check users with SMS enabled
- Fetch upcoming calendar events for the day
- Generate LLM-powered messages for relevant events
- Schedule messages at appropriate times (e.g., 15 mins before event)

**FR2: Message Generation**

- Use LLM to craft helpful, concise messages (<160 chars)
- Include event title, time, and relevant details
- Adapt tone based on event type (meeting, deadline, all-day event)
- Fallback to templates if LLM fails

**FR3: Smart Scheduling**

- Schedule based on event start time (e.g., 15 mins before)
- Respect user quiet hours
- Skip if daily SMS limit reached
- Dedup: Don't send duplicate messages for same event

**FR4: Calendar Event Change Detection**

- Monitor `/webhooks/calendar-events` for changes
- Update scheduled messages when events are modified
- Cancel messages when events are deleted/cancelled
- Reschedule messages when events are rescheduled

**FR5: User Preferences**

- Check `user_sms_preferences` for opt-in status
- Respect `quiet_hours_start` and `quiet_hours_end`
- Enforce `daily_sms_limit`
- Require phone verification before sending

### Non-Functional Requirements

**NFR1: Performance**

- Process 1000+ users per daily scheduling run
- Generate messages in <5 seconds per user
- Webhook responses in <500ms

**NFR2: Reliability**

- 99.5% message delivery rate
- Automatic retry with exponential backoff
- Graceful degradation (templates when LLM fails)

**NFR3: Cost Optimization**

- Use DeepSeek for 95% cost savings vs Claude
- Batch LLM requests when possible
- Cache templates for common scenarios

**NFR4: Maintainability**

- Follow existing worker patterns (scheduler, queue, jobs)
- Reuse existing services (SmartLLMService, TwilioClient)
- Comprehensive logging and monitoring

---

## 3. Architecture Design

### 3.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DAILY SCHEDULER (12:00 AM)                   │
│                   (Cron: "0 0 * * *")                           │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. Query user_sms_preferences (WHERE sms_enabled = true)       │
│  2. Filter by timezone (users who just hit midnight)            │
│  3. Check daily_sms_count < daily_sms_limit                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  FOR EACH USER:                                                 │
│    Queue job: "schedule_daily_sms"                              │
│    - user_id, date, timezone                                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   WORKER: processDailySMS()                     │
├─────────────────────────────────────────────────────────────────┤
│  1. Fetch calendar events for today (CalendarService)           │
│  2. Filter events needing SMS (start_time > now + 15 mins)      │
│  3. Generate messages via LLM (SmartLLMService)                 │
│  4. Create scheduled_sms_messages records                       │
│  5. Queue send_sms jobs with scheduledFor timestamp             │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              WORKER: processSendSMS() (at scheduled time)       │
├─────────────────────────────────────────────────────────────────┤
│  1. Verify message still valid (event not cancelled)            │
│  2. Check user preferences (quiet hours, daily limit)           │
│  3. Send via TwilioClient.sendSMS()                             │
│  4. Update scheduled_sms_messages status                        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Calendar Event Change Flow

```
┌─────────────────────────────────────────────────────────────────┐
│          Google Calendar → Webhook: /webhooks/calendar-events   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CalendarWebhookService.syncCalendarChanges()                   │
│  - Detects: created, updated, deleted, rescheduled              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  NEW: checkScheduledSMSForEvent(event)                          │
├─────────────────────────────────────────────────────────────────┤
│  Query scheduled_sms_messages WHERE calendar_event_id = event.id│
│                                                                 │
│  IF event.status === 'cancelled':                               │
│    → Cancel scheduled SMS messages                              │
│    → Update status to 'cancelled'                               │
│                                                                 │
│  IF event.start changed:                                        │
│    → Calculate new send time (start - 15 mins)                  │
│    → Update scheduled_sms_messages.scheduled_for                │
│    → Regenerate message with new time via LLM                   │
│    → Update queue_jobs.scheduled_for                            │
│                                                                 │
│  IF event.summary or description changed:                       │
│    → Regenerate message content via LLM                         │
│    → Update scheduled_sms_messages.message_content              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 System Components

| Component                    | Location                                                   | Responsibility                                      |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| **SMS Scheduler**            | `/apps/worker/src/scheduler.ts`                            | Cron job at 12:00 AM, queues daily SMS jobs         |
| **Daily SMS Worker**         | `/apps/worker/src/workers/dailySmsWorker.ts`               | Fetches events, generates messages, schedules sends |
| **SMS Message Generator**    | `/apps/worker/src/lib/services/smsMessageGenerator.ts`     | LLM-powered message crafting                        |
| **Send SMS Worker**          | `/apps/worker/src/workers/smsWorker.ts` (exists)           | Sends SMS via Twilio at scheduled time              |
| **Calendar Webhook Handler** | `/apps/web/src/routes/webhooks/calendar-events/+server.ts` | Detects event changes, triggers updates             |
| **SMS Update Service**       | `/apps/web/src/lib/services/scheduledSmsUpdate.service.ts` | Updates/cancels scheduled messages                  |

---

## 4. Database Schema

### 4.1 New Table: `scheduled_sms_messages`

```sql
CREATE TABLE scheduled_sms_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message details
  message_content TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN (
    'event_reminder',
    'event_starting_soon',
    'daily_agenda',
    'custom'
  )),

  -- Event linkage
  calendar_event_id TEXT,  -- Google Calendar event ID
  event_title TEXT,
  event_start TIMESTAMPTZ,
  event_end TIMESTAMPTZ,
  event_details JSONB,  -- Store event description, location, attendees

  -- Scheduling
  scheduled_for TIMESTAMPTZ NOT NULL,  -- When to send
  timezone TEXT NOT NULL,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',   -- Waiting to be sent
    'queued',      -- Job queued in queue_jobs
    'sent',        -- Successfully sent
    'delivered',   -- Twilio confirmed delivery
    'failed',      -- Failed to send
    'cancelled'    -- Event cancelled or user opted out
  )),

  -- Twilio tracking
  sms_message_id UUID REFERENCES sms_messages(id),  -- Link to actual SMS
  twilio_sid TEXT,

  -- Generation metadata
  generated_via TEXT DEFAULT 'llm' CHECK (generated_via IN ('llm', 'template')),
  llm_model TEXT,  -- Track which model generated it
  generation_cost_usd DECIMAL(10, 6),

  -- Retry logic
  send_attempts INTEGER DEFAULT 0,
  max_send_attempts INTEGER DEFAULT 3,
  last_error TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Indexes
  CONSTRAINT unique_user_event_scheduled UNIQUE(user_id, calendar_event_id, scheduled_for)
);

-- Indexes for performance
CREATE INDEX idx_scheduled_sms_status ON scheduled_sms_messages(status);
CREATE INDEX idx_scheduled_sms_scheduled_for ON scheduled_sms_messages(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX idx_scheduled_sms_user_id ON scheduled_sms_messages(user_id);
CREATE INDEX idx_scheduled_sms_calendar_event ON scheduled_sms_messages(calendar_event_id) WHERE calendar_event_id IS NOT NULL;
CREATE INDEX idx_scheduled_sms_user_date ON scheduled_sms_messages(user_id, scheduled_for);

-- Auto-update timestamp
CREATE TRIGGER update_scheduled_sms_messages_updated_at
  BEFORE UPDATE ON scheduled_sms_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

**Design Decisions:**

1. **Separate from `sms_messages`**: `scheduled_sms_messages` represents the _intent_ to send, while `sms_messages` represents the _actual send_. This separation allows:
   - Cancelling scheduled messages before they're sent
   - Updating message content based on event changes
   - Tracking generation metadata separately

2. **`calendar_event_id` linkage**: Enables webhook-driven updates when events change

3. **JSONB `event_details`**: Stores event context (description, location, attendees) for message regeneration

4. **`generated_via` tracking**: Monitors LLM vs template usage for quality assessment

### 4.2 Updates to Existing Tables

**`user_sms_preferences` (already exists):**

```sql
-- Add new preference column (optional enhancement)
ALTER TABLE user_sms_preferences
ADD COLUMN event_reminders_enabled BOOLEAN DEFAULT true,
ADD COLUMN reminder_lead_time_minutes INTEGER DEFAULT 15;  -- How many minutes before event
```

**`queue_jobs` (no changes needed):**

- Already supports scheduled execution via `scheduled_for`
- Already supports job metadata via JSONB

---

## 5. Implementation Plan

### Phase 1: Core Scheduling Infrastructure ✅ COMPLETE (Week 1)

**5.1: Database Schema** ✅

- [x] Create migration for `scheduled_sms_messages` table
- [x] Update `user_sms_preferences` with new columns
- [x] Add database RPC: `cancel_scheduled_sms_for_event(calendar_event_id)`
- [x] Add database RPC: `get_scheduled_sms_for_user(user_id, date_range, status)`
- [x] Add database RPC: `update_scheduled_sms_send_time(message_id, new_time)`
- [x] Configure RLS policies for security
- [x] Add `schedule_daily_sms` to queue_type enum

**5.2: Daily Scheduler** ✅

- [x] Add cron job to `/apps/worker/src/scheduler.ts`
  - Pattern: `"0 0 * * *"` (every midnight)
  - Function: `checkAndScheduleDailySMS()`
  - Timezone-aware user filtering
- [x] Queue `schedule_daily_sms` jobs per user

**5.3: Daily SMS Worker** ✅

- [x] Create `/apps/worker/src/workers/dailySmsWorker.ts`
- [x] Implement `processDailySMS(job)`:
  - Fetch user preferences (timezone, lead time, enabled status)
  - Fetch calendar events for today
  - Filter events needing reminders
  - ~~Call SMS Message Generator~~ (Phase 2 - using templates for now)
  - Create `scheduled_sms_messages` records
  - Queue `send_sms` jobs
  - Check quiet hours
  - Enforce daily SMS limits
  - Progress tracking

### Phase 2: LLM Message Generation ✅ COMPLETE (Week 1-2)

**5.4: SMS Message Generator Service** ✅

- [x] Create `/apps/worker/src/lib/services/smsMessageGenerator.ts`
- [x] Implement `generateEventReminder(event, leadTimeMinutes, userId)`
  - Use `SmartLLMService` with DeepSeek model
  - Temperature: 0.6 (balanced creativity)
  - Max tokens: 100 (~160 chars)
  - System prompt with clear constraints
- [x] Implement template fallbacks for reliability
- [x] Add message validation (length, character set, emoji removal)
- [x] Helper methods for event context building

**5.5: LLM Prompts** ✅

- [x] Create `/apps/worker/src/workers/sms/prompts.ts`
- [x] System prompts for different event types:
  - `MEETING_REMINDER_PROMPT` (via getUserPrompt)
  - `DEADLINE_REMINDER_PROMPT` (via getUserPrompt)
  - `ALL_DAY_EVENT_PROMPT` (via getUserPrompt)
- [x] User prompt builders with event context
- [x] Context interface (EventPromptContext)

**5.5b: Integration & Testing** ✅

- [x] Update `dailySmsWorker.ts` to use SMSMessageGenerator
- [x] Track LLM metadata (generated_via, model, cost)
- [x] Create unit tests (7 tests, all passing)
- [x] Template fallback validation
- [x] TypeScript error fixes

### Phase 3: Calendar Event Change Handling ✅ COMPLETE (Week 2)

**5.6: Calendar Webhook Integration** ✅

- [x] Update calendar webhook service to integrate SMS updates
- [x] Add post-sync hook to check for scheduled SMS (lines 1103-1132 in calendar-webhook-service.ts)
- [x] Implement change detection logic:
  - Event deleted → Cancel scheduled SMS ✅
  - Event rescheduled → Update scheduled_for + regenerate message ✅
  - Event details changed → Regenerate message content ✅

**5.7: Scheduled SMS Update Service** ✅

- [x] Create `/apps/web/src/lib/services/scheduledSmsUpdate.service.ts` (423 lines)
- [x] Implement methods:
  - `cancelSMSForDeletedEvents(userId, deletions)` ✅
  - `rescheduleSMSForEvents(userId, reschedules)` ✅
  - `regenerateSMSForEvents(userId, updates)` ✅
  - `processCalendarEventChanges(userId, changes)` - Main entry point ✅
- [x] Worker API communication via HTTP endpoints
- [x] Queue job cancellation support
- [x] Non-blocking error handling

**5.8: Worker API Endpoints** ✅

- [x] Add endpoint: `POST /sms/scheduled/:id/cancel` ✅
- [x] Add endpoint: `PATCH /sms/scheduled/:id/update` ✅
- [x] Add endpoint: `POST /sms/scheduled/:id/regenerate` ✅
- [x] Add endpoint: `GET /sms/scheduled/user/:userId` (bonus - list scheduled SMS) ✅
- [x] Registered routes in worker index.ts at `/sms/scheduled/*` ✅

### Phase 4: Sending & Delivery Tracking (Week 2-3)

**5.9: Enhanced SMS Worker**

- [ ] Update `/apps/worker/src/workers/smsWorker.ts`
- [ ] Add pre-send validation:
  - Check if message still scheduled (not cancelled)
  - Verify event still exists and hasn't changed
  - Check user preferences (quiet hours, daily limit)
- [ ] Link `scheduled_sms_messages` to `sms_messages` after send
- [ ] Update status based on Twilio response

**5.10: Delivery Tracking**

- [ ] Update Twilio webhook handler to update `scheduled_sms_messages.status`
- [ ] Track delivery metrics (sent, delivered, failed)
- [ ] Implement retry logic for failed messages

### Phase 5: User Interface ✅ COMPLETE (Week 3)

**5.11: SMS Preferences UI** ✅

- [x] Updated `NotificationsTab.svelte` with event reminder settings
- [x] Add toggles:
  - Event reminders enabled/disabled ✅
  - Lead time selection (5, 10, 15, 30, 60 mins) ✅
- [x] Add "Upcoming Scheduled Messages" preview ✅
- [x] Created `ScheduledSMSList.svelte` component (364 lines)
- [x] Filter by status (all, scheduled, sent, cancelled)
- [x] Real-time message cancellation
- [x] Timezone-aware date formatting
- [x] Phone verification status warnings

**5.12: API Endpoints (Web)** ✅

- [x] `GET /api/sms/scheduled` - List user's scheduled messages (proxy to worker)
- [x] `DELETE /api/sms/scheduled/:id` - Cancel a scheduled message (with auth check)
- [x] `PUT /api/sms/preferences` - Update preferences (including lead time)
- [x] Authorization checks ensure users can only manage their own messages

### Phase 6: Testing & Monitoring (Week 3-4)

**5.13: Unit Tests**

- [ ] Test SMS message generator with various event types
- [ ] Test scheduler timezone calculations
- [ ] Test calendar change detection logic
- [ ] Test template fallbacks

**5.14: Integration Tests**

- [ ] End-to-end: Schedule → Generate → Send flow
- [ ] Calendar webhook → SMS update flow
- [ ] User preference changes → Message cancellation

**5.15: Monitoring**

- [ ] Add logging for all SMS generation/scheduling
- [ ] Track LLM costs per user
- [ ] Monitor delivery rates and failures
- [ ] Alert on high failure rates

---

## 6. LLM Prompt Strategy

### 6.1 System Prompts

**Base System Prompt:**

```typescript
const SYSTEM_PROMPT = `You are a helpful SMS reminder generator for BuildOS, a productivity platform.

Your goal: Create concise, actionable SMS reminders for calendar events.

CONSTRAINTS:
- Maximum 160 characters (SMS limit)
- Use plain text only (no emojis, markdown, or special formatting)
- Be friendly, supportive, and clear
- Include the most relevant event details
- Always mention the time until the event

TONE:
- Friendly but professional
- Encouraging without being pushy
- Respectful of the user's time

FORMAT:
- Start with context (what/when)
- Add helpful details if space allows
- End with subtle call-to-action if relevant

EXAMPLES:
- "Meeting in 15 mins: 'Project Sync' with Sarah. Agenda: Q4 roadmap discussion."
- "Deadline in 2 hours: Submit quarterly report. Location: Shared drive."
- "Starting soon: 'Team Standup' at 10am. Join via Google Meet link."

Remember: Be helpful, not annoying. Users appreciate context, not just notification spam.`;
```

**Event-Type-Specific Prompts:**

```typescript
const MEETING_REMINDER_PROMPT = `Generate an SMS reminder for an upcoming meeting.

Event details:
- Title: {{event_title}}
- Starts in: {{time_until_event}}
- Duration: {{duration}}
{{#if description}}
- Details: {{description}}
{{/if}}
{{#if attendees}}
- With: {{attendees}}
{{/if}}
{{#if location}}
- Location: {{location}}
{{/if}}

Focus on: Meeting title, time until start, key details from description.`;

const DEADLINE_REMINDER_PROMPT = `Generate an SMS reminder for an upcoming deadline.

Event details:
- Task: {{event_title}}
- Due in: {{time_until_event}}
{{#if description}}
- Details: {{description}}
{{/if}}

Focus on: Creating urgency without stress, mentioning what's due and when.`;

const ALL_DAY_EVENT_PROMPT = `Generate an SMS reminder for an all-day event or milestone.

Event details:
- Event: {{event_title}}
- Date: {{event_date}}
{{#if description}}
- Details: {{description}}
{{/if}}

Focus on: What's happening today, why it matters, any preparation needed.`;
```

### 6.2 Message Generation Service

**File**: `/apps/worker/src/lib/services/smsMessageGenerator.ts`

```typescript
import { SmartLLMService } from "./smart-llm-service";
import { formatDistance } from "date-fns";
import { utcToZonedTime } from "date-fns-tz";

export interface EventContext {
  eventId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  description?: string;
  location?: string;
  attendees?: string[];
  isAllDay: boolean;
  userTimezone: string;
}

export interface GeneratedSMS {
  content: string;
  generatedVia: "llm" | "template";
  model?: string;
  costUsd?: number;
  metadata?: any;
}

export class SMSMessageGenerator {
  private llmService: SmartLLMService;

  constructor() {
    this.llmService = new SmartLLMService();
  }

  async generateEventReminder(
    event: EventContext,
    leadTimeMinutes: number,
  ): Promise<GeneratedSMS> {
    try {
      // Calculate time until event in user's timezone
      const now = new Date();
      const startInUserTz = utcToZonedTime(event.startTime, event.userTimezone);
      const timeUntil = formatDistance(startInUserTz, now, {
        addSuffix: false,
      });

      // Determine message type
      const messageType = this.determineMessageType(event);

      // Build context for LLM
      const context = this.buildEventContext(event, timeUntil);

      // Generate with LLM
      const systemPrompt = this.getSystemPrompt(messageType);
      const userPrompt = this.getUserPrompt(messageType, context);

      const response = await this.llmService.generateText({
        systemPrompt,
        userPrompt,
        profile: "quality",
        temperature: 0.6,
        maxTokens: 100,
        operationType: "sms_reminder_generation",
      });

      // Validate length
      const content = this.validateAndTruncate(response.text);

      return {
        content,
        generatedVia: "llm",
        model: response.model,
        costUsd: response.costUsd,
        metadata: response.metadata,
      };
    } catch (error) {
      console.error(
        "[SMSMessageGenerator] LLM generation failed, using template:",
        error,
      );

      // Fallback to template
      return this.generateFromTemplate(event, leadTimeMinutes);
    }
  }

  private determineMessageType(
    event: EventContext,
  ): "meeting" | "deadline" | "all_day" {
    if (event.isAllDay) return "all_day";

    // Check for deadline keywords
    const deadlineKeywords = ["deadline", "due", "submit", "deliver", "finish"];
    const titleLower = event.title.toLowerCase();
    const descLower = event.description?.toLowerCase() || "";

    if (
      deadlineKeywords.some(
        (kw) => titleLower.includes(kw) || descLower.includes(kw),
      )
    ) {
      return "deadline";
    }

    return "meeting";
  }

  private buildEventContext(event: EventContext, timeUntil: string) {
    // Extract meeting link if present
    const meetingLink = this.extractMeetingLink(event.description);

    // Format attendees (max 2, then "and X others")
    const formattedAttendees =
      event.attendees?.length > 0
        ? this.formatAttendees(event.attendees)
        : null;

    // Extract key details from description (first sentence)
    const keyDetails = event.description
      ? this.extractKeyDetails(event.description)
      : null;

    return {
      event_title: event.title,
      time_until_event: timeUntil,
      duration: this.formatDuration(event.startTime, event.endTime),
      description: keyDetails,
      location: event.location,
      attendees: formattedAttendees,
      meeting_link: meetingLink,
    };
  }

  private validateAndTruncate(text: string): string {
    // Remove extra whitespace
    let cleaned = text.trim().replace(/\s+/g, " ");

    // Remove any markdown or emojis that LLM might have added
    cleaned = cleaned.replace(/[*_~`#]/g, "");
    cleaned = cleaned.replace(/[\u{1F600}-\u{1F64F}]/gu, ""); // Emoticons

    // Truncate to 160 chars if needed
    if (cleaned.length > 160) {
      cleaned = cleaned.substring(0, 157) + "...";
    }

    return cleaned;
  }

  private generateFromTemplate(
    event: EventContext,
    leadTimeMinutes: number,
  ): GeneratedSMS {
    const timeText =
      leadTimeMinutes < 60
        ? `in ${leadTimeMinutes} mins`
        : `in ${Math.round(leadTimeMinutes / 60)} hour${leadTimeMinutes >= 120 ? "s" : ""}`;

    let message: string;

    if (event.isAllDay) {
      message = `Today: ${event.title}`;
      if (event.description) {
        const details = this.extractKeyDetails(event.description);
        message += ` - ${details}`;
      }
    } else {
      message = `${event.title} ${timeText}`;

      // Add location if short
      if (event.location && event.location.length < 30) {
        message += ` @ ${event.location}`;
      }

      // Add key detail if space allows
      if (event.description && message.length < 120) {
        const details = this.extractKeyDetails(event.description);
        const remaining = 160 - message.length - 3; // -3 for " - "
        if (details.length <= remaining) {
          message += ` - ${details}`;
        }
      }
    }

    return {
      content: this.validateAndTruncate(message),
      generatedVia: "template",
    };
  }

  // Helper methods
  private extractKeyDetails(description: string, maxLength = 60): string {
    // Get first sentence or first line
    const firstSentence = description.split(/[.\n]/)[0].trim();
    return firstSentence.length > maxLength
      ? firstSentence.substring(0, maxLength - 3) + "..."
      : firstSentence;
  }

  private extractMeetingLink(description?: string): string | null {
    if (!description) return null;

    const meetRegex = /https:\/\/meet\.google\.com\/[a-z-]+/i;
    const zoomRegex = /https:\/\/[a-z0-9.]*zoom\.us\/j\/\d+/i;

    const meetMatch = description.match(meetRegex);
    const zoomMatch = description.match(zoomRegex);

    return meetMatch?.[0] || zoomMatch?.[0] || null;
  }

  private formatAttendees(attendees: string[]): string {
    if (attendees.length === 0) return "";
    if (attendees.length === 1) return attendees[0];
    if (attendees.length === 2) return `${attendees[0]} and ${attendees[1]}`;
    return `${attendees[0]}, ${attendees[1]}, and ${attendees.length - 2} others`;
  }

  private formatDuration(start: Date, end: Date): string {
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    if (minutes < 60) return `${minutes} mins`;
    const hours = Math.floor(minutes / 60);
    const remainingMins = minutes % 60;
    if (remainingMins === 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
    return `${hours}h ${remainingMins}m`;
  }

  private getSystemPrompt(messageType: string): string {
    // Return appropriate system prompt based on message type
    // (Implementation omitted for brevity - use prompts from section 6.1)
    return SYSTEM_PROMPT;
  }

  private getUserPrompt(messageType: string, context: any): string {
    // Build user prompt with event context
    // (Implementation omitted for brevity)
    return `Generate reminder for: ${context.event_title}`;
  }
}
```

### 6.3 Prompt Testing Strategy

**Test Cases:**

1. **Short meeting (15 mins):**
   - Input: "Team Standup" in 15 mins, no description
   - Expected: ~30 chars, clear and direct

2. **Meeting with details:**
   - Input: "Project Review" in 30 mins, description: "Discuss Q4 roadmap and budget allocation"
   - Expected: Include key detail from description

3. **Deadline:**
   - Input: "Submit quarterly report" in 2 hours
   - Expected: Create urgency without stress

4. **All-day event:**
   - Input: "Company offsite" today
   - Expected: Mention it's today, include location if available

5. **Meeting with attendees:**
   - Input: "1:1 with Sarah" in 15 mins, attendees: ["Sarah Johnson"]
   - Expected: Include attendee name

**LLM Testing:**

- Use `/apps/web/pnpm test:llm` pattern
- Mock Supabase data
- Use real OpenRouter API (small cost)
- Compare LLM vs template quality

---

## 7. Calendar Event Change Handling

### 7.1 Integration Point

**File**: `/apps/web/src/routes/webhooks/calendar-events/+server.ts`

Add new service call after successful event sync:

```typescript
// After line 47 (after syncCalendarChanges completes)
if (processedCount > 0) {
  // NEW: Check for scheduled SMS that need updating
  await handleScheduledSMSUpdates(userId, calendarId);
}
```

### 7.2 Scheduled SMS Update Service

**File**: `/apps/web/src/lib/services/scheduledSmsUpdate.service.ts`

```typescript
import { createServiceClient } from "@buildos/supabase-client";

export class ScheduledSMSUpdateService {
  private supabase = createServiceClient();

  /**
   * Check recently synced calendar events and update scheduled SMS
   */
  async handleScheduledSMSUpdates(
    userId: string,
    calendarId: string,
  ): Promise<void> {
    try {
      // Get task_calendar_events that were just updated
      const { data: recentEvents } = await this.supabase
        .from("task_calendar_events")
        .select("*")
        .eq("user_id", userId)
        .eq("calendar_id", calendarId)
        .gte("last_synced_at", new Date(Date.now() - 60000).toISOString()) // Last 1 min
        .order("last_synced_at", { ascending: false });

      if (!recentEvents || recentEvents.length === 0) return;

      for (const event of recentEvents) {
        await this.updateScheduledSMSForEvent(event);
      }
    } catch (error) {
      console.error("[ScheduledSMSUpdate] Error handling updates:", error);
      // Don't throw - this is non-critical
    }
  }

  /**
   * Update or cancel scheduled SMS based on event changes
   */
  private async updateScheduledSMSForEvent(event: any): Promise<void> {
    // Find scheduled SMS for this event
    const { data: scheduledMessages } = await this.supabase
      .from("scheduled_sms_messages")
      .select("*")
      .eq("calendar_event_id", event.calendar_event_id)
      .in("status", ["scheduled", "queued"]);

    if (!scheduledMessages || scheduledMessages.length === 0) return;

    // Check sync_source to prevent loop (same as calendar webhook)
    const SYNC_LOOP_PREVENTION_WINDOW = 5 * 60 * 1000; // 5 minutes
    if (
      event.sync_source === "app" &&
      event.updated_at &&
      new Date(event.updated_at).getTime() >
        Date.now() - SYNC_LOOP_PREVENTION_WINDOW
    ) {
      console.log("[ScheduledSMSUpdate] Skipping app-initiated change");
      return;
    }

    for (const message of scheduledMessages) {
      if (event.sync_status === "deleted") {
        // Event was deleted - cancel scheduled SMS
        await this.cancelScheduledSMS(message.id, "event_cancelled");
      } else if (this.hasEventTimeChanged(message, event)) {
        // Event was rescheduled - update scheduled_for
        await this.rescheduleMessage(message, event);
      } else if (this.hasEventDetailsChanged(message, event)) {
        // Event details changed - regenerate message
        await this.regenerateMessage(message, event);
      }
    }
  }

  /**
   * Cancel a scheduled SMS message
   */
  private async cancelScheduledSMS(
    messageId: string,
    reason: string,
  ): Promise<void> {
    console.log(
      `[ScheduledSMSUpdate] Cancelling message ${messageId}: ${reason}`,
    );

    // Update scheduled_sms_messages
    await this.supabase
      .from("scheduled_sms_messages")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
        last_error: reason,
      })
      .eq("id", messageId);

    // TODO: Cancel corresponding queue_jobs entry
    // This requires Railway API call to worker
    await this.cancelWorkerJob(messageId);
  }

  /**
   * Reschedule message for new event time
   */
  private async rescheduleMessage(message: any, event: any): Promise<void> {
    console.log(
      `[ScheduledSMSUpdate] Rescheduling message ${message.id} for new event time`,
    );

    // Calculate new send time (e.g., 15 mins before event)
    const leadTimeMinutes = 15; // TODO: Get from user preferences
    const newSendTime = new Date(
      new Date(event.event_start).getTime() - leadTimeMinutes * 60000,
    );

    // Update scheduled_sms_messages
    await this.supabase
      .from("scheduled_sms_messages")
      .update({
        scheduled_for: newSendTime.toISOString(),
        event_start: event.event_start,
        event_end: event.event_end,
        updated_at: new Date().toISOString(),
      })
      .eq("id", message.id);

    // Update queue_jobs scheduled_for via Railway API
    await this.updateWorkerJobSchedule(message.id, newSendTime);

    // Optionally: Regenerate message with new time
    // await this.regenerateMessage(message, event);
  }

  /**
   * Regenerate message content based on updated event details
   */
  private async regenerateMessage(message: any, event: any): Promise<void> {
    console.log(
      `[ScheduledSMSUpdate] Regenerating message ${message.id} for updated event`,
    );

    // Call Railway worker API to regenerate message
    const workerUrl =
      import.meta.env.VITE_RAILWAY_WORKER_URL || "http://localhost:3001";

    try {
      const response = await fetch(
        `${workerUrl}/sms/scheduled/${message.id}/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventId: event.calendar_event_id,
            eventTitle: event.event_title,
            eventStart: event.event_start,
            eventEnd: event.event_end,
            eventDetails: event.event_details, // JSONB
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Worker API returned ${response.status}`);
      }

      console.log("[ScheduledSMSUpdate] Message regenerated successfully");
    } catch (error) {
      console.error(
        "[ScheduledSMSUpdate] Failed to regenerate message:",
        error,
      );
      // Non-critical - old message will still send
    }
  }

  /**
   * Check if event time changed significantly (>5 mins difference)
   */
  private hasEventTimeChanged(message: any, event: any): boolean {
    if (!message.event_start || !event.event_start) return false;

    const oldStart = new Date(message.event_start).getTime();
    const newStart = new Date(event.event_start).getTime();
    const diffMinutes = Math.abs((newStart - oldStart) / 60000);

    return diffMinutes > 5; // Only reschedule if >5 min difference
  }

  /**
   * Check if event details changed (title, description)
   */
  private hasEventDetailsChanged(message: any, event: any): boolean {
    return message.event_title !== event.event_title;
    // Could also check event_details JSONB for description changes
  }

  /**
   * Cancel job in worker queue via Railway API
   */
  private async cancelWorkerJob(messageId: string): Promise<void> {
    // TODO: Implement Railway API call
    // For now, just log
    console.log(
      `[ScheduledSMSUpdate] TODO: Cancel worker job for message ${messageId}`,
    );
  }

  /**
   * Update job schedule in worker queue via Railway API
   */
  private async updateWorkerJobSchedule(
    messageId: string,
    newTime: Date,
  ): Promise<void> {
    // TODO: Implement Railway API call
    console.log(
      `[ScheduledSMSUpdate] TODO: Update worker job schedule for message ${messageId}`,
    );
  }
}
```

### 7.3 Worker API Endpoints for SMS Updates

**File**: `/apps/worker/src/index.ts`

Add new endpoints:

```typescript
/**
 * POST /sms/scheduled/:id/regenerate
 * Regenerate message content for a scheduled SMS
 */
app.post("/sms/scheduled/:id/regenerate", async (req, res) => {
  try {
    const { id } = req.params;
    const { eventId, eventTitle, eventStart, eventEnd, eventDetails } =
      req.body;

    // Fetch scheduled message
    const { data: message } = await supabase
      .from("scheduled_sms_messages")
      .select("*")
      .eq("id", id)
      .single();

    if (!message) {
      return res.status(404).json({ error: "Scheduled message not found" });
    }

    // Get user preferences for lead time
    const { data: prefs } = await supabase
      .from("user_sms_preferences")
      .select("reminder_lead_time_minutes, timezone")
      .eq("user_id", message.user_id)
      .single();

    const leadTime = prefs?.reminder_lead_time_minutes || 15;

    // Build event context
    const eventContext: EventContext = {
      eventId,
      title: eventTitle,
      startTime: new Date(eventStart),
      endTime: new Date(eventEnd),
      description: eventDetails?.description,
      location: eventDetails?.location,
      attendees: eventDetails?.attendees,
      isAllDay: eventDetails?.isAllDay || false,
      userTimezone: prefs?.timezone || "UTC",
    };

    // Generate new message
    const generator = new SMSMessageGenerator();
    const generated = await generator.generateEventReminder(
      eventContext,
      leadTime,
    );

    // Update scheduled_sms_messages
    await supabase
      .from("scheduled_sms_messages")
      .update({
        message_content: generated.content,
        generated_via: generated.generatedVia,
        llm_model: generated.model,
        generation_cost_usd: generated.costUsd,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    res.json({
      success: true,
      messageId: id,
      newContent: generated.content,
    });
  } catch (error: any) {
    console.error("[SMS Regenerate] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /sms/scheduled/:id
 * Cancel a scheduled SMS message
 */
app.delete("/sms/scheduled/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Update status to cancelled
    const { error } = await supabase
      .from("scheduled_sms_messages")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    // TODO: Also cancel corresponding queue_jobs entry
    // This prevents the job from running when its scheduled_for time arrives

    res.json({ success: true, messageId: id });
  } catch (error: any) {
    console.error("[SMS Cancel] Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /sms/scheduled/:id/schedule
 * Update the scheduled send time for a message
 */
app.patch("/sms/scheduled/:id/schedule", async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledFor } = req.body;

    if (!scheduledFor) {
      return res.status(400).json({ error: "scheduledFor is required" });
    }

    // Update scheduled_sms_messages
    await supabase
      .from("scheduled_sms_messages")
      .update({
        scheduled_for: new Date(scheduledFor).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // TODO: Also update corresponding queue_jobs.scheduled_for

    res.json({ success: true, messageId: id, newScheduledFor: scheduledFor });
  } catch (error: any) {
    console.error("[SMS Reschedule] Error:", error);
    res.status(500).json({ error: error.message });
  }
});
```

---

## 8. Worker-Web Communication

### 8.1 Communication Patterns

Based on existing architecture, use these patterns:

**Web → Worker (Queue Jobs):**

- Web app calls Railway worker HTTP API
- Worker creates `queue_jobs` entries
- Worker processes jobs asynchronously

**Worker → Web (Realtime Notifications):**

- Worker publishes to Supabase Realtime channels
- Web subscribes to user-specific channels
- Events: `sms_scheduled`, `sms_sent`, `sms_failed`

**Web → Worker (Direct Updates):**

- Web app calls Railway worker endpoints
- Authentication: CORS (allowed origins)
- Endpoints: `/sms/scheduled/:id/regenerate`, `/sms/scheduled/:id/cancel`

### 8.2 Realtime Events

**File**: `/apps/worker/src/workers/dailySmsWorker.ts`

```typescript
// After creating scheduled messages, notify user
const channel = supabase.channel(`user:${userId}`);
await channel.send({
  type: "broadcast",
  event: "sms_scheduled",
  payload: {
    userId,
    count: scheduledMessages.length,
    date: briefDate,
    messages: scheduledMessages.map((m) => ({
      id: m.id,
      eventTitle: m.event_title,
      scheduledFor: m.scheduled_for,
    })),
  },
});
```

**File**: `/apps/web/src/lib/services/realtimeSms.service.ts` (new)

```typescript
import { createBrowserClient } from "@buildos/supabase-client";
import { writable } from "svelte/store";

export interface ScheduledSMSEvent {
  userId: string;
  count: number;
  date: string;
  messages: Array<{
    id: string;
    eventTitle: string;
    scheduledFor: string;
  }>;
}

class RealtimeSMSService {
  private supabase = createBrowserClient();
  private channel: any = null;

  // Store for UI updates
  public scheduledSMS = writable<ScheduledSMSEvent | null>(null);

  subscribe(userId: string) {
    // Unsubscribe from existing channel
    if (this.channel) {
      this.channel.unsubscribe();
    }

    // Subscribe to user-specific channel
    this.channel = this.supabase.channel(`user:${userId}`);

    this.channel
      .on("broadcast", { event: "sms_scheduled" }, (payload: any) => {
        console.log("[RealtimeSMS] SMS scheduled:", payload);
        this.scheduledSMS.set(payload.payload);
      })
      .on("broadcast", { event: "sms_sent" }, (payload: any) => {
        console.log("[RealtimeSMS] SMS sent:", payload);
        // Update UI
      })
      .on("broadcast", { event: "sms_failed" }, (payload: any) => {
        console.error("[RealtimeSMS] SMS failed:", payload);
        // Show error to user
      })
      .subscribe();

    return this;
  }

  unsubscribe() {
    if (this.channel) {
      this.channel.unsubscribe();
      this.channel = null;
    }
  }
}

export const realtimeSMSService = new RealtimeSMSService();
```

### 8.3 Railway Worker Configuration

**Environment Variables:**

```bash
# Worker (.env)
PUBLIC_APP_URL=https://build-os.com
RAILWAY_WORKER_URL=https://worker.railway.app  # Own URL for self-reference

# Web (.env)
VITE_RAILWAY_WORKER_URL=https://worker.railway.app
```

**CORS Configuration** (already exists in `/apps/worker/src/index.ts`):

```typescript
app.use(
  cors({
    origin: [
      "https://build-os.com",
      "https://www.build-os.com",
      /localhost:\d+$/, // Any localhost port for dev
    ],
    credentials: true,
  }),
);
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

**Test File**: `/apps/worker/tests/smsMessageGenerator.test.ts`

```typescript
import { describe, it, expect } from "vitest";
import { SMSMessageGenerator } from "../src/lib/services/smsMessageGenerator";

describe("SMSMessageGenerator", () => {
  const generator = new SMSMessageGenerator();

  describe("generateEventReminder", () => {
    it("generates message under 160 characters", async () => {
      const event = {
        eventId: "test-123",
        title: "Team Standup",
        startTime: new Date(Date.now() + 15 * 60000), // 15 mins from now
        endTime: new Date(Date.now() + 30 * 60000),
        isAllDay: false,
        userTimezone: "America/Los_Angeles",
      };

      const result = await generator.generateEventReminder(event, 15);

      expect(result.content.length).toBeLessThanOrEqual(160);
      expect(result.content).toContain("Team Standup");
    });

    it("includes event details when available", async () => {
      const event = {
        eventId: "test-456",
        title: "Project Review",
        startTime: new Date(Date.now() + 30 * 60000),
        endTime: new Date(Date.now() + 60 * 60000),
        description: "Discuss Q4 roadmap and budget allocation",
        location: "Conference Room A",
        isAllDay: false,
        userTimezone: "UTC",
      };

      const result = await generator.generateEventReminder(event, 30);

      expect(result.content).toContain("Project Review");
      // Should include some detail (either location or description snippet)
      expect(
        result.content.includes("Q4") || result.content.includes("Conference"),
      ).toBe(true);
    });

    it("falls back to template when LLM fails", async () => {
      // Mock LLM service to throw error
      // ... test implementation
    });

    it("handles all-day events differently", async () => {
      const event = {
        eventId: "test-789",
        title: "Company Offsite",
        startTime: new Date(),
        endTime: new Date(),
        isAllDay: true,
        userTimezone: "America/New_York",
      };

      const result = await generator.generateEventReminder(event, 0);

      expect(result.content).toContain("Today");
      expect(result.content).toContain("Company Offsite");
    });
  });
});
```

### 9.2 Integration Tests

**Test File**: `/apps/worker/tests/dailySmsWorker.integration.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "@buildos/supabase-client";
import { processDailySMS } from "../src/workers/dailySmsWorker";

describe("Daily SMS Worker Integration", () => {
  let supabase: any;
  let testUserId: string;

  beforeAll(async () => {
    supabase = createServiceClient();

    // Create test user with SMS preferences
    const { data: user } = await supabase.auth.admin.createUser({
      email: "test-sms@example.com",
      email_confirm: true,
    });
    testUserId = user.user.id;

    // Set up SMS preferences
    await supabase.from("user_sms_preferences").insert({
      user_id: testUserId,
      phone_number: "+15555551234",
      phone_verified: true,
      event_reminders_enabled: true,
      reminder_lead_time_minutes: 15,
      timezone: "America/Los_Angeles",
    });
  });

  afterAll(async () => {
    // Clean up test data
    await supabase
      .from("scheduled_sms_messages")
      .delete()
      .eq("user_id", testUserId);
    await supabase
      .from("user_sms_preferences")
      .delete()
      .eq("user_id", testUserId);
    await supabase.auth.admin.deleteUser(testUserId);
  });

  it("schedules SMS for upcoming calendar events", async () => {
    // Create mock calendar event
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    await supabase.from("task_calendar_events").insert({
      user_id: testUserId,
      calendar_event_id: "test-event-123",
      event_title: "Test Meeting",
      event_start: tomorrow.toISOString(),
      event_end: new Date(tomorrow.getTime() + 60 * 60000).toISOString(),
      sync_status: "synced",
    });

    // Run worker
    const job = {
      id: "test-job-123",
      data: {
        userId: testUserId,
        date: tomorrow.toISOString().split("T")[0],
        timezone: "America/Los_Angeles",
      },
      updateProgress: async () => {},
    };

    await processDailySMS(job);

    // Verify scheduled message was created
    const { data: messages } = await supabase
      .from("scheduled_sms_messages")
      .select("*")
      .eq("user_id", testUserId)
      .eq("calendar_event_id", "test-event-123");

    expect(messages).toHaveLength(1);
    expect(messages[0].message_content).toContain("Test Meeting");
    expect(messages[0].status).toBe("scheduled");

    // Verify send time is 15 mins before event
    const sendTime = new Date(messages[0].scheduled_for);
    const expectedSendTime = new Date(tomorrow.getTime() - 15 * 60000);
    expect(
      Math.abs(sendTime.getTime() - expectedSendTime.getTime()),
    ).toBeLessThan(60000); // Within 1 min
  });

  it("respects quiet hours", async () => {
    // Test implementation for quiet hours logic
    // ...
  });

  it("respects daily SMS limit", async () => {
    // Test implementation for daily limit logic
    // ...
  });
});
```

### 9.3 Manual Testing Checklist

**Pre-Production Testing:**

- [ ] Create test user with SMS enabled
- [ ] Add calendar events for tomorrow
- [ ] Manually trigger scheduler: `POST /queue/schedule-daily-sms`
- [ ] Verify scheduled messages created in database
- [ ] Wait for scheduled send time (or manually trigger)
- [ ] Verify SMS received on test phone
- [ ] Modify calendar event (reschedule)
- [ ] Verify scheduled SMS updated
- [ ] Delete calendar event
- [ ] Verify scheduled SMS cancelled
- [ ] Test quiet hours (set event during quiet hours)
- [ ] Test daily limit (create 11 events, verify 10th sends but 11th doesn't)
- [ ] Test opt-out (disable SMS, verify no messages scheduled)

---

## 10. Rollout Plan

### Phase 1: Internal Testing (Week 4)

**Goal**: Validate system with internal team

- Deploy to staging environment
- Enable for 5 internal users
- Monitor for 1 week
- Collect feedback on message quality and timing

**Success Criteria**:

- 95%+ message delivery rate
- <5% user complaints about message timing
- No system errors or crashes

### Phase 2: Limited Beta (Week 5)

**Goal**: Test with friendly users

- Enable for 50 beta users (opt-in)
- A/B test LLM vs template messages
- Monitor LLM costs and delivery rates
- Iterate on prompts based on feedback

**Success Criteria**:

- 90%+ user satisfaction with message content
- LLM cost <$0.01 per user per day
- 98%+ message delivery rate

### Phase 3: Gradual Rollout (Week 6-8)

**Goal**: Scale to all users

**Week 6**: 10% of users (random sample)
**Week 7**: 50% of users
**Week 8**: 100% of users (opt-in)

**Monitoring**:

- Daily delivery rates
- LLM costs per user
- User opt-out rates
- System performance (job processing time)

**Rollback Criteria**:

- Delivery rate <95%
- Opt-out rate >20%
- LLM costs >$0.05 per user per day
- System errors affecting >5% of users

### Phase 4: Optimization (Ongoing)

**Goal**: Improve quality and reduce costs

- A/B test different prompts
- Optimize LLM model selection (DeepSeek vs others)
- Add message personalization (user history, preferences)
- Expand to new message types (daily agenda, weekly preview)

---

## 11. Monitoring & Metrics

### 11.1 Key Metrics

**Operational Metrics:**

- Daily scheduled messages count
- Message delivery rate (sent / scheduled)
- Average time from schedule to delivery
- Failed message count and reasons
- Twilio API error rate

**Quality Metrics:**

- LLM generation success rate
- Template fallback rate
- Average message length
- User feedback (explicit ratings if we add that)

**Cost Metrics:**

- LLM cost per message
- LLM cost per user per day
- Total daily LLM spend
- Twilio SMS cost per message

**User Engagement:**

- Opt-in rate (users with SMS enabled / total users)
- Opt-out rate (users who disable after enabling)
- Calendar event coverage (events with SMS / total events)
- Click-through rate (if we add links)

### 11.2 Logging

**Log Format** (structured JSON):

```typescript
{
  timestamp: '2025-10-08T07:30:00Z',
  level: 'info',
  service: 'daily-sms-worker',
  userId: 'uuid',
  eventType: 'sms_scheduled',
  data: {
    messageId: 'uuid',
    calendarEventId: 'google-event-123',
    scheduledFor: '2025-10-08T09:45:00Z',
    generatedVia: 'llm',
    llmModel: 'deepseek/deepseek-chat',
    costUsd: 0.0001,
    messageLength: 142,
  },
}
```

**Key Log Events:**

- `sms_scheduled` - Message scheduled successfully
- `sms_sent` - Message sent via Twilio
- `sms_delivered` - Twilio confirmed delivery
- `sms_failed` - Send failed (with error)
- `sms_cancelled` - Message cancelled (event deleted)
- `sms_updated` - Message updated (event rescheduled)
- `llm_generation_failed` - LLM error, fell back to template

### 11.3 Alerts

**Critical Alerts (PagerDuty/Slack):**

- Delivery rate <90% for >1 hour
- LLM generation failure rate >50% for >30 mins
- Twilio API errors >10% of requests
- Worker service down

**Warning Alerts (Slack only):**

- LLM cost spike (>2x daily average)
- Daily SMS limit hit for >20% of users
- Opt-out rate spike (>10% in 24h)
- Message queue backlog >1000 jobs

---

## 12. Open Questions & Future Enhancements

### Open Questions

1. **Lead Time Customization**: Should users be able to set different lead times per event type? (e.g., 30 mins for meetings, 2 hours for deadlines)

2. **Message Type Preferences**: Should users opt-in to specific message types (reminders only, daily agenda, weekly preview)?

3. **Multi-Event Batching**: If user has 5 meetings in an hour, should we batch into one message or send 5 separate?

4. **Recurring Event Handling**: For recurring events (daily standup), should we send every instance or just once per week?

5. **Response Handling**: Should users be able to reply to SMS (e.g., "SNOOZE 10" to reschedule reminder)?

### Future Enhancements

**Phase 2 Features:**

- Daily agenda summary SMS (morning overview of all events)
- Weekly preview SMS (Sunday evening for upcoming week)
- Smart batching (combine multiple events into one message)
- User feedback loop ("Was this helpful? Y/N")

**Phase 3 Features:**

- AI-powered send time optimization (learn when user prefers reminders)
- Context-aware messages (include recent tasks, notes from last meeting)
- Two-way SMS (snooze, confirm attendance, reschedule)
- Integration with other productivity features (brain dump, tasks)

**Phase 4 Features:**

- Voice call reminders for high-priority events
- WhatsApp support (in addition to SMS)
- Smart escalation (SMS → call if no response)
- Personalized tone/style based on user preferences

---

## 13. Related Research Documents

All research gathered for this spec is available in the `research/` subdirectory:

1. **Daily Brief Scheduling Patterns**: [`research/daily-brief-scheduling-patterns.md`](research/daily-brief-scheduling-patterns.md)
   - Existing scheduler patterns, timezone handling, job queuing
2. **Calendar Integration**: [`research/calendar-integration.md`](research/calendar-integration.md)
   - Event fetching, data structures, timezone handling
3. **LLM Integration Patterns**: [`research/llm-integration-patterns.md`](research/llm-integration-patterns.md)
   - SmartLLMService usage, prompt engineering, cost optimization
4. **SMS Infrastructure**: [`research/sms-infrastructure.md`](research/sms-infrastructure.md)
   - Twilio integration, message tracking, delivery webhooks
5. **Database Schema**: [`research/database-schema.md`](research/database-schema.md)
   - Notification tables, queue system, SMS preferences
6. **Worker-Web Communication**: [`research/worker-web-communication.md`](research/worker-web-communication.md)
   - Bidirectional communication patterns, Realtime broadcasts, API endpoints

---

## 14. Summary & Next Steps

### Summary

This spec outlines a comprehensive **SMS Event Scheduling System** that:

1. ✅ Leverages existing BuildOS patterns (scheduler, queue, worker, Supabase)
2. 🚧 Uses AI (DeepSeek) for intelligent message generation (Phase 2)
3. ✅ Respects user preferences (timezone, quiet hours, opt-out)
4. 🚧 Syncs with calendar changes (reschedule, cancel, update) (Phase 3)
5. ✅ Maintains reliability with template fallbacks
6. ✅ Scales cost-effectively (95% cheaper than Claude)

**Key Differentiators:**

- **Context-aware**: Messages include event details, not just titles
- **Adaptive**: Updates when events change in real-time (Phase 3)
- **Intelligent**: LLM crafts helpful messages, not generic alerts (Phase 2)
- **Scalable**: Reuses proven patterns from daily brief system

### Completed Work (Phase 1) ✅

**Database Infrastructure:**

- ✅ Migration `20251008_sms_event_scheduling_system.sql` applied
- ✅ `scheduled_sms_messages` table with full schema
- ✅ RPC functions for cancellation and updates
- ✅ Queue job type registered

**Worker Service:**

- ✅ Midnight cron scheduler (`checkAndScheduleDailySMS`)
- ✅ Daily SMS worker (`dailySmsWorker.ts`)
- ✅ Template-based message generation
- ✅ Timezone-aware scheduling
- ✅ Quiet hours and daily limit enforcement

**Files Created:**

- `apps/web/supabase/migrations/20251008_sms_event_scheduling_system.sql`
- `apps/worker/src/workers/dailySmsWorker.ts`
- Updated: `apps/worker/src/scheduler.ts` (lines 567-651, 127-129)
- Updated: `apps/worker/src/worker.ts` (import and registration)
- Updated: `packages/shared-types/src/queue-types.ts`
- Updated: `packages/shared-types/src/database.schema.ts`

### Immediate Next Steps (Phase 2)

**Week 2-3: LLM Message Generation**

1. ✅ Phase 1 complete - system is functional with templates
2. ⏭️ Create `apps/worker/src/lib/services/smsMessageGenerator.ts`
3. ⏭️ Integrate `SmartLLMService` with DeepSeek model
4. ⏭️ Create prompt templates in `apps/worker/src/workers/sms/prompts.ts`
5. ⏭️ Update `dailySmsWorker.ts` to use LLM generator instead of templates
6. ⏭️ Add LLM tests for message quality

**Week 4-5: Calendar Webhook Integration (Phase 3)**

7. ⏭️ Create `apps/web/src/lib/services/scheduledSmsUpdate.service.ts`
8. ⏭️ Update calendar webhook to check for scheduled SMS
9. ⏭️ Implement event change detection (reschedule, cancel, update)
10. ⏭️ Add worker API endpoints for message updates
11. ⏭️ Integration tests for webhook flow

**Week 6-7: UI & Testing (Phases 5-6)**

12. ⏭️ Build SMS preferences UI component
13. ⏭️ Add "Upcoming Messages" preview page
14. ⏭️ Write unit tests for all components
15. ⏭️ Manual end-to-end testing

**Week 8: Production Rollout (Phase 4)**

16. ⏭️ Deploy to staging
17. ⏭️ Internal team testing (5 users)
18. ⏭️ Beta rollout (50 users)
19. ⏭️ Monitor delivery rates and costs
20. ⏭️ Gradual rollout to all users

---

**Document Status**: ✅ Phase 1 Complete
**Implementation Status**: Phase 1 Complete (Basic scheduling with templates)
**Next Phase**: Phase 2 - LLM Message Generation
**Estimated Time to Complete**: 2-3 weeks (Phases 2-6)
**Risk Level**: Low (Phase 1 validates core architecture)
