<!-- docs/integrations/libri/buildos-session-synthesis-agent-instructions.md -->

# BuildOS Agent Instructions: Libri Session Synthesis

Date: 2026-04-15
Workspace: `/Users/djwayne/buildos-platform`
Audience: Agent implementing the BuildOS side

## 2026-04-15 BuildOS Progress

The BuildOS implementation slice described in this handoff has been completed.
The user reported that the Supabase migration has been applied.

Completed BuildOS work:

- `chat_sessions.extracted_entities` nullable JSONB migration added:
  `supabase/migrations/20260429000005_add_chat_session_extracted_entities.sql`.
- Shared types updated in `packages/shared-types/src/chat.types.ts`,
  `packages/shared-types/src/database.types.ts`, and
  `packages/shared-types/src/database.schema.ts`.
- `apps/worker/src/workers/chat/chatSessionClassifier.ts` now requests and
  saves `extracted_entities` with the normal title/topics/summary update.
- The classifier prompt includes message IDs and turn indices so candidates can
  reference source messages.
- Fallback and insufficient-message classification now save an empty Libri
  extraction artifact.
- `apps/worker/src/workers/chat/libriSessionEntities.ts` sanitizes extraction
  output, trims strings/snippets, clamps confidence, limits candidate counts,
  normalizes YouTube video IDs, and gates automatic handoff eligibility.
- `apps/worker/src/workers/chat/libriEntityHandoffClient.ts` sends eligible
  candidates to `POST /api/v1/entity-handoffs` with a stable idempotency key.
- Handoff results are compacted and stored under
  `chat_sessions.agent_metadata.libri_handoff`.
- Libri configuration, network, and API failures are non-fatal worker warnings.
- `apps/web/src/routes/api/chat/sessions/[id]/close/+server.ts` now queues
  classification for sessions that have title/summary synthesis but no
  `extracted_entities` artifact.

Tests/checks run:

- `pnpm --filter=@buildos/worker test:run tests/chatSessionLibriEntities.test.ts tests/libriEntityHandoffClient.test.ts tests/chatSessionClassifierLibri.test.ts`
- `pnpm --filter=@buildos/worker typecheck`
- `pnpm --filter=@buildos/worker lint`
- `pnpm --filter=@buildos/shared-types typecheck`

All of the above passed.

Pending:

- BuildOS should complete the hardening milestone in
  `docs/integrations/libri/buildos-hardening-next-milestone.md` before the
  first real smoke.
- BuildOS local `.env` is missing `LIBRI_INTEGRATION_ENABLED`,
  `LIBRI_API_BASE_URL`, and `LIBRI_API_KEY`, so the real endpoint smoke has not
  been run from BuildOS yet.
- Once env is configured, run the shared fixture through a real closed session
  and verify saved `extracted_entities`, compact `libri_handoff` status, and
  idempotent repeated classification behavior.
- Recommended next BuildOS slice after smoke: admin visibility for extracted
  entities/handoff status and a manual retry action for failed or
  not-configured handoffs.

## Read First

Read these files before editing code:

- `docs/integrations/libri/session-synthesis-entity-handoff.md`
- `docs/integrations/libri/buildos-hardening-next-milestone.md`
- `/Users/djwayne/Desktop/book-pics/library-app/docs/BUILDOS_ENTITY_HANDOFF_AGENT_INSTRUCTIONS.md`
- `docs/integrations/libri/buildos-agent-handoff.md`
- `apps/web/src/routes/api/chat/sessions/[id]/close/+server.ts`
- `apps/web/src/routes/api/chat/sessions/[id]/classify/+server.ts`
- `apps/web/src/lib/server/chat-classification.service.ts`
- `apps/worker/src/workers/chat/chatSessionClassifier.ts`
- `apps/web/src/lib/services/agentic-chat/tools/libri/client.ts`
- `apps/web/src/lib/services/agentic-chat/tools/skills/definitions/libri_knowledge/SKILL.md`

The older `buildos-agent-handoff.md` contains useful Libri integration context,
but the current direction is the session-close handoff plan. Do not implement a
hard-coded live-turn Libri router.

## What We Are Doing Right Now

BuildOS already has agent-directed Libri tools. The next feature is different:
when a BuildOS chat session closes, the existing background chat analysis should
extract Libri-relevant entities and pass them to Libri asynchronously.

The immediate goal is:

1. Extend chat session synthesis with `extracted_entities`.
2. Extract high-confidence people, books, YouTube videos, and YouTube channels.
3. Store the extraction result on the BuildOS session.
4. Hand eligible entities to Libri without blocking chat close.
5. Store compact handoff status for audit/idempotency.

BuildOS should not decide Libri's enrichment workflow. Libri owns lookup,
dedupe, resource requests, ingestion jobs, and research.

## Where This Is Going

This is a step toward a unified BuildOS and Libri contract:

- BuildOS is the project/progress system and chat orchestrator.
- Libri is the durable research/library/enrichment system.
- BuildOS can use Libri during live chat when the agent chooses to.
- BuildOS also sends session-close entity handoffs so Libri can build the
  library over time.
- Later, external agents can coordinate through BuildOS and Libri, but external
  gateway work is not part of this slice.

## V1 Decisions

- No hard-coded Libri turn routing.
- Use the existing `classify_chat_session` worker path as the BuildOS seam.
- Add `chat_sessions.extracted_entities` JSONB as the durable synthesis artifact.
- Store first-pass handoff status in `chat_sessions.agent_metadata.libri_handoff`
  unless a dedicated table becomes necessary during implementation.
- Target Libri endpoint: `POST /api/v1/entity-handoffs`.
- Send entities in a batch, because one chat can mention several resources.
- Only send candidates with `recommended_action: "resolve_or_enqueue"`.
- BuildOS must not call Libri ingestion endpoints directly for missing books or
  videos.
- Libri calls are non-fatal. Title/topics/summary must still save if Libri is
  disabled, unavailable, or returns errors.

## Shared Entity Shape

Use this shape unless the Libri agent coordinates a contract change:

```ts
type SessionExtractedEntities = {
	libri_candidates: ExtractedLibriEntity[];
	ignored_candidates?: IgnoredEntityCandidate[];
	extraction_version: 'libri_session_synthesis_v1';
	extracted_at: string;
};

type ExtractedLibriEntity = {
	entity_type: 'person' | 'book' | 'youtube_video' | 'youtube_channel';
	display_name: string;
	canonical_query: string;
	url?: string;
	youtube_video_id?: string;
	authors?: string[];
	aliases?: string[];
	confidence: number;
	relevance: 'primary' | 'supporting' | 'incidental';
	recommended_action: 'resolve_or_enqueue' | 'search_only' | 'ignore';
	user_requested_research: boolean;
	extraction_reason: string;
	source_message_ids: string[];
	source_turn_indices: number[];
	evidence_snippets: string[];
};
```

## BuildOS Implementation Tasks

1. Inspect the current close/classification path.
    - Confirm close still queues `classify_chat_session`.
    - Keep `AgentChatModal.finalizeSession()` fast and small.

2. Add storage and types.
    - Add a Supabase migration for nullable `chat_sessions.extracted_entities`
      JSONB.
    - Update generated/shared database types if this repo requires it.
    - If type generation is blocked, use a narrowly typed local cast and document
      the follow-up.

3. Extend worker classification.
    - Update `ChatClassificationResponse` in
      `apps/worker/src/workers/chat/chatSessionClassifier.ts`.
    - Update the classification prompt so the model returns title, topics,
      summary, and `extracted_entities`.
    - Include message IDs and turn indices in the prompt input so extracted
      entities can reference source messages.
    - Fallback classification should return an empty `libri_candidates` array.
    - Insufficient-message classification should also return an empty
      `libri_candidates` array.

4. Add sanitization.
    - Limit candidate count.
    - Accept only supported entity types.
    - Trim strings and snippets.
    - Clamp confidence to `0..1`.
    - Drop candidates with missing `display_name` or `canonical_query`.
    - Do not send `search_only`, `ignore`, or low-confidence incidental entities
      to Libri automatically.

5. Save extraction output.
    - Save `extracted_entities` in the same session update that saves
      `auto_title`, `chat_topics`, `summary`, and `last_classified_at`.
    - Preserve existing `agent_metadata` when later writing handoff status.

6. Add a worker/server Libri handoff client.
    - Use server-side env only:
        - `LIBRI_INTEGRATION_ENABLED`
        - `LIBRI_API_BASE_URL`
        - `LIBRI_API_KEY`
    - Never expose the key to the browser, model prompts, logs, or chat messages.
    - Call `POST /api/v1/entity-handoffs` with an idempotency key.
    - Suggested idempotency key:
      `buildos-session-entity-handoff:<sessionId>:<stable-entity-hash>`.
    - Treat network/config/API errors as non-fatal worker warnings.

7. Store compact handoff status.
    - Store status under `chat_sessions.agent_metadata.libri_handoff` for V1.
    - Include attempted time, idempotency key, per-entity status, resource key,
      job id, and compact message.
    - Do not store full Libri research payloads in BuildOS.

8. Add tests.
    - Extraction parser/sanitizer handles person/book/video/channel.
    - Low-confidence or `search_only` candidates are saved but not handed off.
    - Libri disabled still saves `extracted_entities`.
    - Libri found/queued/pending/needs_input/error responses are stored compactly.
    - Duplicate classification/close does not create duplicate handoff attempts
      with different idempotency keys for the same session/entity set.

## BuildOS Test Fixture

Use this as the first shared fixture:

```text
User: I am thinking about James Clear and Atomic Habits for this project.
User: Also remind me to process this video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
Assistant: Got it.
```

Expected `extracted_entities.libri_candidates`:

- `person`: James Clear
- `book`: Atomic Habits, preferably with author James Clear
- `youtube_video`: URL plus video ID

## Parallel Coordination Checkpoints

### Checkpoint 0: Contract Freeze

Before major code changes, confirm with the Libri agent:

- endpoint path is `POST /api/v1/entity-handoffs`,
- entity type names are `person`, `book`, `youtube_video`,
  `youtube_channel`,
- response statuses are `found`, `queued`, `pending`, `needs_input`, `error`,
- BuildOS source fields are allowlisted.

### Checkpoint 1: BuildOS Extraction-Only

BuildOS should complete this before depending on real Libri behavior:

- migration/types are in place,
- worker saves `extracted_entities`,
- tests use mocked Libri or no Libri call,
- sample extracted entity JSON is available for the Libri agent.

Stop here and share the sample payload if the Libri endpoint is not ready.

### Checkpoint 2: Libri Endpoint Contract

Once the Libri agent provides a local or deployed endpoint:

- verify auth config locally,
- send the shared fixture payload,
- confirm per-entity statuses,
- confirm repeated requests return `found` or `pending`, not duplicate `queued`.

### Checkpoint 3: End-to-End Smoke

Run a real closed-session smoke:

- close a BuildOS chat with the fixture text,
- confirm `chat_sessions.extracted_entities` was saved,
- confirm Libri received the batch handoff,
- confirm BuildOS stored compact handoff status,
- rerun classification or close and confirm idempotency.

## Out Of Scope For This Agent

- Do not add deterministic entity detection in the live chat turn loop.
- Do not add external OpenClaw/agent gateway support in this slice.
- Do not create BuildOS ontology records from extracted entities.
- Do not build Libri UI.
- Do not redesign Libri agentic chat.
- Do not call Libri's low-level ingestion endpoints from BuildOS to emulate the
  resolver.

## Definition Of Done

- The session-close worker can save `extracted_entities`.
- BuildOS can send eligible candidates to Libri through the agreed batch
  endpoint when configured.
- The feature is safe when Libri is disabled or unavailable.
- The shared fixture works with mocked Libri and, after Checkpoint 2, real Libri.
- Tests cover the extraction, handoff, and idempotency behavior for this slice.
