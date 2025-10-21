---
date: 2025-10-20T16:30:00-04:00
researcher: Claude Code
git_commit: 9f26638250d9f51922b55e692f94dc410f371c1f
branch: main
repository: buildos-platform
topic: "Elegant Timeblock Integration into Daily Brief Analysis"
tags:
  [
    research,
    timeblocks,
    daily-briefs,
    architecture,
    worker-service,
    capacity-analysis,
  ]
status: complete
last_updated: 2025-10-20
last_updated_by: Claude Code
---

# Research: Elegant Timeblock Integration into Daily Brief Analysis

**Date**: 2025-10-20T16:30:00-04:00
**Researcher**: Claude Code
**Git Commit**: 9f26638250d9f51922b55e692f94dc410f371c1f
**Branch**: main
**Repository**: buildos-platform

## Research Question

How should timeblocks (user's blocked-out time on their calendar for work) be elegantly integrated into the daily brief generation and LLM analysis in the worker service? The integration needs to:

1. **Surface timeblock allocations** to the user (hours scheduled per project + unscheduled blocks)
2. **Leverage ai_suggestions column** for contextual work recommendations within timeblocks
3. **Inform capacity analysis** (scheduled time vs. available tasks for the day)
4. **Provide LLM context** for intelligent task prioritization based on available time
5. **Display actionable insights** about time allocation efficiency

## Summary

The timeblock system represents **committed/scheduled work time** with AI-powered task suggestions. Daily briefs currently show **what needs to be done** (task lists, phases, context). The elegant integration bridges these two views by adding **time allocation context** — showing users not just what they need to do, but **how much time they have to do it**.

The integration follows a **layered, holistic architecture**:

1. **Data Layer**: Fetch timeblocks for the brief date, group by project + unassigned
2. **Capacity Layer**: Calculate allocated time vs. task count per project to identify capacity mismatches
3. **Suggestion Layer**: Extract and normalize ai_suggestions from timeblocks as secondary recommendations
4. **LLM Context Layer**: Include timeblock data in analysis prompt for intelligent prioritization
5. **Presentation Layer**: Display "Time Allocation" section showing capacity insights and unscheduled blocks
6. **Action Layer**: LLM generates task prioritization based on available time

## Detailed Findings

### 1. CORE ARCHITECTURAL INSIGHT: Two Complementary Views

**Current State (Task-Centric):**

```
Daily Brief shows what → Tasks Today (5), Overdue (2), Upcoming (12)
Organized by priority/project but no TIME dimension
```

**Enhanced State (Time + Task-Centric):**

```
Daily Brief shows what + when → Tasks Today (5) with 3 hours allocated
Capacity analysis: "5 tasks, 3 hours = potential gap"
Timeblock ai_suggestions provide secondary recommendations within time constraints
```

### 2. TIMEBLOCK DATA STRUCTURE FOR INTEGRATION

**Key Data from Time Blocks Table:**

```typescript
interface TimeBlock {
  // Relationship & Type
  id: string;
  project_id: string | null; // NULL = "build" block (unscheduled work)
  block_type: "project" | "build"; // Explicit type

  // Time Allocation
  start_time: string; // ISO timestamp (timezone-aware)
  end_time: string;
  duration_minutes: number;

  // AI Context (PRIMARY VALUE FOR INTEGRATION)
  ai_suggestions: TimeBlockSuggestion[] | null; // Array of task recommendations
  suggestions_summary: string | null; // LLM-generated summary

  // Metadata
  timezone: string;
  created_at: string;
  updated_at: string;
}

interface TimeBlockSuggestion {
  title: string; // What to work on
  reason: string; // Why it fits this timeblock
  project_id?: string | null;
  project_name?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  estimated_minutes?: number | null;
  task_id?: string | null; // Link to actual task
  confidence?: number | null; // 0-1 confidence score
}
```

**Critical Integration Points:**

- `ai_suggestions`: Contains pre-computed LLM recommendations specific to each timeblock
- `block_type` + `project_id`: Identifies unscheduled "build" blocks requiring project-agnostic suggestions
- `duration_minutes`: Enables capacity analysis (time allocated vs. task requirements)

### 3. INTEGRATION ARCHITECTURE: Five Layers

#### Layer 1: Data Collection (Extends briefGenerator.ts)

**New Function: `getUserTimeBlocksForDate()`**

```typescript
// Add to /apps/worker/src/workers/brief/briefGenerator.ts

async function getUserTimeBlocksForDate(
  supabase: SupabaseClient,
  userId: string,
  briefDate: string,
  timezone: string,
): Promise<{
  projectTimeBlocks: Map<string, TimeBlock[]>;
  unscheduledBlocks: TimeBlock[];
  totalMinutesAllocated: number;
}> {
  // Get start/end of day in user's timezone
  const { start: dayStart, end: dayEnd } = getDayBoundsInTimezone(
    briefDate,
    timezone,
  );

  // Fetch timeblocks for the day
  const { data: timeBlocks, error } = await supabase
    .from("time_blocks")
    .select("*")
    .eq("user_id", userId)
    .eq("sync_status", "synced") // Only synced blocks (completed sync with calendar)
    .gte("start_time", dayStart.toISOString())
    .lte("end_time", dayEnd.toISOString());

  if (error) throw error;
  if (!timeBlocks || timeBlocks.length === 0) {
    return {
      projectTimeBlocks: new Map(),
      unscheduledBlocks: [],
      totalMinutesAllocated: 0,
    };
  }

  // Organize by project vs. unscheduled
  const projectTimeBlocks = new Map<string, TimeBlock[]>();
  const unscheduledBlocks: TimeBlock[] = [];

  for (const block of timeBlocks) {
    if (block.block_type === "build" || !block.project_id) {
      unscheduledBlocks.push(block);
    } else {
      if (!projectTimeBlocks.has(block.project_id)) {
        projectTimeBlocks.set(block.project_id, []);
      }
      projectTimeBlocks.get(block.project_id)!.push(block);
    }
  }

  // Calculate total allocated time
  const totalMinutesAllocated = timeBlocks.reduce(
    (sum, block) => sum + (block.duration_minutes || 0),
    0,
  );

  return {
    projectTimeBlocks,
    unscheduledBlocks,
    totalMinutesAllocated,
  };
}
```

**Integration Point**: Call this in `generateDailyBrief()` after fetching projects but before analysis:

```typescript
async function generateDailyBrief(...) {
  // ... existing code ...

  // NEW: Fetch timeblocks for the date
  const timeBlockData = await getUserTimeBlocksForDate(
    supabase,
    userId,
    briefDateInUserTz,
    userTimezone,
  );

  // ... continue with existing logic ...
}
```

---

#### Layer 2: Capacity Analysis (Extends project brief metadata)

**New Data Structure: `ProjectCapacityAnalysis`**

```typescript
interface ProjectCapacityAnalysis {
  projectId: string;
  totalTimeBlocksMinutes: number; // Total time allocated to this project
  blockCount: number; // How many timeblocks
  tasksForToday: Task[];
  totalTaskEstimatedMinutes: number | null; // Sum of task estimates if available

  // Capacity Metrics
  capacityStatus: "aligned" | "underallocated" | "overallocated";
  capacityRatio: number; // allocated_time / (task_count * avg_effort_estimate)

  // Timeblock Insights
  timeBlocksWithSuggestions: TimeBlock[]; // Blocks with ai_suggestions populated
  averageBlockDuration: number;

  // Risk Indicators
  hasUnfinishedBlocks: boolean; // Previous blocks with incomplete work
  unfinishedBlocksMinutes: number;
}

// Helper function to build capacity analysis
function buildProjectCapacityAnalysis(
  projectId: string,
  tasksForToday: Task[],
  timeBlocksForProject: TimeBlock[],
): ProjectCapacityAnalysis {
  const totalMinutes = timeBlocksForProject.reduce(
    (sum, block) => sum + (block.duration_minutes || 0),
    0,
  );

  const blockCount = timeBlocksForProject.length;
  const avgBlockDuration = blockCount > 0 ? totalMinutes / blockCount : 0;

  // Simple capacity heuristic: 1 task ≈ 60 minutes average effort
  const taskEffortMinutes = tasksForToday.length * 60;
  const capacityRatio =
    taskEffortMinutes > 0 ? totalMinutes / taskEffortMinutes : 1;

  // Determine status
  let capacityStatus: "aligned" | "underallocated" | "overallocated" =
    "aligned";
  if (capacityRatio < 0.7) capacityStatus = "underallocated"; // Only 70% of time needed
  if (capacityRatio > 1.3) capacityStatus = "overallocated"; // 130%+ time available

  const timeBlocksWithSuggestions = timeBlocksForProject.filter(
    (block) => block.ai_suggestions && block.ai_suggestions.length > 0,
  );

  return {
    projectId,
    totalTimeBlocksMinutes: totalMinutes,
    blockCount,
    tasksForToday,
    totalTaskEstimatedMinutes: null, // Could be enhanced with task estimates
    capacityStatus,
    capacityRatio,
    timeBlocksWithSuggestions,
    averageBlockDuration: avgBlockDuration,
    hasUnfinishedBlocks: false, // Could be enhanced
    unfinishedBlocksMinutes: 0,
  };
}
```

**Integration Point**: Extend `generateProjectBrief()` metadata:

```typescript
// In generateProjectBrief(), after building task categorization:

const capacityAnalysis = buildProjectCapacityAnalysis(
  project.id,
  todaysTasks,
  projectTimeBlocks.get(project.id) || [],
);

// Add to project brief metadata
projectBriefMetadata.capacityAnalysis = {
  status: capacityAnalysis.capacityStatus,
  allocatedMinutes: capacityAnalysis.totalTimeBlocksMinutes,
  blockCount: capacityAnalysis.blockCount,
  ratio: capacityAnalysis.capacityRatio,
  blocksWithSuggestions: capacityAnalysis.timeBlocksWithSuggestions.length,
};
```

---

#### Layer 3: Suggestion Normalization (Extract ai_suggestions from timeblocks)

**New Function: `normalizeTimeBlockSuggestions()`**

```typescript
interface NormalizedTimeBlockSuggestion extends TimeBlockSuggestion {
  sourceTimeBlockId: string;
  sourceTimeBlockDuration: number;
  confidence: number; // Default 0.8 if not provided
}

function normalizeTimeBlockSuggestions(
  timeBlocks: TimeBlock[],
): NormalizedTimeBlockSuggestion[] {
  const suggestions: NormalizedTimeBlockSuggestion[] = [];

  for (const block of timeBlocks) {
    if (!block.ai_suggestions || block.ai_suggestions.length === 0) continue;

    for (const suggestion of block.ai_suggestions) {
      suggestions.push({
        ...suggestion,
        sourceTimeBlockId: block.id,
        sourceTimeBlockDuration: block.duration_minutes || 0,
        confidence: suggestion.confidence ?? 0.8,
      });
    }
  }

  // Sort by confidence, then by reason relevance (can be enhanced)
  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

interface UnscheduledBlockAnalysis {
  totalMinutes: number;
  blockCount: number;
  averageBlockDuration: number;
  suggestedTasks: NormalizedTimeBlockSuggestion[]; // From ai_suggestions
  capacityForProjects: Map<string, number>; // Which projects could use unscheduled time
}

function analyzeUnscheduledBlocks(
  unscheduledBlocks: TimeBlock[],
  projectsWithTasks: ProjectWithRelations[],
): UnscheduledBlockAnalysis {
  const totalMinutes = unscheduledBlocks.reduce(
    (sum, block) => sum + (block.duration_minutes || 0),
    0,
  );

  const suggestedTasks = normalizeTimeBlockSuggestions(unscheduledBlocks);

  // Build map of projects that need more time
  const capacityForProjects = new Map<string, number>();
  for (const project of projectsWithTasks) {
    // Could use capacity analysis to determine which projects are underallocated
    // For now, all projects could potentially use time
    capacityForProjects.set(project.id, 0); // Placeholder
  }

  return {
    totalMinutes,
    blockCount: unscheduledBlocks.length,
    averageBlockDuration:
      unscheduledBlocks.length > 0
        ? totalMinutes / unscheduledBlocks.length
        : 0,
    suggestedTasks,
    capacityForProjects,
  };
}
```

---

#### Layer 4: LLM Context Enhancement (Extend analysis prompt)

**New Prompt Input Type: `DailyBriefAnalysisWithTimeBlocks`**

```typescript
// In /apps/worker/src/workers/brief/prompts.ts

export interface DailyBriefAnalysisWithTimeBlocks
  extends DailyBriefAnalysisPromptInput {
  // Existing fields from base interface
  date: string;
  timezone: string;
  mainBriefMarkdown: string;
  projects: DailyBriefAnalysisProject[];

  // NEW: Time allocation context
  timeAllocationContext: {
    totalAllocatedMinutes: number;
    projectAllocations: Array<{
      projectId: string;
      projectName: string;
      allocatedMinutes: number;
      taskCount: number;
      capacityStatus: "aligned" | "underallocated" | "overallocated";
      suggestionsFromBlocks: NormalizedTimeBlockSuggestion[];
    }>;

    unscheduledTimeAnalysis: {
      totalMinutes: number;
      blockCount: number;
      suggestedTasks: NormalizedTimeBlockSuggestion[];
    };
  };
}

// New system prompt template for LLM
export function buildDailyBriefSystemPromptWithTimeBlocks(): string {
  return `You are an AI assistant helping users prioritize their daily work.

Key analysis responsibilities:
1. Review the user's scheduled timeblocks and their AI-suggested tasks
2. Compare task workload against allocated time to identify capacity gaps
3. Recommend task prioritization based on available time
4. Highlight opportunities to reallocate unscheduled time to underallocated projects
5. Consider the ai_suggestions from each timeblock as contextual recommendations

When analyzing capacity:
- "Aligned": The allocated time roughly matches the workload. Focus on execution quality.
- "Underallocated": Not enough scheduled time for the workload. Recommend prioritization or additional scheduling.
- "Overallocated": More time than needed. Recommend using overflow time for high-value tasks or lower-priority projects.

Reference timeblock ai_suggestions as "contextual work hints" - they've been pre-analyzed by our system for what would be good to focus on during that specific time.`;
}

// Enhanced user prompt template
export function buildDailyBriefUserPromptWithTimeBlocks(
  input: DailyBriefAnalysisWithTimeBlocks,
): string {
  const { timeAllocationContext, mainBriefMarkdown, date, timezone } = input;

  let prompt = `# Daily Brief Analysis - ${date} (${timezone})\n\n`;

  prompt += `## Time Allocation Summary\n`;
  prompt += `Total scheduled: ${formatMinutes(timeAllocationContext.totalAllocatedMinutes)}\n`;
  prompt += `Unscheduled time available: ${formatMinutes(timeAllocationContext.unscheduledTimeAnalysis.totalMinutes)}\n\n`;

  // Per-project time allocation
  prompt += `## Projects & Time Allocation\n`;
  for (const proj of timeAllocationContext.projectAllocations) {
    prompt += `\n### ${proj.projectName}\n`;
    prompt += `- **Time allocated**: ${formatMinutes(proj.allocatedMinutes)}\n`;
    prompt += `- **Tasks for today**: ${proj.taskCount}\n`;
    prompt += `- **Capacity status**: ${proj.capacityStatus}\n`;

    if (proj.suggestionsFromBlocks.length > 0) {
      prompt += `- **Timeblock task suggestions**:\n`;
      for (const suggestion of proj.suggestionsFromBlocks.slice(0, 3)) {
        prompt += `  - ${suggestion.title} (${suggestion.reason})\n`;
      }
    }
  }

  // Unscheduled time
  if (timeAllocationContext.unscheduledTimeAnalysis.totalMinutes > 0) {
    prompt += `\n## Unscheduled Time (${timeAllocationContext.unscheduledTimeAnalysis.blockCount} blocks, ${formatMinutes(timeAllocationContext.unscheduledTimeAnalysis.totalMinutes)})\n`;

    if (
      timeAllocationContext.unscheduledTimeAnalysis.suggestedTasks.length > 0
    ) {
      prompt += `The user has suggested tasks for this unscheduled time:\n`;
      for (const task of timeAllocationContext.unscheduledTimeAnalysis.suggestedTasks.slice(
        0,
        5,
      )) {
        prompt += `- ${task.title} (from ${task.project_name || "general work"})\n`;
      }
    }
  }

  prompt += `\n## Full Brief\n${mainBriefMarkdown}\n`;

  prompt += `\n## Your Analysis\n`;
  prompt += `Based on the time allocation context above, provide:\n`;
  prompt += `1. **Capacity Assessment**: Is the user well-scheduled for today?\n`;
  prompt += `2. **Task Prioritization**: Given allocated time, which tasks should they focus on?\n`;
  prompt += `3. **Time Reallocation Opportunities**: Any unscheduled time that could fill gaps?\n`;
  prompt += `4. **Timeblock Alignment**: Do the ai_suggestions in scheduled blocks align with today's priority tasks?\n`;
  prompt += `5. **Actionable Recommendations**: 2-3 specific actions for the day\n`;

  return prompt;
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}
```

**Integration Point**: Modify `generateDailyBriefAnalysis()` to use enhanced prompt:

```typescript
// In generateDailyBrief(), after building project analysis data:

const analysisPrompt = buildDailyBriefUserPromptWithTimeBlocks({
  date: formattedDate,
  timezone: userTimezone,
  mainBriefMarkdown: consolidatedMarkdown,
  projects: projectAnalysisData,

  // NEW: Add timeblock context
  timeAllocationContext: {
    totalAllocatedMinutes: timeBlockData.totalMinutesAllocated,
    projectAllocations: Array.from(timeBlockData.projectTimeBlocks.entries()).map(
      ([projectId, blocks]) => ({
        projectId,
        projectName: projects.find(p => p.id === projectId)?.name || 'Unknown',
        allocatedMinutes: blocks.reduce((sum, b) => sum + (b.duration_minutes || 0), 0),
        taskCount: /* get from project brief metadata */,
        capacityStatus: /* get from capacity analysis */,
        suggestionsFromBlocks: normalizeTimeBlockSuggestions(blocks),
      }),
    ),
    unscheduledTimeAnalysis: analyzeUnscheduledBlocks(
      timeBlockData.unscheduledBlocks,
      projects,
    ),
  },
});

// Generate LLM analysis with timeblock context
const llmAnalysis = await smarthome LLMService.generateText(
  buildDailyBriefSystemPromptWithTimeBlocks(),
  analysisPrompt,
);
```

---

#### Layer 5: Presentation Layer (New Brief Section)

**New Markdown Section: Time Allocation Summary**

```typescript
function buildTimeAllocationSection(
  timeBlockData: TimeBlockData,
  projectBriefs: ProjectBriefResult[],
  projects: Project[],
): string {
  let section = `## ⏱️ Time Allocation & Capacity\n\n`;

  const totalAllocated = timeBlockData.totalMinutesAllocated;
  const totalHours = (totalAllocated / 60).toFixed(1);

  section += `**Total scheduled time today**: ${totalHours} hours\n\n`;

  // Project-specific allocations
  section += `### By Project\n`;
  for (const [projectId, blocks] of timeBlockData.projectTimeBlocks) {
    const project = projects.find((p) => p.id === projectId);
    if (!project) continue;

    const projectBrief = projectBriefs.find((b) => b.project_id === projectId);
    const allocatedMinutes = blocks.reduce(
      (sum, b) => sum + (b.duration_minutes || 0),
      0,
    );
    const allocatedHours = (allocatedMinutes / 60).toFixed(1);
    const taskCount = projectBrief?.metadata?.todays_task_count || 0;

    section += `\n**${project.name}** (${allocatedHours}h allocated)\n`;
    section += `- Tasks for today: ${taskCount}\n`;

    // Capacity indicator
    const capacityRatio =
      taskCount > 0 ? allocatedMinutes / (taskCount * 60) : 1;
    if (capacityRatio < 0.7) {
      section += `- ⚠️ **Underallocated**: Only ${(capacityRatio * 100).toFixed(0)}% of needed time\n`;
    } else if (capacityRatio > 1.3) {
      section += `- ✅ **Overallocated**: ${(capacityRatio * 100).toFixed(0)}% more time than needed\n`;
    } else {
      section += `- ✅ **Well-aligned**: Time matches workload\n`;
    }

    // Timeblock suggestions summary
    const blocksWithSuggestions = blocks.filter(
      (b) => b.ai_suggestions && b.ai_suggestions.length > 0,
    );
    if (blocksWithSuggestions.length > 0) {
      const topSuggestions = blocksWithSuggestions
        .flatMap((b) => b.ai_suggestions || [])
        .slice(0, 2);

      if (topSuggestions.length > 0) {
        section += `- 💡 Suggested work: ${topSuggestions.map((s) => s.title).join(", ")}\n`;
      }
    }
  }

  // Unscheduled blocks
  if (timeBlockData.unscheduledBlocks.length > 0) {
    const unscheduledMinutes = timeBlockData.unscheduledBlocks.reduce(
      (sum, b) => sum + (b.duration_minutes || 0),
      0,
    );
    const unscheduledHours = (unscheduledMinutes / 60).toFixed(1);

    section += `\n### Unscheduled Time\n`;
    section += `- **${timeBlockData.unscheduledBlocks.length} blocks** (${unscheduledHours}h total)\n`;

    const unscheduledSuggestions = normalizeTimeBlockSuggestions(
      timeBlockData.unscheduledBlocks,
    ).slice(0, 3);

    if (unscheduledSuggestions.length > 0) {
      section += `- **Suggested work**:\n`;
      for (const suggestion of unscheduledSuggestions) {
        section += `  - ${suggestion.title} (${suggestion.project_name || "general"})\n`;
      }
    } else {
      section += `- This time could be allocated to projects that need more schedule time\n`;
    }
  }

  section += `\n`;
  return section;
}
```

**Integration Point**: Insert in `generateMainBrief()` after executive summary:

```typescript
// In generateMainBrief(), after building executive summary:

let mainBrief = `# 🌅 Daily Brief - ${formattedDate}\n\n`;

// ... existing executive summary ...

// NEW: Add time allocation section
mainBrief += buildTimeAllocationSection(timeBlockData, projectBriefs, projects);

// ... rest of brief ...
```

---

### 4. IMPLEMENTATION PHASES

#### Phase 1: Data Integration (Week 1)

- [ ] Add `getUserTimeBlocksForDate()` function to briefGenerator.ts
- [ ] Call new function in `generateDailyBrief()` main flow
- [ ] Add timeblock data to job metadata tracking
- [ ] Write unit tests for timeblock fetching and grouping

#### Phase 2: Capacity Analysis (Week 2)

- [ ] Add `ProjectCapacityAnalysis` type definition
- [ ] Build `buildProjectCapacityAnalysis()` helper
- [ ] Integrate capacity metrics into project brief metadata
- [ ] Add capacity status to daily_briefs table if needed
- [ ] Write unit tests for capacity calculations

#### Phase 3: LLM Enhancement (Week 2-3)

- [ ] Create `DailyBriefAnalysisWithTimeBlocks` prompt types
- [ ] Build enhanced system and user prompts
- [ ] Integrate timeblock context into LLM calls
- [ ] Test LLM output quality with timeblock context
- [ ] Add A/B testing infrastructure to measure improvement

#### Phase 4: Presentation (Week 3)

- [ ] Build `buildTimeAllocationSection()` function
- [ ] Integrate section into main brief markdown
- [ ] Add visual indicators (capacity status, suggestions)
- [ ] Test email rendering with new section
- [ ] Gather user feedback on new section

#### Phase 5: Optimization & Edge Cases (Week 4)

- [ ] Handle edge cases (no timeblocks, all unscheduled, capacity mismatches)
- [ ] Optimize timeblock suggestions sorting and filtering
- [ ] Add user preferences for timeblock display
- [ ] Performance testing with users having many timeblocks
- [ ] Polish UI/UX in daily brief emails

---

### 5. CODE PATTERNS & BEST PRACTICES

#### Pattern 1: Layered Data Processing

The integration uses **clean layering** to maintain separation of concerns:

```
Data Layer (getUserTimeBlocksForDate)
    ↓ Raw timeblocks, grouped
Capacity Layer (buildProjectCapacityAnalysis)
    ↓ Analyzed capacity status
Suggestion Layer (normalizeTimeBlockSuggestions)
    ↓ Ranked suggestions
Context Layer (Enhanced LLM prompt)
    ↓ Contextual analysis
Presentation Layer (buildTimeAllocationSection)
    ↓ User-facing markdown
```

Each layer **consumes output from the previous layer**, enabling:

- Easy testing of each layer independently
- Clear responsibilities
- Potential reuse in other features (e.g., dashboard)
- Simple parameter passing through `async` operations

#### Pattern 2: Capacity Heuristics

The `capacityRatio` provides intelligent capacity assessment:

```typescript
// Simple heuristic: 1 task ≈ 60 minutes
const taskEffortMinutes = taskCount * 60;
const capacityRatio = allocatedTime / taskEffortMinutes;

// Status thresholds
capacityRatio < 0.7  → Underallocated (need 70%+ more time)
0.7 ≤ ratio ≤ 1.3   → Aligned (reasonable buffer)
ratio > 1.3          → Overallocated (excess time)
```

This can be **enhanced over time** by:

- Tracking actual task completion time to refine the 60-minute estimate
- Using task-level estimated_minutes if available
- Weighing by priority (urgent tasks need more buffer)

#### Pattern 3: Confidence-Weighted Suggestions

The `ai_suggestions` are ranked by confidence:

```typescript
// From timeblock ai_suggestions
suggestions.sort((a, b) => b.confidence - a.confidence);

// Top suggestions highlighted in brief
// Lower-confidence suggestions available for power users
```

This enables **graceful degradation**:

- If LLM didn't generate suggestions, timeblock shows up without them
- If suggestions have low confidence, they're deprioritized
- Users can manually regenerate suggestions if needed

#### Pattern 4: Safe Aggregation with Promise.allSettled

When fetching timeblocks for multiple projects in parallel:

```typescript
const timeblockQueries = projects.map((project) =>
  supabase.from("time_blocks").select("*").eq("project_id", project.id),
);

const results = await Promise.allSettled(timeblockQueries);

// Failures don't crash the entire brief
const blocks = results
  .filter((r) => r.status === "fulfilled")
  .map((r) => (r as PromiseFulfilledResult<any>).value);
```

---

### 6. EXAMPLE OUTPUT

#### Email Section Example

```
## ⏱️ Time Allocation & Capacity

**Total scheduled time today**: 6.5 hours

### By Project

**Website Redesign** (3h allocated)
- Tasks for today: 5
- ⚠️ **Underallocated**: Only 40% of needed time
- 💡 Suggested work: Update homepage layout, Fix navigation spacing

**Marketing Campaign** (2h allocated)
- Tasks for today: 2
- ✅ **Well-aligned**: Time matches workload
- 💡 Suggested work: Write email copy

**General Admin** (1.5h allocated)
- Tasks for today: 1
- ✅ **Overallocated**: 180% more time than needed

### Unscheduled Time

- **3 blocks** (2.5h total)
- **Suggested work**:
  - Review Q4 planning document (Website Redesign)
  - Update project roadmap (Marketing Campaign)
  - Process email backlog (general)

---

**📊 LLM Analysis**

Based on your time allocation, here's what to focus on:

1. **Capacity Alert**: Your Website Redesign has 5 tasks but only 3 hours. Prioritize the homepage update and navigation spacing—these are your highest-impact items.

2. **Time Allocation**: Your unscheduled blocks are well-distributed across projects. Use them to tackle items from your backlog.

3. **Quick Wins**: Marketing campaign is well-scheduled. You can complete both tasks with time to spare for reviews.
```

---

### 7. DATABASE CONSIDERATIONS

**Existing Tables to Query:**

- `time_blocks`: Already has ai_suggestions (JSONB), duration_minutes, project_id
- `daily_briefs`: May add new column `time_allocation_metadata` (optional)

**No New Tables Required** — the feature leverages existing timeblock data structure.

**Query Performance:**

```sql
-- Index required (may already exist)
CREATE INDEX idx_time_blocks_user_date
ON time_blocks(user_id, start_time, end_time);

-- This query will use the index efficiently
SELECT * FROM time_blocks
WHERE user_id = $1
  AND start_time >= $2
  AND end_time <= $3
  AND sync_status = 'synced';
```

---

### 8. TESTING STRATEGY

#### Unit Tests

1. **Data Collection**: `getUserTimeBlocksForDate()`
   - Correctly filters by date and timezone
   - Groups by project vs. unscheduled
   - Calculates total minutes accurately

2. **Capacity Analysis**: `buildProjectCapacityAnalysis()`
   - Correctly identifies underallocated/overallocated/aligned
   - Handles zero tasks or zero timeblocks
   - Edge case: no timeblocks but tasks exist

3. **Suggestion Normalization**: `normalizeTimeBlockSuggestions()`
   - Extracts suggestions correctly
   - Handles missing ai_suggestions gracefully
   - Ranks by confidence properly

4. **Prompt Building**: `buildDailyBriefUserPromptWithTimeBlocks()`
   - Includes all timeblock context
   - Formats duration correctly
   - Handles edge cases (no unscheduled time, etc.)

#### Integration Tests

1. End-to-end brief generation with timeblocks
2. LLM output quality with timeblock context
3. Email rendering with new section
4. Verify timeblock data doesn't break existing brief logic

#### Manual Testing

1. User with well-allocated day (capacity ratio ~1.0)
2. User with underallocated day (ratio < 0.7)
3. User with overallocated day (ratio > 1.3)
4. User with only unscheduled blocks
5. User with no timeblocks (should degrade gracefully)

---

### 9. MIGRATION STRATEGY

**Key Points:**

1. **Backward Compatible**: Feature activates only if timeblocks exist for the date
2. **Graceful Degradation**: Missing timeblock data doesn't crash brief generation
3. **No Breaking Changes**: Existing brief structure unchanged, just appends new section
4. **Phased Rollout**:
   - Week 1: Internal testing with full timeblock data
   - Week 2: Rollout to beta users (those with timeblocks)
   - Week 3: Gradual rollout to all users
   - Week 4: Monitor for issues, iterate

**Rollback Plan:**

If timeblock integration causes issues:

1. Set feature flag `INCLUDE_TIMEBLOCK_ANALYSIS=false` in env
2. Remove new section from brief markdown generation
3. Investigate root cause in non-production environment
4. Re-enable when fixed

---

### 10. FUTURE ENHANCEMENTS

#### Short-term (Post-MVP)

1. **Task Estimates**: Use task-level estimated_minutes for more accurate capacity calculations
2. **Timeblock Feedback Loop**: Track actual completion times to refine capacity heuristics
3. **Smart Reallocation Suggestions**: "Move 1h from Project A to Project B" recommendations
4. **Calendar Heat Map**: Visualize time allocation across the week in brief email

#### Medium-term

1. **Habit Formation**: "You typically allocate X hours to Project A—you're 30% down today"
2. **Predictive Scheduling**: "Based on your pace, you'll need 2 more hours for Project A today"
3. **Conflict Detection**: "You have overdue tasks from Project A but no timeblocks scheduled"
4. **Team Capacity**: For team briefs, aggregate timeblock data across team members

#### Long-term

1. **AI Scheduling Assistant**: "Should I create a timeblock for this task? When?"
2. **Burndown Integration**: Correlate timeblock execution with project velocity
3. **Capacity Planning**: Multi-week view of allocation vs. roadmap
4. **Context Injection**: Timeblock suggestions automatically inject into task details

---

## Code References

### Key Files to Modify

- `/apps/worker/src/workers/brief/briefGenerator.ts` - Add data collection, capacity analysis, presentation
- `/apps/worker/src/workers/brief/prompts.ts` - Add enhanced LLM prompt types and builders
- `/apps/worker/src/workers/shared/queueUtils.ts` - Update job metadata types if needed

### Key Files to Consult

- `/packages/shared-types/src/time-block.types.ts` - TimeBlock and TimeBlockSuggestion interfaces
- `/apps/web/src/lib/services/time-block.service.ts` - Frontend timeblock logic (reference only)
- `/apps/worker/CLAUDE.md` - Worker architecture patterns

---

## Architecture Insights

### Design Philosophy: "Time as Context"

Rather than treating timeblocks as a separate concern, this integration weaves them into the existing brief analysis as a **contextual dimension**:

```
Traditional Daily Brief: "What needs to be done?"
Enhanced Brief: "What needs to be done, and when do I have time to do it?"
```

### Why This Approach Works

1. **Holistic View**: Users see task workload AND available time together
2. **Capacity Awareness**: LLM can make intelligent prioritization decisions
3. **Reduced Cognitive Load**: System shows "what to focus on" not "what you forgot to schedule"
4. **Actionable Insights**: Specific recommendations based on time allocation, not just task list
5. **Graceful Integration**: Works alongside existing brief logic without disrupting it

### Layered Architecture Benefits

- **Testability**: Each layer tested independently
- **Reusability**: Capacity analysis, suggestions can be used in other features
- **Maintainability**: Clear separation of concerns
- **Extensibility**: Easy to add new analysis layers (e.g., task estimates, risk scoring)
- **Performance**: Each layer is a discrete operation, easy to cache/optimize

---

## Related Research

- `/apps/worker/CLAUDE.md` - Worker service architecture and brief generation pipeline
- `/apps/web/docs/features/time-blocks/README.md` - Comprehensive timeblock feature specification
- `/apps/web/docs/features/time-blocks/IMPLEMENTATION_PLAN.md` - Timeblock implementation details

## Open Questions

1. **Task Estimates**: Should we use task-level `estimated_minutes` if available? How is this field populated in BuildOS?
2. **Holiday Handling**: Should timeblocks be filtered out on holidays, or considered extra capacity?
3. **Multi-Day Timeblocks**: How should we handle timeblocks that span midnight?
4. **Timezone Edge Cases**: For users in timezones with DST changes, how do we handle brief generation?
5. **User Preferences**: Should users be able to opt-out of timeblock integration in their briefs?
6. **Performance**: With users having many timeblocks (100+), what's the performance impact?

---

**Generated by Claude Code** | Commit: 9f26638250d9f51922b55e692f94dc410f371c1f | Branch: main
