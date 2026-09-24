<!-- docs/technical/reviews/AGENTIC_CHAT_DEV_PROMPT_DUMPS_2026-09-05.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-19; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Worker prompt capture and session audit navigation

Implemented locally on 2026-09-05. No deployment or database mutation was performed.

## Evidence from the requested session

[Session 913bcb29-b30d-4b79-b4c2-15a00db606db](https://build-os.com/admin/chat/sessions?chat_session_id=913bcb29-b30d-4b79-b4c2-15a00db606db)
contains seven recorded turns (five completed, two cancelled), 48 tool executions,
57 LLM usage rows, and $0.09765512 of provider-reported cost. All 57 usage rows link
to a turn. Seven failure rows lack OpenRouter request IDs and reported cost.
The cost chart already separates unknown cost from reported spend; tool markers
are unmetered and their cumulative number is session spend at that point, not a
price attributed to an individual tool.

There are six initial prompt snapshots. The first cancelled turn has no snapshot,
including when checking snapshots without the session filter. This audit did not
establish why its snapshot was absent. Saved initial snapshots cannot establish
the exact later acting, repair, review, or final-response requests.

The production cost chart already opened the correct Create Goal record. Its
navigation centered the entire expanded card, which could obscure the heading
for large payloads. The local change aligns the heading at the top and highlights
the selected item. Clicking an LLM row also opens its enclosing audit sections and
clears filters if needed.

## Changes

- Worker transport captures the exact serialized request body at the HTTP boundary,
  after routing and tool filtering, before fetch. Every pass and HTTP fallback gets
  a distinct JSON/Markdown pair with IDs, response events, outcome, usage, and timing.
- Capture requires `NODE_ENV=development` and `AGENTIC_CHAT_LOCAL_PROMPT_DUMPS=true`.
  The flag is enabled in this checkout's gitignored worker `.env` and documented
  in `.env.example`; dev scripts set the development environment explicitly.
- `apps/worker/.prompt-dumps/latest.md` links to the latest started request. Only
  generated files older than 48 hours are pruned. Files use owner-only permissions,
  and provider credentials/worker processing tokens are excluded from metadata.
- LLM details display pass, logical round, attempt, route, usage/turn IDs, OpenRouter
  request ID, and the local dump filename when captured. Missing initial snapshots
  are labeled explicitly.
- Prompt snapshot details now expose the saved structured messages and tool schemas.
  Their large JSON content renders only after opening the disclosure; the existing
  turn snapshot is reused without duplicating it into each timeline payload.

## Verification

- 81 worker tests passed across the transport regression suite and new dump suites:
  exact fetch body, reviewer context, route fallback, cancellation, production and
  hosted exclusions, file permissions, retention, latest pointers, disk failure.
- 14 admin tests passed across chart callbacks, nested navigation, filtering,
  reduced motion, correlation fields, and structured prompt display.
- Worker typecheck passed. Full web Svelte check passed with zero errors/warnings.
- Local browser verification used the requested session and confirmed cost-chart
  clicks open the recorded Create Goal request/response, highlight it, and land
  at its heading; LLM chart navigation exposes correlation details.
- Automatic approval review blocked the online Svelte autofixer because it could
  transmit private source to svelte.dev. Local component tests and svelte-check were
  used for validation.

New dumps require requests to run through the local development worker. A hosted
worker cannot write files to this laptop; its existing database audit remains the
source for historical records. No paid model calls were made for verification.
