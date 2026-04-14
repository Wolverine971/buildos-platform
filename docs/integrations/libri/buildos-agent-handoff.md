<!-- docs/integrations/libri/buildos-agent-handoff.md -->

# BuildOS Libri Integration Agent Handoff

Date: 2026-04-13
Status: Planning handoff for BuildOS-side implementation
Audience: Agent working in `/Users/djwayne/buildos-platform`

## Vision

BuildOS is the project and progress system. Libri is the library and enrichment
system. BuildOS should be able to ask Libri about people, authors, books, and
YouTube videos before falling back to generic web search.

The initial user-facing behavior is:

- If a user asks BuildOS, "tell me about James Clear", BuildOS should check Libri
  first.
- If Libri already has a useful result, BuildOS should answer from Libri.
- If Libri does not have the resource yet, Libri should enqueue enrichment and
  return immediately.
- BuildOS must not wait for enrichment jobs to complete.
- BuildOS should treat Libri as a specialized knowledge source, not as a core
  BuildOS feature area.

The important separation of concerns:

- BuildOS owns project context, task/progress tracking, and agent orchestration.
- Libri owns library entities, enrichment state, research jobs, transcripts, book
  data, and librarian workflows.
- External agents such as OpenClaw should eventually be able to reach Libri
  through BuildOS's agent-call gateway, while BuildOS keeps Libri credentials
  server-side.

## Current BuildOS Context

BuildOS already has the right patterns for this integration:

- Internal agent tools are defined in
  `apps/web/src/lib/services/agentic-chat/tools/core/definitions`.
- Context-aware tool exposure is coordinated by
  `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`.
- Gateway-mode direct tools are selected in
  `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts`.
- Tool execution is dispatched in
  `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`.
- External service tools currently live in
  `apps/web/src/lib/services/agentic-chat/tools/core/executors/external-executor.ts`.
- Canonical op mapping lives in
  `apps/web/src/lib/services/agentic-chat/tools/registry/tool-registry.ts`.
- External agents use the BuildOS agent-call gateway:
  `apps/web/src/routes/api/agent-call/buildos/+server.ts`,
  `apps/web/src/lib/server/agent-call/agent-call-service.ts`, and
  `apps/web/src/lib/server/agent-call/external-tool-gateway.ts`.

The current BuildOS agent architecture is a useful model for Libri as well:

- small preloaded direct tool surface,
- explicit tool schemas,
- optional discovery tools (`skill_load`, `tool_search`, `tool_schema`),
- lazy domain executors,
- runtime policy for context and write safety.

Do not add Libri by bypassing this architecture. Add it as a small external
knowledge-source capability.

## Other Project Context: Libri

Libri lives at:

```text
/Users/djwayne/Desktop/book-pics/library-app
```

Libri is a SvelteKit + Convex personal library app. It is not just a book list.
It is intended to become the durable, AI-enriched knowledge corpus for:

- people and authors,
- books and book metadata,
- OCR fragments and chapters,
- YouTube videos and transcript fragments,
- external sources,
- AI-generated analyses,
- research tasks,
- librarian quality/completeness workflows.

Read these Libri files before implementing against the API:

- `docs/PROJECT_CONTEXT.md`
- `docs/EXTERNAL_API_SPEC.md`
- `docs/EXTERNAL_API_AGENT_INTEGRATION.md`
- `docs/WORKER_QUEUE_SYSTEM.md`
- `docs/LIVING_LIBRARY_SPEC.md`
- `docs/AGENT_ARCHITECTURE_SPEC.md`
- `docs/YOUTUBE_ENTITY_GRAPH_SPEC.md`
- `docs/BUILDOS_LIBRI_READINESS_HANDOFF.md`
- `convex/http.ts`
- `convex/apiSearch.ts`
- `convex/ingestion.ts`
- `convex/schema.ts`
- `convex/videoImports.ts`
- `convex/chat/runtime.ts`
- `convex/chat/tools.ts`

Current Libri external API facts:

- Auth is Bearer-token based in `convex/http.ts`.
- API scopes already include `search:all`, `queue:ingestion`,
  `read:ingestion`, `read:people`, `read:books`, `read:videos`,
  `chat:read`, `chat:write`, `research_tasks:read`,
  `research_tasks:write`, and `librarian:run`.
- Existing search endpoint:
  `GET /api/v1/search?q=...&types=person,book,chapter,youtubeVideo`.
- Existing enqueue endpoints:
  `POST /api/v1/ingestion/people`,
  `POST /api/v1/ingestion/books`, and
  `POST /api/v1/ingestion/videos`.
- Existing job status endpoint:
  `GET /api/v1/ingestion/jobs/{jobId}?includeEvents=true`.

Current Libri data model facts:

- `people`, `books`, `chapters`, `fragments`, `youtubeVideos`, and
  `youtubeTranscriptFragments` are first-class tables.
- `ingestionJobs` already track `kind`, `status`, `step`, `input`, `result`,
  `resourceRef`, `idempotencyKey`, `clientKeyPrefix`, and job events.
- Ingestion kinds currently include:
    - `person.discovery`
    - `book.discovery`
    - `book.photo_import`
    - `video.import`
- Status values currently include:
    - `queued`
    - `processing`
    - `needs_review`
    - `complete`
    - `failed`
    - `canceled`

Important Libri limitations to account for:

- Libri does not yet have the target resolver endpoint. BuildOS should be
  designed for `POST /api/v1/resolve`, but may need a compatibility bridge to
  existing search and ingestion endpoints while Libri catches up.
- Current YouTube import does not automatically fetch transcripts. A video
  import without `transcriptText` may reach `needs_review`.
- Current Libri search is useful for entity lookup, but it is not the final
  "search plus enqueue on miss" behavior.
- Libri's agentic chat exists, but it is not ready to be the first integration
  path. Treat the resolver API as the first stable path; treat librarian
  agent-to-agent messaging as a later phase.

The BuildOS agent should not implement Libri's resolver semantics inside
BuildOS long term. Libri should own resource normalization, miss memory,
dedupe, and enrichment enqueueing.

## Shared Interface Target

BuildOS should primarily call one Libri resolver endpoint.

Target Libri endpoint:

```text
POST /api/v1/resolve
Authorization: Bearer <LIBRI_API_KEY>
Content-Type: application/json
Idempotency-Key: <optional stable key>
```

Target request shape:

```json
{
	"query": "James Clear",
	"types": ["person", "book", "youtubeVideo"],
	"enqueueIfMissing": true,
	"responseDepth": "summary",
	"source": {
		"system": "buildos",
		"contextType": "global",
		"projectId": "optional-buildos-project-id",
		"sessionId": "optional-buildos-chat-session-id",
		"reason": "User asked BuildOS for information about James Clear"
	}
}
```

Target response statuses:

```json
{
	"status": "found",
	"resourceKey": "person:james-clear",
	"results": []
}
```

```json
{
	"status": "queued",
	"resourceKey": "person:james-clear",
	"job": {
		"jobId": "...",
		"kind": "person.discovery",
		"status": "queued"
	},
	"results": []
}
```

```json
{
	"status": "pending",
	"resourceKey": "person:james-clear",
	"job": {
		"jobId": "...",
		"kind": "person.discovery",
		"status": "processing"
	},
	"results": []
}
```

```json
{
	"status": "needs_input",
	"resourceKey": null,
	"message": "Book mention is ambiguous. Provide author or ISBN."
}
```

BuildOS should support the current Libri API as a fallback during development:

- `GET /api/v1/search`
- `POST /api/v1/ingestion/people`
- `POST /api/v1/ingestion/books`
- `POST /api/v1/ingestion/videos`
- `GET /api/v1/ingestion/jobs/{jobId}`

But the target interface is the resolver. Avoid baking search-then-enqueue
branching too deeply into BuildOS if Libri can own that behavior.

## BuildOS Tool Surface

Initial BuildOS skill:

```text
libri_knowledge
```

The skill should explain what Libri is, when BuildOS has access to it, and how
to choose between `resolve_libri_resource` and `web_search`. It should be exposed
only when `LIBRI_INTEGRATION_ENABLED` is enabled, so BuildOS can answer questions
like "Do you have access to Libri?" without hardcoding the full Libri playbook in
the base prompt.

Initial internal BuildOS tool:

```text
resolve_libri_resource
```

Suggested schema:

```json
{
	"type": "object",
	"properties": {
		"query": {
			"type": "string",
			"description": "Person, author, book title, ISBN, YouTube title, or YouTube URL."
		},
		"types": {
			"type": "array",
			"items": {
				"type": "string",
				"enum": ["person", "book", "youtubeVideo"]
			}
		},
		"enqueue_if_missing": {
			"type": "boolean",
			"description": "Whether Libri should queue enrichment if no existing resource is found."
		},
		"response_depth": {
			"type": "string",
			"enum": ["hit_only", "summary", "detail"]
		},
		"project_id": {
			"type": "string",
			"description": "Optional BuildOS project id for provenance only."
		},
		"reason": {
			"type": "string",
			"description": "Short explanation of why BuildOS is asking Libri."
		}
	},
	"required": ["query"]
}
```

Default behavior:

- `types` defaults to `["person", "book", "youtubeVideo"]`.
- `enqueue_if_missing` defaults to `true` only when the user needs the answer or
  explicitly asks to research/add the resource.
- `response_depth` defaults to `summary`.
- YouTube URLs should be sent as `youtubeVideo` with enqueue enabled.
- For ambiguous book mentions, prefer `enqueue_if_missing=false` unless the user
  supplied title plus author or ISBN.

Later optional tools:

- `get_libri_ingestion_job`
- `ask_libri_librarian`
- `get_libri_resource`

Do not start with a large Libri tool set. One resolver is enough for the first
working integration.

## Tool Routing Policy

BuildOS should prefer Libri before generic web search for durable library
knowledge.

Use `resolve_libri_resource` first when the user asks about:

- an author or thinker,
- a book,
- a YouTube video,
- a topic that is likely represented in the personal library.

Use `web_search` first when the user asks for:

- current or latest information,
- news,
- prices,
- laws or schedules,
- facts that are not likely to live in a durable personal library,
- direct web discovery outside books/videos/people.

Do not auto-enqueue on every passive mention. Auto-enqueue is appropriate when:

- the user explicitly asks to analyze, add, import, research, or send to Libri,
- the user asks a question that requires the resource and Libri has no record,
- a YouTube URL is provided and the user wants it analyzed,
- a project source is materially important and the user asks to preserve or
  analyze it.

If Libri returns `queued` or `pending`, BuildOS should not wait. The answer
should state that Libri has started or already has enrichment in progress and
then either give a lightweight answer from available context or ask whether the
user wants to continue with web search.

## BuildOS Persistence

The first slice does not need a new table.

If a project context exists, BuildOS may create a lightweight ontology source or
document pointer. Keep it small:

```json
{
	"provider": "libri",
	"resourceKey": "person:james-clear",
	"status": "queued",
	"jobId": "...",
	"originalQuery": "James Clear",
	"lastSyncedAt": "2026-04-13T00:00:00.000Z"
}
```

Do not mirror full Libri research into BuildOS. BuildOS should store pointers,
status, and concise summaries only when useful to project progress.

Medium-term improvement:

- Add a dedicated `external_research_requests` or similar BuildOS table for
  status sync, retry, provenance, and UI filtering.

## Environment

Add server-side configuration:

```text
LIBRI_INTEGRATION_ENABLED=false
LIBRI_API_BASE_URL=
LIBRI_API_KEY=
LIBRI_APP_BASE_URL=
```

Rules:

- `LIBRI_INTEGRATION_ENABLED` gates the BuildOS-side tool exposure and prompt
  guidance. Leave it off unless this Libri integration should be active in the
  environment.
- Never expose the Libri API key to the browser.
- Never include the raw key in model messages, tool results, logs, or error
  messages.
- Scope the Libri key narrowly once Libri supports scoped keys for the resolver.

## External Agent Gateway

After the internal tool works, expose it through the BuildOS external agent-call
gateway.

Suggested external op:

```text
libri.resource.resolve
```

Suggested direct tool name:

```text
resolve_libri_resource
```

OpenClaw flow should remain:

1. dial BuildOS,
2. call `tools/list`,
3. use the returned direct tool,
4. let BuildOS call Libri server-side.

OpenClaw should not need the Libri API key for the common path.

## BuildOS Implementation Plan

### First-Slice Scope Decisions

These decisions answer implementation questions for the first BuildOS agent.

1. Target endpoint

    Implement against the target Libri resolver endpoint:

    ```text
    POST /api/v1/resolve
    ```

    Do not skip the resolver just because Libri may not have shipped it yet. The
    BuildOS client and tests can be written contract-first with mocked responses.
    If a real Libri server returns 404, return a structured "resolver unavailable"
    result. Do not silently branch into legacy enqueue behavior.

2. Legacy fallback

    Do not implement search-plus-ingestion compatibility mode in BuildOS for the
    first slice.

    BuildOS may know the legacy endpoints for debugging, but it should not own
    resource miss semantics. Libri must own normalization, dedupe, miss memory,
    and enrichment enqueueing.

3. External agent gateway

    Do not include OpenClaw/external agent-call gateway support in the first
    implementation slice.

    Stop after the internal `resolve_libri_resource` tool is working and tested.
    Add external gateway exposure as a follow-up once the internal tool and Libri
    resolver contract are stable.

4. BuildOS persistence

    Keep the first slice stateless in BuildOS.

    Pass optional BuildOS provenance to Libri, such as `project_id`,
    `session_id`, and `reason`, but do not create ontology sources/documents or a
    BuildOS persistence table yet. Reevaluate persistence after the first
    end-to-end resolver test.

5. Missing configuration

    Wire these server-side config names:

    ```text
    LIBRI_INTEGRATION_ENABLED
    LIBRI_API_BASE_URL
    LIBRI_API_KEY
    LIBRI_APP_BASE_URL
    ```

    Leave values unset unless the local environment already has them. Do not
    commit secrets.

    If `LIBRI_INTEGRATION_ENABLED` is not enabled, hide Libri prompt guidance and
    normal tool exposure, including the `libri_knowledge` skill. Direct internal
    calls may return a structured disabled configuration result, but the model
    should not be prompted toward Libri.

    If `LIBRI_API_BASE_URL` or `LIBRI_API_KEY` is missing, keep the tool available
    but return a structured configuration result, for example:

    ```json
    {
    	"status": "configuration_error",
    	"code": "LIBRI_NOT_CONFIGURED",
    	"message": "Libri is not configured for this BuildOS environment."
    }
    ```

    Avoid throwing raw configuration errors into the model transcript.

6. Tool exposure

    First pass: expose `resolve_libri_resource` only in normal knowledge-bearing
    chat contexts, especially global and project contexts.

    Also expose the `libri_knowledge` skill when Libri is enabled. Use the skill
    to answer Libri access/capability questions and to remind the agent of the
    person-only resolver flow before it calls tools.

    Do not add it to the external agent-call gateway yet. Do not make it a
    project-create or calendar hot-path tool unless the user explicitly asks for
    Libri/library lookup from those contexts.

    In gateway mode, it is reasonable to preload it in global and project direct
    surfaces. In non-gateway mode, register it with contexts that mirror durable
    external knowledge lookup, not every possible write workflow.

7. Queued and pending responses

    Return structured data plus Libri's compact status `message`. Do not return a
    hard-coded user-facing sentence that the assistant must copy.

    Good tool result shape:

    ```json
    {
    	"status": "queued",
    	"resourceKey": "person:james-clear",
    	"results": [],
    	"job": {
    		"jobId": "...",
    		"kind": "person.discovery",
    		"status": "queued"
    	},
    	"message": "No existing Libri record was found, so enrichment was queued."
    }
    ```

    Let the BuildOS prompt and final assistant response decide how to phrase this
    to the user.

8. First test milestone

    The first reevaluation milestone is a person lookup flow:
    - BuildOS user asks: "tell me about James Clear."
    - BuildOS calls `resolve_libri_resource`.
    - Libri returns `found`, `queued`, or `pending`.
    - BuildOS responds without waiting for enrichment.

    Manual test cases:
    - Existing person returns `found`.
    - New clear person returns `queued`.
    - Repeating the new person returns `pending`, not a duplicate job.

    Do not expand to books, YouTube, persistence, or external gateway exposure
    until this flow has been tested and the response contract has been
    reevaluated.

9. Add a server-side Libri client.
    - Keep fetch wrapper small.
    - Normalize base URL.
    - Add request timeout.
    - Return typed errors without secrets.

10. Add `resolve_libri_resource` to internal tool definitions and metadata.
    - Include it in the base/global gateway surfaces.
    - Add canonical op mapping in the tool registry.

11. Add executor support.
    - Prefer a new `LibriExecutor` if the logic grows beyond a thin method.
    - A single method in `ExternalExecutor` is acceptable for the first slice.

12. Update prompts/tool selection.
    - Teach the agent to use Libri before `web_search` for people, books, and
      YouTube videos.
    - Keep current `web_search` behavior for current/live web facts.

13. Add tests.
    - Mock Libri `found`, `queued`, `pending`, `needs_input`, and error responses.
    - Verify no blocking wait loop.
    - Verify API key is not included in the tool result.
    - Verify tool selection keeps `web_search` for current-information requests.

14. Add external gateway support after internal behavior is stable.
    - Add allowed op type.
    - Add public tool registry entry.
    - Add gateway executor mapping.
    - Add read-scope tests.

## Acceptance Criteria

- BuildOS can call Libri through server-side configuration.
- The agent can answer from a Libri `found` result.
- The agent can report `queued` or `pending` without waiting.
- Repeated requests for the same missing resource depend on Libri's
  `resourceKey`/request tracking and do not create duplicate jobs.
- BuildOS does not leak `LIBRI_API_KEY`.
- BuildOS still uses `web_search` for clearly current/live information.
- OpenClaw can eventually receive `resolve_libri_resource` from `tools/list`
  and call it through BuildOS without direct Libri credentials.

## Coordination Notes For The Libri Agent

BuildOS is waiting on Libri to provide:

- a single resolver endpoint,
- deterministic `resourceKey` values,
- stable response statuses: `found`, `queued`, `pending`, `needs_input`,
  `error`,
- idempotent miss handling,
- compact result objects suitable for model context,
- a future librarian-agent messaging endpoint for richer agent-to-agent
  collaboration.

Until that exists, BuildOS can call Libri's existing search and ingestion
endpoints, but that should be treated as a compatibility bridge, not the final
contract.
