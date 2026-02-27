// packages/shared-types/src/queue-types.ts
import type { Database } from './database.types';
import type { NotificationJobMetadata } from './notification.types';

// Re-export database enums as the single source of truth
export type QueueJobType = Database['public']['Enums']['queue_type'];
export type QueueJobStatus = Database['public']['Enums']['queue_status'];

export type OntologyEntityType = 'task' | 'plan' | 'goal' | 'risk' | 'milestone' | 'document';

export type OntologyClassificationSource = 'create_modal';

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
	forceRegenerate?: boolean;
	includeProjects?: string[];
	excludeProjects?: string[];
	customTemplate?: string;
	requestedBriefDate?: string;
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

export interface PhaseGenerationJobMetadata {
	projectId: string;
	regenerate?: boolean;
	template?: string;
	includeExistingTasks?: boolean;
}

export interface OnboardingAnalysisJobMetadata {
	userId: string;
	step: 'initial' | 'preferences' | 'complete';
	responses?: Record<string, unknown>;
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
	eventUpdatedAt?: string;
}

export type CalendarSyncJobMetadata =
	| LegacyCalendarSyncJobMetadata
	| OntoProjectEventSyncJobMetadata;

export interface BrainDumpProcessJobMetadata {
	brainDumpId: string;
	processMode: 'full' | 'quick';
	projectId?: string;
	includeTaskExtraction?: boolean;
}

export interface EmailJobMetadata {
	recipientUserId: string;
	emailType: 'daily_brief' | 'welcome' | 'trial_ending' | 'payment_failed' | 'weekly_summary';
	templateId?: string;
	variables?: Record<string, string | number | boolean>;
	briefId?: string; // For daily_brief emails
}

export interface RecurringTaskJobMetadata {
	taskIds?: string[];
	dryRun?: boolean;
	updatedCount?: number;
}

export interface CleanupJobMetadata {
	targetDate?: string; // Clean data older than this date
	deletedCount?: number;
	entities?: string[]; // Which entities to clean
}

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

export interface GenerateBriefEmailJobMetadata {
	emailId: string; // ID from emails table
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

export interface OntoBraindumpProcessingJobMetadata {
	braindumpId: string;
	userId: string;
}

export interface VoiceNoteTranscriptionJobMetadata {
	voiceNoteId: string;
	userId: string;
}

export interface HomeworkJobMetadata {
	run_id: string;
	iteration: number;
	chat_session_id?: string | null;
	context_type?: string;
	entity_id?: string;
	scope?: 'global' | 'project' | 'multi_project';
	project_ids?: string[];
	budgets: {
		max_iterations?: number;
		max_wall_clock_ms: number;
		max_cost_usd?: number;
		max_total_tokens?: number;
	};
	permissions: {
		write_mode: 'autopilot' | 'approve_plan' | 'per_write';
		allowed_tools?: string[];
	};
}

export interface TreeAgentJobMetadata {
	run_id: string;
	root_node_id: string;
	workspace_project_id: string;
	budgets: {
		max_wall_clock_ms: number;
	};
	// Context fields - priority over metrics.context
	context_type?: 'global' | 'project';
	context_project_id?: string | null;
	// Optional: future support for multi-project scope
	scope?: 'global' | 'project' | 'multi_project';
	project_ids?: string[] | null;
}

export interface ProjectContextSnapshotJobMetadata {
	projectId: string;
	reason?: string;
	force?: boolean;
}

export interface ProjectIconGenerationJobMetadata {
	generationId: string;
	projectId: string;
	requestedByUserId: string;
	triggerSource: 'auto' | 'manual' | 'regenerate';
	steeringPrompt?: string;
	candidateCount: number; // auto: 1, manual default: 4
	autoSelect: boolean; // true for auto flow
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

// Map job types to their metadata
export interface JobMetadataMap {
	generate_daily_brief: DailyBriefJobMetadata;
	generate_phases: PhaseGenerationJobMetadata;
	onboarding_analysis: OnboardingAnalysisJobMetadata;
	sync_calendar: CalendarSyncJobMetadata;
	process_brain_dump: BrainDumpProcessJobMetadata;
	send_email: EmailJobMetadata;
	update_recurring_tasks: RecurringTaskJobMetadata;
	cleanup_old_data: CleanupJobMetadata;
	send_sms: SendSMSJobMetadata;
	generate_brief_email: GenerateBriefEmailJobMetadata;
	send_notification: NotificationJobMetadata;
	schedule_daily_sms: ScheduleDailySMSJobMetadata;
	classify_chat_session: ClassifyChatSessionJobMetadata;
	process_onto_braindump: OntoBraindumpProcessingJobMetadata;
	transcribe_voice_note: VoiceNoteTranscriptionJobMetadata;
	buildos_homework: HomeworkJobMetadata;
	buildos_tree_agent: TreeAgentJobMetadata;
	build_project_context_snapshot: ProjectContextSnapshotJobMetadata;
	generate_project_icon: ProjectIconGenerationJobMetadata;
	project_activity_batch_flush: ProjectActivityBatchFlushJobMetadata;
	extract_onto_asset_ocr: AssetOcrJobMetadata;
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

export interface HomeworkJobResult {
	success: boolean;
	run_id: string;
	iteration: number;
	status?:
		| 'queued'
		| 'running'
		| 'waiting_on_user'
		| 'completed'
		| 'stopped'
		| 'canceled'
		| 'failed';
	message?: string;
}

export interface ProjectContextSnapshotResult {
	success: boolean;
	projectId: string;
	duration_ms?: number;
	skipped?: boolean;
	error?: string;
}

export interface ProjectIconGenerationResult {
	success: boolean;
	projectId: string;
	generationId: string;
	candidatesCreated?: number;
	selectedCandidateId?: string;
	skipped?: boolean;
	reason?: string;
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

// Job result types
export interface JobResultMap {
	// Allow indexing by queue job types that are not explicitly listed yet.
	[key: string]: unknown;
	generate_daily_brief: DailyBriefResult;
	generate_phases: PhaseGenerationResult;
	onboarding_analysis: OnboardingAnalysisResult;
	sync_calendar: CalendarSyncResult;
	process_brain_dump: BrainDumpProcessResult;
	send_email: EmailSendResult;
	update_recurring_tasks: RecurringTaskResult;
	cleanup_old_data: CleanupResult;
	send_sms: SendSMSResult;
	generate_brief_email: GenerateBriefEmailResult;
	send_notification: NotificationSendResult;
	schedule_daily_sms: ScheduleDailySMSResult;
	classify_chat_session: ClassifyChatSessionResult;
	process_onto_braindump: OntoBraindumpProcessingResult;
	transcribe_voice_note: VoiceNoteTranscriptionResult;
	buildos_homework: HomeworkJobResult;
	build_project_context_snapshot: ProjectContextSnapshotResult;
	generate_project_icon: ProjectIconGenerationResult;
	project_activity_batch_flush: ProjectActivityBatchFlushResult;
	extract_onto_asset_ocr: AssetOcrResult;
	other: unknown;
}

export interface DailyBriefResult {
	briefId: string;
	briefDate: string;
	projectBriefsGenerated: number;
	emailSent: boolean;
	generationTimeMs: number;
	errorMessages?: string[];
}

export interface PhaseGenerationResult {
	projectId: string;
	phasesCreated: string[];
	tasksAssigned: number;
	errors?: string[];
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

export interface BrainDumpProcessResult {
	projectsCreated: string[];
	tasksCreated: string[];
	processingTimeMs: number;
	extractedContext?: string;
}

export interface EmailSendResult {
	sent: boolean;
	messageId?: string;
	error?: string;
	provider?: 'resend' | 'sendgrid' | 'smtp';
}

export interface RecurringTaskResult {
	updated: number;
	failed: number;
	taskIds: string[];
}

export interface CleanupResult {
	deleted: number;
	entities: Record<string, number>;
	errors?: string[];
}

export interface SendSMSResult {
	success: boolean;
	twilio_sid?: string;
	delivered_at?: string;
	error?: string;
	attempt?: number;
}

export interface GenerateBriefEmailResult {
	emailId: string;
	sent: boolean;
	sentAt?: string;
	recipientEmail: string;
	trackingId?: string;
	error?: string;
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

// Helper types for specific job types
export type DailyBriefQueueJob = QueueJob<'generate_daily_brief'>;
export type PhaseQueueJob = QueueJob<'generate_phases'>;
export type EmailQueueJob = QueueJob<'send_email'>;
export type BrainDumpQueueJob = QueueJob<'process_brain_dump'>;
export type SendSMSQueueJob = QueueJob<'send_sms'>;

// Type guards
export function isValidJobMetadata<T extends QueueJobType>(
	jobType: T,
	metadata: unknown
): metadata is JobMetadataMap[T] {
	switch (jobType) {
		case 'generate_daily_brief':
			return isDailyBriefMetadata(metadata);
		case 'generate_phases':
			return isPhaseGenerationMetadata(metadata);
		case 'onboarding_analysis':
			return isOnboardingAnalysisMetadata(metadata);
		case 'sync_calendar':
			return isCalendarSyncMetadata(metadata);
		case 'process_brain_dump':
			return isBrainDumpProcessMetadata(metadata);
		case 'send_email':
			return isEmailJobMetadata(metadata);
		case 'update_recurring_tasks':
			return isRecurringTaskMetadata(metadata);
		case 'cleanup_old_data':
			return isCleanupMetadata(metadata);
		case 'send_sms':
			return isSendSMSMetadata(metadata);
		case 'generate_brief_email':
			return isGenerateBriefEmailMetadata(metadata);
		case 'send_notification':
			return isNotificationMetadata(metadata);
		case 'schedule_daily_sms':
			return isScheduleDailySMSMetadata(metadata);
		case 'classify_chat_session':
			return isClassifyChatSessionMetadata(metadata);
		case 'process_onto_braindump':
			return isOntoBraindumpProcessingMetadata(metadata);
		case 'generate_project_icon':
			return isProjectIconGenerationMetadata(metadata);
		case 'project_activity_batch_flush':
			return isProjectActivityBatchFlushMetadata(metadata);
		default:
			return true;
	}
}

function isDailyBriefMetadata(obj: unknown): obj is DailyBriefJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return (
		typeof meta.briefDate === 'string' &&
		typeof meta.timezone === 'string' &&
		/^\d{4}-\d{2}-\d{2}$/.test(meta.briefDate as string)
	);
}

function isPhaseGenerationMetadata(obj: unknown): obj is PhaseGenerationJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return typeof meta.projectId === 'string';
}

function isOnboardingAnalysisMetadata(obj: unknown): obj is OnboardingAnalysisJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return (
		typeof meta.userId === 'string' &&
		(!meta.step || ['initial', 'preferences', 'complete'].includes(meta.step as string))
	);
}

function isCalendarSyncMetadata(obj: unknown): obj is CalendarSyncJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	if (meta.kind === 'onto_project_event_sync') {
		return (
			(meta.action === 'upsert' || meta.action === 'delete') &&
			typeof meta.eventId === 'string' &&
			typeof meta.projectId === 'string' &&
			typeof meta.targetUserId === 'string'
		);
	}
	return (
		typeof meta.calendarId === 'string' &&
		(!meta.syncDirection ||
			['to_google', 'from_google', 'bidirectional'].includes(meta.syncDirection as string))
	);
}

function isBrainDumpProcessMetadata(obj: unknown): obj is BrainDumpProcessJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return (
		typeof meta.brainDumpId === 'string' &&
		(!meta.processMode || ['full', 'quick'].includes(meta.processMode as string))
	);
}

function isEmailJobMetadata(obj: unknown): obj is EmailJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return typeof meta.recipientUserId === 'string' && typeof meta.emailType === 'string';
}

function isRecurringTaskMetadata(obj: unknown): obj is RecurringTaskJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	return true; // All fields are optional
}

function isCleanupMetadata(obj: unknown): obj is CleanupJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	return true; // All fields are optional
}

function isSendSMSMetadata(obj: unknown): obj is SendSMSJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return (
		typeof meta.message_id === 'string' &&
		typeof meta.phone_number === 'string' &&
		typeof meta.message === 'string' &&
		typeof meta.user_id === 'string'
	);
}

function isGenerateBriefEmailMetadata(obj: unknown): obj is GenerateBriefEmailJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return typeof meta.emailId === 'string';
}

function isNotificationMetadata(obj: unknown): obj is NotificationJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return (
		typeof meta.event_id === 'string' &&
		typeof meta.delivery_id === 'string' &&
		typeof meta.channel === 'string' &&
		typeof meta.event_type === 'string'
	);
}

function isScheduleDailySMSMetadata(obj: unknown): obj is ScheduleDailySMSJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return (
		typeof meta.userId === 'string' &&
		typeof meta.date === 'string' &&
		typeof meta.timezone === 'string' &&
		typeof meta.leadTimeMinutes === 'number'
	);
}

function isClassifyChatSessionMetadata(obj: unknown): obj is ClassifyChatSessionJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return typeof meta.sessionId === 'string' && typeof meta.userId === 'string';
}

function isOntoBraindumpProcessingMetadata(
	obj: unknown
): obj is OntoBraindumpProcessingJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	return typeof meta.braindumpId === 'string' && typeof meta.userId === 'string';
}

function isProjectActivityBatchFlushMetadata(
	obj: unknown
): obj is ProjectActivityBatchFlushJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	const snake = meta.batch_id;
	const camel = meta.batchId;
	return typeof snake === 'string' || typeof camel === 'string';
}

function isProjectIconGenerationMetadata(obj: unknown): obj is ProjectIconGenerationJobMetadata {
	if (!obj || typeof obj !== 'object') return false;
	const meta = obj as Record<string, unknown>;
	const triggerSource = meta.triggerSource;
	return (
		typeof meta.generationId === 'string' &&
		typeof meta.projectId === 'string' &&
		typeof meta.requestedByUserId === 'string' &&
		(triggerSource === 'auto' ||
			triggerSource === 'manual' ||
			triggerSource === 'regenerate') &&
		typeof meta.candidateCount === 'number' &&
		Number.isInteger(meta.candidateCount) &&
		meta.candidateCount >= 1 &&
		meta.candidateCount <= 8 &&
		typeof meta.autoSelect === 'boolean' &&
		(meta.steeringPrompt === undefined || typeof meta.steeringPrompt === 'string')
	);
}

// Helper function to create a typed queue job
export function createQueueJob<T extends QueueJobType>(
	jobType: T,
	data: Omit<QueueJob<T>, 'job_type'>
): QueueJob<T> {
	return {
		...data,
		job_type: jobType
	};
}

// Helper to extract metadata with type safety
export function getJobMetadata<T extends QueueJobType>(job: QueueJob<T>): JobMetadataMap[T] | null {
	return job.metadata;
}

// Helper to extract result with type safety
export function getJobResult<T extends QueueJobType>(job: QueueJob<T>): JobResultMap[T] | null {
	return job.result;
}
