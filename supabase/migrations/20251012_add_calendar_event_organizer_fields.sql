-- =====================================================
-- CALENDAR EVENT ORGANIZER & ATTENDEE TRACKING
-- =====================================================
-- Stores organizer ownership flags and attendee metadata for task_calendar_events
-- Enables smarter rescheduling decisions and attendee notifications
-- =====================================================

ALTER TABLE task_calendar_events
ADD COLUMN IF NOT EXISTS organizer_email TEXT,
ADD COLUMN IF NOT EXISTS organizer_display_name TEXT,
ADD COLUMN IF NOT EXISTS organizer_self BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS attendees JSONB DEFAULT '[]'::jsonb;

-- Indexes for frequent organizer ownership checks and attendee lookups
CREATE INDEX IF NOT EXISTS idx_task_calendar_events_organizer_self
ON task_calendar_events(organizer_self);

CREATE INDEX IF NOT EXISTS idx_task_calendar_events_attendees
ON task_calendar_events USING GIN(attendees);

-- Documentation
COMMENT ON COLUMN task_calendar_events.organizer_email IS
'Email address of the calendar event organizer as returned by the external calendar provider.';

COMMENT ON COLUMN task_calendar_events.organizer_display_name IS
'Display name of the calendar event organizer.';

COMMENT ON COLUMN task_calendar_events.organizer_self IS
'TRUE when the authenticated BuildOS user is the organizer (owns the event). NULL when unknown.';

COMMENT ON COLUMN task_calendar_events.attendees IS
'JSON array of attendee objects (email, displayName, responseStatus, organizer, self, comment, additionalGuests).';

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
