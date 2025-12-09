---
type: research
topic: Project Deduplication and Fetching Logic
date: 2025-10-06
time: 02:00:00
status: complete
tags: [brain-dump, projects, deduplication, data-fetching]
path: thoughts/shared/research/2025-10-06_02-00-00_project-deduplication-research.md
---

# Project Deduplication and Fetching Research

## Research Objective

Understand how the app currently handles project deduplication and fetching user's existing projects, specifically:

1. How brain dump flow checks for existing projects
2. ProjectService methods for fetching projects
3. Any existing deduplication logic
4. How project names are matched/compared

## Key Findings

### 1. Project Fetching in Brain Dump Flow

#### Brain Dump Initialization (`/api/braindumps/init/+server.ts`)

**Location**: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/braindumps/init/+server.ts`

**What it fetches:**

```typescript
// Line 22-27: Projects query
supabase
	.from('projects')
	.select('id, name, slug, description, created_at, updated_at')
	.eq('user_id', user.id)
	.order('updated_at', { ascending: false })
	.limit(20);
```

**Returns:**

- **20 most recently updated projects** (not all projects)
- Only basic fields: `id, name, slug, description, created_at, updated_at`
- Enriched with `taskCount`, `noteCount`, `draftCount`

**Usage**: This data is used in `BrainDumpModal.svelte` to populate the project selection dropdown.

#### Projects List API (`/api/projects/list/+server.ts`)

**Location**: `/Users/annawayne/buildos-platform/apps/web/src/routes/api/projects/list/+server.ts`

**Two implementations:**

1. **RPC function** (default): `get_projects_with_stats` - optimized database function
2. **Fallback**: Direct query with pagination

**Features:**

- Pagination support (default: 50 projects per page)
- Status filtering (`active`, `paused`, `completed`, `all`)
- Search filtering (name/description)
- Includes task statistics

**Not used in brain dump flow** - this is for the projects list page.

---

### 2. Deduplication Infrastructure (Exists but Unused!)

#### ProjectDataFetcher Service

**Location**: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/prompts/core/project-data-fetcher.ts`

**Key Method: `getAllUserProjectsSummary()`** (Lines 253-287)

```typescript
async getAllUserProjectsSummary(
  userId: string,
  options?: {
    limit?: number;
    includeStatus?: string[];
  }
): Promise<ProjectSummary[]> {
  const { limit = 50, includeStatus = ['active'] } = options || {};

  const { data } = await this.supabase
    .from('projects')
    .select('id, name, slug, description, executive_summary, tags, status, updated_at')
    .eq('user_id', userId)
    .in('status', includeStatus)
    .order('updated_at', { ascending: false })
    .limit(limit);

  return (data || []) as ProjectSummary[];
}
```

**Purpose**: "Used for similarity detection when creating new projects" (comment on line 255)

**Returns lightweight project summaries:**

```typescript
interface ProjectSummary {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	executive_summary: string | null;
	tags: string[];
	status: string;
	updated_at: string;
}
```

**Default behavior:**

- Fetches up to 50 active projects
- Includes executive summaries and tags for better matching
- Ordered by `updated_at` (most recent first)

#### DataFormatter Service

**Location**: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/prompts/core/data-formatter.ts`

**Key Method: `formatProjectsSummaryList()`** (Lines 269-320)

```typescript
export function formatProjectsSummaryList(
	projects: Array<{
		id: string;
		name: string;
		slug: string;
		description: string | null;
		executive_summary: string | null;
		tags: string[];
		status: string;
	}>
): string;
```

**Purpose**: "Format project summaries list for similarity detection. Used when checking for duplicate/similar projects during new project creation"

**Output format:**

```markdown
### Project 1: Project Name

**Description**: Truncated description (200 chars)
**Summary**: Truncated executive summary (300 chars)
**Tags**: tag1, tag2, tag3
**Project ID**: `project-uuid`

### Project 2: Another Project

...
```

**Features:**

- Truncates descriptions (200 chars) and summaries (300 chars) to save tokens
- Includes project ID for reference in LLM recommendations
- Returns "No existing projects." if empty

---

### 3. Current State: Deduplication Logic Status

**CRITICAL FINDING**: The deduplication infrastructure exists but is **NOT currently used** in the brain dump flow!

#### Evidence:

1. **No usage in brain dump processor** (`braindump-processor.ts`)
    - No calls to `getAllUserProjectsSummary()`
    - No calls to `formatProjectsSummaryList()`

2. **No usage in prompt templates** (`promptTemplate.service.ts`)
    - Searched entire file: no references to these functions
    - No existing project list passed to LLM for new project creation

3. **Brain dump init API returns limited data**
    - Only 20 most recent projects
    - Only basic fields (no executive_summary, no tags)
    - No deduplication checking

#### Why This Matters:

**Current behavior:**

- User creates brain dump for new project
- LLM has NO knowledge of user's existing projects
- LLM cannot suggest "this is similar to Project X"
- No deduplication/similarity warnings

**Infrastructure exists to:**

- Fetch user's existing projects (up to 50 active)
- Format them for LLM context
- Allow LLM to detect duplicates or suggest adding to existing projects

---

### 4. Project Name Matching/Comparison

**FINDING**: No project name matching or comparison logic exists in the codebase.

**Search results:**

- No normalization functions for project names
- No fuzzy matching or similarity scoring
- No case-insensitive comparison utilities

**Implication**: Any deduplication would need to be:

1. **LLM-based** (pass existing projects to LLM, let it decide)
2. **Custom logic** (create new utility functions)

---

### 5. How Brain Dump Currently Handles Projects

#### For New Projects

**File**: `braindump-processor.ts` → `extractProjectContext()` (Lines 967-1080)

**Process:**

1. No existing project data passed
2. LLM creates project from scratch
3. No awareness of user's other projects
4. No deduplication checks

**Prompt structure:**

```typescript
const userPrompt = `Process this brain dump for project context:

${brainDump}`;
```

No existing projects context included!

#### For Existing Projects

**File**: `braindump-processor.ts` → `processBrainDump()` (Lines 319-561)

**Process:**

1. If `selectedProjectId` provided → fetch full project data
2. Pass existing project context to LLM
3. LLM updates/extends existing project
4. Works well for known project updates

**Data fetching:**

```typescript
// Line 341-346
if (selectedProjectId) {
	const fullProjectData = await this.projectDataFetcher.getFullProjectData({
		userId,
		projectId: selectedProjectId,
		options: { includeTasks: true, includePhases: true }
	});
	existingProject = fullProjectData.fullProjectWithRelations;
}
```

---

### 6. ProjectService Methods

**Location**: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/projectService.ts`

#### Key Methods for Fetching Projects:

**`getUserProjects()`** (Lines 77-111)

- Returns paginated list of projects
- Default: 20 projects per page
- Supports status filtering
- **Cached** (5 min TTL)
- Updates project store

**`getProject()`** (Lines 53-72)

- Get single project by ID
- **Cached** (5 min TTL)
- Updates project store

**`searchProjects()`** (Lines 171-188)

- Search by query string
- Returns up to 10 results
- Supports status filtering
- **Not cached**

**`getProjectWithDetails()`** (Lines 487-509)

- Get project with tasks, notes, phases
- **Cached** (2 min TTL)
- Used for full project views

#### Caching Strategy:

```typescript
private cache: CacheManager;
// 50 items, 5 min TTL
this.cache = new CacheManager(50, 5 * 60 * 1000);
```

---

### 7. Example Flow Comparison

#### Current Flow (New Project Brain Dump):

```
1. User writes brain dump
2. Selects "New Project"
3. Brain dump processed
4. LLM creates new project
   - No knowledge of user's 47 other projects
   - Creates "E-commerce Platform" even though user has "Online Store Builder"
   - No suggestion to combine or differentiate
```

#### Potential Enhanced Flow (With Deduplication):

```
1. User writes brain dump
2. Selects "New Project"
3. System fetches user's existing projects (getAllUserProjectsSummary)
4. Formats them (formatProjectsSummaryList)
5. Includes in LLM prompt
6. LLM analyzes brain dump + existing projects
7. LLM can:
   - Suggest: "This is similar to 'Online Store Builder' (ID: xxx)"
   - Recommend: "Add to existing project vs create new"
   - Differentiate: "Creating new because X differs from existing Y"
8. Returns operations with recommendation metadata
```

---

## Summary Table

| Component                          | Location                      | Purpose                                   | Current Status                                  |
| ---------------------------------- | ----------------------------- | ----------------------------------------- | ----------------------------------------------- |
| **getAllUserProjectsSummary**      | `project-data-fetcher.ts:258` | Fetch all user projects for deduplication | ✅ Exists, ❌ Not used                          |
| **formatProjectsSummaryList**      | `data-formatter.ts:273`       | Format projects for LLM context           | ✅ Exists, ❌ Not used                          |
| **Brain dump init API**            | `/api/braindumps/init`        | Get projects for modal                    | ✅ Used, ⚠️ Limited (20 projects, basic fields) |
| **ProjectService.getUserProjects** | `projectService.ts:77`        | Get paginated projects                    | ✅ Used in UI, ❌ Not in brain dumps            |
| **Project name matching**          | N/A                           | Compare/normalize names                   | ❌ Doesn't exist                                |
| **Deduplication in prompts**       | N/A                           | Pass existing projects to LLM             | ❌ Not implemented                              |

---

## Key Gaps Identified

### 1. No Deduplication in New Project Flow

- Infrastructure exists but unused
- LLM has no context about existing projects
- Users can create duplicate/similar projects unknowingly

### 2. Limited Project Data in Brain Dump Modal

- Only fetches 20 most recent projects
- Missing executive summaries, tags
- Not optimized for similarity detection

### 3. No Project Name Normalization

- No utilities for case-insensitive matching
- No slug comparison logic
- Would need custom implementation or LLM-based approach

### 4. No Recommendation System

- LLM doesn't suggest adding to existing projects
- No "similar projects" warnings
- No differentiation suggestions

---

## Recommendations for Implementation

### Option A: Full LLM-Based Deduplication

**Pros:**

- Uses existing infrastructure (getAllUserProjectsSummary, formatProjectsSummaryList)
- LLM handles fuzzy matching naturally
- Can provide contextual recommendations

**Cons:**

- Increases token usage
- Adds LLM processing time
- Cost consideration for users with many projects

**Implementation:**

1. Call `getAllUserProjectsSummary()` when new project selected
2. Format with `formatProjectsSummaryList()`
3. Include in context prompt
4. Add to new project creation prompt template
5. Update operation schema to include recommendation metadata

### Option B: Hybrid Approach

**Pros:**

- Lighter weight
- Faster for obvious duplicates
- LLM only for edge cases

**Cons:**

- More complex implementation
- Need custom matching logic

**Implementation:**

1. Client-side pre-check (exact name match, case-insensitive)
2. If potential match → show warning modal
3. User can proceed or select existing project
4. If no match → proceed with LLM (optionally include projects for smart recommendations)

### Option C: Post-Creation Suggestion

**Pros:**

- No impact on creation flow performance
- Non-blocking UX

**Cons:**

- Duplicate already created
- User needs to manually merge/delete

**Implementation:**

1. After project creation
2. Run similarity check in background
3. Show toast notification: "This seems similar to Project X. Would you like to merge?"
4. Provide merge/ignore options

---

## Files Referenced

### Services

- `/Users/annawayne/buildos-platform/apps/web/src/lib/services/projectService.ts`
- `/Users/annawayne/buildos-platform/apps/web/src/lib/services/prompts/core/project-data-fetcher.ts`
- `/Users/annawayne/buildos-platform/apps/web/src/lib/services/prompts/core/data-formatter.ts`

### API Routes

- `/Users/annawayne/buildos-platform/apps/web/src/routes/api/braindumps/init/+server.ts`
- `/Users/annawayne/buildos-platform/apps/web/src/routes/api/projects/list/+server.ts`

### Components

- `/Users/annawayne/buildos-platform/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte`

### Core Logic

- `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/braindump-processor.ts`

---

## Next Steps

1. **Decision needed**: Which deduplication approach to implement (A, B, or C)?
2. **Scope question**: Deduplication for all users or trial/premium feature?
3. **UX design**: How to present duplicate warnings/suggestions?
4. **Token budget**: How many projects to include in LLM context (current infrastructure allows 50)?
5. **Prompt engineering**: Update new project prompt template to handle existing projects list

---

## Code Examples

### How to Fetch Existing Projects (Not Currently Used)

```typescript
// In braindump-processor.ts or similar
const projectDataFetcher = new ProjectDataFetcher(this.supabase);

// Get user's existing projects
const existingProjects = await projectDataFetcher.getAllUserProjectsSummary(userId, {
	limit: 30, // Limit to avoid token bloat
	includeStatus: ['active', 'planning'] // Skip completed/archived
});

// Format for LLM
const projectsContext = formatProjectsSummaryList(existingProjects);

// Include in prompt
const systemPrompt = `
${basePrompt}

## User's Existing Projects

${projectsContext}

When creating a new project, analyze if this brain dump is similar to any existing projects.
If similar, recommend adding to the existing project or explain how this differs.
`;
```

### How Projects Are Currently Fetched for Modal

```typescript
// In BrainDumpModal.svelte → loadInitialData()
const { data } = await brainDumpService.getInitData(projectId);
// Returns:
// - projects: Array (max 20, basic fields)
// - recentBrainDumps: Array (last 5)
// - newProjectDraftCount: number
// - currentDraft: object | null
```

---

## Conclusion

**The deduplication infrastructure exists but is completely unused.** The app has:

- ✅ A method to fetch user's projects (`getAllUserProjectsSummary`)
- ✅ A formatter for LLM context (`formatProjectsSummaryList`)
- ❌ No integration with brain dump flow
- ❌ No project name matching utilities
- ❌ No duplicate detection or warnings

Implementing deduplication would require:

1. Connecting existing infrastructure to new project creation flow
2. Updating prompt templates to include existing projects
3. Possibly adding client-side pre-checks for performance
4. Designing UX for duplicate warnings/recommendations
