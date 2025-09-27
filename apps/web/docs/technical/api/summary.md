# API Documentation Summary

Generated: 2025-09-27T04:23:00.938Z
Total routes: 134

## Routes by category:

### account
- PUT /api/account/password
- PUT, DELETE /api/account/settings

### admin
- GET /api/admin/analytics/brief-stats
- GET /api/admin/analytics/comprehensive
- GET /api/admin/analytics/daily-signups
- GET /api/admin/analytics/daily-users
- GET /api/admin/analytics/daily-visitors
- GET /api/admin/analytics/export
- GET /api/admin/analytics/overview
- GET /api/admin/analytics/recent-activity
- GET /api/admin/analytics/system-metrics
- GET /api/admin/analytics/template-usage
- GET /api/admin/analytics/visitor-overview
- GET, PATCH /api/admin/beta/feedback
- GET, PATCH /api/admin/beta/members
- GET /api/admin/beta/overview
- GET, PATCH /api/admin/beta/signups
- GET /api/admin/calendar-errors
- GET, POST /api/admin/emails
- GET, PATCH, DELETE /api/admin/emails/{id}
- POST /api/admin/emails/{id}/send
- GET, POST, DELETE /api/admin/emails/attachments
- POST /api/admin/emails/generate
- GET, POST /api/admin/emails/recipients
- POST /api/admin/emails/send
- GET /api/admin/errors
- POST /api/admin/errors/{id}/resolve
- GET, PATCH /api/admin/feedback
- GET /api/admin/feedback/overview
- GET /api/admin/revenue
- GET /api/admin/revenue/export
- GET /api/admin/subscriptions/overview
- GET, POST /api/admin/subscriptions/users
- GET, PATCH /api/admin/users
- GET /api/admin/users/{id}/context
- GET /api/admin/users/{userId}/activity

### agent
- POST, GET /api/agent/google-calendar

### analytics
- GET /api/analytics/briefs

### auth
- POST /api/auth/login
- POST /api/auth/register
- GET /api/auth/user

### beta
- POST, GET /api/beta/signup

### braindumps
- GET /api/braindumps
- GET, PUT, DELETE /api/braindumps/{id}
- PATCH, DELETE /api/braindumps/{id}/link
- GET /api/braindumps/contribution-data
- GET, POST, PATCH /api/braindumps/draft
- PATCH /api/braindumps/draft/status
- POST /api/braindumps/generate
- GET /api/braindumps/init
- POST /api/braindumps/stream
- POST /api/braindumps/stream-short

### brief-jobs
- GET /api/brief-jobs
- GET /api/brief-jobs/{id}
- POST /api/brief-jobs/cancel
- GET /api/brief-jobs/next-scheduled

### brief-preferences
- GET, POST, PUT /api/brief-preferences

### brief-templates
- GET, POST /api/brief-templates/project
- GET, PUT, DELETE /api/brief-templates/project/{id}

### calendar
- POST, GET /api/calendar
- POST, GET /api/calendar/process
- GET /api/calendar/projects
- POST /api/calendar/remove-task
- GET /api/calendar/retry-failed
- POST, DELETE /api/calendar/webhook

### cron
- GET /api/cron/dunning
- POST /api/cron/renew-webhooks
- GET /api/cron/trial-reminders

### daily-briefs
- GET /api/daily-briefs
- GET, PUT, DELETE /api/daily-briefs/{id}
- POST /api/daily-briefs/cancel
- POST, GET /api/daily-briefs/generate
- GET /api/daily-briefs/history
- GET /api/daily-briefs/progress
- GET /api/daily-briefs/search
- GET /api/daily-briefs/stats
- GET /api/daily-briefs/status

### dashboard
- GET /api/dashboard
- GET /api/dashboard/bottom-sections

### email-tracking
- GET /api/email-tracking/{tracking_id}

### feedback
- POST /api/feedback

### health
- GET /api/health

### notes
- POST, GET /api/notes
- PUT, DELETE, GET /api/notes/{id}
- PATCH, DELETE /api/notes/{id}/link

### onboarding
- POST /api/onboarding

### phases-jobs
- GET, POST /api/phases-jobs

### project-briefs
- GET /api/project-briefs
- GET, DELETE /api/project-briefs/{id}

### projects
- GET, POST /api/projects
- GET, PUT, DELETE /api/projects/{id}
- GET /api/projects/{id}/briefs
- GET /api/projects/{id}/briefs/latest
- GET, POST, PUT, DELETE /api/projects/{id}/calendar
- GET /api/projects/{id}/calendar-status
- POST /api/projects/{id}/calendar/share
- POST /api/projects/{id}/calendar/sync
- DELETE /api/projects/{id}/delete
- GET /api/projects/{id}/details
- POST, PUT, GET /api/projects/{id}/generate-brief-template
- GET /api/projects/{id}/history
- GET /api/projects/{id}/notes
- GET, POST, PUT, PATCH, DELETE /api/projects/{id}/phases
- PATCH, DELETE /api/projects/{id}/phases/{phaseId}
- POST, DELETE /api/projects/{id}/phases/{phaseId}/schedule
- POST /api/projects/{id}/phases/generate
- POST /api/projects/{id}/phases/preview
- POST /api/projects/{id}/phases/tasks
- GET /api/projects/{id}/questions/random
- GET /api/projects/{id}/stats
- POST, GET, PUT, DELETE /api/projects/{id}/synthesize
- POST /api/projects/{id}/synthesize/apply
- POST, GET /api/projects/{id}/tasks
- PATCH, DELETE /api/projects/{id}/tasks/{taskId}
- GET /api/projects/{id}/tasks/{taskId}/calendar-status
- POST /api/projects/{id}/tasks/assign-backlog
- PATCH, GET /api/projects/{id}/tasks/batch
- POST /api/projects/{id}/tasks/reschedule-overdue
- POST /api/projects/{id}/tasks/unschedule-all
- GET /api/projects/briefs-count
- GET /api/projects/list
- GET /api/projects/search

### queue-jobs
- GET, DELETE /api/queue-jobs/{id}

### search
- POST /api/search
- POST /api/search/more

### stripe
- POST /api/stripe/checkout
- GET /api/stripe/invoice/{id}/download
- POST /api/stripe/portal
- POST /api/stripe/webhook

### tasks
- GET, PATCH, DELETE /api/tasks/{id}/recurrence

### templates
- GET, POST, PUT, DELETE /api/templates

### transcribe
- POST /api/transcribe

### users
- GET, PUT /api/users/calendar-preferences

### visitors
- POST /api/visitors
