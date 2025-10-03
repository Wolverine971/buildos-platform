# Calendar Integration Feature

Google Calendar sync with bidirectional updates for task scheduling and availability awareness.

## Documentation in This Folder

- `calendar-ingestion-integration-plan.md` - Original integration plan
- `calendar-analysis-implementation-status.md` - Implementation status
- `calendar-ingestion-buildos-implementation.md` - Detailed implementation guide
- `calendar-cleanup-phase-regeneration-analysis.md` - Phase regeneration analysis
- `calendar-analysis-bugs-investigation.md` - Bug investigation notes
- `calendar-analysis-task-improvement-research.md` - Task improvement research

## Features

- **OAuth Integration**: Google Calendar OAuth flow
- **Event Sync**: Two-way sync with Google Calendar
- **Webhook Notifications**: Real-time calendar change notifications
- **Project Calendars**: Per-project Google Calendar creation
- **Conflict Detection**: Identifies scheduling conflicts
- **Smart Scheduling**: Tasks scheduled around calendar commitments

## Key Files

**Services:**
- `/src/lib/services/calendar-service.ts` - Main calendar operations
- `/src/lib/services/calendar-webhook-service.ts` - Webhook handling

**Components:**
- `/src/lib/components/calendar/` - Calendar UI components

**API:**
- `/src/routes/api/calendar/` - Calendar API endpoints
- `/src/routes/api/webhooks/calendar/` - Webhook endpoints

## Related Documentation

- Architecture: `/apps/web/docs/technical/architecture/calendar-sync.md`
- Calendar service flow: `/apps/web/docs/technical/architecture/CALENDAR_SERVICE_FLOW.md`
- Webhook flow: `/apps/web/docs/technical/architecture/CALENDAR_WEBHOOK_FLOW.md`
