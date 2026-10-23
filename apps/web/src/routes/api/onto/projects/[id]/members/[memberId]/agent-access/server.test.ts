// apps/web/src/routes/api/onto/projects/[id]/members/[memberId]/agent-access/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn().mockResolvedValue('actor-owner')
}));

vi.mock('../../../../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { PATCH } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '55555555-5555-4555-8555-555555555555';

function createEvent(body: unknown, params = { id: PROJECT_ID, memberId: MEMBER_ID }) {
	const insert = vi.fn().mockResolvedValue({ error: null });
	const event = {
		params,
		request: { json: vi.fn().mockResolvedValue(body) },
		locals: {
			supabase: { rpc: vi.fn(), from: vi.fn(() => ({ insert })) },
			safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'owner-1' } })
		}
	} as unknown as RequestEvent;
	return { event, insert };
}

const rpcOf = (event: RequestEvent) => (event.locals.supabase as any).rpc;

describe('PATCH /api/onto/projects/[id]/members/[memberId]/agent-access', () => {
	it('validates ids and the setting', async () => {
		const badProject = createEvent({ agent_access: 'read' }, { id: 'x', memberId: MEMBER_ID });
		expect((await PATCH(badProject.event)).status).toBe(400);
		const badValue = createEvent({ agent_access: 'admin' });
		expect((await PATCH(badValue.event)).status).toBe(400);
		expect(rpcOf(badValue.event)).not.toHaveBeenCalled();
	});

	it('sets the agent setting through the owner-only RPC and logs it', async () => {
		const { event, insert } = createEvent({ agent_access: 'off' });
		rpcOf(event).mockResolvedValue({
			data: { member_id: MEMBER_ID, agent_access: 'off' },
			error: null
		});

		const response = await PATCH(event);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(rpcOf(event)).toHaveBeenCalledWith('set_project_member_agent_access', {
			p_project_id: PROJECT_ID,
			p_member_id: MEMBER_ID,
			p_agent_access: 'off'
		});
		expect(payload.data).toEqual({ member_id: MEMBER_ID, agent_access: 'off' });
		expect(insert.mock.calls[0]?.[0]?.after_data).toEqual({
			event: 'member_agent_access_updated',
			member_id: MEMBER_ID,
			agent_access: 'off'
		});
	});

	it('maps the RPC refusals', async () => {
		const notOwner = createEvent({ agent_access: 'read' });
		rpcOf(notOwner.event).mockResolvedValue({
			data: null,
			error: { code: '42501', message: 'Only the project owner can change this' }
		});
		const forbidden = await PATCH(notOwner.event);
		expect(forbidden.status).toBe(403);
		expect((await forbidden.json()).error).toBe('Only the project owner can change this');

		const viewerWrite = createEvent({ agent_access: 'write' });
		rpcOf(viewerWrite.event).mockResolvedValue({
			data: null,
			error: { code: '22023', message: 'Agents can only write where their person can edit' }
		});
		expect((await PATCH(viewerWrite.event)).status).toBe(400);
	});
});
