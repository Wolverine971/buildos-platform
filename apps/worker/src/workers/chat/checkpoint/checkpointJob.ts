// apps/worker/src/workers/chat/checkpoint/checkpointJob.ts
//
// Queue job 'capture_chat_checkpoint' and the sweep that enqueues it (tasker/95).
// Chat turns never wait on capture: the scheduler sweeps recently active project
// sessions every minute and enqueues a capture once a session's uncaptured part
// crosses a size or turn threshold (after the assistant has replied) or the
// session has been idle. Closing a chat enqueues the same job.
//
// One capture per session is active at a time: the dedup key is the session,
// and add_queue_job dedups pending/processing jobs. A capture that fails is
// recorded against the session's newest message, and the sweep leaves that
// session alone until a new message arrives, so a broken session cannot spend
// on the model every minute.
import type { CaptureChatCheckpointJobMetadata } from '@buildos/shared-types';
import { supabase } from '../../../lib/supabase';
import type { ProcessingJob } from '../../../lib/supabaseQueue';
import { type CheckpointTrigger, runChatCheckpointCapture } from './checkpointCapture';
import { createSupabaseCheckpointPorts } from './supabaseCheckpointPorts';

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

/** Scheduler entry: enqueue a capture for every recently active project session that is due. */
export async function sweepChatCheckpoints(now = new Date()): Promise<{
	scanned: number;
	enqueued: number;
}> {
	if (!chatCaptureEnabled()) return { scanned: 0, enqueued: 0 };
	const { data: sessions, error } = await supabase
		.from('chat_sessions')
		.select('id, user_id, last_message_at, capture_watermark_at')
		.eq('context_type', 'project')
		.not('entity_id', 'is', null)
		.gte('last_message_at', new Date(now.getTime() - SWEEP_LOOKBACK_MS).toISOString())
		.order('last_message_at', { ascending: false })
		.limit(SWEEP_SESSION_LIMIT);
	if (error) throw error;
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

export async function processCaptureChatCheckpointJob(
	job: ProcessingJob<CaptureChatCheckpointJobMetadata>
) {
	const { sessionId, userId, trigger, lastMessageId } = job.data;
	try {
		const outcome = await runChatCheckpointCapture(createSupabaseCheckpointPorts(), {
			sessionId,
			userId,
			trigger
		});
		if (outcome.status === 'skipped') {
			await job.log(`Checkpoint skipped: ${outcome.reason}`);
			return { success: true, status: outcome.status, reason: outcome.reason };
		}
		const record = outcome.record;
		await job.log(
			`Checkpoint ${outcome.status}: log ${record.thinkingLog?.passageCount ?? 0} passage(s), applied [${record.startHere?.appliedSections.join(', ') ?? ''}], review [${record.review?.sections.join(', ') ?? ''}]`
		);
		return {
			success: true,
			status: outcome.status,
			appliedSections: record.startHere?.appliedSections ?? [],
			reviewRunId: record.review?.runId ?? null
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
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
