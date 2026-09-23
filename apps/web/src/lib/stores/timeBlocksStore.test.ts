// apps/web/src/lib/stores/timeBlocksStore.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true }));

import { timeBlocksStore } from './timeBlocksStore';

function block(id: string) {
	return {
		id,
		start_time: '2026-09-21T14:00:00.000Z',
		end_time: '2026-09-21T15:00:00.000Z'
	};
}

function deferredJson() {
	let resolve!: (body: unknown) => void;
	const response = new Promise<Response>((done) => {
		resolve = (body) => done(new Response(JSON.stringify(body)));
	});
	return { response, resolve };
}

describe('timeBlocksStore range loads', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('keeps the newest range when an older request resolves last', async () => {
		const pending = new Map<string, ReturnType<typeof deferredJson>>();
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string) => {
				const key = new URL(url, 'http://localhost').searchParams.get('start_date') ?? url;
				const entry = deferredJson();
				pending.set(key, entry);
				return entry.response;
			})
		);

		const weekOne = new Date('2026-09-14T04:00:00.000Z');
		const weekTwo = new Date('2026-09-21T04:00:00.000Z');
		const first = timeBlocksStore.loadBlocksOnly(weekOne, new Date('2026-09-21T03:59:59.999Z'));
		const second = timeBlocksStore.loadBlocksOnly(
			weekTwo,
			new Date('2026-09-28T03:59:59.999Z')
		);

		pending
			.get(weekTwo.toISOString())!
			.resolve({ success: true, data: { blocks: [block('week-two')] } });
		await second;
		pending
			.get(weekOne.toISOString())!
			.resolve({ success: true, data: { blocks: [block('week-one')] } });
		await first;

		expect(get(timeBlocksStore).blocks.map((entry) => entry.id)).toEqual(['week-two']);
	});
});
