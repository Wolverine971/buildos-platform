<!-- docs/specs/BRIEF_CHAT_SPEC.md -->

# Brief Chat: Interactive Daily Brief with Agentic Chat

**Status:** Draft
**Author:** DJ + Claude
**Date:** 2026-02-12
**Scope:** Web App (`/apps/web/`)
**Execution Tracker:** `docs/specs/BRIEF_CHAT_EXECUTION_PLAN.md`

---

## 1. Design Principles

Two principles drive every decision in this spec:

### Burstiness

Users interact with BuildOS in sprints, not sessions. They arrive, need context, take action, and leave. The Brief Chat surface must support this pattern:

- **Arrive → Read → React → Leave** in under 3 minutes
- Input is frictionless — natural language, not forms
- Processing is immediate — the agent acts, the brief updates
- No navigation required between reading and acting

### Get Up to Speed Fast

Every piece of information competes for attention. The brief must answer: **"What do I need to do right now?"** — and the chat must let the user act on the answer without switching context.

- Information ordered by actionability, not category
- The most important thing is always visible first
- Progressive disclosure — headlines up front, details on demand
- Context and action happen on the same surface

---

## 2. What We're Building

A split-pane experience where the **Daily Brief** and an **Agentic Chat** sit side by side. The user reads their brief on the left and talks to it on the right. The agent knows the full brief content and can update tasks, projects, and goals in real time. As changes happen, the brief reflects them live.

```
┌──────────────────────────────────┬───────────────────────────────────┐
│          DAILY BRIEF             │          BRIEF CHAT               │
│                                  │                                   │
│  Feb 12, 2026                    │  System: Here's your brief for    │
│                                  │  today. 3 priority items, 2       │
│  Start Here                      │  overdue tasks. What would you    │
│  ─────────                       │  like to tackle?                  │
│  • Fix auth blocker — unblocks   │                                   │
│    3 other tasks                 │  User: That auth bug is fixed,    │
│                                  │  I pushed it last night.          │
│  Executive Summary               │                                   │
│  ─────────────────               │  Agent: ✓ Marked "Fix auth        │
│  8 tasks across 3 projects...    │  blocker" as complete. This       │
│                                  │  unblocks Integration testing,    │
│  ⚠️ Overdue (2)                  │  Deploy to staging, and API       │
│  ─────────────                   │  docs. Want me to schedule any    │
│  • ~Fix auth blocker~ ✓          │  of those for today?              │
│  • Review security audit (3d)    │                                   │
│                                  │  User: Schedule integration       │
│  Projects                        │  testing for this afternoon and   │
│  ────────                        │  delegate the security audit to   │
│  ▸ Project Alpha — 3 today       │  Sarah.                           │
│  ▸ Project Beta — on track       │                                   │
│  ▸ Q1 Planning — needs attn      │  Agent: ✓ Scheduled "Integration  │
│                                  │  testing" for today 2:00 PM       │
│  ✅ Recent Wins                   │  ✓ Assigned "Review security      │
│  ─────────────                   │  audit" to Sarah                  │
│  3 tasks completed yesterday     │                                   │
│                                  │  [Type a message...]              │
└──────────────────────────────────┴───────────────────────────────────┘
```

### What This Is Not

- Not a brief editor (the user doesn't manually edit brief text)
- Not a replacement for the existing briefs page (that remains for history/analytics)
- Not a general-purpose chat that happens to show a brief (the agent's persona and tools are brief-specific)

---

## 3. User Experience

### 3.1 Entry Points

#### Primary: Notification Deep Link

When a user receives a brief notification (email, SMS, push), the link drops them directly into Brief Chat for that date. No intermediate navigation.

```
https://app.buildos.com/briefs/chat?date=2026-02-12
```

#### Secondary: Dashboard Widget

The existing Daily Brief widget on the dashboard gets a "Read & Respond" button that opens Brief Chat.

#### Tertiary: Briefs Page

The existing `/briefs` page (single view mode) gets a "Chat about this brief" button that opens Brief Chat for the currently viewed brief.

#### Keyboard / Quick Access

The brain dump button in the nav could gain a dropdown or the brief chat could be accessible via a keyboard shortcut when a brief exists for today.

### 3.2 Layout

#### Desktop (≥1024px)

Split-pane, following the DocumentModal pattern (flex-based, fixed sidebar width):

```
┌──────────────────────────────────────────────────────────────────┐
│  Header: "Daily Brief — Feb 12, 2026"     [Collapse] [Close]    │
├────────────────────────────┬─────────────────────────────────────┤
│                            │                                     │
│  Brief Content (scroll)    │  Chat Interface                     │
│  Width: flex-1 (flexible)  │  Width: w-[420px] (fixed)           │
│  Min: 400px                │                                     │
│  Bg: bg-card               │  Bg: bg-background                  │
│                            │                                     │
│  [Rendered markdown with   │  [AgentMessageList]                 │
│   collapsible project      │                                     │
│   sections]                │  [AgentComposer]                    │
│                            │                                     │
└────────────────────────────┴─────────────────────────────────────┘
```

- Left pane: Brief content, rendered as styled markdown with Inkprint textures
- Right pane: Agentic chat with `context_type: 'daily_brief'`
- Divider: Subtle `border-r border-border` (no drag resize — matches existing patterns)
- Both panes scroll independently

#### Tablet (768px–1023px)

Same split-pane but with narrower chat sidebar (w-[340px]).

#### Mobile (<768px)

Tabbed view — user swipes or taps between Brief and Chat tabs:

```
┌─────────────────────────────────┐
│  [Brief]  [Chat]                │
├─────────────────────────────────┤
│                                 │
│  (Active tab content here)      │
│                                 │
│                                 │
│                                 │
│                                 │
│  [Composer always visible       │
│   when Chat tab is active]      │
│                                 │
└─────────────────────────────────┘
```

A floating badge on the Brief tab shows unread agent messages. A floating badge on the Chat tab shows "brief updated" when changes occur.

### 3.3 Brief Pane Behavior

The brief pane renders `executive_summary` from `ontology_daily_briefs` as styled markdown, with enhancements:

#### Interactive Elements

- **Task mentions** in the brief become tappable chips. Tapping a task shows a quick-action popover: Mark done, Snooze, Delegate, Open detail.
- **Project sections** are collapsible (default: expanded for projects with overdue/today items, collapsed for on-track projects).
- **Priority actions** at the top are rendered as a checklist. Checking one triggers the agent to mark it done.

#### Live Updates

When the agent modifies an entity mentioned in the brief (marks a task done, reschedules something, delegates), the brief pane updates to reflect the change:

- Completed tasks get strikethrough + ✓ badge
- Rescheduled tasks show new date
- Delegated tasks show assignee
- A subtle highlight animation draws attention to the changed element

This requires the brief pane to maintain a mapping between rendered elements and entity IDs (source `ontology_brief_entities` first; markdown links like `[Task Name](/projects/abc/tasks/xyz)` as fallback only).

#### Brief Generation State

If no brief exists for today when Brief Chat opens:

1. Show a "Generating your brief..." skeleton with progress indicator
2. Auto-generate the brief (using existing Railway worker pipeline)
3. Stream the brief content into the left pane as it completes
4. Once complete, the chat agent introduces itself with a summary

### 3.4 Chat Pane Behavior

The chat pane is a specialized instance of the existing AgentChatModal internals, adapted for the brief context.

#### Opening Message

When Brief Chat opens with an existing brief, the agent sends an automatic opening message:

> Here's your brief for today. You have **3 priority items** and **2 overdue tasks** across 3 projects. The biggest thing: fixing the auth blocker will unblock 3 other tasks. What would you like to tackle first?

This message is generated by the LLM using the brief content as context, not hardcoded. It should be short (2-4 sentences), actionable, and highlight the single most important thing.

#### Conversation Style

The agent in brief context should be:

- **Terse and action-oriented.** No long explanations unless asked.
- **Proactive with suggestions.** After completing an action, suggest the next logical step.
- **Brief-aware.** Reference specific items from the brief by name. "The auth blocker you mentioned" not "task ID xyz."
- **Batch-friendly.** Handle multiple instructions in one message: "Mark the auth bug done, reschedule the design review to Friday, and delete the old planning task."

#### Quick Actions (Above Composer)

A row of contextual quick-action chips above the composer for common burst actions:

```
[✓ Update tasks]  [📋 Triage overdue]  [📅 Plan my day]  [🧠 Brain dump]
```

- **Update tasks**: Agent asks "Which tasks have you made progress on?" and walks through them
- **Triage overdue**: Agent lists overdue tasks one by one for quick triage (done/snooze/delegate/drop)
- **Plan my day**: Agent suggests a time-blocked schedule based on today's tasks and calendar
- **Brain dump**: Switches to brain dump mode where user can capture new thoughts that get filed into projects

#### Operations Feedback

When the agent performs actions, the chat shows inline operation confirmations (using existing `operation` SSE event type):

```
  ✓ Marked "Fix auth blocker" as complete
  ✓ Scheduled "Integration testing" for today 2:00 PM
  ✓ Assigned "Review security audit" to Sarah
```

These are compact, scannable, and appear between message bubbles.

### 3.5 Session Behavior

- Each generated brief snapshot gets one Brief Chat session (keyed by `brief_id`)
- Reopening Brief Chat for the same `brief_id` resumes the conversation
- Regenerating a brief creates a new `brief_id`, which starts a fresh chat session
- Previously generated brief sessions remain available in history/background (no auto-archive on regenerate)
- The session persists in `chat_sessions` with `context_type: 'daily_brief'` and `entity_id` set to `ontology_daily_briefs.id`
- Previous days' brief chats are accessible from the briefs history page

---

## 4. Architecture

### 4.1 New Context Type: `daily_brief`

Add `'daily_brief'` to the `ChatContextType` union. This is distinct from the existing `'daily_brief_update'` (which is for configuring brief preferences).

**File: `/packages/shared-types/src/chat.types.ts`**

```typescript
export type ChatContextType =
	| 'global'
	| 'project'
	| 'calendar'
	| 'general'
	| 'project_create'
	| 'project_audit'
	| 'project_forecast'
	| 'daily_brief_update'
	| 'daily_brief' // NEW — interactive brief chat
	| 'ontology'
	| 'brain_dump';
```

### 4.2 Context Data Loading

When a `daily_brief` session is created or resumed, the context loader fetches the brief data and injects it into the system prompt.

**Data to load:**

```typescript
interface DailyBriefContext {
	// The brief itself
	briefId: string;
	briefDate: string;
	executiveSummary: string; // Full markdown content
	llmAnalysis: string | null; // AI insights
	priorityActions: string[]; // Top action items

	// Project briefs (for entity resolution)
	projectBriefs: Array<{
		projectId: string;
		projectName: string;
		briefContent: string;
		metadata: {
			todaysTaskCount: number;
			overdueTaskCount: number;
			blockedTaskCount?: number;
		};
	}>;

	// Entity index (for resolving natural language references)
	mentionedEntities: Array<{
		type: 'task' | 'project' | 'goal' | 'milestone' | 'risk';
		id: string;
		name: string;
		status: string;
		projectId?: string;
		projectName?: string;
	}>;
}
```

The `mentionedEntities` index is critical — it lets the agent resolve "the auth bug" to a specific task ID without making a search query first. Build it from `ontology_brief_entities` first (authoritative), then fall back to parsing markdown links for any missed entities, and enrich with current status from the database.

**Implementation location:** Add a `loadDailyBriefContext()` path in `/apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`.

### 4.3 System Prompt

The system prompt for `daily_brief` context needs to:

1. Establish the agent's role as a brief discussion partner
2. Inject the full brief content as reference
3. Provide the entity index for reference resolution
4. Instruct the agent on tone and behavior

```
You are the user's Daily Brief assistant for {briefDate}.

## Your Role
Help the user process their daily brief efficiently. They want to:
- Update task statuses (done, in progress, blocked)
- Delegate tasks to other people
- Reschedule or reprioritize work
- Ask questions about their projects
- Brain dump new information
- Plan their day

## Behavior
- Be terse and action-oriented. Short responses.
- After each action, suggest the next logical step.
- Handle batch instructions ("mark X done, reschedule Y, delete Z").
- Reference items by their names from the brief, not IDs.
- When the user references something ambiguously ("that task", "the first one"),
  resolve it from the brief context.
- Be more action-forward when the referenced entities are in the brief and unambiguous.
- For entities not mentioned in the brief, raise your confidence threshold:
  if there is any ambiguity about target identity, ask a concise confirmation question first.
- For delete/reassign/delegate changes, use best judgment and ask for confirmation when target or intent is not crystal clear.

## Today's Brief
{executiveSummary}

## AI Analysis
{llmAnalysis}

## Priority Actions
{priorityActions as bullet list}

## Entity Reference (for resolving user mentions)
{mentionedEntities as structured list with IDs}
```

**Prompt size consideration:** A full brief with analysis can be 3,000–5,000 tokens. The entity index adds another 500–1,500 tokens depending on project count. Total context injection: ~4,000–6,500 tokens. This is well within budget, especially with DeepSeek's large context window.

### 4.4 Tool Selection

The `daily_brief` context needs **full CRUD capabilities** — users will be marking tasks done, updating statuses, creating new tasks, delegating, rescheduling, etc.

**Tool groups for `daily_brief`:**

```typescript
const CONTEXT_TO_TOOL_GROUPS: Record<PlannerContextType, ToolContextScope[]> = {
	daily_brief: ['base', 'global', 'project'] // Full access
	// ...existing...
};
```

This gives the agent access to:

- All ontology read tools (list, search, get details)
- All ontology write tools (create, update, delete, link)
- Calendar tools (schedule, reschedule events)
- Utility tools (field info, relationships)
- Web search (for answering questions about tasks)

**Write guardrails for `daily_brief`:**

- Writes to entities already mentioned in the brief can proceed directly when target and intent are clear.
- For writes targeting entities not mentioned in the brief, require higher certainty:
  ask a brief clarification/confirmation whenever there is target ambiguity.
- For delete/reassign/delegate actions, prefer a quick confirmation when there is any ambiguity or potential for unintended impact.

### 4.5 Live Brief Updates

When the agent modifies an entity that appears in the brief, the UI needs to reflect the change. Two approaches:

#### Approach A: Client-Side Reconciliation (Recommended)

1. On Brief Chat mount, load mentioned entities from `ontology_brief_entities` for `brief_id` and map them to rendered elements
2. Use markdown link parsing only as a fallback to recover unmapped entities
3. Build a `Map<entityId, { element: HTMLElement, currentStatus: string }>` for rendered entities
4. On successful `operation` SSE events with `entity_id`, check if the affected entity exists in the map
5. If yes, update the rendered element inline (strikethrough, badge, date change, etc.)
6. Apply a brief highlight animation (CSS transition) to draw attention
7. Keep `tool_result` parsing as a compatibility fallback when operation payload lacks `entity_id`

**Advantages:** Instant feedback, no server round-trip, works offline.
**Disadvantage:** Brief content diverges from database (cosmetic only, fine for session duration).

#### Approach B: Brief Refetch

After each mutation, refetch the brief from the database and re-render.

**Advantages:** Always consistent with database.
**Disadvantage:** Slow, causes layout shift, disrupts reading position.

**Decision: Use Approach A (client-side reconciliation) for immediate feedback.** The brief is a snapshot of the morning — small divergences during the session are fine. If the user wants a fully regenerated brief, they can trigger regeneration.

### 4.6 Session Lifecycle

```
User opens Brief Chat for Feb 12
  │
  ├─ Check: Does ontology_daily_brief exist for Feb 12?
  │
  ├─ NO → Trigger brief generation, show "Generating your brief..."
  │       once complete, get new brief_id
  │
  └─ YES (or newly generated) → Check chat_session:
       context_type='daily_brief' and entity_id={brief_id}?
       │
       ├─ YES → Resume session (load message history)
       │
       └─ NO → Create new session bound to this brief_id,
               load brief context, send opening message
```

### 4.7 Data Flow Diagram

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│ Brief Pane   │     │ Chat Pane     │     │ Server           │
│ (left)       │     │ (right)       │     │                  │
└──────┬───────┘     └──────┬────────┘     └────────┬─────────┘
       │                    │                       │
       │  mount             │  mount                │
       │ ◄──────────────────┤                       │
       │  load ontology_    │                       │
       │  brief_entities    │                       │
       │  markdown fallback │                       │
       │  build entity map  │                       │
       │                    │                       │
       │                    │  POST /api/agent/v2/stream
       │                    │  context_type: daily_brief
       │                    │  entity_id: brief_id  │
       │                    │ ─────────────────────►│
       │                    │                       │
       │                    │  SSE: session          │
       │                    │  SSE: context_usage    │
       │                    │  SSE: text (opening)   │
       │                    │ ◄─────────────────────│
       │                    │                       │
       │                    │  User: "mark auth      │
       │                    │   bug as done"         │
       │                    │ ─────────────────────►│
       │                    │                       │
       │                    │  SSE: tool_call        │
       │                    │  (update_onto_task)    │
       │                    │ ◄─────────────────────│
       │                    │                       │
       │  entity update     │  SSE: operation        │
       │  event received    │  SSE: tool_result      │
       │ ◄──────────────────┤  SSE: text             │
       │                    │ ◄─────────────────────│
       │  update rendered   │                       │
       │  element (strike-  │                       │
       │  through + ✓)      │                       │
       │                    │                       │
```

### 4.8 Multi-User Brief Ownership (Collaboration-Safe)

With project collaboration enabled, multiple users can have briefs that reference the same project. Brief data must stay user-scoped:

- `ontology_daily_briefs` is user-owned (`user_id`).
- `ontology_project_briefs` is scoped through `daily_brief_id`; expected uniqueness is one row per (`daily_brief_id`, `project_id`).
- Reads of project briefs must always be filtered by current user via the joined daily brief owner (`ontology_daily_briefs.user_id = auth user`), not just project membership.
- This keeps each collaborator's generated interpretation private while still allowing shared underlying project data.

---

## 5. Component Architecture

### 5.1 New Components

```
/apps/web/src/lib/components/brief-chat/
├── BriefChatView.svelte          # Main split-pane container
├── BriefPane.svelte              # Left pane — brief content rendering
├── BriefPaneHeader.svelte        # Brief date, stats, actions
├── BriefEntityChip.svelte        # Interactive entity mention in brief
├── BriefQuickActions.svelte      # Quick action chips above composer
└── BriefChatOpener.svelte        # Opening message generator
```

### 5.2 BriefChatView.svelte (Main Container)

```svelte
<script lang="ts">
	import type { DailyBrief } from '$lib/types/daily-brief';

	interface Props {
		briefDate: string;
		brief: DailyBrief | null;
		onClose: () => void;
	}

	let { briefDate, brief, onClose }: Props = $props();

	let activeTab = $state<'brief' | 'chat'>('brief');
	let entityMap = $state(new Map());
	let chatSessionId = $state<string | null>(null);
</script>

<!-- Desktop: side-by-side -->
<div class="hidden md:flex h-full">
	<div class="flex-1 min-w-[400px] border-r border-border overflow-y-auto">
		<BriefPane {brief} {entityMap} />
	</div>
	<div class="w-[420px] flex-shrink-0 flex flex-col">
		<!-- Chat interface (reuses AgentMessageList + AgentComposer internals) -->
	</div>
</div>

<!-- Mobile: tabbed -->
<div class="md:hidden flex flex-col h-full">
	<div class="flex border-b border-border">
		<button class:active={activeTab === 'brief'}>Brief</button>
		<button class:active={activeTab === 'chat'}>Chat</button>
	</div>
	<div class="flex-1 overflow-y-auto">
		{#if activeTab === 'brief'}
			<BriefPane {brief} {entityMap} />
		{:else}
			<!-- Chat interface -->
		{/if}
	</div>
</div>
```

### 5.3 Hosting Options

The BriefChatView can be hosted in two ways:

#### Option A: Dedicated Route (Recommended)

```
/briefs/chat?date=2026-02-12
```

A full-page route that loads the brief and renders the split-pane. This is the cleanest option for deep links from notifications and provides the most screen real estate.

The existing `/briefs` page remains untouched for history and analytics.

#### Option B: Modal

A new `xl`-sized modal that overlays the current page. This follows the existing AgentChatModal pattern but may feel cramped for the split-pane layout.

**Decision: Use Option A (dedicated route) as the primary surface, with Option B as a secondary "quick peek" from the dashboard widget.**

### 5.4 Route Structure

```
/apps/web/src/routes/briefs/chat/
├── +page.svelte          # BriefChatView wrapper
├── +page.ts              # Load brief data for the date param
└── +page.server.ts       # Server-side brief fetching (optional)
```

**`+page.ts` loader:**

```typescript
export const load: PageLoad = async ({ url, parent }) => {
	const { supabase, session } = await parent();
	const dateParam = url.searchParams.get('date') || getTodayInUserTimezone();

	// Fetch brief for date
	const { data: brief } = await supabase
		.from('ontology_daily_briefs')
		.select('*, ontology_project_briefs(*)')
		.eq('user_id', session.user.id)
		.eq('brief_date', dateParam)
		.maybeSingle();

	// Check for existing chat session
	const { data: chatSession } = brief?.id
		? await supabase
				.from('chat_sessions')
				.select('id')
				.eq('user_id', session.user.id)
				.eq('context_type', 'daily_brief')
				.eq('entity_id', brief.id)
				.eq('status', 'active')
				.maybeSingle()
		: { data: null };

	return {
		briefDate: dateParam,
		brief,
		existingSessionId: chatSession?.id ?? null
	};
};
```

---

## 6. Implementation Phases

### Phase 1: Foundation (Core Brief Chat)

**Goal:** Split-pane with brief on left, working agentic chat on right. Agent has brief context and can perform basic actions.

**Changes:**

1. **Add `daily_brief` context type (V2 path only)**
    - `/packages/shared-types/src/chat.types.ts` — add to union
    - `/apps/web/src/lib/components/agent/agent-chat.constants.ts` — add descriptor and badge
    - `/apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts` — add tool groups (full workspace write-capable)
    - `/apps/web/src/lib/services/agentic-chat-v2/prompt-builder.ts` — add context normalization/scope hint
    - `/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts` — add daily brief behavior + confirmation guardrails

2. **Build context loader**
    - Load brief data (executive_summary, llm_analysis, priority_actions)
    - Load project briefs
    - Build entity index from `ontology_brief_entities` (markdown links only as fallback)
    - Inject into system prompt

3. **Create route and components**
    - `/apps/web/src/routes/briefs/chat/+page.svelte` — main page
    - `/apps/web/src/routes/briefs/chat/+page.ts` — data loader
    - `/apps/web/src/lib/components/brief-chat/BriefChatView.svelte` — split-pane container
    - `/apps/web/src/lib/components/brief-chat/BriefPane.svelte` — brief renderer

4. **Wire up chat**
    - Reuse AgentMessageList and AgentComposer components
    - Connect to `/api/agent/v2/stream` with `context_type: 'daily_brief'`
    - Handle session creation/resumption

5. **Opening message**
    - On first session creation, agent sends a brief summary with the top actionable item

**Entry point:** Add "Chat about this brief" button on `/briefs` page (single view).

### Phase 2: Live Updates + Quick Actions

**Goal:** Brief pane updates in real time as agent makes changes. Quick action chips for common workflows.

**Changes:**

1. **Entity parsing and mapping**
    - Load entity references from `ontology_brief_entities` for `brief_id`
    - Parse markdown links only as fallback
    - Build entity ID → DOM element map
    - Listen for `operation` events with `entity_id` (fallback: `tool_result`)

2. **Client-side brief reconciliation**
    - Strikethrough completed tasks
    - Update dates for rescheduled tasks
    - Show assignee for delegated tasks
    - Highlight animation on changed elements

3. **Operation event wiring in V2 stream**
    - Forward tool `streamEvents` of type `operation` as SSE `operation` events
    - Ensure `operation.entity_id` is present for write operations where possible
    - Keep `tool_result` payload parsing as fallback

4. **Quick action chips**
    - Build `BriefQuickActions.svelte` component
    - "Update tasks" — structured walkthrough of today's tasks
    - "Triage overdue" — one-by-one overdue task review
    - "Plan my day" — time-blocking suggestion
    - "Brain dump" — free-form capture mode

5. **Interactive entity chips in brief**
    - Task names become tappable
    - Popover with quick actions (done, snooze, delegate, open)

### Phase 3: Entry Points + Polish

**Goal:** Brief Chat is accessible from all natural entry points. Mobile experience is polished.

**Changes:**

1. **Deep links from notifications**
    - Email brief notification links to `/briefs/chat?date=YYYY-MM-DD`
    - SMS brief notification links to same
    - Update notification templates in worker

2. **Dashboard widget integration**
    - "Read & Respond" button on Daily Brief widget → opens Brief Chat
    - Or opens a modal version for quick interactions

3. **Mobile optimization**
    - Tabbed view with smooth transitions
    - Unread badges on tabs
    - Composer stays fixed at bottom on Chat tab
    - Swipe gestures between tabs

4. **Brief generation integration**
    - If no brief exists, show generation progress inline
    - Auto-trigger generation and stream content into brief pane
    - Once complete, initialize chat with opening message

5. **Session management polish**
    - Seamless session resumption across page reloads
    - Date navigation within Brief Chat (prev/next day)
    - Previous days' brief chats accessible from history

### Phase 4: Beyond the Brief (Stretch)

**Goal:** Apply the same pattern to other surfaces.

- **Project Sprint View**: Same split-pane, but project snapshot on left, project-scoped chat on right
- **Dashboard Triage**: Compact triage list with inline chat for quick updates
- **Brain Dump + Triage**: After brain dump processing, show extracted items with chat for refinement

---

## 7. Edge Cases & Considerations

### Brief Doesn't Exist Yet

User opens Brief Chat before their brief has been generated. Flow:

1. Show "Generating your brief..." with the existing progress tracking UI
2. Trigger generation via Railway worker (or local SSE fallback)
3. Stream brief content into left pane as it completes
4. Initialize chat once brief is ready
5. Agent's opening message references the just-generated brief

### Brief Is Stale

User opens Brief Chat in the afternoon — tasks may have been completed since the brief was generated that morning. The brief content is a morning snapshot, not a live view.

**Approach:** The agent's system prompt includes a note: "This brief was generated at {time}. Some items may have been updated since then. When the user references a task, fetch its current status before acting." The entity index in the system prompt includes current status at session creation time.

### Multiple Devices

User reads brief on phone, then opens Brief Chat on desktop. The session should resume seamlessly since it's stored in `chat_sessions`.

### Multiple Collaborators on the Same Project

Different collaborators can receive different briefs for the same project. Brief Chat must only load the current user's brief/project-brief records (user-scoped), even when project access is shared.

### Empty Brief

User has no projects or tasks. The brief is essentially empty.

**Approach:** The agent's opening message pivots to onboarding: "Looks like you're starting fresh! Want to brain dump some thoughts about what you're working on? I'll help organize them into projects and tasks."

### Very Long Briefs

Users with 10+ active projects may have briefs exceeding 5,000 words.

**Approach:** The brief pane uses collapsible project sections (expanded for projects with overdue/today items, collapsed for on-track projects). The system prompt can truncate project briefs for low-priority projects, keeping only summaries.

### Token Budget

Brief content in the system prompt: ~4,000–6,500 tokens. Conversation history adds more over time. With DeepSeek's 64k context, this is comfortable. Monitor via the existing `context_usage` SSE event and compress history if needed (existing compression infrastructure).

### Ontology-Only Briefs

Brief Chat is ontology-only for this implementation. Load from `ontology_daily_briefs` + `ontology_project_briefs` and do not support legacy `daily_briefs` in this flow.

---

## 8. Success Metrics

- **Session duration:** Brief Chat sessions should average 1–3 minutes (bursty, not lingering)
- **Actions per session:** Target 3+ entity mutations per session (completing tasks, rescheduling, delegating)
- **Notification → Brief Chat conversion:** % of brief notification recipients who open Brief Chat
- **Return rate:** % of users who use Brief Chat 3+ days per week
- **Task completion velocity:** Do users complete more tasks on days they use Brief Chat?

---

## 9. File Change Summary

### New Files

| File                                                               | Purpose                    |
| ------------------------------------------------------------------ | -------------------------- |
| `/apps/web/src/routes/briefs/chat/+page.svelte`                    | Brief Chat page            |
| `/apps/web/src/routes/briefs/chat/+page.ts`                        | Brief data loader          |
| `/apps/web/src/lib/components/brief-chat/BriefChatView.svelte`     | Split-pane container       |
| `/apps/web/src/lib/components/brief-chat/BriefPane.svelte`         | Brief content renderer     |
| `/apps/web/src/lib/components/brief-chat/BriefPaneHeader.svelte`   | Brief header with stats    |
| `/apps/web/src/lib/components/brief-chat/BriefQuickActions.svelte` | Quick action chips         |
| `/apps/web/src/lib/components/brief-chat/BriefEntityChip.svelte`   | Interactive entity mention |

### Modified Files

| File                                                                  | Change                                  |
| --------------------------------------------------------------------- | --------------------------------------- |
| `/packages/shared-types/src/chat.types.ts`                            | Add `'daily_brief'` to union            |
| `/apps/web/src/lib/components/agent/agent-chat.constants.ts`          | Add descriptor + badge                  |
| `/apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`  | Add tool groups                         |
| `/apps/web/src/lib/services/agentic-chat-v2/prompt-builder.ts`        | Add scope hint                          |
| `/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts` | Add brief behavior + confirmations      |
| `/apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`        | Add brief context loading               |
| `/apps/web/src/routes/api/agent/v2/stream/+server.ts`                 | Emit/forward `operation` events         |
| `/apps/web/src/routes/briefs/+page.svelte`                            | Add "Chat about this brief" button      |
| `/apps/web/src/routes/api/onto/projects/[id]/briefs/+server.ts`       | Enforce user-scoped project-brief reads |
| `/apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte`    | Add "Read & Respond" to widget          |

### Database Check Before Build

- Verify a unique constraint/index exists for `ontology_project_briefs (daily_brief_id, project_id)` since upsert logic depends on it.
- Verify daily brief generation semantics (single row per date vs snapshot rows) match the product decision for "Generate New Brief creates a new `brief_id`".
- `chat_sessions` already supports `context_type` strings and `entity_id` references.

---

## 10. Codex Understanding Comment

<!--
Codex understanding:
This spec is trying to turn the daily brief from a static report into an action console. The user should be able to open one surface, instantly see what matters most today, and execute updates through natural language without jumping between pages.

The core enabling shift is: the brief and chat are tightly coupled. The chat is brief-aware (uses brief context + entity references), and chat actions feed back into the brief UI immediately so the left pane stays aligned with what was just done. If implemented well, this should reduce daily planning friction, increase task/project updates per short session, and make brief notifications lead directly to execution instead of passive reading.
-->
