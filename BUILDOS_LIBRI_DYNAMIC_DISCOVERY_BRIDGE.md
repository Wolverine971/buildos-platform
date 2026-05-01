<!-- BUILDOS_LIBRI_DYNAMIC_DISCOVERY_BRIDGE.md -->

# BuildOS <> Libri Dynamic Discovery Bridge

Status: proposed implementation handoff
Audience: BuildOS agent / BuildOS implementation owner
Last updated: 2026-04-30

## Goal

BuildOS should treat Libri as a connected durable library and enrichment
database. Libri stores books, people/authors, YouTube videos, transcripts,
analysis, ingestion jobs, and future library resources.

BuildOS should not need hard-coded knowledge of every Libri resource, column, or
future endpoint. Instead, BuildOS should know that Libri exists, ask Libri what
it has, ask for specific capability schemas when needed, and progressively
materialize only the Libri tools relevant to the current user request.

The desired architecture is:

1. Libri publishes a trusted capability manifest.
2. BuildOS fetches, validates, and caches that manifest.
3. BuildOS exposes a tiny permanent Libri discovery bridge to the agent.
4. The agent asks for Libri domains/capabilities as needed.
5. BuildOS materializes specific Libri operations into first-class direct tool
   definitions only after they pass local validation and policy checks.
6. The model calls those direct tools by name; BuildOS routes them through an
   internal generic Libri executor.

This lets most future capability changes happen in Libri without needing a
BuildOS code change every time Libri adds a new resource or operation.

## Current State

BuildOS already has a static Libri integration:

- `resolve_libri_resource`
- `query_libri_library`

These are useful, but they are hard-coded. BuildOS currently does not consume
Libri's `GET /api/v1/schema` endpoint to discover new Libri capabilities.

Libri now exposes:

- `GET /api/v1/schema`
- `POST /api/v1/ingestion/videos/preview`
- `POST /api/v1/ingestion/videos`
- `POST /api/v1/auth/token-exchange`
- agent-writable `video.import` schema, including local transcript and flexible
  `analysis.extensions`

The next BuildOS milestone is to add a discovery bridge so BuildOS can learn
about these capabilities dynamically.

## Core Principle

Do not let arbitrary remote JSON become arbitrary executable tools.

The safe model is:

- Libri publishes a trusted manifest.
- BuildOS validates the manifest against local rules.
- BuildOS exposes only allowed, well-formed operations as direct tools.
- BuildOS executes those operations through a generic Libri executor that knows
  how to attach auth, enforce scopes, validate args, add idempotency keys, and
  block sensitive operations.

This is dynamic discovery, not unbounded remote code execution.

Important implementation decision:

- Do not make `libri_call({ op, arguments })` the normal model-facing path.
- BuildOS's existing agentic-chat discovery pattern works better when the model
  receives the exact direct tool definition in the next model pass.
- A generic op-call shape can stay as an internal executor primitive or admin
  debug hook, but normal chat should call direct tools such as
  `libri_video_import_preview`.

## Progressive Disclosure Pattern

BuildOS should use four levels of disclosure.

### 1. Static Concept

BuildOS permanently knows:

- Libri is the connected durable library / enrichment system.
- Libri has stable top-level domains for books, people, and YouTube videos.
- Libri may contain books, people, authors, YouTube videos, transcripts,
  analyses, ingestion jobs, and related library resources.
- Libri is a peer service. BuildOS calls it over authenticated HTTP.

This can live in BuildOS prompt guidance and a Libri skill.

### 2. Domain Overview

BuildOS can ask Libri:

```text
What domains do you expose?
```

This should return a compact overview, such as:

- domains such as `books`, `people`, and `youtube_videos`
- counts or availability hints
- recently updated resources
- broad capabilities
- useful next operations

This can be backed by:

- `GET /api/v1`
- `GET /api/v1/schema`
- existing library overview endpoints

BuildOS tool idea:

```text
libri_overview
```

### 3. Capability Search

BuildOS can ask:

```text
What Libri operations are relevant inside this domain?
```

For example, if the user says "upload this YouTube transcript and analysis to
Libri", BuildOS should classify the request as the `youtube_videos` domain and
discover that Libri has a video import preview operation and a video import
create operation.

BuildOS tool idea:

```text
libri_search_capabilities({ domain?, query, resource?, kind?, limit? })
```

This should search the cached Libri manifest, not expose every possible Libri
operation in the base prompt. The result should include the matching canonical
ops and the direct tool names that BuildOS can materialize.

### 4. Direct Tool Materialization And Execution

Once the model picks an operation, BuildOS can ask:

```text
Give me the exact schema for libri.video.import.preview.
```

BuildOS tool idea:

```text
libri_get_capability_schema({ op })
```

Then BuildOS materializes the matching direct tool definition for the next model
pass. For example:

```text
libri_video_import_preview
libri_video_import_create
```

The next model pass calls the direct tool by name with schema-shaped arguments.
BuildOS maps that direct tool back to the validated Libri operation and executes
it through an internal generic Libri executor.

BuildOS should avoid making this generic op-call shape model-facing:

```text
libri_call({ op, arguments, idempotencyKey? })
```

If `libri_call` exists, treat it as an internal/admin/debug primitive, not the
normal Agentic chat pattern.

## Per Request Or Cached?

Use both, with different responsibilities.

BuildOS should not fetch Libri's full manifest from the network on every tool
call. It should fetch and cache the manifest server-side with a short TTL.

Recommended behavior:

- Fetch on first Libri use in a process/session.
- Cache for 5-15 minutes.
- Refresh when TTL expires.
- Allow a force refresh for admin/debug use.
- Include the manifest version/hash in tool results so behavior is traceable.
- If Libri is unavailable, keep using the last valid cached manifest for a short
  stale window, but mark it stale.

For each user request, BuildOS should search and materialize only the relevant
operations from the cached manifest. So:

- network fetch: cached, not every request
- capability selection: per request
- tool materialization: per request or per conversation turn

This keeps the model context small while still letting Libri evolve.

## Important Model-Turn Constraint

Most LLM tool APIs require the available tools to be declared before the model
starts a response. That means BuildOS usually cannot discover a brand-new direct
tool halfway through a model response and have that same model call invoke it as
a first-class tool.

The BuildOS Agentic chat stack already uses a gateway/materialization pattern:
discovery tools return direct tool names, the orchestrator adds those tool
definitions to the active tool list, and the next model pass calls the direct
tool by name. Libri should use that same pattern.

### Required Pattern: Discover Then Materialize Next Turn

1. Model calls `libri_search_capabilities`.
2. BuildOS returns matching ops and `materialized_tools`.
3. BuildOS materializes direct Libri tool definitions from the validated
   manifest.
4. Next model pass uses the direct Libri tool, such as
   `libri_video_import_preview`.
5. For complex or risky writes, the model may first call
   `libri_get_capability_schema`; that result also materializes the direct tool
   for the next pass.

This is clean and works well for complex or risky writes.

### Avoid As Normal Chat Pattern: Generic Op Call

1. Model calls `libri_search_capabilities`.
2. Model calls `libri_get_capability_schema`.
3. Model calls `libri_call({ op, arguments })`.
4. BuildOS validates the op and args locally, then calls Libri.

This keeps the tool count low, but it has already proven weaker in BuildOS for
normal writes. It hides the true operation schema inside an `arguments` envelope,
which makes project/context defaults, validation repair, and model tool
selection less reliable.

Recommendation:

- Use direct dynamic Libri tools for normal Agentic chat.
- Keep a generic Libri executor internally so BuildOS does not duplicate HTTP,
  auth, validation, scope, idempotency, timeout, and redaction logic.
- Only expose `libri_call` as an admin/debug/internal primitive if needed.

## Proposed Permanent BuildOS Bridge Tools

BuildOS should add a tiny static bridge. These tools are stable and do not
change often.

### `libri_overview`

Purpose:

- Explain what Libri is.
- Return high-level domain/capability overview.
- Return stable domain ids such as `books`, `people`, and `youtube_videos`.
- Include manifest version and freshness.

Inputs:

```json
{
	"refresh": false,
	"includeDomains": true
}
```

### `libri_search_capabilities`

Purpose:

- Search Libri's cached capability manifest.
- Return small matching operation summaries.
- Do not return huge schemas by default.

Inputs:

```json
{
	"domain": "youtube_videos",
	"query": "upload youtube transcript analysis",
	"resource": "video.import",
	"kind": "write",
	"limit": 5
}
```

Expected result shape:

```json
{
	"type": "libri_capability_search_results",
	"domain": "youtube_videos",
	"manifestVersion": "libri-capabilities/2026-04-30",
	"matches": [
		{
			"op": "libri.video.import.preview",
			"tool_name": "libri_video_import_preview",
			"kind": "write",
			"resource": "video.import",
			"description": "Validate a transcript and analysis payload before queueing."
		}
	],
	"materialized_tools": ["libri_video_import_preview", "libri_video_import_create"],
	"next_step": "Use the direct Libri tool after it is loaded in the next model pass."
}
```

### `libri_get_capability_schema`

Purpose:

- Return exact input schema and usage guidance for one Libri operation.
- Materialize the direct tool for the next model pass.

Inputs:

```json
{
	"op": "libri.video.import.preview",
	"includeExamples": true
}
```

Expected result shape:

```json
{
	"type": "libri_capability_schema",
	"op": "libri.video.import.preview",
	"tool_name": "libri_video_import_preview",
	"callable_tool": "libri_video_import_preview",
	"schema": {},
	"materialized_tools": ["libri_video_import_preview"]
}
```

### Dynamic Direct Libri Tools

Purpose:

- Give the model operation-specific schemas and argument names.
- Let BuildOS reuse existing direct-tool validation, context defaulting, repair,
  and write ledger behavior.
- Keep the generic HTTP execution path internal.

Example dynamic tool names:

```text
libri_video_import_preview
libri_video_import_create
libri_people_resolve
libri_books_search
```

Each dynamic direct tool maps back to exactly one validated manifest operation.

## Libri Manifest Shape

Libri's existing `GET /api/v1/schema` is a starting point. Longer term, it
should evolve into a capability manifest with operation-level metadata.

Recommended operation shape:

```json
{
	"version": "v1",
	"manifestVersion": "libri-capabilities/2026-04-30",
	"domains": {
		"youtube_videos": {
			"label": "YouTube Videos",
			"description": "Video records, transcripts, analysis, ingestion jobs, and imports.",
			"resources": {
				"video.import": {
					"description": "Upload or queue YouTube video ingestion."
				}
			},
			"operations": [
				{
					"op": "libri.video.import.preview",
					"toolName": "libri_video_import_preview",
					"domain": "youtube_videos",
					"method": "POST",
					"path": "/api/v1/ingestion/videos/preview",
					"kind": "write",
					"resource": "video.import",
					"description": "Validate a local transcript and analysis payload before queueing.",
					"requiredScopes": ["queue:ingestion"],
					"requiresIdempotencyKey": false,
					"inputSchema": {},
					"outputSchema": {},
					"examples": [],
					"safety": {
						"modelVisible": true,
						"adminOnly": false,
						"allowDirectToolMaterialization": true,
						"allowGenericBridgeExecution": false
					}
				}
			]
		}
	}
}
```

The current Libri schema already includes the important `video.import` input
shape. BuildOS can use resource/input shapes for overview and capability
search, but direct tool materialization and execution should wait until the
manifest includes operation-level metadata: `toolName`, `domain`, `method`,
`path`, `requiredScopes`, idempotency policy, and safety flags.

For YouTube import operations, BuildOS should use Libri's real camelCase API
fields from the manifest, not snake_case aliases. Important fields include:

```text
youtubeVideoId
videoTitle
channelTitle
youtubeChannelId
transcriptText
rawDetailsText
previewOnly
createImport
```

BuildOS should enforce `transcriptText` plus either `url` or `youtubeVideoId`
before calling Libri. Preview results should be read from `response.preview`,
including `response.preview.status`, `response.preview.ok`,
`response.preview.canCreateImport`, and `response.preview.issues`.

## Validation Rules In BuildOS

When BuildOS fetches the Libri manifest, it should validate before exposing any
capability to the model.

Minimum validation:

- Manifest is valid JSON and has expected `version`.
- Each operation has a stable `op`, `toolName`, `domain`, `method`, `path`,
  `description`, and `inputSchema`.
- `op` must start with `libri.`.
- `toolName` must start with `libri_`, contain only lowercase letters, numbers,
  and underscores, and map to exactly one operation.
- `domain` must be a known top-level domain from the manifest.
- `path` must be relative and start with `/api/v1/`.
- `method` must be in an allowlist: `GET`, `POST`, possibly `PATCH` later.
- Operation descriptions and schemas must fit size limits.
- `requiredScopes` must be present.
- Operation must not be admin-only unless BuildOS context explicitly allows it.
- Operation must set `safety.allowDirectToolMaterialization: true` before
  BuildOS exposes it as a model-facing direct tool.
- Block sensitive operations from the model surface:
    - `auth/token-exchange`
    - admin analytics
    - key creation/deletion
    - internal librarian/admin actions unless explicitly designed for agent use
- For writes, require an idempotency strategy unless the manifest explicitly
  marks idempotency as unnecessary.
- Validate tool arguments against the operation's input schema before making
  the HTTP call.

If validation fails, BuildOS should omit that operation and log a structured
server-side warning without exposing secrets.

## Execution Rules

The generic Libri executor should:

- Be internal to BuildOS normal chat orchestration.
- Receive the direct tool name, resolve it to exactly one validated manifest op,
  and execute that op.
- Build the target URL from `LIBRI_API_BASE_URL` and the manifest path.
- Attach `Authorization: Bearer <LIBRI_API_KEY>`.
- Never expose `LIBRI_API_KEY` to the browser, model text, logs, or tool output.
- Add `Content-Type: application/json` for JSON bodies.
- Add `Idempotency-Key` for writes that require it.
- Use timeouts.
- Redact secrets in errors.
- Return structured status, HTTP status, selected operation id, and manifest
  version.
- Avoid returning huge payloads unless the operation schema says it is safe.

## Expected Flow: YouTube Transcript Upload

User asks BuildOS:

```text
I already have a YouTube transcript and analysis. Upload it to Libri.
```

BuildOS flow:

1. Agent knows Libri is the durable library.
2. Agent calls `libri_search_capabilities` with a query like
   `"youtube transcript analysis upload"` and `domain: "youtube_videos"`.
3. BuildOS searches the cached Libri manifest and returns matching ops plus
   `materialized_tools`:
    - `libri.video.import.preview` -> `libri_video_import_preview`
    - `libri.video.import.create` -> `libri_video_import_create`
4. BuildOS materializes the direct tool definitions from the validated manifest.
5. Next model pass prepares the transcript and analysis payload and calls
   `libri_video_import_preview`.
6. BuildOS maps `libri_video_import_preview` to
   `libri.video.import.preview`, validates the args locally, and calls Libri.
7. If preview is valid or valid with warnings, the next model pass calls
   `libri_video_import_create` with an idempotency key or stable idempotency
   input.
8. BuildOS maps the direct create tool to the validated Libri op and returns the
   queued import/job status to the user.

This lets Libri own the exact ingestion schema while BuildOS owns conversation
orchestration.

## Token And Scope Expectations

BuildOS should use a scoped Libri token in server/worker env:

```text
LIBRI_INTEGRATION_ENABLED=true
LIBRI_API_BASE_URL=https://<deployment>.convex.site
LIBRI_API_KEY=<scoped Libri API key>
LIBRI_APP_BASE_URL=<optional app URL>
```

Recommended scopes for the BuildOS runtime key:

```text
read:people
read:books
read:chapters
read:videos
search:all
queue:ingestion
read:ingestion
```

Do not give normal BuildOS runtime keys:

```text
tokens:exchange
librarian:run
admin
```

Token exchange should happen outside normal runtime setup with an owner/grant
key, then the returned scoped token should be stored as `LIBRI_API_KEY`.

## Implementation Phases

### Phase 1: Discovery Client

- Add a BuildOS Libri manifest client.
- Fetch `GET /api/v1/schema`.
- Cache with TTL.
- Validate manifest shape.
- Add server-side tests for success, stale cache, invalid manifest, and auth
  failure.

### Phase 2: Permanent Bridge Tools

- Add `libri_overview`.
- Add `libri_search_capabilities`.
- Add `libri_get_capability_schema`.
- Add dynamic direct Libri tool generation from validated manifest ops.
- Extend gateway materialization so Libri search/schema results can load direct
  Libri tool definitions.

### Phase 3: Controlled Writes

- Enable `libri_video_import_preview` as a direct dynamic tool.
- Enable `libri_video_import_create` as a direct dynamic tool with idempotency.
- Add tests for local transcript + analysis upload.

### Phase 4: Deeper Registry Integration

- Optionally feed validated Libri ops into BuildOS `tool_search` under a Libri
  provider/group.
- Optionally feed Libri operation schemas into BuildOS `tool_schema`.
- Keep external agent-call gateway exposure separate and explicitly scoped.

## Acceptance Criteria

- BuildOS can answer "what is Libri and what does it have?" from the Libri
  manifest/overview.
- BuildOS can discover YouTube transcript upload capability without hard-coded
  prompt text for that specific endpoint.
- BuildOS can retrieve exact input schema for the discovered operation.
- BuildOS can materialize `libri_video_import_preview` from the validated Libri
  manifest.
- BuildOS can preview a local transcript + analysis upload through the direct
  dynamic Libri tool.
- BuildOS can materialize and call the direct create/import tool after preview
  succeeds.
- Adding a new safe Libri operation to the manifest does not require changing
  BuildOS prompt text or static tool definitions.
- BuildOS still refuses sensitive or malformed Libri operations.

## Summary

BuildOS should keep a tiny stable Libri bridge and let Libri publish the
capabilities behind it. On each request, BuildOS should progressively discover
only the relevant Libri operations from a cached, trusted manifest. Before any
operation becomes callable, BuildOS validates the manifest entry, turns it into
an operation-specific direct tool definition, and validates direct-tool
arguments before execution. This gives dynamic Libri evolution without giving
the model an unbounded remote execution surface or forcing it through a generic
`op`/`arguments` envelope.
