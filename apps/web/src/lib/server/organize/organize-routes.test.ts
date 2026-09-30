// apps/web/src/lib/server/organize/organize-routes.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as preview } from '../../../routes/api/onto/organize/preview/+server';
import { POST as apply } from '../../../routes/api/onto/organize/apply/+server';
import { POST as undo } from '../../../routes/api/onto/organize/undo/+server';
import {
	previewOrApplyOrganize,
	undoOrganize,
	OrganizeError,
	OrganizeSnapshotError
} from './organize-service';
vi.mock('$lib/supabase/admin', () => ({ createAdminSupabaseClient: vi.fn(() => ({})) }));
// Real error classes, so the error-to-HTTP mapping below is exercised for real.
vi.mock('./organize-service', async (importOriginal) => ({
	...(await importOriginal<typeof import('./organize-service')>()),
	previewOrApplyOrganize: vi.fn(async () => ({ confirmation_token: 'token' })),
	undoOrganize: vi.fn(async () => ({ status: 'applied' }))
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
	it('caps the distinct projects a batch can touch', async () => {
		const project = (i: number) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`;
		const chain = (projects: number) =>
			Array.from({ length: projects - 1 }, (_, i) => ({
				...body.moves[0],
				project_id: project(i),
				destination_project_id: project(i + 1)
			}));
		expect((await preview(event({ ...body, moves: chain(21) }))).status).toBe(422);
		expect(previewOrApplyOrganize).not.toHaveBeenCalled();
		expect((await preview(event({ ...body, moves: chain(20) }))).status).toBe(200);
	});
	it('maps Organize errors to their status and message', async () => {
		const cases: [Error, number, string][] = [
			[
				new OrganizeError('Edit access to every project is required.', 403),
				403,
				'Edit access to every project is required.'
			],
			[
				new OrganizeError(
					'A project changed since it was opened. Refresh before previewing.'
				),
				409,
				'A project changed since it was opened. Refresh before previewing.'
			],
			[
				new OrganizeSnapshotError('Archived projects cannot be organized.', 409),
				409,
				'Archived projects cannot be organized.'
			]
		];
		for (const [error, status, message] of cases) {
			vi.mocked(previewOrApplyOrganize).mockRejectedValueOnce(error);
			const response = await preview(event(body));
			expect(response.status).toBe(status);
			expect((await response.json()).error).toBe(message);
		}
	});
	it('hides unexpected failures behind a generic 500', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		vi.mocked(undoOrganize).mockRejectedValueOnce(
			new TypeError('relation private.organize_rollout does not exist')
		);
		const response = await undo(event({ source_batch_id: a }));
		expect(response.status).toBe(500);
		expect(JSON.stringify(await response.json())).not.toContain('organize_rollout');
		log.mockRestore();
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
