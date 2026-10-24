// packages/shared-types/src/queue-types.ts
import type { Database } from './database.types';
import type { NotificationJobMetadata } from './notification.types';
import type { CycleQueueJobMetadata, CycleRunOutcome } from './cycle.types';
import type { FreshnessScanJobMetadata } from './freshness-radar.types';

// Re-export database enums as the single source of truth, minus retired legacy jobs.
export type QueueJobType = Exclude<Database['public']['Enums']['queue_type'], 'process_brain_dump'>;
export type QueueJobStatus = Database['public']['Enums']['queue_status'];

export type OntologyEntityType = 'task' | 'plan' | 'goal' | 'risk' | 'milestone' | 'document';

export type OntologyClassificationSource = 'create_modal';

export type BriefNotificationSuppressionReason =
	| 'inactive_preference'
	| 'invalid_preference'
	| 'preferred_time_passed'
	| 'preference_lookup_failed'
	| 'preference_missing'
	| 'cycle_delivery_suppressed';

export interface OntologyClassificationRequest {
	entityType: OntologyEntityType;
	entityId: string;
	userId: string;
	classificationSource: OntologyClassificationSource;
}

// Brief generation progress tracking
export type BriefGenerationStep =
	| 'idle'
	| 'initializing'
	| 'starting'
	| 'queued'
	| 'gathering_data'
	| 'data_gathered'
	| 'fetching_projects'
	| 'generating_project_briefs'
	| 'consolidating_briefs'
	| 'generating_main_brief'
	| 'finalizing'
	| 'completed'
	| 'error';

// Metadata interfaces for each job type
export interface DailyBriefJobMetadata {
	briefDate: string; // YYYY-MM-DD format
	timezone: string; // IANA timezone
	options?: {
		forceRegenerate?: boolean;
		includeProjects?: string[];
		excludeProjects?: string[];
		customTemplate?: string;
		requestedBriefDate?: string;
		useOntology?: boolean;
		isReengagement?: boolean;
		daysSinceLastLogin?: number;
		engagementStage?: 'standard' | 'reengagement' | 'dormant';
		// Implicit app-open generation can create the in-app brief without
		// emitting email/SMS/push notifications.
		suppressNotification?: boolean;
		notificationSuppressionReason?: BriefNotificationSuppressionReason;
	};
	notificationOutcome?: 'emitted' | 'suppressed' | 'failed';
	notificationOutcomeAt?: string;
	generation_progress?: BriefGenerationProgress;
	notificationScheduledFor?: string; // ISO 8601 timestamp for when to send notification
}

export interface BriefGenerationProgress {
	step: BriefGenerationStep;
	progress: number; // 0-100
	message?: string;
	projects?: {
		completed: number;
		total: number;
		failed: number;
	};
	timestamp: string; // ISO timestamp
}

export interface OnboardingAnalysisJobMetadata {
	userId: string;
	userContext?: {
		input_projects?: string | null;
		input_work_style?: string | null;
		input_challenges?: string | null;
		input_help_focus?: string | null;
	};
	options?: {
		forceRegenerate?: boolean;
		maxQuestions?: number;
	};
}

export interface LegacyCalendarSyncJobMetadata {
	calendarId: string;
	syncDirection: 'to_google' | 'from_google' | 'bidirectional';
	dateRange?: {
		start: string;
		end: string;
	};
	lastSyncedAt?: string;
}

export interface OntoProjectEventSyncJobMetadata {
	kind: 'onto_project_event_sync';
	action: 'upsert' | 'delete';
	eventId: string;
	projectId: string;
	targetUserId: string;
	triggeredByUserId?: string;
	createCalendarIfMissing?: boolean;
	/** Guest writes may use only this user's mapping, never IDs on a shared event. */
	restrictToTargetUser?: boolean;
	eventUpdatedAt?: string;
	/** Durable provider identity retained when a project and its mappings are removed. */
	deletionSnapshot?: ProjectCalendarDeletionSnapshot;
}

export interface ProjectCalendarDeletionSnapshot {
	externalEventId: string;
	calendarId: string;
	calendarSourceId?: string;
	syncRowId?: string;
}

export function isProjectCalendarDeletionSnapshot(
	value: unknown
): value is ProjectCalendarDeletionSnapshot {
	if (!value || typeof value !== 'object') return false;
	const snapshot = value as Record<string, unknown>;
	return (
		typeof snapshot.externalEventId === 'string' &&
		snapshot.externalEventId.trim().length > 0 &&
		typeof snapshot.calendarId === 'string' &&
		snapshot.calendarId.trim().length > 0 &&
		(snapshot.calendarSourceId === undefined ||
			typeof snapshot.calendarSourceId === 'string') &&
		(snapshot.syncRowId === undefined || typeof snapshot.syncRowId === 'string')
	);
}

export type CalendarSyncJobMetadata =
	| LegacyCalendarSyncJobMetadata
	| OntoProjectEventSyncJobMetadata;

export interface SendSMSJobMetadata {
	message_id: string;
	phone_number: string;
	message: string;
	user_id: string;
	priority?: 'normal' | 'urgent';
	template_key?: string;
	variables?: Record<string, string | number | boolean>;
	scheduled_for?: string;
}

export interface ScheduleDailySMSJobMetadata {
	userId: string;
	date: string; // YYYY-MM-DD
	timezone: string;
	leadTimeMinutes: number;
}

export interface ClassifyChatSessionJobMetadata {
	sessionId: string;
	userId: string;
}

/**
 * Queue job 'capture_chat_checkpoint' (tasker/95): capture a project chat's new
 * messages into the thinking log and START HERE. Enqueued by the worker sweep
 * (threshold / idle) and by chat close, with dedup key 'chat-checkpoint:<sessionId>' so one
 * capture per session is active at a time.
 */
export interface CaptureChatCheckpointJobMetadata {
	sessionId: string;
	userId: string;
	trigger: 'threshold' | 'idle' | 'close' | 'backfill' | 'manual';
	/** The session's newest message when enqueued; a failure is recorded against it. */
	lastMessageId?: string;
}

/**
 * Queue job 'user_data_export': build the "Download my data" zip for one
 * user_data_exports row. Enqueued only by request_user_data_export()
 * (supabase/migrations/20260924190300_user_data_panel_and_exports.sql).
 */
export interface UserDataExportJobMetadata {
	exportId: string;
	userId: string;
}

export interface OntoBraindumpProcessingJobMetadata {
	braindumpId: string;
	userId: string;
}

export interface VoiceNoteTranscriptionJobMetadata {
	voiceNoteId: string;
	userId: string;
}

export interface GenerateBriefAudioJobMetadata {
	briefId: string;
}

export interface AgentRunJobMetadata {
	run_id: string;
	trigger: 'chat' | 'manual' | 'scheduled' | 'event';
	context_type: 'global' | 'project';
	project_id?: string | null;
	parent_run_id?: string | null;
	depth?: number;
	continuation_from?: 'paused' | 'needs_input' | 'partial' | 'children';
	scope_mode?: 'read_only' | 'read_write';
	effort?: 'standard' | 'deep';
	run_template?: 'agent' | 'deep_research';
	allowed_ops?: string[] | null;
	review_required?: boolean;
	budgets?: {
		wall_clock_ms?: number;
		max_tokens?: number;
		max_tool_calls?: number;
		max_cost_usd?: number;
	};
}

export interface ProjectContextSnapshotJobMetadata {
	projectId: string;
	reason?: string;
	force?: boolean;
}

export interface ProjectLoopJobMetadata {
	runId?: string;
	projectId: string;
	userId: string;
	triggerReason: 'end_of_day' | 'scheduled' | 'burst' | 'critical_change' | 'manual';
	mode?:
		| 'light_loop'
		| 'complete_audit'
		| 'complete_audit_trigger_evaluation'
		| 'debounced_review_signal';
	signalId?: string;
	auditId?: string;
	auditDepth?: 'standard' | 'deep';
	triggerEvaluationId?: string;
}

/** Document consolidation run (docs/research/doc-task-consolidation-2026-10-03). */
export interface ConsolidationRunJobMetadata {
	runId: string;
	userId: string;
	/**
	 * survey: inventory + groups + questions. replan: re-decide one group after a
	 * typed or chat answer. merge: read the group's sources into a fact ledger
	 * and write the merged draft. merge_write: rewrite that draft after the
	 * owner answered one of its questions.
	 */
	action: 'survey' | 'replan' | 'merge' | 'merge_write';
	questionId?: string;
	clusterKey?: string;
}

export interface ProjectActivityBatchFlushJobMetadata {
	batch_id?: string;
	batchId?: string;
}

export interface AssetOcrJobMetadata {
	assetId: string;
	projectId: string;
	userId: string;
	forceOverwrite?: boolean;
}

/**
 * Semantic discovery embedding refresh for one ontology entity
 * (docs/architecture/semantic-discovery/README.md). Enqueued by the
 * enqueue_onto_entity_embedding DB trigger on every text-changing write.
 */
export interface EmbedOntoEntityJobMetadata {
	entityType:
		| 'project'
		| 'task'
		| 'goal'
		| 'plan'
		| 'milestone'
		| 'document'
		| 'risk'
		| 'requirement'
		| 'event'
		| 'image';
	entityId: string;
	projectId: string;
	userId: string;
	/** True when the source row was (soft-)deleted: clear stored embeddings. */
	deleted?: boolean;
}

/** Pick a new project's tile emoji (onto_projects.icon_emoji); queued by an insert trigger. */
/** workspace_suggest: queued a few minutes after a loose item lands in a Workspace. */
export interface WorkspaceSuggestJobMetadata {
	userId: string;
	workspaceProjectId: string;
	/** Set when the person asked for a fresh look from the Workspace page. */
	reason?: 'capture' | 'requested';
}

export interface WorkspaceSuggestResult {
	success: boolean;
	userId: string;
	outcome: 'suggested' | 'nothing_new' | 'skipped' | 'failed';
	reason?: string;
	created?: number;
	staled?: number;
	runId?: string;
	/** What the model read; the next run is skipped when it hasn't changed. */
	inputHash?: string;
}

export interface PickProjectEmojiJobMetadata {
	projectId: string;
	userId: string;
}

export interface PickProjectEmojiResult {
	success: boolean;
	projectId: string;
	/** skipped: deleted, already has emoji, or someone chose their own meanwhile. */
	outcome: 'picked' | 'skipped' | 'failed';
	glyphs?: string[];
	reason?: string;
}

export interface EmbedOntoEntityResult {
	success: boolean;
	entityType: string;
	entityId: string;
	chunksWritten: number;
	chunksDeleted: number;
	skippedUnchanged: boolean;
}

export interface AdminQuestionTreeJobMetadata {
	run_id: string;
	advance_sequence: number;
}

// Map job types to their metadata
export interface JobMetadataMap {
	// Allow indexing by queue job types that are not explicitly listed (e.g. retired
	// pipelines whose enum values remain in the DB, like buildos_homework/buildos_tree_agent).
	[key: string]: unknown;
	generate_daily_brief: DailyBriefJobMetadata;
	onboarding_analysis: OnboardingAnalysisJobMetadata;
	sync_calendar: CalendarSyncJobMetadata;
	send_sms: SendSMSJobMetadata;
	send_notification: NotificationJobMetadata;
	schedule_daily_sms: ScheduleDailySMSJobMetadata;
	classify_chat_session: ClassifyChatSessionJobMetadata;
	process_onto_braindump: OntoBraindumpProcessingJobMetadata;
	transcribe_voice_note: VoiceNoteTranscriptionJobMetadata;
	generate_brief_audio: GenerateBriefAudioJobMetadata;
	agent_run: AgentRunJobMetadata;
	build_project_context_snapshot: ProjectContextSnapshotJobMetadata;
	buildos_project_loop: ProjectLoopJobMetadata;
	project_activity_batch_flush: ProjectActivityBatchFlushJobMetadata;
	extract_onto_asset_ocr: AssetOcrJobMetadata;
	embed_onto_entity: EmbedOntoEntityJobMetadata;
	pick_project_emoji: PickProjectEmojiJobMetadata;
	workspace_suggest: WorkspaceSuggestJobMetadata;
	admin_question_tree: AdminQuestionTreeJobMetadata;
	run_cycle: CycleQueueJobMetadata;
	freshness_radar_scan: FreshnessScanJobMetadata;
	capture_chat_checkpoint: CaptureChatCheckpointJobMetadata;
	user_data_export: UserDataExportJobMetadata;
	consolidation_run: ConsolidationRunJobMetadata;
	other: Record<string, unknown>;
}

export interface ScheduleDailySMSResult {
	success: boolean;
	scheduled_count?: number;
	message?: string;
}

export interface ClassifyChatSessionResult {
	success: boolean;
	sessionId: string;
	title?: string;
	topics?: string[];
	summary?: string;
	messageCount?: number;
	error?: string;
}

export interface OntoBraindumpProcessingResult {
	success: boolean;
	braindumpId: string;
	title?: string;
	topics?: string[];
	summary?: string;
	contentLength?: number;
	skipped?: boolean;
	reason?: string;
	error?: string;
}

export interface VoiceNoteTranscriptionResult {
	success: boolean;
	voiceNoteId: string;
	transcriptLength?: number;
	skipped?: boolean;
	reason?: string;
	error?: string;
}

export interface GenerateBriefAudioResult {
	success: boolean;
	briefId: string;
	storagePath?: string;
	durationMs?: number;
	generationMs?: number;
	skipped?: boolean;
	reason?: string;
	error?: string;
}

export interface ProjectContextSnapshotResult {
	success: boolean;
	projectId: string;
	duration_ms?: number;
	skipped?: boolean;
	error?: string;
}

export interface ProjectActivityBatchFlushResult {
	batch_id: string | null;
	status: 'flushed' | 'already_flushed' | 'missing' | 'failed' | 'invalid';
	event_id: string | null;
	message: string | null;
}

export interface AssetOcrResult {
	success: boolean;
	assetId: string;
	projectId?: string;
	ocrStatus?: 'complete' | 'failed' | 'skipped';
	transcriptLength?: number;
	reason?: string;
	error?: string;
}

export interface AgentRunJobResult {
	success: boolean;
	run_id: string;
	status:
		| 'completed'
		| 'partial'
		| 'failed'
		| 'needs_input'
		| 'proposal_ready'
		| 'cancelled'
		| 'paused'
		| 'skipped';
	message?: string;
}

// Job result types
export interface JobResultMap {
	// Allow indexing by queue job types that are not explicitly listed yet.
	[key: string]: unknown;
	generate_daily_brief: DailyBriefResult;
	onboarding_analysis: OnboardingAnalysisResult;
	sync_calendar: CalendarSyncResult;
	send_sms: SendSMSResult;
	send_notification: NotificationSendResult;
	schedule_daily_sms: ScheduleDailySMSResult;
	classify_chat_session: ClassifyChatSessionResult;
	process_onto_braindump: OntoBraindumpProcessingResult;
	transcribe_voice_note: VoiceNoteTranscriptionResult;
	generate_brief_audio: GenerateBriefAudioResult;
	agent_run: AgentRunJobResult;
	build_project_context_snapshot: ProjectContextSnapshotResult;
	project_activity_batch_flush: ProjectActivityBatchFlushResult;
	extract_onto_asset_ocr: AssetOcrResult;
	embed_onto_entity: EmbedOntoEntityResult;
	pick_project_emoji: PickProjectEmojiResult;
	workspace_suggest: WorkspaceSuggestResult;
	run_cycle: CycleQueueJobResult;
	other: unknown;
}

export interface CycleQueueJobResult {
	cycle_run_id: string;
	outcome: CycleRunOutcome | null;
	already_terminal: boolean;
}

export interface DailyBriefResult {
	briefId: string;
	briefDate: string;
	projectBriefsGenerated: number;
	emailSent: boolean;
	generationTimeMs: number;
	errorMessages?: string[];
}

export interface OnboardingAnalysisResult {
	analysisComplete: boolean;
	suggestedProjects?: string[];
	userProfile?: Record<string, unknown>;
	nextStep?: string;
}

export interface CalendarSyncResult {
	eventsCreated: number;
	eventsUpdated: number;
	eventsDeleted: number;
	conflicts: string[];
	lastSyncedAt: string;
}

export interface SendSMSResult {
	success: boolean;
	twilio_sid?: string;
	delivered_at?: string;
	error?: string;
	attempt?: number;
}

export interface NotificationSendResult {
	success: boolean;
	deliveryId: string;
	channel: string;
	sentAt?: string;
	error?: string;
}

// Generic queue job with type-safe metadata
export interface QueueJob<T extends QueueJobType = QueueJobType> {
	id: string;
	queue_job_id?: string; // Optional for compatibility
	user_id: string;
	job_type: T;
	status: QueueJobStatus;
	scheduled_for: string;
	metadata: JobMetadataMap[T] | null;
	attempts: number;
	max_attempts: number;
	priority: number | null;
	created_at: string;
	updated_at: string | null;
	started_at: string | null;
	processed_at: string | null;
	completed_at: string | null;
	error_message: string | null;
	result: JobResultMap[T] | null;
}

// Helper type for the daily brief job
export type DailyBriefQueueJob = QueueJob<'generate_daily_brief'>;
