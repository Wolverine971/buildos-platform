# Libri -> BuildOS Dynamic Tool Manifest Spec

Status: proposed Libri contract
Audience: Libri implementation owner / BuildOS integration owner
Last updated: 2026-04-30

## Goal

Libri should publish a capability manifest that lets BuildOS discover Libri
domains and materialize safe Libri operations as direct Agentic chat tools.

BuildOS should not ask the model to call a generic shape like:

```text
libri_call({ op, arguments })
```

Instead, BuildOS will:

1. Fetch and cache Libri's manifest.
2. Validate domains and operations locally.
3. Search the manifest by domain and query.
4. Materialize validated operations as direct tools, such as
   `libri_video_import_preview`.
5. Execute those direct tools through a generic internal Libri HTTP executor.

This matches BuildOS's existing discovery pattern and keeps model-facing tool
calls simple.

## Required Endpoint

Libri should expose:

```text
GET /api/v1/schema
```

The response should be JSON and should be safe to cache for a short TTL.

Recommended headers:

```text
Content-Type: application/json
Cache-Control: private, max-age=300
```

## Top-Level Manifest Shape

```json
{
  "version": "v1",
  "manifestVersion": "libri-capabilities/2026-04-30",
  "generatedAt": "2026-04-30T12:00:00.000Z",
  "domains": {
    "books": {
      "label": "Books",
      "description": "Books, chapters, authorship, categories, summaries, and analysis.",
      "resources": {},
      "operations": []
    },
    "people": {
      "label": "People",
      "description": "Authors, creators, thinkers, and public figures.",
      "resources": {},
      "operations": []
    },
    "youtube_videos": {
      "label": "YouTube Videos",
      "description": "Video records, transcripts, analysis, ingestion jobs, and imports.",
      "resources": {},
      "operations": []
    }
  }
}
```

Domain ids should be stable. BuildOS expects at least:

```text
books
people
youtube_videos
```

## Operation Shape

Each operation must include enough metadata for BuildOS to create a direct tool
definition and route execution safely.

```json
{
  "op": "libri.video.import.preview",
  "toolName": "libri_video_import_preview",
  "domain": "youtube_videos",
  "resource": "video.import",
  "kind": "write",
  "method": "POST",
  "path": "/api/v1/ingestion/videos/preview",
  "description": "Validate a YouTube transcript and analysis payload before queueing ingestion.",
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
```

Required operation fields:

- `op`: Canonical operation id. Must start with `libri.`.
- `toolName`: Direct BuildOS tool name. Must start with `libri_` and use only
  lowercase letters, numbers, and underscores.
- `domain`: Stable domain id from the top-level `domains` object.
- `resource`: More specific resource family, such as `video.import`.
- `kind`: `read` or `write`.
- `method`: `GET` or `POST` for the first version.
- `path`: Relative `/api/v1/...` path. No absolute URLs.
- `description`: Model-facing direct tool description.
- `requiredScopes`: Runtime token scopes needed for execution.
- `inputSchema`: JSON Schema object for direct tool arguments.
- `safety`: Model/tool exposure policy.

## Tool Name Rules

`toolName` is what the model will eventually call. It should be specific and
boring:

```text
libri_video_import_preview
libri_video_import_create
libri_people_resolve
libri_books_search
```

Do not reuse a `toolName` for multiple operations.

## Input Schema Rules

`inputSchema` should be a JSON Schema object compatible with LLM function tools.

Recommended constraints:

- Use `type: "object"` at the root.
- Use explicit `properties`.
- Use `required` for fields Libri needs.
- Use `additionalProperties: false` unless flexible extension data is required.
- Keep field descriptions short and operational.
- Avoid huge enum lists or long examples.
- Include `project_id` as an optional top-level string if Libri wants BuildOS
  project provenance. BuildOS can context-fill top-level `project_id` when the
  direct tool schema includes it.
- Use a flexible nested object only where needed, such as
  `analysis.extensions`.
- Use Libri's real API field names in direct tool schemas. For YouTube imports,
  BuildOS should send camelCase fields such as `youtubeVideoId`, `videoTitle`,
  `channelTitle`, `youtubeChannelId`, `transcriptText`, `rawDetailsText`,
  `previewOnly`, and `createImport`.

## YouTube Import Example

Recommended `preview` operation:

```json
{
  "op": "libri.video.import.preview",
  "toolName": "libri_video_import_preview",
  "domain": "youtube_videos",
  "resource": "video.import",
  "kind": "write",
  "method": "POST",
  "path": "/api/v1/ingestion/videos/preview",
  "description": "Validate a YouTube transcript and analysis payload before queueing ingestion.",
  "requiredScopes": ["queue:ingestion"],
  "requiresIdempotencyKey": false,
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "url": {
        "type": "string",
        "description": "YouTube video URL."
      },
      "youtubeVideoId": {
        "type": "string",
        "description": "Optional YouTube video id when already known."
      },
      "videoTitle": {
        "type": "string",
        "description": "Optional video title."
      },
      "channelTitle": {
        "type": "string",
        "description": "Optional channel or creator name."
      },
      "youtubeChannelId": {
        "type": "string",
        "description": "Optional YouTube channel id."
      },
      "transcriptText": {
        "type": "string",
        "description": "Local transcript text to validate."
      },
      "rawDetailsText": {
        "type": "string",
        "description": "Optional raw source notes or analysis details to attach to the import."
      },
      "previewOnly": {
        "type": "boolean",
        "description": "Whether Libri should only preview validation. Defaults to true for preview."
      },
      "analysis": {
        "type": "object",
        "description": "Optional analysis payload.",
        "additionalProperties": false,
        "properties": {
          "summary": {
            "type": "string"
          },
          "topics": {
            "type": "array",
            "items": {
              "type": "string"
            }
          },
          "extensions": {
            "type": "object",
            "description": "Flexible analysis extensions from BuildOS or an agent.",
            "additionalProperties": true
          }
        }
      },
      "project_id": {
        "type": "string",
        "description": "Optional BuildOS project id for provenance."
      }
    },
    "required": ["transcriptText"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "preview": {
        "type": "object",
        "properties": {
          "status": { "type": "string" },
          "ok": { "type": "boolean" },
          "canCreateImport": { "type": "boolean" },
          "issues": {
            "type": "array",
            "items": { "type": "object" }
          }
        }
      }
    }
  },
  "safety": {
    "modelVisible": true,
    "adminOnly": false,
    "allowDirectToolMaterialization": true,
    "allowGenericBridgeExecution": false
  }
}
```

BuildOS will additionally enforce the YouTube import invariant:

```text
transcriptText is required, and either url or youtubeVideoId is required.
```

Recommended `create` operation:

```json
{
  "op": "libri.video.import.create",
  "toolName": "libri_video_import_create",
  "domain": "youtube_videos",
  "resource": "video.import",
  "kind": "write",
  "method": "POST",
  "path": "/api/v1/ingestion/videos",
  "description": "Queue a YouTube transcript and analysis import after preview validation.",
  "requiredScopes": ["queue:ingestion"],
  "requiresIdempotencyKey": true,
  "idempotency": {
    "header": "Idempotency-Key",
    "recommendedKeyFields": ["url", "youtubeVideoId", "transcriptText"]
  },
  "inputSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "url": { "type": "string" },
      "youtubeVideoId": { "type": "string" },
      "videoTitle": { "type": "string" },
      "channelTitle": { "type": "string" },
      "youtubeChannelId": { "type": "string" },
      "transcriptText": { "type": "string" },
      "rawDetailsText": { "type": "string" },
      "createImport": { "type": "boolean" },
      "analysis": { "type": "object", "additionalProperties": true },
      "project_id": { "type": "string" }
    },
    "required": ["transcriptText"]
  },
  "safety": {
    "modelVisible": true,
    "adminOnly": false,
    "allowDirectToolMaterialization": true,
    "allowGenericBridgeExecution": false
  }
}
```

## Recommended Sequences

For multi-step workflows, Libri may include sequence hints. BuildOS can use these
to return both direct tools from one capability search.

```json
{
  "sequence": {
    "id": "youtube_video_import",
    "steps": [
      {
        "op": "libri.video.import.preview",
        "purpose": "Validate payload before queueing."
      },
      {
        "op": "libri.video.import.create",
        "purpose": "Queue import after preview succeeds.",
        "requiresPreviousSuccess": "libri.video.import.preview"
      }
    ]
  }
}
```

## Sensitive Operations

BuildOS will refuse to materialize sensitive operations unless explicitly
designed and scoped later.

Do not mark these as model-visible:

- `POST /api/v1/auth/token-exchange`
- admin analytics
- key creation/deletion
- internal librarian/admin actions
- broad arbitrary query execution

Normal BuildOS runtime keys should not require these scopes:

```text
tokens:exchange
librarian:run
admin
```

## BuildOS Validation Expectations

BuildOS will omit an operation from the model surface if:

- The manifest is invalid JSON or wrong `version`.
- `op`, `toolName`, `domain`, `method`, `path`, `requiredScopes`, or
  `inputSchema` is missing.
- `path` is absolute or does not start with `/api/v1/`.
- `method` is not allowlisted.
- `toolName` collides with another operation.
- Description or schemas exceed BuildOS size limits.
- `safety.modelVisible` is not true.
- `safety.allowDirectToolMaterialization` is not true.
- The operation is admin-only in a normal BuildOS runtime.
- A write requires idempotency but does not provide an idempotency strategy.

## BuildOS Call Pattern

Expected happy path:

```text
1. Model calls libri_search_capabilities(domain: "youtube_videos", query: "upload transcript analysis", kind: "write").
2. BuildOS returns matching ops and materialized_tools:
   - libri_video_import_preview
   - libri_video_import_create
3. Next model pass calls libri_video_import_preview({...}).
4. BuildOS validates args against the manifest schema and calls Libri.
5. BuildOS reads preview status from response.preview.status, response.preview.ok,
   response.preview.canCreateImport, and response.preview.issues.
6. Next model pass calls libri_video_import_create({...}) if preview succeeds.
```

The model should not have to construct:

```text
libri_call({ op, arguments })
```

## Acceptance Criteria

- `GET /api/v1/schema` returns stable domains.
- YouTube transcript upload can be discovered under `youtube_videos`.
- The manifest includes both preview and create/import operations.
- Each operation includes a unique direct `toolName`.
- YouTube import schemas use Libri camelCase fields, not snake_case aliases.
- BuildOS can materialize direct tool definitions from the manifest without
  hardcoding endpoint schemas.
- BuildOS can safely reject token exchange and admin operations.
- New safe Libri operations can be added by updating Libri's manifest, without a
  BuildOS prompt-text change.
