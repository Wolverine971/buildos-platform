-- supabase/migrations/20260204_001_add_project_invite_event_type.sql
-- Allow project invite accepted notifications in notification_events

ALTER TABLE notification_events
  DROP CONSTRAINT IF EXISTS notification_events_event_type_check;

ALTER TABLE notification_events
  ADD CONSTRAINT notification_events_event_type_check
  CHECK (event_type IN (
    'user.signup',
    'user.trial_expired',
    'payment.failed',
    'error.critical',
    'brief.completed',
    'brief.failed',
    'brain_dump.processed',
    'task.due_soon',
    'project.phase_scheduled',
    'calendar.sync_failed',
    'project.invite.accepted'
  ));
