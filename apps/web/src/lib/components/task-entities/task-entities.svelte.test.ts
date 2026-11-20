// apps/web/src/lib/components/task-entities/task-entities.svelte.test.ts
// @vitest-environment jsdom
//
// The reader knows which task it is opening before that task has loaded. The entities read
// starts then, and the task's own load picks it up instead of asking again.
import { flushSync } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskEntities } from './task-entities.svelte';

const TASK = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function entity(taskId: string) {
	return {
		id: `entity-${taskId}`,
		task_id: taskId,
		kind: 'url',
		value: 'https://example.com/listing',
		label: 'Listing',
		status: 'active',
		source: 'extracted',
		confidence: 0.9
	};
}

function serve() {
	const reads = vi.fn(async (input: RequestInfo | URL) => {
		const taskId = new URL(String(input), 'http://localhost').searchParams.get('task_ids')!;
		return new Response(
			JSON.stringify({ success: true, data: { entities: [entity(taskId)] } }),
			{ status: 200, headers: { 'Content-Type': 'application/json' } }
		);
	});
	vi.stubGlobal('fetch', reads);
	return reads;
}

function mount() {
	let taskId = $state<string | null>(null);
	let entities!: TaskEntities;
	const stop = $effect.root(() => {
		entities = new TaskEntities(() => ({ taskId, title: 'A task', description: null }));
	});
	flushSync();
	return {
		entities,
		stop,
		show(id: string | null) {
			taskId = id;
			flushSync();
		}
	};
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('TaskEntities.prefetch', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reads a task once: ahead of it, then picked up when the task shows', async () => {
		const reads = serve();
		const { entities, stop, show } = mount();

		entities.prefetch(TASK);
		entities.prefetch(TASK);
		expect(reads).toHaveBeenCalledTimes(1);

		show(TASK);
		await settle();
		flushSync();
		expect(reads).toHaveBeenCalledTimes(1);
		expect(entities.entities.map((row) => row.id)).toEqual([`entity-${TASK}`]);

		// Reloading the task already shown asks for nothing.
		entities.prefetch(TASK);
		expect(reads).toHaveBeenCalledTimes(1);
		stop();
	});

	it('does not make the effect that called it run again when the task shows', async () => {
		serve();
		const { entities, stop, show } = mount();
		let runs = 0;
		const stopCaller = $effect.root(() => {
			$effect(() => {
				runs += 1;
				entities.prefetch(TASK);
			});
		});
		flushSync();

		show(TASK);
		await settle();
		flushSync();

		expect(runs).toBe(1);
		stopCaller();
		stop();
	});

	it('reads the task that actually shows when the reader moved on from the early one', async () => {
		const reads = serve();
		const { entities, stop, show } = mount();

		entities.prefetch(TASK);
		show(OTHER);
		await settle();
		flushSync();

		expect(reads).toHaveBeenCalledTimes(2);
		expect(entities.entities.map((row) => row.id)).toEqual([`entity-${OTHER}`]);
		stop();
	});
});
