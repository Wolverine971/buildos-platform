<!-- docs/marketing/growth/posthog-analytics-health-log-2026-07-02.md -->

# PostHog Analytics Health Log - 2026-07-02

Purpose: one-week verification trail for the BuildOS PostHog rollout and the
`BuildOS Activation` dashboard.

Follow-up window: 2026-07-09 through 2026-07-15.

## Runtime Health Log

Runtime capture wrappers now emit a structured log prefix for the eight funnel
events:

```text
[posthog-health]
```

Expected statuses:

| Status     | Meaning                                                          |
| ---------- | ---------------------------------------------------------------- |
| `captured` | Immediate capture completed in a server runtime                  |
| `queued`   | Worker event was queued into the PostHog client batch            |
| `skipped`  | Capture did not run, usually because the PostHog key was missing |
| `error`    | PostHog capture threw; web/worker failures are persisted as logs |

Covered events:

| Event                  | Runtime log source | Expected check                                 |
| ---------------------- | ------------------ | ---------------------------------------------- |
| `signup`               | `web-server`       | PostHog Activity + `[posthog-health] captured` |
| `onboarding_started`   | `web-client`       | PostHog Activity or browser console            |
| `onboarding_completed` | `web-server`       | PostHog Activity + `[posthog-health] captured` |
| `brain_dump_created`   | `web-server`       | PostHog Activity + `[posthog-health] captured` |
| `project_created`      | `shared-agent-ops` | PostHog Activity + `[posthog-health] captured` |
| `brief_generated`      | `worker`           | PostHog Activity + `[posthog-health] queued`   |
| `brief_viewed`         | `web-client`       | PostHog Activity or browser console            |
| `task_completed`       | `web-server`       | PostHog Activity + `[posthog-health] captured` |

## Error Checks

Search application logs for:

```text
[posthog-health]
[posthog] failed to capture
```

For persisted web/worker failures, query `error_logs` for:

```sql
select
  created_at,
  severity,
  user_id,
  operation_type,
  metadata->>'analyticsEvent' as analytics_event,
  error_message
from error_logs
where operation_type = 'posthog_capture'
  and created_at >= now() - interval '7 days'
order by created_at desc;
```

Pass condition: no `posthog_capture` rows with severity `warning` or higher for
the funnel events during the verification window.

## Dashboard Build Sheet

Create a PostHog dashboard named `BuildOS Activation`.

| Tile | Insight name        | Type      | Configuration                                                                                                                   | Status  |
| ---- | ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1    | Activation funnel   | Funnel    | `signup -> onboarding_completed -> brain_dump_created -> project_created`; 7-day conversion window; last 30 days                | Pending |
| 2    | Weekly active users | Trends    | Unique users; weekly; last 90 days; action/group containing `brain_dump_created`, `task_completed`, `brief_viewed`              | Pending |
| 3    | Retention after aha | Retention | First time `project_created`; return event `task_completed`; weekly                                                             | Pending |
| 4    | Signups by source   | Trends    | `signup`; total count; weekly; last 90 days; breakdown by event property `signup_source`, fallback person property `utm_source` | Pending |

## Verification Notes

- 2026-07-02: DJ reports PostHog keys, migration, and generated types are likely
  already complete. Not re-confirmed in this thread.
- 2026-07-02: One-time follow-up created for 2026-07-09 to review one week of
  event flow and dashboard data quality.
