<!-- docs/business/sales/consumption-pricing-endpoint-audit.md -->

# Consumption Pricing Frozen-Route Audit

**Date:** 2026-02-18  
**Scope:** Mutating API endpoints (`POST`, `PUT`, `PATCH`, `DELETE`) under `apps/web/src/routes/api/**/+server.ts`.

## 1. Guarding Rule

Frozen enforcement now applies only when all are true:

1. request is mutating
2. path is `/api/**`
3. path is not explicitly allowed
4. endpoint classifies as:
    - `ai_compute` OR
    - `workspace_write`

Unknown/non-workspace mutations (`other_mutation`) are not blocked by the freeze guard.

## 2. Route Audit Summary

- Total mutating endpoint files/routes audited: **160**
- Explicitly allowed while frozen: **17**
- Classified `ai_compute`: **15**
- Classified `workspace_write`: **83**
- Classified `other_mutation`: **62**
- Effective guarded endpoints (after allowlist + cron exclusion): **98**

## 3. Allowed While Frozen

Allowed prefixes:

- `/api/stripe/`
- `/api/auth/`
- `/api/webhooks/`
- `/api/public/`
- `/api/billing/`
- `/api/account/`
- `/api/users/preferences/`
- `/api/users/calendar-preferences/`
- `/api/notification-preferences/`
- `/api/sms/preferences/`
- `/api/sms/verify/`
- `/api/feedback/`
- `/api/visitors/`

These are account, billing, auth, comms, and non-workspace flows.

## 4. Blocked Classes

`ai_compute` prefixes:

- `/api/agent/`
- `/api/agentic-chat/`
- `/api/chat/`
- `/api/tree-agent/`
- `/api/transcribe`
- `/api/braindumps/generate`
- `/api/braindumps/stream`
- `/api/daily-briefs/generate`

`workspace_write` prefixes:

- `/api/onto/`
- `/api/projects/`
- `/api/tasks/`
- `/api/braindumps/`
- `/api/daily-briefs/`
- `/api/brief-templates/`
- `/api/project-briefs/`
- `/api/templates/`
- `/api/notes/`
- `/api/time-blocks/`
- `/api/voice-notes/`
- `/api/voice-note-groups/`
- `/api/calendar/`

## 5. Residual Unmapped `other_mutation`

Mostly admin/internal or non-workspace product actions:

- `/api/admin/**`
- `/api/beta/signup`
- `/api/brief-jobs/**`
- `/api/brief-preferences`
- `/api/homework/**`
- `/api/onboarding`
- `/api/queue-jobs/:id`
- `/api/search/**`
- `/api/sms/metrics/alerts`
- `/api/sms/scheduled/:id`

These remain intentionally unblocked by consumption freeze unless reclassified in a future slice.
