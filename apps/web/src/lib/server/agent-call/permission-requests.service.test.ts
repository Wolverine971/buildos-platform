// apps/web/src/lib/server/agent-call/permission-requests.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PermissionRequestService } from './permission-requests.service';
const id = '10000000-0000-4000-8000-000000000001';
const ref = { kind: 'key' as const, caller_id: id, token_hash: 'test-hash' };
const input = { kind: 'document', target_id: id, changes: { title: 'After' } };
function fixture(
	options: {
		enabled?: boolean;
		epoch?: number;
		status?: string;
		expired?: boolean;
		read?: boolean;
	} = {}
) {
	const row = {
		id,
		project_id: id,
		epoch: 1,
		status: options.status ?? 'pending',
		expires_at: options.expired ? '2000-01-01' : '2999-01-01',
		receipt: { target_id: id }
	};
	const rpc = vi.fn(async () => ({ data: row, error: null }));
	const from = vi.fn((_table: string) => {
		const b: any = {
			select: () => b,
			eq: () => b,
			maybeSingle: async () => ({
				data: { enabled: options.enabled ?? true, epoch: options.epoch ?? 1 },
				error: null
			})
		};
		return b;
	});
	const service = new PermissionRequestService(
		{ rpc, from },
		ref,
		{ mode: 'read_only', project_ids: options.read === false ? [] : [id] },
		'https://build-os.com'
	);
	return { service, rpc, from };
}
describe('permission retries', () => {
	it('leaves broad legacy updates alone when there is no scoped key', async () => {
		const { service, rpc, from } = fixture();
		from.mockImplementation(() => {
			const b: any = {
				select: () => b,
				eq: () => b,
				maybeSingle: async () => ({ data: null, error: null })
			};
			return b;
		});
		expect(
			await service.replay(
				{
					kind: 'document',
					target_id: id,
					changes: { props: { legacy: true }, update_strategy: 'merge_llm' }
				},
				'legacy-key'
			)
		).toBeNull();
		expect(rpc).not.toHaveBeenCalled();
	});
	it('returns stored receipt before loading or recomputing the target', async () => {
		const { service, from } = fixture({ status: 'applied' });
		const result = await service.submit({ proposal: input, idempotency_key: 'stable' });
		expect(result.status).toBe('applied');
		expect(from.mock.calls.map((c) => c[0])).not.toContain('onto_documents');
	});
	it.each([{ enabled: false }, { epoch: 2 }])(
		'normalizes killed and old epoch pending retries',
		async (options) => {
			const { service } = fixture(options);
			expect(
				(await service.submit({ proposal: input, idempotency_key: 'stable' })).status
			).toBe('canceled');
		}
	);
	it('normalizes expiry and redacts receipts after losing project read access', async () => {
		const { service } = fixture({ expired: true, read: false });
		const r = await service.submit({ proposal: input, idempotency_key: 'stable' });
		expect(r.status).toBe('expired');
		expect('receipt' in r ? r.receipt : undefined).toBeNull();
	});
	it('never passes caller-provided identity or approval fields', async () => {
		const { service, rpc } = fixture();
		await expect(
			service.submit({
				proposal: input,
				idempotency_key: 'key',
				user_id: id,
				decision: 'always'
			})
		).rejects.toThrow();
		expect(rpc).not.toHaveBeenCalled();
	});
});
