// apps/web/src/lib/server/stated-future.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	buildStatedFutureTaskDescription,
	buildStatedFutureTaskTitle,
	createStatedFutureTask
} from './stated-future.service';

describe('buildStatedFutureTaskTitle', () => {
	it('keeps the user words verbatim, capitalized, without trailing punctuation', () => {
		expect(buildStatedFutureTaskTitle("i'm just waiting to hear back from them.")).toBe(
			"I'm just waiting to hear back from them"
		);
	});

	it('collapses dictation whitespace', () => {
		expect(buildStatedFutureTaskTitle('still  need to\nbook the room')).toBe(
			'Still need to book the room'
		);
	});

	it('caps at 120 chars without a dangling cut', () => {
		const title = buildStatedFutureTaskTitle(`waiting on ${'x'.repeat(300)}`);
		expect(title).not.toBeNull();
		expect(title!.length).toBeLessThanOrEqual(120);
	});

	it('returns null for whitespace or punctuation-only input', () => {
		expect(buildStatedFutureTaskTitle('   ')).toBeNull();
		expect(buildStatedFutureTaskTitle('...')).toBeNull();
	});
});

describe('buildStatedFutureTaskDescription', () => {
	it('quotes the clause and explains why the task exists', () => {
		const description = buildStatedFutureTaskDescription({
			clause: 'waiting to hear back',
			userMessage: 'that call is done. waiting to hear back'
		});
		expect(description).toContain('"waiting to hear back"');
		expect(description).toContain('BuildOS saved it');
		expect(description).toContain('Full message:');
	});

	it('omits the full message line when it adds nothing over the clause', () => {
		const description = buildStatedFutureTaskDescription({
			clause: 'waiting to hear back',
			userMessage: 'waiting to hear back'
		});
		expect(description).not.toContain('Full message:');
	});
});

describe('createStatedFutureTask legacy parity fixture', () => {
	it('uses the stream-scoped idempotency key and verbatim extracted clause', async () => {
		const rpc = vi
			.fn()
			.mockResolvedValueOnce({ data: 'actor-1', error: null })
			.mockResolvedValueOnce({
				data: { task: { id: 'task-1' }, idempotent_replay: false },
				error: null
			});

		await expect(
			createStatedFutureTask({ rpc } as never, {
				projectId: 'project-1',
				userId: 'user-1',
				streamRunId: 'stream-future-1',
				clause: "i'm just waiting to hear back from them.",
				userMessage:
					"The kickoff call is complete. now i'm just waiting to hear back from them."
			})
		).resolves.toEqual({
			status: 'created',
			taskId: 'task-1',
			title: "I'm just waiting to hear back from them"
		});

		expect(rpc).toHaveBeenNthCalledWith(1, 'ensure_actor_for_user', {
			p_user_id: 'user-1'
		});
		expect(rpc).toHaveBeenNthCalledWith(
			2,
			'onto_task_create_atomic',
			expect.objectContaining({
				p_idempotency_key: 'stated_future_capture:stream-future-1',
				p_source: 'agent',
				p_task: expect.objectContaining({
					project_id: 'project-1',
					title: "I'm just waiting to hear back from them",
					created_by: 'actor-1',
					props: {
						source: 'stated_future_capture',
						source_stream_run_id: 'stream-future-1'
					}
				})
			})
		);
	});

	it('reports an idempotent replay as a duplicate', async () => {
		const rpc = vi
			.fn()
			.mockResolvedValueOnce({ data: 'actor-1', error: null })
			.mockResolvedValueOnce({
				data: { task: { id: 'task-existing' }, idempotent_replay: true },
				error: null
			});

		await expect(
			createStatedFutureTask({ rpc } as never, {
				projectId: 'project-1',
				userId: 'user-1',
				streamRunId: 'stream-future-1',
				clause: 'waiting on legal',
				userMessage: 'waiting on legal'
			})
		).resolves.toEqual({ status: 'duplicate', taskId: 'task-existing' });
	});
});
