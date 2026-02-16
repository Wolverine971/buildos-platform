<!-- docs/specs/PROJECT_ICON_GENERATION_SPEC.md -->

# Project Icon Image Generation Spec

## Status

| Attribute | Value                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| Status    | Phase 1 Complete (Backend + primary project-page UI integrated)                           |
| Created   | 2026-02-12                                                                                |
| Updated   | 2026-02-16                                                                                |
| Author    | AI-assisted + revised                                                                     |
| Scope     | Automatic + manual icon image generation, candidate selection, worker + queue, SVG safety |

---

## Overview

Projects should have a visual identity image once they have enough context.

This spec delivers two complementary flows:

1. **Automatic background generation** when a project crosses readiness.
2. **Manual icon studio** where the user can describe what they want ("Midjourney-style prompt"), generate multiple options, and choose one.

For v1, "image" means **sanitized SVG icon images** (not raster PNG/JPG). This keeps cost, performance, editability, and security manageable while still giving users prompt-driven creative control.

---

## Product Requirements

1. System can generate a project image automatically in the background when the project is "ready".
2. User can open a generation flow, describe desired style/content in plain language, and generate options.
3. User can choose a generated option and set it as the project icon.
4. Generated SVG must be sanitized/validated before save/render.
5. Queueing must use existing `add_queue_job` contract (`p_dedup_key`, not `p_queue_job_id`).
6. Access control must require project write access for generation/selection APIs.

---

## Decision: SVG-First (v1)

### Why SVG in v1

- Reuses existing `SmartLLMService` + OpenRouter stack.
- No new image API keys or media storage/CDN requirements.
- Tiny payloads (usually 0.5-4KB).
- Crisp at all sizes (20px navigation + 48px header).
- User-steerable via text prompt while preserving a cohesive icon language.

### Out of scope for v1

- Photorealistic raster image generation.
- Uploading external images as project icon source.

---

## Data Model

## `onto_projects` additions

```sql
ALTER TABLE onto_projects
  ADD COLUMN IF NOT EXISTS icon_svg text,
  ADD COLUMN IF NOT EXISTS icon_concept text,
  ADD COLUMN IF NOT EXISTS icon_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS icon_generation_source text,
  ADD COLUMN IF NOT EXISTS icon_generation_prompt text;
```

| Column                   | Type          | Description                            |
| ------------------------ | ------------- | -------------------------------------- |
| `icon_svg`               | `text`        | Selected, sanitized SVG rendered in UI |
| `icon_concept`           | `text`        | Human-readable concept label           |
| `icon_generated_at`      | `timestamptz` | Last time selected icon was generated  |
| `icon_generation_source` | `text`        | `auto` or `manual`                     |
| `icon_generation_prompt` | `text`        | Prompt text used for selected icon     |

## New table: `onto_project_icon_generations`

```sql
CREATE TABLE IF NOT EXISTS onto_project_icon_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL,
  trigger_source text NOT NULL CHECK (trigger_source IN ('auto', 'manual', 'regenerate')),
  steering_prompt text,
  candidate_count integer NOT NULL DEFAULT 4 CHECK (candidate_count >= 1 AND candidate_count <= 8),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')),
  selected_candidate_id uuid NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_onto_project_icon_generations_project
  ON onto_project_icon_generations(project_id, created_at DESC);
```

## New table: `onto_project_icon_candidates`

```sql
CREATE TABLE IF NOT EXISTS onto_project_icon_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id uuid NOT NULL REFERENCES onto_project_icon_generations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  candidate_index integer NOT NULL CHECK (candidate_index >= 0),
  concept text NOT NULL,
  svg_raw text NOT NULL,
  svg_sanitized text NOT NULL,
  svg_byte_size integer NOT NULL,
  llm_model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  selected_at timestamptz NULL,
  UNIQUE (generation_id, candidate_index)
);

CREATE INDEX IF NOT EXISTS idx_onto_project_icon_candidates_generation
  ON onto_project_icon_candidates(generation_id, candidate_index);
```

Then add selected-candidate FK:

```sql
ALTER TABLE onto_project_icon_generations
  ADD CONSTRAINT fk_icon_generation_selected_candidate
  FOREIGN KEY (selected_candidate_id)
  REFERENCES onto_project_icon_candidates(id)
  ON DELETE SET NULL;
```

## RLS

- Enable RLS on new tables.
- Mirror project access pattern:
- Read allowed when actor has `read` access to project.
- Insert/update/select-candidate allowed when actor has `write` access to project.

---

## Queue Job Type

## Enum

```sql
ALTER TYPE queue_type ADD VALUE IF NOT EXISTS 'generate_project_icon';
```

## Metadata and Result types

```typescript
// packages/shared-types/src/queue-types.ts

export interface ProjectIconGenerationJobMetadata {
	generationId: string;
	projectId: string;
	requestedByUserId: string;
	triggerSource: 'auto' | 'manual' | 'regenerate';
	steeringPrompt?: string;
	candidateCount: number; // auto: 1, manual default: 4
	autoSelect: boolean; // true for auto flow
}

export interface ProjectIconGenerationResult {
	success: boolean;
	projectId: string;
	generationId: string;
	candidatesCreated?: number;
	selectedCandidateId?: string;
	skipped?: boolean;
	reason?: string;
	error?: string;
}
```

Add the new type to:

- `JobMetadataMap`
- `JobResultMap`
- `isValidJobMetadata` switch
- `validateJobMetadata` switch in `packages/shared-types/src/validation.ts`

---

## Readiness + Auto Trigger Rules

Generation must be gated server-side (not UI-only).

```typescript
function isReadyForAutoIcon(project: {
	task_count?: number | null;
	goal_count?: number | null;
	document_count?: number | null;
	description?: string | null;
	icon_svg?: string | null;
}): boolean {
	const totalEntities =
		(project.task_count ?? 0) + (project.goal_count ?? 0) + (project.document_count ?? 0);

	return totalEntities >= 3 && Boolean(project.description?.trim()) && !project.icon_svg;
}
```

Auto queue trigger:

- Run after successful context snapshot refresh (`build_project_context_snapshot`) or equivalent project activity checkpoint.
- Apply cooldown (for example 24h) to avoid repeated churn.
- Queue with dedup key: `project-icon:auto:${projectId}`.

---

## Worker: Project Icon Generator

## Location

`apps/worker/src/workers/project-icon/projectIconWorker.ts`

## Registration

Register in `apps/worker/src/worker.ts`:

```typescript
queue.process('generate_project_icon' as any, processProjectIconJob);
```

## Worker flow

1. Load generation row (`onto_project_icon_generations`) and mark `processing`.
2. Load project context via `load_project_graph_context` RPC (not ad-hoc edge traversal).
3. Build prompt using project context + optional `steeringPrompt`.
4. Generate `candidateCount` candidates (JSON response with concept + svg).
5. Sanitize + validate each SVG.
6. Persist candidates in `onto_project_icon_candidates`.
7. If `autoSelect` is true, select best candidate and update `onto_projects.icon_*`.
8. Mark generation `completed` or `failed`.

## Context payload (lightweight)

Use project + compact highlights:

- project: `name`, `description`, `facet_context`, `facet_stage`, `state_key`
- top goals (name/description)
- top tasks (title)
- top documents (title/description)

Use existing schema names (`title` for tasks/documents where applicable).

---

## LLM Prompting Strategy

Manual flow must include user steering input.

## System prompt (intent)

- You are a minimalist icon designer.
- Return JSON only.
- Keep Lucide-like style: stroke-only, `currentColor`, no text, no external refs, no animation.
- Generate `N` distinct candidates that still feel like a coherent set.

## User prompt template

```text
Generate {candidateCount} SVG icon candidates for this project.

Project:
- Name: {name}
- Description: {description}
- Stage: {facet_stage}
- Goals: {topGoals}
- Tasks: {topTasks}
- Documents: {topDocuments}

User style direction:
{steeringPrompt || "(none provided)"}

Return JSON:
{
  "candidates": [
    { "concept": "...", "svg": "<svg ...>...</svg>" }
  ]
}
```

## SmartLLM usage

- Prefer `getJSONResponse(...)` for structured output and retries.
- Include `userId` (required by worker SmartLLM wrapper).
- Use `operationType: 'project_icon_generation'`.
- Start with `profile: 'balanced'`.

---

## SVG Sanitization + Validation (Critical)

Do not render/store unsanitized SVG.

Use `sanitize-html` allowlist in worker before persistence.

```typescript
import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
	'svg',
	'g',
	'path',
	'circle',
	'rect',
	'line',
	'polyline',
	'polygon',
	'ellipse'
];
const ALLOWED_ATTRS = {
	svg: [
		'xmlns',
		'viewBox',
		'fill',
		'stroke',
		'stroke-width',
		'stroke-linecap',
		'stroke-linejoin'
	],
	g: ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform'],
	path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform'],
	circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
	rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
	line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap'],
	polyline: ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
	polygon: ['points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
	ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width']
};

function sanitizeIconSvg(raw: string): string {
	return sanitizeHtml(raw, {
		allowedTags: ALLOWED_TAGS,
		allowedAttributes: ALLOWED_ATTRS,
		allowedSchemes: [],
		allowedSchemesByTag: {},
		parser: { lowerCaseAttributeNames: false }
	}).trim();
}
```

Then validate sanitized output:

- starts with `<svg`, ends with `</svg>`
- includes `viewBox="0 0 64 64"`
- includes `stroke="currentColor"`
- no `style`, no `class`, no `on*` handlers, no `<foreignObject>`, no `<script>`
- size <= 4096 bytes
- element count <= 8

If candidate fails validation, drop it. If all fail, retry once with correction hint, then fail job.

Render only `svg_sanitized` / `onto_projects.icon_svg`.

---

## API Design

## 1) Create generation (manual)

`POST /api/onto/projects/[id]/icon/generations`

Request:

```json
{
	"steeringPrompt": "minimal mountain + trail vibe, no tools",
	"candidateCount": 4
}
```

Behavior:

1. Require auth.
2. Verify project write access.
3. Create `onto_project_icon_generations` row (`status='queued'`, `trigger_source='manual'`).
4. Queue `generate_project_icon` with:

```typescript
await supabase.rpc('add_queue_job', {
	p_user_id: user.id,
	p_job_type: 'generate_project_icon',
	p_metadata: {
		generationId,
		projectId,
		requestedByUserId: user.id,
		triggerSource: 'manual',
		steeringPrompt,
		candidateCount,
		autoSelect: false
	},
	p_priority: 8,
	p_scheduled_for: new Date().toISOString(),
	p_dedup_key: `project-icon:generation:${generationId}`
});
```

5. Return `{ generationId, status: 'queued' }`.

## 2) Fetch generation + candidates

`GET /api/onto/projects/[id]/icon/generations/[generationId]`

Returns status and candidates for picker UI.

## 3) Select candidate

`POST /api/onto/projects/[id]/icon/generations/[generationId]/select`

Request:

```json
{
	"candidateId": "uuid"
}
```

Behavior:

- Verify write access.
- Verify candidate belongs to generation + project.
- Mark selected candidate.
- Update `onto_projects.icon_svg`, `icon_concept`, `icon_generated_at`, `icon_generation_source='manual'`, `icon_generation_prompt`.

## 4) Auto queue helper (server-side)

Create `queueProjectIconGeneration(...)` service similar to `queueProjectContextSnapshot(...)`.

---

## UI / UX

## Components

1. `ProjectIcon.svelte`
2. `ProjectIconStudioModal.svelte`
3. Candidate card component (preview + concept + select action)

## Project detail actions

- If no icon: show `Generate Image`.
- If icon exists: show `Edit Image`.
- CTA opens icon studio modal.

## Icon studio flow

1. Textarea: "Describe what you want this image to look like..."
2. `Generate Options` button.
3. Show 2-4 generated candidates.
4. User selects one and applies it.
5. `Generate More` allows iterative steering.

## Project list/card integration

Add icon fields to project summary pipeline:

- `OntologyProjectSummary` type
- `fetchProjectSummaries` select/map
- navigation store snapshot
- card + header components

Fallback to existing folder icon when `icon_svg` is null.

---

## Background Generation

Automatic generation runs without user interaction:

1. Project reaches readiness threshold.
2. System queues auto generation job (`candidateCount: 1`, `autoSelect: true`).
3. Worker writes selected icon directly to `onto_projects`.
4. UI updates naturally on next refresh/stream update.

Manual flow always remains available for user-driven replacement.

---

## Observability

Track:

- generation created/completed/failed counts
- auto vs manual split
- sanitization rejection count
- average generation latency
- candidate selection rate
- selected concept distribution

Log model + token usage from SmartLLM metadata on each generation.

---

## Test Plan

1. Queue metadata validation tests (`queue-types.ts` + `validation.ts`)
2. Worker unit tests:

- prompt construction
- sanitization allowlist
- validation failures + retry behavior
- auto-select behavior

3. API integration tests:

- access control
- enqueue contract with `p_dedup_key`
- candidate selection updates project fields

4. UI tests:

- icon studio prompt + generate + select
- fallback icon behavior

---

## Implementation Checklist

## Phase 1: Schema + Types

- [x] Migration: add `onto_projects.icon_*` columns
- [x] Migration: create `onto_project_icon_generations`
- [x] Migration: create `onto_project_icon_candidates`
- [x] Migration: add `generate_project_icon` to `queue_type`
- [x] Add/enable RLS policies for new tables
- [x] Add metadata/result types in `packages/shared-types/src/queue-types.ts`
- [x] Add validation switch cases in `packages/shared-types/src/validation.ts`
- [x] Regenerate DB/types with `pnpm gen:types`

## Phase 2: Worker

- [x] Create `apps/worker/src/workers/project-icon/projectIconWorker.ts`
- [x] Reuse `load_project_graph_context` for context fetch
- [x] Implement structured LLM generation (`getJSONResponse`)
- [x] Implement sanitization + strict validation
- [x] Persist generation/candidates + selected icon updates
- [x] Register processor in `apps/worker/src/worker.ts`

## Phase 3: API

- [x] `POST /api/onto/projects/[id]/icon/generations`
- [x] `GET /api/onto/projects/[id]/icon/generations/[generationId]`
- [x] `POST /api/onto/projects/[id]/icon/generations/[generationId]/select`
- [x] Add server helper `queueProjectIconGeneration(...)`

## Phase 4: UI

- [x] Build `ProjectIcon.svelte`
- [x] Build `ProjectIconStudioModal.svelte`
- [x] Integrate into project detail page (`Generate Image` / `Edit Image`)
- [x] Integrate icon into `ProjectCard.svelte` and other list/header surfaces
- [x] Poll/refresh generation status in modal

## Phase 5: Auto Generation

- [x] Add readiness gate helper server-side
- [x] Trigger auto queue from background pipeline after context snapshot success
- [x] Add cooldown + dedup policy for auto flow

---

## Cost Estimate

Estimated with SVG generation via OpenRouter text models:

- Auto generation (1 candidate): very low (roughly sub-cent)
- Manual generation (4 candidates): roughly 4x auto
- Storage: negligible (text)

Cost depends on model selected by SmartLLM profile routing; treat these as ranges, not fixed per-model guarantees.

---

## Security Summary

1. Never render unsanitized SVG.
2. Store sanitized SVG separately and render only sanitized field.
3. Use strict allowlist tags/attributes.
4. Require project write access for generation and selection.
5. Use queue dedup keys to prevent spam/duplication.

---

## Rollout

1. Launch with manual flow behind feature flag.
2. Enable auto generation for a small cohort.
3. Monitor sanitization rejection and candidate selection metrics.
4. Expand auto rollout after quality is stable.
