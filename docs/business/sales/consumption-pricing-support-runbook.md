<!-- docs/business/sales/consumption-pricing-support-runbook.md -->

# Consumption Pricing Support Runbook

**Status:** Active (v1)  
**Date:** 2026-02-18  
**Owner:** Support + Product + Engineering

## 1. Purpose

Define when and how support/admin should use manual unfreeze for accounts in `upgrade_required_frozen`, while preserving auditability and pricing integrity.

## 2. Policy Guardrails

Manual unfreeze is allowed only when one of these is true:

1. False-positive freeze caused by a product bug, migration bug, or data inconsistency.
2. Confirmed payment-activation flow failure after user attempted checkout.
3. Time-boxed goodwill exception approved by an admin.

Manual unfreeze is not allowed for routine free-tier extension requests without an explicit approval note.

## 3. Required Procedure

1. Open `Admin -> Subscriptions` and locate the user.
2. Open `Billing Timeline` and verify latest transition into frozen state.
3. Validate account context:

- current billing state/tier
- recent billing transitions (`source`, `actor`, `timestamp`)
- whether user has attempted activation

4. Run `Manual Unfreeze` action.
5. Enter a clear note explaining reason and decision basis.
6. Confirm billing state moved to an active state and user can resume writes.
7. If this was a system issue, create or link an engineering issue in the note.

## 4. Required Audit Note Format

Use this template in the manual unfreeze note:

`reason=<reason_code>; evidence=<ticket_or_incident>; decision=<why_unfreeze>; owner=<admin_email>`

Reason codes:

- `bug_false_positive`
- `checkout_activation_failure`
- `approved_goodwill_exception`

## 5. SLA Targets

- Activation blocker (paid user cannot unfreeze): first response within 1 hour.
- Suspected false-positive freeze: first response within 4 hours.
- Goodwill exception requests: same business day.

## 6. Operational Metrics To Watch

From `Admin -> Subscriptions` billing ops dashboard:

- Frozen account volume
- Manual unfreeze rate (30d)
- Auto Pro->Power escalation rate (30d)

Snapshot + anomaly pipeline:

- Scheduled by cron endpoint: `/api/cron/billing-ops-monitoring`
- Default schedule: daily at `11:00 UTC` (via `vercel.json`)
- Persists trend snapshots in `billing_ops_snapshots`
- Persists anomaly records in `billing_ops_anomalies`
- Sends in-app admin notifications for warning/critical anomalies

Alert handling:

1. Frozen volume high: review trigger behavior and activation flow reliability.
2. Manual unfreeze rate elevated: audit freeze causes and support consistency.
3. Auto escalation rate extreme (high/low): review tier thresholds and packaging assumptions.

## 7. Escalation Matrix

- Support: executes manual unfreeze and captures evidence.
- Product: approves policy exceptions and threshold adjustments.
- Engineering: resolves root cause for bugs/activation failures.
- Finance/Founder: approves non-standard revenue-impacting exceptions.
