// apps/web/src/routes/api/agent/v2/capabilities/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
	AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED: 'true',
	AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED: 'false',
	AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS: 'd1000000-0000-4000-8000-000000000001'
}));
vi.mock('$env/dynamic/private', () => ({ env }));
import { GET } from './+server';

function event(userId: string | null) {
	return {
		locals: { safeGetSession: async () => ({ user: userId ? { id: userId } : null }) }
	} as never;
}

describe('chat capabilities', () => {
	beforeEach(() => {
		env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED = 'true';
		env.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED = 'false';
	});
	it('requires authentication and never caches the account-specific response', async () => {
		const response = await GET(event(null));
		expect(response.status).toBe(401);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});
	it('offers reviews only to the enabled cohort without exposing the allowlist', async () => {
		const response = await GET(event(env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS));
		expect((await response.json()).data).toEqual({
			projectReview: true,
			documentOrganization: false
		});
		const other = await GET(event('d1000000-0000-4000-8000-000000000002'));
		expect((await other.json()).data).toEqual({
			projectReview: false,
			documentOrganization: false
		});
	});
	it('keeps reviews hidden while the admission switch is off', async () => {
		env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED = 'false';
		const response = await GET(event(env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS));
		expect((await response.json()).data).toEqual({
			projectReview: false,
			documentOrganization: false
		});
	});
});

it('exposes document organization only when its flag and base gate are both enabled', async () => {
	env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED = 'true';
	env.AGENTIC_CHAT_SPECIALIST_WORKFLOWS_ENABLED = 'true';
	const response = await GET(event(env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS));
	expect((await response.json()).data).toEqual({
		projectReview: true,
		documentOrganization: true
	});
	env.AGENTIC_CHAT_WORKFLOW_V4_ADMISSION_ENABLED = 'false';
	const disabled = await GET(event(env.AGENTIC_CHAT_WORKFLOW_PROTOTYPE_USER_IDS));
	expect((await disabled.json()).data.documentOrganization).toBe(false);
});
