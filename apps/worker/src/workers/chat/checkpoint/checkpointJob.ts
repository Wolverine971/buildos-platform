// apps/worker/src/workers/chat/checkpoint/checkpointJob.ts
//
// Queue job 'capture_chat_checkpoint' and the sweep that enqueues it (tasker/95).
// Chat turns never wait on capture: the scheduler sweeps recently active project
// sessions every minute and enqueues a capture once a session's uncaptured part
// crosses a size or turn threshold (after the assistant has replied) or the
// session has been idle. The sweep is the only producer: closing a chat used to
// enqueue the same job from the classifier, and most of those found nothing new.
//
// One capture per session is active at a time: the dedup key is the session,
// and add_queue_job dedups pending/processing jobs. A capture that fails for
// good (no attempts left) is recorded against the session's newest message, and
// the sweep leaves that session alone until a new message arrives, so a broken
// session cannot spend on the model every minute. An attempt the queue will
// retry records nothing: the retry may succeed.
import { globalCaptureUserIds } from './globalAttribution';
import type { CaptureChatCheckpointJobMetadata } from '@buildos/shared-types';
import { classifyQueueError, describeQueueError } from '../../../lib/queueErrors';
import { supabase } from '../../../lib/supabase';
import type { ProcessingJob } from '../../../lib/supabaseQueue';
import { type CheckpointTrigger, runChatCheckpointCapture } from './checkpointCapture';
import { createSupabaseCheckpointPorts } from './supabaseCheckpointPorts';
import { chatKnowledgeCaptureEnabled } from './knowledgeCapture';

export const CAPTURE_CHAT_CHECKPOINT_JOB = 'capture_chat_checkpoint' as const;
export const CHECKPOINT_USER_CHARS = 1500;
export const CHECKPOINT_USER_TURNS = 4;
export const CHECKPOINT_IDLE_MS = 10 * 60 * 1000;
const SWEEP_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const SWEEP_SESSION_LIMIT = 200;
const SWEEP_MESSAGE_LIMIT = 60;

export function chatCaptureEnabled(): boolean {
	return process.env.CHAT_CHECKPOINT_CAPTURE_ENABLED !== 'false';
}

export function captureCheckpointDedupKey(sessionId: string): string {
	return `chat-checkpoint:${sessionId}`;
}

export async function enqueueChatCheckpoint(params: {
	sessionId: string;
	userId: string;
	trigger: CheckpointTrigger;
	lastMessageId?: string | null;
	priority?: number;
}): Promise<string | null> {
	if (!chatCaptureEnabled()) return null;
	const metadata: CaptureChatCheckpointJobMetadata = {
		sessionId: params.sessionId,
		userId: params.userId,
		trigger: params.trigger,
		...(params.lastMessageId ? { lastMessageId: params.lastMessageId } : {})
	};
	const { data, error } = await supabase.rpc('add_queue_job', {
		p_user_id: params.userId,
		p_job_type: CAPTURE_CHAT_CHECKPOINT_JOB,
		p_metadata: metadata as never,
		p_priority: params.priority ?? 8,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: captureCheckpointDedupKey(params.sessionId)
	});
	if (error) throw error;
	return typeof data === 'string' ? data : null;
}

export type CheckpointDecision = { due: false } | { due: true; trigger: CheckpointTrigger };

/**
 * Whether a session's uncaptured messages are due for capture. Character and
 * turn counts measure how much the user wrote; they say nothing about meaning.
 */
export function decideCheckpoint(params: {
	now: Date;
	lastMessageAt: string;
	messages: Array<{ role: string; content: string }>;
}): CheckpointDecision {
	const userMessages = params.messages.filter(
		(message) => message.role === 'user' && message.content.trim()
	);
	if (userMessages.length === 0) return { due: false };
	const idleMs = params.now.getTime() - new Date(params.lastMessageAt).getTime();
	if (idleMs >= CHECKPOINT_IDLE_MS) return { due: true, trigger: 'idle' };
	const replied = params.messages[params.messages.length - 1]?.role === 'assistant';
	const userChars = userMessages.reduce((sum, message) => sum + message.content.trim().length, 0);
	if (
		replied &&
		(userChars >= CHECKPOINT_USER_CHARS || userMessages.length >= CHECKPOINT_USER_TURNS)
	) {
		return { due: true, trigger: 'threshold' };
	}
	return { due: false };
}

/**
 * Scheduler entry: enqueue a capture for every recently active project session that is due,
 * and every global session. A global session feeds a project only for allowlisted users
 * (globalAttribution.ts); knowledge is user-level, so with the knowledge output on, every
 * user's global chats are swept for it (tasker 164).
 */
export async function sweepChatCheckpoints(now = new Date()): Promise<{
	scanned: number;
	enqueued: number;
}> {
	if (!chatCaptureEnabled()) return { scanned: 0, enqueued: 0 };
	const since = new Date(now.getTime() - SWEEP_LOOKBACK_MS).toISOString();
	// Global chats of allowlisted users feed projects too; capture attributes each batch to one
	// project from the turns' Jev receipts, or skips it (globalAttribution.ts).
	const globalUsers = globalCaptureUserIds();
	const knowledgeOn = chatKnowledgeCaptureEnabled();
	let globalQuery = supabase
		.from('chat_sessions')
		.select('id, user_id, last_message_at, capture_watermark_at')
		.eq('context_type', 'global')
		.gte('last_message_at', since)
		.order('last_message_at', { ascending: false })
		.limit(SWEEP_SESSION_LIMIT);
	if (!knowledgeOn) globalQuery = globalQuery.in('user_id', globalUsers);
	const [projectSessions, globalSessions] = await Promise.all([
		supabase
			.from('chat_sessions')
			.select('id, user_id, last_message_at, capture_watermark_at')
			.eq('context_type', 'project')
			.not('entity_id', 'is', null)
			.gte('last_message_at', since)
			.order('last_message_at', { ascending: false })
			.limit(SWEEP_SESSION_LIMIT),
		knowledgeOn || globalUsers.length ? globalQuery : Promise.resolve({ data: [], error: null })
	]);
	if (projectSessions.error) throw projectSessions.error;
	if (globalSessions.error) throw globalSessions.error;
	const sessions = [...(projectSessions.data ?? []), ...(globalSessions.data ?? [])];
	const candidates = (sessions ?? []).filter(
		(session) =>
			session.last_message_at &&
			(!session.capture_watermark_at ||
				session.last_message_at > session.capture_watermark_at)
	);
	if (candidates.length === 0) return { scanned: 0, enqueued: 0 };

	const { data: failures, error: failureError } = await supabase
		.from('chat_capture_checkpoints')
		.select('session_id, through_message_id')
		.in(
			'session_id',
			candidates.map((session) => session.id)
		)
		.eq('status', 'failed');
	if (failureError) throw failureError;
	const failedThrough = new Set(
		(failures ?? []).map((row) => `${row.session_id}:${row.through_message_id}`)
	);

	let enqueued = 0;
	for (const session of candidates) {
		let query = supabase
			.from('chat_messages')
			.select('id, role, content, created_at')
			.eq('session_id', session.id)
			.in('role', ['user', 'assistant'])
			.order('created_at', { ascending: true })
			.limit(SWEEP_MESSAGE_LIMIT);
		if (session.capture_watermark_at)
			query = query.gt('created_at', session.capture_watermark_at);
		const { data: messages, error: messageError } = await query;
		if (messageError) {
			console.warn(
				`⚠️ Checkpoint sweep skipped session ${session.id}:`,
				messageError.message
			);
			continue;
		}
		const rows = (messages ?? []).map((message) => ({
			id: message.id as string,
			role: String(message.role),
			content: typeof message.content === 'string' ? message.content : ''
		}));
		const last = rows[rows.length - 1];
		if (!last || failedThrough.has(`${session.id}:${last.id}`)) continue;
		const decision = decideCheckpoint({
			now,
			lastMessageAt: session.last_message_at!,
			messages: rows
		});
		if (!decision.due) continue;
		try {
			await enqueueChatCheckpoint({
				sessionId: session.id,
				userId: session.user_id,
				trigger: decision.trigger,
				lastMessageId: last.id
			});
			enqueued += 1;
		} catch (enqueueError) {
			console.warn(
				`⚠️ Checkpoint enqueue failed for session ${session.id}:`,
				enqueueError instanceof Error ? enqueueError.message : enqueueError
			);
		}
	}
	return { scanned: candidates.length, enqueued };
}

/**
 * Whether the queue will run this job again after `error` (the queue's own rule: a
 * transient failure with attempts left). With no known attempt budget this is the last
 * attempt.
 */
function willBeRetried(
	job: Pick<ProcessingJob<unknown>, 'attempts' | 'maxAttempts'>,
	error: unknown
): boolean {
	if (classifyQueueError(error).kind !== 'transient') return false;
	if (typeof job.maxAttempts !== 'number' || typeof job.attempts !== 'number') return false;
	return job.attempts + 1 < job.maxAttempts;
}

export async function processCaptureChatCheckpointJob(
	job: ProcessingJob<CaptureChatCheckpointJobMetadata>
) {
	const { sessionId, userId, trigger, lastMessageId } = job.data;
	// The kill switch also covers jobs already queued.
	if (!chatCaptureEnabled()) {
		await job.log('Checkpoint capture disabled (CHAT_CHECKPOINT_CAPTURE_ENABLED=false)');
		return { success: true, status: 'disabled' };
	}
	try {
		const outcome = await runChatCheckpointCapture(
			createSupabaseCheckpointPorts({ signal: job.signal }),
			{ sessionId, userId, trigger }
		);
		if (outcome.status === 'skipped') {
			await job.log(`Checkpoint skipped: ${outcome.reason}`);
			return { success: true, status: outcome.status, reason: outcome.reason };
		}
		const record = outcome.record;
		const knowledge = record.knowledge;
		await job.log(
			`Checkpoint ${outcome.status}: log ${record.thinkingLog?.passageCount ?? 0} passage(s), applied [${record.startHere?.appliedSections.join(', ') ?? ''}], review [${record.review?.sections.join(', ') ?? ''}], knowledge ${knowledge ? `${knowledge.status} (${knowledge.fact_ids.length} fact(s), ${knowledge.entities.length} entr${knowledge.entities.length === 1 ? 'y' : 'ies'}${knowledge.gate.ran ? `, gate p=${knowledge.gate.p_some ?? knowledge.gate.error}` : ''}${knowledge.error ? `, error: ${knowledge.error}` : ''})` : 'off'}`
		);
		return {
			success: true,
			status: outcome.status,
			appliedSections: record.startHere?.appliedSections ?? [],
			reviewRunId: record.review?.runId ?? null,
			knowledgeFacts: record.knowledge?.fact_ids.length ?? 0
		};
	} catch (error) {
		// A failed row stops the sweep from queueing this session again, so it is written
		// only when the queue has given up. Recording every attempt left a failed row
		// behind captures whose retry then succeeded.
		if (willBeRetried(job, error)) throw error;
		// The ports throw Supabase errors as plain objects; String() made them "[object Object]".
		const message = describeQueueError(error);
		if (lastMessageId) {
			const { error: recordError } = await supabase.from('chat_capture_checkpoints').insert({
				session_id: sessionId,
				user_id: userId,
				trigger,
				status: 'failed',
				through_message_id: lastMessageId,
				details: { error: message.slice(0, 500) }
			});
			if (recordError) {
				console.warn(
					`⚠️ Could not record failed checkpoint for ${sessionId}:`,
					recordError.message
				);
			}
		}
		throw error;
	}
}
