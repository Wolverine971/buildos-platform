// apps/worker/src/workers/shared/queueUtils.ts
// Utility functions for queue operations (Redis-free version)

import type {
	QueueJobStatus,
	DailyBriefJobMetadata,
	PhaseGenerationJobMetadata,
	OnboardingAnalysisJobMetadata
} from '@buildos/shared-types';
import { supabase } from '../../lib/supabase';

// Legacy job data interfaces - kept for backward compatibility
// These map to the new metadata types
export interface BriefJobData extends Omit<DailyBriefJobMetadata, 'briefDate' | 'timezone'> {
	userId: string;
	briefDate?: string; // Made optional for backward compat (worker has fallback logic)
	timezone?: string; // Made optional for backward compat (worker has fallback logic)
	notificationScheduledFor?: string; // ISO 8601 timestamp for scheduling notification at user's preferred time
	options?: {
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

export interface PhasesJobData {
	userId: string;
	projectId: string;
	options?: {
		regenerate?: boolean;
		template?: string;
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
	userId: string; // User ID who owns the braindump
}

// Update job status in database
export async function updateJobStatus(
	queueJobId: string,
	status: QueueJobStatus,
	jobType:
		| 'brief'
		| 'phases'
		| 'onboarding'
		| 'send_sms'
		| 'email'
		| 'email_cancelled'
		| 'email_sent'
		| 'chat_classification'
		| 'process_onto_braindump',
	errorMessage?: string
) {
	// Status is now consistent - no mapping needed
	const mappedStatus = status;

	const updateData: any = {
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

	const { error } = await supabase
		.from('queue_jobs')
		.update(updateData)
		.eq('queue_job_id', queueJobId);

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

// Backward compatibility alias (realtime broadcast, not persistent notification delivery)
export const notifyUser = broadcastUserEvent;

/**
 * Validate BriefJobData and throw if invalid
 * Ensures data integrity before job processing
 */
export function validateBriefJobData(data: any): BriefJobData {
	// Check userId
	if (!data.userId || typeof data.userId !== 'string') {
		throw new Error('Invalid job data: userId is required and must be string');
	}

	// Validate briefDate if provided
	if (data.briefDate) {
		const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
		if (!dateRegex.test(data.briefDate)) {
			throw new Error(
				`Invalid job data: briefDate must be YYYY-MM-DD format, got "${data.briefDate}"`
			);
		}

		// Validate date is reasonable (not in future by more than 30 days)
		const jobDate = new Date(data.briefDate);
		const maxFuture = new Date();
		maxFuture.setDate(maxFuture.getDate() + 30);

		if (jobDate > maxFuture) {
			throw new Error(`Invalid job data: briefDate too far in future`);
		}
	}

	// Validate timezone if provided
	if (data.timezone) {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: data.timezone });
		} catch (e) {
			throw new Error(`Invalid job data: timezone "${data.timezone}" is not valid`);
		}
	}

	return data as BriefJobData;
}

/**
 * Validate SMSJobData and throw if invalid
 * Ensures data integrity before SMS job processing
 */
export function validateSMSJobData(data: any): SMSJobData {
	// Check required fields
	if (!data.message_id || typeof data.message_id !== 'string') {
		throw new Error('Invalid SMS job data: message_id is required and must be string');
	}

	if (!data.phone_number || typeof data.phone_number !== 'string') {
		throw new Error('Invalid SMS job data: phone_number is required and must be string');
	}

	if (!data.message || typeof data.message !== 'string') {
		throw new Error('Invalid SMS job data: message is required and must be string');
	}

	if (!data.user_id || typeof data.user_id !== 'string') {
		throw new Error('Invalid SMS job data: user_id is required and must be string');
	}

	// Validate phone number format (E.164)
	const e164Regex = /^\+[1-9]\d{1,14}$/;
	if (!e164Regex.test(data.phone_number)) {
		throw new Error(
			`Invalid SMS job data: phone_number must be in E.164 format (+1234567890), got "${data.phone_number}"`
		);
	}

	// Validate message length (Twilio SMS limit is 1600 characters for concatenated messages)
	if (data.message.length > 1600) {
		throw new Error(
			`Invalid SMS job data: message exceeds maximum length of 1600 characters (got ${data.message.length})`
		);
	}

	// Validate priority if provided
	if (data.priority && data.priority !== 'normal' && data.priority !== 'urgent') {
		throw new Error(
			`Invalid SMS job data: priority must be "normal" or "urgent", got "${data.priority}"`
		);
	}

	return data as SMSJobData;
}

/**
 * Validate ChatClassificationJobData and throw if invalid
 * Ensures data integrity before chat classification job processing
 */
export function validateChatClassificationJobData(data: any): ChatClassificationJobData {
	// Check sessionId
	if (!data.sessionId || typeof data.sessionId !== 'string') {
		throw new Error(
			'Invalid chat classification job data: sessionId is required and must be string'
		);
	}

	// Validate UUID format for sessionId
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(data.sessionId)) {
		throw new Error(
			`Invalid chat classification job data: sessionId must be a valid UUID, got "${data.sessionId}"`
		);
	}

	// Check userId
	if (!data.userId || typeof data.userId !== 'string') {
		throw new Error(
			'Invalid chat classification job data: userId is required and must be string'
		);
	}

	// Validate UUID format for userId
	if (!uuidRegex.test(data.userId)) {
		throw new Error(
			`Invalid chat classification job data: userId must be a valid UUID, got "${data.userId}"`
		);
	}

	return data as ChatClassificationJobData;
}

/**
 * Validate BraindumpProcessingJobData and throw if invalid
 * Ensures data integrity before braindump processing job processing
 */
export function validateBraindumpProcessingJobData(data: any): BraindumpProcessingJobData {
	// Check braindumpId
	if (!data.braindumpId || typeof data.braindumpId !== 'string') {
		throw new Error(
			'Invalid braindump processing job data: braindumpId is required and must be string'
		);
	}

	// Validate UUID format for braindumpId
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
	if (!uuidRegex.test(data.braindumpId)) {
		throw new Error(
			`Invalid braindump processing job data: braindumpId must be a valid UUID, got "${data.braindumpId}"`
		);
	}

	// Check userId
	if (!data.userId || typeof data.userId !== 'string') {
		throw new Error(
			'Invalid braindump processing job data: userId is required and must be string'
		);
	}

	// Validate UUID format for userId
	if (!uuidRegex.test(data.userId)) {
		throw new Error(
			`Invalid braindump processing job data: userId must be a valid UUID, got "${data.userId}"`
		);
	}

	return data as BraindumpProcessingJobData;
}
