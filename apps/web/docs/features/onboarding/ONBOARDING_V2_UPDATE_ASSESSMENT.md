<!-- apps/web/docs/features/onboarding/ONBOARDING_V2_UPDATE_ASSESSMENT.md -->

# Onboarding V2 Update Assessment

**Date**: 2026-01-07
**Scope**: Analysis of onboarding v2 updates needed for ontology system integration, educational content, and data capture improvements
**Based On**: `ONBOARDING_FLOW_ANALYSIS.md` (2025-10-21)

---

## Founder Direction

> **From DJ (2026-01-07):**
>
> I need to finish the onboarding flow (v2). Three main things:
>
> ### 1. Education
>
> - Educate new users about what BuildOS can do
> - Show them how to do stuff
>
> ### 2. The "Meet You Where You Are" Philosophy
>
> BuildOS works with you wherever you are in the process:
>
> - **Have a group of related tasks?** → Organize into a project with a goal, plan, and connected tasks
> - **Only have a goal?** → Reverse-engineer the milestones needed and develop a plan with all the tasks to get there
> - This flexibility is the key message
>
> Then there are **bonus add-ons** to help stay on track: daily briefs, SMS reminders, calendar integration.
>
> Then explain how you **chat about your project** — BuildOS serves as a thought partner and assistant helping you get organized. Chat to give updates, discuss new plans, surface new tasks. **BuildOS is designed to meet you where you are and work with you.**
>
> ### 3. Data Capture
>
> This is important but I'm not sure exactly what data to grab. I want to:
>
> - Grab info on user's existing projects
> - Scan their calendar looking for projects
>
> These two flows haven't been tested in a while and need updating for the **graph-based project ontology structure**.
>
> For preferences: need to be **specific things we can actually use** in the agentic chat. Right now there aren't really any preferences being used. Want to experiment with **global preferences vs project-specific preferences**. But I don't want noise in the agentic context — this needs to be important and maybe only situational.

---

## Executive Summary

The current onboarding v2 flow has **three critical gaps**:

1. **Education Gap**: Users aren't taught what BuildOS can do or how to use it effectively
2. **Ontology Integration Gap**: Brain dump and calendar analysis flows create projects in the **legacy** `projects`/`tasks` tables, not the new ontology system (`onto_*`)
3. **Data Capture Gap**: No clear strategy for capturing meaningful user context that helps AI personalization

**Scope note**: We are **not** migrating or backfilling legacy data in this spec. The goal is to ensure onboarding creates ontology-native entities going forward.

---

## Implementation Phases (Tracking)

| Phase | Status | Scope                                 |
| ----- | ------ | ------------------------------------- |
| 1     | Done   | Ontology creation for onboarding (P0) |
| 2     | Done   | Education + core preferences (P1)     |
| 3     | Done   | Advanced preferences (P2)             |

### Phase 1 Checklist

| Item                                                                                     | Status |
| ---------------------------------------------------------------------------------------- | ------ |
| Create `braindump-to-ontology-adapter.ts`                                                | Done   |
| Modify `/api/braindumps/stream/+server.ts` for ontology instantiation                    | Done   |
| Modify `/api/braindumps/generate/+server.ts` save path for ontology instantiation        | Done   |
| Modify `calendar-analysis.service.ts` for ontology instantiation + add-to-existing tasks | Done   |
| Update `ProjectsCaptureStep.svelte` for ontology response handling                       | Done   |
| Update `SummaryStep.svelte` to show ontology counts                                      | Done   |
| Update `BrainDumpParseResult` with `ontology` block                                      | Done   |

### Phase 2 Checklist

| Item                                                 | Status |
| ---------------------------------------------------- | ------ |
| Add `CapabilitiesStep.svelte` + step order wiring    | Done   |
| Capture communication style preference               | Done   |
| Capture proactivity level preference                 | Done   |
| Add `users.preferences` column + types               | Done   |
| Inject preferences into planner prompts              | Done   |
| Align progress indicator with visible step numbering | Done   |

**Implementation note:** Preferences are captured in a dedicated `PreferencesStep` inserted after
`FlexibilityStep` and before `CombinedProfileStep` in the v2 flow.

### Phase 3 Checklist

| Item                                                  | Status |
| ----------------------------------------------------- | ------ |
| Capture working context (role/domain) in onboarding   | Done   |
| Add preferences settings tab (global preferences)     | Done   |
| Add API endpoint for user preferences                 | Done   |
| Add project-specific preferences UI in project editor | Done   |
| Extend prompt injection for project preferences       | Done   |

**Implementation Details (Phase 3):**

| Component        | File                                | Line Numbers | Purpose                                    |
| ---------------- | ----------------------------------- | ------------ | ------------------------------------------ |
| Working Context  | `PreferencesStep.svelte`            | 65-66, 83-84 | Captures `primaryRole` and `domainContext` |
| Settings Tab     | `PreferencesTab.svelte`             | Full file    | Global preferences editing UI              |
| Preferences API  | `/api/users/preferences/+server.ts` | Full file    | GET/PUT for user preferences               |
| Project Prefs UI | `OntologyProjectEditModal.svelte`   | 1006-1114    | "AI Preferences" section in sidebar        |
| Prompt Injection | `agent-context-service.ts`          | 567-684      | `loadUserProfileWithPreferences()`         |

**Related Documentation:**

- **[User Preferences System](../preferences/README.md)** - Full documentation of preferences architecture
- **[Onboarding README](./README.md)** - Updated flow documentation

---

## Part 1: Ontology Creation Strategy (Onboarding Only, No Legacy Migration)

### 1.1 Current Problem

The brain dump and calendar analysis flows use `OperationsExecutor`, which writes to legacy tables:

```
LEGACY FLOW (Current):
User Input → LLM Parse → ParsedOperation[] → OperationsExecutor → legacy tables
```

**What needs to change:**

```
ONTOLOGY FLOW (Target):
User Input → LLM Parse → ParsedOperation[] → ProjectSpec Adapter → instantiateProject() → onto_* tables + edges
```

**Out of scope**: migrating existing legacy projects/tasks or syncing old records into ontology.

### 1.2 ProjectSpec Structure Deep Dive

The ontology system uses `ProjectSpec` (defined in `apps/web/src/lib/types/onto.ts`) to create complete project graphs. Here's the **actual** shape and validation constraints:

```typescript
interface ProjectSpec {
	// REQUIRED: The project itself
	project: {
		name: string;
		description?: string;
		type_key: string; // project.{realm}.{deliverable}[.{variant}]
		state_key?: ProjectState; // 'planning' | 'active' | 'completed' | 'cancelled'
		start_at?: string; // ISO datetime
		end_at?: string; // ISO datetime
		props?: {
			facets?: {
				context?:
					| 'personal'
					| 'client'
					| 'commercial'
					| 'internal'
					| 'open_source'
					| 'community'
					| 'academic'
					| 'nonprofit'
					| 'startup';
				scale?: 'micro' | 'small' | 'medium' | 'large' | 'epic';
				stage?:
					| 'discovery'
					| 'planning'
					| 'execution'
					| 'launch'
					| 'maintenance'
					| 'complete';
			};
			[key: string]: any;
		};
	};

	// OPTIONAL: Context document (rich project background, required body)
	context_document?: {
		title: string;
		body_markdown: string; // The brain dump content goes here
		type_key?: string; // Default: 'document.context.project'
		state_key?: DocumentState;
		props?: Record<string, unknown>;
	};

	// OPTIONAL: Strategic goals
	goals?: Array<{
		name: string;
		type_key?: string; // goal.{family}[.{variant}] (e.g., goal.outcome.project, goal.metric.revenue)
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Milestones (must reference a goal)
	milestones?: Array<{
		title: string;
		due_at: string; // ISO datetime
		goal_name: string; // References a goal by name
		type_key?: string; // milestone.{variant} (e.g., milestone.launch, milestone.deadline)
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Plans (can reference goals or milestones)
	plans?: Array<{
		name: string;
		type_key: string; // plan.{family}[.{variant}] (e.g., plan.phase, plan.roadmap.product)
		state_key?: PlanState;
		goal_name?: string; // Attach to a goal
		milestone_title?: string; // Or attach to a milestone
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Tasks (can reference plans or goals)
	tasks?: Array<{
		title: string;
		type_key?: string; // task.{work_mode}[.{specialization}] (default task.execute)
		state_key?: TaskState;
		priority?: number; // 1-5
		due_at?: string; // ISO datetime
		plan_name?: string; // Attach to a plan
		goal_name?: string; // Or attach to a goal directly
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Outputs (deliverables)
	outputs?: Array<{
		name: string;
		type_key: string; // output.{family}[.{variant}]
		state_key?: OutputState;
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Documents (non-context)
	documents?: Array<{
		title: string;
		type_key: string; // document.{family}[.{variant}]
		state_key?: DocumentState;
		body_markdown?: string;
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Sources
	sources?: Array<{
		uri: string;
		snapshot_uri?: string;
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Metrics
	metrics?: Array<{
		name: string;
		unit: string;
		type_key?: string;
		definition?: string;
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Requirements
	requirements?: Array<{
		text: string;
		type_key?: string; // requirement.{type}[.{category}]
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Risks
	risks?: Array<{
		title: string;
		type_key?: string; // risk.{family}[.{variant}]
		probability?: number;
		impact?: 'low' | 'medium' | 'high' | 'critical';
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Decisions
	decisions?: Array<{
		title: string;
		decision_at: string; // ISO datetime
		rationale?: string;
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Explicit edges (for custom relationships)
	edges?: Array<{
		src_kind: string;
		src_id: string;
		rel: string;
		dst_kind: string;
		dst_id: string;
		props?: Record<string, unknown>;
	}>;

	// OPTIONAL: Clarifications for follow-up
	clarifications?: Array<{
		key: string;
		question: string;
		required: boolean;
		choices?: string[];
		help_text?: string;
	}>;

	// OPTIONAL: Meta (model + confidence)
	meta?: {
		model?: string;
		template_keys?: string[];
		confidence?: number; // 0-1
		suggested_facets?: Facets;
	};
}
```

**Type key taxonomy (source of truth)**:

- Projects: `generateProjectTypeKeyGuidance()` in `apps/web/src/lib/services/prompts/core/prompt-components.ts`
- Tasks: `generateTaskTypeKeyGuidance()` in `apps/web/src/lib/services/prompts/core/prompt-components.ts`
- Plans: `generatePlanTypeKeyGuidance()` in `apps/web/src/lib/services/prompts/core/prompt-components.ts`
- Goals: `generateGoalTypeKeyGuidance()` in `apps/web/src/lib/services/prompts/core/prompt-components.ts`
- Documents: `generateDocumentTypeKeyGuidance()` in `apps/web/src/lib/services/prompts/core/prompt-components.ts`
- Outputs: `generateOutputTypeKeyGuidance()` in `apps/web/src/lib/services/prompts/core/prompt-components.ts`
- Risks: `generateRiskTypeKeyGuidance()` in `apps/web/src/lib/services/prompts/core/prompt-components.ts`
- Requirements: `generateRequirementTypeKeyGuidance()` in `apps/web/src/lib/services/prompts/core/prompt-components.ts`
- UI selector lists: `apps/web/src/lib/types/onto-taxonomy.ts`

**Rule**: If you add or change type keys, update **both** prompt guidance and
`apps/web/src/lib/types/onto-taxonomy.ts` so LLM output and UI selectors remain aligned.

### 1.3 Automatic Edge Creation

When you call `instantiateProject()`, it automatically creates these edges:

| Parent Entity | Relationship           | Child Entity                             |
| ------------- | ---------------------- | ---------------------------------------- |
| project       | `has_goal`             | goal                                     |
| project       | `has_requirement`      | requirement                              |
| project       | `has_document`         | document                                 |
| project       | `has_context_document` | document (`document.context.project`)    |
| project       | `has_plan`             | plan (when no goal/milestone ref)        |
| project       | `has_task`             | task (when no plan/goal ref)             |
| project       | `has_output`           | output                                   |
| project       | `has_risk`             | risk                                     |
| project       | `has_decision`         | decision                                 |
| project       | `has_source`           | source                                   |
| project       | `has_metric`           | metric                                   |
| goal          | `has_milestone`        | milestone                                |
| goal          | `has_plan`             | plan (when goal_name specified)          |
| goal          | `has_task`             | task (when goal_name specified, no plan) |
| milestone     | `has_plan`             | plan (when milestone_title specified)    |
| plan          | `has_task`             | task (when plan_name specified)          |

Note: If `context_document` is omitted but `documents` exist, the instantiation
service will attach the first document as `has_context_document`.

### 1.4 Brain Dump → ProjectSpec Adapter

Create a new adapter service at `apps/web/src/lib/services/ontology/braindump-to-ontology-adapter.ts`:

```typescript
// apps/web/src/lib/services/ontology/braindump-to-ontology-adapter.ts

import type { ProjectSpec, TaskState } from '$lib/types/onto';
import type { ParsedOperation } from '$lib/types/brain-dump';
import type { Database } from '@buildos/shared-types';

/**
 * Type key taxonomy source-of-truth:
 * $lib/services/prompts/core/prompt-components.ts
 */
const PROJECT_TYPE_INFERENCE: Array<{ pattern: RegExp; typeKey: string }> = [
	// Technical (specific → general)
	{ pattern: /\bmobile\b|\bios\b|\bandroid\b/, typeKey: 'project.technical.app.mobile' },
	{ pattern: /\bweb app\b|\bwebsite\b|\bweb\b/, typeKey: 'project.technical.app.web' },
	{ pattern: /\bapi\b/, typeKey: 'project.technical.api' },
	{ pattern: /\bfeature\b/, typeKey: 'project.technical.feature' },
	{
		pattern: /\binfrastructure\b|\bdevops\b|\bdeployment\b/,
		typeKey: 'project.technical.infrastructure'
	},
	{ pattern: /\bapp\b/, typeKey: 'project.technical.app' },

	// Creative
	{ pattern: /\bbook\b|\bmanuscript\b/, typeKey: 'project.creative.book' },
	{ pattern: /\barticle\b|\bblog\b|\bessay\b/, typeKey: 'project.creative.article' },
	{ pattern: /\bvideo\b|\bfilm\b|\byoutube\b/, typeKey: 'project.creative.video' },
	{ pattern: /\bbrand\b|\bidentity\b/, typeKey: 'project.creative.brand' },
	{ pattern: /\bdesign\b/, typeKey: 'project.creative.design' },
	{ pattern: /\balbum\b/, typeKey: 'project.creative.album' },

	// Business
	{
		pattern: /\bproduct launch\b|\blaunch\b|\bgtm\b/,
		typeKey: 'project.business.product_launch'
	},
	{ pattern: /\bstartup\b|\bcompany\b/, typeKey: 'project.business.startup' },
	{ pattern: /\bcampaign\b|\bmarketing\b/, typeKey: 'project.business.campaign' },
	{ pattern: /\bfundraise\b|\binvestor\b|\bpitch\b/, typeKey: 'project.business.fundraise' },
	{
		pattern: /\bmarket research\b|\bcompetitive analysis\b/,
		typeKey: 'project.business.market_research'
	},
	{ pattern: /\bhiring\b|\brecruiting\b/, typeKey: 'project.business.hiring' },
	{ pattern: /\bevent\b|\bconference\b|\bsummit\b/, typeKey: 'project.business.event' },

	// Service
	{
		pattern: /\bconsult(ing)?\b|\bclient\b/,
		typeKey: 'project.service.consulting_engagement'
	},
	{ pattern: /\bworkshop\b/, typeKey: 'project.service.workshop' },
	{ pattern: /\bretainer\b/, typeKey: 'project.service.retainer' },
	{ pattern: /\bcoaching\b/, typeKey: 'project.service.coaching_program' },

	// Education
	{ pattern: /\bcourse\b|\bclass\b/, typeKey: 'project.education.course' },
	{ pattern: /\bthesis\b|\bdissertation\b/, typeKey: 'project.education.thesis' },
	{ pattern: /\bcert(ification)?\b/, typeKey: 'project.education.certification' },
	{ pattern: /\bdegree\b/, typeKey: 'project.education.degree' },
	{ pattern: /\bacademic research\b|\bstudy\b/, typeKey: 'project.education.research' },

	// Personal
	{ pattern: /\bhabit\b|\broutine\b/, typeKey: 'project.personal.habit' },
	{ pattern: /\bhealth\b|\bwellness\b|\bfitness\b/, typeKey: 'project.personal.wellness' },
	{ pattern: /\bfinance\b|\bbudget\b/, typeKey: 'project.personal.finance' },
	{ pattern: /\bpersonal goal\b|\bmy goal\b/, typeKey: 'project.personal.goal' }
];

const REALM_KEYWORDS = {
	technical: ['build', 'code', 'app', 'api', 'feature', 'deploy', 'bug', 'database', 'ship'],
	creative: ['write', 'book', 'article', 'publish', 'story', 'content', 'design', 'brand'],
	business: [
		'launch',
		'startup',
		'revenue',
		'customers',
		'market',
		'pitch',
		'fundraise',
		'sales',
		'campaign',
		'hire'
	],
	service: ['client', 'consulting', 'engagement', 'deliverable', 'sow', 'workshop'],
	education: ['class', 'assignment', 'thesis', 'degree', 'learn', 'exam', 'course', 'study'],
	personal: ['habit', 'routine', 'goal', 'health', 'wellness', 'self', 'productivity']
} as const;

const DEFAULT_TYPE_BY_REALM = {
	creative: 'project.creative.article',
	technical: 'project.technical.app',
	business: 'project.business.campaign',
	service: 'project.service.consulting_engagement',
	education: 'project.education.course',
	personal: 'project.personal.goal'
} as const;

type Realm = keyof typeof DEFAULT_TYPE_BY_REALM;

const TASK_TYPE_INFERENCE: Array<{ pattern: RegExp; typeKey: string }> = [
	{
		pattern: /\bmeeting\b|\bcall\b|\bsync\b|\bstandup\b|\b1:1\b/,
		typeKey: 'task.coordinate.meeting'
	},
	{ pattern: /\breview\b|\bapprove\b|\baudit\b|\bqa\b/, typeKey: 'task.review' },
	{ pattern: /\bresearch\b|\binvestigate\b|\bexplore\b/, typeKey: 'task.research' },
	{ pattern: /\bwrite\b|\bdraft\b|\bcreate\b|\bdesign\b|\bbuild\b/, typeKey: 'task.create' },
	{ pattern: /\bplan\b|\bstrategy\b|\boutline\b|\broadmap\b/, typeKey: 'task.plan' },
	{ pattern: /\brefine\b|\bpolish\b|\bedit\b|\biterate\b/, typeKey: 'task.refine' },
	{ pattern: /\bemail\b|\binvoice\b|\bpaperwork\b|\badmin\b/, typeKey: 'task.admin' }
];

const LEGACY_TASK_STATE_MAP: Record<string, TaskState> = {
	backlog: 'todo',
	todo: 'todo',
	in_progress: 'in_progress',
	blocked: 'blocked',
	done: 'done',
	completed: 'done'
};

const LEGACY_PRIORITY_MAP: Record<string, number> = {
	low: 2,
	medium: 3,
	high: 4,
	urgent: 5
};

// ==========================================
// EXPORTED HELPERS (for use in calendar-analysis.service.ts)
// ==========================================

/**
 * Infer project type_key from name and context
 */
export function inferProjectTypeKey(name: string, context?: string): string {
	const searchText = `${name} ${context || ''}`.toLowerCase();

	for (const { pattern, typeKey } of PROJECT_TYPE_INFERENCE) {
		if (pattern.test(searchText)) return typeKey;
	}

	const realm = inferRealm(searchText);
	return DEFAULT_TYPE_BY_REALM[realm];
}

function inferRealm(text: string): Realm {
	const scores: Record<Realm, number> = {
		creative: 0,
		technical: 0,
		business: 0,
		service: 0,
		education: 0,
		personal: 0
	};

	(Object.keys(scores) as Realm[]).forEach((realm) => {
		for (const keyword of REALM_KEYWORDS[realm]) {
			if (text.includes(keyword)) scores[realm] += 1;
		}
	});

	const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
	return (sorted[0]?.[0] as Realm) || 'business';
}

/**
 * Infer task type_key from title
 */
export function inferTaskTypeKey(title: string): string {
	const lowerTitle = title.toLowerCase();

	for (const { pattern, typeKey } of TASK_TYPE_INFERENCE) {
		if (pattern.test(lowerTitle)) return typeKey;
	}

	return 'task.execute';
}

export function normalizeTaskState(data: Record<string, unknown>): TaskState | undefined {
	const raw = `${data.state_key ?? data.status ?? ''}`.trim().toLowerCase();
	return raw ? LEGACY_TASK_STATE_MAP[raw] : undefined;
}

export function normalizePriority(value: unknown): number | undefined {
	if (typeof value === 'number' && value >= 1 && value <= 5) return value;
	if (typeof value === 'string') {
		const mapped = LEGACY_PRIORITY_MAP[value.toLowerCase()];
		return mapped ?? undefined;
	}
	return undefined;
}

export function normalizeDueAt(value?: string): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;

	// Date-only → add time so it validates as ISO datetime
	if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
		const withTime = `${trimmed}T09:00:00`;
		const date = new Date(withTime);
		return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	const parsed = new Date(trimmed);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

export function normalizeProjectState(
	value?: string
): 'planning' | 'active' | 'completed' | 'cancelled' | undefined {
	const raw = value?.trim().toLowerCase();
	if (!raw) return undefined;
	if (raw === 'planning') return 'planning';
	if (raw === 'active' || raw === 'paused') return 'active';
	if (raw === 'completed' || raw === 'complete') return 'completed';
	if (raw === 'cancelled' || raw === 'archived') return 'cancelled';
	return undefined;
}

export function inferContextFacet(
	text: string
):
	| 'personal'
	| 'client'
	| 'commercial'
	| 'internal'
	| 'startup'
	| 'open_source'
	| 'community'
	| 'academic'
	| 'nonprofit' {
	const lower = text.toLowerCase();

	if (
		lower.includes('open source') ||
		lower.includes('open-source') ||
		lower.includes('oss') ||
		lower.includes('github')
	) {
		return 'open_source';
	}
	if (lower.includes('community') || lower.includes('meetup') || lower.includes('volunteer')) {
		return 'community';
	}
	if (
		lower.includes('nonprofit') ||
		lower.includes('non-profit') ||
		lower.includes('charity') ||
		lower.includes('foundation')
	) {
		return 'nonprofit';
	}
	if (
		lower.includes('university') ||
		lower.includes('academic') ||
		lower.includes('thesis') ||
		lower.includes('dissertation') ||
		lower.includes('research')
	) {
		return 'academic';
	}
	if (lower.includes('client') || lower.includes('consult')) return 'client';
	if (lower.includes('startup') || lower.includes('founder')) return 'startup';
	if (lower.includes('team') || lower.includes('internal')) return 'internal';
	if (lower.includes('revenue') || lower.includes('market')) return 'commercial';
	return 'personal';
}

/**
 * Infer project scale from task count
 */
export function inferScale(taskCount: number): 'micro' | 'small' | 'medium' | 'large' | 'epic' {
	if (taskCount <= 3) return 'micro';
	if (taskCount <= 8) return 'small';
	if (taskCount <= 20) return 'medium';
	if (taskCount <= 50) return 'large';
	return 'epic';
}

/**
 * Convert legacy ParsedOperation[] to ProjectSpec
 */
export function convertBrainDumpToProjectSpec(
	operations: ParsedOperation[],
	originalText: string,
	options?: {
		projectSummary?: string;
		projectContext?: string;
	}
): ProjectSpec {
	// Find project operation
	const projectOp = operations.find(
		(op) => op.operation === 'create' && op.table === 'projects' && op.enabled
	);

	if (!projectOp) {
		throw new Error('No project creation operation found');
	}

	// Find task operations
	const taskOps = operations.filter(
		(op) => op.operation === 'create' && op.table === 'tasks' && op.enabled
	);

	const projectName = projectOp.data?.name?.trim();
	if (!projectName) {
		throw new Error('Project name is required but was empty');
	}
	const projectDescription = projectOp.data?.description || options?.projectSummary;
	const projectContext = projectOp.data?.context || options?.projectContext || originalText;
	const trimmedContext = `${projectContext ?? ''}`.trim();
	const planName = taskOps.length > 0 ? 'Initial Plan' : undefined;

	// Build ProjectSpec
	const spec: ProjectSpec = {
		project: {
			name: projectName,
			description: projectDescription,
			type_key: inferProjectTypeKey(projectName, projectContext),
			state_key:
				normalizeProjectState(projectOp.data?.state_key || projectOp.data?.status) ??
				'planning',
			props: {
				facets: {
					context: inferContextFacet(`${projectName} ${projectContext}`),
					scale: inferScale(taskOps.length),
					stage: 'planning'
				},
				// Preserve any additional props from brain dump
				...(projectOp.data?.props || {})
			}
		},

		// Store the brain dump as a context document (only if we have content)
		...(trimmedContext
			? {
					context_document: {
						title: 'Project Context',
						type_key: 'document.context.project',
						state_key: 'draft',
						body_markdown: trimmedContext
					}
				}
			: {}),

		// Create a single plan to hold tasks (only when tasks exist)
		...(planName
			? {
					plans: [
						{
							name: planName,
							type_key: 'plan.phase',
							state_key: 'draft'
						}
					]
				}
			: {}),

		// Convert tasks with proper type/state/priority/date normalization
		...(taskOps.length > 0
			? {
					tasks: taskOps.map((taskOp) => ({
						title: taskOp.data?.title || taskOp.data?.name || 'Untitled Task',
						type_key: inferTaskTypeKey(taskOp.data?.title || taskOp.data?.name || ''),
						state_key: normalizeTaskState(taskOp.data ?? {}) ?? 'todo',
						priority: normalizePriority(taskOp.data?.priority),
						due_at: normalizeDueAt(
							taskOp.data?.due_at || taskOp.data?.due_date || taskOp.data?.start_date
						),
						plan_name: planName, // Attach to the plan when present
						props: {
							...(taskOp.data?.props || {})
						}
					}))
				}
			: {})
	};

	return spec;
}

/**
 * Calendar suggestions come from calendar_project_suggestions.
 * suggested_tasks and event_patterns are stored as JSON and must be parsed.
 */
type CalendarProjectSuggestionRow =
	Database['public']['Tables']['calendar_project_suggestions']['Row'];

export interface CalendarSuggestionTask {
	title: string;
	description?: string;
	details?: string;
	status?: 'backlog' | 'in_progress' | 'done' | 'blocked';
	priority?: 'low' | 'medium' | 'high' | 'urgent' | number;
	task_type?: 'one_off' | 'recurring';
	duration_minutes?: number;
	start_date?: string;
	recurrence_pattern?:
		| 'daily'
		| 'weekdays'
		| 'weekly'
		| 'biweekly'
		| 'monthly'
		| 'quarterly'
		| 'yearly';
	recurrence_ends?: string;
	recurrence_rrule?: string;
	event_id?: string;
	tags?: string[];
}

export interface CalendarSuggestionEventPatterns {
	executive_summary?: string;
	start_date?: string;
	end_date?: string | null;
	tags?: string[];
	slug?: string;
	add_to_existing?: boolean;
	existing_project_id?: string | null;
	deduplication_reasoning?: string;
}

export type CalendarSuggestionInput = Omit<
	CalendarProjectSuggestionRow,
	'suggested_tasks' | 'event_patterns'
> & {
	suggested_tasks?: CalendarSuggestionTask[] | null;
	event_patterns?: CalendarSuggestionEventPatterns | null;
};

/**
 * Legacy task status → ontology TaskState mapping
 */
const CALENDAR_TASK_STATE_MAP: Record<string, TaskState> = {
	backlog: 'todo',
	in_progress: 'in_progress',
	done: 'done',
	blocked: 'blocked'
};

/**
 * Convert calendar suggestion to ProjectSpec
 *
 * @param suggestion - The calendar project suggestion (with parsed JSON fields)
 * @param overrides - Optional overrides for customization:
 *   - name: Override project name
 *   - description: Override project description
 *   - context: Override project context
 *   - includeTasks: Set to false to exclude all tasks
 *   - taskSelections: Map of task keys to boolean (true=include, false=exclude)
 *     Key format: `${suggestion.id}-${taskIndex}` (e.g., "abc123-0", "abc123-1")
 *   - taskModifications: Map of task index to partial task overrides
 */
export function convertCalendarSuggestionToProjectSpec(
	suggestion: CalendarSuggestionInput,
	overrides?: {
		name?: string;
		description?: string;
		context?: string;
		includeTasks?: boolean;
		/** Key format: `${suggestion.id}-${taskIndex}` */
		taskSelections?: Record<string, boolean>;
		taskModifications?: Record<number, any>;
	}
): ProjectSpec {
	const eventPatterns = suggestion.event_patterns ?? {};
	const detectedKeywords = suggestion.detected_keywords ?? [];
	const keywordsText = detectedKeywords.join(' ');
	const name = (
		overrides?.name ||
		suggestion.user_modified_name ||
		suggestion.suggested_name ||
		''
	).trim();
	if (!name) {
		throw new Error('Project name is required for calendar suggestions');
	}
	const description =
		overrides?.description ||
		suggestion.user_modified_description ||
		suggestion.suggested_description ||
		undefined;
	const context =
		overrides?.context ||
		suggestion.user_modified_context ||
		suggestion.suggested_context ||
		undefined;
	const searchText = `${description ?? ''} ${context ?? ''} ${keywordsText}`.toLowerCase();
	const contextText = `${name} ${searchText}`.toLowerCase();
	const tags = Array.isArray(eventPatterns?.tags) ? eventPatterns.tags : [];
	const sourceMetadata = {
		analysis_id: suggestion.analysis_id,
		suggestion_id: suggestion.id,
		calendar_event_ids: suggestion.calendar_event_ids,
		calendar_ids: suggestion.calendar_ids ?? undefined,
		event_count: suggestion.event_count ?? undefined,
		confidence: suggestion.confidence_score,
		detected_keywords: detectedKeywords.length ? detectedKeywords : undefined,
		ai_reasoning: suggestion.ai_reasoning ?? undefined,
		suggested_priority: suggestion.suggested_priority ?? undefined,
		deduplication_reasoning: eventPatterns?.deduplication_reasoning
	};

	const rawTasks = Array.isArray(suggestion.suggested_tasks) ? suggestion.suggested_tasks : [];

	const tasks = rawTasks
		.map((task, index) => {
			const taskKey = `${suggestion.id}-${index}`;
			if (overrides?.taskSelections && overrides.taskSelections[taskKey] === false) {
				return null;
			}
			const modifiedTask = overrides?.taskModifications?.[index]
				? { ...task, ...overrides.taskModifications[index] }
				: task;
			return modifiedTask;
		})
		.filter(Boolean) as CalendarSuggestionTask[];

	const includeTasks = overrides?.includeTasks !== false && tasks.length > 0;
	const taskCount = includeTasks ? tasks.length : 0;
	const planName = includeTasks ? 'Calendar-Based Plan' : undefined;

	const spec: ProjectSpec = {
		project: {
			name,
			description,
			type_key: inferProjectTypeKey(name, searchText),
			state_key: 'active', // suggestion.status is workflow-only; do not map to project state
			props: {
				facets: {
					context: inferContextFacet(contextText),
					scale: inferScale(taskCount),
					stage: 'planning'
				},
				source: 'calendar_analysis',
				source_metadata: sourceMetadata,
				tags,
				executive_summary: eventPatterns?.executive_summary,
				slug: eventPatterns?.slug,
				start_date: eventPatterns?.start_date,
				end_date: eventPatterns?.end_date
			}
		},

		...(context
			? {
					context_document: {
						title: 'Project Context',
						type_key: 'document.context.project',
						state_key: 'draft',
						body_markdown: context
					}
				}
			: {}),

		...(planName
			? {
					plans: [
						{
							name: planName,
							type_key: 'plan.phase',
							state_key: 'active'
						}
					]
				}
			: {}),

		...(includeTasks
			? {
					tasks: tasks.map((task) => {
						const title = task.title?.trim() || 'Untitled Task';
						return {
							title,
							type_key: inferTaskTypeKey(title),
							state_key: CALENDAR_TASK_STATE_MAP[task.status ?? 'backlog'] ?? 'todo',
							priority: normalizePriority(task.priority) ?? 3,
							due_at: normalizeDueAt(task.start_date),
							plan_name: planName,
							props: {
								// Note: ProjectSpec does not support description/start_at directly.
								// Store extra fields in props until instantiation supports them.
								description: task.description,
								details: task.details,
								calendar_event_id: task.event_id,
								task_type: task.task_type,
								start_date: task.start_date,
								duration_minutes: task.duration_minutes,
								recurrence_pattern: task.recurrence_pattern,
								recurrence_ends: task.recurrence_ends,
								recurrence_rrule: task.recurrence_rrule,
								tags: task.tags
							}
						};
					})
				}
			: {})
	};

	return spec;
}

// ==========================================
// MODULE EXPORTS SUMMARY
// ==========================================
// Types:
//   - CalendarSuggestionTask
//   - CalendarSuggestionEventPatterns
//   - CalendarSuggestionInput
//
// Main Converters:
//   - convertBrainDumpToProjectSpec(operations, originalText, options?)
//   - convertCalendarSuggestionToProjectSpec(suggestion, overrides?)
//
// Helper Functions (for use in calendar-analysis.service.ts):
//   - inferProjectTypeKey(name, context?)
//   - inferTaskTypeKey(title)
//   - inferContextFacet(text)
//   - inferScale(taskCount)
//   - normalizeTaskState(data)
//   - normalizePriority(value)
//   - normalizeDueAt(value?)
//   - normalizeProjectState(value?)
```

### 1.5 Integration Points

#### A. Brain Dump Stream Endpoint (Onboarding New Project Only)

Modify `apps/web/src/routes/api/braindumps/stream/+server.ts`:

- If `selectedProjectId` is `null` / `'new'`, **bypass `OperationsExecutor`** and create ontology data.
- Preserve the existing response shape used by onboarding (`projectInfo`) but populate it from `onto_projects`.

```typescript
import { instantiateProject } from '$lib/services/ontology/instantiation.service';
import { convertBrainDumpToProjectSpec } from '$lib/services/ontology/braindump-to-ontology-adapter';

// After parsing operations from LLM...
const projectSpec = convertBrainDumpToProjectSpec(result.operations, content, {
	projectSummary: result.summary,
	projectContext: result.contextResult?.projectCreate?.context
});

const { project_id, counts } = await instantiateProject(supabase, projectSpec, userId);

const { data: project } = await supabase
	.from('onto_projects')
	.select('id, name')
	.eq('id', project_id)
	.single();

finalResult = {
	...result,
	projectInfo: project ? { id: project.id, name: project.name, isNew: true } : undefined,
	ontology: { project_id, counts }
};
```

#### B. Brain Dump Generate Endpoint (Save Path)

Modify `apps/web/src/routes/api/braindumps/generate/+server.ts`:

- In `action: 'save'`, if this is a **new project**, run the same adapter + `instantiateProject()` path.
- Keep `projectInfo` in the response for UI compatibility.

#### C. Calendar Analysis Service

Modify `apps/web/src/lib/services/calendar-analysis.service.ts`:

- If `add_to_existing` is true, **do not** create a new project. Instead:
    - Insert tasks into `onto_tasks`
    - Create `has_task` edges to the existing `onto_projects` record (or to a plan if you add one)
- Otherwise, convert to `ProjectSpec` and call `instantiateProject()`.

```typescript
import { instantiateProject } from '$lib/services/ontology/instantiation.service';
import { convertCalendarSuggestionToProjectSpec } from '$lib/services/ontology/braindump-to-ontology-adapter';
import type { TaskState } from '$lib/types/onto';
import { Json } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';

// Note: export these helpers + CalendarSuggestionInput from the adapter or move to a shared util
import {
	inferTaskTypeKey,
	normalizeDueAt,
	normalizePriority
} from '$lib/services/ontology/braindump-to-ontology-adapter';
import type { CalendarSuggestionInput } from '$lib/services/ontology/braindump-to-ontology-adapter';

const CALENDAR_TASK_STATE_MAP: Record<string, TaskState> = {
  backlog: 'todo',
  in_progress: 'in_progress',
  done: 'done',
  blocked: 'blocked'
};

/**
 * Add tasks from calendar suggestion to an existing ontology project
 */
async function addTasksToExistingProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  tasks: CalendarSuggestionInput['suggested_tasks']
): Promise<{ taskCount: number; planId?: string }> {
  if (!tasks?.length) {
    return { taskCount: 0 };
  }

  // Get actor ID for the user
  const { data: actorId, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
    p_user_id: userId
  });

  if (actorError || !actorId) {
    throw new Error(`Failed to resolve actor: ${actorError?.message}`);
  }

  // Check if project has an existing plan we can attach to
  const { data: existingPlans } = await supabase
    .from('onto_plans')
    .select('id, name')
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  let planId: string | undefined;

  // Create a new plan if none exists
  if (!existingPlans?.length) {
    const { data: newPlan, error: planError } = await supabase
      .from('onto_plans')
      .insert({
        project_id: projectId,
        name: 'Calendar-Imported Tasks',
        type_key: 'plan.phase',
        state_key: 'active',
        props: { source: 'calendar_analysis' } as Json,
        created_by: actorId
      })
      .select('id')
      .single();

    if (planError || !newPlan) {
      throw new Error(`Failed to create plan: ${planError?.message}`);
    }

    planId = newPlan.id;

    // Create project -> plan edge
    await supabase.from('onto_edges').insert({
      project_id: projectId,
      src_kind: 'project',
      src_id: projectId,
      rel: 'has_plan',
      dst_kind: 'plan',
      dst_id: planId
    });
  } else {
    planId = existingPlans[0].id;
  }

  // Insert tasks
  const taskInserts = tasks.map((task) => {
    const title = task.title?.trim() || 'Untitled Task';

    return {
      project_id: projectId,
      title,
      type_key: inferTaskTypeKey(title),
      state_key: CALENDAR_TASK_STATE_MAP[task.status ?? 'backlog'] ?? 'todo',
      priority: normalizePriority(task.priority) ?? 3,
      start_at: normalizeDueAt(task.start_date) ?? null,
      due_at: normalizeDueAt(task.start_date) ?? null,
      description: task.description ?? null,
      props: {
        details: task.details,
        calendar_event_id: task.event_id,
        task_type: task.task_type,
        recurrence_pattern: task.recurrence_pattern,
        recurrence_ends: task.recurrence_ends,
        recurrence_rrule: task.recurrence_rrule,
        duration_minutes: task.duration_minutes,
        tags: task.tags
      } as Json,
      created_by: actorId
    };
  });

  const { data: insertedTasks, error: tasksError } = await supabase
    .from('onto_tasks')
    .insert(taskInserts)
    .select('id');

  if (tasksError) {
    throw new Error(`Failed to insert tasks: ${tasksError.message}`);
  }

  // Create plan -> task edges
  const edgeInserts = (insertedTasks ?? []).map((task) => ({
    project_id: projectId,
    src_kind: 'plan',
    src_id: planId,
    rel: 'has_task',
    dst_kind: 'task',
    dst_id: task.id
  }));

  if (edgeInserts.length > 0) {
    await supabase.from('onto_edges').insert(edgeInserts);
  }

  return { taskCount: insertedTasks?.length ?? 0, planId };
}

async acceptSuggestion(
  suggestionId: string,
  userId: string,
  modifications?: {
    name?: string;
    description?: string;
    context?: string;
    includeTasks?: boolean;
    taskSelections?: Record<string, boolean>;
    taskModifications?: Record<number, any>;
  }
) {
  const suggestion = await this.getSuggestion(suggestionId, userId);

  const eventPatterns = (suggestion.event_patterns || {}) as {
    add_to_existing?: boolean;
    existing_project_id?: string | null;
  };

  if (eventPatterns.add_to_existing && eventPatterns.existing_project_id) {
    const { taskCount, planId } = await addTasksToExistingProject(
      this.supabase,
      eventPatterns.existing_project_id,
      userId,
      suggestion.suggested_tasks
    );

    return {
      projectId: eventPatterns.existing_project_id,
      addedToExisting: true,
      taskCount,
      planId
    };
  }

  const projectSpec = convertCalendarSuggestionToProjectSpec(suggestion, modifications);
  const { project_id, counts } = await instantiateProject(this.supabase, projectSpec, userId);

  return { projectId: project_id, counts, addedToExisting: false };
}
```

#### D. Onboarding UI Response Handling

- `ProjectsCaptureStep.svelte` expects `result.projectInfo`. Keep this field populated from `onto_projects`.
- Prefer `result.ontology.project_id` for internal routing, and show `counts` in `SummaryStep.svelte`.
- Update `BrainDumpParseResult` in `apps/web/src/lib/types/brain-dump.ts` to include an optional `ontology` block.
- Ensure onboarding state updates `calendarAnalyzed` when analysis completes so the summary reflects it.

### 1.6 Type Definitions

#### ParsedOperation Reference (from `$lib/types/brain-dump.ts`)

The adapter consumes `ParsedOperation[]` from the brain dump LLM response. Here's the structure for reference:

```typescript
// From apps/web/src/lib/types/brain-dump.ts
export type TableName =
	| 'projects'
	| 'tasks'
	| 'notes'
	| 'phases'
	| 'project_context'
	| 'project_notes'
	| 'brain_dumps'
	| 'daily_briefs'
	| 'project_questions';

export type OperationType = 'create' | 'update' | 'delete';

export interface ParsedOperation {
	id: string;
	table: TableName;
	operation: OperationType;
	data: {
		// Project references - only ONE should be present
		project_id?: string; // Direct UUID for existing projects
		project_ref?: string; // Reference to project being created in same batch

		// Flexible payload (see ProjectOperation / TaskOperation below)
		[key: string]: any;
	};
	ref?: string; // This operation's reference (for new items)
	searchQuery?: string;
	conditions?: Record<string, any>; // For update operations
	enabled: boolean;
	error?: string;
	reasoning?: string;
	result?: Record<string, any>;
}
```

See `ProjectOperation` and `TaskOperation` in `apps/web/src/lib/types/brain-dump.ts` for the
expected fields (name/context/status for projects; title/priority/status/date for tasks).

#### CalendarProjectSuggestion Reference

`calendar_project_suggestions` is the source of truth for calendar analysis output (see
`packages/shared-types/src/database.schema.ts`). `suggested_tasks` and `event_patterns` are stored
as `Json`, so runtime parsing is required before conversion (see adapter section above).

#### BrainDumpParseResult Update

Extend the existing interface in `apps/web/src/lib/types/brain-dump.ts` by adding
an optional `ontology` block (do **not** replace existing required fields):

```typescript
// Add to existing BrainDumpParseResult interface
export interface BrainDumpParseResult {
	// Existing required fields include:
	// title, summary, insights, operations, metadata, ...

	// Legacy compatibility - populated from onto_projects
	projectInfo?: {
		id: string;
		name: string;
		isNew: boolean;
	};

	// NEW: Ontology creation result
	ontology?: {
		project_id: string;
		counts: {
			goals: number;
			requirements: number;
			plans: number;
			tasks: number;
			outputs: number;
			documents: number;
			sources: number;
			metrics: number;
			milestones: number;
			risks: number;
			decisions: number;
			edges: number;
		};
	};
}
```

#### Error Handling in Adapter

The adapter should handle edge cases gracefully:

```typescript
/**
 * Convert brain dump operations to ProjectSpec with error handling
 */
export function convertBrainDumpToProjectSpec(
	operations: ParsedOperation[],
	originalText: string,
	options?: {
		projectSummary?: string;
		projectContext?: string;
	}
): ProjectSpec {
	// Find project operation - required
	const projectOp = operations.find(
		(op) => op.operation === 'create' && op.table === 'projects' && op.enabled
	);

	if (!projectOp) {
		// No project found - this could happen if brain dump only contains tasks
		// for an existing project. In onboarding, we always expect a new project.
		throw new Error(
			'No project creation operation found. Brain dump must create a new project during onboarding.'
		);
	}

	// Filter for enabled task operations only
	const taskOps = operations.filter(
		(op) => op.operation === 'create' && op.table === 'tasks' && op.enabled
	);

	// Handle multiple project operations (edge case - take first)
	const allProjectOps = operations.filter(
		(op) => op.operation === 'create' && op.table === 'projects'
	);
	if (allProjectOps.length > 1) {
		console.warn(
			`[BrainDump Adapter] Multiple project operations found (${allProjectOps.length}), using first one`
		);
	}

	// Validate project name exists
	const projectName = projectOp.data?.name?.trim();
	if (!projectName) {
		throw new Error('Project name is required but was empty');
	}

	// Continue with conversion...
	// (rest of implementation as shown above)
}
```

### 1.7 Implementation Checklist

| Step | File                                         | Change                                        |
| ---- | -------------------------------------------- | --------------------------------------------- |
| 1    | Create `braindump-to-ontology-adapter.ts`    | New adapter service                           |
| 2    | Modify `/api/braindumps/stream/+server.ts`   | Instantiate ontology for new projects         |
| 3    | Modify `/api/braindumps/generate/+server.ts` | Instantiate ontology for new projects         |
| 4    | Modify `calendar-analysis.service.ts`        | Instantiate ontology or add tasks to existing |
| 5    | Update `ProjectsCaptureStep.svelte`          | Handle ontology response + projectInfo        |
| 6    | Update `SummaryStep.svelte`                  | Show ontology counts                          |
| 7    | Update `$lib/types/brain-dump.ts`            | Add `ontology` block to BrainDumpParseResult  |
| 8    | Remove `OperationsExecutor` usage            | Only in onboarding new-project paths          |

### 1.8 Validation Notes

#### URI Validation for Sources

The `ProjectSpec.sources` array requires valid URLs:

```typescript
sources: z.array(
	z.object({
		uri: z.string().url(), // ← Must be a valid URL or validation fails
		snapshot_uri: z.string().url().optional(),
		props: z.record(z.unknown()).optional()
	})
).optional();
```

If brain dump or calendar analysis extracts a source that isn't a valid URL, either:

1. Skip it silently
2. Attempt URL normalization (prepend `https://` if missing)
3. Store it in `props` instead of `uri`

#### Datetime Validation

`ProjectSpec` uses `z.string().datetime()` for `start_at`, `end_at`, `due_at`, and `decision_at`.
Date-only strings like `YYYY-MM-DD` will fail validation unless normalized.

Use `normalizeDueAt()` (or equivalent) to coerce date-only values into ISO datetimes
(e.g., `2026-01-07T09:00:00`).

#### Facets Strictness

`FacetsSchema` is strict. Only `context`, `scale`, and `stage` are allowed inside `props.facets`.
Any additional attributes should live at `props.*` (not nested under `facets`), or validation will fail.

#### Task type_key Validation

Task `type_key` must match the pattern:

```
^task\.[a-z_]+(\.[a-z_]+)?$
```

If unsure, default to `task.execute`.

#### Project type_key Validation

Project `type_key` must match the pattern:

```
^project\.[a-z_]+\.[a-z_]+(\.[a-z_]+)?$
```

Examples of valid keys:

- `project.business.product_launch`
- `project.technical.app.mobile`
- `project.creative.book`

Invalid examples:

- `project.launch` (missing deliverable segment)
- `Project.Business.Launch` (uppercase not allowed)
- `business.product_launch` (missing "project." prefix)

---

## Part 2: BuildOS Capabilities Education

### 2.1 Philosophy: "Meet You Where You Are"

The core message for onboarding education:

> **BuildOS meets you where you are.**
>
> Whether you have a pile of disconnected tasks, a single ambitious goal, or just a vague idea — BuildOS adapts to your starting point and helps you build from there.

### 2.2 Educational Step Content

#### Step: "How BuildOS Works With You"

**Section 1: Start Anywhere**

```
BuildOS adapts to wherever you are in your process:

┌─────────────────────────────────────────────────────────────────┐
│  HAVE A BUNCH OF TASKS?                                         │
│  ────────────────────                                           │
│  We'll organize them into a project with:                       │
│  • A clear goal                                                 │
│  • A plan with logical phases                                   │
│  • All your tasks connected and prioritized                     │
│                                                                 │
│  [Visual: scattered tasks → organized project graph]            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  ONLY HAVE A GOAL?                                              │
│  ─────────────────                                              │
│  We'll reverse-engineer what you need:                          │
│  • Key milestones to reach your goal                            │
│  • A plan with the steps to get there                           │
│  • All the tasks needed to make progress                        │
│                                                                 │
│  [Visual: single goal → milestones → plan → tasks]              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  JUST HAVE AN IDEA?                                             │
│  ─────────────────                                              │
│  Chat with BuildOS to explore it:                               │
│  • Think out loud without pressure                              │
│  • Let ideas take shape naturally                               │
│  • Turn clarity into action when you're ready                   │
│                                                                 │
│  [Visual: brain dump → conversation → structured project]       │
└─────────────────────────────────────────────────────────────────┘
```

**Section 2: Your AI Thought Partner**

```
BuildOS is more than a task manager — it's a thinking partner.

CHAT ABOUT YOUR PROJECTS
• Give updates on what you've done
• Discuss new plans and pivots
• Surface tasks that came up
• Ask for help prioritizing

THE AI HELPS YOU:
• Stay organized without the overhead
• Get unstuck when you're overwhelmed
• See connections you might miss
• Make progress feel natural

[Visual: Chat interface with project context]
```

**Section 3: Stay on Track (Bonus Features)**

```
DAILY BRIEFS
Your personalized morning summary:
• What's due today
• Project progress
• Things that need attention
• Suggested focus areas

SMS REMINDERS
Get nudged when it matters:
• Important deadlines
• Tasks you've been avoiding
• Daily accountability check-ins

CALENDAR INTEGRATION
Sync with Google Calendar:
• See when you're free
• Auto-detect projects from meetings
• Schedule tasks around commitments
```

### 2.3 Step Configuration

Add to `apps/web/src/lib/config/onboarding.config.ts` **and** wire it into the v2 route
(`apps/web/src/routes/onboarding/+page.svelte`), which currently hard-codes step order:

```typescript
{
  id: 'capabilities',
  component: CapabilitiesStep,
  title: 'How BuildOS Works',
  subtitle: 'Meet you where you are',
  order: 1, // After Welcome, before Projects Capture
  required: false,
  skippable: true
}
```

#### Current V2 Step Order (as Implemented)

The v2 route (`apps/web/src/routes/onboarding/+page.svelte`) currently hard‑codes steps:

| Step ID       | Component             | Order | Required | Notes                                  |
| ------------- | --------------------- | ----- | -------- | -------------------------------------- |
| `welcome`     | `WelcomeStep`         | 0     | Yes      | Intro                                  |
| `clarity`     | `ProjectsCaptureStep` | 1     | No       | Brain dump + calendar connect/analysis |
| `focus`       | `NotificationsStep`   | 2     | No       | SMS + email prefs                      |
| `flexibility` | `FlexibilityStep`     | 3     | No       | Feature tour                           |
| `profile`     | `CombinedProfileStep` | 4     | Yes      | Archetype + challenges                 |
| `admin_tour`  | `AdminTourStep`       | 5     | No       | Optional                               |
| `summary`     | `SummaryStep`         | 6     | Yes      | Review + finish                        |

#### Proposed Updates

1. Insert **CapabilitiesStep** after `WelcomeStep`.
2. Decide whether to:
    - **Option A**: Keep calendar analysis inside `ProjectsCaptureStep`.
    - **Option B**: Split calendar analysis into its own `CalendarAnalysisStep`.
3. Capture preferences by either:
    - Extending `CombinedProfileStep`, or
    - Adding a dedicated `PreferencesStep` and reordering.

**Note:** Any step order changes require updates to both `onboarding.config.ts` **and**
the hard‑coded switch in `apps/web/src/routes/onboarding/+page.svelte`.

---

## Part 3: Intelligent Preference System

### 3.1 Research Findings

Based on analysis of ChatGPT, Claude, Motion, and Reclaim:

| System      | Preference Approach                                | Key Insight                                             |
| ----------- | -------------------------------------------------- | ------------------------------------------------------- |
| **ChatGPT** | 3 layers: personality, custom instructions, memory | Custom instructions = evergreen; Memory = dynamic facts |
| **Claude**  | Profile preferences + project instructions         | Work-focused; remembers project details over personal   |
| **Motion**  | Learns from behavior; scheduling preferences       | Caps daily meetings, buffer times, focus blocks         |
| **Reclaim** | AI-driven with priority-based scheduling           | Auto-adjusts based on deadlines and priorities          |

**Key Insight**: Preferences should be **situational and actionable**, not noise. The best preferences are ones the AI can act on immediately.

### 3.2 Preference Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     USER PREFERENCES                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   GLOBAL PREFERENCES (users table)                              │
│   ───────────────────────────────                               │
│   Applied to ALL conversations                                  │
│                                                                 │
│   • communication_style: 'direct' | 'supportive' | 'socratic'  │
│   • response_length: 'concise' | 'detailed' | 'adaptive'       │
│   • proactivity_level: 'minimal' | 'moderate' | 'high'         │
│   • working_hours: { start: '09:00', end: '18:00', tz: 'PST' } │
│   • primary_role: string (e.g., 'Product Manager')             │
│   • domain_context: string (e.g., 'B2B SaaS startup')          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   PROJECT PREFERENCES (onto_projects.props.preferences)         │
│   ─────────────────────────────────────────────────             │
│   Applied when chatting about a specific project                │
│                                                                 │
│   • planning_depth: 'lightweight' | 'detailed' | 'rigorous'    │
│   • update_frequency: 'daily' | 'weekly' | 'as_needed'         │
│   • collaboration_mode: 'solo' | 'async_team' | 'realtime'     │
│   • risk_tolerance: 'cautious' | 'balanced' | 'aggressive'     │
│   • deadline_flexibility: 'strict' | 'flexible' | 'aspirational'│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 When Preferences Are Injected

**Critical Principle**: Preferences are only injected when they're **actionable in context**.

| Context              | Preferences Injected                  | Example                                                           |
| -------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| **Project chat**     | Global + that project's preferences   | "User prefers detailed plans; this project has strict deadlines"  |
| **Global chat**      | Global only                           | "User works 9-5 PST; prefers concise responses"                   |
| **Project creation** | Global + inferred from conversation   | "User is in B2B SaaS; infer appropriate project type"             |
| **Daily brief**      | Global + active projects' preferences | "User prefers direct communication; project X is deadline-strict" |

### 3.4 Preference Collection During Onboarding

#### A. Communication Style (Required)

```svelte
<div class="preference-question">
	<h3>How do you like AI to communicate?</h3>
	<div class="options">
		<button onclick={() => setPreference('communication_style', 'direct')}>
			<strong>Direct</strong>
			<span>Get to the point quickly. Skip the fluff.</span>
		</button>
		<button onclick={() => setPreference('communication_style', 'supportive')}>
			<strong>Supportive</strong>
			<span>Encouraging and patient. Help me think through things.</span>
		</button>
		<button onclick={() => setPreference('communication_style', 'socratic')}>
			<strong>Socratic</strong>
			<span>Ask questions to help me find my own answers.</span>
		</button>
	</div>
</div>
```

#### B. Proactivity Level (Required)

```svelte
<div class="preference-question">
	<h3>How proactive should BuildOS be?</h3>
	<div class="options">
		<button onclick={() => setPreference('proactivity_level', 'minimal')}>
			<strong>Just Answer</strong>
			<span>Only respond to what I ask. No unsolicited insights.</span>
		</button>
		<button onclick={() => setPreference('proactivity_level', 'moderate')}>
			<strong>Helpful Nudges</strong>
			<span>Surface important things I might miss, but don't overdo it.</span>
		</button>
		<button onclick={() => setPreference('proactivity_level', 'high')}>
			<strong>Think Ahead</strong>
			<span>Proactively flag risks, suggest next steps, spot opportunities.</span>
		</button>
	</div>
</div>
```

#### C. Working Context (Optional)

```svelte
<div class="preference-question">
	<h3>Tell us about your work (optional)</h3>
	<p class="subtext">This helps BuildOS understand your context better.</p>

	<label>
		Your role
		<input
			type="text"
			bind:value={primaryRole}
			placeholder="e.g., Product Manager, Freelancer, Student"
		/>
	</label>

	<label>
		Your domain/industry
		<input
			type="text"
			bind:value={domainContext}
			placeholder="e.g., B2B SaaS, Healthcare, Creative agency"
		/>
	</label>
</div>
```

### 3.5 How Preferences Modify AI Behavior

Preferences are injected into the planner context via `loadUserProfile()` in
`apps/web/src/lib/services/agent-context-service.ts`. **Today** it only returns
name/email; this section describes the **planned** enhancement:

```typescript
// Enhanced loadUserProfile method (planned)
private async loadUserProfile(
  userId: string,
  projectId?: string
): Promise<{ summary: string; preferences: UserPreferences } | undefined> {
  const { data: user } = await this.supabase
    .from('users')
    .select('email, name, preferences')
    .eq('id', userId)
    .single();

  if (!user) return undefined;

  let projectPrefs = {};

  if (projectId) {
    const { data: project } = await this.supabase
      .from('onto_projects')
      .select('props')
      .eq('id', projectId)
      .single();

    projectPrefs = project?.props?.preferences || {};
  }

  const preferences = {
    ...(user.preferences || {}),
    ...projectPrefs
  };

  const prefParts: string[] = [];

  if (preferences.communication_style) {
    const styleGuide = {
      direct: 'Be direct and concise. Skip pleasantries and get to the point.',
      supportive: 'Be encouraging and patient. Acknowledge their efforts.',
      socratic: 'Ask guiding questions to help them think through problems.'
    };
    prefParts.push(styleGuide[preferences.communication_style]);
  }

  if (preferences.proactivity_level === 'minimal') {
    prefParts.push('Only respond to what is asked. Do not volunteer unsolicited insights.');
  } else if (preferences.proactivity_level === 'high') {
    prefParts.push('Proactively surface risks, blockers, and opportunities.');
  }

  if (preferences.primary_role) {
    prefParts.push(`User role: ${preferences.primary_role}`);
  }

  if (preferences.domain_context) {
    prefParts.push(`Domain context: ${preferences.domain_context}`);
  }

  if (projectPrefs.deadline_flexibility === 'strict') {
    prefParts.push('This project has strict deadlines - emphasize timeline adherence.');
  }

  if (projectPrefs.planning_depth === 'rigorous') {
    prefParts.push('User wants detailed planning for this project.');
  }

  return {
    summary: `User: ${user.name || user.email}`,
    preferences: {
      raw: preferences,
      promptInjection: prefParts.length > 0
        ? `\n\n## User Preferences\n${prefParts.join('\n')}`
        : ''
    }
  };
}
```

### 3.6 Preference Schema (Database)

Add to `users` table (column does **not** exist today; requires schema migration + updated generated types):

#### Migration File

Create `supabase/migrations/YYYYMMDDHHMMSS_add_user_preferences.sql`:

```sql
-- Add preferences column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN users.preferences IS 'User preferences for AI behavior and communication style';

-- RLS: Users can only read/update their own preferences
-- (Existing users table RLS should already cover this, but verify)

-- Create index for common preference lookups if needed
-- CREATE INDEX IF NOT EXISTS idx_users_preferences_gin ON users USING gin(preferences);

-- Example structure:
-- {
--   "communication_style": "direct",
--   "response_length": "concise",
--   "proactivity_level": "moderate",
--   "working_hours": { "start": "09:00", "end": "18:00", "timezone": "America/Los_Angeles" },
--   "primary_role": "Product Manager",
--   "domain_context": "B2B SaaS startup"
-- }
```

#### Update Generated Types

After running the migration:

```bash
# Regenerate TypeScript types from Supabase schema
pnpm supabase gen types typescript --project-id $PROJECT_ID > packages/shared-types/src/database.schema.ts

# Or if using local development
pnpm supabase gen types typescript --local > packages/shared-types/src/database.schema.ts
```

The `users` table type in `database.schema.ts` should then include:

```typescript
preferences: Json | null; // JSONB column
```

#### loadUserProfile Migration Path

The `loadUserProfile()` method in `agent-context-service.ts` currently returns `Promise<string | undefined>`. The enhanced version returns a different shape. To migrate safely:

1. **Create new method** `loadUserProfileWithPreferences()` with the new signature
2. **Update callers** in `prompt-generation-service.ts` to use the new method
3. **Deprecate** the old method after all callers are updated
4. **Remove** the old method in a follow-up PR

```typescript
// Step 1: Add new method alongside existing
private async loadUserProfileWithPreferences(
  userId: string,
  projectId?: string
): Promise<{ summary: string; preferences: UserPreferences } | undefined> {
  // New implementation
}

// Step 2: Keep old method for backward compatibility
/** @deprecated Use loadUserProfileWithPreferences instead */
private async loadUserProfile(userId: string): Promise<string | undefined> {
  const result = await this.loadUserProfileWithPreferences(userId);
  return result?.summary;
}
```

Project preferences live in `onto_projects.props.preferences`:

```typescript
// When creating a project, preferences can be set
const projectSpec: ProjectSpec = {
	project: {
		name: 'My Project',
		type_key: 'project.business.product_launch',
		props: {
			preferences: {
				planning_depth: 'detailed',
				deadline_flexibility: 'strict',
				collaboration_mode: 'async_team'
			}
		}
	}
};
```

### 3.7 Preference Best Practices

| Do                                        | Don't                                     |
| ----------------------------------------- | ----------------------------------------- |
| Inject only actionable preferences        | Include every preference in every request |
| Use natural language in prompts           | Use raw JSON in prompts                   |
| Override contextually                     | Apply all preferences globally            |
| Make preferences discoverable in settings | Hide preferences after onboarding         |
| Allow per-project customization           | Force one-size-fits-all                   |

### 3.8 Token Budget for Preferences

Preferences should use **~300 tokens** in the user profile budget. The current budget lives in
`apps/web/src/lib/services/context/types.ts` under `TOKEN_BUDGETS.PLANNER.USER_PROFILE`.

```typescript
// In apps/web/src/lib/services/context/types.ts
const TOKEN_BUDGETS = {
	PLANNER: {
		SYSTEM_PROMPT: 800,
		CONVERSATION: 2500,
		LOCATION_CONTEXT: 1000,
		USER_PROFILE: 300,
		BUFFER: 400
	}
};
```

---

## Part 4: Implementation Priority

### Priority Matrix

| Task                                            | Impact | Effort | Priority |
| ----------------------------------------------- | ------ | ------ | -------- |
| Create `braindump-to-ontology-adapter.ts`       | High   | Low    | **P0**   |
| Modify brain dump stream to use ontology        | High   | Medium | **P0**   |
| Modify brain dump generate to use ontology      | High   | Medium | **P0**   |
| Modify calendar analysis to use ontology        | High   | Medium | **P0**   |
| Add ontology task insertion for add-to-existing | High   | Medium | **P0**   |
| Add Capabilities education step                 | Medium | Low    | **P1**   |
| Add communication_style preference              | Medium | Low    | **P1**   |
| Add proactivity_level preference                | Medium | Low    | **P1**   |
| Inject preferences into planner context         | Medium | Medium | **P1**   |
| Add working context (role/domain)               | Low    | Low    | **P2**   |
| Add project-specific preferences                | Low    | Medium | **P2**   |
| Replace placeholder onboarding assets           | Low    | Medium | **P3**   |

### Phase 1: Ontology Creation for Onboarding (P0)

**Deliverables:**

1. `braindump-to-ontology-adapter.ts` service
2. Updated brain dump stream endpoint (new projects only)
3. Updated brain dump generate endpoint (save path)
4. Updated calendar analysis service (new + add-to-existing)
5. Updated ProjectsCaptureStep to handle ontology responses

**Testing:**

- Create project via onboarding brain dump → verify in `onto_projects`
- Accept calendar suggestion → verify in `onto_projects` (or tasks added to existing project)
- Verify edges are created correctly
- Verify context document is created

### Phase 2: Education + Core Preferences (P1)

**Deliverables:**

1. `CapabilitiesStep.svelte` component
2. Communication style preference capture
3. Proactivity level preference capture
4. `loadUserProfile()` enhancement
5. Preference injection into planner prompts

**Testing:**

- New user sees capabilities step
- Preferences saved to database
- AI responses reflect preference settings

### Phase 3: Advanced Preferences (P2)

**Deliverables:**

1. Working context capture (role, domain)
2. Project-specific preferences in UI
3. Preferences settings page

---

## Part 5: Open Questions

1. **Preference Reset**: Should users be able to "re-onboard" to reset preferences?

2. **Preference Learning**: Should BuildOS infer preferences from behavior over time (like Motion)?

3. **Preference Conflicts**: If global says "concise" but project says "detailed", which wins?

4. **A/B Testing**: Should we A/B test preference impact on user satisfaction?

5. **Preference Transparency**: Should we show users what preferences are being applied in each conversation?

---

## Appendix A: File Map

### Onboarding Components

- `apps/web/src/routes/onboarding/+page.svelte` - Main route
- `apps/web/src/lib/components/onboarding-v2/` - Step components
- `apps/web/src/lib/config/onboarding.config.ts` - Configuration
- `apps/web/src/lib/services/onboarding-v2.service.ts` - Service layer

### Brain Dump System

- `apps/web/src/routes/api/braindumps/stream/+server.ts` - Stream endpoint
- `apps/web/src/lib/services/braindump-api.service.ts` - Client service
- `apps/web/src/lib/utils/operations/operations-executor.ts` - Legacy executor (to be replaced)
- `apps/web/src/lib/services/ontology/braindump-to-ontology-adapter.ts` - Ontology adapter (new)

### Calendar Analysis

- `apps/web/src/lib/services/calendar-analysis.service.ts` - Analysis service

### Ontology System

- `apps/web/src/lib/services/ontology/instantiation.service.ts` - Project instantiation
- `apps/web/src/lib/types/onto.ts` - Type definitions

### Agent Context

- `apps/web/src/lib/services/agent-context-service.ts` - Context assembly
- `apps/web/src/lib/services/agentic-chat/prompts/` - Prompt generation

---

---

## Completion Summary

**All 3 Phases Complete as of January 7, 2026**

| Phase | Scope                        | Key Deliverables                                                              |
| ----- | ---------------------------- | ----------------------------------------------------------------------------- |
| 1     | Ontology Integration         | Brain dumps and calendar analysis create `onto_*` entities                    |
| 2     | Education + Core Preferences | CapabilitiesStep, communication style, proactivity level                      |
| 3     | Advanced Preferences         | Role/domain context, settings tab, project preferences, full prompt injection |

**Related Documentation:**

- [User Preferences System](../preferences/README.md) - Complete preferences architecture
- [Onboarding README](./README.md) - Flow overview and component list
- [Ontology System](../ontology/README.md) - Project structure created during onboarding

---

**Document Author**: Claude
**Last Updated**: 2026-01-07
