<!-- docs/business/sales/consumption-pricing-migration-plan.md -->

# BuildOS Consumption Pricing Migration Plan

**Status:** Founder-aligned draft  
**Date:** 2026-02-18  
**Owner:** Founder + Product/Engineering  
**Scope:** Move from trial-centric gating to usage-ladder auto-enrollment with project + AI consumption triggers.

## 1. Locked Decisions (From Founder)

1. BuildOS will use a **usage-ladder auto-enrollment** model.
2. Auto-enrollment trigger is **multi-factor**:
    - project threshold (target: 5 projects)
    - AI consumption threshold (credits/tokens)
3. Free users should **not** see warning banners/meters before threshold.
4. Users should **not** need a card upfront.
5. When threshold is hit, workspace becomes **read-only/frozen for edits** until billing is activated.
6. Tier jumps should happen **immediately with proration**.

## 2. Product Behavior Contract

### Free Tier Experience

- User can use BuildOS normally.
- BuildOS tracks project count and AI usage internally.
- No visible anxiety-inducing warnings, countdowns, or percent-used UI.

### Threshold Moment (Upgrade Gate)

- When trigger condition is satisfied, account enters `upgrade_required_frozen`.
- User keeps read access to projects/data.
- User cannot create/edit content or continue AI generation until payment is activated.
- Upgrade path defaults to `$20/month` Pro.

### Paid Tier Experience

- Once paid, normal editing and AI operations resume immediately.
- Usage visibility can be shown in paid billing UI (not required for free tier).
- If paid usage exceeds tier inclusion, account auto-jumps to next tier with immediate proration.

## 2.1 Implementation Progress (2026-02-18)

Completed slices:

- Billing gate foundation (`billing_accounts`, `billing_credit_ledger`, `evaluate_user_consumption_gate`)
- API write guard with freeze enforcement (feature-flagged)
- Frozen write-block capability classification (`ai_compute`, `workspace_write`, `other_mutation`)
- Pro -> Power auto-escalation service with immediate Stripe proration (feature-flagged)
- Freeze activation flow (`/billing/activate`) with checkout handoff and post-payment unfreeze polling
- Frozen-state global banner with direct activation call-to-action
- Admin billing tools for manual unfreeze and transition timeline (`/api/admin/subscriptions/billing`)
- Focused endpoint audit and matrix hardening to guard workspace/AI mutations while allowing non-workspace account actions
- Billing ops dashboard metrics and alerts (frozen volume, manual unfreeze rate, Pro->Power auto-escalation rate)
- Billing timeline filters (`source`, `actor`, `date range`) in admin subscriptions UI
- Support policy/runbook for manual unfreeze handling and audit-note requirements
- Scheduled billing ops trend snapshots (`billing_ops_snapshots`) with anomaly ledger (`billing_ops_anomalies`)
- Cron-driven anomaly notification flow to admin in-app inbox (`/api/cron/billing-ops-monitoring`)

Next slice:

- Add email/SMS escalation path for critical billing anomalies (optional channel controls)
- Add monthly rollup report and CSV export from snapshot history

## 3. Commercial Ladder (v1)

- **Explorer (Free):** up to trigger boundary
- **Pro ($20/mo):** base paid tier after free boundary
- **Power ($50/mo):** auto-upgrade for heavy usage

Notes:

- Internal accounting remains credit-based (1 credit = 1,000 tokens).
- Project count is a first-class trigger input, not just analytics.

## 4. Trigger Logic (Proposed)

### 4.1 Free -> Pro Trigger

Recommended trigger function (multi-factor):

```text
trigger_to_pro =
  active_project_count > 5
  OR lifetime_credits_used >= FREE_CREDIT_TRIGGER
```

When true:

- set account state to `upgrade_required_frozen`
- block write actions + AI generation
- route user to paid activation flow

### 4.2 Pro -> Power Trigger

Recommended trigger:

```text
trigger_to_power =
  current_cycle_credits_used > PRO_INCLUDED_CREDITS
```

When true:

- immediately switch to Power
- apply Stripe proration immediately

### 4.3 Power -> Pro Downgrade (Anti-Flap)

Recommended rule:

- evaluate at cycle boundary, not mid-cycle
- downgrade only after 2 consecutive cycles below threshold

## 5. Current Implementation Baseline

### Already Exists

- token/cost logging in `llm_usage_logs`
- Smart LLM usage logging pipeline in:
    - `packages/smart-llm/src/smart-llm-service.ts`
    - `packages/smart-llm/src/usage-logger.ts`
- Stripe subscriptions + webhook lifecycle in:
    - `apps/web/src/lib/services/stripe-service.ts`
    - `apps/web/src/routes/api/stripe/*`

### Missing for New Model

- account state machine for `upgrade_required_frozen`
- trigger evaluation engine (projects + credits)
- write-path freeze guards
- automatic tier escalator with immediate proration
- paid-activation flow that resumes frozen account

## 6. Technical Rollout Plan

### Phase 0: Trigger Backtesting (No UX Changes)

Goal:

- validate proposed trigger values on historical data

Work:

- compute historical project-count and credit consumption distributions
- simulate Free->Pro conversion at candidate thresholds
- choose `FREE_CREDIT_TRIGGER` with margin + conversion targets

Exit:

- lock thresholds with confidence

### Phase 1: Billing State + Ledger Foundation

Goal:

- create durable accounting and gating state

Work:

- add billing account state (`explorer_active`, `upgrade_required_frozen`, `pro_active`, `power_active`)
- add credit ledger tables (grant/consume/adjust events)
- add idempotent credit consumption writes linked to `llm_usage_logs.id`

Exit:

- every user has deterministic billing state + balance

### Phase 2: Freeze-to-Activate Flow

Goal:

- implement non-anxiety threshold transition

Work:

- add trigger evaluator job/service
- on trigger hit: set frozen state and enforce read-only writes
- add activation screen + checkout -> return -> unfreeze

Exit:

- free users crossing threshold consistently freeze and can self-serve unlock

### Phase 3: Auto Tier Escalation + Proration

Goal:

- implement immediate paid-tier jumps

Work:

- add Pro->Power trigger check in-cycle
- update subscription immediately through Stripe with proration
- ensure entitlements/limits update in same transaction boundary

Exit:

- heavy users are automatically escalated with no manual support step

### Phase 4: Paid-Tier Usage UX + Ops

Goal:

- provide calm transparency for paying users only

Work:

- billing page for paid users: current cycle usage, plan, projected tier movement
- support tools: manual unfreeze, audit trail, billing override note

Exit:

- support and finance can explain every state transition

## 7. Data Model Changes (v1)

Use immutable ledger + explicit account state.

```sql
create table if not exists billing_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  billing_state text not null default 'explorer_active',
  billing_tier text not null default 'explorer',
  frozen_at timestamptz null,
  frozen_reason text null,
  cycle_start_at timestamptz null,
  cycle_end_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,        -- grant|consume|adjust|expire
  credits_delta integer not null,  -- +grant / -consume
  source_type text not null,       -- subscription_renewal|llm_usage|tier_upgrade|admin_adjustment
  source_id text null,
  idempotency_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

## 8. Enforcement Semantics (Calm UX)

- No pre-threshold warnings for free users.
- No “you are at 80/90/100%” messaging in free mode.
- Only one transition message at freeze moment:
    - you have outgrown free usage
    - your workspace is safe and readable
    - activate Pro to continue editing/AI

## 9. Immediate Next Steps

1. Lock numeric thresholds:
    - `FREE_CREDIT_TRIGGER` for Free->Pro
    - `PRO_INCLUDED_CREDITS` and `POWER_INCLUDED_CREDITS`
2. Implement Phase 0 backtest SQL + report in admin.
3. Define exact write-block matrix for frozen state:
    - projects/tasks/docs create/edit
    - AI chat/generation
4. Implement billing state machine and trigger evaluator.
5. Build freeze activation route and Stripe resume flow.
6. Implement immediate proration upgrade path for Pro->Power.

## 10. Open Numeric Decisions

1. `FREE_CREDIT_TRIGGER` initial placeholder accepted: 400 credits (subject to backtest tuning).
2. Pro included credits initial placeholder accepted: 2,000/cycle (subject to backtest tuning).
3. Power included credits initial placeholder accepted: 7,500/cycle (subject to backtest tuning).
4. Confirm whether Power has overage/top-ups or another auto-tier above it.

## 11. Reference Sources

- Stripe usage-based subscriptions:
    - https://docs.stripe.com/billing/subscriptions/usage-based
- Stripe credits-based pricing model:
    - https://docs.stripe.com/billing/subscriptions/usage-based/use-cases/credits-based-pricing-model
- Stripe usage-based prices:
    - https://docs.stripe.com/billing/prices/usage-based
