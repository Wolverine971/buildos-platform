import { describe, it, expect, vi } from 'vitest';
import { createLibriTaskDispatcher } from '../src/workers/libri/taskDispatcher';
const library = '00000000-0000-4000-8000-000000000001',
	batch = '00000000-0000-4000-8000-000000000002',
	step = '00000000-0000-4000-8000-000000000003',
	queue = '00000000-0000-4000-8000-000000000004';
const manifest = { batch_id: batch, library_id: library, step_ids: [step] };
function setup(
	options: { states?: string[]; accepted?: boolean; rows?: unknown[]; lost?: boolean } = {}
) {
	const states = [...(options.states ?? ['pending'])];
	const query = vi.fn(async (text: string) => {
		const rows = text.includes('reconcile_pending_research_tasks')
			? []
			: text.includes('pending_research_task_batches')
				? (options.rows ?? [manifest])
				: text.includes('acknowledge_research_task_dispatch')
					? [{ accepted: options.accepted ?? true }]
					: states.length
						? [{ status: states.shift() }]
						: [];
		return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
	});
	const enqueueStep = vi.fn(async () => {
		if (options.lost) throw new Error('Lost database reply');
		return {
			stepId: step,
			runId: batch,
			queueType: 'libri_research' as const,
			queueRowId: queue,
			queueJobId: `libri_research_${queue}`,
			created: true
		};
	});
	return {
		query,
		enqueueStep,
		dispatcher: createLibriTaskDispatcher({ query: query as any }, { enqueueStep })
	};
}
describe('Libri research task outbox dispatcher', () => {
	it('uses the existing durable lifecycle then independently acknowledges queue evidence', async () => {
		const f = setup();
		expect(await f.dispatcher.dispatchPending(new AbortController().signal)).toEqual({
			batches: 1,
			steps: 1
		});
		expect(f.enqueueStep).toHaveBeenCalledExactlyOnceWith({ stepId: step });
		expect(f.query).toHaveBeenLastCalledWith(
			'SELECT libri.acknowledge_research_task_dispatch($1) AS accepted',
			[batch]
		);
	});
	it('does not resubmit already consumed steps when reconciling a partial prior dispatch', async () => {
		const f = setup({ states: ['completed'] });
		await f.dispatcher.dispatchPending(new AbortController().signal);
		expect(f.enqueueStep).not.toHaveBeenCalled();
	});
	it('reconciles a lost enqueue reply only through persisted state and a real acknowledgement', async () => {
		const f = setup({ lost: true, states: ['pending', 'leased'] });
		await f.dispatcher.dispatchPending(new AbortController().signal);
		expect(f.enqueueStep).toHaveBeenCalledTimes(1);
		const unknown = setup({ lost: true, states: ['pending', 'pending'] });
		await expect(
			unknown.dispatcher.dispatchPending(new AbortController().signal)
		).rejects.toThrow('Lost database reply');
		expect(unknown.enqueueStep).toHaveBeenCalledTimes(1);
		expect(unknown.query.mock.calls.some(([q]) => q.includes('acknowledge'))).toBe(false);
	});
	it('refuses missing steps, malformed manifests and unproven acknowledgements', async () => {
		for (const rows of [
			[{ ...manifest, step_ids: [step, step] }],
			[{ ...manifest, library_id: 'invalid' }],
			[manifest, manifest]
		]) {
			const f = setup({ rows });
			await expect(
				f.dispatcher.dispatchPending(new AbortController().signal)
			).rejects.toThrow('Invalid task dispatch manifest');
			expect(f.enqueueStep).not.toHaveBeenCalled();
		}
		await expect(
			setup({ states: [] }).dispatcher.dispatchPending(new AbortController().signal)
		).rejects.toThrow('missing or outside');
		await expect(
			setup({ accepted: false }).dispatcher.dispatchPending(new AbortController().signal)
		).rejects.toThrow('could not be confirmed');
	});
	it('does nothing when eligibility is revoked and stops before writes on shutdown', async () => {
		const f = setup({ rows: [] });
		expect(await f.dispatcher.dispatchPending(new AbortController().signal)).toEqual({
			batches: 0,
			steps: 0
		});
		expect(f.enqueueStep).not.toHaveBeenCalled();
		const stopped = setup(),
			controller = new AbortController();
		controller.abort();
		await expect(stopped.dispatcher.dispatchPending(controller.signal)).rejects.toThrow();
		expect(stopped.query).not.toHaveBeenCalled();
	});
});
