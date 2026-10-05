// apps/web/src/lib/services/ensure-today-brief.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { monitorQueuedGeneration, environment } = vi.hoisted(() => ({
	monitorQueuedGeneration: vi.fn().mockResolvedValue(undefined),
	environment: { browser: true }
}));

vi.mock('$app/environment', () => environment);
vi.mock('$lib/services/briefClient.service', () => ({
	BriefClientService: { monitorQueuedGeneration }
}));

const user = { id: 'user-1', email: 'dj@example.com', is_admin: false, timezone: 'UTC' };

function answer(data: Record<string, unknown>, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => (status < 300 ? { success: true, data } : { success: false, ...data })
	} as Response;
}

const queued = {
	state: 'queued',
	briefDate: '2026-10-04',
	timezone: 'America/New_York',
	queued: true,
	job: { queue_job_id: 'job-1', status: 'pending' }
};

// Fresh module per test: the helper's memory is per tab (module scope).
async function loadHelper() {
	vi.resetModules();
	return import('./ensure-today-brief');
}

describe('ensureTodaysBrief', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		vi.clearAllMocks();
		environment.browser = true;
		fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
	});

	it('sends one request when /today and the Projects chip ask at the same time', async () => {
		const { ensureTodaysBrief } = await loadHelper();
		let release!: (value: Response) => void;
		fetchMock.mockReturnValue(new Promise<Response>((resolve) => (release = resolve)));

		const fromToday = ensureTodaysBrief({ user, supabaseClient: 'sb' });
		const fromChip = ensureTodaysBrief({ user, supabaseClient: 'sb' });
		release(answer(queued));

		await expect(fromToday).resolves.toMatchObject({ state: 'queued' });
		await expect(fromChip).resolves.toMatchObject({ state: 'queued' });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/api/daily-briefs/ensure-today', {
			method: 'POST'
		});
	});

	it('follows a queued job once and reuses the answer when the user moves between pages', async () => {
		const { ensureTodaysBrief } = await loadHelper();
		fetchMock.mockResolvedValue(answer(queued));

		await ensureTodaysBrief({ user, supabaseClient: 'sb' });
		const later = await ensureTodaysBrief({ user, supabaseClient: 'sb' });

		expect(later).toMatchObject({ state: 'queued', job: { queue_job_id: 'job-1' } });
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(monitorQueuedGeneration).toHaveBeenCalledExactlyOnceWith({
			briefDate: '2026-10-04',
			jobId: 'job-1',
			user: { id: 'user-1', email: 'dj@example.com', is_admin: false },
			timezone: 'America/New_York',
			supabaseClient: 'sb'
		});
	});

	it('hands back a completed brief without following anything', async () => {
		const { ensureTodaysBrief } = await loadHelper();
		const brief = { id: 'brief-1', brief_date: '2026-10-04' };
		fetchMock.mockResolvedValue(
			answer({ state: 'completed', briefDate: '2026-10-04', timezone: 'UTC', brief })
		);

		await expect(ensureTodaysBrief({ user })).resolves.toMatchObject({ brief });
		expect(monitorQueuedGeneration).not.toHaveBeenCalled();
	});

	it.each(['skipped_no_projects', 'skipped_no_actor'])(
		'asks again after %s (the user may create a first project this session)',
		async (state) => {
			const { ensureTodaysBrief } = await loadHelper();
			fetchMock
				.mockResolvedValueOnce(answer({ state, briefDate: '2026-10-04', timezone: 'UTC' }))
				.mockResolvedValueOnce(answer(queued));

			await ensureTodaysBrief({ user });
			await expect(ensureTodaysBrief({ user })).resolves.toMatchObject({ state: 'queued' });
			expect(fetchMock).toHaveBeenCalledTimes(2);
		}
	);

	it('remembers a recent-failure skip for the rest of the day', async () => {
		const { ensureTodaysBrief } = await loadHelper();
		fetchMock.mockResolvedValue(
			answer({ state: 'skipped_recent_failure', briefDate: '2026-10-04', timezone: 'UTC' })
		);

		await ensureTodaysBrief({ user });
		await ensureTodaysBrief({ user });
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('does not re-hit the billing guard after a 402 (frozen account)', async () => {
		const { ensureTodaysBrief } = await loadHelper();
		fetchMock.mockResolvedValue(answer({ code: 'UPGRADE_REQUIRED' }, 402));

		await expect(ensureTodaysBrief({ user })).resolves.toBeNull();
		await expect(ensureTodaysBrief({ user })).resolves.toBeNull();
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('retries on the next call after a server error or a network failure', async () => {
		const { ensureTodaysBrief } = await loadHelper();
		fetchMock
			.mockResolvedValueOnce(answer({}, 503))
			.mockRejectedValueOnce(new Error('offline'))
			.mockResolvedValueOnce(answer(queued));

		await expect(ensureTodaysBrief({ user })).resolves.toBeNull();
		await expect(ensureTodaysBrief({ user })).resolves.toBeNull();
		await expect(ensureTodaysBrief({ user })).resolves.toMatchObject({ state: 'queued' });
		expect(fetchMock).toHaveBeenCalledTimes(3);
	});

	it('asks again on a new day in a tab left open overnight', async () => {
		const { ensureTodaysBrief } = await loadHelper();
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 4, 22, 0));
		fetchMock.mockResolvedValue(answer(queued));

		await ensureTodaysBrief({ user });
		vi.setSystemTime(new Date(2026, 9, 5, 7, 0));
		await ensureTodaysBrief({ user });

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('keeps accounts apart', async () => {
		const { ensureTodaysBrief } = await loadHelper();
		fetchMock.mockResolvedValue(answer(queued));

		await ensureTodaysBrief({ user });
		await ensureTodaysBrief({ user: { ...user, id: 'user-2' } });

		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('does nothing without a user or outside the browser', async () => {
		const { ensureTodaysBrief } = await loadHelper();

		await expect(ensureTodaysBrief({ user: null })).resolves.toBeNull();
		environment.browser = false;
		await expect(ensureTodaysBrief({ user })).resolves.toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
