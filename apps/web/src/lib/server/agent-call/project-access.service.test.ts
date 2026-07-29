// apps/web/src/lib/server/agent-call/project-access.service.test.ts
import { describe, expect, it } from 'vitest';
import { computeEffectiveAgentProjectScope } from './project-access.service';

const projects = [
	{
		id: 'owned-standard',
		is_shared: false,
		access_level: 'admin' as const,
		external_agent_access: 'standard' as const
	},
	{
		id: 'owned-restricted',
		is_shared: false,
		access_level: 'admin' as const,
		external_agent_access: 'restricted' as const
	},
	{
		id: 'shared-standard',
		is_shared: true,
		access_level: 'write' as const,
		external_agent_access: 'standard' as const
	},
	{
		id: 'shared-readonly',
		is_shared: true,
		access_level: 'read' as const,
		external_agent_access: 'standard' as const
	}
];

describe('external agent project access policy', () => {
	it('automatically includes current owned standard projects', () => {
		const scope = computeEffectiveAgentProjectScope({
			scope: { mode: 'read_write' },
			projectScopeMode: 'all_unrestricted',
			projects,
			permissions: []
		});

		expect(scope.project_ids).toEqual(['owned-standard']);
		expect(scope.write_project_ids).toEqual(['owned-standard']);
	});

	it('requires explicit permission for restricted and shared projects', () => {
		const scope = computeEffectiveAgentProjectScope({
			scope: { mode: 'read_write' },
			projectScopeMode: 'all_unrestricted',
			projects,
			permissions: [
				{ project_id: 'owned-restricted', access_mode: 'read_only' },
				{ project_id: 'shared-standard', access_mode: 'read_write' },
				{ project_id: 'shared-readonly', access_mode: 'read_write' }
			]
		});

		expect(scope.project_ids).toEqual([
			'owned-standard',
			'owned-restricted',
			'shared-standard',
			'shared-readonly'
		]);
		expect(scope.write_project_ids).toEqual(['owned-standard', 'shared-standard']);
	});

	it('keeps selected connectors fixed and does not authorize stale legacy mirror entries', () => {
		const scope = computeEffectiveAgentProjectScope({
			scope: { mode: 'read_only', project_ids: ['owned-restricted'] },
			projectScopeMode: 'selected',
			projects,
			permissions: [{ project_id: 'shared-standard', access_mode: 'read_only' }]
		});

		expect(scope.project_ids).toEqual(['shared-standard']);
		expect(scope.write_project_ids).toEqual([]);
	});
});
