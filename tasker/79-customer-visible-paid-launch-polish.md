<!-- tasker/79-customer-visible-paid-launch-polish.md -->

# 79 — Customer-visible paid-launch polish

**Created:** 2026-08-31

**Status:** Ready — production audit found specific visible defects and unaudited core surfaces

**Priority:** P1 paid-launch polish; escalate visible corruption, obstruction, or false product
state to P0

**Type:** Production UX, generated-content presentation, responsive behavior, public surface hygiene,
and marketing truth

## Kernel

The production UI is generally coherent and credible, but the 2026-08-31 authenticated/public audit
found several details that make the product feel unfinished precisely where a paying user evaluates
trust:

- Daily Briefs displayed malformed generated Markdown such as `Start with **approving` and an odd
  “Clear day” symbol.
- Today/Briefs exposed `[SMOKE TEST] Calendar RLS ...` data in the audited production account.
- Projects displayed raw ontology syntax such as `[[plan:<uuid>|Brand Foundation]]` inside a next
  step instead of a human label/link.
- The fixed “Review 3 updates” notification dock obscured lower page content, including pricing FAQ
  content.
- Several important mobile controls measured roughly 20–36 pixels rather than a comfortable
  44-pixel target.
- Design-system/prototype routes and the dev-only Today preview remain publicly reachable; several
  design-system routes have no `noindex` or production guard.
- Five published/indexed blog files contain dated internal review notes acknowledging stale
  competitor or BuildOS pricing claims.
- Brain-dump/capture, onboarding, Briefs, dashboard modals, auth, full-page chat, search, and the
  public marketing follow-up still need a complete visual and interaction pass.

These are not all the same kind of defect. Separate malformed or leaked data, obstructed interaction,
route exposure, responsive/accessibility debt, and subjective visual refinement so correctness work
cannot be dismissed as “just polish.”

## Audit standard

Use the existing BuildOS design system and repository UI-audit playbook. Review real production-like
content rather than only ideal fixtures. Capture desktop and mobile evidence at 390, 768, and 1440
CSS pixels, plus keyboard and reduced-motion behavior where applicable. Exact Core Web Vitals were
not captured in the initiating audit because the performance tracer was unavailable; this tracker
owns that missing measurement.

## Work packages

### WP-0 — Reproduce and classify

- Reproduce every named finding with route, account/fixture state, viewport, browser, screenshot,
  console/network state, and suspected source layer.
- Classify each finding as data contamination, generator/content contract, renderer, layout,
  accessibility, route exposure, marketing truth, or performance.
- Confirm whether the Briefs Markdown failure is malformed/truncated model output, sanitization,
  persistence, or presentation before changing the shared renderer.
- Create one bounded P0/P1 issue list; do not turn subjective preference into an unlimited redesign.

### WP-1 — Human-readable generated content

- Prevent malformed Markdown fragments from appearing as raw emphasis markers in Briefs and other
  compact generated summaries.
- Resolve ontology references into safe human labels/links anywhere user-facing compact text can
  contain `[[type:id|label]]` tokens, including project next steps.
- Add regression fixtures for malformed, truncated, linked, unknown, deleted, and malicious tokens.
- Ensure sanitization remains strict and remote agent-supplied images remain blocked.
- Remove production smoke artifacts and update test-data hygiene so live verification fixtures are
  isolated, clearly disposable, and always cleaned up.

### WP-2 — Overlays, mobile targets, and responsive behavior

- Make the notification review dock reserve space, avoid critical content, or collapse into a
  non-obstructive mobile treatment.
- Audit primary navigation, inbox, refresh, send, task, calendar, chat, modal, and billing controls
  for 44-pixel touch targets without making the interface visually clumsy.
- Verify focus order, visible focus, Escape/close behavior, modal containment, labels, keyboard-only
  operation, reduced motion, zoom, and safe-area handling.
- Test realistic long titles, generated summaries, empty/error/loading states, and the smallest
  supported phone width for overflow and overlap.

### WP-3 — Complete the unaudited core-surface pass

- Audit brain-dump/capture as the primary product moment.
- Audit fresh-account onboarding and every branch/return state.
- Audit Today, Briefs, projects, project workspace, search, full-page/modal chat, calendar,
  notifications, profile/billing, auth, and account deletion as one system.
- Audit public homepage, pricing, docs/help/contact, Terms/privacy, and the highest-traffic marketing
  pages.
- Track only actionable issues with severity, evidence, owner, fix, and live re-verification.

### WP-4 — Public route and content hygiene

- Remove, production-guard, or `noindex` internal design-system, technical-spec, demo, debug, test,
  and preview routes according to an explicit route inventory.
- Ensure dev-only routes return a production 404 or an intentional protected response rather than a
  public placeholder page.
- Update `robots.txt` and route metadata as defense in depth, not as the only access control.
- Re-verify the published Notion recurring-task, BuildOS-vs-Notion, BuildOS-vs-Monday,
  BuildOS-vs-ChatGPT, and evolution-of-note-taking articles; remove internal TODO/review blocks and
  stale pricing or competitor claims.
- Run a site-wide pricing/support/refund/trial claim search after Tasker 77 ratifies the contract.

### WP-5 — Performance and production sign-off

- Capture LCP, CLS, INP, and supporting traces for the public landing/pricing routes and the Today,
  Briefs, Projects, and Agent Chat journeys on desktop and mobile profiles.
- Fix launch-blocking regressions and establish a dated baseline for later optimization.
- Re-run the visual matrix on the intended production deployment with representative content.
- Retain before/after evidence and confirm no P0/P1 visible issue remains in a golden journey.

## Coordination

- [Tasker 77](77-billing-commercial-contract-reconciliation.md) owns the actual pricing/policy
  decisions; this tracker owns accurate, polished presentation after ratification.
- [Tasker 78](78-product-promise-production-proof.md) defines the golden journeys and consumes the
  final visual receipts.
- Existing feature taskers continue owning underlying domain defects discovered during the pass.
  Route a deterministic calendar or Agentic Chat failure there rather than duplicating it here.

## Acceptance criteria

1. No golden journey displays raw ontology tokens, broken Markdown markers, smoke-test identifiers,
   internal TODOs, or false success/state copy.
2. Persistent overlays do not cover primary actions or meaningful content at supported widths.
3. Primary interactive controls meet the approved touch, keyboard, focus, label, and modal behavior
   standard.
4. Core authenticated and public surfaces pass the 390/768/1440 visual matrix with realistic long,
   empty, loading, error, and stale states.
5. Internal/prototype routes are removed, protected, or explicitly excluded from indexing in
   production.
6. Published pricing, competitor, refund, support, and product claims are current and agree with
   Tasker 77.
7. Core Web Vitals are measured on the intended release and any launch-blocking regression is fixed
   or explicitly cohort-limited.
8. Every P0/P1 finding has a live re-verification receipt; subjective P2 refinements do not block the
   bounded paid cohort.

## Non-goals

- Redesigning BuildOS from scratch.
- Treating every 44-pixel recommendation as a reason to enlarge non-interactive decoration.
- Hiding malformed data with CSS instead of repairing its content contract.
- Blocking launch on low-impact admin/internal polish that customers cannot reach.
- Refreshing unrelated long-tail marketing content without evidence of a stale launch claim.
