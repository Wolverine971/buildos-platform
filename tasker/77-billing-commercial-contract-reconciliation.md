<!-- tasker/77-billing-commercial-contract-reconciliation.md -->

# 77 — Billing and commercial-contract reconciliation

**Created:** 2026-08-31

**Status:** Research and owner decision required — keep paid billing disabled until one contract is
ratified and proven end to end

**Priority:** P0 paid-launch blocker

**Type:** Pricing strategy, entitlements, Stripe productionization, legal, and support operations

## Kernel

BuildOS does not currently make one coherent commercial promise. The public pricing and Terms
describe a 14-day free trial, while the founder-aligned consumption plan describes normal free use
until a project or AI threshold, followed by a frozen read-only workspace and paid Pro/Power tiers.
The implementation contains pieces of both models.

There is also a direct checkout mismatch: an authenticated user outside an active trial can see
“Start Free Trial,” but the Stripe checkout session creates an immediate subscription without a
Stripe trial. Checkout can fall back to `price_placeholder`; production is missing the newer
Pro/Power price IDs and consumption-gate flags; and invoice configuration still contains unfinished
branding/contact values, a placeholder EIN, a nonexistent support URL, and refund wording that
conflicts with the Terms.

Choose one commercial contract, write it as a state machine and customer promise, align every
surface to it, and prove the full money and entitlement lifecycle before enabling Stripe.

## Owner decisions required

Ratify one answer for each dimension before implementation is treated as launch work:

| Dimension          | Decision required                                                                     |
| ------------------ | ------------------------------------------------------------------------------------- |
| Free entry         | Time-boxed trial, usage-threshold Explorer tier, or another single model              |
| Card timing        | Whether a card is required at signup, threshold, or only at explicit purchase         |
| Free boundary      | Exact project and AI thresholds, including how archived/deleted projects count        |
| Initial paid tier  | Pro price, billing cadence, included usage, and tax treatment                         |
| Heavy-use behavior | Power price, threshold, proration timing, downgrade rule, and any top-up/overage      |
| Threshold UX       | Warning policy, read-only behavior, export access, and activation path                |
| Failed payment     | Grace period, write/AI restrictions, retries, recovery, and cancellation behavior     |
| Cancellation       | Effective date, retained read/export access, deletion, and resubscription             |
| Refunds            | Eligibility, timing, exceptions, and who can approve them                             |
| Existing users     | Grandfathering, migration date, notice, and treatment of current trial fields         |
| Support            | Customer channel, response ownership, billing escalation, and incident communications |

The current 400/2,000/7,500 credit values remain placeholders until backtesting and an owner
decision say otherwise.

## Canonical contract artifact

Produce one concise source of truth that includes:

- customer-facing offer and exact promise;
- durable billing states and allowed transitions;
- entitlement matrix for reads, writes, AI, exports, and account operations;
- Stripe products/prices and application configuration mapping;
- webhook-to-state transition table with idempotency behavior;
- failed-payment, cancellation, refund, and resubscription behavior;
- customer copy for every transition;
- analytics, finance, support, and audit receipts required at each state.

All pricing, Terms, invoices, lifecycle email, UI, API guards, database state, and support runbooks
must reference this contract rather than restating divergent rules.

## Work packages

### WP-0 — Reconcile the current system

- Inventory pricing, Terms, privacy, registration, onboarding, activation, profile billing, invoice,
  dunning, cancellation, refund, and support copy.
- Map the legacy trial/subscription records and the newer consumption billing-account/credit-ledger
  state machine.
- Classify which “completed” checklist items are deployed, feature-flagged, stale documentation, or
  unverified.
- Backtest candidate free and paid thresholds against historical project and AI usage.
- Identify every mutation or AI endpoint not covered by the consumption gate, including external
  agent and profile routes.

### WP-1 — Ratify the commercial decision

- Hold the founder/product/engineering decision using the dimensions above.
- Record the chosen prices, thresholds, state transitions, policies, and existing-user migration.
- Explicitly retire the losing model; do not preserve incompatible trial and usage-ladder copy as
  fallback behavior.
- Define the smallest founder-cohort offer separately from the eventual broad-launch offer only if
  the difference is deliberate and visible.

### WP-2 — Align product, legal, and support surfaces

- Update pricing, CTA text, registration/onboarding, activation, profile billing, frozen states,
  cancellation, and lifecycle messages to the same contract.
- Reconcile Terms, refund language, grace periods, renewal, tax, privacy, and export access.
- Replace all invoice placeholders with verified business and support information; remove the fake
  EIN and point support links to a real monitored route.
- Publish a billing FAQ and support runbook that explain every customer-visible state.

### WP-3 — Make Stripe configuration fail closed

- Replace the legacy single price fallback with explicit validated Explorer/Pro/Power
  configuration as required by the chosen model.
- Refuse checkout when price, webhook, application URL, or environment mode is absent or invalid.
- Configure real test/live products, prices, portal behavior, payment methods, tax, branding,
  invoices, receipts, fraud controls, and webhook endpoint.
- Ensure test and live identifiers can never be mixed.
- Keep the production billing flag off until the release receipt is signed.

### WP-4 — Complete entitlement enforcement

- Cover every workspace write and AI-consumption path with the canonical billing decision.
- Preserve reads, export, billing activation, support, account security, and deletion where the
  contract permits them.
- Make threshold evaluation, ledger writes, webhook transitions, tier changes, and unfreeze
  idempotent under retries and concurrency.
- Add distributed abuse/cost controls for AI work rather than relying on process-local memory.
- Prove no direct API or external-agent path can bypass the chosen paid boundary.

### WP-5 — Payment lifecycle proof

- Run Stripe test-mode journeys for checkout, duplicate/out-of-order webhooks, activation, portal,
  upgrade, downgrade, proration, cancellation, resubscription, refund, card update, payment failure,
  grace, dunning, and recovery.
- Reconcile Stripe objects, database state, entitlements, invoices, notifications, and analytics for
  every journey.
- Run one bounded real payment through the full cancellation/refund lifecycle.
- Monitor the founder cohort for at least 48 hours with a documented disable/rollback path.

## Dependencies and coordination

- [Tasker 76](76-production-database-security-containment.md) must contain the production database
  exposures before payment or subscriber metrics are trusted.
- [Tasker 63](63-supabase-migration-ledger-reconciliation.md) owns hosted migration-ledger repair.
- [Tasker 78](78-product-promise-production-proof.md) consumes the final commercial contract in its
  fresh-account and paid-lifecycle journey matrix.
- [Tasker 79](79-customer-visible-paid-launch-polish.md) owns presentation polish after the actual
  pricing language is ratified.

## Acceptance criteria

1. The founder has ratified one commercial contract, including every decision dimension above.
2. Pricing, Terms, checkout, entitlement state, invoices, emails, support, and cancellation/refund
   behavior describe that same contract with no trial-versus-paid ambiguity.
3. Checkout fails closed on missing or mixed configuration and contains no placeholder price.
4. Production invoice and support configuration contains verified real information and no TODO or
   contradictory policy text.
5. Every write/AI entry point obeys the entitlement matrix; retries cannot double-charge, double
   transition, or consume usage twice.
6. The complete test-mode lifecycle and one bounded live-payment lifecycle pass with reconciliation
   receipts.
7. Monitoring, support ownership, rollback, and customer communication are ready before the flag is
   enabled.
8. A small founder cohort completes the observation gate before broad paid launch.

## Non-goals

- Optimizing conversion copy before the commercial truth is decided.
- Launching annual plans, coupons, teams, or enterprise billing unless the ratified v1 requires
  them.
- Treating a green Stripe checkout alone as proof that billing is ready.
- Hiding contradictory policy behind a feature flag while charging customers under another rule.
