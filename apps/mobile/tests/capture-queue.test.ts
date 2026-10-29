// apps/mobile/tests/capture-queue.test.ts
import { BuildOsApiError, type CaptureSortResult } from '@buildos/api-client';
import { describe, expect, it, type Mock, vi } from 'vitest';
import {
	type CaptureAudio,
	CaptureRejectedError,
	classifyCaptureError,
	createCaptureQueue,
	makeCaptureId,
	MAX_SERVER_FAILURES,
	MAX_SORTED,
	parsePersisted,
	shouldRefreshToday,
	stageOf
} from '@/lib/capture-queue';

const KEY = 'buildos.capture-queue.user-1';

function memoryStore() {
	const map = new Map<string, string>();
	return {
		map,
		getItem: vi.fn(async (key: string) => map.get(key) ?? null),
		setItem: vi.fn(async (key: string, value: string) => {
			map.set(key, value);
		}),
		removeItem: vi.fn(async (key: string) => {
			map.delete(key);
		})
	};
}

const savedAs = (id: string, kind: 'note' | 'task' = 'note') => ({
	workspaceId: 'w1',
	item: {
		id,
		entity: kind === 'task' ? ('task' as const) : ('document' as const),
		kind,
		title: 't',
		excerpt: null,
		created_at: 'x',
		updated_at: 'x'
	}
});

const sortedAs = (lines: string[], outcome: CaptureSortResult['outcome'] = 'sorted') =>
	({
		outcome,
		lines,
		added: [],
		removed_ids: [],
		receipt: lines.length ? { document_id: 'd' } : null
	}) satisfies CaptureSortResult;

const offline = () =>
	new BuildOsApiError({ message: 'Network request failed', status: 0, isNetworkError: true });
const status = (code: number, message: string, apiCode?: string) =>
	new BuildOsApiError({ message, status: code, code: apiCode });

const recording = (name = 'a'): CaptureAudio => ({
	path: `ExpoAudio/${name}.m4a`,
	duration_ms: 42_000,
	mime_type: 'audio/mp4'
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMock = Mock<(...args: any[]) => any>;

function makeQueue(
	overrides: {
		store?: ReturnType<typeof memoryStore>;
		save?: AnyMock;
		sort?: AnyMock;
		transcribe?: AnyMock;
	} = {}
) {
	const store = overrides.store ?? memoryStore();
	const save: AnyMock = overrides.save ?? vi.fn(async () => savedAs('d1'));
	const sort: AnyMock = overrides.sort ?? vi.fn(async () => sortedAs([]));
	const transcribe: AnyMock = overrides.transcribe ?? vi.fn(async () => 'Call the printer');
	const discardAudio = vi.fn();
	let tick = 0;
	const queue = createCaptureQueue({
		store,
		key: KEY,
		save,
		sort,
		transcribe,
		discardAudio,
		source: 'ios',
		now: () => new Date(Date.UTC(2026, 9, 29, 12, 0, tick++)),
		makeId: () => `cap_test_${String(tick).padStart(4, '0')}`
	});
	return { queue, store, save, sort, transcribe, discardAudio };
}

describe('refreshing Today after a drain', () => {
	it('accepts an empty or earlier drain result without crashing the background callback', () => {
		expect(shouldRefreshToday(undefined)).toBe(false);
		expect(shouldRefreshToday(null)).toBe(false);
		expect(shouldRefreshToday({})).toBe(false);
		expect(shouldRefreshToday({ sorted: [] })).toBe(false);
	});

	it('does not refresh Today after saving an unsorted note', async () => {
		const { queue } = makeQueue();
		await queue.enqueueText('A note');
		expect(shouldRefreshToday(await queue.drain())).toBe(false);
	});

	it('refreshes Today after sorting a capture, even without the saved field', async () => {
		const { queue } = makeQueue({ sort: vi.fn(async () => sortedAs(['Task added'])) });
		await queue.enqueueText('Book the venue');
		const result = await queue.drain();
		expect(shouldRefreshToday(result)).toBe(true);
		expect(shouldRefreshToday({ sorted: result.sorted })).toBe(true);
	});

	it('refreshes Today for a legacy task without a sorted field', async () => {
		const store = memoryStore();
		store.map.set(
			KEY,
			JSON.stringify({
				v: 1,
				items: [{ id: 'cap_old_task_0001', kind: 'task', text: 'Old task' }]
			})
		);
		const { queue } = makeQueue({ store, save: vi.fn(async () => savedAs('t1', 'task')) });
		const result = await queue.drain();
		expect(shouldRefreshToday({ saved: result.saved })).toBe(true);
	});
});

describe('makeCaptureId', () => {
	it('fits the server idempotency key rules (8–120 chars) and differs per call', () => {
		const a = makeCaptureId();
		const b = makeCaptureId();
		expect(a).toMatch(/^cap_[a-z0-9]+_[a-z0-9]+$/);
		expect(a.length).toBeGreaterThanOrEqual(8);
		expect(a.length).toBeLessThanOrEqual(120);
		expect(a).not.toBe(b);
	});
});

describe('classifyCaptureError', () => {
	it('separates offline, signed out, server trouble and outright rejection', () => {
		expect(classifyCaptureError(offline())).toBe('offline');
		expect(classifyCaptureError(status(401, 'Unauthorized'))).toBe('unauthorized');
		expect(classifyCaptureError(status(503, 'Down'))).toBe('server');
		expect(classifyCaptureError(status(429, 'Slow down'))).toBe('server');
		expect(classifyCaptureError(status(400, 'Too long'))).toBe('rejected');
		expect(classifyCaptureError(status(402, 'Upgrade', 'UPGRADE_REQUIRED'))).toBe('rejected');
		expect(classifyCaptureError(new Error('boom'))).toBe('server');
	});
});

describe('stageOf', () => {
	it('walks transcribe → save → sort', () => {
		expect(stageOf({ kind: 'voice', text: '', document_id: null })).toBe('transcribe');
		expect(stageOf({ kind: 'voice', text: 'words', document_id: null })).toBe('save');
		expect(stageOf({ kind: 'note', text: 'words', document_id: null })).toBe('save');
		expect(stageOf({ kind: 'note', text: 'words', document_id: 'd1' })).toBe('sort');
	});
});

describe('typed captures', () => {
	it('persists before sending and hydrates after a restart', async () => {
		const { queue, store } = makeQueue();
		const item = await queue.enqueueText('  Call the printer  ');

		expect(item).toMatchObject({ kind: 'note', text: 'Call the printer', state: 'pending' });
		expect(store.map.has(KEY)).toBe(true);

		const restarted = createCaptureQueue({
			store,
			key: KEY,
			save: vi.fn(),
			sort: vi.fn(),
			transcribe: vi.fn()
		});
		await restarted.load();
		expect(restarted.list().map((entry) => entry.id)).toEqual([item.id]);
	});

	it('saves as a note with the item id as the key, then sorts it like the web capture box', async () => {
		const sort = vi.fn(async () => sortedAs(['2 tasks → Fading Crown']));
		const { queue, store, save } = makeQueue({ sort });
		const item = await queue.enqueueText('Draft chapter 3 and email the editor');

		const result = await queue.drain();

		expect(save).toHaveBeenCalledWith({
			kind: 'note',
			text: 'Draft chapter 3 and email the editor',
			source: 'ios',
			idempotency_key: item.id
		});
		expect(sort).toHaveBeenCalledWith({ document_id: 'd1', source: 'ios' });
		expect(result.saved).toHaveLength(1);
		expect(result.sorted).toEqual([
			expect.objectContaining({ id: item.id, lines: ['2 tasks → Fading Crown'] })
		]);
		expect(queue.snapshot().sorted[0]?.receipt).toEqual({ document_id: 'd' });
		expect(queue.list()).toHaveLength(0);
		expect(store.map.has(KEY)).toBe(false);
	});

	it('keeps a sort with nothing to say out of the Undo line', async () => {
		const { queue } = makeQueue({ sort: vi.fn(async () => sortedAs([], 'kept')) });
		await queue.enqueueText('just a thought');
		const result = await queue.drain();
		expect(result.sorted).toEqual([]);
		expect(queue.snapshot().sorted).toEqual([]);
	});

	it('stops at the first offline error and reuses the same key later', async () => {
		const save = vi.fn().mockRejectedValueOnce(offline()).mockResolvedValue(savedAs('d1'));
		const { queue } = makeQueue({ save });
		const first = await queue.enqueueText('one');
		const second = await queue.enqueueText('two');

		const stopped = await queue.drain();
		expect(stopped.stopped).toBe('offline');
		expect(stopped.remaining).toBe(2);
		expect(save).toHaveBeenCalledTimes(1);
		expect(queue.list()[0]).toMatchObject({
			id: first.id,
			attempts: 1,
			last_error: 'No connection'
		});

		const recovered = await queue.drain();
		expect(recovered.stopped).toBeNull();
		expect(recovered.saved.map((entry) => entry.capture.id)).toEqual([first.id, second.id]);
		// The retry reuses the first capture's key, so the server cannot save it twice.
		expect(save.mock.calls[1]?.[0]).toMatchObject({ idempotency_key: first.id });
		expect(queue.list()).toHaveLength(0);
	});

	it('marks a rejected capture failed with the server message and carries on to the next', async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(status(400, 'Text is too long', 'INVALID_REQUEST'))
			.mockResolvedValueOnce(savedAs('d2'));
		const { queue } = makeQueue({ save });
		const bad = await queue.enqueueText('x'.repeat(10));
		const good = await queue.enqueueText('fine');

		const result = await queue.drain();

		expect(result.failed.map((item) => item.id)).toEqual([bad.id]);
		expect(result.saved.map((entry) => entry.capture.id)).toEqual([good.id]);
		expect(queue.list()).toEqual([
			expect.objectContaining({ id: bad.id, state: 'failed', last_error: 'Text is too long' })
		]);
	});

	it('waits on server trouble, but a capture that keeps failing stops blocking the rest', async () => {
		const save = vi.fn(async ({ text }: { text: string }) => {
			if (text === 'poison') throw status(500, 'Internal error');
			return savedAs('d-ok');
		});
		const { queue } = makeQueue({ save });
		const poison = await queue.enqueueText('poison');
		const good = await queue.enqueueText('fine');

		for (let round = 1; round < MAX_SERVER_FAILURES; round += 1) {
			const result = await queue.drain();
			expect(result.stopped).toBe('server');
			expect(queue.list()).toHaveLength(2);
		}
		const last = await queue.drain();

		expect(last.failed.map((item) => item.id)).toEqual([poison.id]);
		expect(last.saved.map((entry) => entry.capture.id)).toEqual([good.id]);
		expect(queue.list()).toEqual([
			expect.objectContaining({
				id: poison.id,
				state: 'failed',
				failures: MAX_SERVER_FAILURES
			})
		]);
	});

	it('stops when signed out and leaves the capture pending for after sign-in', async () => {
		const save = vi.fn().mockRejectedValue(status(401, 'Unauthorized', 'UNAUTHORIZED'));
		const { queue } = makeQueue({ save });
		await queue.enqueueText('later');

		const result = await queue.drain();

		expect(result.stopped).toBe('unauthorized');
		expect(queue.list()[0]).toMatchObject({ state: 'pending', last_error: 'Signed out' });
	});
});

describe('sorting after the save', () => {
	it('waits for a connection to sort without saving the note again', async () => {
		const sort = vi
			.fn()
			.mockRejectedValueOnce(offline())
			.mockResolvedValue(sortedAs(['Moved to Cadre']));
		const { queue, save } = makeQueue({ sort });
		await queue.enqueueText('Cadre: book the venue');

		const first = await queue.drain();
		expect(first.stopped).toBe('offline');
		expect(queue.list()[0]).toMatchObject({ document_id: 'd1', state: 'pending' });

		const second = await queue.drain();
		expect(save).toHaveBeenCalledTimes(1);
		expect(sort).toHaveBeenCalledTimes(2);
		expect(second.sorted[0]?.lines).toEqual(['Moved to Cadre']);
		expect(queue.list()).toHaveLength(0);
	});

	it('lets the note stay a note when the sort is refused or keeps failing', async () => {
		const sort = vi.fn().mockRejectedValue(status(400, 'Bad request'));
		const { queue } = makeQueue({ sort });
		await queue.enqueueText('one');
		const refused = await queue.drain();
		expect(refused.stopped).toBeNull();
		expect(refused.failed).toEqual([]);
		expect(queue.list()).toHaveLength(0);

		const flaky = makeQueue({ sort: vi.fn().mockRejectedValue(status(503, 'Down')) });
		await flaky.queue.enqueueText('two');
		for (let round = 1; round < MAX_SERVER_FAILURES; round += 1) {
			expect((await flaky.queue.drain()).stopped).toBeNull();
			expect(flaky.queue.list()[0]).toMatchObject({ document_id: 'd1', failures: round });
		}
		expect((await flaky.queue.drain()).stopped).toBeNull();
		expect(flaky.queue.list()).toHaveLength(0);
	});

	it('never holds a later capture back for a sort that is struggling', async () => {
		const sort = vi
			.fn()
			.mockRejectedValueOnce(status(503, 'Down'))
			.mockResolvedValue(sortedAs([]));
		const save = vi.fn(async ({ text }: { text: string }) => savedAs(`d-${text}`));
		const { queue } = makeQueue({ save, sort });
		await queue.enqueueText('first');
		await queue.enqueueText('second');

		const result = await queue.drain();

		expect(result.stopped).toBeNull();
		expect(save).toHaveBeenCalledTimes(2);
		// The first note is saved and waits only for its sort; the second went all the way.
		expect(queue.list()).toEqual([
			expect.objectContaining({ text: 'first', document_id: 'd-first', failures: 1 })
		]);
	});

	it('keeps the newest sorted results, and dismissSorted hides one', async () => {
		let n = 0;
		const { queue } = makeQueue({ sort: vi.fn(async () => sortedAs([`result ${++n}`])) });
		for (let i = 0; i < MAX_SORTED + 1; i += 1) await queue.enqueueText(`jot ${i}`);
		await queue.drain();

		const lines = queue.snapshot().sorted.map((entry) => entry.lines[0]);
		expect(lines).toEqual(['result 4', 'result 3', 'result 2']);

		queue.dismissSorted(queue.snapshot().sorted[0]!.id);
		expect(queue.snapshot().sorted.map((entry) => entry.lines[0])).toEqual([
			'result 3',
			'result 2'
		]);
	});
});

describe('voice captures', () => {
	it('transcribes, saves the transcript, deletes the recording, then sorts', async () => {
		const transcribe = vi.fn(async () => '  Book the venue for Thursday  ');
		const sort = vi.fn(async () => sortedAs(['Task → Cadre']));
		const { queue, save, discardAudio } = makeQueue({ transcribe, sort });
		const audio = recording();
		const item = await queue.enqueueVoice(audio);
		expect(item).toMatchObject({ kind: 'voice', text: '', audio });

		const result = await queue.drain();

		expect(transcribe).toHaveBeenCalledWith(audio);
		expect(save).toHaveBeenCalledWith({
			kind: 'note',
			text: 'Book the venue for Thursday',
			source: 'ios_voice',
			idempotency_key: item.id
		});
		expect(discardAudio).toHaveBeenCalledWith(audio);
		expect(sort).toHaveBeenCalledWith({ document_id: 'd1', source: 'ios_voice' });
		expect(result.sorted[0]).toMatchObject({ kind: 'voice', lines: ['Task → Cadre'] });
		expect(queue.list()).toHaveLength(0);
	});

	it('never transcribes twice: a save that fails offline resumes from the saved transcript', async () => {
		const transcribe = vi.fn(async () => 'words');
		const save = vi.fn().mockRejectedValueOnce(offline()).mockResolvedValue(savedAs('d1'));
		const { queue, store, discardAudio } = makeQueue({ transcribe, save });
		await queue.enqueueVoice(recording());

		await queue.drain();
		expect(queue.list()[0]).toMatchObject({ text: 'words', state: 'pending' });
		expect(discardAudio).not.toHaveBeenCalled();

		// Survives a restart too: the transcript is persisted with the item.
		const restarted = createCaptureQueue({
			store,
			key: KEY,
			transcribe,
			save,
			sort: vi.fn(async () => sortedAs([]))
		});
		await restarted.drain();
		expect(transcribe).toHaveBeenCalledTimes(1);
		expect(save).toHaveBeenCalledTimes(2);
		expect(restarted.list()).toHaveLength(0);
	});

	it('waits offline with the recording kept on the phone', async () => {
		const transcribe = vi
			.fn()
			.mockRejectedValueOnce(offline())
			.mockResolvedValue('later words');
		const { queue, discardAudio } = makeQueue({ transcribe });
		const item = await queue.enqueueVoice(recording());

		const result = await queue.drain();

		expect(result.stopped).toBe('offline');
		expect(queue.list()[0]).toMatchObject({ id: item.id, text: '', audio: recording() });
		expect(discardAudio).not.toHaveBeenCalled();

		await queue.drain();
		expect(queue.list()).toHaveLength(0);
	});

	it('flags a recording with no speech for a person and keeps the audio until discarded', async () => {
		const { queue, save, discardAudio } = makeQueue({ transcribe: vi.fn(async () => '   ') });
		const item = await queue.enqueueVoice(recording());

		const result = await queue.drain();

		expect(save).not.toHaveBeenCalled();
		expect(result.failed.map((entry) => entry.id)).toEqual([item.id]);
		expect(queue.list()[0]).toMatchObject({
			state: 'failed',
			last_error: 'No speech was heard in this recording.'
		});
		expect(discardAudio).not.toHaveBeenCalled();

		await queue.remove(item.id);
		expect(discardAudio).toHaveBeenCalledWith(recording());
		expect(queue.list()).toHaveLength(0);
	});

	it('reports the step it is working on while it runs', async () => {
		let release!: (value: string) => void;
		const transcribe = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					release = resolve;
				})
		);
		const { queue } = makeQueue({ transcribe });
		const item = await queue.enqueueVoice(recording());

		const drain = queue.drain();
		await vi.waitFor(() => expect(transcribe).toHaveBeenCalled());
		expect(queue.snapshot().active).toEqual({ id: item.id, stage: 'transcribe' });
		release('done');
		await drain;
		expect(queue.snapshot().active).toBeNull();
	});

	it('moves on when a capture is discarded while it is being transcribed', async () => {
		let fail!: (error: unknown) => void;
		const transcribe = vi.fn(
			() =>
				new Promise<string>((_, reject) => {
					fail = reject;
				})
		);
		const { queue } = makeQueue({ transcribe });
		const item = await queue.enqueueVoice(recording());
		const next = await queue.enqueueText('still sent');

		const drain = queue.drain();
		await vi.waitFor(() => expect(transcribe).toHaveBeenCalled());
		await queue.remove(item.id);
		fail(status(500, 'file vanished'));
		const result = await drain;

		expect(result.stopped).toBeNull();
		expect(result.saved.map((entry) => entry.capture.id)).toEqual([next.id]);
		expect(queue.list()).toHaveLength(0);
	});
});

describe('recovery', () => {
	it('sends a recording that is gone to "needs you" at once instead of blocking the queue', async () => {
		const transcribe = vi.fn(async () => {
			throw new CaptureRejectedError('The recording is no longer on this phone.');
		});
		const { queue, save } = makeQueue({ transcribe });
		const lost = await queue.enqueueVoice(recording());
		const typed = await queue.enqueueText('still sent');

		const result = await queue.drain();

		expect(result.stopped).toBeNull();
		expect(result.failed.map((item) => item.id)).toEqual([lost.id]);
		expect(result.saved.map((entry) => entry.capture.id)).toEqual([typed.id]);
		expect(save).toHaveBeenCalledTimes(1);
		expect(queue.list()[0]).toMatchObject({
			state: 'failed',
			last_error: 'The recording is no longer on this phone.'
		});
	});

	it('never writes over a queue it could not read, and reads again next time', async () => {
		const store = memoryStore();
		store.map.set(
			KEY,
			JSON.stringify({ v: 2, items: [{ id: 'cap_kept_0001', kind: 'note', text: 'kept' }] })
		);
		store.getItem.mockRejectedValueOnce(new Error('keychain locked'));
		const { queue, save } = makeQueue({ store });

		const blocked = await queue.drain();
		expect(blocked.stopped).toBe('server');
		expect(save).not.toHaveBeenCalled();
		expect(store.map.get(KEY)).toContain('cap_kept_0001');

		const recovered = await queue.drain();
		expect(recovered.saved.map((entry) => entry.capture.id)).toEqual(['cap_kept_0001']);
	});

	it('stops saying "waiting" as soon as something gets through', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const save = vi
			.fn()
			.mockRejectedValueOnce(offline())
			.mockResolvedValueOnce(savedAs('d1'))
			.mockImplementation(async () => {
				await gate;
				return savedAs('d2');
			});
		const { queue } = makeQueue({ save });
		await queue.enqueueText('one');
		await queue.enqueueText('two');
		await queue.drain();
		expect(queue.snapshot().lastStop).toBe('offline');

		const drain = queue.drain();
		await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(3));
		// 'one' is saved, 'two' is still sending: no longer "no connection".
		expect(queue.snapshot().lastStop).toBeNull();
		release();
		await drain;
	});

	it('adopts recordings left on the phone once, skipping ones a capture already points at', async () => {
		const { queue } = makeQueue();
		const known = await queue.enqueueVoice(recording('known'));

		const [first, second] = await Promise.all([
			queue.adoptRecordings([recording('known'), recording('orphan')]),
			queue.adoptRecordings([recording('orphan')])
		]);

		expect(first.map((item) => item.audio?.path)).toEqual(['ExpoAudio/orphan.m4a']);
		expect(second).toEqual([]);
		expect(queue.list().map((item) => item.audio?.path)).toEqual([
			known.audio?.path,
			'ExpoAudio/orphan.m4a'
		]);
	});
});

describe('queue mechanics', () => {
	it('retryAll turns failed items back into pending; remove drops one', async () => {
		const save = vi
			.fn()
			.mockRejectedValue(status(402, 'Editing is paused', 'UPGRADE_REQUIRED'));
		const { queue } = makeQueue({ save });
		const a = await queue.enqueueText('a');
		const b = await queue.enqueueText('b');
		await queue.drain();
		expect(queue.list().every((item) => item.state === 'failed')).toBe(true);

		await queue.retryAll();
		expect(queue.list().every((item) => item.state === 'pending' && item.failures === 0)).toBe(
			true
		);

		await queue.remove(a.id);
		expect(queue.list().map((item) => item.id)).toEqual([b.id]);
	});

	it('shares one in-flight drain between concurrent callers and notifies subscribers', async () => {
		const { queue, save } = makeQueue();
		const seen: number[] = [];
		queue.subscribe((snapshot) => seen.push(snapshot.items.length));
		await queue.enqueueText('once');

		const [first, second] = await Promise.all([queue.drain(), queue.drain()]);

		expect(first).toBe(second);
		expect(save).toHaveBeenCalledTimes(1);
		expect(seen[0]).toBe(1);
		expect(seen.at(-1)).toBe(0);
	});

	it('sends a capture added while a drain is already running', async () => {
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const save = vi.fn(async () => {
			await gate;
			return savedAs('d');
		});
		const { queue } = makeQueue({ save });
		await queue.enqueueText('first');

		const drain = queue.drain();
		await queue.enqueueText('second');
		release();
		const result = await drain;

		expect(save).toHaveBeenCalledTimes(2);
		expect(result.saved.map((entry) => entry.capture.text)).toEqual(['first', 'second']);
		expect(queue.list()).toHaveLength(0);
	});

	it('remembers why the last drain stopped until one gets through', async () => {
		const save = vi.fn().mockRejectedValueOnce(offline()).mockResolvedValue(savedAs('d1'));
		const { queue } = makeQueue({ save });
		await queue.enqueueText('one');

		await queue.drain();
		expect(queue.snapshot().lastStop).toBe('offline');
		// A capture added while offline was never attempted, yet the screen can still say
		// "waiting for a connection" rather than "saving".
		const second = await queue.enqueueText('two');
		expect(queue.snapshot().lastStop).toBe('offline');
		expect(queue.snapshot().items.map((item) => item.id)).toContain(second.id);

		await queue.drain();
		expect(queue.snapshot().lastStop).toBeNull();
		expect(queue.snapshot().items).toHaveLength(0);
	});

	it('treats unreadable storage as empty instead of crashing', async () => {
		const store = memoryStore();
		store.map.set(KEY, '{not json');
		const { queue } = makeQueue({ store });
		await queue.load();
		expect(queue.list()).toEqual([]);
	});

	it('reads items written by the first build and sends a picked task as a task, unsorted', async () => {
		const store = memoryStore();
		store.map.set(
			KEY,
			JSON.stringify({
				v: 1,
				items: [
					{
						id: 'cap_old_task_0001',
						kind: 'task',
						text: 'Old task',
						created_at: '2026-10-29T00:00:00.000Z',
						attempts: 1,
						last_error: 'No connection',
						state: 'pending'
					}
				]
			})
		);
		const save = vi.fn(async () => savedAs('t1', 'task'));
		const { queue, sort } = makeQueue({ store, save });

		await queue.drain();

		expect(save).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'task',
				text: 'Old task',
				idempotency_key: 'cap_old_task_0001'
			})
		);
		expect(sort).not.toHaveBeenCalled();
		expect(queue.list()).toHaveLength(0);
	});

	it('drops stored voice items that lost both their words and their recording', () => {
		const items = parsePersisted(
			JSON.stringify({
				v: 2,
				items: [
					{ id: 'a', kind: 'voice', text: '', audio: null },
					{ id: 'b', kind: 'voice', text: '', audio: recording() },
					{ id: 'c', kind: 'note', text: 'kept' }
				]
			})
		);
		expect(items.map((item) => item.id)).toEqual(['b', 'c']);
	});
});
