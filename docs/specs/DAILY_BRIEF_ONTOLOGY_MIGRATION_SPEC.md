<!-- docs/specs/DAILY_BRIEF_ONTOLOGY_MIGRATION_SPEC.md -->

# Daily Brief Ontology Migration Specification

**Created**: December 16, 2025
**Updated**: December 17, 2025
**Status**: ✅ Implemented (spec aligned to implementation)
**Author**: Claude (AI-generated)
**Category**: Technical Specification

---

## Implementation Status

### ✅ Completed (December 17, 2025)

The ontology-based daily brief system has been fully implemented and is now the default brief generation method.

**Key Implementation Files:**

- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts` - Main brief generator
- `apps/worker/src/workers/brief/ontologyBriefDataLoader.ts` - Data loading with graph relationships
- `apps/worker/src/workers/brief/ontologyPrompts.ts` - Goal/output-centric LLM prompts
- `apps/worker/src/workers/brief/ontologyBriefRepository.ts` - Database persistence
- `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte` - Dashboard UI widget

**URL Patterns:**

- Project links: `/projects/{project_id}`
- Task links: `/projects/{project_id}/tasks/{task_id}`

**Feature Access:**

- Dashboard widget for generating/viewing briefs
- `useOntology: true` is the default for all brief generation
- Full modal view with regeneration support

---

## TODO - Spec Updates (addressed in this revision)

- [x] State enums aligned to current ontology enums.
- [x] Full task work-mode taxonomy documented (8 bases + specializations).
- [x] Canonical edge model documented (project_id on edges; no legacy rels).
- [x] Actor-scoped project loading (assignments deferred).
- [x] Project-graph loader query pattern documented.
- [x] Plan relationships via `has_task`; no `plan_id`/`belongs_to_plan`.
- [x] Context document retrieval via `has_context_document`.
- [x] Optional entities (outputs/requirements/decisions) included when present.
- [x] Ontology-native brief tables + migration plan added.
- [x] Brief metadata/interface aligned to ontology sections (camelCase keys).
- [x] Goal/output-centric prompts with recency and next_steps emphasis.
- [x] Recency signals (recently updated items, 24h window) added.
- [x] Performance notes reference project_id indexing and caching.

## Executive Summary

This specification defines the migration of the daily brief generation system from the legacy data models (`projects`, `tasks`, `notes`, `phases`) to the new ontology-based data models (`onto_projects`, `onto_tasks`, `onto_goals`, `onto_plans`, `onto_milestones`, `onto_risks`, `onto_documents`, etc.).

The migration will enable richer, more actionable daily briefs by leveraging:

- **Goals** - Strategic alignment and progress tracking
- **Milestones** - Key deadline visibility
- **Plans** - Logical task groupings with progress
- **Risks** - Proactive risk awareness
- **Documents** - Contextual knowledge links
- **Graph relationships** - Dependency and impact analysis

---

## 1. Current System Analysis

### 1.1 Legacy Data Model (Current)

```
projects
├── tasks (via project_id)
├── notes (via project_id)
├── phases (via project_id)
│   └── phase_tasks (via phase_id)
└── task_calendar_events (via task_id)
```

**Current Queries** (from `briefGenerator.ts`):

```sql
-- Projects
SELECT * FROM projects WHERE user_id = ? AND status = 'active'

-- Tasks
SELECT * FROM tasks WHERE project_id IN (?) AND outdated != true AND deleted_at IS NULL

-- Notes
SELECT * FROM notes WHERE project_id IN (?)

-- Phases
SELECT * FROM phases WHERE project_id IN (?) ORDER BY order ASC

-- Phase Tasks
SELECT * FROM phase_tasks WHERE phase_id IN (?)
```

### 1.2 Current Brief Content Structure

The current daily brief includes:

- **Today's Tasks** - Tasks starting today
- **Overdue Tasks** - Past-due incomplete tasks
- **Upcoming Tasks** - Next 7 days / current phase tasks
- **Recently Completed** - Tasks done in last 24 hours
- **Recent Notes** - Notes from last 7 days
- **Phase Context** - Current phase information

**What's Missing:**

- Goal alignment and progress
- Milestone tracking
- Risk awareness
- Document references
- Task dependencies
- Cross-project patterns via graph

---

## 2. New Ontology Data Model

### 2.1 Entity Types for Daily Brief

| Entity           | Table               | Purpose in Brief                                               |
| ---------------- | ------------------- | -------------------------------------------------------------- |
| **Projects**     | `onto_projects`     | Root work units with facets and next_step_short/next_step_long |
| **Tasks**        | `onto_tasks`        | Actionable items with work modes                               |
| **Goals**        | `onto_goals`        | Strategic objectives and progress                              |
| **Plans**        | `onto_plans`        | Logical task groupings (replaces phases)                       |
| **Milestones**   | `onto_milestones`   | Key dates and deadlines                                        |
| **Risks**        | `onto_risks`        | Active risks requiring attention                               |
| **Documents**    | `onto_documents`    | Context and reference materials                                |
| **Requirements** | `onto_requirements` | Constraints/acceptance criteria (optional)                     |

### 2.2 Graph Relationships (onto_edges)

```typescript
interface OntoEdge {
	project_id: uuid; // denormalized for project-scoped queries
	src_kind: string; // 'project', 'task', 'goal', etc.
	src_id: uuid;
	rel: string; // Relationship type
	dst_kind: string;
	dst_id: uuid;
	props: jsonb;
}
```

**Key Relationships for Daily Brief:**

| Relationship                            | Description              | Brief Use                      |
| --------------------------------------- | ------------------------ | ------------------------------ |
| `project -[has_goal]-> goal`            | Project goals            | Show goal progress             |
| `project -[has_plan]-> plan`            | Project plans            | Show plan status / active plan |
| `plan -[has_task]-> task`               | Plan task grouping       | Group by plan                  |
| `task -[supports_goal]-> goal`          | Goal alignment           | Priority & progress context    |
| `task -[depends_on]-> task`             | Dependencies             | Show blockers & sequencing     |
| `project -[has_context_document]-> doc` | Context document link    | Include canonical context doc  |
| `project -[has_requirement]-> req`      | Requirements linkage     | Show constraints if present    |
| `risk -[threatens]-> task/project`      | Active risks             | Risk awareness                 |
| `task -[produces]-> output`             | Task-output mapping      | Output-centric focus           |
| `plan -[addresses]-> risk`              | Risk mitigation via plan | Show mitigation status         |

### 2.3 State Keys

| Entity          | States                                  | Terminal             |
| --------------- | --------------------------------------- | -------------------- |
| **Project**     | planning, active, completed, cancelled  | completed, cancelled |
| **Task**        | todo, in_progress, blocked, done        | done                 |
| **Plan**        | draft, active, completed                | completed            |
| **Goal**        | draft, active, achieved, abandoned      | achieved, abandoned  |
| **Milestone**   | pending, in_progress, completed, missed | completed, missed    |
| **Risk**        | identified, mitigated, occurred, closed | closed               |
| **Document**    | draft, review, published                | published            |
| **Output**      | draft, in_progress, review, published   | published            |
| **Requirement** | n/a (no state_key column)               | n/a                  |

---

## 3. New Data Queries

### 3.1 Main Data Fetching Function (Graph Loader Pattern)

```typescript
// Ontology-based project data for the brief
interface OntoProjectWithRelations {
	project: OntoProject;
	tasks: OntoTask[];
	goals: OntoGoal[];
	plans: OntoPlan[];
	milestones: OntoMilestone[];
	risks: OntoRisk[];
	documents: OntoDocument[];
	outputs: OntoOutput[];
	requirements: OntoRequirement[];
	decisions: OntoDecision[];
	edges: OntoEdge[];

	// Computed relationships
	tasksByPlan: Map<string, OntoTask[]>;
	taskDependencies: Map<string, string[]>; // taskId -> depends on taskIds
	goalProgress: Map<string, GoalProgress>;
	recentUpdates: {
		tasks: OntoTask[];
		goals: OntoGoal[];
		outputs: OntoOutput[];
		documents: OntoDocument[];
	};
}
```

### 3.2 Primary Queries (actor-scoped, project_id filtered)

```typescript
async function getOntoProjectsWithData(
	userId: string,
	options?: BriefJobData['options']
): Promise<OntoProjectWithRelations[]> {
	// 1) Resolve actor (assignments can be added later; we filter by creator for now)
	const { data: actor, error: actorError } = await supabase
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.eq('kind', 'human')
		.single();

	if (actorError || !actor) throw new Error('Actor not found for user');

	// 2) Fetch actor-owned projects (exclude cancelled)
	const { data: projects } = await supabase
		.from('onto_projects')
		.select('*')
		.eq('created_by', actor.id)
		.in('state_key', ['planning', 'active']);

	if (!projects || projects.length === 0) return [];
	const projectIds = projects.map((p) => p.id);

	// 3) Parallel fetch via project_id (graph loader pattern)
	const [
		tasksResult,
		goalsResult,
		plansResult,
		milestonesResult,
		risksResult,
		documentsResult,
		outputsResult,
		requirementsResult,
		decisionsResult,
		edgesResult
	] = await Promise.all([
		supabase.from('onto_tasks').select('*').in('project_id', projectIds),
		supabase
			.from('onto_goals')
			.select('*')
			.in('project_id', projectIds)
			.eq('state_key', 'active'),
		supabase
			.from('onto_plans')
			.select('*')
			.in('project_id', projectIds)
			.in('state_key', ['draft', 'active']),
		supabase
			.from('onto_milestones')
			.select('*')
			.in('project_id', projectIds)
			.in('state_key', ['pending', 'in_progress'])
			.order('due_at', { ascending: true }),
		supabase
			.from('onto_risks')
			.select('*')
			.in('project_id', projectIds)
			.neq('state_key', 'closed'),
		supabase.from('onto_documents').select('*').in('project_id', projectIds),
		supabase.from('onto_requirements').select('*').in('project_id', projectIds),
		supabase.from('onto_edges').select('*').in('project_id', projectIds) // use project_id index, canonical directions
	]);

	// 4) Build relationship maps (normalize edges to canonical directions where needed)
	return projects.map((project) =>
		buildProjectRelations(
			project,
			tasksResult.data ?? [],
			goalsResult.data ?? [],
			plansResult.data ?? [],
			milestonesResult.data ?? [],
			risksResult.data ?? [],
			documentsResult.data ?? [],
			requirementsResult.data ?? [],
			edgesResult.data ?? []
		)
	);
}
```

### 3.3 Task Categorization (Ontology-Based)

```typescript
interface CategorizedTasks {
	// Time-based
	todaysTasks: OntoTask[];
	overdueTasks: OntoTask[];
	upcomingTasks: OntoTask[]; // Next 7 days
	recentlyCompleted: OntoTask[]; // Last 24 hours

	// Status-based
	blockedTasks: OntoTask[]; // state_key = 'blocked'
	inProgressTasks: OntoTask[]; // state_key = 'in_progress'

	// Work mode categories (from type_key)
	executeTasks: OntoTask[]; // task.execute.*
	createTasks: OntoTask[]; // task.create.*
	refineTasks: OntoTask[]; // task.refine.*
	researchTasks: OntoTask[]; // task.research.*
	reviewTasks: OntoTask[]; // task.review.*
	coordinateTasks: OntoTask[]; // task.coordinate.*
	adminTasks: OntoTask[]; // task.admin.*
	planTasks: OntoTask[]; // task.plan.*

	// Relationship-based
	unblockingTasks: OntoTask[]; // Tasks that unblock others
	goalAlignedTasks: OntoTask[]; // Tasks linked to goals
	recentlyUpdated: OntoTask[]; // Updated in last 24h
}

function categorizeTasks(
	tasks: OntoTask[],
	edges: OntoEdge[],
	briefDate: string,
	timezone: string
): CategorizedTasks {
	const todayBounds = getDayBoundsInTimezone(briefDate, timezone);

	// Build dependency graph
	const blockedBy = new Map<string, string[]>();
	const blocks = new Map<string, string[]>();

	edges
		.filter((e) => e.rel === 'depends_on')
		.forEach((e) => {
			// e.src_id depends_on e.dst_id
			blockedBy.set(e.src_id, [...(blockedBy.get(e.src_id) || []), e.dst_id]);
			blocks.set(e.dst_id, [...(blocks.get(e.dst_id) || []), e.src_id]);
		});

	// Build goal alignment map
	const goalAligned = new Set<string>();
	edges
		.filter((e) => e.rel === 'supports_goal' && e.dst_kind === 'goal')
		.forEach((e) => goalAligned.add(e.src_id));

	// Recency
	const recentlyUpdated = tasks.filter(
		(t) => t.updated_at && isWithinLastHours(t.updated_at, briefDate, 48)
	);

	return {
		todaysTasks: tasks.filter(
			(t) => t.due_at && isWithinBounds(t.due_at, todayBounds) && t.state_key !== 'done'
		),

		overdueTasks: tasks.filter(
			(t) => t.due_at && new Date(t.due_at) < todayBounds.start && t.state_key !== 'done'
		),

		upcomingTasks: tasks.filter(
			(t) =>
				t.due_at && isWithinNextDays(t.due_at, todayBounds.end, 7) && t.state_key !== 'done'
		),

		recentlyCompleted: tasks.filter(
			(t) =>
				t.state_key === 'done' &&
				t.updated_at &&
				isWithinLastHours(t.updated_at, briefDate, 24)
		),

		blockedTasks: tasks.filter((t) => t.state_key === 'blocked'),
		inProgressTasks: tasks.filter((t) => t.state_key === 'in_progress'),

		// Work mode categories
		executeTasks: tasks.filter((t) => t.type_key?.startsWith('task.execute')),
		createTasks: tasks.filter((t) => t.type_key?.startsWith('task.create')),
		refineTasks: tasks.filter((t) => t.type_key?.startsWith('task.refine')),
		researchTasks: tasks.filter((t) => t.type_key?.startsWith('task.research')),
		reviewTasks: tasks.filter((t) => t.type_key?.startsWith('task.review')),
		coordinateTasks: tasks.filter((t) => t.type_key?.startsWith('task.coordinate')),
		adminTasks: tasks.filter((t) => t.type_key?.startsWith('task.admin')),
		planTasks: tasks.filter((t) => t.type_key?.startsWith('task.plan')),

		// Relationship-based
		unblockingTasks: tasks.filter(
			(t) => (blocks.get(t.id)?.length || 0) > 0 && t.state_key !== 'done'
		),

		goalAlignedTasks: tasks.filter((t) => goalAligned.has(t.id)),
		recentlyUpdated
	};
}
```

### 3.4 Goal Progress Calculation

```typescript
interface GoalProgress {
	goal: OntoGoal;
	totalTasks: number;
	completedTasks: number;
	progressPercent: number;
	status: 'on_track' | 'at_risk' | 'behind';
	contributingTasks: OntoTask[];
}

function calculateGoalProgress(goal: OntoGoal, tasks: OntoTask[], edges: OntoEdge[]): GoalProgress {
	// Find tasks that contribute to this goal
	const contributingTaskIds = edges
		.filter((e) => e.rel === 'supports_goal' && e.dst_id === goal.id && e.src_kind === 'task')
		.map((e) => e.src_id);

	const contributingTasks = tasks.filter((t) => contributingTaskIds.includes(t.id));
	const completedTasks = contributingTasks.filter((t) => t.state_key === 'done');

	const progressPercent =
		contributingTasks.length > 0
			? Math.round((completedTasks.length / contributingTasks.length) * 100)
			: 0;

	// Determine status based on progress vs expected
	// (Could be enhanced with goal due_at field)
	const status =
		progressPercent >= 70 ? 'on_track' : progressPercent >= 40 ? 'at_risk' : 'behind';

	return {
		goal,
		totalTasks: contributingTasks.length,
		completedTasks: completedTasks.length,
		progressPercent,
		status,
		contributingTasks
	};
}
```

---

## 4. New Brief Content Structure

### 4.1 Enhanced Brief Sections

```markdown
# 🌅 Daily Brief - {Date}

## Executive Summary

{AI-generated overview of today's goals/outputs momentum, critical risks, and next steps}

## 🎯 Strategic Alignment & Outcomes

### Active Goals

{For each active goal:}

- **{Goal Name}**: {Progress}% complete ({X}/{Y} tasks)
    - Status: {on_track|at_risk|behind}
    - Key contributing tasks today: {task list}
    - Recent activity: {created_at or supporting task updated_at (goals have no updated_at)}

### Outputs In Flight

{For each output linked to goals/plans:}

- **{Output}** ({state_key}) — Producer: {plan/task if known}
    - Goal(s): {linked goals}
    - Latest change: {updated_at}

### Upcoming Milestones

{For milestones in next 14 days:}

- **{Milestone}** - Due {date} ({X days away})
    - Project: {project name}
    - Status: {pending|in_progress} (flag if at risk of missing)

## ⚠️ Attention Required

### Blocked Tasks

{Tasks with state_key='blocked', grouped by dependency blocker}

### Active Risks

{Risks with state_key not in ('mitigated','closed')}

- **{Risk Title}** - Impact: {high|medium|low}, Probability: {high|medium|low}
    - Project: {project name}
    - Mitigation: {plan/tasks if any}

### Overdue Items

{Tasks past due date, sorted by priority}

### Requirements/Decisions to Honor

- Recent requirements or decisions that impact today (optional, only if present)

## 📋 Today's Focus

### High Priority ({count})

{Priority 1-2 tasks due today or overdue}

### Unblocking Tasks

{Tasks that, when completed, unblock other tasks}

- **{Task}** → Unblocks: {list of dependent tasks}

### Scheduled Work

{Tasks due today, grouped by work mode}

- **Execute**: {task.execute.\*}
- **Create**: {task.create.\*}
- **Refine**: {task.refine.\*}
- **Research**: {task.research.\*}
- **Review**: {task.review.\*}
- **Coordinate**: {task.coordinate.\*}
- **Admin**: {task.admin.\*}
- **Plan**: {task.plan.\*}

### Recently Updated (24h)

- Tasks (updated_at), Goals (created_at or supporting task updated_at), Outputs/Documents (updated_at) touched in the last 24h

## 📊 Project Status

### {Project Name}

{For each active project:}

**Health**: {facet_stage} | **Scale**: {facet_scale} | **Context**: {facet_context}
**Next Steps**: {project.next_step_short / project.next_step_long or synthesized}

**Active Plan**: {plan name} ({progress}% via has_task edges)

- Tasks: {done}/{total} complete
- Next milestone: {milestone name} in {X days}

**Goals**:

- {Goal 1}: {progress}%
- {Goal 2}: {progress}%

**Today's Tasks**:

1. {task with priority, work mode, and due time}

**This Week**:

- {upcoming tasks summary}

**Outputs & Decisions**:

- Outputs: {list with state and linked goal}
- Decisions: {recent decisions impacting today}

**Requirements**:

- {requirements that constrain current work}

## 📚 Context & References

### Recently Updated Documents

{Documents updated in last 7 days}

- **{Document Title}** ({type_key}) - Updated {date}

### Relevant Notes

{Recent notes from project documents}

### Context Document

- {has_context_document edge target, if present}

## 💡 AI Insights

{LLM-generated analysis including:}

- Cross-project patterns
- Resource allocation observations
- Strategic recommendations
- Risk awareness suggestions
- Output delivery sequencing recommendations
```

### 4.2 TypeScript Interface

```typescript
interface OntologyDailyBrief {
	id: string;
	user_id: string;
	brief_date: string;

	// Content sections
	executive_summary: string; // stores full brief markdown (summary + sections)
	strategic_alignment: StrategicAlignmentSection;
	attention_required: AttentionRequiredSection;
	todays_focus: TodaysFocusSection;
	project_status: ProjectStatusSection[];
	context_references: ContextReferencesSection;
	recent_updates: RecentUpdatesSection;

	// AI analysis
	llm_analysis: string;
	priority_actions: string[];

	// Metadata
	metadata: OntologyBriefMetadata;
	generation_status: string;
	generation_completed_at: string;
}

interface StrategicAlignmentSection {
	active_goals: GoalProgress[];
	outputs_in_flight: OutputStatus[];
	upcoming_milestones: MilestoneStatus[];
}

interface AttentionRequiredSection {
	blocked_tasks: OntoTask[];
	active_risks: OntoRisk[];
	overdue_items: OntoTask[];
	requirements: OntoRequirement[];
	decisions: OntoDecision[];
}

interface TodaysFocusSection {
	high_priority: OntoTask[];
	unblocking_tasks: UnblockingTask[];
	scheduled_by_work_mode: {
		execute: OntoTask[];
		create: OntoTask[];
		refine: OntoTask[];
		research: OntoTask[];
		review: OntoTask[];
		coordinate: OntoTask[];
		admin: OntoTask[];
		plan: OntoTask[];
	};
	recently_updated: RecentlyUpdatedSummary;
}

interface ProjectStatusSection {
	project: OntoProject;
	health_stage: string;
	scale: string;
	context: string | null;
	next_steps: string[]; // from project.next_step_short/next_step_long (or derived)
	active_plan: PlanProgress | null;
	goals: GoalProgress[];
	outputs: OutputStatus[];
	decisions: OntoDecision[];
	requirements: OntoRequirement[];
	todays_tasks: OntoTask[];
	this_week_summary: string;
}

interface OntologyBriefMetadata {
	// Counts
	totalProjects: number;
	totalTasks: number;
	totalGoals: number;
	totalMilestones: number;
	activeRisksCount: number;
	totalOutputs: number;
	recentUpdatesCount: number;

	// Analysis
	blockedCount: number;
	overdueCount: number;
	goalsAtRisk: number;
	milestonesThisWeek: number;
	outputsInReview: number;

	// Graph stats
	totalEdges: number;
	dependencyChains: number;

	// Generation info
	generatedVia: string;
	timezone: string;
	is_reengagement?: boolean;
	daysSinceLastLogin?: number;
}

interface OutputStatus {
	output: OntoOutput;
	state: string;
	linkedGoals: string[];
	linkedTasks: string[];
	updated_at: string | null;
}

interface RecentUpdatesSection {
	tasks: OntoTask[];
	goals: OntoGoal[];
	outputs: OntoOutput[];
	documents: OntoDocument[];
}

interface RecentlyUpdatedSummary {
	updated_tasks: number;
	updated_goals: number;
	updated_outputs: number;
	updated_documents: number;
	items: Array<{ kind: string; id: string; title: string; updated_at: string }>;
}
```

---

## 5. LLM Prompt Updates

### 5.1 New Analysis Prompt

```typescript
const OntologyDailyBriefAnalysisPrompt = {
	system: `You are a BuildOS productivity strategist writing a daily brief analysis that is **goal- and output-centric**.

Weigh these highest:
- Project next_steps (from project.next_step_short/next_step_long or synthesized) and active goals.
- Outputs linked to goals/plans and their latest changes.
- Recently updated work (tasks/goals/outputs/docs) and active dependencies.
- Critical risks/requirements/decisions that affect delivery today.

Always use canonical ontology concepts:
- Tasks have work modes (execute/create/refine/research/review/coordinate/admin/plan) and states (todo/in_progress/blocked/done).
- Plans contain tasks via has_task; tasks support goals via supports_goal; tasks produce outputs via produces.
- Edges include project_id; no legacy belongs_to_plan/contributes_to.

Your analysis should: (1) Align work to goals/outputs, (2) Sequence around blockers/dependencies, (3) Call out recent changes and next steps, (4) Highlight risks/requirements that might be violated, (5) Keep it concise and actionable.`,

	user: (data: OntologyBriefData) => `
# Daily Brief Analysis Request

**Date**: ${data.briefDate}
**Timezone**: ${data.timezone}

## Goals & Outputs
${data.goals
	.map(
		(g) =>
			`- ${g.goal.name}: ${g.progressPercent}% (${g.completedTasks}/${g.totalTasks}), status: ${g.status}`
	)
	.join('\n')}

Outputs:
${data.outputs
	.map(
		(o) =>
			`- ${o.output.name} (${o.state}) → goals: ${o.linkedGoals.join(', ') || 'none'}, updated: ${o.updated_at}`
	)
	.join('\n')}

## Next Steps & Milestones
${data.projects
	.map(
		(p) =>
			`- ${p.project.name}: next_steps=${(p.next_steps || []).join('; ') || 'none'}, active_plan=${p.activePlan?.name || 'none'}, next_milestone=${p.nextMilestone || 'none'}`
	)
	.join('\n')}

## Risks / Requirements / Decisions
- Risks: ${data.risks.length}, details: ${data.risks.map((r) => `${r.title} (${r.impact}/${r.probability})`).join('; ')}
- Requirements: ${data.requirements.map((r) => r.text).join('; ') || 'none'}
- Decisions: ${data.decisions.map((d) => d.title).join('; ') || 'none'}

## Work Summary
- Tasks due today: ${data.todaysTasks.length}
- Blocked tasks: ${data.blockedTasks.length}
- Overdue tasks: ${data.overdueTasks.length}
- High priority (P1-P2): ${data.highPriorityCount}
- Recent updates (24h): tasks ${data.recentUpdates.tasks.length}, goals ${data.recentUpdates.goals.length}, outputs ${data.recentUpdates.outputs.length}, docs ${data.recentUpdates.documents.length}

Work modes:
${Object.entries(data.tasksByWorkMode)
	.map(([mode, tasks]) => `- ${mode}: ${tasks.length}`)
	.join('\n')}

## Project Details
${data.projects
	.map(
		(p) => `
### ${p.project.name}
- Stage: ${p.project.facet_stage || 'execution'} | Scale: ${p.project.facet_scale || 'medium'} | Context: ${p.project.facet_context || 'n/a'}
- Goals: ${p.goals.map((g) => `${g.goal.name} (${g.progressPercent}%)`).join(', ') || 'None'}
- Outputs: ${p.outputs.map((o) => `${o.output.name} (${o.state})`).join(', ') || 'None'}
- Next steps: ${(p.next_steps || []).join('; ') || 'None'}
- Today's tasks: ${p.todaysTasks.length} | This week: ${p.thisWeekTasks.length}
- Blockers: ${p.blockedTasks.length} | Unblocking: ${p.unblockingTasks.length}
`
	)
	.join('\n')}

## Analysis Request
Provide: (1) Day overview (goal/output-aligned), (2) Recommended sequence that unblocks outputs, (3) Risks/requirements to watch, (4) Quick wins, (5) Recent changes worth noting, (6) Calls to action.
`
};
```

### 5.2 Executive Summary Prompt

```typescript
const OntologyExecutiveSummaryPrompt = {
	system: `You create concise executive summaries for daily briefs that emphasize **goal progress, outputs, next steps, and recency**.

Focus on:
- Overall momentum toward goals/outputs
- Critical items requiring attention (risks, requirements, blockers)
- Next steps and recently updated work
- Key decisions or actions needed today

Keep it under 200 words. Be direct and actionable.`,

	user: (data: OntologySummaryData) => `
Create an executive summary for this daily brief:

**Date**: ${data.briefDate}

**Key Metrics**:
- Projects: ${data.projectCount} active
- Goals: ${data.goalsOnTrack} on track, ${data.goalsAtRisk} at risk
- Outputs: ${data.outputsInFlight} in flight (${data.outputsInReview} in review)
- Tasks Today: ${data.todayTaskCount} (${data.overdueCount} overdue, ${data.blockedCount} blocked)
- Milestones This Week: ${data.milestonesThisWeek}
- Active Risks: ${data.activeRisksCount}
- Recent Updates (24h): ${data.recentUpdatesCount}

**Highlights**:
${data.highlights.join('\n')}

**Concerns**:
${data.concerns.join('\n')}

Generate a 3-4 sentence executive summary focusing on the most important aspects of the day.
`
};
```

---

## 6. Database Changes

### 6.1 New Tables (ontology-native brief storage)

Create ontology-first brief tables to avoid legacy project/task references and to store ontology entity references explicitly.

```sql
create table ontology_daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  actor_id uuid not null references onto_actors(id) on delete cascade,
  brief_date date not null,
  executive_summary text not null default '',
  llm_analysis text,
  priority_actions text[] default '{}',
  metadata jsonb not null default '{}'::jsonb,
  generation_status text not null default 'pending',
  generation_error text,
  generation_started_at timestamptz,
  generation_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ontology_project_briefs (
  id uuid primary key default gen_random_uuid(),
  daily_brief_id uuid not null references ontology_daily_briefs(id) on delete cascade,
  project_id uuid not null references onto_projects(id) on delete cascade,
  brief_content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Optional: capture entity references included in the brief for analytics/audit
create table ontology_brief_entities (
  id uuid primary key default gen_random_uuid(),
  daily_brief_id uuid not null references ontology_daily_briefs(id) on delete cascade,
  project_id uuid references onto_projects(id) on delete cascade,
  entity_kind text not null, -- 'task' | 'goal' | 'plan' | 'output' | 'document' | 'risk' | 'requirement' | 'decision'
  entity_id uuid not null,
  role text, -- 'highlighted' | 'blocked' | 'next_step' | 'recently_updated' | etc.
  created_at timestamptz not null default now()
);
```

Migration steps:

1. Backfill `ontology_daily_briefs` from `daily_briefs` (same `brief_date`, `user_id`; set `actor_id` via `onto_actors.user_id`; copy `summary_content` into `executive_summary`; `llm_analysis`/`priority_actions` straight across; set `metadata.legacy_daily_brief_id` for traceability).
2. Backfill `ontology_project_briefs` from `project_daily_briefs`, mapping `project_id` via ontology migration mapping (or mark as legacy if no ontology project exists).
3. Populate `ontology_brief_entities` opportunistically from legacy metadata (if present) and during regeneration.
4. Update worker code to write to new tables only; keep legacy tables read-only until cutover verification, then deprecate.

### 6.2 Helper Functions (canonical relationships)

```sql
-- Function to get tasks for a plan via edges
CREATE OR REPLACE FUNCTION get_plan_tasks(plan_uuid UUID)
RETURNS SETOF onto_tasks AS $$
  SELECT t.*
  FROM onto_tasks t
  JOIN onto_edges e ON e.dst_id = t.id
  WHERE e.rel = 'has_task'
    AND e.src_id = plan_uuid
    AND e.src_kind = 'plan';
$$ LANGUAGE SQL;

-- Function to get task dependencies
CREATE OR REPLACE FUNCTION get_task_dependencies(task_uuid UUID)
RETURNS TABLE(
  depends_on_id UUID,
  depends_on_title TEXT,
  depends_on_state TEXT
) AS $$
  SELECT
    t.id,
    t.title,
    t.state_key
  FROM onto_edges e
  JOIN onto_tasks t ON t.id = e.dst_id
  WHERE e.src_id = task_uuid
    AND e.rel = 'depends_on'
    AND e.src_kind = 'task'
    AND e.dst_kind = 'task';
$$ LANGUAGE SQL;

-- Function to get goal progress
CREATE OR REPLACE FUNCTION get_goal_progress(goal_uuid UUID)
RETURNS TABLE(
  total_tasks INT,
  completed_tasks INT,
  progress_percent INT
) AS $$
  WITH contributing AS (
    SELECT t.id, t.state_key
    FROM onto_edges e
    JOIN onto_tasks t ON t.id = e.src_id
    WHERE e.dst_id = goal_uuid
      AND e.rel = 'supports_goal'
      AND e.dst_kind = 'goal'
  )
  SELECT
    COUNT(*)::INT as total_tasks,
    COUNT(*) FILTER (WHERE state_key = 'done')::INT as completed_tasks,
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE ROUND((COUNT(*) FILTER (WHERE state_key = 'done')::NUMERIC / COUNT(*)) * 100)::INT
    END as progress_percent
  FROM contributing;
$$ LANGUAGE SQL;
```

---

## 7. Migration Strategy

### 7.1 Direct Migration (All-in-One)

This migration will be done in a single shot - replacing the legacy brief generation with ontology-based generation entirely and writing to ontology-native tables.

#### Implementation Steps

1. **Create Ontology Brief Data Loader** (`apps/worker/src/workers/brief/ontologyBriefDataLoader.ts`)
    - Use project-graph loader pattern (project_id filtered queries, parallel fetch).
    - Resolve actor via `onto_actors.user_id`; skip `onto_assignments` for now (future extension).
    - Normalize edges to canonical rels (`has_task`, `supports_goal`, `produces`, `has_context_document`, etc.).
    - Compute goal progress, output status, dependency graph, and recent updates (24h window).

2. **Add Ontology Brief Persistence** (`ontology_daily_briefs`, `ontology_project_briefs`)
    - Insert new rows when generating; stop writing to legacy `daily_briefs`/`project_daily_briefs`.
    - Add helper repository functions and migrations.

3. **Update Brief Generator** (`apps/worker/src/workers/brief/briefGenerator.ts`)
    - Replace legacy project/task loaders with ontology loader.
    - Generate new sections (outputs, requirements, decisions, next_steps, recent updates).
    - Persist to new ontology tables; populate `ontology_brief_entities` for analytics.

4. **Update Prompts** (`apps/worker/src/workers/brief/prompts.ts`)
    - Replace legacy task-centric prompts with goal/output-centric prompts defined in Section 5.
    - Include next_steps, outputs, and recency signals in prompt inputs.

5. **Update Type Definitions**
    - Add ontology entity types to worker shared types.
    - Update brief metadata interfaces to include outputs, recent updates, and counts.
    - Ensure `packages/shared-types` reflects new ontology brief tables.

6. **Data Migration**
    - Backfill new tables from legacy daily_briefs/project_daily_briefs (Section 6.1).
    - Mark legacy tables read-only after verification and schedule deletion.

7. **Test & Deploy**
    - Test with sample ontology data and real user fixtures.
    - Verify LLM outputs reference goals/outputs and recent updates.
    - Deploy and monitor generation success rate and latency.

#### Key Consideration: Actor ID Resolution

The ontology system uses `onto_actors.id` (not `user_id` directly) for ownership. The brief generator must resolve `user_id` → `actor_id` before querying. `onto_assignments` is not used yet; later we can extend to include assigned actors.

```typescript
async function getActorIdForUser(userId: string): Promise<string> {
	const { data: actor } = await supabase
		.from('onto_actors')
		.select('id')
		.eq('user_id', userId)
		.eq('kind', 'human')
		.single();

	if (!actor) {
		throw new Error(`No actor found for user ${userId}`);
	}
	return actor.id;
}
```

### 7.2 Existing Service to Leverage

The web app already has `OntologyContextLoader` (`apps/web/src/lib/services/ontology-context-loader.ts`) which provides:

- Caching with TTL
- Project context loading
- Element relationship loading
- Linked entity context loading
- Graph traversal utilities

We'll port the relevant patterns to the worker service.

---

## 8. Performance Considerations

### 8.1 Query Optimization

1. **Batch edge queries**: Fetch all edges for project IDs in single query (via `project_id` index)
2. **Index usage**: Ensure `onto_edges(project_id)` index is used; entity tables already indexed on `project_id`
3. **Parallel fetching**: Use `Promise.all` for independent entity queries
4. **Limit graph depth**: Cap dependency chain traversal at 3 levels
5. **Cache**: Cache per-user edge maps for 5 minutes to amortize prompts

### 8.2 Estimated Query Impact

| Query      | Legacy Time | Ontology Time | Notes                 |
| ---------- | ----------- | ------------- | --------------------- |
| Projects   | ~50ms       | ~50ms         | Similar               |
| Tasks      | ~100ms      | ~100ms        | Similar               |
| Goals      | N/A         | ~50ms         | New                   |
| Plans      | N/A         | ~50ms         | New (replaces phases) |
| Milestones | N/A         | ~50ms         | New                   |
| Risks      | N/A         | ~30ms         | New                   |
| Outputs    | N/A         | ~40ms         | New                   |
| Documents  | ~50ms       | ~50ms         | Similar               |
| Decisions  | N/A         | ~20ms         | New                   |
| Edges      | N/A         | ~80ms         | project_id index      |
| **Total**  | ~200ms      | ~470ms        | ~+270ms               |

**Mitigation**:

- Cache edge relationships per user (5-min TTL)
- Use database functions for complex graph queries
- Consider materialized views for goal progress

---

## 9. Testing Plan

### 9.1 Unit Tests

```typescript
describe('Ontology Brief Generator', () => {
	describe('Task Categorization', () => {
		it('categorizes tasks by due date correctly', () => {});
		it('identifies blocked tasks from state_key', () => {});
		it('groups tasks by work mode type_key', () => {});
		it('calculates unblocking tasks from edges', () => {});
		it('detects recently updated tasks (24h)', () => {});
	});

	describe('Goal Progress', () => {
		it('calculates progress from contributing tasks', () => {});
		it('handles goals with no tasks', () => {});
		it('determines risk status correctly', () => {});
	});

	describe('Outputs & Next Steps', () => {
		it('links outputs to goals via edges', () => {});
		it('surfaces project next_steps when present', () => {});
	});

	describe('Graph Traversal', () => {
		it('builds dependency chains correctly', () => {});
		it('limits traversal depth', () => {});
		it('handles circular dependencies', () => {});
	});

	describe('Brief Generation', () => {
		it('includes all required sections', () => {});
		it('formats markdown correctly', () => {});
		it('handles empty data gracefully', () => {});
		it('writes to ontology_daily_briefs and ontology_project_briefs', () => {});
	});
});
```

### 9.2 Integration Tests

- Test with real ontology data from test accounts
- Verify LLM prompts produce meaningful analysis
- Compare legacy vs ontology brief quality
- Measure generation time performance

---

## 10. Success Metrics

| Metric                | Target       | Measurement                 |
| --------------------- | ------------ | --------------------------- |
| **Brief Engagement**  | +20%         | Time spent reading brief    |
| **Action Completion** | +15%         | Priority actions completed  |
| **User Satisfaction** | 4.0+         | In-app rating               |
| **Generation Time**   | <30s         | P95 latency                 |
| **LLM Costs**         | <$0.05/brief | Average cost per generation |

---

## 11. Open Questions

1. **Next steps source of truth**: Should we rely solely on `project.next_step_short/next_step_long` or synthesize when absent?
2. **Output surfacing**: How many outputs to show per project email before truncation?
3. **Risk thresholds**: What impact/probability combinations warrant inclusion?
4. **Dependency depth**: How many levels of dependencies to show?
5. **Document inclusion**: Which document types are most valuable in briefs?
6. **Re-engagement**: How should ontology briefs differ for returning users?

---

## 12. Appendix

### A. Entity Field Reference

See `/apps/web/docs/features/ontology/DATA_MODELS.md` for complete schema.

### B. Edge Relationship Types

| Relation               | Source  | Target       | Description             |
| ---------------------- | ------- | ------------ | ----------------------- |
| `has_goal`             | project | goal         | Project contains goal   |
| `has_plan`             | project | plan         | Project contains plan   |
| `has_task`             | plan    | task         | Plan contains task      |
| `depends_on`           | task    | task         | Task dependency         |
| `supports_goal`        | task    | goal         | Task helps achieve goal |
| `produces`             | task    | output       | Task produces output    |
| `has_context_document` | project | document     | Context doc link        |
| `threatens`            | risk    | task/project | Risk affects work       |
| `addresses`            | plan    | risk         | Plan mitigates risk     |

### C. Work Mode Categories

| Type Key          | Brief Category | Description        |
| ----------------- | -------------- | ------------------ |
| `task.execute`    | Execute        | Action/do tasks    |
| `task.create`     | Create         | Produce artifacts  |
| `task.refine`     | Create         | Improve existing   |
| `task.research`   | Research       | Investigate        |
| `task.review`     | Review         | Evaluate           |
| `task.coordinate` | Coordinate     | Sync with others   |
| `task.admin`      | Admin          | Administrative     |
| `task.plan`       | Planning       | Strategic planning |

---

**End of Specification**

_Generated: December 16, 2025_
_Scope: Daily brief migration from legacy to ontology data models_
