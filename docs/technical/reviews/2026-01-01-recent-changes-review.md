<!-- docs/technical/reviews/2026-01-01-recent-changes-review.md -->

# Recent Changes Review (2026-01-01)

## Scope

- Git window: last 24 hours (commits cb3aa06a, 8cb4c4c3, 88e36d67, 6a1049b3, 616e9d8c).
- Specs reviewed: `docs/specs/ENNEAGRAM_PROJECT_COUNCIL_SPEC.md`, `docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md`.

## Findings

### Medium

- Upcoming tasks in the daily brief include `blocked` tasks, which conflicts with the spec and can surface blocked items as “Upcoming.” Filter out `state_key === 'blocked'` before pushing into upcoming tasks. (`apps/worker/src/workers/brief/ontologyBriefDataLoader.ts:172`)
- Decisions without `decision_at` are silently dropped from briefs and analysis prompts, so newly created decisions without a date never appear. Use `created_at` as a fallback instead of filtering them out. (`apps/worker/src/workers/brief/ontologyBriefGenerator.ts:186`, `apps/worker/src/workers/brief/ontologyBriefGenerator.ts:409`, `apps/worker/src/workers/brief/ontologyPrompts.ts:265`)

### Low

- Project context highlights order upcoming tasks by `due_at` then `start_at`, which can misorder tasks when `start_at` is earlier but `due_at` is later (spec says order by earliest of the two). Consider ordering by `least(due_at, start_at)` or a computed coalesced value. (`apps/web/src/lib/services/ontology-context-loader.ts:560`)
- Beta signup reCAPTCHA gating is inconsistent: the UI only blocks when a site key exists, but the API always rejects empty tokens outside dev. If `PUBLIC_RECAPTCHA_SITE_KEY` is unset in prod, users can submit and will get a 400. Align UI/API checks or treat missing keys as “disabled.” (`apps/web/src/routes/beta/+page.svelte:187`, `apps/web/src/routes/api/beta/signup/+server.ts:270`)

### Spec Inconsistencies

- Tool definitions specify bespoke output schemas per consultant, but the “Response Format” section mandates a generic `ConsultationResult` shape; it is unclear which is canonical. Clarify or map the per-tool outputs into the generic wrapper. (`docs/specs/ENNEAGRAM_PROJECT_COUNCIL_SPEC.md:740`)
- Formatting rules require `created_at` for all entities, but the Tasks sections/examples omit `created_at`, creating ambiguity for implementers. Clarify whether tasks are exempt or update the examples. (`docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md:60`, `docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md:222`)
