// apps/worker/src/workers/shared/queueUtils.ts
// Utility functions for queue operations (Redis-free version)

import type { DailyBriefJobMetadata, Database, QueueJobStatus } from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';

type QueueJobUpdate = Database['public']['Tables']['queue_jobs']['Update'];

// Legacy job data interfaces - kept for backward compatibility
// These map to the new metadata types
export interface BriefJobData extends Omit<DailyBriefJobMetadata, 'briefDate' | 'timezone'> {
	userId: string;
	briefDate?: string; // Made optional for backward compat (worker has fallback logic)
	timezone?: string; // Made optional for backward compat (worker has fallback logic)
	notificationScheduledFor?: string; // ISO 8601 timestamp for scheduling notification at user's preferred time
	options?: {
		forceRegenerate?: boolean;
		includeProjects?: string[];
		excludeProjects?: string[];
		customTemplate?: string;
		requestedBriefDate?: string;
		// Engagement metadata for re-engagement emails
		isReengagement?: boolean;
		daysSinceLastLogin?: number;
		// Ontology brief generation flag
		useOntology?: boolean;
	};
}

export interface OnboardingAnalysisJobData {
	userId: string;
	userContext: {
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

export interface EmailBriefJobData {
	emailId: string; // ID from emails table
}

export interface SMSJobData {
	message_id: string; // ID from sms_messages table
	phone_number: string; // E.164 formatted phone number
	message: string; // SMS message body
	user_id: string; // User ID for tracking and preferences
	priority?: 'normal' | 'urgent'; // Priority level for queue processing
	scheduled_sms_id?: string; // Optional ID from scheduled_sms_messages table
}

export interface ChatClassificationJobData {
	sessionId: string; // ID of the chat session to classify
	userId: string; // User ID who owns the session
}

export interface BraindumpProcessingJobData {
	braindumpId: string; // ID of the onto_braindumps record to process
	userId: string; // User ID who owns the captured context
}

// Update job status in database
export async function updateJobStatus(
	queueJobId: string,
	status: QueueJobStatus,
	jobType:
		| 'brief'
		| 'onboarding'
		| 'send_sms'
		| 'email'
		| 'email_cancelled'
		| 'email_sent'
		| 'chat_classification'
		| 'process_onto_braindump',
	errorMessage?: string,
	processingToken?: string | null
) {
	// Status is now consistent - no mapping needed
	const mappedStatus = status;

	const updateData: QueueJobUpdate = {
		status: mappedStatus,
		processed_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	};

	if (errorMessage) {
		updateData.error_message = errorMessage;
	}

	if (mappedStatus === 'processing') {
		updateData.started_at = new Date().toISOString();
	} else if (mappedStatus === 'completed') {
		updateData.completed_at = new Date().toISOString();
	}

	let query = supabase.from('queue_jobs').update(updateData).eq('queue_job_id', queueJobId);

	if (processingToken) {
		query = query.eq('processing_token', processingToken);
	}

	const { error } = await query;

	if (error) {
		console.error('Failed to update job status:', error);
	}
}

// Send notification to user via Supabase Realtime
export async function broadcastUserEvent(
	userId: string,
	event:
		| string
		| {
				type: string;
				emailId?: string;
				briefId?: string;
				briefDate?: string;
				error?: string;
				trackingId?: string;
		  },
	payload?: any
) {
	try {
		// Handle both old and new notification formats
		const actualEvent = typeof event === 'string' ? event : event.type;
		const actualPayload = typeof event === 'string' ? payload : event;

		// Send realtime notification
		const channel = supabase.channel(`user:${userId}`);
		await channel.send({
			type: 'broadcast',
			event: actualEvent,
			payload: actualPayload
		});

		console.log(`📢 Sent notification to user ${userId}: ${actualEvent}`);
	} catch (error) {
		console.error('Failed to send notification:', error);
	}
}

/**
 * Validate BriefJobData and throw if invalid
 * Ensures data integrity before job processing
 */
export function validateBriefJobData(data: unknown): BriefJobData {
	if (!data || typeof data !== 'object') {
		throw new Error('Invalid job data: expected object');
	}
	const d = data as Record<string, unknown>;

	// Check userId
	if (!d.userId || typeof d.userId !== 'string') {
		throw new Error('Invalid job data: userId is required and must be string');
	}

	// Validate briefDate if provided
	if (d.briefDate !== undefined && d.briefDate !== null) {
		if (typeof d.briefDate !== 'string') {
			throw new Error(
				`Invalid job data: briefDate must be YYYY-MM-DD string, got ${typeof d.briefDate}`
			);
		}
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(d.briefDate)) {
			throw new Error(
				`Invalid job data: briefDate must be YYYY-MM-DD format, got "${d.briefDate}"`
			);
		}

		// Validate date is reasonable (not in future by more than 30 days)
		const jobDate = new Date(d.briefDate);
		const maxFuture = new Date();
		maxFuture.setDate(maxFuture.getDate() + 30);

		if (jobDate > maxFuture) {
			throw new Error(`Invalid job data: briefDate too far in future`);
		}
	}

	// Validate timezone if provided
	if (d.timezone !== undefined && d.timezone !== null) {
		if (typeof d.timezone !== 'string') {
			throw new Error(`Invalid job data: timezone must be string`);
		}
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: d.timezone });
		} catch {
			throw new Error(`Invalid job data: timezone "${d.timezone}" is not valid`);
		}
	}

	return data as BriefJobData;
}

/**
 * Validate SMSJobData and throw if invalid
 * Ensures data integrity before SMS job processing
 */
export function validateSMSJobData(data: unknown): SMSJobData {
	if (!data || typeof data !== 'object') {
		throw new Error('Invalid SMS job data: expected object');
	}
	const d = data as Record<string, unknown>;

	// Check required fields
	if (!d.message_id || typeof d.message_id !== 'string') {
		throw new Error('Invalid SMS job data: message_id is required and must be string');
	}

	if (!d.phone_number || typeof d.phone_number !== 'string') {
		throw new Error('Invalid SMS job data: phone_number is required and must be string');
	}

	if (!d.message || typeof d.message !== 'string') {
		throw new Error('Invalid SMS job data: message is required and must be string');
	}

	if (!d.user_id || typeof d.user_id !== 'string') {
		throw new Error('Invalid SMS job data: user_id is required and must be string');
	}

	// Validate phone number format (E.164)
	const e164Regex = /^\+[1-9]\d{1,14}$/;
	if (!e164Regex.test(d.phone_number)) {
		throw new Error(
			`Invalid SMS job data: phone_number must be in E.164 format (+1234567890), got "${d.phone_number}"`
		);
	}

	// Validate message length (Twilio SMS limit is 1600 characters for concatenated messages)
	if (d.message.length > 1600) {
		throw new Error(
			`Invalid SMS job data: message exceeds maximum length of 1600 characters (got ${d.message.length})`
		);
	}

	// Validate priority if provided
	if (d.priority !== undefined && d.priority !== 'normal' && d.priority !== 'urgent') {
		throw new Error(
			`Invalid SMS job data: priority must be "normal" or "urgent", got "${String(d.priority)}"`
		);
	}

	return data as SMSJobData;
}

/**
 * Validate ChatClassificationJobData and throw if invalid
 * Ensures data integrity before chat classification job processing
 */
export function validateChatClassificationJobData(data: unknown): ChatClassificationJobData {
	if (!data || typeof data !== 'object') {
		throw new Error('Invalid chat classification job data: expected object');
	}
	const d = data as Record<string, unknown>;

	// Check sessionId
	if (!d.sessionId || typeof d.sessionId !== 'string') {
		throw new Error(
			'Invalid chat classification job data: sessionId is required and must be string'
		);
	}

	// Validate UUID format for sessionId
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(d.sessionId)) {
		throw new Error(
			`Invalid chat classification job data: sessionId must be a valid UUID, got "${d.sessionId}"`
		);
	}

	// Check userId
	if (!d.userId || typeof d.userId !== 'string') {
		throw new Error(
			'Invalid chat classification job data: userId is required and must be string'
		);
	}

	// Validate UUID format for userId
	if (!uuidRegex.test(d.userId)) {
		throw new Error(
			`Invalid chat classification job data: userId must be a valid UUID, got "${d.userId}"`
		);
	}

	return data as ChatClassificationJobData;
}

/**
 * Validate BraindumpProcessingJobData and throw if invalid
 * Ensures data integrity before ontology capture processing job processing
 */
export function validateBraindumpProcessingJobData(data: unknown): BraindumpProcessingJobData {
	if (!data || typeof data !== 'object') {
		throw new Error('Invalid braindump processing job data: expected object');
	}
	const d = data as Record<string, unknown>;

	// Check braindumpId
	if (!d.braindumpId || typeof d.braindumpId !== 'string') {
		throw new Error(
			'Invalid braindump processing job data: braindumpId is required and must be string'
		);
	}

	// Validate UUID format for braindumpId
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(d.braindumpId)) {
		throw new Error(
			`Invalid braindump processing job data: braindumpId must be a valid UUID, got "${d.braindumpId}"`
		);
	}

	// Check userId
	if (!d.userId || typeof d.userId !== 'string') {
		throw new Error(
			'Invalid braindump processing job data: userId is required and must be string'
		);
	}

	// Validate UUID format for userId
	if (!uuidRegex.test(d.userId)) {
		throw new Error(
			`Invalid braindump processing job data: userId must be a valid UUID, got "${d.userId}"`
		);
	}

	return data as BraindumpProcessingJobData;
}
