// apps/web/src/lib/server/fsm/actions/__tests__/email-admin.test.ts
import { describe, expect, it } from 'vitest';
import { defaultAdminBody } from '$lib/server/fsm/actions/email-admin';

describe('email_admin action helpers', () => {
	it('renders a default admin body with context', () => {
		const body = defaultAdminBody({
			entity_name: 'Launch Plan',
			entity_type: 'plan.launch',
			entity_state: 'ready',
			project_id: 'project-123',
			triggered_by_actor_id: 'actor-789'
		});

		expect(body).toContain('Launch Plan');
		expect(body).toContain('plan.launch');
		expect(body).toContain('ready');
		expect(body).toContain('actor-789');
		expect(body).toContain('project-123');
	});

	it('falls back to defaults when context is missing', () => {
		const body = defaultAdminBody({});
		expect(body).toContain('Ontology entity');
		expect(body).toContain('updated');
		expect(body).toContain('unknown');
	});
});
