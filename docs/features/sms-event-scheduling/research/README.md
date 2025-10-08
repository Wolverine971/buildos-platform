# SMS Event Scheduling - Research Documentation

This directory contains detailed research gathered during the design phase of the SMS Event Scheduling System. These documents provide deep technical context for the implementation.

## Research Documents

### Core Architecture

**[Daily Brief Scheduling Patterns](./daily-brief-scheduling-patterns.md)**

- Existing scheduler architecture and cron patterns
- Timezone-aware scheduling with `date-fns-tz`
- Job queuing and deduplication strategies
- Engagement backoff system
- Progress tracking patterns
- Error handling and retry logic

**Key Takeaways:**

- Reusable `calculateNextRunTime()` function for timezone handling
- Supabase queue with atomic job claiming (no Redis needed)
- 5-minute sync loop prevention window
- Environment-based configuration (dev vs prod)

---

**[Worker-Web Communication](./worker-web-communication.md)**

- Bidirectional communication patterns
- Supabase Realtime for worker → web notifications
- HTTP API for web → worker job queuing
- CORS-based authentication (no API keys needed)
- Database as single source of truth

**Key Takeaways:**

- Use Realtime broadcasts for job completion notifications
- Direct HTTP calls for job queuing
- Stateless worker design (reads from database)
- Railway worker endpoints: `/queue/brief`, `/jobs/:id`

---

### Data & Integration

**[Calendar Integration](./calendar-integration.md)**

- `CalendarService` API for fetching events
- Database schema for calendar sync (`task_calendar_events`)
- Google Calendar API data structures
- Timezone handling for events
- Recurring event support
- Event-to-entity linking patterns

**Key Takeaways:**

- Use `CalendarService.getCalendarEvents()` with timezone param
- All timestamps stored as `TIMESTAMPTZ` (UTC internally)
- Rich event data available (description, location, attendees, hangoutLink)
- Bidirectional sync with conflict prevention

---

**[Database Schema](./database-schema.md)**

- Notification system tables (`notification_events`, `notification_deliveries`, `user_notification_preferences`)
- Queue system (`queue_jobs`) with priority and retry logic
- SMS tables (`sms_messages`, `sms_templates`, `user_sms_preferences`)
- Status tracking patterns and timestamp progression
- Relationship diagrams

**Key Takeaways:**

- Use existing `sms_messages.scheduled_for` for scheduling
- Leverage `queue_jobs` for processing scheduled messages
- Phone verification required via `get_user_sms_channel_info()` helper
- Quiet hours schema exists but NOT currently enforced (enhancement opportunity)

---

### Services & Infrastructure

**[LLM Integration Patterns](./llm-integration-patterns.md)**

- `SmartLLMService` architecture
- Model selection strategy (DeepSeek primary, fallback chain)
- Prompt engineering best practices
- Temperature and configuration recommendations
- Cost optimization strategies
- Error handling and retry patterns

**Key Takeaways:**

- Use DeepSeek Chat V3 for 95% cost savings vs Claude
- Temperature 0.6 for SMS generation (balanced creativity)
- Max tokens: 100 (~160 chars)
- Template-based fallbacks for reliability
- Profile system: `speed`, `balanced`, `quality`, `creative`

---

**[SMS Infrastructure](./sms-infrastructure.md)**

- Twilio service implementation (`/packages/twilio-service`)
- `TwilioClient` and `SMSService` architecture
- Database schema for SMS tracking
- Twilio native scheduling (< 7 days)
- Delivery tracking via webhooks
- Rate limiting and quiet hours logic

**Key Takeaways:**

- Use `queue_sms_message()` RPC for atomic queueing
- Webhook signature validation required
- Template rendering with `{{variable}}` syntax
- Dual-table updates: `sms_messages` + `notification_deliveries`
- Click tracking via URL shortening

---

## How to Use This Research

### For Implementation

1. **Start here**: Review the main [SMS Event Scheduling Spec](../README.md)
2. **Architecture questions**: Refer to scheduler patterns and worker-web communication
3. **Database design**: Use database schema research for table definitions
4. **Service integration**: Reference LLM patterns and SMS infrastructure

### For Maintenance

- **Debugging scheduler issues**: See daily-brief-scheduling-patterns.md
- **Calendar sync problems**: See calendar-integration.md
- **SMS delivery issues**: See sms-infrastructure.md
- **LLM prompt optimization**: See llm-integration-patterns.md

### For Extensions

- **New message types**: Use LLM patterns for prompt design
- **Advanced scheduling**: See scheduler patterns for timezone handling
- **Calendar event types**: See calendar integration for data structures
- **Communication patterns**: See worker-web communication for realtime updates

---

## Research Methodology

All research was conducted via:

1. **Codebase analysis**: Read existing implementations
2. **Pattern extraction**: Identified reusable patterns
3. **Database exploration**: Analyzed schemas and migrations
4. **Documentation review**: Studied existing feature docs
5. **Flow tracing**: Followed data flows end-to-end

**Research Date**: October 8, 2025
**Git Commit**: `9088e078fb6777ffb024690855c83760f77d31c9`
**Branch**: main

---

## Quick Reference

| Question                                 | See Document                                |
| ---------------------------------------- | ------------------------------------------- |
| How does timezone-aware scheduling work? | daily-brief-scheduling-patterns.md          |
| What LLM model should I use?             | llm-integration-patterns.md                 |
| How do I fetch calendar events?          | calendar-integration.md                     |
| What's the SMS message schema?           | database-schema.md                          |
| How do I send SMS via Twilio?            | sms-infrastructure.md                       |
| How does web app talk to worker?         | worker-web-communication.md                 |
| What about quiet hours enforcement?      | database-schema.md (⚠️ not implemented yet) |
| How to handle calendar event changes?    | calendar-integration.md                     |

---

**Note**: These research documents are supplementary. The main specification in `../README.md` contains everything needed for implementation. Use these for deeper technical context and implementation details.
