# 🌐 Build OS: Master Context File

This document serves as the **core context engine** for the Build OS which helps users organize their ideas. It is a framework where brain dumps are organized into projects with tasks associated. It enables LLMs to help users manage projects by gathering context to maintain alignment, organization, and congruence.

---

## 🎯 Core Objectives of the Build OS

1. **Stay Organized**
   Track all tasks, routines, and projects across multiple domains with intelligent parsing of brain dumps.

2. **Stay Aligned**
   Ensure that every task, post, and decision ladders up to defined projects and strategic objectives.

3. **Stay Congruent**
   Maintain a unified voice, message, and identity across all public-facing platforms and channels.

---

## Benefits of Build OS

- Off load mental load
- Organize chaotic thoughts
- Don't forget things
- **Automatic task scheduling to your calendar**
- **Time-aware project management**
- **Smart scheduling based on your work preferences**

## 🧠 System Architecture Overview

### 🔧 Centralized Context Engine

The Build OS is built around a centralized, queryable context system using Supabase + SvelteKit. It integrates LLMs to:

- Parse raw brain dumps and notes into structured projects, tasks, and unstructured notes
- **Generate rich markdown context** tailored to each project's unique needs
- Understand personal history, working style, and current projects
- Generate actionable tasks (both one_off and recurring) tied to projects
- **Generate intelligent project phases** that organize tasks into logical execution stages
- Capture unrefined thoughts and information as notes for future processing
- Provide task generation and daily briefing services
- Maintain consistency and alignment across projects
- **Integrate with Google Calendar for automatic task scheduling and time management** 📅

---

### 🏁 End State Vision

1. **Brain Dump Intelligence**: Build OS ingests raw notes and brain dumps, automatically parsing them into structured projects, actionable tasks, and unstructured notes
2. **Rich Markdown Context**: Each project gets comprehensive markdown context that evolves over time, capturing strategy, status, challenges, and insights
3. **Project-Centric Organization**: Projects (tactical initiatives) serve as the primary organizing principle with rich context and actionable tasks
4. **Smart Task Management**: Tasks can be one_off or recurring, linked to projects, with dependency tracking
5. **AI-Powered Phase Generation**: Projects automatically organize into sequential phases with intelligent task distribution
6. **Information Parking Lot**: Notes capture unrefined thoughts, research, and insights that aren't yet ready for context or tasks
7. **Daily Intelligence**: Users receive personalized daily briefs covering project status, priority tasks, and strategic recommendations
8. **Continuous Optimization**: LLMs constantly identify next steps, find bottlenecks, and suggest momentum-building actions
9. **Unified Command Center**: Build OS becomes the single source of truth for staying organized and aligned across all projects
10. **Intelligent Calendar Scheduling**: Tasks automatically find optimal time slots in your calendar based on preferences, priorities, and available time 📅

---

### 🧩 Personal History Context Buckets

Build OS structures your personal history into key knowledge modules:

| Module                  | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| `Who I Am`              | Background, identity, values, personality          |
| `What I'm Building`     | Active projects, missions                          |
| `What I Believe`        | Core philosophies, worldviews, principles          |
| `How I Work`            | Habits, workflows, tools, schedules, preferences   |
| `What I Need Help With` | Ongoing blockers, collaboration needs, gaps        |
| `My Projects`           | Current tactical initiatives and ventures          |
| `My Schedule`           | Calendar integration, work hours, time preferences |

---

## ✨ Core System Features

### 🧠 Brain Dump → Structured Intelligence

**Input**: Raw thoughts, notes, voice memos, scattered ideas
**Output**: Structured projects with rich markdown context, actionable tasks, organized phases, and captured notes

The system intelligently classifies and structures unorganized input into:

- **Projects**: Tactical initiatives with phases, deliverables, and timelines
- **Markdown Context**: Rich text context that captures project strategy, status, and insights
- **Phases**: Sequential project stages that organize tasks logically
- **Tasks**: Atomic actions (one_off or recurring) tied to projects/phases
- **Notes**: Unrefined thoughts, research, and insights for future processing
- **Calendar Events**: Tasks automatically scheduled based on availability and preferences 📅

### 📅 Google Calendar Integration

**Seamless Time Management**:
Build OS deeply integrates with Google Calendar to transform task management into scheduled execution:

**Core Features**:

- **OAuth 2.0 Authentication**: Secure connection with automatic token refresh
- **Two-way Sync**: Tasks create calendar events, calendar changes update task status
- **Smart Scheduling**: AI finds optimal time slots based on your preferences
- **Work Hours Respect**: Only schedules during your defined working hours
- **Holiday Awareness**: Automatically avoids scheduling on holidays
- **Time Zone Intelligence**: Handles multiple time zones seamlessly

**Calendar Preferences**:

- Define work start/end times
- Set working days of the week
- Configure task duration defaults (min/max/default)
- Enable morning preference for important tasks
- Set holiday country code for automatic exclusion
- Choose your primary time zone

**Scheduling Intelligence**:

- Analyzes calendar free/busy times
- Suggests optimal slots for deep work
- Respects task dependencies when scheduling
- Groups related tasks in time blocks
- Handles recurring task patterns
- Provides 10+ available slot options

### 🎯 Project Context Generation

**Military-Inspired Framework**:
The system uses a 5-lens analysis framework (inspired by military planning) to generate comprehensive project context:

1. **SITUATION** - Current reality, problems, opportunities, constraints
2. **MISSION** - Goals, success criteria, value proposition, outcomes
3. **EXECUTION** - Approach, strategy, phases, key decisions
4. **OPERATIONS** - Resources, time, tools, day-to-day requirements
5. **COORDINATION** - Communication, stakeholders, feedback, tracking

**Context Generation Process**:

- When a new project is created from a brain dump, the LLM analyzes the content
- Generates rich markdown context with relevant sections for that project
- Context is stored as markdown text with ## headers for different aspects
- Context evolves over time as new information is added through brain dumps
- **Calendar-aware insights**: Include time management and scheduling considerations

**Example Markdown Context Sections**:

- Software Project: `## Technical Architecture`, `## Deployment Strategy`, `## Sprint Planning`
- Creative Project: `## Artistic Vision`, `## Content Calendar`, `## Audience Strategy`
- Business Project: `## Revenue Model`, `## Market Analysis`, `## Growth Strategy`
- Personal Project: `## Success Metrics`, `## Habit Formation`, `## Progress Tracking`

### 🎯 Project Phase Management

**AI-Powered Phase Generation**:

- Analyzes project context, tasks, and notes to create 2-8 logical phases
- Respects task dependencies when assigning tasks to phases
- Handles flexible project timelines (can work with partial or missing dates)
- Separates recurring tasks that span multiple phases
- Creates backlog for unassigned tasks
- **Calendar Integration**: Suggests phase dates based on calendar availability

**Phase Features**:

- **Kanban View**: Card-based visualization of phases with task lists
- **Timeline View**: Gantt-style visualization with progress tracking
- **Progress Tracking**: Real-time completion percentage per phase
- **Status Indicators**: Upcoming, Active, or Completed phases
- **Date Management**: Inline editing of project start/end dates
- **Calendar Sync**: Phase milestones can be added to calendar

### 📝 Information Hierarchy

**Context vs. Notes Distinction:**

- **Context** = Rich markdown content that defines what a project IS (strategy, goals, status, approach)
- **Notes** = Semi-structured information capture that represents what you're THINKING about related to that project

**Notes serve as:**

- A parking lot for incomplete thoughts and ideas
- Storage for research findings and external information
- Capture of insights and observations from brain dumps
- Repository for information that isn't yet actionable or contextual
- **Time-sensitive reminders** that can be converted to scheduled tasks

### 📊 Daily Brief Generator

Each morning or on-demand, LLMs generate personalized intelligence reports:

- **Project Status**: Active initiatives, bottlenecks, critical path items
- **Phase Progress**: Current phase status and upcoming phase transitions
- **Priority Matrix**: Today's high-impact tasks across all projects
- **Strategic Recommendations**: Alignment checks, optimization suggestions
- **Dependency Alerts**: Blocked tasks, waiting-on items, timeline risks
- **Note Processing Opportunities**: Unprocessed notes ready for conversion to tasks/context
- **Today's Calendar**: Tasks scheduled for today with time blocks
- **Available Time Slots**: Open windows for additional work
- **Upcoming Deadlines**: Tasks due within your planning horizon

### 🎯 Smart Task Architecture

Tasks intelligently connect to the tactical layer:

- **one_off Tasks**: One-time actions with clear completion criteria
- **Recurring Tasks**: Habit-building actions with flexible scheduling
- **Phase Assignment**: Tasks organized into project phases with suggested start dates
- **Project Linking**: Tasks directly support specific projects
- **Dependency Tracking**: Complex workflows with prerequisite mapping
- **Calendar Events**: Tasks automatically create calendar events when scheduled
- **Duration Estimates**: Each task includes time estimates for better scheduling
- **Time Preferences**: Tasks can specify preferred time of day (morning/afternoon/evening)

---

## 🧬 Build OS: Data Models Reference

### 📁 `projects` Table

```sql
CREATE TABLE projects (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    name TEXT,
    slug TEXT UNIQUE,
    description TEXT,
    context TEXT, -- Rich markdown context for the project, loss less project compression
 executive_summary TEXT,
    status TEXT CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    start_date DATE,
    end_date DATE,
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Example Project Context Markdown**:

```markdown
## Primary Objective

Build a meditation app for busy professionals to help reduce stress and improve focus during work hours.

## Current Status

**Phase**: MVP development
**Progress**: 60% complete
**Next Milestone**: Beta release by end of month

## Target Audience

- Tech workers experiencing burnout
- Remote workers struggling with work-life balance
- Professionals seeking quick stress relief

## Success Metrics

- 1000 daily active users within 6 months
- 80% user retention after first week
- Average session length of 10+ minutes

## Key Challenges

### Technical Challenges

- Audio streaming performance on mobile devices
- Offline mode for guided meditations
- Cross-platform synchronization

### Business Challenges

- User acquisition in competitive wellness market
- Monetization without disrupting user experience

## Technology Stack

- **Frontend**: React Native for cross-platform mobile
- **Backend**: Supabase for database and authentication
- **AI Integration**: OpenAI API for personalized recommendations
- **Audio**: Custom streaming solution with offline caching

## Next Actions

1. Complete user testing sessions with 20 beta users
2. Implement feedback on meditation timer UI
3. Integrate payment processing for premium features
4. Prepare app store submissions
```

### 📅 `phases` Table

```sql
CREATE TABLE phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    "order" INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 🔗 `phase_tasks` Table

```sql
CREATE TABLE phase_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_id UUID REFERENCES phases(id) ON DELETE CASCADE NOT NULL,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
    suggested_start_date DATE,
    assignment_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(phase_id, task_id)
);
```

### ✅ `tasks` Table

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    title TEXT,
    description TEXT,
    details TEXT, -- task-specific context and details
    status TEXT CHECK (status IN ('backlog', 'in_progress', 'done', 'blocked')),
    priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
    task_type TEXT CHECK (task_type IN ('one_off', 'recurring')),
    deleted_at TIMESTAMP NULL, -- soft delete timestamp

    -- Linking to projects
    project_id UUID REFERENCES projects(id),

    -- Task hierarchy and dependencies
    parent_task_id UUID REFERENCES tasks(id),
    dependencies UUID[], -- array of task IDs this depends on

    -- Scheduling
    start_date DATE,
    duration_minutes INTEGER DEFAULT 60, -- estimated duration
    preferred_time_of_day TEXT CHECK (preferred_time_of_day IN ('morning', 'afternoon', 'evening', 'any')),
    recurrence_pattern TEXT, -- e.g., 'daily', 'weekly', 'monthly'
    recurrence_ends DATE,

    -- Metadata
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 📝 `notes` Table

```sql
CREATE TABLE notes (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    title TEXT,
    content TEXT, -- raw unrefined information and thoughts
    category TEXT, -- e.g., 'insight', 'research', 'idea', 'observation', 'reference', 'question'
    tags TEXT[],

    -- Time sensitivity
    reminder_date TIMESTAMP,
    convert_to_task_by DATE,

    -- Optional project relationship
    project_id UUID REFERENCES projects(id),

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 📅 Calendar Integration Tables

```sql
-- User's Google Calendar OAuth tokens
CREATE TABLE user_calendar_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expiry_date BIGINT, -- Unix timestamp in milliseconds
    token_type TEXT DEFAULT 'Bearer',
    scope TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User's calendar scheduling preferences
CREATE TABLE user_calendar_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    work_start_time TIME DEFAULT '09:00',
    work_end_time TIME DEFAULT '17:00',
    working_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Sunday, 6=Saturday
    default_task_duration_minutes INTEGER DEFAULT 60,
    min_task_duration_minutes INTEGER DEFAULT 30,
    max_task_duration_minutes INTEGER DEFAULT 240,
    exclude_holidays BOOLEAN DEFAULT TRUE,
    holiday_country_code TEXT DEFAULT 'US',
    timezone TEXT DEFAULT 'America/New_York',
    prefer_morning_for_important_tasks BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Track task-calendar event relationships
CREATE TABLE task_calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    calendar_event_id TEXT NOT NULL,
    calendar_id TEXT DEFAULT 'primary',
    recurrence_master_id UUID REFERENCES task_calendar_events(id),
    recurrence_instance_date TIMESTAMP,
    is_master_event BOOLEAN DEFAULT FALSE,
    event_link TEXT,
    event_start TIMESTAMP,
    event_end TIMESTAMP,
    event_title TEXT,
    last_synced_at TIMESTAMP,
    sync_status TEXT CHECK (sync_status IN ('synced', 'pending', 'error')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(task_id, calendar_event_id)
);
```

---

## 🔧 Key System Functions

### 📊 Daily Brief Generation

```sql
-- Built-in function for generating personalized daily briefs
SELECT get_daily_brief(user_id, horizon_days);
```

### 🎯 Phase Generation

```typescript
// AI-powered phase generation for projects
await PhaseService.generatePhases(projectId);
```

### 🧠 Project Context Generation

```typescript
// Generate rich markdown context for new project
await BrainDumpProcessor.generateProjectContext(projectId, projectName, brainDump, userId);
```

### 📅 Calendar Integration Tools

```typescript
// Calendar service tools available to LLMs
const calendarTools = {
	get_calendar_events: 'Retrieve events from Google Calendar',
	find_available_slots: 'Find open time slots for scheduling',
	schedule_task: 'Create calendar event for a task',
	get_upcoming_tasks: 'Get tasks that need scheduling'
};

// Example usage in task scheduling
await CalendarService.executeToolCall(userId, {
	tool: 'find_available_slots',
	arguments: {
		timeMin: '2024-01-15T00:00:00Z',
		timeMax: '2024-01-22T00:00:00Z',
		duration_minutes: 90,
		preferred_hours: [9, 10, 11] // Morning preference
	}
});
```

---

## 🤖 LLM Usage Instructions

When processing Build OS data:

### Information Hierarchy

- **Projects** → Tactical execution context with rich markdown content
- **Project Context** → Markdown sections that capture strategy, status, challenges, and approach
- **Phases** → Sequential project stages organizing tasks logically
- **Tasks** → Atomic actionable items linked to projects/phases
- **Notes** → Unrefined thoughts and information for future processing
- **Calendar Events** → Scheduled execution blocks for tasks

### Project Context Generation Rules

When generating context for a new project:

1. Analyze the brain dump through the 5 lenses (Situation, Mission, Execution, Operations, Coordination)
2. Create relevant markdown sections (## headers) that capture the most important aspects
3. Focus on actionable, specific information rather than generic content
4. Adapt sections to project type (software, creative, business, personal, etc.)
5. **Include time-related insights**: Consider scheduling, deadlines, and time management
6. Use rich markdown formatting with lists, emphasis, and structure

### Context Evolution and Merging

When updating existing project context:

- **Preserve existing valuable content**: Don't overwrite good information
- **Merge intelligently**: Add new insights to existing sections or create new sections
- **Maintain markdown structure**: Keep clean ## headers and formatting
- **Build cumulative knowledge**: Enhance rather than replace
- **Time-stamp updates**: Note when new information was added

**Merge Strategies**:

- **append_section**: Add new subsection to existing content
- **update_inline**: Update specific parts while preserving structure
- **replace_section**: Replace a section while keeping others
- **prepend**: Add new content at the beginning

### Phase Generation Rules

When generating phases for a project:

1. Create 2-8 sequential phases based on project complexity
2. Use project context content for guidance (look for timeline and milestone information)
3. Respect task dependencies (dependent tasks in same or later phase)
4. Handle flexible dates intelligently
5. Assign one_off tasks to appropriate phases
6. Keep recurring tasks separate (they span multiple phases)
7. Create backlog for unclear or unassigned tasks
8. **Consider calendar availability**: Suggest realistic phase durations based on user's schedule

### Brain Dump Processing Classification

When parsing brain dumps, classify information into:

- **New Project + Context**: Multi-faceted initiatives requiring rich markdown context
- **Context Updates**: Strategic insights about existing projects to merge into existing context
- **Tasks**: Actionable items with clear completion criteria (include duration estimates)
- **Notes**: Unrefined thoughts, research, insights, or incomplete ideas
- **Phase Guidance**: Timeline or stage information for project execution
- **Scheduling Preferences**: Time-related constraints or preferences

**Project vs Note Decision**:

- **Project**: Big scope, multiple tasks, clear end goal, sustained effort
- **Note**: Single piece of information, one-off thought, no associated tasks

### Calendar-Aware Task Generation

When creating tasks from brain dumps:

1. **Estimate Duration**: Provide realistic time estimates (default 60 min)
2. **Set Time Preferences**: Morning for deep work, afternoon for meetings
3. **Respect Dependencies**: Ensure prerequisite tasks are scheduled first
4. **Buffer Time**: Add buffers between dependent tasks
5. **Recurring Patterns**: Identify habits and set appropriate recurrence

### Daily Brief Generation

When generating briefs, utilize project context and calendar data:

- Extract relevant insights from each project's markdown context
- Look for status updates, challenges, and next actions in context
- Highlight urgent items and deadlines mentioned in context
- Synthesize across projects for strategic insights
- **Include today's schedule**: Show tasks already on calendar
- **Suggest scheduling**: Highlight unscheduled high-priority tasks
- **Time analysis**: Show how time is allocated across projects

### Output Standards

- Always return Markdown-compatible structured output
- Use slug identifiers for consistent project mapping
- Include priority and dependency information for all tasks
- Provide phase assignments with reasoning for tasks
- Maintain voice consistency across all generated content
- Clearly distinguish between context, tasks, phases, and notes in parsing output
- When updating context, preserve existing sections and add new ones thoughtfully
- **Include scheduling metadata**: Duration estimates, time preferences, calendar suggestions

---

## 💡 Content Classification Keywords

For automatic parsing and routing:

**Projects**: deliverables, launch, build, create, timeline, phases, tactical, business venture, creative work, initiative, campaign, big scope, multi-faceted

**Context Updates**: vision, goals, strategy, approach, challenges, resources, metrics, milestones, requirements, constraints, schedules, time allocation, status update

**Phases**: stages, milestones, sprints, iterations, cycles, periods, steps, sequence, timeline, roadmap

**Recurring Tasks**: daily, weekly, routine, habit, practice, regular, maintenance, ongoing

**one_off Tasks**: complete, finish, one-time, specific outcome, deadline, deliver, ship

**Calendar/Time**: schedule, book, calendar, meeting, appointment, deadline, start date, timeblock, availability

**Notes**:

- **Insights**: realized, noticed, observation, learned, discovery
- **Research**: found, study, article, source, reference
- **Ideas**: maybe, could, what if, brainstorming, possibility
- **Questions**: how, why, what, when, where, unclear, investigate
- **Reminders**: remember, don't forget, follow up, check on

---

## 🚀 Project Context Management

### Context Generation Process

1. **Brain Dump Analysis**: LLM analyzes the initial brain dump using 5-lens framework
2. **Section Generation**: Creates relevant ## markdown sections for the project
3. **Rich Content**: Populates sections with detailed, actionable information
4. **Storage**: Saves context as markdown text in project.context field
5. **Evolution**: Updates and refines as project progresses through brain dumps
6. **Calendar Integration**: Includes time-aware insights when relevant

### Context UI Features

- **Markdown Editor**: Users can edit the full context as markdown text
- **Section Parsing**: UI recognizes ## headers and displays them organized
- **Rich Preview**: Rendered markdown view for easy reading
- **Version History**: Track how context evolves over time
- **Export Options**: Copy full context for external use

### Context Integration

- **Daily Briefs**: Extract key insights from project context markdown
- **Task Generation**: Use context sections to inform task creation
- **Phase Planning**: Context guides phase structure and timeline
- **Progress Tracking**: Context updates reflect project evolution
- **Schedule Optimization**: Context informs optimal task timing

---

## 📅 Calendar Workflow Examples

### Example 1: Scheduling a Project Phase

```typescript
// User brain dumps about launching a new feature
"Need to launch the new analytics dashboard by end of March.
Will need design reviews, implementation, testing, and rollout."

// System creates project with phases and finds optimal schedule
1. Design Review Phase (Mar 1-7)
   - Books 2-hour design review slots
   - Schedules stakeholder feedback sessions

2. Implementation Phase (Mar 8-21)
   - Blocks daily 3-hour deep work sessions
   - Avoids meeting-heavy days

3. Testing Phase (Mar 22-28)
   - Schedules QA sessions
   - Books user testing slots
```

### Example 2: Daily Task Scheduling

```typescript
// Morning brief shows:
"You have 3 unscheduled high-priority tasks today:
1. Review PR #425 (45 min) - Suggested: 9:00-9:45 AM
2. Update investor deck (90 min) - Suggested: 10:00-11:30 AM
3. Team 1:1 prep (30 min) - Suggested: 2:00-2:30 PM

Click to add these to your calendar with one click."
```

### Example 3: Recurring Task Management

```typescript
// User creates habit: "Daily standup with team"
// System:
- Creates recurring calendar event (Mon-Fri, 9:15 AM)
- Links to project context
- Tracks completion automatically
- Adjusts for holidays/PTO
```

---

## 🎯 Calendar Best Practices

1. **Honor Work-Life Balance**: Only schedule during defined work hours
2. **Smart Batching**: Group similar tasks in time blocks
3. **Buffer Time**: Add transition time between tasks
4. **Focus Protection**: Block time for deep work
5. **Meeting Efficiency**: Cluster meetings to preserve focus time
6. **Flexibility**: Allow rescheduling for urgent items
7. **Progress Tracking**: Update task status from calendar completion

---

## LLM Rules

- Ask me any questions before you get started so we have the right strategy for this.
- If you have confusing or under specified information please stop and ask for clarity before executing on workflows

1. When creating new projects, always generate rich markdown context appropriate to the project type
2. Avoid generic sections - make them specific to what the user is building
3. Use the 5-lens framework internally but translate to natural section names
4. Context should be actionable and inform project execution
5. When updating context, intelligently merge new information with existing sections
6. Notes can evolve into context updates when they become structured
7. Respect the distinction between temporary thoughts (notes) and defining characteristics (context)
8. Always preserve valuable existing context when adding new information
