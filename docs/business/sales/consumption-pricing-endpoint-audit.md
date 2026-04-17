<!-- docs/business/sales/consumption-pricing-endpoint-audit.md -->

# Consumption Pricing Frozen-Route Audit

**Date:** 2026-04-17  
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

- Total mutating endpoint files/routes audited: **191**
- Explicitly allowed while frozen: **19**
- Cron routes excluded before guard evaluation: **1**
- Classified `ai_compute`: **13**
- Classified `workspace_write`: **93**
- Classified `other_mutation`: **85**
- Effective guarded endpoints (after allowlist + cron exclusion): **106**

Current verification:

- Legacy Brain Dump routes under `/api/braindumps/**` are deleted and no longer appear in the frozen-route matrix.
- `/api/onto/braindumps/**` remains by design as the agent ontology-capture/history pipeline. It is guarded as `workspace_write` through `/api/onto/`.
- Agentic chat remains guarded through `/api/agent/`; the v2 stream path records usage with `operationType: 'agentic_chat_v2_stream'`.
- Freeze state is driven by aggregate successful `llm_usage_logs.total_tokens` in `evaluate_user_consumption_gate()`, not by brain-dump-specific endpoint counters.

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
- `/api/daily-briefs/generate`

`workspace_write` prefixes:

- `/api/onto/`
- `/api/projects/`
- `/api/tasks/`
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

Mostly admin/internal, account-adjacent, telemetry, profile, or read-via-POST product actions:

- `/api/admin/**`
- `/api/agent-call/**`
- `/api/beta/signup`
- `/api/brief-jobs/**`
- `/api/brief-preferences`
- `/api/error-tracking/client`
- `/api/homework/**`
- `/api/notification-tracking/**`
- `/api/onboarding`
- `/api/profile/**`
- `/api/queue-jobs/:id`
- `/api/search/**`
- `/api/sms/metrics/alerts`
- `/api/sms/scheduled/:id`

These remain intentionally unblocked by consumption freeze unless reclassified in a future slice.

## 6. Open Follow-Up

No Brain Dump-specific billing-route work remains in this file. The remaining decision is broader than Brain Dump: confirm whether `/api/agent-call/**` and `/api/profile/**` should stay as `other_mutation`.

- `/api/agent-call/buildos` can execute external agent gateway tool calls after bearer-token auth inside the handler. If those tools can write workspace data for a frozen user, add a service-level consumption gate keyed from the authenticated caller user, because the global hook guard only sees cookie-backed Svelte sessions.
- `/api/profile/**` mutates living profile, contacts, chapters, and fragment state. If frozen accounts should also block profile-context writes, reclassify the relevant profile prefixes as `workspace_write`; otherwise document them as account/profile management flows that remain writable.
