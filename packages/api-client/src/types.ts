// packages/api-client/src/types.ts
/**
 * Request and response shapes for the endpoints the client wraps.
 *
 * Every type names the route file it mirrors. Shapes are structural and minimal:
 * only fields the handler actually puts in `data`. Where a handler returns table
 * rows, the generated `Database` row types are used so a schema change shows up
 * here as a type error.
 */
import type {
	AgenticChatWorkerTurnDescriptorV1,
	ChatTurnStatusV1,
	Database,
	Json
} from '@buildos/shared-types';

type Tables = Database['public']['Tables'];

export type OntoProjectRow = Tables['onto_projects']['Row'];
export type OntoTaskRow = Tables['onto_tasks']['Row'];
export type OntoDocumentRow = Tables['onto_documents']['Row'];
export type OntoGoalRow = Tables['onto_goals']['Row'];
export type OntoPlanRow = Tables['onto_plans']['Row'];
export type OntoMilestoneRow = Tables['onto_milestones']['Row'];
export type OntoRiskRow = Tables['onto_risks']['Row'];
export type OntoEventRow = Tables['onto_events']['Row'];
export type OntoEventSyncRow = Tables['onto_event_sync']['Row'];
export type OntoRequirementRow = Tables['onto_requirements']['Row'];
export type OntoSourceRow = Tables['onto_sources']['Row'];
export type OntoMetricRow = Tables['onto_metrics']['Row'];
export type OntoAssetRow = Tables['onto_assets']['Row'];
export type VoiceNoteRow = Tables['voice_notes']['Row'];
export type OntologyDailyBriefRow = Tables['ontology_daily_briefs']['Row'];
export type ChatSessionRow = Tables['chat_sessions']['Row'];
export type PushSubscriptionRow = Tables['push_subscriptions']['Row'];

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * GET /api/auth/user — apps/web/src/routes/api/auth/user/+server.ts
 * Fields come straight from the `users` row (`locals.user`); `is_beta_user` is
 * coerced to a boolean by the route.
 */
export type CurrentUser = {
	id: string;
	email: string;
	is_admin: boolean;
	is_beta_user: boolean;
};

/**
 * POST /api/auth/handoff — apps/web/src/routes/api/auth/handoff/+server.ts
 * The phone exchanges its bearer session for a one-time URL that signs the in-app
 * browser into the web session and lands on `next` in app mode. Bearer sessions
 * only: a cookie session gets 403. The code lives 60 seconds and is single use.
 */
export type HandoffRequest = {
	/** Same-origin path to land on after the cookie is set, e.g. `/profile`. */
	next?: string;
};

export type HandoffResponse = {
	url: string;
	expires_at: string;
	ttl_seconds: number;
};

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

/** Mirrors apps/web/src/lib/types/calendar-items.ts `CalendarItem`. */
export type CalendarItemType = 'event' | 'task';
export type CalendarItemKind = 'event' | 'range' | 'start' | 'due';

export type CalendarItem = {
	calendar_item_id: string;
	item_type: CalendarItemType;
	item_kind: CalendarItemKind;
	source_table: string;
	title: string | null;
	start_at: string;
	end_at: string | null;
	all_day: boolean | null;
	timezone: string | null;
	project_id: string | null;
	owner_entity_type: string | null;
	owner_entity_id: string | null;
	task_id: string | null;
	event_id: string | null;
	state_key: string | null;
	type_key: string | null;
	props: Record<string, unknown> | null;
	calendar_source_id?: string | null;
	calendar_source_ids?: string[];
	calendar_source_label?: string | null;
	calendar_connection_label?: string | null;
	calendar_source_color?: string | null;
	created_at: string;
	updated_at: string;
};

/** Mirrors apps/web/src/lib/types/today.ts (served by apps/web/src/lib/server/today-feed.service.ts). */
export type TodayTaskBucket = 'due_today' | 'starts_today' | 'in_progress';
export type TodayFeedDegradedSection = 'events' | 'tasks' | 'overdue';

export type TodayTask = {
	id: string;
	project_id: string;
	project_name: string;
	title: string;
	description: string | null;
	state_key: string;
	due_at: string | null;
	start_at: string | null;
	priority: number | null;
	updated_at: string;
	bucket: TodayTaskBucket;
};

export type TodayProject = {
	id: string;
	name: string;
	/** 'workspace' for the person's loose items (shown as "Workspace", never as a project). */
	kind?: 'project' | 'workspace';
	state_key: string;
	next_step_short: string | null;
	next_step_long: string | null;
	/** False for view-only shares. */
	can_write: boolean;
};

export type TodayFeed = {
	/** YYYY-MM-DD in the user's timezone */
	date: string;
	timezone: string;
	dayStart: string;
	dayEnd: string;
	events: CalendarItem[];
	tasks: TodayTask[];
	overdueCount: number;
	/** Queries that failed while the rest of the feed remained usable. */
	degradedSections: TodayFeedDegradedSection[];
	/** Names for every project the user can see, keyed by project id */
	projectNames: Record<string, string>;
	projects: TodayProject[];
};

/** GET /api/today — apps/web/src/routes/api/today/+server.ts */
export type TodayParams = {
	/** IANA timezone; defaults to the account's saved timezone. */
	timezone?: string;
};

export type TodayResponse = {
	feed: TodayFeed;
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export type ProjectKind = 'project' | 'workspace';
export type ProjectAccessLevel = 'read' | 'write' | 'admin';

/**
 * GET /api/onto/projects — apps/web/src/routes/api/onto/projects/+server.ts
 * Mirrors `OntologyProjectSelectorSummary` in
 * packages/shared-agent-ops/src/ontology/ontology-projects.service.ts.
 * The `include=hierarchy` fields are present only when requested.
 */
export type ProjectSummary = {
	id: string;
	name: string;
	description: string | null;
	type_key: string;
	state_key: OntoProjectRow['state_key'];
	facet_context: string | null;
	facet_scale: string | null;
	facet_stage: string | null;
	created_at: string;
	updated_at: string;
	task_count: number;
	kind: ProjectKind;
	parent_project_id?: string | null;
	parent_project_name?: string | null;
	has_children?: boolean;
	access_level?: ProjectAccessLevel | null;
};

export type ProjectListParams = {
	search?: string;
	/** 1–100, server default 24. */
	limit?: number;
	/** Adds parent/children/access facts; the Workspace is excluded. */
	include?: 'hierarchy';
};

export type ProjectListResponse = {
	projects: ProjectSummary[];
};

/** Mirrors apps/web/src/lib/server/task-assignment.service.ts `TaskAssignee`. */
export type TaskAssignee = {
	actor_id: string;
	user_id: string | null;
	name: string | null;
	email: string | null;
	assigned_at: string;
};

/** A task row as the project and task routes return it, with assignees attached. */
export type TaskWithAssignees = OntoTaskRow & {
	assignees: TaskAssignee[];
};

/** Project-scoped task lists also carry who last changed each task. */
export type ProjectTask = TaskWithAssignees & {
	last_changed_by_actor_id: string | null;
};

/** Mirrors apps/web/src/lib/types/project-full-data.ts. */
export type ProjectTaskBucket =
	| 'backlog'
	| 'in_progress'
	| 'scheduled'
	| 'overdue'
	| 'blocked'
	| 'done';

export type ProjectTaskBucketCoverage = {
	returned: number;
	total: number;
	complete: boolean;
};

export type ProjectTasksCoverage = {
	scope: 'all' | 'initial-board';
	as_of: string;
	complete: boolean;
	returned: number;
	total: number;
	limit_per_bucket?: number;
	buckets: Record<ProjectTaskBucket, ProjectTaskBucketCoverage>;
};

export type ProjectEventsCoverage = {
	scope: 'all' | 'initial-window';
	complete: boolean;
	returned: number;
	recent_since?: string;
	recent_limit?: number;
	upcoming_limit?: number;
	recent_has_more?: boolean;
	upcoming_has_more?: boolean;
};

/** Mirrors apps/web/src/lib/server/milestone-decorators.ts `DecoratedMilestone` (RPC drops `created_at`). */
export type ProjectMilestone = Omit<OntoMilestoneRow, 'created_at'> & {
	goal_id: string | null;
	effective_state_key: OntoMilestoneRow['state_key'];
	is_missed: boolean;
};

export type ProjectFullProfile = 'classic' | 'v2-initial';

export type ProjectFullParams = {
	/**
	 * `v2-initial` returns the lean first-render payload (no requirements, images,
	 * sources, metrics or public-page counts; task descriptions are truncated to a
	 * preview). Default is the classic full contract.
	 */
	profile?: ProjectFullProfile;
};

/**
 * Calendar sync rows joined onto a project event. Mirrors the column list in
 * packages/shared-agent-ops/src/calendar/onto-event-read.service.ts
 * (`ONTO_EVENT_WITH_SYNC_SELECT`), scoped to the signed-in user.
 */
export type ProjectEventSync = Pick<
	OntoEventSyncRow,
	| 'id'
	| 'project_calendar_id'
	| 'calendar_source_id'
	| 'user_id'
	| 'provider'
	| 'external_event_id'
	| 'external_calendar_id'
	| 'sync_status'
	| 'sync_error'
	| 'last_synced_at'
>;

export type ProjectEvent = OntoEventRow & {
	onto_event_sync?: ProjectEventSync[];
};

/**
 * GET /api/onto/projects/[id]/full — apps/web/src/routes/api/onto/projects/[id]/full/+server.ts
 * Collections come from the `get_project_full` RPC as whole rows
 * (supabase/migrations/20260904000000_start_here_document_selection_marker.sql);
 * goals, plans, milestones and risks drop `created_at` there.
 */
export type ProjectFullResponse = {
	/** Project row with internal `props` keys removed (sanitizeProjectForClient). */
	project: OntoProjectRow;
	current_actor_id: string | null;
	goals: Array<Omit<OntoGoalRow, 'created_at'>>;
	plans: Array<Omit<OntoPlanRow, 'created_at'>>;
	tasks: ProjectTask[];
	tasks_coverage: ProjectTasksCoverage;
	pulse_tasks: ProjectTask[];
	documents: OntoDocumentRow[];
	milestones: ProjectMilestone[];
	risks: Array<Omit<OntoRiskRow, 'created_at'>>;
	context_document: OntoDocumentRow | null;
	events: ProjectEvent[];
	events_coverage: ProjectEventsCoverage;
	/**
	 * Classic profile only. Typed from the tables the RPC read them from
	 * (`images` are `onto_assets`); the current RPC no longer emits these keys, so
	 * the handler sends `[]` until it does again.
	 */
	requirements?: OntoRequirementRow[];
	images?: OntoAssetRow[];
	sources?: OntoSourceRow[];
	metrics?: OntoMetricRow[];
	public_page_counts?: { total: number; live: number } | null;
};

/** GET /api/onto/projects/[id]/tasks — apps/web/src/routes/api/onto/projects/[id]/tasks/+server.ts */
export type ProjectTasksParams = {
	bucket: ProjectTaskBucket;
	/** 1–100, server default 20. */
	limit?: number;
	offset?: number;
	/** ISO timestamp the bucket filters are evaluated against; keeps pages stable. */
	asOf?: string;
};

export type ProjectTasksResponse = {
	bucket: ProjectTaskBucket;
	tasks: ProjectTask[];
	total: number;
	hasMore: boolean;
	offset: number;
	nextOffset: number | null;
};

/**
 * A tile's color: what actually happened lately, not the status field.
 * moving = finished a task in 14 days; shaping = worked on in 14 days, nothing finished;
 * quiet = no change for 14+ days; parked = paused/done, or no change for 60+ days.
 * Mirrors apps/web/src/lib/components/projects/desktop/desktop-signals.ts `Pulse`.
 */
export type ProjectPulse = 'moving' | 'shaping' | 'quiet' | 'parked';

/** Open tasks by bucket, for the T bar's segments. */
export type TaskMix = { overdue: number; in_progress: number; scheduled: number; backlog: number };

/** One project as a desktop tile. Mirrors apps/web/src/lib/server/projects/desktop-response.ts. */
export type DesktopProject = {
	id: string;
	name: string;
	/** `workspace` is the viewer's loose-items holder; never draw it as a tile. */
	kind: ProjectKind;
	state_key: string;
	updated_at: string;
	/** Last recorded change (app, chat or agents) within 60 days; null when none. */
	last_touch_at: string | null;
	next_step_short: string | null;
	/** Up to two emojis; null shows the monogram. */
	emoji: string[] | null;
	/** Set only when the parent is also in this viewer's list. */
	parent_project_id: string | null;
	/** null when there is no history to judge. */
	pulse: ProjectPulse | null;
	/** Why the pulse is what it is, e.g. "Finished 2 tasks in the last 14 days"; '' with no pulse. */
	pulse_reason: string;
	/** Bar lengths 0–1, ranked against the viewer's other projects (0 = nothing). */
	bars: { docs: number; tasks: number };
	mix: TaskMix;
	open_tasks: number;
	document_count: number;
	task_count: number;
};

/** A loose note, doc or task in the Workspace. `note` and `doc` open as documents. */
export type LooseItemSummary = {
	id: string;
	kind: 'note' | 'doc' | 'task';
	title: string;
	excerpt: string | null;
	updated_at: string;
};

/**
 * GET /api/projects/desktop — apps/web/src/routes/api/projects/desktop/+server.ts
 * Every project as a tile (most recently active first; the Workspace row included with
 * kind `workspace`) and the Workspace's loose items (newest first). `workspace` is null
 * when it could not be loaded.
 */
export type DesktopResponse = {
	projects: DesktopProject[];
	workspace: {
		id: string;
		items: LooseItemSummary[];
		totals: { notes: number; docs: number; tasks: number };
	} | null;
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

/** Mirrors packages/shared-agent-ops/src/ontology/edge-direction.ts `EntityKind`. */
export type EntityKind =
	| 'project'
	| 'plan'
	| 'task'
	| 'goal'
	| 'milestone'
	| 'document'
	| 'risk'
	| 'requirement'
	| 'metric'
	| 'source'
	| 'event';

/**
 * Mirrors `RelationshipToken` in packages/shared-agent-ops/src/ontology/edge-direction.ts:
 * current relationship names plus the deprecated spellings the server still accepts.
 */
export type RelationshipToken =
	| 'contains'
	| 'has_plan'
	| 'has_task'
	| 'has_goal'
	| 'has_document'
	| 'has_risk'
	| 'has_milestone'
	| 'has_metric'
	| 'has_requirement'
	| 'has_source'
	| 'has_context_document'
	| 'has_part'
	| 'has_event'
	| 'supports_goal'
	| 'achieved_by'
	| 'targets_milestone'
	| 'depends_on'
	| 'requires'
	| 'blocks'
	| 'references'
	| 'referenced_by'
	| 'relates_to'
	| 'belongs_to_plan'
	| 'part_of'
	| 'blocked_by'
	| 'mitigated_by'
	| 'supports'
	| 'builds_on';

/** Mirrors packages/shared-agent-ops/src/ontology/containment-organizer.ts `ParentRef`. */
export type ParentRef = {
	kind: EntityKind;
	id: string;
	is_primary?: boolean;
};

/** Mirrors packages/shared-agent-ops/src/ontology/relationship-resolver.ts `ConnectionRef`. */
export type ConnectionRef = {
	kind: EntityKind;
	id: string;
	intent?: 'containment' | 'semantic';
	rel?: RelationshipToken;
};

/** Mirrors apps/web/src/routes/api/onto/shared/input-normalization.ts. */
export type CalendarSyncMode = 'auto' | 'none';

export type TaskCalendarEventReceipt = {
	id: string;
	title: string;
	start_at: string;
	end_at: string;
};

export type TaskCalendarSyncReceipt = {
	calendar_sync: 'synced' | 'skipped' | 'unchanged' | 'failed';
	calendar_events?: TaskCalendarEventReceipt[];
	removed_calendar_event_count?: number;
};

/** Mirrors packages/agentic-chat-runtime/src/tools/ontology-task-detail.ts. */
export type TaskLinkedEntity = {
	id: string;
	name?: string;
	title?: string;
	type_key?: string;
	state_key?: string;
	due_at?: string;
	edge_rel: string;
	edge_direction: 'outgoing' | 'incoming';
};

export type TaskLinkedEntities = {
	plans: TaskLinkedEntity[];
	goals: TaskLinkedEntity[];
	milestones: TaskLinkedEntity[];
	documents: TaskLinkedEntity[];
	dependentTasks: TaskLinkedEntity[];
};

/** Mirrors packages/shared-agent-ops/src/task-entities/task-entities.ts. */
export type TaskEntityKind =
	| 'person'
	| 'org'
	| 'place'
	| 'time'
	| 'phone'
	| 'email'
	| 'link'
	| 'meeting_link'
	| 'reference';

export type TaskEntityRole =
	| 'primary'
	| 'secondary'
	| 'avoid'
	| 'hours'
	| 'log'
	| 'follow_up'
	| 'meeting'
	| 'deadline'
	| 'owner_self';

export type TaskEntityStatus = 'suggested' | 'confirmed' | 'dismissed';

/**
 * People, places, times, numbers and links read from a task's text. Mirrors
 * `summarizeTaskEntitiesForAgent` in
 * packages/shared-agent-ops/src/task-entities/task-entities.ts (dismissed and
 * log-role entities are already filtered out).
 */
export type TaskEntitySummary = {
	kind: TaskEntityKind;
	value: string;
	display: string;
	role: TaskEntityRole;
	about: string | null;
	status: TaskEntityStatus;
	in_text: boolean;
	key?: true;
};

/** GET /api/onto/tasks/[id] — apps/web/src/routes/api/onto/tasks/[id]/+server.ts */
export type TaskDetailResponse = {
	task: TaskWithAssignees;
	linkedEntities: TaskLinkedEntities;
	entities: TaskEntitySummary[];
};

/** Fields shared by task create and update bodies. */
export type TaskWriteFields = {
	title?: string;
	description?: string | null;
	/** 1 (highest) to 5; create defaults to 3. */
	priority?: number | null;
	state_key?: string | null;
	type_key?: string | null;
	props?: Record<string, unknown> | null;
	plan_id?: string | null;
	goal_id?: string | null;
	supporting_milestone_id?: string | null;
	/** ISO datetime, or `YYYY-MM-DD` for a civil day in the user's timezone. */
	start_at?: string | null;
	due_at?: string | null;
	parent?: ParentRef | null;
	parents?: ParentRef[] | null;
	connections?: ConnectionRef[];
	assignee_actor_ids?: string[];
	/** `none` creates no calendar events or time blocks. Default `auto`. */
	calendar_sync?: CalendarSyncMode;
};

/** POST /api/onto/tasks/create — apps/web/src/routes/api/onto/tasks/create/+server.ts */
export type TaskCreateInput = TaskWriteFields & {
	project_id: string;
	title: string;
	classification_source?: string;
};

/** PATCH /api/onto/tasks/[id] — apps/web/src/routes/api/onto/tasks/[id]/+server.ts */
export type TaskUpdateInput = TaskWriteFields;

/** Create and update both return the task plus what the calendar side did. */
export type TaskWriteResponse = { task: TaskWithAssignees } & TaskCalendarSyncReceipt;

/** DELETE /api/onto/tasks/[id] — body is optional. */
export type TaskDeleteInput = {
	/** Archive instead of soft-deleting. */
	archive?: boolean;
	/** Default true. */
	sync_to_calendar?: boolean;
	/** Default true. */
	delete_linked_events?: boolean;
};

export type TaskDeleteResponse = {
	message: string;
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/** GET /api/onto/documents/[id] — apps/web/src/routes/api/onto/documents/[id]/+server.ts */
export type DocumentDetailResponse = {
	document: OntoDocumentRow;
	/** Opaque revision to send back as `expected_editor_revision` on save. */
	editor_revision: string;
};

/** Mirrors packages/shared-agent-ops/src/ontology/onto-api.ts `DocTreeNode` (top-level fields). */
export type DocTreeNode = {
	id: string;
	type?: 'folder' | 'doc';
	title?: string | null;
	description?: string | null;
	is_public?: boolean;
	public_slug?: string | null;
	public_url_path?: string | null;
	public_status?: 'not_public' | 'pending_confirmation' | 'live' | 'unpublished' | 'archived';
	/** Order among siblings (0-indexed). */
	order: number;
	children?: DocTreeNode[];
};

export type DocStructure = {
	version: number;
	root: DocTreeNode[];
};

/** Mirrors apps/web/src/lib/server/public-page.service.ts `PublicPageState`. */
export type PublicPageState = {
	id: string;
	project_id: string;
	document_id: string;
	slug: string;
	slug_prefix: string | null;
	slug_base: string;
	url_path: string;
	title: string;
	summary: string | null;
	status: 'draft' | 'published' | 'unpublished' | 'archived';
	public_status: 'not_public' | 'pending_confirmation' | 'live' | 'unpublished' | 'archived';
	visibility: 'public' | 'unlisted';
	noindex: boolean;
	live_sync_enabled: boolean;
	published_at: string | null;
	last_live_sync_at: string | null;
	last_live_sync_error: string | null;
	is_live_public: boolean;
	is_listed_public: boolean;
	view_count_all: number;
	view_count_30d: number;
};

/** Mirrors apps/web/src/lib/server/public-page-content-review.service.ts. */
export type PublicPageReviewFinding = {
	code: string;
	category:
		| 'credentials'
		| 'personal_data'
		| 'self_harm_or_violence'
		| 'sexual_content'
		| 'hate_or_harassment'
		| 'illegal_activity'
		| 'other';
	severity: 'low' | 'medium' | 'high';
	source: 'text' | 'image';
	message: string;
	recommendation: string;
	excerpt: string | null;
	asset_id: string | null;
	asset_label: string | null;
};

export type PublicPageReviewAttempt = {
	id: string;
	project_id: string;
	document_id: string;
	public_page_id: string | null;
	source: 'publish_confirm' | 'live_sync' | 'manual_retry';
	status: 'passed' | 'flagged' | 'error';
	policy_version: string;
	summary: string | null;
	reasons: string[];
	text_findings: PublicPageReviewFinding[];
	image_findings: PublicPageReviewFinding[];
	created_by: string;
	created_at: string;
	review_metadata: Record<string, unknown>;
	admin_decision: 'approved' | 'rejected' | null;
	admin_decision_reason: string | null;
	admin_decision_by: string | null;
	admin_decision_at: string | null;
};

/** Mirrors apps/web/src/lib/server/public-page.service.ts `PublicPageLiveSyncResult`. */
export type PublicPageLiveSyncResult = {
	isLivePublic: boolean;
	synced: boolean;
	blocked: boolean;
	page: PublicPageState | null;
	error: string | null;
	review: PublicPageReviewAttempt | null;
};

/** PATCH /api/onto/documents/[id] — apps/web/src/routes/api/onto/documents/[id]/+server.ts */
export type DocumentUpdateInput = {
	title?: string;
	state_key?: string;
	type_key?: string;
	/** Markdown body; `content` is the legacy alias. Table documents reject body writes. */
	body_markdown?: string | null;
	content?: string | null;
	description?: string | null;
	props?: Record<string, unknown> | null;
	parent?: ParentRef | null;
	parents?: ParentRef[] | null;
	connections?: ConnectionRef[];
	/** Optimistic concurrency: the `updated_at` the client last saw. */
	expected_updated_at?: string;
	/** Optimistic concurrency: the `editor_revision` the client last saw. Mismatch → 409. */
	expected_editor_revision?: string;
	force_version?: boolean;
	sync_public_page?: boolean;
	/** `archive`/`restore` short-circuit the ordinary save. */
	action?: 'archive' | 'restore';
};

export type DocumentArchiveMode = 'archive_children' | 'promote_children';

export type DocumentUpdateResponse =
	| {
			document: OntoDocumentRow;
			editor_revision: string;
			publicPageSync: PublicPageLiveSyncResult | null;
			versionWarning: string | null;
	  }
	| {
			document: OntoDocumentRow;
			structure: DocStructure | null;
			archived_document_ids: string[];
			archive_mode: DocumentArchiveMode;
	  }
	| {
			document: OntoDocumentRow;
			structure: DocStructure;
			restored: true;
	  };

// ---------------------------------------------------------------------------
// Daily briefs
// ---------------------------------------------------------------------------

/**
 * GET /api/daily-briefs — apps/web/src/routes/api/daily-briefs/+server.ts
 * Shape is the output of `mapOntologyDailyBriefRow`
 * (apps/web/src/lib/services/dailyBrief/ontology-mappers.ts).
 */
export type DailyBrief = Pick<
	OntologyDailyBriefRow,
	| 'id'
	| 'user_id'
	| 'brief_date'
	| 'llm_analysis'
	| 'metadata'
	| 'created_at'
	| 'updated_at'
	| 'audio_status'
	| 'audio_storage_path'
	| 'audio_voice'
	| 'audio_model'
	| 'audio_duration_ms'
	| 'audio_generation_ms'
	| 'audio_requested_at'
	| 'audio_generation_started_at'
	| 'audio_generated_at'
	| 'audio_error'
> & {
	chat_brief_id: string;
	summary_content: string;
	executive_summary: string;
	insights?: string;
	priority_actions: string[];
	generation_status: 'pending' | 'processing' | 'completed' | 'failed';
	generation_error?: string;
	generation_started_at?: string;
	generation_completed_at?: string;
};

export type DailyBriefParams = {
	/** YYYY-MM-DD; defaults to today (UTC) on the server. */
	date?: string;
};

export type DailyBriefResponse = {
	brief: DailyBrief | null;
};

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

/** Mirrors apps/web/src/lib/types/activity-timeline.ts. */
export type ActivityLane = 'ping' | 'agent' | 'you' | 'system';
export type ActivityActor = 'you' | 'agent' | 'chat' | 'external_agent' | 'teammate' | 'system';
export type ActivityStatus = 'ok' | 'warn' | 'error' | 'pending';
export type ActivityKind =
	| 'notification'
	| 'project_audit'
	| 'loop_run'
	| 'agent_run'
	| 'entity_changes'
	| 'chat_session'
	| 'braindump'
	| 'voice_note'
	| 'brief'
	| 'calendar_analysis';

export type ActivityStat = {
	label: string;
	value: string | number;
};

export type ActivityChild = {
	id: string;
	label: string;
	detail?: string | null;
	at: string;
	entity_type?: string | null;
	entity_id?: string | null;
	project_id?: string | null;
	occurrences?: number;
};

export type ActivityEntry = {
	id: string;
	lane: ActivityLane;
	kind: ActivityKind;
	occurred_at: string;
	title: string;
	body: string | null;
	project_id: string | null;
	project_name: string | null;
	actor: ActivityActor;
	actor_label: string;
	status: ActivityStatus;
	stats: ActivityStat[];
	href: string | null;
	children: ActivityChild[];
	count: number;
};

/** GET /api/activity — apps/web/src/routes/api/activity/+server.ts */
export type ActivityListParams = {
	/** ISO timestamp cursor from the previous page's `nextCursor`. */
	before?: string;
	/** 1–50, server default 30. */
	limit?: number;
	lanes?: ActivityLane[];
};

export type ActivityTimelinePage = {
	entries: ActivityEntry[];
	nextCursor: string | null;
	hasMore: boolean;
	degraded: string[];
};

// ---------------------------------------------------------------------------
// Voice notes and transcription
// ---------------------------------------------------------------------------

/** GET /api/voice-notes — apps/web/src/routes/api/voice-notes/+server.ts (explicit column list). */
export type VoiceNoteListItem = Pick<
	VoiceNoteRow,
	| 'id'
	| 'user_id'
	| 'storage_path'
	| 'storage_bucket'
	| 'file_size_bytes'
	| 'duration_seconds'
	| 'mime_type'
	| 'transcript'
	| 'transcription_model'
	| 'transcription_status'
	| 'transcription_error'
	| 'linked_entity_type'
	| 'linked_entity_id'
	| 'group_id'
	| 'segment_index'
	| 'recorded_at'
	| 'created_at'
	| 'updated_at'
	| 'deleted_at'
>;

export type VoiceNoteListParams = {
	linkedEntityType?: string;
	linkedEntityId?: string;
	groupId?: string;
	groupIds?: string[];
	/** Server default 50. */
	limit?: number;
	offset?: number;
};

export type VoiceNoteListResponse = {
	voiceNotes: VoiceNoteListItem[];
};

/**
 * POST /api/voice-notes — multipart form fields (apps/web/src/routes/api/voice-notes/+server.ts).
 * `audio` is the file (≤ 50 MB); the rest are strings. Build a `FormData` with these
 * keys and pass it to `voiceNotes.create`.
 */
export type VoiceNoteCreateFields = {
	audio: Blob;
	durationSeconds?: string;
	linkedEntityType?: string;
	linkedEntityId?: string;
	/** `'true'` to transcribe on the server after upload. */
	transcribe?: 'true' | 'false';
	groupId?: string;
	segmentIndex?: string;
	/** ISO datetime. */
	recordedAt?: string;
	transcript?: string;
	transcriptionStatus?: string;
	transcriptionSource?: string;
	transcriptionModel?: string;
	/** JSON-encoded object. */
	metadata?: string;
};

/**
 * POST /api/transcribe — multipart form fields (apps/web/src/routes/api/transcribe/+server.ts).
 */
export type TranscribeFields = {
	audio: Blob;
	vocabularyTerms?: string;
	context?: string;
	allowEmpty?: 'true' | 'false';
};

/** Mirrors the transcription result in apps/web/src/lib/services/smart-llm/types.ts. */
export type TranscribeResponse = {
	transcript: string;
	duration_ms: number;
	audio_duration: number | null;
	transcription_model: string;
	transcription_service: 'openrouter' | 'openai';
};

// ---------------------------------------------------------------------------
// Push devices
// ---------------------------------------------------------------------------

/** POST /api/push/devices — apps/web/src/routes/api/push/devices/+server.ts */
export type PushDeviceRegistration = {
	/** Expo push token for this install (`ExponentPushToken[…]`). */
	token: string;
	platform: 'ios' | 'android';
	/** ≤ 120 chars. */
	device_name?: string;
	/** ≤ 40 chars. */
	app_version?: string;
};

/**
 * GET /api/push/devices — one row per active phone or browser subscription. Tokens
 * never leave the server; `endpoint_hint` is the token's last characters.
 */
export type PushDevice = Pick<
	PushSubscriptionRow,
	'id' | 'provider' | 'platform' | 'device_name' | 'app_version' | 'created_at' | 'last_used_at'
> & {
	endpoint_hint: string;
};

export type PushDeviceListResponse = {
	devices: PushDevice[];
};

export type PushDeviceRegistrationResponse = {
	subscription_id: string;
};

/** DELETE /api/push/devices */
export type PushDeviceRemoval = {
	token: string;
};

export type PushDeviceRemovalResponse = {
	removed: boolean;
};

// ---------------------------------------------------------------------------
// Agent chat
// ---------------------------------------------------------------------------

/**
 * POST /api/agent/v2/turns — request body, mirrored from
 * apps/web/src/routes/api/agent/v2/turns/worker-admission-schema.ts (strict schema:
 * unknown keys are rejected). Attachments and published specialists are not modelled.
 */
export type AgentContextType =
	| 'global'
	| 'project'
	| 'calendar'
	| 'daily_brief'
	| 'general'
	| 'project_create'
	| 'daily_brief_update'
	| 'ontology';

export type AgentTurnContext = {
	type: AgentContextType;
	/** For `project` context: must equal `projectId`. */
	entityId: string | null;
	projectId: string | null;
};

export type AgentProjectFocus = {
	focusType:
		| 'project-wide'
		| 'task'
		| 'goal'
		| 'plan'
		| 'document'
		| 'milestone'
		| 'risk'
		| 'requirement';
	focusEntityId: string | null;
	focusEntityName: string | null;
	/** Must match `context.projectId`. */
	projectId: string;
	projectName: string;
};

export type AgentTurnRequest = {
	/** Client-generated idempotency key for this send (≤ 256 chars, trimmed). */
	clientTurnId: string;
	/** Client-generated id for the live stream of this turn (≤ 256 chars, trimmed). */
	streamRunId: string;
	/** Omit or null to start a new session; the admission returns it. */
	sessionId?: string | null;
	context: AgentTurnContext;
	/** ≤ 100,000 chars. */
	message: string;
	projectFocus?: AgentProjectFocus | null;
	voiceNoteGroupId?: string | null;
	preparedPromptKey?: string | null;
	reviewIntent?: 'project_review' | 'document_organization' | null;
	requestedSkillId?: string | null;
};

/**
 * POST /api/agent/v2/turns — success `data` (202 when newly admitted, 200 for a
 * matching duplicate). The turn itself runs on the worker; its events arrive over
 * the session's realtime channel, not in this response.
 */
export type AgentTurnAdmission = {
	outcome: 'newly_admitted' | 'matching_duplicate' | 'active_turn_conflict';
	handle: {
		contractVersion: 'agentic_chat_worker_v1';
		executionMode: 'worker_realtime';
		turnRunId: string;
		sessionId: string;
		streamRunId: string;
		clientTurnId: string | null;
	};
	status: ChatTurnStatusV1;
	/** Present when the admission created the session (no `sessionId` was sent). */
	session?: ChatSessionRow;
};

/**
 * GET /api/agent/v2/turns?session_id= — the session's turns that are still running
 * or awaiting the worker, newest first, so a reopened screen can resubscribe.
 */
export type AgentActiveTurn = AgenticChatWorkerTurnDescriptorV1;

export type AgentActiveTurnsResponse = {
	turns: AgentActiveTurn[];
};

// ---------------------------------------------------------------------------
// Workspace capture
// ---------------------------------------------------------------------------

/**
 * POST /api/workspace/capture — apps/web/src/routes/api/workspace/capture/+server.ts
 * Saves a note or task into the person's Workspace right away: no model call, no
 * project picker. This is the web's quick-capture path (WorkspaceCapture.svelte) and
 * the phone's text capture.
 */
export type WorkspaceCaptureInput = {
	kind: 'note' | 'task';
	/** The captured text; the server enforces its maximum length. */
	text: string;
	/** Where the capture came from, ≤ 40 chars, e.g. `ios`. Defaults to `workspace`. */
	source?: string;
	/**
	 * 8–120 chars, generated once per capture on the device. A retry after a dropped
	 * connection returns the item already saved instead of creating a second one.
	 */
	idempotency_key?: string;
};

/** Mirrors apps/web/src/lib/components/workspace/workspace-model.ts `LooseItem`. */
export type LooseItem = {
	id: string;
	entity: 'document' | 'task';
	/** Notes are documents with type_key `document.note`. */
	kind: 'note' | 'doc' | 'task';
	title: string;
	excerpt: string | null;
	created_at: string;
	updated_at: string;
	state_key?: string;
	due_at?: string | null;
	start_at?: string | null;
	/** Docs: how many docs sit inside it. */
	children?: number;
};

export type WorkspaceCaptureResponse = {
	workspaceId: string;
	item: LooseItem;
};

/**
 * POST /api/workspace/capture/sort — apps/web/src/routes/api/workspace/capture/sort/+server.ts
 * Smart capture's second step, the same one the web capture box runs after every save: one
 * fast model call decides whether the note becomes tasks or notes, moves into a project it
 * clearly belongs to, or updates a task that exists. Only a note saved in the last 30 minutes
 * is sorted, once; a repeat call answers `skipped`, so a retry is safe.
 */
export type CaptureSortInput = {
	/** `item.id` from `workspace.capture` (a note). */
	document_id: string;
	/** ≤ 40 chars, e.g. `ios`. */
	source?: string;
};

/** Undo token for a sort. Opaque: send it back to `workspace.undoSort` unchanged. */
export type CaptureSortReceipt = Record<string, unknown>;

/** Mirrors `CaptureSortResult` in apps/web/src/lib/server/workspace/capture-sort.service.ts. */
export type CaptureSortResult = {
	outcome: 'kept' | 'moved' | 'sorted' | 'partial' | 'skipped';
	/** Plain lines saying what happened and where, ready to show. */
	lines: string[];
	/** New loose items now in the Workspace. */
	added: LooseItem[];
	/** Loose items that left the Workspace (the original note). */
	removed_ids: string[];
	receipt: CaptureSortReceipt | null;
};

/** POST /api/workspace/capture/sort/undo */
export type CaptureUndoResult = {
	restored: LooseItem | null;
	removed_ids: string[];
	/** Changes that could not be put back. */
	failed: number;
};
