import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLibriUploadMaintenanceBroker } from './upload-maintenance';

const libraryId = 'f09948c4-e4e0-581c-8689-7258bea2f501';
const uploadId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const targetId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const leaseToken = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const token = 'synthetic-machine-token-abcdefghijklmnopqrstuvwxyz';
const url = 'https://build-os.com/api/internal/libri/uploads/maintain';
const base = { libraryId, uploadId };
function fixture() {
	const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(null));
	const broker = createLibriUploadMaintenanceBroker();
	const config = {
		enabled: true,
		url: 'https://iwifjtlebphefldmwbkh.supabase.co',
		serviceKey: 'synthetic-service',
		brokerToken: token,
		fetchImpl
	};
	const request = (body: unknown, signal?: AbortSignal) =>
		new Request(url, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal
		});
	return {
		fetchImpl,
		broker,
		config,
		request,
		run: (body: unknown, signal?: AbortSignal) => broker(request(body, signal), config)
	};
}
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});
describe('exact upload maintenance broker', () => {
	it('defaults off and never touches the provider without machine authentication', async () => {
		const f = fixture();
		expect(
			(
				await f.broker(f.request({ ...base, action: 'retire' }), {
					...f.config,
					enabled: undefined
				})
			).status
		).toBe(404);
		const request = f.request({ ...base, action: 'retire' });
		request.headers.delete('authorization');
		expect((await f.broker(request, f.config)).status).toBe(401);
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it.each([
		{ ...base, action: 'sql', sql: 'delete' },
		{ ...base, action: 'retire', objectPath: 'anything' },
		{ ...base, action: 'retire', libraryId: targetId },
		{ ...base, action: 'cleanup', targetId, leaseToken: 'bad' },
		{ ...base, action: 'targets', uploadId: 'bad' }
	])('rejects scope or authority outside its fixed contract: %j', async (command) => {
		const f = fixture();
		expect((await f.run(command)).status).toBe(400);
		expect(f.fetchImpl).not.toHaveBeenCalled();
	});
	it('retirement is explicit and returns only a validated receipt', async () => {
		const f = fixture();
		f.fetchImpl.mockResolvedValueOnce(
			Response.json({
				library_id: libraryId,
				upload_id: uploadId,
				status: 'cleanup_pending',
				outcome: 'expired',
				target_count: 1,
				secret: 'not-returned'
			})
		);
		const result = await f.run({ ...base, action: 'retire' });
		expect(await result.json()).toEqual({
			action: 'retire',
			uploadId,
			status: 'retired',
			outcome: 'expired'
		});
		expect(result.headers.get('cache-control')).toBe('private, no-store');
		expect(f.fetchImpl).toHaveBeenCalledOnce();
		const [endpoint, init] = f.fetchImpl.mock.calls[0]!;
		expect(String(endpoint)).toBe(f.config.url + '/rest/v1/rpc/retire_image_upload');
		expect(JSON.parse(String(init?.body))).toEqual({
			p_library_id: libraryId,
			p_upload_id: uploadId
		});
		expect(new Headers(init?.headers).get('authorization')).toBe('Bearer synthetic-service');
		expect(init).toMatchObject({ redirect: 'error', cache: 'no-store' });
	});
	it('a null retirement is known ineligibility, with no automatic follow-up', async () => {
		const f = fixture();
		expect(await (await f.run({ ...base, action: 'retire' })).json()).toEqual({
			action: 'retire',
			uploadId,
			status: 'ineligible'
		});
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
	it.each([true, false])(
		'preserves the explicit quota settlement outcome %s',
		async (released) => {
			const f = fixture();
			f.fetchImpl.mockResolvedValueOnce(Response.json(released));
			expect(await (await f.run({ ...base, action: 'release_unissued' })).json()).toEqual({
				action: 'release_unissued',
				uploadId,
				status: released ? 'released' : 'retained'
			});
			expect(f.fetchImpl).toHaveBeenCalledOnce();
		}
	);
	it('does not interpret a malformed or mismatched provider response as success', async () => {
		const f = fixture();
		f.fetchImpl.mockResolvedValueOnce(Response.json({ released: true }));
		expect((await f.run({ ...base, action: 'release_unissued' })).status).toBe(503);
		f.fetchImpl.mockResolvedValueOnce(
			Response.json({
				library_id: targetId,
				upload_id: uploadId,
				status: 'cleanup_pending',
				outcome: 'expired',
				target_count: 1
			})
		);
		expect((await f.run({ ...base, action: 'retire' })).status).toBe(503);
	});
	it('lists at most four unique targets scoped by both library and upload', async () => {
		const f = fixture();
		f.fetchImpl.mockResolvedValueOnce(
			Response.json([{ id: targetId, library_id: libraryId, upload_id: uploadId }])
		);
		expect(await (await f.run({ ...base, action: 'targets' })).json()).toEqual({
			action: 'targets',
			uploadId,
			targetIds: [targetId]
		});
		const query = new URL(String(f.fetchImpl.mock.calls[0]![0])).searchParams;
		expect(Object.fromEntries(query)).toEqual({
			select: 'id,library_id,upload_id',
			library_id: `eq.${libraryId}`,
			upload_id: `eq.${uploadId}`,
			limit: '5'
		});
	});
	it.each(['duplicate', 'over_limit', 'wrong_upload'])(
		'rejects unsafe target sets: %s',
		async (scenario) => {
			const f = fixture();
			const row = {
				id: targetId,
				library_id: libraryId,
				upload_id: scenario === 'wrong_upload' ? targetId : uploadId
			};
			f.fetchImpl.mockResolvedValueOnce(
				Response.json(
					Array.from(
						{
							length: scenario === 'over_limit' ? 5 : scenario === 'duplicate' ? 2 : 1
						},
						() => row
					)
				)
			);
			expect((await f.run({ ...base, action: 'targets' })).status).toBe(503);
			expect(f.fetchImpl).toHaveBeenCalledOnce();
		}
	);
	it('cannot clean a target outside the requested upload', async () => {
		const f = fixture();
		f.fetchImpl.mockResolvedValueOnce(Response.json([]));
		expect((await f.run({ ...base, action: 'cleanup', targetId, leaseToken })).status).toBe(
			409
		);
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
	it('lets database eligibility block cleanup before any Storage call', async () => {
		const f = fixture();
		f.fetchImpl.mockResolvedValueOnce(
			Response.json([{ id: targetId, library_id: libraryId, upload_id: uploadId }])
		);
		expect(
			await (await f.run({ ...base, action: 'cleanup', targetId, leaseToken })).json()
		).toEqual({
			action: 'cleanup',
			uploadId,
			targetId,
			status: 'unclaimed',
			mayHaveDeletedObject: false
		});
		expect(f.fetchImpl).toHaveBeenCalledTimes(2);
		expect(
			String(f.fetchImpl.mock.calls[1]![0]).endsWith('/rpc/claim_image_upload_cleanup')
		).toBe(true);
	});
	it('retains capacity after a timeout until the underlying provider actually settles', async () => {
		vi.useFakeTimers();
		const f = fixture();
		let settle!: (response: Response) => void;
		f.fetchImpl.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					settle = resolve;
				})
		);
		const pending = f.run({ ...base, action: 'retire' });
		await vi.advanceTimersByTimeAsync(25_000);
		expect((await pending).status).toBe(503);
		expect((await f.run({ ...base, action: 'retire' })).status).toBe(429);
		expect(f.fetchImpl).toHaveBeenCalledOnce();
		settle(Response.json(null));
		await vi.advanceTimersByTimeAsync(1);
		expect((await f.run({ ...base, action: 'retire' })).status).toBe(200);
	});
	it('preserves the nested cleanup capacity after its shorter timeout', async () => {
		vi.useFakeTimers();
		const f = fixture();
		let settle!: (response: Response) => void;
		f.fetchImpl.mockResolvedValueOnce(
			Response.json([{ id: targetId, library_id: libraryId, upload_id: uploadId }])
		);
		f.fetchImpl.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					settle = resolve;
				})
		);
		const pending = f.run({ ...base, action: 'cleanup', targetId, leaseToken });
		await vi.advanceTimersByTimeAsync(20_001);
		expect((await pending).status).toBe(503);
		expect((await f.run({ ...base, action: 'retire' })).status).toBe(429);
		expect(f.fetchImpl).toHaveBeenCalledTimes(2);
		settle(Response.json(null));
		await vi.advanceTimersByTimeAsync(1);
		expect((await f.run({ ...base, action: 'retire' })).status).toBe(200);
	});
	it('bounds streamed request and response bodies without retries', async () => {
		const f = fixture();
		expect((await f.run({ ...base, action: 'retire', padding: 'x'.repeat(1100) })).status).toBe(
			413
		);
		expect(f.fetchImpl).not.toHaveBeenCalled();
		f.fetchImpl.mockResolvedValueOnce(Response.json('x'.repeat(5000)));
		expect((await f.run({ ...base, action: 'retire' })).status).toBe(503);
		expect(f.fetchImpl).toHaveBeenCalledOnce();
	});
});
