// apps/worker/tests/chatCheckpointJobFailure.test.ts
//
// A failed checkpoint capture records why. The capture ports throw Supabase errors as
// plain objects, which used to be stored as "[object Object]".
//
// The failed row is written only when the queue has given up on the job. It stops the
// sweep from queueing the session again, so writing it on an attempt the queue retries
// left a failed row behind captures that then succeeded.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSupabaseFrom = vi.hoisted(() => vi.fn());
const mockRunCapture = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: mockSupabaseFrom,
		rpc: vi.fn()
	}
}));

vi.mock('../src/workers/chat/checkpoint/checkpointCapture', () => ({
	runChatCheckpointCapture: mockRunCapture
}));

vi.mock('../src/workers/chat/checkpoint/supabaseCheckpointPorts', () => ({
	createSupabaseCheckpointPorts: vi.fn(() => ({}))
}));

import { PermanentQueueError } from '../src/lib/queueErrors';
import { processCaptureChatCheckpointJob } from '../src/workers/chat/checkpoint/checkpointJob';

/** `attempts` is how many attempts ran before this one; with no budget this is the last. */
function captureJob(lastMessageId?: string, budget?: { attempts: number; maxAttempts: number }) {
	return {
		id: 'job-1',
		data: {
			sessionId: 'session-1',
			userId: 'user-1',
			trigger: 'idle',
			...(lastMessageId ? { lastMessageId } : {})
		},
		...(budget ?? {}),
		signal: new AbortController().signal,
		log: vi.fn().mockResolvedValue(undefined)
	} as never;
}

describe('processCaptureChatCheckpointJob failure record', () => {
	let insert: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('CHAT_CHECKPOINT_CAPTURE_ENABLED', 'true');
		insert = vi.fn().mockResolvedValue({ error: null });
		mockSupabaseFrom.mockReturnValue({ insert });
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('stores the database message and code from a plain-object Supabase error', async () => {
		const databaseError = {
			message:
				'insert or update on table "chat_capture_checkpoints" violates foreign key constraint "chat_capture_checkpoints_project_id_fkey"',
			code: '23503',
			details: 'Key (project_id) is not present in table "onto_projects".',
			hint: null
		};
		mockRunCapture.mockRejectedValueOnce(databaseError);

		// The original error still reaches the queue, which decides whether to retry.
		await expect(processCaptureChatCheckpointJob(captureJob('message-9'))).rejects.toBe(
			databaseError
		);

		expect(mockSupabaseFrom).toHaveBeenCalledWith('chat_capture_checkpoints');
		expect(insert).toHaveBeenCalledTimes(1);
		const row = insert.mock.calls[0]![0] as {
			session_id: string;
			status: string;
			through_message_id: string;
			details: { error: string };
		};
		expect(row).toMatchObject({
			session_id: 'session-1',
			user_id: 'user-1',
			trigger: 'idle',
			status: 'failed',
			through_message_id: 'message-9'
		});
		expect(row.details.error).toContain('chat_capture_checkpoints_project_id_fkey');
		expect(row.details.error).toContain('23503');
		expect(row.details.error).not.toContain('[object Object]');
	});

	it('still stores the message of an ordinary Error', async () => {
		mockRunCapture.mockRejectedValueOnce(new Error('model reply was not JSON'));

		await expect(processCaptureChatCheckpointJob(captureJob('message-9'))).rejects.toThrow(
			'model reply was not JSON'
		);

		const row = insert.mock.calls[0]![0] as { details: { error: string } };
		expect(row.details.error).toBe('model reply was not JSON');
	});

	it.each([
		{ attempts: 0, maxAttempts: 3 },
		{ attempts: 1, maxAttempts: 3 }
	])('records nothing while the queue will retry (attempt %j)', async (budget) => {
		const conflict = new Error('Document doc-1 changed during checkpoint capture');
		mockRunCapture.mockRejectedValueOnce(conflict);

		// The error still reaches the queue, which schedules the retry.
		await expect(processCaptureChatCheckpointJob(captureJob('message-9', budget))).rejects.toBe(
			conflict
		);

		expect(insert).not.toHaveBeenCalled();
		expect(mockSupabaseFrom).not.toHaveBeenCalled();
	});

	it('records the failure on the last attempt', async () => {
		mockRunCapture.mockRejectedValueOnce(new Error('model reply was not JSON'));

		await expect(
			processCaptureChatCheckpointJob(
				captureJob('message-9', { attempts: 2, maxAttempts: 3 })
			)
		).rejects.toThrow('model reply was not JSON');

		expect(insert).toHaveBeenCalledTimes(1);
		expect(insert.mock.calls[0]![0]).toMatchObject({
			status: 'failed',
			through_message_id: 'message-9'
		});
	});

	it('records at once a failure the queue will not retry, whatever attempts are left', async () => {
		mockRunCapture.mockRejectedValueOnce(
			new PermanentQueueError('bad_metadata', 'Checkpoint job metadata is malformed')
		);

		await expect(
			processCaptureChatCheckpointJob(
				captureJob('message-9', { attempts: 0, maxAttempts: 3 })
			)
		).rejects.toBeInstanceOf(PermanentQueueError);

		expect(insert).toHaveBeenCalledTimes(1);
	});

	it('leaves no failed row behind a capture that succeeds on its retry', async () => {
		mockRunCapture
			.mockRejectedValueOnce(new Error('Document doc-1 changed during checkpoint capture'))
			.mockResolvedValueOnce({ status: 'skipped', reason: 'nothing_new' });

		await expect(
			processCaptureChatCheckpointJob(
				captureJob('message-9', { attempts: 0, maxAttempts: 3 })
			)
		).rejects.toThrow('changed during checkpoint capture');
		const retried = await processCaptureChatCheckpointJob(
			captureJob('message-9', { attempts: 1, maxAttempts: 3 })
		);

		expect(retried).toMatchObject({ success: true, status: 'skipped' });
		expect(insert).not.toHaveBeenCalled();
	});
});
