// apps/web/src/lib/server/organize/organize-routes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as preview } from '../../../routes/api/onto/organize/preview/+server';
import { POST as apply } from '../../../routes/api/onto/organize/apply/+server';
import { POST as undo } from '../../../routes/api/onto/organize/undo/+server';
import { previewOrApplyOrganize, undoOrganize } from './organize-service';
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn(() => ({})) }));
vi.mock('./organize-service', () => ({
	previewOrApplyOrganize: vi.fn(async () => ({ confirmation_token: 'token' })),
	undoOrganize: vi.fn(async () => ({ status: 'applied' })),
	OrganizeError: class extends Error {},
	OrganizeSnapshotError: class extends Error {}
}));
const a = '11111111-1111-4111-8111-111111111111',
	b = '22222222-2222-4222-8222-222222222222';
const body = {
	moves: [
		{
			kind: 'task',
			id: a,
			project_id: a,
			destination_project_id: b,
			parent_id: null,
			position: 0
		}
	],
	project_versions: { [a]: '2026-09-30T12:00:00Z', [b]: '2026-09-30T12:00:00Z' }
};
const event = (data: unknown, user: unknown = { id: 'user' }) =>
	({
		locals: { safeGetSession: async () => ({ user }), supabase: {} },
		request: new Request('https://buildos.test/api/onto/organize/preview', {
			method: 'POST',
			body: JSON.stringify(data)
		})
	}) as any;
beforeEach(() => vi.clearAllMocks());
describe('Organize HTTP boundary', () => {
	it('requires authentication before a preview', async () => {
		expect((await preview(event(body, null))).status).toBe(401);
		expect(previewOrApplyOrganize).not.toHaveBeenCalled();
	});
	it('validates structured IDs and the operation cap', async () => {
		expect(
			(
				await preview(
					event({ ...body, moves: Array.from({ length: 201 }, () => body.moves[0]) })
				)
			).status
		).toBe(422);
		expect(
			(await preview(event({ ...body, moves: [{ ...body.moves[0], id: 'not-uuid' }] })))
				.status
		).toBe(422);
		expect(previewOrApplyOrganize).not.toHaveBeenCalled();
	});
	it('does not accept client-built tree payloads', async () => {
		expect((await preview(event({ ...body, trees: [] }))).status).toBe(422);
	});
	it('passes the authenticated identity to the preview compiler', async () => {
		expect((await preview(event(body))).status).toBe(200);
		expect(previewOrApplyOrganize).toHaveBeenCalledWith(
			expect.objectContaining({ userId: 'user', apply: false })
		);
	});
	it('requires a token and idempotency key for apply', async () => {
		expect((await apply(event(body))).status).toBe(422);
		expect(
			(await apply(event({ ...body, confirmation_token: 'a'.repeat(32), batch_id: a })))
				.status
		).toBe(200);
		expect(previewOrApplyOrganize).toHaveBeenCalledWith(
			expect.objectContaining({ apply: true })
		);
	});
	it('requires a fresh batch identity for a confirmed undo', async () => {
		expect(
			(await undo(event({ source_batch_id: a, confirmation_token: 'a'.repeat(32) }))).status
		).toBe(422);
		expect(undoOrganize).not.toHaveBeenCalled();
	});
});
