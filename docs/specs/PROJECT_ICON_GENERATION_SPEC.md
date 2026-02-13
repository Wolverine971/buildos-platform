<!-- docs/specs/PROJECT_ICON_GENERATION_SPEC.md -->

# Project Icon Generation Spec

## Status

| Attribute | Value                                            |
| --------- | ------------------------------------------------ |
| Status    | Draft                                            |
| Created   | 2026-02-12                                       |
| Author    | AI-assisted                                      |
| Scope     | Project identity, worker job, LLM SVG generation |

---

## Overview

Generate a unique, minimalistic SVG icon for each project once it has enough context (tasks, goals, documents). The icon acts as a visual badge that represents the project's essence. All icons share a cohesive style so they feel like a set, while remaining distinct enough to identify individual projects at a glance.

### Core Idea

1. An LLM reads the project's context (name, description, goals, tasks, documents)
2. It decides **what single concept** best represents this project
3. It outputs a clean SVG icon following strict style constraints
4. The SVG is stored directly on the project record (no external file storage needed)

---

## Approach: LLM-Generated SVG

**Why this over an image generation API:**

- **Zero new dependencies** - uses the existing SmartLLMService + OpenRouter
- **No new API keys** - works with current LLM providers (GPT-4o, Claude, Gemini)
- **Tiny output** - SVGs are ~500-2000 bytes, stored as text directly in the DB
- **Infinitely scalable** - vector, looks crisp at any size
- **Style-controllable** - the prompt constrains output to a consistent aesthetic
- **Cheap** - single LLM call, ~500 input tokens + ~800 output tokens
- **Editable** - SVG markup can be tweaked later if needed

---

## Database Migration

### New columns on `onto_projects`

```sql
ALTER TABLE onto_projects
  ADD COLUMN icon_svg text,
  ADD COLUMN icon_concept text,
  ADD COLUMN icon_generated_at timestamptz;
```

| Column              | Type          | Description                                                                                                                                |
| ------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `icon_svg`          | `text`        | Raw SVG markup string. Null until generated.                                                                                               |
| `icon_concept`      | `text`        | Short description of what the icon represents (e.g. "a rocket launching"). Useful for regeneration, accessibility alt-text, and debugging. |
| `icon_generated_at` | `timestamptz` | When the icon was last generated. Null if never generated.                                                                                 |

**No RLS changes needed** - these columns inherit the existing `onto_projects` row-level security policies.

---

## New Queue Job Type

### `generate_project_icon`

Add to the `queue_type` enum in Supabase:

```sql
ALTER TYPE queue_type ADD VALUE 'generate_project_icon';
```

### Job Metadata

```typescript
// In packages/shared-types/src/queue-types.ts

export interface ProjectIconGenerationJobMetadata {
	projectId: string;
	userId: string;
	regenerate?: boolean; // Force regeneration even if icon exists
}

export interface ProjectIconGenerationResult {
	success: boolean;
	projectId: string;
	concept?: string; // What the icon represents
	svgByteSize?: number; // Size of generated SVG
	error?: string;
}
```

Add to `JobMetadataMap` and `JobResultMap`.

---

## Worker: Icon Generation Processor

### Location

`apps/worker/src/workers/project-icon/projectIconWorker.ts`

### Flow

```
1. Receive job with projectId
2. Fetch project context from DB:
   - onto_projects: name, description, facet_context, facet_stage, state_key
   - onto_goals: top 5 goals (name, description) linked via onto_edges
   - onto_tasks: top 10 tasks (name) linked via onto_edges
   - onto_documents: top 5 documents (name) linked via onto_edges
3. Build LLM prompt with project context + style constraints
4. Call SmartLLMService.generateText() → get SVG string
5. Validate SVG output (basic checks)
6. Write icon_svg, icon_concept, icon_generated_at to onto_projects
7. Return result
```

### Context Gathering

Reuse the pattern from `projectContextSnapshotWorker.ts` - fetch project data and connected entities via `onto_edges`. Keep it lightweight: names and short descriptions only, no full content.

```typescript
// Pseudocode for context assembly
const context = {
	name: project.name,
	description: project.description,
	stage: project.facet_stage,
	context: project.facet_context,
	goals: goals.map((g) => g.name).join(', '),
	tasks: tasks.map((t) => t.name).join(', '),
	documents: documents.map((d) => d.name).join(', ')
};
```

---

## LLM Prompt Design

The prompt has two parts: (1) analyze the project to pick an icon concept, and (2) generate the SVG.

### System Prompt

```
You are a minimalist icon designer for a productivity app called BuildOS.

Your job: Given a project's context, create a single SVG icon that visually
represents the project's core theme or purpose.

## STYLE RULES (STRICT)

You must follow ALL of these rules. Icons that violate these look broken.

1. VIEWBOX: Always use viewBox="0 0 64 64"
2. SIZE: The icon content should fit within a 48x48 area centered in the 64x64 viewbox (8px padding on each side)
3. STROKE ONLY: Use stroke-based line art. No filled shapes. No solid backgrounds.
4. STROKE WIDTH: Use stroke-width="2" consistently
5. STROKE COLOR: Use currentColor so the icon inherits the parent's text color
6. STROKE CAPS: Use stroke-linecap="round" stroke-linejoin="round"
7. NO TEXT: Never include <text> elements or letters in the icon
8. SIMPLICITY: Maximum 6 path/shape elements. Fewer is better.
9. SINGLE CONCEPT: Represent ONE clear object or symbol, not a scene
10. RECOGNIZABLE AT 24px: The icon must be identifiable when rendered small
11. NO ANIMATIONS: No <animate>, no CSS animations
12. NO EXTERNAL REFS: No <use>, <image>, xlink, or external URLs
13. NO INLINE STYLES: Use attributes only, no style="" or <style> blocks

## OUTPUT FORMAT

Return ONLY two things:

1. CONCEPT line: A 3-8 word description of what the icon depicts
2. SVG block: The complete SVG markup

Format:
CONCEPT: [description]
SVG:
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  ...paths and shapes...
</svg>

Nothing else. No explanation. No alternatives.
```

### User Prompt (per project)

```
Create an icon for this project:

Name: {project.name}
Description: {project.description}
Stage: {project.facet_stage}
Goals: {goals}
Key tasks: {tasks}
Documents: {documents}

Pick a single symbol that captures the essence of this project.
Keep it simple — think Lucide icon style.
```

### Why These Style Constraints

| Rule                  | Reason                                                             |
| --------------------- | ------------------------------------------------------------------ |
| `currentColor` stroke | Icons adapt to light/dark mode and any color context automatically |
| Stroke-only, no fills | Matches Lucide icon aesthetic already used throughout BuildOS      |
| 64x64 viewBox         | Standard icon canvas, scales cleanly to any display size           |
| Max 6 elements        | Prevents the LLM from generating overly complex, noisy icons       |
| No text               | Text in SVGs doesn't scale well and creates accessibility issues   |
| Round caps/joins      | Consistent with Inkprint design system's softer aesthetic          |

---

## SVG Validation

Before saving, apply basic validation:

```typescript
function validateIconSvg(svg: string): { valid: boolean; error?: string } {
	// Must start with <svg and end with </svg>
	if (!svg.trim().startsWith('<svg') || !svg.trim().endsWith('</svg>')) {
		return { valid: false, error: 'Not a valid SVG element' };
	}

	// Must contain viewBox="0 0 64 64"
	if (!svg.includes('viewBox="0 0 64 64"')) {
		return { valid: false, error: 'Missing or incorrect viewBox' };
	}

	// Must use currentColor
	if (!svg.includes('currentColor')) {
		return { valid: false, error: 'Must use currentColor for strokes' };
	}

	// No embedded scripts or event handlers
	const dangerous = /<script|on\w+\s*=/i;
	if (dangerous.test(svg)) {
		return { valid: false, error: 'Contains prohibited elements' };
	}

	// Size check - should be under 4KB
	if (svg.length > 4096) {
		return { valid: false, error: 'SVG too large (>4KB)' };
	}

	return { valid: true };
}
```

If validation fails, retry the LLM call once with a correction hint. If it fails again, mark the job as failed.

---

## API Endpoint

### `POST /api/onto/projects/[id]/generate-icon`

Dispatches the worker job. Called from the UI when a user clicks "Generate Icon".

```typescript
// src/routes/api/onto/projects/[id]/generate-icon/+server.ts

export const POST: RequestHandler = async ({ params, locals }) => {
	const supabase = locals.supabase;
	const user = locals.user;
	const projectId = params.id;

	// Verify project exists and user has access
	const { data: project } = await supabase
		.from('onto_projects')
		.select('id, name, created_by')
		.eq('id', projectId)
		.single();

	if (!project) return ApiResponse.error('Project not found', 404);

	// Enqueue worker job
	const { error } = await supabase.rpc('add_queue_job', {
		p_user_id: user.id,
		p_job_type: 'generate_project_icon',
		p_metadata: { projectId, userId: user.id },
		p_queue_job_id: `icon-${projectId}-${Date.now()}`,
		p_scheduled_for: new Date().toISOString()
	});

	if (error) return ApiResponse.error('Failed to queue icon generation', 500);

	return ApiResponse.success({ queued: true, projectId });
};
```

---

## UI Integration

### Where the icon appears

1. **Project Card** (`ProjectCard.svelte`) - small icon (24x24) next to the project name
2. **Project Detail Header** - larger icon (48x48) in the project page header
3. **Navigation/Sidebar** - small icon (20x20) in project lists
4. **Brain Dump Results** - icon next to project names in processing results

### Icon Display Component

```svelte
<!-- src/lib/components/project/ProjectIcon.svelte -->
<script lang="ts">
	import { Folder } from 'lucide-svelte';

	interface Props {
		iconSvg?: string | null;
		size?: number;
		class?: string;
	}

	let { iconSvg = null, size = 24, class: className = '' }: Props = $props();
</script>

{#if iconSvg}
	<div
		class="inline-flex items-center justify-center text-foreground {className}"
		style="width: {size}px; height: {size}px;"
	>
		{@html iconSvg}
	</div>
{:else}
	<Folder {size} class="text-muted-foreground {className}" />
{/if}
```

- Falls back to a generic `Folder` lucide icon when no custom icon exists
- Uses `currentColor` inheritance so the icon matches surrounding text color
- Works in both light and dark mode automatically

### "Generate Icon" Button

Show a "Generate Icon" action on the project detail page when:

- The project has **no icon** (`icon_svg IS NULL`)
- OR the user explicitly wants to regenerate

```svelte
<button
	onclick={generateIcon}
	class="px-3 py-1.5 text-sm bg-accent/10 text-accent border border-accent/30 rounded-lg pressable"
>
	{#if isGenerating}
		Generating...
	{:else if project.icon_svg}
		Regenerate Icon
	{:else}
		Generate Icon
	{/if}
</button>
```

### Readiness Heuristic

Suggest icon generation when a project reaches a certain "maturity":

```typescript
function isReadyForIcon(project: OntologyProjectSummary): boolean {
	const totalEntities =
		(project.task_count ?? 0) + (project.goal_count ?? 0) + (project.document_count ?? 0);
	return totalEntities >= 3 && !project.icon_svg;
}
```

When this returns true, show a subtle prompt on the project card or detail page: "Your project has enough context to generate an icon."

---

## Automatic Generation (Future Enhancement)

A future iteration could automatically dispatch icon generation when a project crosses the readiness threshold. This would happen in the `build_project_context_snapshot` worker as a follow-up job. **Not in scope for v1** - start with manual trigger only.

---

## Implementation Checklist

### Phase 1: Foundation

- [ ] Supabase migration: add `icon_svg`, `icon_concept`, `icon_generated_at` to `onto_projects`
- [ ] Supabase migration: add `generate_project_icon` to `queue_type` enum
- [ ] Add `ProjectIconGenerationJobMetadata` and result types to `queue-types.ts`
- [ ] Regenerate Supabase types (`pnpm supabase gen types`)

### Phase 2: Worker

- [ ] Create `apps/worker/src/workers/project-icon/projectIconWorker.ts`
- [ ] Implement context gathering (project + goals + tasks + documents via edges)
- [ ] Implement LLM prompt construction with style constraints
- [ ] Implement SVG validation
- [ ] Register processor in worker entry point
- [ ] Add type guard `isProjectIconGenerationMetadata` in queue-types.ts

### Phase 3: API

- [ ] Create `POST /api/onto/projects/[id]/generate-icon/+server.ts`
- [ ] Wire up job dispatch with dedup key

### Phase 4: UI

- [ ] Create `ProjectIcon.svelte` component
- [ ] Integrate into `ProjectCard.svelte` (small icon next to name)
- [ ] Add "Generate Icon" button on project detail page
- [ ] Add readiness heuristic and subtle prompt
- [ ] Handle loading/generating state with optimistic UI

### Phase 5: Polish

- [ ] Test with diverse project types (technical, creative, personal, business)
- [ ] Tune prompt if certain project types produce poor icons
- [ ] Add retry logic in worker (1 retry with correction hint on validation failure)

---

## Cost Estimate

| Item                                  | Cost                                     |
| ------------------------------------- | ---------------------------------------- |
| LLM call (GPT-4o-mini via OpenRouter) | ~$0.001 per icon                         |
| LLM call (GPT-4o via OpenRouter)      | ~$0.01 per icon                          |
| Storage                               | ~1-2KB per icon (text in DB, negligible) |
| Total per user (10 projects)          | $0.01 - $0.10                            |

Extremely cheap. No image storage, no CDN, no file management.

---

## Security Considerations

- SVG output is sanitized (no `<script>`, no event handlers) before storage
- SVG is rendered with `{@html}` in Svelte - validation is critical
- The validation function strips dangerous patterns before DB write
- `currentColor` means no hardcoded colors that could clash with themes
- RLS on `onto_projects` ensures users can only generate icons for their own projects

---

## LLM Model Selection

Recommended: **GPT-4o-mini** via OpenRouter for v1.

- Best balance of SVG generation quality and cost
- GPT-4o and Claude also produce good SVGs but cost 10-20x more
- Can upgrade to GPT-4o for users who want higher-quality icons later
- Gemini Flash is an alternative if cost needs to go even lower

Use the existing `SmartLLMService.generateText()` with a model override for the icon generation task.

---

## Example Output

For a project named "Kitchen Renovation" with goals like "Design new layout", "Get contractor quotes", tasks like "Measure kitchen dimensions", "Research countertop materials":

```
CONCEPT: a house with a wrench
SVG:
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 38 L32 18 L52 38" />
  <path d="M18 38 L18 50 L46 50 L46 38" />
  <path d="M26 50 L26 42 L38 42 L38 50" />
  <path d="M40 28 L44 24 L48 28 L44 32 Z" />
</svg>
```

All icons generated this way will share the same stroke weight, line cap style, viewBox, and `currentColor` inheritance - making them feel cohesive as a set while depicting different subjects.
