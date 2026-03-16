<!-- docs/marketing/RETARGETING_PILOT_RUNBOOK.md -->

# BuildOS Retargeting Pilot Runbook

_Actual cohort query, batching workflow, and follow-up queries for the founder-led reactivation pilot_

**Campaign ID:** `buildos-reactivation-founder-pilot-v1`  
**Motion:** Manual founder-led  
**Default batch size:** `25`  
**Default holdout:** `10 users` if cohort `< 100`, otherwise `10%`

---

## Purpose

This runbook turns the strategy in
`/docs/marketing/RETARGETING_CAMPAIGN_STRATEGY.md`
into a measurable pilot.

The workflow assumes:

- cohort selection is done manually from SQL output
- sends still go through the tracked BuildOS email pipeline
- replies are handled manually by the founder
- manual QA happens before any send

---

## Tracking Metadata

Stamp the following metadata on every send in `emails.template_data`:

```json
{
	"campaign_id": "buildos-reactivation-founder-pilot-v1",
	"cohort_id": "founder-pilot-2026-03",
	"batch_id": "batch_01",
	"step": "1",
	"variant": "A",
	"send_type": "manual_founder_led",
	"holdout": false,
	"conversion_window_days": 14
}
```

For links, append:

- `utm_source=retargeting`
- `utm_medium=email`
- `utm_campaign=buildos-reactivation-founder-pilot`
- `utm_content=step-1|step-2|step-3`
- `campaign_id`
- `cohort_id`
- `batch_id`
- `step`
- `variant`

---

## Query 1: Build Cohort

This query builds the candidate cohort, assigns a deterministic rank, and marks holdout users.

```sql
WITH params AS (
  SELECT
    'buildos-reactivation-founder-pilot-v1'::text AS campaign_id,
    'founder-pilot-2026-03'::text AS cohort_id,
    NOW()::timestamptz AS cohort_frozen_at,
    25::int AS batch_size,
    10::int AS holdout_users_if_small,
    0.10::numeric AS holdout_pct_if_large
),
activity AS (
  SELECT user_id, created_at, 'agent_chat_session' AS activity_type
  FROM agent_chat_sessions

  UNION ALL

  SELECT user_id, created_at, 'braindump' AS activity_type
  FROM onto_braindumps

  UNION ALL

  SELECT changed_by AS user_id, created_at, 'project_log' AS activity_type
  FROM onto_project_logs

  UNION ALL

  SELECT user_id, created_at, 'daily_brief' AS activity_type
  FROM ontology_daily_briefs
  WHERE generation_status = 'completed'
),
activity_rollup AS (
  SELECT
    u.id AS user_id,
    MIN(a.created_at) AS first_activity_at,
    MAX(a.created_at) AS last_meaningful_activity_at,
    COUNT(a.created_at) AS lifetime_activity_count,
    COUNT(a.created_at) FILTER (
      WHERE a.created_at >= u.created_at
        AND a.created_at < u.created_at + INTERVAL '14 days'
    ) AS first_14d_activity_count
  FROM users u
  LEFT JOIN activity a
    ON a.user_id = u.id
  GROUP BY u.id
),
email_touchpoints AS (
  SELECT
    u.id AS user_id,
    el.sent_at,
    el.status
  FROM users u
  JOIN email_logs el
    ON lower(el.to_email) = lower(u.email)

  UNION ALL

  SELECT
    u.id AS user_id,
    er.sent_at,
    er.status
  FROM users u
  JOIN email_recipients er
    ON lower(er.recipient_email) = lower(u.email)
),
email_rollup AS (
  SELECT
    user_id,
    MAX(sent_at) FILTER (
      WHERE status IN ('sent', 'delivered', 'opened', 'clicked')
    ) AS last_outbound_email_at,
    BOOL_OR(status IN ('bounced', 'complaint')) AS has_bad_email_history,
    BOOL_OR(status = 'bounced') AS has_bounced_recipient
  FROM email_touchpoints
  GROUP BY user_id
),
eligible AS (
  SELECT
    p.campaign_id,
    p.cohort_id,
    p.cohort_frozen_at,
    u.id AS user_id,
    u.email,
    u.name,
    u.created_at,
    u.updated_at,
    u.last_visit,
    u.is_beta_user,
    u.onboarding_intent,
    u.onboarding_stakes,
    u.usage_archetype,
    unp.email_enabled,
    ar.first_activity_at,
    ar.last_meaningful_activity_at,
    ar.lifetime_activity_count,
    ar.first_14d_activity_count,
    er.last_outbound_email_at,
    GREATEST(
      COALESCE(ar.last_meaningful_activity_at, TIMESTAMPTZ '1900-01-01'),
      COALESCE(u.last_visit, TIMESTAMPTZ '1900-01-01')
    ) AS last_seen_at,
    CASE
      WHEN COALESCE(ar.first_14d_activity_count, 0) = 0 THEN 'signed_up_barely_used'
      WHEN COALESCE(ar.first_14d_activity_count, 0) <= 3 THEN 'tried_briefly_then_disappeared'
      ELSE 'used_for_a_while_then_went_dormant'
    END AS pilot_segment,
    md5(u.id::text || ':' || p.campaign_id) AS deterministic_random_key
  FROM users u
  CROSS JOIN params p
  LEFT JOIN activity_rollup ar
    ON ar.user_id = u.id
  LEFT JOIN email_rollup er
    ON er.user_id = u.id
  LEFT JOIN user_notification_preferences unp
    ON unp.user_id = u.id
  WHERE u.created_at <= p.cohort_frozen_at - INTERVAL '180 days'
    AND COALESCE(u.is_admin, false) = false
    AND COALESCE(u.access_restricted, false) = false
    AND u.email !~* '(^test\\+|^dev\\+|@example\\.com$|@buildos\\.|@build-os\\.)'
    AND GREATEST(
      COALESCE(ar.last_meaningful_activity_at, TIMESTAMPTZ '1900-01-01'),
      COALESCE(u.last_visit, TIMESTAMPTZ '1900-01-01')
    ) < p.cohort_frozen_at - INTERVAL '30 days'
    AND COALESCE(unp.email_enabled, true) = true
    AND COALESCE(er.has_bad_email_history, false) = false
    AND COALESCE(er.has_bounced_recipient, false) = false
    AND (
      er.last_outbound_email_at IS NULL
      OR er.last_outbound_email_at < p.cohort_frozen_at - INTERVAL '14 days'
    )
),
ranked AS (
  SELECT
    e.*,
    COUNT(*) OVER () AS cohort_size,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE e.pilot_segment
          WHEN 'tried_briefly_then_disappeared' THEN 1
          WHEN 'signed_up_barely_used' THEN 2
          ELSE 3
        END,
        e.deterministic_random_key
    ) AS prioritized_rank
  FROM eligible e
)
SELECT
  *,
  CASE
    WHEN cohort_size < 100
      AND prioritized_rank <= LEAST(10, cohort_size) THEN true
    WHEN cohort_size >= 100
      AND prioritized_rank <= CEIL(cohort_size * 0.10) THEN true
    ELSE false
  END AS holdout
FROM ranked
ORDER BY prioritized_rank;
```

### Notes

- `email_enabled = false` is treated as an explicit global email opt-out.
- `email_logs.status IN ('bounced', 'complaint')` is treated as suppression-worthy.
- `email_recipients.status = 'bounced'` is also suppression-worthy.
- Internal/test filtering is heuristic; final manual review is still required.

---

## Query 2: Turn Cohort Into Send Batches

Save Query 1 output into a temp table or spreadsheet first.

If you are working in SQL, materialize the result as:

```sql
CREATE TEMP TABLE retargeting_founder_pilot_v1_cohort AS
SELECT *
FROM (
  -- paste Query 1 here
) q;
```

Then assign send batches:

```sql
WITH sendable AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (ORDER BY c.prioritized_rank) AS send_rank
  FROM retargeting_founder_pilot_v1_cohort c
  WHERE c.holdout = false
)
SELECT
  *,
  'batch_' || LPAD((((send_rank - 1) / 25) + 1)::text, 2, '0') AS batch_id
FROM sendable
ORDER BY send_rank;
```

### First batch only

```sql
WITH sendable AS (
  SELECT
    c.*,
    ROW_NUMBER() OVER (ORDER BY c.prioritized_rank) AS send_rank
  FROM retargeting_founder_pilot_v1_cohort c
  WHERE c.holdout = false
)
SELECT
  *,
  'batch_01' AS batch_id
FROM sendable
WHERE send_rank <= 25
ORDER BY send_rank;
```

---

## Query 3: Touch 2 Candidate List

Run this roughly 72 hours after Touch 1.

This query finds users who were sent Touch 1 and still have no tracked return/activity.
It cannot detect founder inbox replies, so remove replied users manually before sending.

```sql
WITH params AS (
  SELECT 'buildos-reactivation-founder-pilot-v1'::text AS campaign_id
),
touch_1_sent AS (
  SELECT
    u.id AS user_id,
    u.email,
    u.name,
    MAX(er.sent_at) AS touch_1_sent_at,
    BOOL_OR(er.opened_at IS NOT NULL) AS opened_touch_1
  FROM emails e
  JOIN email_recipients er
    ON er.email_id = e.id
  JOIN users u
    ON lower(u.email) = lower(er.recipient_email)
  CROSS JOIN params p
  WHERE e.template_data->>'campaign_id' = p.campaign_id
    AND e.template_data->>'step' = '1'
  GROUP BY u.id, u.email, u.name
),
touch_1_clicks AS (
  SELECT
    u.id AS user_id,
    BOOL_OR(ete.event_type = 'clicked') AS clicked_touch_1
  FROM email_tracking_events ete
  JOIN email_recipients er
    ON er.id = ete.recipient_id
  JOIN emails e
    ON e.id = ete.email_id
  JOIN users u
    ON lower(u.email) = lower(er.recipient_email)
  CROSS JOIN params p
  WHERE e.template_data->>'campaign_id' = p.campaign_id
    AND e.template_data->>'step' = '1'
  GROUP BY u.id
),
post_send_activity AS (
  SELECT
    x.user_id,
    MIN(x.created_at) AS first_post_send_activity_at
  FROM (
    SELECT t.user_id, a.created_at
    FROM touch_1_sent t
    JOIN agent_chat_sessions a
      ON a.user_id = t.user_id
     AND a.created_at > t.touch_1_sent_at

    UNION ALL

    SELECT t.user_id, b.created_at
    FROM touch_1_sent t
    JOIN onto_braindumps b
      ON b.user_id = t.user_id
     AND b.created_at > t.touch_1_sent_at

    UNION ALL

    SELECT t.user_id, pl.created_at
    FROM touch_1_sent t
    JOIN onto_project_logs pl
      ON pl.changed_by = t.user_id
     AND pl.created_at > t.touch_1_sent_at

    UNION ALL

    SELECT t.user_id, db.created_at
    FROM touch_1_sent t
    JOIN ontology_daily_briefs db
      ON db.user_id = t.user_id
     AND db.created_at > t.touch_1_sent_at
     AND db.generation_status = 'completed'
  ) x
  GROUP BY x.user_id
)
SELECT
  t.user_id,
  t.email,
  t.name,
  t.touch_1_sent_at,
  t.opened_touch_1,
  COALESCE(c.clicked_touch_1, false) AS clicked_touch_1
FROM touch_1_sent t
LEFT JOIN touch_1_clicks c
  ON c.user_id = t.user_id
LEFT JOIN post_send_activity p
  ON p.user_id = t.user_id
WHERE p.first_post_send_activity_at IS NULL
ORDER BY
  COALESCE(c.clicked_touch_1, false) DESC,
  t.opened_touch_1 DESC,
  t.touch_1_sent_at;
```

---

## Query 4: Touch 3 Candidate List

Run this 7-10 days after Touch 1.

Use it for engaged non-converters and priority manual follow-ups.
Again, remove replied users manually before sending.

```sql
WITH params AS (
  SELECT 'buildos-reactivation-founder-pilot-v1'::text AS campaign_id
),
campaign_sends AS (
  SELECT
    u.id AS user_id,
    u.email,
    u.name,
    MIN(er.sent_at) AS first_send_at,
    MAX(er.sent_at) AS last_send_at,
    BOOL_OR(er.opened_at IS NOT NULL) AS any_open
  FROM emails e
  JOIN email_recipients er
    ON er.email_id = e.id
  JOIN users u
    ON lower(u.email) = lower(er.recipient_email)
  CROSS JOIN params p
  WHERE e.template_data->>'campaign_id' = p.campaign_id
  GROUP BY u.id, u.email, u.name
),
campaign_clicks AS (
  SELECT
    u.id AS user_id,
    BOOL_OR(ete.event_type = 'clicked') AS any_click
  FROM email_tracking_events ete
  JOIN email_recipients er
    ON er.id = ete.recipient_id
  JOIN emails e
    ON e.id = ete.email_id
  JOIN users u
    ON lower(u.email) = lower(er.recipient_email)
  CROSS JOIN params p
  WHERE e.template_data->>'campaign_id' = p.campaign_id
  GROUP BY u.id
),
post_send_actions AS (
  SELECT
    x.user_id,
    MIN(x.created_at) AS first_action_at
  FROM (
    SELECT s.user_id, b.created_at
    FROM campaign_sends s
    JOIN onto_braindumps b
      ON b.user_id = s.user_id
     AND b.created_at > s.first_send_at

    UNION ALL

    SELECT s.user_id, pl.created_at
    FROM campaign_sends s
    JOIN onto_project_logs pl
      ON pl.changed_by = s.user_id
     AND pl.created_at > s.first_send_at
  ) x
  GROUP BY x.user_id
)
SELECT
  s.user_id,
  s.email,
  s.name,
  s.first_send_at,
  s.last_send_at,
  s.any_open,
  COALESCE(c.any_click, false) AS any_click
FROM campaign_sends s
LEFT JOIN campaign_clicks c
  ON c.user_id = s.user_id
LEFT JOIN post_send_actions a
  ON a.user_id = s.user_id
WHERE (s.any_open = true OR COALESCE(c.any_click, false) = true)
  AND a.first_action_at IS NULL
ORDER BY
  COALESCE(c.any_click, false) DESC,
  s.any_open DESC,
  s.last_send_at DESC;
```

---

## Query 5: Outcome Review

This query compares send group versus holdout on the three pilot outcomes:

- return session
- first action
- multi-day usage

```sql
WITH params AS (
  SELECT
    'buildos-reactivation-founder-pilot-v1'::text AS campaign_id,
    NOW()::timestamptz AS report_run_at
),
cohort AS (
  SELECT *
  FROM retargeting_founder_pilot_v1_cohort
),
campaign_sends AS (
  SELECT
    u.id AS user_id,
    MIN(er.sent_at) AS first_send_at
  FROM emails e
  JOIN email_recipients er
    ON er.email_id = e.id
  JOIN users u
    ON lower(u.email) = lower(er.recipient_email)
  CROSS JOIN params p
  WHERE e.template_data->>'campaign_id' = p.campaign_id
  GROUP BY u.id
),
cohort_with_anchor AS (
  SELECT
    c.*,
    COALESCE(s.first_send_at, c.cohort_frozen_at) AS anchor_at
  FROM cohort c
  LEFT JOIN campaign_sends s
    ON s.user_id = c.user_id
),
activity AS (
  SELECT user_id, created_at, 'chat_session' AS activity_type
  FROM agent_chat_sessions

  UNION ALL

  SELECT user_id, created_at, 'braindump' AS activity_type
  FROM onto_braindumps

  UNION ALL

  SELECT changed_by AS user_id, created_at, 'project_log' AS activity_type
  FROM onto_project_logs

  UNION ALL

  SELECT user_id, created_at, 'daily_brief' AS activity_type
  FROM ontology_daily_briefs
  WHERE generation_status = 'completed'
),
post_anchor_activity AS (
  SELECT
    c.user_id,
    c.holdout,
    a.created_at,
    a.activity_type,
    DATE(a.created_at) AS activity_day
  FROM cohort_with_anchor c
  JOIN activity a
    ON a.user_id = c.user_id
   AND a.created_at > c.anchor_at
   AND a.created_at <= c.anchor_at + INTERVAL '30 days'
),
user_summary AS (
  SELECT
    c.user_id,
    c.holdout,
    MIN(a.created_at) AS return_session_at,
    MIN(a.created_at) FILTER (
      WHERE a.activity_type IN ('braindump', 'project_log')
    ) AS first_action_at,
    COUNT(DISTINCT a.activity_day) AS active_days_30d
  FROM cohort_with_anchor c
  LEFT JOIN post_anchor_activity a
    ON a.user_id = c.user_id
  GROUP BY c.user_id, c.holdout
)
SELECT
  holdout,
  COUNT(*) AS users,
  COUNT(*) FILTER (WHERE return_session_at IS NOT NULL) AS return_session_users,
  COUNT(*) FILTER (WHERE first_action_at IS NOT NULL) AS first_action_users,
  COUNT(*) FILTER (WHERE active_days_30d >= 2) AS multi_day_usage_users
FROM user_summary
GROUP BY holdout
ORDER BY holdout;
```

---

## Manual Batching Workflow

### 1. Freeze cohort

- Run Query 1
- Save the output as:
    - a temp SQL table, and/or
    - a spreadsheet/CSV export

Recommended sheet columns:

- `user_id`
- `email`
- `name`
- `pilot_segment`
- `prioritized_rank`
- `holdout`
- `batch_id`
- `onboarding_intent`
- `onboarding_stakes`
- `last_seen_at`
- `last_outbound_email_at`
- `touch_1_sent_at`
- `touch_2_sent_at`
- `touch_3_sent_at`
- `reply_status`
- `return_session_at`
- `first_action_at`
- `active_days_30d`
- `notes`

### 2. Manual QA

Before sending anything:

- remove obvious internal/test accounts that survived regex filtering
- remove personal contacts you do not want in the experiment
- remove users whose context suggests the message would be clearly wrong
- note any promising accounts for optional Touch 3 founder follow-up

### 3. Assign batch 01

- Use Query 2
- Select the first `25` sendable users
- Set:
    - `batch_id = batch_01`
    - `step = 1`
    - `variant = A` unless you intentionally A/B test subjects

### 4. Send Touch 1

- Send through the BuildOS tracked email pipeline
- Confirm metadata is stamped correctly
- Confirm links carry campaign parameters
- Mark `touch_1_sent_at` in the sheet

### 5. Review after 72 hours

- Run Query 3
- Remove anyone who replied manually
- Send Touch 2 only to the remaining non-returners

### 6. Review after 7-10 days

- Run Query 4
- Remove anyone who replied manually
- Use Touch 3 only for:
    - engaged non-converters
    - strong priority accounts
    - users you want to personally re-open conversation with

### 7. Score the pilot

- Run Query 5
- Review send group vs holdout
- Review qualitative reply themes
- Decide whether to:
    - expand to `batch_02`
    - revise copy
    - change the audience definition
    - improve the post-click experience before scaling

---

## Practical Notes

- This pilot is intentionally conservative. It trades speed for honesty and clean learning.
- Query 3 and Query 4 cannot detect founder inbox replies automatically. Manual suppression remains required.
- If recent automated emails make the cohort too small, refine the `last_outbound_email_at` suppression rule by category rather than dropping it entirely.

---

_Last updated: 2026-03-16 by Codex_
