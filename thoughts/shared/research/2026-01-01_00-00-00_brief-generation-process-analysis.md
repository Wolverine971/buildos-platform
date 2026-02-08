---
title: Brief Generation Process - Comprehensive Analysis & Recommendations
date: 2026-01-01
author: Claude Code
type: research
status: complete
tags:
  - worker
  - brief-generation
  - ontology
  - performance
  - llm
  - optimization
path: thoughts/shared/research/2026-01-01_00-00-00_brief-generation-process-analysis.md
---


# Brief Generation Process - Comprehensive Analysis & Recommendations

## Executive Summary

Your brief generation system is **well-architected** with solid fundamentals: parallel processing, error isolation, timezone-aware scheduling, and cost-effective LLM usage. However, I've identified **several opportunities for improvement** across performance, quality, and reliability dimensions.

---

## Current Architecture Overview

### Flow Summary

```
Scheduler (hourly cron) → Queue (Supabase-based) → BriefWorker
    → OntologyBriefGenerator → DataLoader (10 parallel DB queries)
    → Project Briefs (parallel) → Executive Summary (LLM)
    → Full Analysis (LLM) → Save → Notification Event
```

### Key Files

| File | Purpose |
|------|---------|
| `apps/worker/src/scheduler.ts` | Cron-based scheduling, engagement backoff |
| `apps/worker/src/workers/brief/briefWorker.ts` | Job processing entry point |
| `apps/worker/src/workers/brief/ontologyBriefGenerator.ts` | Main brief generation logic |
| `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts` | Data fetching and categorization |
| `apps/worker/src/workers/brief/ontologyPrompts.ts` | LLM prompt templates |
| `apps/worker/src/lib/services/smart-llm-service.ts` | LLM abstraction with model routing |

### Key Strengths

1. **Cost-effective LLM strategy**: DeepSeek Chat V3 at $0.14/1M tokens (~95% savings vs Claude)
2. **Parallel data loading**: 10 concurrent queries for ontology entities
3. **Error isolation**: `Promise.allSettled` for project briefs prevents cascade failures
4. **Redis-free queue**: Supabase RPC-based with atomic job claiming
5. **Engagement backoff**: Smart throttling for inactive users
6. **Progress tracking**: Real-time updates via Supabase Realtime

---

## Identified Improvement Opportunities

### 1. DATABASE QUERY OPTIMIZATION

**Issue**: `ontologyBriefDataLoader.ts:508-567` makes 10 parallel queries, but each uses `in('project_id', projectIds)` which can be slow for users with many projects.

**Current Code** (`ontologyBriefDataLoader.ts:521-525`):

```typescript
this.supabase
    .from('onto_tasks')
    .select('*')
    .in('project_id', projectIds)
    .is('deleted_at', null)
```

**Recommendations**:

#### 1a. Add database indexes if not present

```sql
CREATE INDEX CONCURRENTLY idx_onto_tasks_project_id
ON onto_tasks(project_id) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY idx_onto_goals_project_id
ON onto_goals(project_id) WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY idx_onto_edges_project_id
ON onto_edges(project_id);

-- Add similar indexes for all onto_* tables
```

#### 1b. Batch queries for large project counts

If `projectIds.length > 50`, consider chunking queries:

```typescript
// Chunk projectIds into batches of 50
const chunks = chunkArray(projectIds, 50);
const results = await Promise.all(chunks.map(chunk =>
    this.supabase.from('onto_tasks').select('*').in('project_id', chunk)
));
```

#### 1c. Select only needed columns instead of `select('*')`

```typescript
.select('id, title, project_id, state_key, type_key, priority, due_at, updated_at')
```

---

### 2. LLM PROMPT EFFICIENCY

**Issue**: The prompts in `ontologyPrompts.ts` can be verbose. Each token costs money and latency.

**Current** (`OntologyAnalysisPrompt.getSystemPrompt()` - ~800 tokens):

```typescript
return `You are a BuildOS productivity strategist writing a goal-oriented daily brief analysis.

Your goals:
- Frame the day in terms of STRATEGIC ALIGNMENT...
- Highlight outputs in progress...
...
```

**Recommendations**:

#### 2a. Compress system prompts

Use structured references instead of repetitive instructions:

```typescript
static getSystemPrompt(): string {
    return `BuildOS productivity strategist. Write goal-oriented daily brief.

Focus: Strategic alignment, outputs, blockers, risks, milestones.

Sections:
1. Strategic Overview (2-3 sentences)
2. Goal Progress (brief per goal)
3. Today's Focus (prioritized)
4. Attention Required (blockers/risks)
5. Week Outlook (milestones, momentum)

Format: Markdown only. Reference specific names. Confident, scannable.`;
}
```

This reduces ~800 tokens to ~100 tokens (~$0.0001 savings per brief × thousands of users = significant).

#### 2b. Limit context in user prompts

`ontologyPrompts.ts:268-293` iterates through ALL projects. For users with 10+ projects, this creates massive prompts.

```typescript
// Current: Iterates through ALL projects
for (const project of briefData.projects) {
    prompt += `\n### ${project.project.name}\n`;
    // ... adds 6-7 lines per project
}

// Recommended: Limit to most active 5 projects
const topProjects = briefData.projects
    .sort((a, b) => b.todaysTasks.length - a.todaysTasks.length)
    .slice(0, 5);
```

#### 2c. Consider two-tier analysis

- **Quick path**: If `totalTasks < 10`, use a simpler prompt (~50% fewer tokens)
- **Full path**: For complex days, use current detailed prompts

---

### 3. CACHING OPPORTUNITIES

**Issue**: Same data is computed multiple times during brief generation.

**Recommendations**:

#### 3a. Cache goal progress calculations

In `ontologyBriefDataLoader.ts`, `calculateGoalProgress` is called multiple times for the same goals.

```typescript
// Add memoization
private goalProgressCache = new Map<string, GoalProgress>();

calculateGoalProgress(goal: OntoGoal, edges: OntoEdge[], tasks: OntoTask[]): GoalProgress {
    const cacheKey = `${goal.id}-${goal.updated_at}`;
    if (this.goalProgressCache.has(cacheKey)) {
        return this.goalProgressCache.get(cacheKey)!;
    }
    // ... calculate
    this.goalProgressCache.set(cacheKey, result);
    return result;
}
```

#### 3b. Cache task categorization

`categorizeTasks` is called once globally and once per project in `prepareBriefData`:

```typescript
// Current (ontologyBriefDataLoader.ts:772-814):
const categorizedTasks = categorizeTasks(allTasks, briefDate, timezone);
// ...
const projects: ProjectBriefData[] = projectsData.map((data) => {
    const projectCategorized = categorizeTasks(data.tasks, briefDate, timezone); // Redundant!
```

**Fix**: Categorize once, then filter by project:

```typescript
const projectCategorized = {
    todaysTasks: categorizedTasks.todaysTasks.filter(t => t.project_id === data.project.id),
    blockedTasks: categorizedTasks.blockedTasks.filter(t => t.project_id === data.project.id),
    // ...
};
```

---

### 4. EXECUTIVE SUMMARY GENERATION TIMING

**Issue**: In `ontologyBriefGenerator.ts:683-723`, the executive summary is generated BEFORE project briefs are finalized. The summary could benefit from project brief content.

**Current Flow**:

1. Generate project briefs
2. Generate executive summary
3. Generate main brief markdown

**Recommended Flow**:

1. Generate project briefs
2. Generate main brief markdown (without executive summary)
3. Generate executive summary with full context
4. Merge

This allows the executive summary to reference insights from the project briefs.

---

### 5. ERROR RECOVERY & RESILIENCE

**Issue**: If LLM analysis fails (`ontologyBriefGenerator.ts:782-817`), the fallback is very basic.

**Current fallback**:

```typescript
llmAnalysis = analysisPoints.join('\n\n');
```

**Recommendations**:

#### 5a. Implement retry with exponential backoff

```typescript
const MAX_LLM_RETRIES = 2;
for (let attempt = 0; attempt <= MAX_LLM_RETRIES; attempt++) {
    try {
        llmAnalysis = await llmService.generateText({...});
        break;
    } catch (error) {
        if (attempt === MAX_LLM_RETRIES) {
            // Use fallback
            console.error('[OntologyBrief] All LLM retries exhausted, using fallback');
        }
        await sleep(1000 * Math.pow(2, attempt)); // 1s, 2s, 4s
    }
}
```

#### 5b. Better fallback content

Generate structured markdown from raw data instead of just bullet points:

```typescript
function generateFallbackAnalysis(briefData: OntologyBriefData): string {
    let analysis = `## Today's Overview\n\n`;

    if (briefData.todaysTasks.length > 0) {
        analysis += `You have **${briefData.todaysTasks.length} tasks** scheduled for today.\n\n`;
    }

    // Group by work mode for structured output
    const workModes = Object.entries(briefData.tasksByWorkMode)
        .filter(([_, tasks]) => tasks.length > 0);

    if (workModes.length > 0) {
        analysis += `### Work Mode Breakdown\n`;
        for (const [mode, tasks] of workModes) {
            analysis += `- **${mode}**: ${tasks.length} tasks\n`;
        }
    }

    // ... more structured content
    return analysis;
}
```

---

### 6. SMART LLM SERVICE IMPROVEMENTS

**Issue**: `smart-llm-service.ts` has hardcoded model fallback chains. As models evolve, this needs updating.

**Current** (`smart-llm-service.ts:243-256`):

```typescript
const JSON_PROFILE_MODELS: Record<JSONProfile, string[]> = {
    fast: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct', ...],
    balanced: ['deepseek/deepseek-chat', 'qwen/qwen-2.5-72b-instruct', ...],
    // ...
};
```

**Recommendations**:

#### 6a. Make model selection configurable via environment

```typescript
const PRIMARY_MODEL = process.env.LLM_PRIMARY_MODEL || 'deepseek/deepseek-chat';
const FALLBACK_MODELS = (process.env.LLM_FALLBACK_MODELS || 'qwen/qwen-2.5-72b-instruct,google/gemini-flash-1.5').split(',');
```

#### 6b. Add model health monitoring

Track failure rates per model and auto-demote failing models:

```typescript
private modelHealthMap = new Map<string, { failures: number; lastFailure: Date }>();

private isModelHealthy(modelId: string): boolean {
    const health = this.modelHealthMap.get(modelId);
    if (!health) return true;

    // Reset failures after 5 minutes
    if (Date.now() - health.lastFailure.getTime() > 5 * 60 * 1000) {
        this.modelHealthMap.delete(modelId);
        return true;
    }

    return health.failures < 3; // Demote after 3 consecutive failures
}
```

---

### 7. SCHEDULER OPTIMIZATION

**Issue**: `scheduler.ts:219-255` checks engagement status sequentially in batches of 20. This is already good but could be faster.

**Recommendations**:

#### 7a. Precompute engagement data

Instead of calling `backoffCalculator.shouldSendDailyBrief` for each user, batch the database queries it makes:

```typescript
// Fetch all user last_visit and email_tracking_events in one query
const { data: engagementData } = await supabase
    .from('users')
    .select(`
        id,
        last_visit,
        email_tracking_events(event_type, created_at)
    `)
    .in('id', userIds)
    .gte('email_tracking_events.created_at', thirtyDaysAgo);
```

#### 7b. Cache engagement decisions

If a user's `last_visit` hasn't changed, their engagement decision won't change:

```typescript
const engagementCache = new Map<string, { decision: EngagementDecision; cachedAt: Date; lastVisit: string }>();

function getCachedEngagementDecision(userId: string, lastVisit: string): EngagementDecision | null {
    const cached = engagementCache.get(userId);
    if (cached && cached.lastVisit === lastVisit) {
        return cached.decision;
    }
    return null;
}
```

---

### 8. PROGRESS TRACKING OVERHEAD

**Issue**: `ontologyBriefGenerator.ts:109-142` updates both `ontology_daily_briefs` and `queue_jobs` tables on every progress update.

**Recommendations**:

#### 8a. Batch progress updates

Instead of 7 individual progress updates, accumulate and update every 2-3 steps:

```typescript
const PROGRESS_UPDATE_INTERVAL = 25; // Update every 25% progress
let lastReportedProgress = 0;

async function conditionalProgressUpdate(
    briefId: string,
    progress: { step: string; progress: number },
    jobId?: string
): Promise<void> {
    if (progress.progress - lastReportedProgress >= PROGRESS_UPDATE_INTERVAL) {
        await updateProgress(briefId, progress, jobId);
        lastReportedProgress = progress.progress;
    }
}
```

#### 8b. Use optimistic updates

Update progress in memory first, then batch-sync to database:

```typescript
const progressQueue: Array<{ briefId: string; progress: number; step: string }> = [];

// Flush every 5 seconds or when complete
setInterval(async () => {
    if (progressQueue.length > 0) {
        const latest = progressQueue[progressQueue.length - 1];
        await updateProgress(latest.briefId, latest, jobId);
        progressQueue.length = 0;
    }
}, 5000);
```

---

### 9. CONTENT QUALITY IMPROVEMENTS

**Issue**: The generated briefs could be more actionable and personalized.

**Recommendations**:

#### 9a. Add task context to priority actions

Currently `extractPriorityActions` just returns task titles. Add context:

```typescript
// Current
actions.push(task.title);

// Improved
const projectName = projectNameMap.get(task.project_id) || 'Unknown';
const dueContext = task.due_at
    ? `, due ${formatRelativeDate(task.due_at)}`
    : '';
actions.push(`${task.title} (${projectName}${dueContext})`);
```

#### 9b. Add estimated time context

If tasks have estimated time, include summary:

```typescript
const totalEstimatedMinutes = briefData.todaysTasks
    .filter(t => t.estimated_minutes)
    .reduce((sum, t) => sum + t.estimated_minutes!, 0);

if (totalEstimatedMinutes > 0) {
    executiveSummary += ` Estimated ${formatMinutes(totalEstimatedMinutes)} of focused work.`;
}
```

#### 9c. Smarter "Today's Focus" prioritization

Weight by multiple factors:

```typescript
function calculateTaskPriority(task: OntoTask, briefData: OntologyBriefData): number {
    let score = 0;

    // Overdue tasks get highest priority
    if (briefData.overdueTasks.some(t => t.id === task.id)) {
        score += 1000;
    }

    // Tasks that unblock others
    const unblockingTasks = briefData.projects.flatMap(p => p.unblockingTasks);
    if (unblockingTasks.some(t => t.id === task.id)) {
        score += 500;
    }

    // High priority (P1/P2)
    if (task.priority !== null && task.priority <= 2) {
        score += 300 - (task.priority * 100);
    }

    // Due today
    if (task.due_at) {
        const daysUntilDue = differenceInDays(parseISO(task.due_at), new Date());
        if (daysUntilDue === 0) score += 200;
        if (daysUntilDue === 1) score += 100;
    }

    return score;
}
```

#### 9d. Personalize based on user history

Track which sections users interact with and emphasize those:

```typescript
// Store in user_brief_preferences or a new table
interface UserBriefEngagement {
    user_id: string;
    section_clicks: {
        strategic_alignment: number;
        todays_focus: number;
        attention_required: number;
        project_details: number;
    };
    last_30_days: Date;
}

// Then adjust brief structure based on engagement
if (engagement.section_clicks.todays_focus > engagement.section_clicks.strategic_alignment * 2) {
    // User prefers actionable content - put Today's Focus first
}
```

---

### 10. METRICS & OBSERVABILITY

**Issue**: Limited visibility into brief generation quality and performance.

**Recommendations**:

#### 10a. Track LLM response quality metrics

```typescript
interface BriefGenerationMetrics {
    briefId: string;
    userId: string;
    generationDurationMs: number;
    dataLoadDurationMs: number;
    llmDurationMs: number;
    promptTokens: number;
    completionTokens: number;
    modelUsed: string;
    wasRetry: boolean;
    hadFallback: boolean;
    projectCount: number;
    taskCount: number;
    errorOccurred: boolean;
    errorMessage?: string;
}

async function logBriefGenerationMetrics(metrics: BriefGenerationMetrics): Promise<void> {
    await supabase.from('brief_generation_metrics').insert(metrics);
}
```

#### 10b. Add brief quality signals

Track user engagement with generated briefs:

```typescript
interface BriefEngagementEvent {
    brief_id: string;
    user_id: string;
    event_type: 'email_opened' | 'web_viewed' | 'task_completed' | 'link_clicked';
    event_metadata?: Record<string, unknown>;
    created_at: string;
}
```

Then compute quality metrics:

- **Open rate**: % of briefs where email was opened
- **Engagement rate**: % of briefs where user visited web brief within 1 hour
- **Action rate**: % of briefs where user completed a suggested task within 24h

#### 10c. Alert on degraded performance

```typescript
const ALERT_THRESHOLDS = {
    llmLatencyMs: 10000,      // Alert if LLM takes > 10s
    totalDurationMs: 60000,   // Alert if total generation > 1 min
    errorRatePercent: 5,      // Alert if error rate > 5%
    fallbackRatePercent: 10,  // Alert if fallback rate > 10%
};

async function checkAndAlert(metrics: BriefGenerationMetrics): Promise<void> {
    if (metrics.llmDurationMs > ALERT_THRESHOLDS.llmLatencyMs) {
        await sendAlert('LLM latency exceeded threshold', metrics);
    }
    // ... other checks
}
```

---

## Priority Matrix

| Improvement | Impact | Effort | Priority |
|-------------|--------|--------|----------|
| Select specific columns in queries | Medium | Low | **High** |
| Compress LLM prompts | High | Low | **High** |
| Cache goal progress calculations | Medium | Low | **High** |
| Fix redundant task categorization | Low | Low | **High** |
| Add database indexes | High | Low | **High** |
| Batch progress updates | Low | Low | Medium |
| Add LLM retry logic | Medium | Medium | Medium |
| Environment-based model config | Low | Low | Medium |
| Precompute engagement data | Medium | Medium | Medium |
| Track brief quality metrics | High | High | Low |
| Personalize based on user history | High | High | Low |

---

## Quick Wins (Implement Today)

### 1. Add column selection to queries

Change `select('*')` to specific columns in `ontologyBriefDataLoader.ts`:

```typescript
// Before
.select('*')

// After
.select('id, title, project_id, state_key, type_key, priority, due_at, updated_at, created_at')
```

### 2. Compress system prompts

Reduce `OntologyAnalysisPrompt.getSystemPrompt()` from ~800 tokens to ~150 tokens.

### 3. Fix redundant `categorizeTasks` call

In `ontologyBriefDataLoader.ts:813-814`, filter from global categorization instead of re-categorizing:

```typescript
// Before
const projectCategorized = categorizeTasks(data.tasks, briefDate, timezone);

// After
const projectCategorized = {
    todaysTasks: categorizedTasks.todaysTasks.filter(t => t.project_id === data.project.id),
    // ...
};
```

### 4. Limit project context in prompts

Cap project details in LLM prompts to 5 most active projects.

---

## Estimated Impact

| Optimization | Cost Savings | Performance Improvement |
|--------------|--------------|------------------------|
| Prompt compression | 30-50% LLM cost reduction | 10-20% faster LLM calls |
| Query optimization | - | 20-30% faster data loading |
| Caching | - | 10-15% faster processing |
| Column selection | - | 5-10% faster queries, less memory |

**Total estimated improvement**:
- **Cost**: 30-50% reduction in LLM costs
- **Performance**: 30-40% faster brief generation
- **Reliability**: Fewer failed briefs with retry logic

---

## Next Steps

1. **Immediate**: Implement quick wins (1-2 hours of work)
2. **This week**: Add database indexes and LLM retry logic
3. **This month**: Implement metrics and observability
4. **Future**: Personalization based on user engagement

---

## Implementation Progress (2026-01-01)

### ✅ COMPLETED IMPROVEMENTS

#### 1. Executive Summary Generation Timing (Section 4)
**Files Modified:**
- `apps/worker/src/workers/brief/ontologyPrompts.ts`
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`

**Changes:**
- Added `projectBriefContents?: string[]` to `OntologyAnalysisPromptInput` interface
- Updated both `OntologyAnalysisPrompt.buildUserPrompt` and `OntologyExecutiveSummaryPrompt.buildUserPrompt` to accept and include project brief contents
- Executive summary now has access to finalized project briefs for full context
- Added truncation (2000 chars for exec summary, 3000 for analysis) to prevent token overflow

#### 2. SmartLLMService Sync (Section 6)
**Files Modified:**
- `apps/worker/src/lib/services/smart-llm-service.ts`

**Changes:**
- Synced model configurations from web version to worker
- Added new models: Grok 4, GPT-4.1 Nano, Gemini 2.5 Flash, DeepSeek R1, Claude 4 series
- Updated JSON_MODELS and TEXT_MODELS with latest model profiles
- Updated JSON_PROFILE_MODELS and TEXT_PROFILE_MODELS with optimized model selections
- Updated `supportsJsonMode()` with new model IDs
- Updated `getProviderPreferences()` with new providers

#### 3. Scheduler Optimization (Section 7)
**Files Modified:**
- `apps/worker/src/lib/briefBackoffCalculator.ts`
- `apps/worker/src/scheduler.ts`

**Changes:**
- Added `shouldSendDailyBriefBatch()` method that uses only 2 queries for ALL users instead of 2 per user
- For 100 users: 2 queries vs 200 queries (100x improvement)
- Batch fetches users.last_visit and daily_briefs in single queries
- Added fallback to individual queries on error
- Updated scheduler to use batch method with graceful fallback

#### 4. Content Quality Improvements (Section 9) - PROJECT_CONTEXT_ENRICHMENT_SPEC.md Patterns
**Files Modified:**
- `apps/worker/src/workers/brief/ontologyBriefTypes.ts`
- `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`
- `apps/worker/src/workers/brief/ontologyPrompts.ts`

**Changes:**

**Entity Caps Added (per spec):**
```typescript
export const ENTITY_CAPS = {
    GOALS: 5,
    RISKS: 5,
    DECISIONS: 5,
    REQUIREMENTS: 5,
    DOCUMENTS: 5,
    MILESTONES: 5,
    PLANS: 5,
    OUTPUTS: 5,
    TASKS_RECENT: 10,
    TASKS_UPCOMING: 5
};
```

**Strategic Task Splits:**
- Added `recentlyUpdatedTasks` to `OntologyBriefData` and `ProjectBriefData` interfaces
- Added `upcomingTasks` with deduplication from recently updated tasks
- Updated `categorizeTasks()` to use 7-day window for recently updated (vs 24h previously)
- Added proper sorting: `updated_at desc` for recent, earliest `due_at/start_at` for upcoming
- Updated `prepareBriefData()` to apply entity caps and include new fields

**Prompt Updates:**
- Added "Recently Updated Tasks (7d)" and "Upcoming Tasks (next 7d)" stats to prompts
- Added new prompt sections for recently updated and upcoming tasks with proper caps
- Updated project context to show recent/upcoming counts
- Added sections in Project Brief prompt for strategic task splits

---

### 📋 REMAINING RECOMMENDATIONS (Not Yet Implemented)

| Section | Recommendation | Status |
|---------|---------------|--------|
| 1 | Database query optimization (indexes, column selection) | Pending |
| 2 | LLM prompt compression | Pending |
| 3 | Caching opportunities (goal progress, task categorization) | Pending |
| 5 | Error recovery & resilience (retry logic, better fallbacks) | Pending |
| 8 | Progress tracking optimization (batch updates) | Pending |
| 10 | Metrics & observability | Pending |

---

## References

- Spec: `/docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md`
- Enrichment Spec: `/docs/specs/PROJECT_CONTEXT_ENRICHMENT_SPEC.md`
- Worker CLAUDE.md: `/apps/worker/CLAUDE.md`
- SmartLLMService: `/apps/worker/src/lib/services/smart-llm-service.ts`
- Ontology Brief Generator: `/apps/worker/src/workers/brief/ontologyBriefGenerator.ts`
