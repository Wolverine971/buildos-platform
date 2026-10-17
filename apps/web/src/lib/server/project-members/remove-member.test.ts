// apps/web/src/lib/server/project-members/remove-member.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-1')
}));

import { removeProjectMember } from './remove-member';

type MemberRow = Record<string, unknown> | null;

function client(options: {
	hasAccess?: boolean;
	accessError?: unknown;
	member?: MemberRow;
	removed?: MemberRow;
	removeError?: unknown;
	latest?: MemberRow;
}) {
	const reads = [options.member ?? null, options.latest ?? null];
	const logs: unknown[] = [];
	const rpc = vi.fn(async (name: string) => {
		if (name === 'current_actor_has_project_member_access')
			return { data: options.hasAccess ?? true, error: options.accessError ?? null };
		return { data: options.removed ?? null, error: options.removeError ?? null };
	});
	const from = vi.fn((table: string) => {
		if (table === 'onto_project_logs')
			return { insert: vi.fn(async (row: unknown) => (logs.push(row), { error: null })) };
		const query: any = {
			select: () => query,
			eq: () => query,
			maybeSingle: async () => ({ data: reads.shift() ?? null, error: null })
		};
		return query;
	});
	return { supabase: { rpc, from } as any, rpc, logs };
}

const LIVE = {
	id: 'member-1',
	actor_id: 'actor-2',
	role_key: 'editor',
	access: 'write',
	removed_at: null
};

describe('removeProjectMember', () => {
	it('removes a live member through the guarded RPC and logs it', async () => {
		const { supabase, rpc, logs } = client({ member: LIVE, removed: LIVE });
		const result = await removeProjectMember({
			supabase,
			userId: 'user-1',
			projectId: 'project-1',
			memberId: 'member-1'
		});
		expect(result).toEqual({
			ok: true,
			memberId: 'member-1',
			removed: { id: 'member-1', actor_id: 'actor-2', role_key: 'editor', access: 'write' }
		});
		expect(rpc).toHaveBeenCalledWith('update_project_membership_guarded', {
			p_project: 'project-1',
			p_member: 'member-1',
			p_action: 'remove'
		});
		expect(logs).toEqual([
			expect.objectContaining({
				changed_by: 'user-1',
				changed_by_actor_id: 'actor-1',
				after_data: expect.objectContaining({
					event: 'member_removed',
					actor_id: 'actor-2'
				})
			})
		]);
	});

	it('refuses without admin, for owners, and for removed members, writing nothing', async () => {
		for (const [options, reason] of [
			[{ hasAccess: false }, 'forbidden'],
			[{ member: { ...LIVE, role_key: 'owner' } }, 'owner'],
			[{ member: { ...LIVE, removed_at: '2026-10-01T00:00:00Z' } }, 'already_removed'],
			[{ member: null }, 'not_found']
		] as const) {
			const { supabase, rpc } = client(options);
			const result = await removeProjectMember({
				supabase,
				userId: 'user-1',
				projectId: 'project-1',
				memberId: 'member-1'
			});
			expect(result).toMatchObject({ ok: false, reason });
			expect(rpc).not.toHaveBeenCalledWith(
				'update_project_membership_guarded',
				expect.anything()
			);
		}
	});

	it('reports a concurrent change as a conflict and errors through onError', async () => {
		const conflict = client({ member: LIVE, removed: null, latest: LIVE });
		expect(
			await removeProjectMember({
				supabase: conflict.supabase,
				userId: 'user-1',
				projectId: 'project-1',
				memberId: 'member-1'
			})
		).toEqual({ ok: false, reason: 'conflict' });

		const onError = vi.fn();
		const failing = client({ member: LIVE, removeError: { message: 'boom' } });
		const result = await removeProjectMember({
			supabase: failing.supabase,
			userId: 'user-1',
			projectId: 'project-1',
			memberId: 'member-1',
			onError
		});
		expect(result).toMatchObject({ ok: false, reason: 'remove_failed' });
		expect(onError).toHaveBeenCalledWith({
			error: { message: 'boom' },
			operation: 'project_members_remove',
			tableName: 'onto_project_members'
		});
	});
});
