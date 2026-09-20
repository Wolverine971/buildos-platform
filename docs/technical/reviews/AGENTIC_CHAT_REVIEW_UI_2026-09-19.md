<!-- docs/technical/reviews/AGENTIC_CHAT_REVIEW_UI_2026-09-19.md -->

# Project review in ordinary chat — September 19, 2026

Implemented locally on the shared checkout. DJ requested these three changes and explicitly
deferred research and the full Agentic Chat QA gate. No rollout flags, migrations, deployment,
production data, or live model execution were changed by this UI work.

## What changed

- **Review project** appears in the composer for the enabled internal cohort, in project-wide
  context. It is an explicit choice for one message, supplies an editable starter question when
  the draft is empty, and resets after accepted admission. Switching sessions/projects clears
  the choice. Voice-linked drafts and attachments are excluded from this text-only review lane.
- Review sends carry `reviewIntent: project_review` through transport. They skip browser prompt
  preparation and use raw durable admission; a first review can create its session atomically.
  The UI loads that session after acceptance before subscribing to worker progress.
- Explicit unavailable/unsupported reviews return an actionable error and restore a known-rejected
  draft. They never fall through to ordinary chat. An ambiguous first-session admission failure
  keeps the sent message and asks the user to check history before sending again.
- **Review deeper** appears on freshness cards for the current eligible project. It appends an
  editable question, treats historical flags as leads to verify, selects review mode, and waits
  for the user to send. It does not approve the freshness bundle or modify project records.
- Durable progress supports preparation, planning, specialist work, synthesis, saved findings,
  recovery, complete/partial outcomes, failure, and cancellation. Live events, reconciliation,
  and reopened sessions use the same card. Legacy prototype cards still render.
- Final worker events include the terminal workflow projection. Terminal assistant messages also
  persist it. Failed/no-answer reviews restore from retained stream state using an authenticated,
  user/session-scoped, bounded projection query; nested unknown fields are stripped. Historical
  no-answer cards remain subject to the existing stream-retention policy.

## Local verification

- Focused composer, admission, transport, and prewarm suites passed after correcting a test that
  needed to account for the composer's separate desktop/mobile action elements.
- Durable rendering, event handling, session restoration, and adjacent session route suites:
  **165/165** passed.
- Final touched helper/component/admission checks: **94/94** passed.
- Worker preparation and terminal adapter suites with stub providers: **31/31** passed.
- Shared event declarations rebuilt successfully. The required `pnpm --filter @buildos/web check`
  passed on the final source with **zero errors and zero warnings**.
- Route-size and icon-export guards passed. Desktop and 390px mobile layouts were inspected in
  a local fixture, including editable review drafts and partial/recovering progress.
- External Svelte autofixer was blocked by automatic approval review because it would transmit
  repository source to svelte.dev. Local compilation/type checking was used instead.

The local fixture uses the actual components with sample data under
`output/playwright/project-review-ui/`; it runs no models and makes no project changes.

## What remains

The three workflow switches are still off unless separately changed outside this work. The
capabilities endpoint mirrors the existing web admission switch and cohort; the worker switches
must be enabled together when rollout is authorized. Full QA, provider/pricing verification,
and live recovery proof remain deferred rather than claimed complete.

The next development path is
[versioned specialists plus Jev selection](../../architecture/SPECIALIST_AGENTS_AND_JEV_NEXT_STEPS_2026-09-19.md).
Jev tool narrowing already exists in ordinary worker chat. Agent selection, custom specialist
tool loops, and specialist-triggered workflows are the next layer; they are not implemented by
this change set.
