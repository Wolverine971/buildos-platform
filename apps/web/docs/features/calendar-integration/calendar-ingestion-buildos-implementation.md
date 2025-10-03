# BuildOS Calendar Intelligence Integration - Implementation Plan

## Executive Summary

This document outlines the implementation plan for intelligent calendar analysis in BuildOS, allowing users to automatically generate projects from their Google Calendar events. The feature will integrate seamlessly with BuildOS's existing calendar infrastructure, brain dump patterns, and approval UI components.

## User Flow

### 1. Initial Connection Flow

When a user first connects their Google Calendar (via `/profile?tab=calendar`):

1. **OAuth Connection** completes successfully
2. **Calendar Analysis Modal** appears automatically:
   ```
   Title: "Analyze Your Calendar?"
   Message: "Would you like BuildOS to analyze your calendar and suggest projects based on your events?"
   Subtext: "We'll look for patterns in your meetings and events to identify potential projects."
   Actions: [Skip for Now] [Analyze Calendar]
   ```
3. If **"Analyze Calendar"** is selected:
   - Show loading state: "Analyzing your calendar events..."
   - Process events in background
   - Present approval UI when complete
4. If **"Skip for Now"** is selected:
   - Close modal
   - Show "Analyze Calendar" button in CalendarTab

### 2. Manual Trigger from Profile

In `/profile?tab=calendar` (CalendarTab.svelte), add:

- **"Analyze Calendar" Button** - Prominent placement below connection status
- **Analysis History Section** - Shows previous analyses and created projects
- **Re-analyze Option** - For users who want to run analysis again

### 3. Analysis and Approval Flow

Using BuildOS's established ParseResultsView pattern:

```
┌─────────────────────────────────────────────────────┐
│ Calendar Analysis Results                            │
├─────────────────────────────────────────────────────┤
│ Found 3 potential projects from your calendar        │
│ Date range: Jan 1 - Feb 28, 2025                    │
├─────────────────────────────────────────────────────┤
│ [✓] Project: "Q1 Product Launch"                     │
│     • 12 related events found                        │
│     • Key participants: john@, sarah@, mike@         │
│     • Confidence: 85%                                │
│     [View Events] [Edit] [Remove]                    │
├─────────────────────────────────────────────────────┤
│ [✓] Project: "Weekly Team Sync"                      │
│     • Recurring meeting pattern detected             │
│     • Every Tuesday 2-3pm                            │
│     • Confidence: 92%                                │
│     [View Events] [Edit] [Remove]                    │
├─────────────────────────────────────────────────────┤
│ [ ] Project: "Client Onboarding"                     │
│     • 5 related events                               │
│     • Declined/tentative - not recommended           │
│     • Confidence: 45%                                │
│     [View Events] [Edit] [Remove]                    │
├─────────────────────────────────────────────────────┤
│ 2 of 3 projects selected                             │
│ [Cancel] [Create 2 Projects]                         │
└─────────────────────────────────────────────────────┘
```

## Technical Implementation

### Phase 1: Database Schema Updates (Week 1)

#### 1.1 Extend Existing Tables

```sql
-- Add to projects table (already has calendar fields)
ALTER TABLE projects
ADD COLUMN source TEXT DEFAULT 'buildos' CHECK (source IN ('buildos', 'calendar_analysis', 'calendar_sync'));
ADD COLUMN source_metadata JSONB;
-- Example: { analysis_id: 'uuid', event_ids: [], confidence: 0.85 }

-- Add to tasks table
ALTER TABLE tasks
ADD COLUMN source TEXT DEFAULT 'buildos' CHECK (source IN ('buildos', 'calendar_event', 'ai_generated'));
ADD COLUMN source_calendar_event_id TEXT REFERENCES task_calendar_events(calendar_event_id);
```

#### 1.2 Create Analysis Tables

```sql
-- Track calendar analyses
CREATE TABLE calendar_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) NOT NULL,

    -- Analysis metadata
    status TEXT DEFAULT 'processing', -- processing, completed, failed
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,

    -- Date range analyzed
    date_range_start DATE,
    date_range_end DATE,
    events_analyzed INTEGER,

    -- Results
    projects_suggested INTEGER DEFAULT 0,
    projects_created INTEGER DEFAULT 0,
    tasks_created INTEGER DEFAULT 0,

    -- LLM metadata
    ai_model TEXT,
    processing_time_ms INTEGER,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Store project suggestions
CREATE TABLE calendar_project_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    analysis_id UUID REFERENCES calendar_analyses(id),
    user_id UUID REFERENCES profiles(id) NOT NULL,

    -- Suggestion details
    suggested_name TEXT NOT NULL,
    suggested_description TEXT,
    suggested_context TEXT,
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),

    -- Related events
    calendar_event_ids TEXT[],
    event_patterns JSONB, -- { recurring: true, frequency: 'weekly', attendees: [...] }

    -- AI reasoning
    ai_reasoning TEXT,
    detected_keywords TEXT[],

    -- User action
    status TEXT DEFAULT 'pending', -- pending, accepted, rejected, modified
    user_modified_name TEXT,
    user_modified_description TEXT,

    -- Result
    created_project_id UUID REFERENCES projects(id),

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add RLS policies
ALTER TABLE calendar_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_project_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_analyses_user_policy ON calendar_analyses
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY suggestions_user_policy ON calendar_project_suggestions
    FOR ALL USING (auth.uid() = user_id);
```

### Phase 2: Backend Services (Week 1-2)

#### 2.1 Calendar Analysis Service

Create `/apps/web/src/lib/services/calendar-analysis.service.ts`:

```typescript
import { CalendarService } from "./calendar-service";

import { OperationsParser } from "$lib/utils/operations/operations-parser";

export class CalendarAnalysisService extends ApiService {
  private static instance: CalendarAnalysisService;

  public static getInstance(): CalendarAnalysisService {
    if (!this.instance) {
      this.instance = new CalendarAnalysisService();
    }
    return this.instance;
  }

  async analyzeUserCalendar(
    userId: string,
    options: {
      daysBack?: number;
      daysForward?: number;
      calendarsToAnalyze?: string[];
    } = {},
  ): Promise<AnalysisResult> {
    const { daysBack = 30, daysForward = 60 } = options;

    // Create analysis record
    const analysis = await this.createAnalysisRecord(userId, {
      date_range_start: dayjs().subtract(daysBack, "days").toDate(),
      date_range_end: dayjs().add(daysForward, "days").toDate(),
    });

    try {
      // Fetch calendar events
      const calendarService = CalendarService.getInstance();
      const events = await calendarService.getCalendarEvents(userId, {
        timeMin: dayjs().subtract(daysBack, "days").toISOString(),
        timeMax: dayjs().add(daysForward, "days").toISOString(),
        maxResults: 500,
      });

      // Filter out declined events and all-day personal events
      const relevantEvents = this.filterRelevantEvents(events);

      // Send to LLM for analysis
      const suggestions = await this.analyzeEventsWithAI(relevantEvents);

      // Store suggestions in database
      await this.storeSuggestions(analysis.id, suggestions);

      // Update analysis record
      await this.updateAnalysisRecord(analysis.id, {
        status: "completed",
        events_analyzed: relevantEvents.length,
        projects_suggested: suggestions.length,
        completed_at: new Date(),
      });

      return {
        analysisId: analysis.id,
        suggestions,
        eventsAnalyzed: relevantEvents.length,
      };
    } catch (error) {
      await this.updateAnalysisRecord(analysis.id, { status: "failed" });
      throw error;
    }
  }

  private async analyzeEventsWithAI(
    events: CalendarEvent[],
  ): Promise<ProjectSuggestion[]> {
    const llmService = SmartLLMService.getInstance();

    const prompt = `
    Analyze these calendar events and identify potential projects for a BuildOS user.

    BuildOS is designed for ADHD minds, helping transform scattered thoughts into organized projects.
    Look for patterns that suggest ongoing projects or initiatives.

    Identify projects based on:
    - Recurring meetings with similar titles/attendees (likely ongoing projects)
    - Clusters of related events (project milestones, reviews, planning sessions)
    - Events with project-indicating keywords (sprint, launch, milestone, review, kickoff, deadline)
    - Series of events building toward a goal

    For each potential project, provide:
    1. project_name: Clear, action-oriented name
    2. description: 2-3 sentence description
    3. context: Detailed context for the project (markdown format)
    4. event_ids: Array of event IDs that belong to this project
    5. confidence: 0-1 score (how confident this is a real project)
    6. reasoning: Why these events suggest a project
    7. keywords: Keywords that indicated this project
    8. suggested_tasks: Initial tasks based on the events

    Ignore:
    - One-off personal events (lunch, coffee, dentist)
    - Company all-hands or general meetings
    - Events marked as declined or tentative
    - Focus/work blocks without specific context

    Calendar Events:
    ${JSON.stringify(
      events.map((e) => ({
        id: e.id,
        title: e.summary,
        description: e.description,
        start: e.start,
        end: e.end,
        attendees: e.attendees?.map((a) => a.email),
        organizer: e.organizer?.email,
        recurring: !!e.recurringEventId,
        status: e.status,
      })),
      null,
      2,
    )}

    Return as JSON array of project suggestions. Only suggest projects with confidence >= 0.6.
    `;

    const response = await llmService.createChatCompletion(
      [{ role: "user", content: prompt }],
      {
        response_format: { type: "json_object" },
        max_tokens: 4000,
      },
    );

    const result = JSON.parse(response.content);
    return result.suggestions || [];
  }

  async acceptSuggestion(
    suggestionId: string,
    userId: string,
    modifications?: {
      name?: string;
      description?: string;
      includeTasks?: boolean;
    },
  ): Promise<Project> {
    const suggestion = await this.getSuggestion(suggestionId, userId);

    // Generate operations using existing pattern
    const operations = [
      {
        type: "create" as const,
        entity: "projects" as const,
        data: {
          name: modifications?.name || suggestion.suggested_name,
          description:
            modifications?.description || suggestion.suggested_description,
          context: suggestion.suggested_context,
          source: "calendar_analysis",
          source_metadata: {
            analysis_id: suggestion.analysis_id,
            suggestion_id: suggestion.id,
            event_ids: suggestion.calendar_event_ids,
            confidence: suggestion.confidence_score,
          },
        },
      },
    ];

    // Add task operations if requested
    if (modifications?.includeTasks !== false && suggestion.suggested_tasks) {
      operations.push(
        ...suggestion.suggested_tasks.map((task: any) => ({
          type: "create" as const,
          entity: "tasks" as const,
          data: {
            title: task.title,
            description: task.description,
            project_ref: 0, // Reference to the project created above
            source: "calendar_event",
            source_calendar_event_id: task.event_id,
          },
        })),
      );
    }

    // Execute operations using existing executor
    const executor = new OperationsExecutor(supabase, userId);
    const results = await executor.executeOperations(operations);

    // Update suggestion status
    await this.updateSuggestionStatus(
      suggestionId,
      "accepted",
      results.projects[0]?.id,
    );

    return results.projects[0];
  }
}
```

#### 2.2 API Endpoints

Create `/apps/web/src/routes/api/calendar/analyze/+server.ts`:

```typescript
import { json } from "@sveltejs/kit";
import { CalendarAnalysisService } from "$lib/services/calendar-analysis.service";

export async function POST({ request, locals }) {
  const session = await locals.auth();
  if (!session?.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const { daysBack, daysForward } = await request.json();

  try {
    const service = CalendarAnalysisService.getInstance();
    const result = await service.analyzeUserCalendar(session.user.id, {
      daysBack,
      daysForward,
    });

    return json({ success: true, ...result });
  } catch (error) {
    return json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
```

### Phase 3: UI Components (Week 2)

#### 3.1 Calendar Analysis Modal

Create `/apps/web/src/lib/components/calendar/CalendarAnalysisModal.svelte`:

```svelte
<script lang="ts">
  import { ConfirmationModal } from '$lib/components/ui/ConfirmationModal.svelte';
  import { modalStore } from '$lib/stores/modal.store';
  import { goto } from '$app/navigation';

  let { isOpen = $bindable(false), onFirstConnection = false } = $props();

  async function handleAnalyze() {
    // Store flag that analysis was requested
    localStorage.setItem('calendar_analysis_requested', 'true');

    // Navigate to analysis view
    if (onFirstConnection) {
      goto('/profile?tab=calendar&analyze=true');
    } else {
      modalStore.open('calendarAnalysis');
    }

    isOpen = false;
  }

  function handleSkip() {
    localStorage.setItem('calendar_analysis_skipped', 'true');
    isOpen = false;
  }
</script>

<ConfirmationModal
  {isOpen}
  title={onFirstConnection ? "Welcome to Calendar Intelligence!" : "Analyze Your Calendar?"}
  confirmText="Analyze Calendar"
  cancelText="Skip for Now"
  icon="info"
  on:confirm={handleAnalyze}
  on:cancel={handleSkip}
>
  <div slot="content" class="space-y-4">
    <p class="text-gray-600">
      BuildOS can analyze your calendar to identify projects from your meetings and events.
    </p>

    <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
      <h4 class="font-medium text-gray-900 mb-2">What we'll look for:</h4>
      <ul class="space-y-1 text-sm text-gray-600">
        <li class="flex items-start gap-2">
          <span class="text-purple-500 mt-1">•</span>
          <span>Recurring meetings that might be ongoing projects</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-purple-500 mt-1">•</span>
          <span>Related events like sprints, reviews, and milestones</span>
        </li>
        <li class="flex items-start gap-2">
          <span class="text-purple-500 mt-1">•</span>
          <span>Meeting patterns that suggest project work</span>
        </li>
      </ul>
    </div>

    <p class="text-sm text-gray-500">
      You'll be able to review and approve any suggestions before creating projects.
    </p>
  </div>
</ConfirmationModal>
```

#### 3.2 Calendar Analysis Results View

Create `/apps/web/src/lib/components/calendar/CalendarAnalysisResults.svelte`:

```svelte
<script lang="ts">
  import { Modal } from '$lib/components/ui/Modal.svelte';
  import { Button } from '$lib/components/ui/Button.svelte';
  import { Badge } from '$lib/components/ui/Badge.svelte';
  import { CalendarAnalysisService } from '$lib/services/calendar-analysis.service';
  import { toastService } from '$lib/stores/toast.store';
  import { CheckCircle, Circle, AlertTriangle, Calendar, Users, TrendingUp } from 'lucide-svelte';

  let {
    isOpen = $bindable(false),
    analysisId,
    suggestions = []
  } = $props();

  let selectedSuggestions = $state(new Set());
  let editingSuggestion = $state(null);
  let processing = $state(false);

  // Auto-select high confidence suggestions
  $effect(() => {
    if (suggestions.length > 0) {
      suggestions.forEach(s => {
        if (s.confidence_score >= 0.7) {
          selectedSuggestions.add(s.id);
        }
      });
    }
  });

  function toggleSuggestion(id: string) {
    if (selectedSuggestions.has(id)) {
      selectedSuggestions.delete(id);
    } else {
      selectedSuggestions.add(id);
    }
    selectedSuggestions = new Set(selectedSuggestions);
  }

  async function handleCreateProjects() {
    processing = true;
    const service = CalendarAnalysisService.getInstance();

    try {
      const selected = suggestions.filter(s => selectedSuggestions.has(s.id));
      const results = await Promise.allSettled(
        selected.map(s => service.acceptSuggestion(s.id, userId, {
          name: s.user_modified_name || s.suggested_name,
          description: s.user_modified_description || s.suggested_description,
          includeTasks: true
        }))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      if (successful > 0) {
        toastService.success(`Created ${successful} project${successful > 1 ? 's' : ''} from your calendar!`);
      }

      if (failed > 0) {
        toastService.warning(`${failed} project${failed > 1 ? 's' : ''} failed to create`);
      }

      isOpen = false;

      // Navigate to projects page
      goto('/projects');
    } catch (error) {
      toastService.error('Failed to create projects');
    } finally {
      processing = false;
    }
  }
</script>

<Modal
  {isOpen}
  onClose={() => isOpen = false}
  title="Calendar Analysis Results"
  size="xl"
  showCloseButton={true}
>
  <div class="space-y-6">
    <!-- Summary -->
    <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
      <div class="flex items-center justify-between">
        <div>
          <h3 class="font-medium text-gray-900">
            Found {suggestions.length} potential project{suggestions.length !== 1 ? 's' : ''}
          </h3>
          <p class="text-sm text-gray-600 mt-1">
            From analyzing your calendar events
          </p>
        </div>
        <Calendar class="w-8 h-8 text-purple-500" />
      </div>
    </div>

    <!-- Suggestions List -->
    <div class="space-y-4 max-h-[400px] overflow-y-auto">
      {#each suggestions as suggestion}
        {@const isSelected = selectedSuggestions.has(suggestion.id)}
        {@const confidence = Math.round(suggestion.confidence_score * 100)}

        <div
          class="border rounded-lg p-4 transition-all"
          class:border-purple-500={isSelected}
          class:bg-purple-50={isSelected}
          class:border-gray-200={!isSelected}
        >
          <div class="flex items-start gap-4">
            <!-- Selection Indicator -->
            <button
              on:click={() => toggleSuggestion(suggestion.id)}
              class="mt-1"
            >
              {#if isSelected}
                <CheckCircle class="w-5 h-5 text-purple-600" />
              {:else}
                <Circle class="w-5 h-5 text-gray-400" />
              {/if}
            </button>

            <!-- Content -->
            <div class="flex-1">
              <div class="flex items-start justify-between">
                <div>
                  <h4 class="font-medium text-gray-900">
                    {editingSuggestion === suggestion.id ? (
                      <input
                        type="text"
                        bind:value={suggestion.user_modified_name}
                        placeholder={suggestion.suggested_name}
                        class="border rounded px-2 py-1"
                      />
                    ) : (
                      suggestion.user_modified_name || suggestion.suggested_name
                    )}
                  </h4>

                  {#if editingSuggestion === suggestion.id}
                    <textarea
                      bind:value={suggestion.user_modified_description}
                      placeholder={suggestion.suggested_description}
                      class="mt-2 w-full border rounded px-2 py-1"
                      rows="2"
                    />
                  {:else}
                    <p class="text-sm text-gray-600 mt-1">
                      {suggestion.user_modified_description || suggestion.suggested_description}
                    </p>
                  {/if}
                </div>

                <!-- Confidence Badge -->
                <Badge
                  variant={confidence >= 80 ? 'success' : confidence >= 60 ? 'warning' : 'secondary'}
                >
                  {confidence}% confidence
                </Badge>
              </div>

              <!-- Metadata -->
              <div class="flex items-center gap-4 mt-3 text-sm text-gray-500">
                <span class="flex items-center gap-1">
                  <Calendar class="w-4 h-4" />
                  {suggestion.calendar_event_ids.length} events
                </span>

                {#if suggestion.event_patterns?.recurring}
                  <span class="flex items-center gap-1">
                    <TrendingUp class="w-4 h-4" />
                    Recurring
                  </span>
                {/if}

                {#if suggestion.event_patterns?.attendees?.length > 0}
                  <span class="flex items-center gap-1">
                    <Users class="w-4 h-4" />
                    {suggestion.event_patterns.attendees.length} people
                  </span>
                {/if}
              </div>

              <!-- AI Reasoning (expandable) -->
              <details class="mt-3">
                <summary class="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                  Why this was suggested
                </summary>
                <p class="text-sm text-gray-600 mt-2 pl-4 border-l-2 border-gray-200">
                  {suggestion.ai_reasoning}
                </p>
              </details>

              <!-- Actions -->
              <div class="flex items-center gap-2 mt-3">
                {#if editingSuggestion === suggestion.id}
                  <Button
                    size="sm"
                    variant="primary"
                    on:click={() => editingSuggestion = null}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    on:click={() => {
                      suggestion.user_modified_name = null;
                      suggestion.user_modified_description = null;
                      editingSuggestion = null;
                    }}
                  >
                    Cancel
                  </Button>
                {:else}
                  <Button
                    size="sm"
                    variant="ghost"
                    on:click={() => editingSuggestion = suggestion.id}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    on:click={() => toggleSuggestion(suggestion.id)}
                  >
                    {isSelected ? 'Deselect' : 'Select'}
                  </Button>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <!-- No suggestions -->
    {#if suggestions.length === 0}
      <div class="text-center py-8">
        <Calendar class="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p class="text-gray-600">No project patterns found in your calendar</p>
        <p class="text-sm text-gray-500 mt-1">
          This might be because your events are mostly one-off meetings
        </p>
      </div>
    {/if}
  </div>

  <div slot="footer" class="flex items-center justify-between">
    <div class="text-sm text-gray-600">
      {selectedSuggestions.size} of {suggestions.length} selected
    </div>

    <div class="flex items-center gap-3">
      <Button
        variant="secondary"
        on:click={() => isOpen = false}
        disabled={processing}
      >
        Cancel
      </Button>
      <Button
        variant="primary"
        on:click={handleCreateProjects}
        disabled={selectedSuggestions.size === 0 || processing}
        loading={processing}
      >
        Create {selectedSuggestions.size} Project{selectedSuggestions.size !== 1 ? 's' : ''}
      </Button>
    </div>
  </div>
</Modal>
```

#### 3.3 Update CalendarTab Component

Modify `/apps/web/src/lib/components/profile/CalendarTab.svelte`:

```svelte
<!-- Add after connection status section -->
{#if calendarConnected}
  <div class="mt-6 border-t pt-6">
    <h3 class="text-lg font-semibold mb-3">Calendar Intelligence</h3>

    <!-- Analysis Button -->
    <div class="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-4">
      <div class="flex items-start justify-between">
        <div>
          <h4 class="font-medium text-gray-900">Analyze Your Calendar</h4>
          <p class="text-sm text-gray-600 mt-1">
            Let BuildOS find projects in your calendar events
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          on:click={startCalendarAnalysis}
          disabled={analysisInProgress}
          loading={analysisInProgress}
        >
          {analysisInProgress ? 'Analyzing...' : 'Analyze Calendar'}
        </Button>
      </div>

      <!-- Last Analysis Info -->
      {#if lastAnalysis}
        <div class="mt-3 text-sm text-gray-500">
          Last analyzed: {formatRelativeTime(lastAnalysis.completed_at)}
          • {lastAnalysis.projects_created} projects created
        </div>
      {/if}
    </div>

    <!-- Analysis History -->
    {#if calendarProjects.length > 0}
      <div class="mt-6">
        <h4 class="font-medium text-gray-900 mb-3">
          Projects from Calendar ({calendarProjects.length})
        </h4>
        <div class="space-y-2">
          {#each calendarProjects as project}
            <a
              href="/projects/{project.id}"
              class="block p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow"
            >
              <div class="flex items-center justify-between">
                <div>
                  <h5 class="font-medium text-gray-900">{project.name}</h5>
                  <p class="text-sm text-gray-500">
                    Created {formatRelativeTime(project.created_at)}
                    • {project.task_count} tasks
                  </p>
                </div>
                <Badge variant="secondary">
                  <Calendar class="w-3 h-3 mr-1" />
                  From Calendar
                </Badge>
              </div>
            </a>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}
```

### Phase 4: Integration & Testing (Week 3)

#### 4.1 Hook into OAuth Callback

Update `/apps/web/src/routes/auth/google/calendar-callback/+page.server.ts`:

```typescript
// After successful OAuth connection
if (success && isFirstConnection) {
  // Set flag to show analysis modal
  await supabase.from("user_preferences").upsert({
    user_id: user.id,
    show_calendar_analysis_modal: true,
  });
}
```

#### 4.2 Profile Page Integration

Update `/apps/web/src/routes/profile/+page.svelte`:

```svelte
<!-- Add modal for first-time connection -->
{#if showCalendarAnalysisModal}
  <CalendarAnalysisModal
    isOpen={true}
    onFirstConnection={true}
    on:close={() => showCalendarAnalysisModal = false}
  />
{/if}
```

## Open Questions & Considerations

### 1. **Analysis Scope**

- **Question**: How far back/forward should we analyze by default?
- **Recommendation**: 30 days back, 60 days forward (configurable)

### 2. **Event Filtering**

- **Question**: Should we analyze all calendars or let users select?
- **Recommendation**: Start with primary calendar, add multi-calendar support later

### 3. **Recurring Events**

- **Question**: How to handle recurring meetings?
- **Recommendation**: Group them as single projects with recurring tasks

### 4. **Privacy Considerations**

- **Question**: Should we store event details or just references?
- **Recommendation**: Store minimal data, use event IDs for reference

### 5. **Sync Strategy**

- **Question**: Should calendar projects auto-update when calendar changes?
- **Recommendation**: One-time import initially, add sync in Phase 2

### 6. **Confidence Threshold**

- **Question**: What confidence level should auto-select suggestions?
- **Recommendation**: 70% for auto-select, 60% minimum to show

### 7. **Task Generation**

- **Question**: Should we create tasks from individual events?
- **Recommendation**: Yes, but only for events marked as project-related

### 8. **Analysis Frequency**

- **Question**: How often can users re-analyze?
- **Recommendation**: Once per day limit to prevent API abuse

## Success Metrics

1. **Adoption Rate**: % of users who run analysis after connecting calendar
2. **Acceptance Rate**: % of suggested projects that get created
3. **Accuracy**: User feedback on suggestion quality
4. **Time Saved**: Reduction in manual project creation time
5. **Engagement**: Increase in project/task creation post-analysis

## Timeline & Progress

### Week 1: Database & Backend (COMPLETED ✅)

- ✅ **Database migration created**: `20250129_calendar_intelligence_integration.sql`
  - Calendar analysis tables with RLS
  - Project suggestions storage
  - User preferences
- ✅ **Database types generated**: Updated via `pnpm gen:all`
- ✅ **CalendarAnalysisService created**: Full service implementation
  - AI-powered event analysis
  - Project suggestion generation
  - Preference management
- ✅ **API endpoints created**:
  - `/api/calendar/analyze` - Main analysis endpoint
  - `/api/calendar/analyze/suggestions` - Accept/reject suggestions
  - `/api/calendar/analyze/preferences` - User preferences

### Week 2: UI Components (In Progress)

- ✅ **CalendarAnalysisModal**: Welcome/consent modal
- ✅ **CalendarAnalysisResults**: Review and approval UI
- 🔄 **CalendarTab updates**: In progress
- ⏳ **Integration with OAuth flow**: Pending

### Week 3: Testing & Refinement

- ⏳ End-to-end testing
- ⏳ Edge case handling
- ⏳ Performance optimization

### Week 4: Staging Deployment

- ⏳ Deploy to staging environment
- ⏳ User acceptance testing
- ⏳ Bug fixes and refinements

### Week 5: Production

- ⏳ Production deployment
- ⏳ Monitor and iterate

## Technical Risks & Mitigations

1. **LLM Costs**: Use smart routing to cheaper models, cache analysis results
2. **Rate Limits**: Implement queuing, respect Google Calendar quotas
3. **Large Calendars**: Paginate events, limit analysis window
4. **Poor Suggestions**: Confidence scoring, user feedback loop for improvement

## Future Enhancements (Post-MVP)

1. **Continuous Sync**: Auto-update projects as calendar evolves
2. **Team Calendars**: Analyze shared/team calendars for collaboration
3. **Smart Scheduling**: Use patterns to suggest optimal task scheduling
4. **Calendar Templates**: Create calendar events from BuildOS projects
5. **Meeting Notes Integration**: Pull in meeting notes for richer context
