// packages/shared-types/src/cycle.types.ts
import type { Json } from './database.types';
import type { AttentionLevel } from './attention.types';

/**
 * Cycles are the control plane for recurring BuildOS work.
 *
 * A CycleDefinition stores user intent (what work should repeat). CycleTriggers
 * decide when it should run. A CycleRun stores one immutable occurrence of that
 * intent. queue_jobs remains the delivery mechanism and must not become the
 * source of truth for any of them.
 */

export const CYCLE_KINDS = [
	'daily_brief',
	'project_audit',
	'project_review',
	'task_review'
] as const;

export type CycleKind = (typeof CYCLE_KINDS)[number];

export type CycleState = 'active' | 'paused' | 'deleted';

export type CycleWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type CycleTarget =
	| {
			type: 'user';
			project_id: null;
	  }
	| {
			type: 'project';
			project_id: string;
	  };

/**
 * Local-time schedules carry an IANA timezone. Intervals are elapsed-time
 * schedules anchored to an absolute instant and therefore do not need one.
 * A schedule is one possible Cycle trigger. Manual execution is available for
 * every Cycle and is therefore not stored as a trigger.
 */
export type CycleSchedule =
	| {
			type: 'daily';
			time_of_day: string;
			timezone: string;
	  }
	| {
			type: 'weekly';
			days_of_week: CycleWeekday[];
			time_of_day: string;
			timezone: string;
	  }
	| {
			type: 'interval';
			every_minutes: number;
			anchor_at: string;
	  };

export type CycleTriggerType = 'schedule' | 'event' | 'threshold' | 'relative';

export type CycleThresholdOperator = 'gte' | 'lte';

export type CycleRelativeAnchor = 'calendar_event' | 'milestone' | 'deadline';

/**
 * The executable condition for one trigger. A Cycle may own several of these,
 * while manual "Run now" remains universally available outside this union.
 */
export type CycleTriggerSpec =
	| {
			type: 'schedule';
			schedule: CycleSchedule;
	  }
	| {
			type: 'event';
			event_types: string[];
			debounce_minutes?: number;
	  }
	| {
			type: 'threshold';
			metric: string;
			operator: CycleThresholdOperator;
			value: number;
			evaluation_window_minutes?: number;
	  }
	| {
			type: 'relative';
			relative_to: CycleRelativeAnchor;
			offset_minutes: number;
	  };

export type CycleTriggerState = 'active' | 'paused' | 'deleted';

export type CycleTrigger = CycleTriggerSpec & {
	id: string;
	cycle_id: string;
	state: CycleTriggerState;
	version: number;
	/** Materialized UTC due time for time-based triggers; null otherwise. */
	next_run_at: string | null;
	last_fired_at: string | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
};

export type CycleOverlapPolicy = 'skip' | 'allow';
export type CycleMisfirePolicy = 'skip' | 'run_once';

/** Explicit semantics for slow workers and missed scheduler ticks. */
export interface CycleExecutionPolicy {
	overlap: CycleOverlapPolicy;
	misfire: CycleMisfirePolicy;
	max_attempts: number;
}

export const DEFAULT_CYCLE_EXECUTION_POLICY: Readonly<CycleExecutionPolicy> = {
	overlap: 'skip',
	misfire: 'run_once',
	max_attempts: 3
};

/** Whether a completed run should compete for the user's attention. */
export type CycleAttentionPolicy = 'silent' | 'exceptions' | 'always';

export const DEFAULT_CYCLE_ATTENTION_POLICY_BY_KIND: Readonly<
	Record<CycleKind, CycleAttentionPolicy>
> = {
	daily_brief: 'always',
	project_audit: 'exceptions',
	project_review: 'exceptions',
	task_review: 'exceptions'
};

export type CycleAttentionLevel = AttentionLevel;

export interface CycleArtifactRef {
	type: string;
	id: string;
	label?: string;
}

interface CycleRunOutcomeBase {
	summary: string;
	artifact_refs: CycleArtifactRef[];
}

/** Normalized result used by history, AI Inbox admission, and notifications. */
export type CycleRunOutcome = CycleRunOutcomeBase &
	(
		| {
				status: 'no_change';
				attention_level: 'none';
		  }
		| {
				status: 'artifact_created';
				attention_level: Extract<CycleAttentionLevel, 'none' | 'minor'>;
		  }
		| {
				status: 'attention_required';
				attention_level: Extract<CycleAttentionLevel, 'decision' | 'urgent'>;
		  }
		| {
				status: 'failed';
				attention_level: CycleAttentionLevel;
			  }
	);

export type CycleRunOutcomeStatus = CycleRunOutcome['status'];

/** Daily-brief timing belongs to a schedule trigger; v0 adds no duplicate kind-specific knobs. */
export type DailyBriefCycleConfig = Record<string, never>;

export interface ProjectAuditCycleConfig {
	depth: 'standard' | 'deep';
}

/** Project-review behavior remains owned by its existing domain worker in v0. */
export type ProjectReviewCycleConfig = Record<string, never>;

/** Task-review behavior will be added when that worker contract is defined. */
export type TaskReviewCycleConfig = Record<string, never>;

export interface CycleConfigByKind {
	daily_brief: DailyBriefCycleConfig;
	project_audit: ProjectAuditCycleConfig;
	project_review: ProjectReviewCycleConfig;
	task_review: TaskReviewCycleConfig;
}

export type CycleTargetByKind = {
	daily_brief: Extract<CycleTarget, { type: 'user' }>;
	project_audit: Extract<CycleTarget, { type: 'project' }>;
	project_review: Extract<CycleTarget, { type: 'project' }>;
	task_review: CycleTarget;
};

export interface CycleDefinitionBase<K extends CycleKind> {
	id: string;
	user_id: string;
	label: string;
	kind: K;
	state: CycleState;
	target: CycleTargetByKind[K];
	triggers: CycleTrigger[];
	config: CycleConfigByKind[K];
	policy: CycleExecutionPolicy;
	attention_policy: CycleAttentionPolicy;
	/** Incremented on every user-visible definition change. */
	version: number;
	/** Read projection of the earliest active trigger due time. */
	next_run_at: string | null;
	last_run_at: string | null;
	last_run_id: string | null;
	last_error: string | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export type CycleDefinitionFor<K extends CycleKind> = CycleDefinitionBase<K>;

export type CycleDefinition = {
	[K in CycleKind]: CycleDefinitionFor<K>;
}[CycleKind];

export type CycleRunTrigger = CycleTriggerType | 'manual' | 'catch_up';

export type CycleRunStatus =
	| 'queued'
	| 'running'
	| 'completed'
	| 'failed'
	| 'cancelled'
	| 'skipped';

/** The immutable definition fields captured when a run is admitted. */
export interface CycleRunDefinitionSnapshotFor<K extends CycleKind> {
	kind: K;
	version: number;
	target: CycleTargetByKind[K];
	config: CycleConfigByKind[K];
	policy: CycleExecutionPolicy;
	attention_policy: CycleAttentionPolicy;
}

export type CycleRunDefinitionSnapshot = {
	[K in CycleKind]: CycleRunDefinitionSnapshotFor<K>;
}[CycleKind];

export type DailyBriefCycleRunMode = 'scheduled' | 'catch_up' | 'manual' | 'regenerate';

/**
 * Materialized inputs needed to execute one Daily Brief occurrence. These are
 * captured at admission so a later timezone or preference edit cannot change
 * work that is already queued.
 */
export interface DailyBriefCycleRunInput {
	mode: DailyBriefCycleRunMode;
	brief_date: string;
	timezone: string;
	force_regenerate: boolean;
	include_projects?: string[];
	exclude_projects?: string[];
	custom_template?: string;
	use_ontology?: boolean;
}

export interface ProjectAuditCycleRunInput {
	depth: 'standard' | 'deep';
	reason?: string;
}

export type ProjectReviewCycleRunInput = Record<string, never>;
export type TaskReviewCycleRunInput = Record<string, never>;

export interface CycleRunInputByKind {
	daily_brief: DailyBriefCycleRunInput;
	project_audit: ProjectAuditCycleRunInput;
	project_review: ProjectReviewCycleRunInput;
	task_review: TaskReviewCycleRunInput;
}

/**
 * A Cycle may request notification evaluation, but the notification system
 * still owns subscriptions, channel preferences, quiet hours, and delivery.
 */
export type CycleRunDeliveryIntent =
	| {
			mode: 'evaluate';
			not_before: string | null;
	  }
	| {
			mode: 'suppress';
			reason: string;
	  };

export interface CycleRunBase<K extends CycleKind> {
	id: string;
	cycle_id: string;
	cycle_version: number;
	user_id: string;
	project_id: string | null;
	kind: K;
	trigger: CycleRunTrigger;
	trigger_id: string | null;
	status: CycleRunStatus;
	/** Actual occurrence time of the event, threshold, manual request, or due tick. */
	triggered_at: string;
	/** Intended due time for scheduled/relative triggers; null for other triggers. */
	scheduled_for: string | null;
	/** Stable Cycle + trigger occurrence identity, independent of queue retries. */
	occurrence_key: string;
	/** Unique admission key; a manual request ID or deterministic occurrence key. */
	idempotency_key: string;
	definition_snapshot: CycleRunDefinitionSnapshotFor<K>;
	/** Immutable trigger condition at admission; null for manual/catch-up runs. */
	trigger_snapshot: CycleTriggerSpec | null;
	execution_input: CycleRunInputByKind[K];
	delivery_intent: CycleRunDeliveryIntent;
	/** Database FK to queue_jobs.id. */
	queue_job_record_id: string | null;
	/** Human-readable queue_jobs.queue_job_id retained for logs and support. */
	queue_job_id: string | null;
	/** Current fenced queue claim; replaced on retry. */
	processing_token: string | null;
	attempt_count: number;
	outcome: CycleRunOutcome | null;
	/** Handler-specific detail; routing and attention logic must use `outcome`. */
	result: Json | null;
	error_code: string | null;
	error_message: string | null;
	created_at: string;
	queued_at: string | null;
	started_at: string | null;
	finished_at: string | null;
	updated_at: string;
}

export type CycleRunFor<K extends CycleKind> = CycleRunBase<K>;

export type CycleRun = {
	[K in CycleKind]: CycleRunFor<K>;
}[CycleKind];

export type CreateCycleTriggerInput = CycleTriggerSpec & {
	state?: Exclude<CycleTriggerState, 'deleted'>;
};

/**
 * Trusted command-layer form after the scheduler service has projected an
 * absolute due time. The database validates which trigger/state combinations
 * may carry a value and requires active schedule triggers to have one.
 */
export type MaterializedCycleTriggerInput = CreateCycleTriggerInput & {
	next_run_at: string | null;
};

export interface UpdateCycleTriggerInput {
	id: string;
	cycle_id: string;
	expected_version: number;
	spec?: CycleTriggerSpec;
	state?: Exclude<CycleTriggerState, 'deleted'>;
}

export interface DeleteCycleTriggerInput {
	id: string;
	cycle_id: string;
	expected_version: number;
}

export interface CreateCycleInputFor<K extends CycleKind> {
	/** Makes a retried create request safe. */
	request_id: string;
	label: string;
	kind: K;
	target: CycleTargetByKind[K];
	triggers: CreateCycleTriggerInput[];
	config: CycleConfigByKind[K];
	policy?: CycleExecutionPolicy;
	attention_policy?: CycleAttentionPolicy;
	state?: Exclude<CycleState, 'deleted'>;
}

export type CreateCycleInput = {
	[K in CycleKind]: CreateCycleInputFor<K>;
}[CycleKind];

/** Internal server-to-database create contract; user identity is session-derived. */
export type CreateCycleCommandInput = {
	[K in CycleKind]: Omit<CreateCycleInputFor<K>, 'triggers'> & {
		user_id: string;
		triggers: MaterializedCycleTriggerInput[];
	};
}[CycleKind];

export interface UpdateCycleInputFor<K extends CycleKind> {
	id: string;
	/** Immutable discriminator for validating the kind-specific patch. */
	kind: K;
	/** Compare-and-swap guard against two clients silently overwriting each other. */
	expected_version: number;
	label?: string;
	target?: CycleTargetByKind[K];
	config?: CycleConfigByKind[K];
	policy?: CycleExecutionPolicy;
	attention_policy?: CycleAttentionPolicy;
	state?: Exclude<CycleState, 'deleted'>;
}

export type UpdateCycleInput = {
	[K in CycleKind]: UpdateCycleInputFor<K>;
}[CycleKind];

export interface DeleteCycleInput {
	id: string;
	expected_version: number;
}

export interface RunCycleInput {
	cycle_id: string;
	/** Makes retries of the manual start request resolve to the same CycleRun. */
	request_id: string;
	trigger: 'manual';
}

/** Trusted, kind-materialized payload accepted by manual admission. */
export type AdmitManualCycleRunCommand = {
	[K in CycleKind]: RunCycleInput & {
		user_id: string;
		kind: K;
		execution_input: CycleRunInputByKind[K];
		delivery_intent: CycleRunDeliveryIntent;
	};
}[CycleKind];

export interface CycleRunAdmissionResult {
	disposition: 'admitted' | 'already_admitted' | 'skipped_overlap';
	cycle_run_id: string;
	queue_job_record_id: string | null;
	queue_job_id: string | null;
}

/** Minimal metadata for the generic cycle queue worker. */
export interface CycleQueueJobMetadata {
	cycle_id: string;
	cycle_run_id: string;
	kind: CycleKind;
}

export interface CycleValidationIssue {
	path: string;
	code: string;
	message: string;
}

const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function hasValidTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
		return true;
	} catch {
		return false;
	}
}

function validateCycleSchedule(
	schedule: CycleSchedule,
	path: string,
	issues: CycleValidationIssue[]
): void {
	if (schedule.type === 'daily' || schedule.type === 'weekly') {
		if (!LOCAL_TIME_PATTERN.test(schedule.time_of_day)) {
			issues.push({
				path: `${path}.time_of_day`,
				code: 'invalid_time',
				message: 'Time of day must use 24-hour HH:mm or HH:mm:ss format.'
			});
		}
		if (!hasValidTimezone(schedule.timezone)) {
			issues.push({
				path: `${path}.timezone`,
				code: 'invalid_timezone',
				message: 'Timezone must be a valid IANA timezone.'
			});
		}
	}

	if (schedule.type === 'weekly') {
		const uniqueDays = new Set(schedule.days_of_week);
		if (
			schedule.days_of_week.length === 0 ||
			uniqueDays.size !== schedule.days_of_week.length ||
			schedule.days_of_week.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
		) {
			issues.push({
				path: `${path}.days_of_week`,
				code: 'invalid_weekdays',
				message: 'Weekly schedules need one or more unique weekdays from 0 through 6.'
			});
		}
	}

	if (schedule.type === 'interval') {
		if (!Number.isInteger(schedule.every_minutes) || schedule.every_minutes < 5) {
			issues.push({
				path: `${path}.every_minutes`,
				code: 'invalid_interval',
				message: 'Intervals must be whole minutes and at least 5 minutes.'
			});
		}
		if (!Number.isFinite(Date.parse(schedule.anchor_at))) {
			issues.push({
				path: `${path}.anchor_at`,
				code: 'invalid_timestamp',
				message: 'Interval anchor must be an ISO timestamp.'
			});
		}
	}
}

function validateCycleTrigger(
	trigger: CreateCycleTriggerInput,
	index: number,
	issues: CycleValidationIssue[]
): void {
	const path = `triggers.${index}`;

	if (trigger.type === 'schedule') {
		validateCycleSchedule(trigger.schedule, `${path}.schedule`, issues);
		return;
	}

	if (trigger.type === 'event') {
		const normalizedEventTypes = trigger.event_types.map((eventType) => eventType.trim());
		if (
			normalizedEventTypes.length === 0 ||
			normalizedEventTypes.some((eventType) => !eventType) ||
			new Set(normalizedEventTypes).size !== normalizedEventTypes.length
		) {
			issues.push({
				path: `${path}.event_types`,
				code: 'invalid_event_types',
				message: 'Event triggers need one or more unique, non-empty event types.'
			});
		}
		if (
			trigger.debounce_minutes !== undefined &&
			(!Number.isInteger(trigger.debounce_minutes) || trigger.debounce_minutes < 0)
		) {
			issues.push({
				path: `${path}.debounce_minutes`,
				code: 'invalid_debounce',
				message: 'Event debounce must be a non-negative whole number of minutes.'
			});
		}
		return;
	}

	if (trigger.type === 'threshold') {
		if (!trigger.metric.trim() || !Number.isFinite(trigger.value)) {
			issues.push({
				path,
				code: 'invalid_threshold',
				message: 'Threshold triggers require a metric name and finite value.'
			});
		}
		if (
			trigger.evaluation_window_minutes !== undefined &&
			(!Number.isInteger(trigger.evaluation_window_minutes) ||
				trigger.evaluation_window_minutes < 5)
		) {
			issues.push({
				path: `${path}.evaluation_window_minutes`,
				code: 'invalid_evaluation_window',
				message: 'Threshold evaluation windows must be whole minutes and at least 5 minutes.'
			});
		}
		return;
	}

	if (!Number.isInteger(trigger.offset_minutes)) {
		issues.push({
			path: `${path}.offset_minutes`,
			code: 'invalid_offset',
			message: 'Relative trigger offsets must be a whole number of minutes.'
		});
	}
}

/** Runtime invariants for create commands after request-shape parsing. */
export function validateCycleInput(input: CreateCycleInput): CycleValidationIssue[] {
	const issues: CycleValidationIssue[] = [];

	if (!input.request_id.trim()) {
		issues.push({
			path: 'request_id',
			code: 'required',
			message: 'A request ID is required for idempotent creation.'
		});
	}

	const label = input.label.trim();
	if (!label || label.length > 100) {
		issues.push({
			path: 'label',
			code: 'invalid_length',
			message: 'Label must contain between 1 and 100 characters.'
		});
	}

	if (input.kind === 'daily_brief' && input.target.type !== 'user') {
		issues.push({
			path: 'target',
			code: 'invalid_target',
			message: 'Daily briefs must target a user.'
		});
	}

	if (
		(input.kind === 'project_audit' || input.kind === 'project_review') &&
		input.target.type !== 'project'
	) {
		issues.push({
			path: 'target',
			code: 'invalid_target',
			message: 'Project audits and reviews must target a project.'
		});
	}

	if (input.target.type === 'project' && !input.target.project_id.trim()) {
		issues.push({
			path: 'target.project_id',
			code: 'required',
			message: 'A project target requires a project ID.'
		});
	}

	if (input.triggers.length === 0) {
		issues.push({
			path: 'triggers',
			code: 'required',
			message: 'A Cycle requires at least one automatic trigger.'
		});
	} else {
		input.triggers.forEach((trigger, index) => validateCycleTrigger(trigger, index, issues));
	}

	const policy = input.policy ?? DEFAULT_CYCLE_EXECUTION_POLICY;
	if (!Number.isInteger(policy.max_attempts) || policy.max_attempts < 1 || policy.max_attempts > 10) {
		issues.push({
			path: 'policy.max_attempts',
			code: 'invalid_attempts',
			message: 'Maximum attempts must be a whole number from 1 through 10.'
		});
	}

	return issues;
}
