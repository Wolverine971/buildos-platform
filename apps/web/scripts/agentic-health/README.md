# Agentic chat production health

Run the WP-1 production telemetry report from the repository root:

```sh
pnpm agentic:health --since 2026-09-03T17:44:36Z
pnpm agentic:health --since 2026-09-03T17:44:36Z --until 2026-09-10T17:44:36Z --user <uuid>
```

The command only issues `select` queries. It prints the audit comparison and writes an
aggregate-only JSON file under the gitignored `apps/web/output/agentic-health/` directory unless
`--output` is provided. The artifact contains no message text, email addresses, credentials, or
turn identifiers.

The first acceptance report must use at least seven full days after the production deployment.
Until then, `window.mature_seven_day_window` is false and the report is provisional. Use DJ's user
UUID for the Tracker 80 acceptance run so the sanitizer's last-76-replies metric matches the audit
baseline exactly.

Metric definitions intentionally preserve the audit's comparability choices:

- reviewer cache is the cached-token share of reviewer prompt tokens; call hit rate is also kept in
  JSON;
- control share is control tool executions divided by all tool executions;
- a completed turn after a `provider_tool_not_allowlisted` provider receipt is an inferred surface
  repair when no explicit `surface_repair` receipt exists;
- legacy execution-mode share is the durable proxy for transport renegotiation;
- throttle delay is `scheduled_for - updated_at` and only nonnegative samples are scored.
