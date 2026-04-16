<!-- docs/integrations/libri/buildos-hardening-next-milestone.md -->

# BuildOS Libri Hardening Patch And Next Milestone

Date: 2026-04-15
Status: Ready for BuildOS implementation agent
Workspace: `/Users/djwayne/buildos-platform`
Audience: Agent hardening the BuildOS side after the first Libri entity handoff slice

## Purpose

The first BuildOS and Libri entity handoff slices are implemented. BuildOS can
extract Libri-relevant entities during chat session synthesis and send them to
Libri's `POST /api/v1/entity-handoffs` endpoint. Libri can resolve, dedupe, and
enqueue research/resource requests.

This document defines the next BuildOS milestone: make the existing BuildOS
slice reliable enough for the first real end-to-end smoke test, then evaluate
the behavior before adding broader product features.

The milestone is not "make Libri a hard-coded live chat router." Live chat Libri
usage must remain agent-directed. This work is about session-close synthesis and
background enrichment handoff.

## Read First

- `docs/integrations/libri/session-synthesis-entity-handoff.md`
- `docs/integrations/libri/buildos-session-synthesis-agent-instructions.md`
- `docs/integrations/libri/buildos-agent-handoff.md`
- `/Users/djwayne/Desktop/book-pics/library-app/docs/BUILDOS_ENTITY_HANDOFF_AGENT_INSTRUCTIONS.md`
- `/Users/djwayne/Desktop/book-pics/library-app/docs/EXTERNAL_API_AGENT_INTEGRATION.md`
- `/Users/djwayne/Desktop/book-pics/library-app/docs/EXTERNAL_API_SPEC.md`

BuildOS implementation files to inspect before editing:

- `apps/worker/src/workers/chat/chatSessionClassifier.ts`
- `apps/worker/src/workers/chat/libriSessionEntities.ts`
- `apps/worker/src/workers/chat/libriEntityHandoffClient.ts`
- `apps/worker/tests/chatSessionClassifierLibri.test.ts`
- `apps/worker/tests/chatSessionLibriEntities.test.ts`
- `apps/worker/tests/libriEntityHandoffClient.test.ts`
- `apps/web/src/routes/api/chat/sessions/[id]/close/+server.ts`
- `packages/shared-types/src/chat.types.ts`

## Current State

Implemented in BuildOS:

- `chat_sessions.extracted_entities` storage.
- Shared `SessionExtractedEntities` and Libri candidate types.
- Session classifier prompt asks for Libri candidates alongside title, topics,
  and summary.
- Source message IDs and turn indices are passed into the classifier prompt.
- Sanitizer accepts `person`, `book`, `youtube_video`, and `youtube_channel`.
- Libri handoff client sends eligible candidates to
  `POST /api/v1/entity-handoffs`.
- Handoff status is stored compactly under
  `chat_sessions.agent_metadata.libri_handoff`.
- The close endpoint requeues classification when older synthesized sessions
  have title/summary but no `extracted_entities`.

Verified locally:

- BuildOS worker Libri tests pass.
- BuildOS worker typecheck passes.
- Libri resolver tests and checks pass.

Known gap:

- A live BuildOS-to-Libri smoke has not been run yet. The smoke may create real
  Libri resource requests or ingestion jobs, so run it only with the intended
  local/test environment and API key.

## Milestone Definition

The first reevaluation milestone is:

> A real closed BuildOS chat session mentions one person, one book, and one
> YouTube resource. BuildOS saves structured `extracted_entities`, sends the
> eligible candidates to Libri, stores Libri's compact response, and a repeat
> classification does not create duplicate Libri work.

This milestone is successful when all of the acceptance checks below pass.

## Hardening Patch Scope

### 1. Make the classifier schema harder to misread

Problem:

The current prompt example uses union-looking placeholder strings such as:

```json
{
	"entity_type": "person|book|youtube_video|youtube_channel",
	"relevance": "primary|supporting|incidental",
	"recommended_action": "resolve_or_enqueue|search_only|ignore"
}
```

Some models may copy the full placeholder string literally. If that happens,
BuildOS sanitization rejects the candidate and silently skips the handoff.

Patch:

- Replace union placeholder values in the JSON example with concrete sample
  values.
- Add explicit prose directly above the JSON example:
    - `entity_type` must be exactly one of `person`, `book`, `youtube_video`, or
      `youtube_channel`.
    - `relevance` must be exactly one of `primary`, `supporting`, or
      `incidental`.
    - `recommended_action` must be exactly one of `resolve_or_enqueue`,
      `search_only`, or `ignore`.
- Keep the response format as valid JSON only.
- Do not add commentary that would make the model return non-JSON text.

Recommended example style:

```json
{
	"entity_type": "book",
	"display_name": "Atomic Habits",
	"canonical_query": "Atomic Habits James Clear",
	"authors": ["James Clear"],
	"confidence": 0.94,
	"relevance": "primary",
	"recommended_action": "resolve_or_enqueue"
}
```

### 2. Normalize YouTube IDs from more candidate fields

Problem:

BuildOS currently extracts `youtube_video_id` from the explicit
`youtube_video_id` field or from `url`. If the model puts a YouTube URL in
`canonical_query` and omits `url`, BuildOS may send the candidate without a
video ID.

Libri can still parse `canonicalQuery`, so this is not a blocker, but BuildOS
should send the strongest normalized payload it can.

Patch:

- In `apps/worker/src/workers/chat/libriSessionEntities.ts`, extract a YouTube
  video ID from:
    - explicit `youtube_video_id` / `youtubeVideoId`,
    - normalized `url`,
    - `canonical_query`,
    - optionally `display_name` if it is a raw YouTube URL.
- Preserve the current behavior that only sets `youtube_video_id` for
  `entity_type === "youtube_video"`.
- Add tests for:
    - video URL in `url`,
    - video URL in `canonical_query`,
    - explicit video ID winning over parsed values,
    - non-YouTube text not producing a video ID.

### 3. Decide and implement short-session behavior

Problem:

The classifier currently returns an empty extraction artifact for sessions with
fewer than two messages. That keeps the old title/summary behavior stable, but
it misses one-message sessions where the user pastes a book title, a person, or
a YouTube URL and then closes the chat.

Patch decision for this milestone:

- Entity extraction should run for a session with at least one meaningful user
  message.
- Title and summary can still use "Quick chat" style fallback if the
  conversation is too short.
- The model should be allowed to extract a Libri candidate from a single user
  message when the evidence is explicit and high confidence.

Implementation options:

- Preferred: route one-message sessions through the same classifier prompt, but
  make the prompt comfortable returning a minimal title/summary and real
  `extracted_entities`.
- Acceptable: add a small worker-side branch that only asks for entity
  extraction for one-message sessions and merges it with the existing fallback
  title/summary artifact.

Do not add deterministic keyword routing to live chat. This is still
session-close synthesis.

Tests:

- One user message containing a YouTube URL can produce a sanitized
  `youtube_video` candidate.
- One user message containing `James Clear` can produce a sanitized `person`
  candidate if the model output is clear.
- Empty or whitespace-only sessions still save an empty extraction artifact.

### 4. Keep Libri failures non-fatal and observable

The current non-fatal behavior is correct. Preserve it.

Patch only if needed:

- Confirm `LIBRI_INTEGRATION_ENABLED=false` or missing config still saves
  `extracted_entities`.
- Confirm the handoff status records `disabled` or `not_configured` clearly in
  `agent_metadata.libri_handoff`.
- Confirm API/network failures do not prevent title, topics, summary, or
  extraction from saving.

### 5. Verify idempotency from BuildOS

The idempotency key should be stable for the same session and same eligible
entity set:

```text
buildos-session-entity-handoff:<sessionId>:<stable-entity-hash>
```

Patch only if needed:

- Ensure the hash does not depend on array order if the same logical candidates
  appear in a different order.
- Ensure fields that can vary between model runs but do not identify the
  resource, such as evidence snippet wording, do not create unnecessary new
  idempotency keys.

For this milestone, stable by canonical resource identity is more important
than stable by every evidence detail.

## Environment And Configuration

BuildOS server/worker env should use:

```text
LIBRI_INTEGRATION_ENABLED=true
LIBRI_API_BASE_URL=<Libri Convex site URL or local API base>
LIBRI_API_KEY=<server-side Libri external API key>
```

Rules:

- Do not commit a real API key.
- Keep the key server-side only.
- Do not expose the key to browser code, model prompts, logs, or chat messages.
- If an `.env.example` or local setup doc already exists for worker env, add
  placeholder names there only.

Local base URL depends on which Libri API surface is being tested:

- Use Libri's Convex site URL for Convex HTTP API routes.
- Do not use the SvelteKit UI URL unless that app explicitly proxies the API
  route being tested.

## Acceptance Checks

### Unit and type checks

Run the focused BuildOS checks:

```bash
pnpm --dir apps/worker test:run tests/chatSessionLibriEntities.test.ts tests/libriEntityHandoffClient.test.ts tests/chatSessionClassifierLibri.test.ts
pnpm --dir apps/worker typecheck
```

If package scripts differ in the current branch, use the equivalent worker test
and typecheck commands already used by the repo.

### BuildOS closed-session smoke

Create or use a test chat session that includes:

```text
Let's remember to research James Clear, Atomic Habits, and this YouTube video:
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

Close/classify the session and verify:

- `chat_sessions.extracted_entities` exists.
- It contains at least:
    - one `person` candidate for James Clear,
    - one `book` candidate for Atomic Habits,
    - one `youtube_video` candidate with `youtube_video_id`.
- Eligible candidates use `recommended_action: "resolve_or_enqueue"`.
- `chat_sessions.agent_metadata.libri_handoff` exists.
- The Libri handoff status contains per-entity statuses such as `found`,
  `queued`, `pending`, `needs_input`, or `error`.

### Repeat smoke

Run classification for the same session again and verify:

- The idempotency key is the same for the same logical entity set.
- Libri does not create duplicate work.
- BuildOS stores the latest compact handoff response without losing the
  extracted entity artifact.

### Libri side confirmation

In Libri, confirm that the same handoff produced one of:

- Existing resource references for found entities.
- `resourceRequests` rows for missing entities.
- Ingestion jobs for resources Libri can currently enqueue.
- `pending` status for repeated handoffs.

## Non-Goals For This Patch

- No live-turn deterministic Libri router.
- No BuildOS-owned Libri search/enqueue fallback.
- No full Libri result rendering in BuildOS.
- No external agent gateway changes.
- No BuildOS ontology/project mutation from extracted entities.
- No admin UI unless the smoke milestone has passed.

## Next Work After This Milestone

After the closed-session smoke passes, the next BuildOS slice should be
observability and operator control:

- Show `extracted_entities` on a session/admin detail surface.
- Show compact Libri handoff status.
- Add a manual retry action for `error`, `not_configured`, or stale handoff
  attempts.
- Consider a dedicated handoff table if audit history, retries, or dashboards
  become important.

Only after that should BuildOS expand how live agents discover or use Libri
results. The live path should remain agent-authored tool use, not deterministic
keyword routing.
