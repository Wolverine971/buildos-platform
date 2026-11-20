// apps/worker/tests/projectAccess.test.ts
//
// A chat session's project scope is written by the signed-in user, so a processor running with
// the service role only follows it when the session's owner can reach that project.
import { describe, expect, it, vi } from 'vitest';
import { accessibleSessionProjectId } from '../src/lib/projectAccess';

function client(options: { actorId: string | null; hasAccess: boolean }) {
	const rpc = vi.fn(async () => ({ data: options.hasAccess, error: null }));
	const from = vi.fn(() => ({
		select: () => ({
			eq: () => ({
				maybeSingle: async () => ({
					data: options.actorId ? { id: options.actorId } : null,
					error: null
				})
			})
		})
	}));
	return { db: { from, rpc } as any, rpc, from };
}

const PROJECT_SESSION = { context_type: 'project', entity_id: 'project-1' };

describe('accessibleSessionProjectId', () => {
	it('returns the project when the owner has the required access', async () => {
		const { db, rpc } = client({ actorId: 'actor-1', hasAccess: true });
		expect(await accessibleSessionProjectId(db, 'user-1', PROJECT_SESSION, 'write')).toBe(
			'project-1'
		);
		expect(rpc).toHaveBeenCalledWith('actor_has_project_member_access', {
			p_actor_id: 'actor-1',
			p_project_id: 'project-1',
			p_required_access: 'write'
		});
	});

	it('returns null for a project the owner cannot reach', async () => {
		const { db } = client({ actorId: 'actor-1', hasAccess: false });
		expect(await accessibleSessionProjectId(db, 'user-1', PROJECT_SESSION)).toBeNull();
	});

	it('returns null when the owner has no actor', async () => {
		const { db, rpc } = client({ actorId: null, hasAccess: true });
		expect(await accessibleSessionProjectId(db, 'user-1', PROJECT_SESSION)).toBeNull();
		expect(rpc).not.toHaveBeenCalled();
	});

	it.each([
		['a workspace chat', { context_type: 'global', entity_id: 'project-1' }],
		['a project chat with no id', { context_type: 'project', entity_id: null }],
		['no session', null]
	])('asks nothing for %s', async (_label, session) => {
		const { db, from, rpc } = client({ actorId: 'actor-1', hasAccess: true });
		expect(await accessibleSessionProjectId(db, 'user-1', session)).toBeNull();
		expect(from).not.toHaveBeenCalled();
		expect(rpc).not.toHaveBeenCalled();
	});
});
