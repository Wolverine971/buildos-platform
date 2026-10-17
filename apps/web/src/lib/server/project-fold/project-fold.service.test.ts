// apps/web/src/lib/server/project-fold/project-fold.service.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	ProjectFoldError,
	applyProjectFold,
	applyProjectUnfold,
	parseProjectUnfoldReceipt,
	previewProjectFold,
	previewProjectUnfold,
	toProjectFoldError
} from './project-fold.service';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const USER = id(1);
const SOURCE = id(2);
const DEST = id(3);
const ALICE = id(4);
const BOB = id(5);
const FOLD = id(6);

const PREVIEW = {
	confirmation_token: 'tok',
	impact: {
		source: { id: SOURCE, name: 'Content Ops', archived: false, parent_project_id: null },
		destination: { id: DEST, name: 'DJ Internal' },
		folder_title: 'From Content Ops',
		counts: { onto_documents: 2 },
		members: [],
		members_missing: [],
		member_additions: [],
		blockers: []
	},
	info: {}
};

function clients(options: { admin?: boolean[]; rpc?: { data?: unknown; error?: unknown } } = {}) {
	const access = [...(options.admin ?? [true, true])];
	const session = {
		rpc: vi.fn(async () => ({ data: access.shift() ?? true, error: null }))
	};
	const admin = {
		rpc: vi.fn(async function (this: unknown) {
			// The wrapper must keep `this` bound to the client.
			expect(this).toBe(admin);
			return { data: options.rpc?.data ?? PREVIEW, error: options.rpc?.error ?? null };
		}),
		from: vi.fn()
	};
	return {
		session: session as any,
		admin: admin as any,
		sessionRpc: session.rpc,
		adminRpc: admin.rpc
	};
}

describe('toProjectFoldError', () => {
	it('maps the fold migrations’ identifiers to messages and statuses', () => {
		expect(toProjectFoldError({ message: 'project_fold_access_denied' })).toMatchObject({
			code: 'access_denied',
			status: 403,
			rpcCode: 'project_fold_access_denied'
		});
		expect(toProjectFoldError({ message: 'project_fold_stale_preview' })).toMatchObject({
			code: 'stale_preview',
			status: 409
		});
		expect(toProjectFoldError({ message: 'project_unfold_stale_preview' })).toMatchObject({
			code: 'stale_preview',
			rpcCode: 'project_unfold_stale_preview'
		});
		expect(toProjectFoldError({ message: 'project_fold_service_only' })).toMatchObject({
			code: 'service_only',
			status: 500
		});
		expect(toProjectFoldError({ message: 'project_unfold_already_done' })).toMatchObject({
			code: 'unfold_already_done',
			status: 409
		});
		expect(toProjectFoldError({ message: 'project_fold_project_missing' })).toMatchObject({
			code: 'project_missing',
			status: 404
		});
	});

	it('reads blockers from the structured blocked message', () => {
		const error = toProjectFoldError({
			message: 'project_fold_blocked: ["members_missing", "standalone_events_not_supported"]'
		});
		expect(error).toMatchObject({ code: 'blocked', status: 409 });
		expect(error.blockers).toEqual(['members_missing', 'standalone_events_not_supported']);
		expect(
			toProjectFoldError({ message: 'project_unfold_blocked: ["nothing_can_return"]' })
		).toMatchObject({
			code: 'blocked',
			blockers: ['nothing_can_return']
		});
	});

	it('maps a missing function (migrations not applied) and unknown errors', () => {
		expect(
			toProjectFoldError({ code: 'PGRST202', message: 'Could not find the function' })
		).toMatchObject({ code: 'not_deployed', status: 503 });
		expect(toProjectFoldError({ code: '42501', message: 'permission denied' })).toMatchObject({
			code: 'access_denied',
			status: 403
		});
		expect(toProjectFoldError(new Error('fetch failed'))).toMatchObject({
			code: 'unknown',
			status: 500
		});
		const existing = new ProjectFoldError('blocked', 'x', 409);
		expect(toProjectFoldError(existing)).toBe(existing);
	});
});

describe('previewProjectFold / applyProjectFold', () => {
	it('checks admin on both with the session client before the service RPC', async () => {
		const c = clients({ admin: [true, false] });
		await expect(
			previewProjectFold({
				session: c.session,
				admin: c.admin,
				userId: USER,
				sourceProjectId: SOURCE,
				destinationProjectId: DEST
			})
		).rejects.toMatchObject({ code: 'access_denied', status: 403 });
		expect(c.sessionRpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: SOURCE,
			p_required_access: 'admin'
		});
		expect(c.sessionRpc).toHaveBeenCalledWith('current_actor_has_project_member_access', {
			p_project_id: DEST,
			p_required_access: 'admin'
		});
		expect(c.adminRpc).not.toHaveBeenCalled();
	});

	it('passes the session user id and sorted additions, and parses the impact', async () => {
		const c = clients();
		const impact = await previewProjectFold({
			session: c.session,
			admin: c.admin,
			userId: USER,
			sourceProjectId: SOURCE,
			destinationProjectId: DEST,
			memberAdditions: [BOB, ALICE, BOB]
		});
		expect(c.adminRpc).toHaveBeenCalledWith('onto_project_fold_preview', {
			p_user_id: USER,
			p_source_project_id: SOURCE,
			p_destination_project_id: DEST,
			p_member_additions: [ALICE, BOB]
		});
		expect(impact).toMatchObject({ confirmation_token: 'tok', counts: { onto_documents: 2 } });
	});

	it('maps RPC errors and rejects an unusable preview', async () => {
		const blocked = clients({ rpc: { error: { message: 'project_fold_access_denied' } } });
		await expect(
			previewProjectFold({
				session: blocked.session,
				admin: blocked.admin,
				userId: USER,
				sourceProjectId: SOURCE,
				destinationProjectId: DEST
			})
		).rejects.toMatchObject({ code: 'access_denied' });
		const junk = clients({ rpc: { data: { confirmation_token: 'x' } } });
		await expect(
			previewProjectFold({
				session: junk.session,
				admin: junk.admin,
				userId: USER,
				sourceProjectId: SOURCE,
				destinationProjectId: DEST
			})
		).rejects.toMatchObject({ code: 'invalid_response' });
	});

	it('applies with the fold id and token and parses the receipt', async () => {
		const c = clients({
			rpc: {
				data: {
					status: 'folded',
					fold_id: FOLD,
					source_project_id: SOURCE,
					destination_project_id: DEST,
					folder_document_id: id(9),
					members_added: [{ actor_id: ALICE, member_id: id(10) }],
					replayed: true
				}
			}
		});
		const receipt = await applyProjectFold({
			session: c.session,
			admin: c.admin,
			userId: USER,
			sourceProjectId: SOURCE,
			destinationProjectId: DEST,
			confirmationToken: 'tok',
			foldId: FOLD,
			memberAdditions: [ALICE]
		});
		expect(c.adminRpc).toHaveBeenCalledWith('onto_project_fold_apply', {
			p_user_id: USER,
			p_source_project_id: SOURCE,
			p_destination_project_id: DEST,
			p_confirmation_token: 'tok',
			p_fold_id: FOLD,
			p_member_additions: [ALICE]
		});
		expect(receipt).toEqual({
			fold_id: FOLD,
			source_project_id: SOURCE,
			destination_project_id: DEST,
			folder_document_id: id(9),
			members_added: [ALICE],
			replayed: true,
			unfolded_at: null
		});
	});
});

describe('unfold', () => {
	function withManifest(manifest: Record<string, unknown> | null, rpcData?: unknown) {
		const c = clients({ rpc: { data: rpcData } });
		const query: any = {
			select: () => query,
			eq: () => query,
			maybeSingle: async () => ({ data: manifest, error: null })
		};
		c.admin.from.mockReturnValue(query);
		return c;
	}

	it('answers 404 when this user has no such fold', async () => {
		const c = withManifest(null);
		await expect(
			previewProjectUnfold({ session: c.session, admin: c.admin, userId: USER, foldId: FOLD })
		).rejects.toMatchObject({ code: 'unfold_not_found', status: 404 });
		expect(c.admin.from).toHaveBeenCalledWith('onto_project_fold_manifests');
		expect(c.adminRpc).not.toHaveBeenCalled();
	});

	it('checks admin on both manifest projects, then applies the unfold', async () => {
		const c = withManifest(
			{ id: FOLD, user_id: USER, source_project_id: SOURCE, destination_project_id: DEST },
			{
				status: 'unfolded',
				fold_id: FOLD,
				moved_back: { onto_documents: 2, assets_and_links: { assets: 1, links: 1 } },
				staying: [{ id: id(20) }],
				folder_removed: true,
				members_added_by_fold_stay: [],
				parent_restored: false,
				replayed: false
			}
		);
		const receipt = await applyProjectUnfold({
			session: c.session,
			admin: c.admin,
			userId: USER,
			foldId: FOLD,
			confirmationToken: 'utok'
		});
		expect(c.sessionRpc).toHaveBeenCalledTimes(2);
		expect(c.adminRpc).toHaveBeenCalledWith('onto_project_unfold_apply', {
			p_user_id: USER,
			p_fold_id: FOLD,
			p_confirmation_token: 'utok'
		});
		expect(receipt).toMatchObject({
			fold_id: FOLD,
			moved_back: 4,
			staying: 1,
			folder_removed: true
		});
	});

	it('sums nested moved counts', () => {
		expect(
			parseProjectUnfoldReceipt({ moved_back: { a: 1, b: { c: 2 } } }, FOLD).moved_back
		).toBe(3);
	});
});
