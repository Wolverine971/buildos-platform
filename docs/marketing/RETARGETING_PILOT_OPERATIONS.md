<!-- docs/marketing/RETARGETING_PILOT_OPERATIONS.md -->

# BuildOS Retargeting Pilot Operations

_Founder-led workflow for the dormant-user reactivation pilot_

This implementation keeps v1 manual and auditable:

- cohort freeze, holdout assignment, and batching are persisted in
  `retargeting_founder_pilot_members`
- sends still go through `EmailService.sendEmail()`
- campaign metadata still lands in `emails.template_data` and `email_logs.metadata`
- follow-up candidate selection is computed from tracked sends plus product activity

## Endpoints

### Freeze a cohort

`POST /api/admin/retargeting/cohorts`

Example body:

```json
{
	"campaign_id": "buildos-reactivation-founder-pilot-v1",
	"cohort_id": "founder-pilot-2026-03",
	"batch_size": 25,
	"holdout_users_if_small": 10,
	"holdout_pct_if_large": 0.1,
	"conversion_window_days": 14
}
```

What it does:

- freezes the eligible dormant-user cohort
- assigns deterministic holdout users
- assigns sendable users into `batch_01`, `batch_02`, and so on

### Review the frozen cohort

`GET /api/admin/retargeting/cohorts?campaign_id=buildos-reactivation-founder-pilot-v1&cohort_id=founder-pilot-2026-03`

Optional filters:

- `batch_id=batch_01`
- `include_holdout=false`

### Mark manual stop or reply state

`PATCH /api/admin/retargeting/members/:id`

Example body:

```json
{
	"reply_status": "replied",
	"manual_stop": true,
	"manual_stop_reason": "Founder handled reply manually"
}
```

Use this before Touch 2 / Touch 3 when someone replied or should be suppressed.

### Preview or send a touch

`POST /api/admin/retargeting/send`

Touch 1 preview:

```json
{
	"campaign_id": "buildos-reactivation-founder-pilot-v1",
	"cohort_id": "founder-pilot-2026-03",
	"batch_id": "batch_01",
	"step": "touch_1",
	"dry_run": true
}
```

Touch 1 send:

```json
{
	"campaign_id": "buildos-reactivation-founder-pilot-v1",
	"cohort_id": "founder-pilot-2026-03",
	"batch_id": "batch_01",
	"step": "touch_1"
}
```

Touch 2 send requires a real demo URL:

```json
{
	"campaign_id": "buildos-reactivation-founder-pilot-v1",
	"cohort_id": "founder-pilot-2026-03",
	"batch_id": "batch_01",
	"step": "touch_2",
	"demo_url": "https://example.com/real-demo"
}
```

Behavior:

- `touch_1` sends to unsent, non-holdout members in the requested batch
- `touch_2` only targets members sent Touch 1 at least 72 hours ago with no tracked post-send activity
- `touch_3` only targets engaged non-converters at least 7 days after Touch 1

### Review outcomes

`GET /api/admin/retargeting/report?campaign_id=buildos-reactivation-founder-pilot-v1&cohort_id=founder-pilot-2026-03`

The report returns:

- per-member sends, opens, clicks, and live outcome fields
- summary rows for send group vs holdout

## Batch 01 Workflow

1. Freeze the cohort with `POST /api/admin/retargeting/cohorts`.
2. Review `batch_01` with `GET /api/admin/retargeting/cohorts?...&batch_id=batch_01&include_holdout=false`.
3. Mark any manual suppressions with `PATCH /api/admin/retargeting/members/:id`.
4. Dry-run Touch 1 with `POST /api/admin/retargeting/send` and `"dry_run": true`.
5. Send Touch 1 for `batch_01`.
6. After ~72 hours, dry-run/send Touch 2 for the same batch with a real `demo_url`.
7. After 7-10 days from Touch 1, use Touch 3 selectively for engaged non-converters.
8. Review `GET /api/admin/retargeting/report` against the holdout.

## Metric Definitions

- `return_session`: earliest tracked post-anchor activity within the member's conversion window
- `first_action`: earliest post-anchor `onto_braindumps` or `onto_project_logs` activity within the member's conversion window
- `multi_day_usage`: activity on 2+ distinct days within 30 days of the anchor

Anchor rules:

- send group: first retargeting send timestamp
- holdout: cohort freeze timestamp

## Post-Click Path

Retargeting links now land on `/welcome-back` instead of dropping dormant users into the generic app.

The page:

- preserves campaign params through login
- explains what changed
- gives one recommended 5-minute test
- sends the user into BuildOS with the same params preserved
