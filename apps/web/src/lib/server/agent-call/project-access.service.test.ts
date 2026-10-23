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
		external_agent_access: 'standard' as const,
		agent_access: 'write' as const
	},
	{
		id: 'shared-readonly',
		is_shared: true,
		access_level: 'read' as const,
		external_agent_access: 'standard' as const,
		agent_access: 'read' as const
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

	describe("the owner's setting for a member's agents", () => {
		const shared = (agent_access: 'off' | 'read' | 'write' | null | undefined) => [
			{
				id: 'theirs',
				is_shared: true,
				access_level: 'write' as const,
				external_agent_access: 'standard' as const,
				agent_access
			}
		];
		const grant = [{ project_id: 'theirs', access_mode: 'read_write' as const }];

		it("off hides the project even with the member's own grant", () => {
			const scope = computeEffectiveAgentProjectScope({
				scope: { mode: 'read_write' },
				projectScopeMode: 'all_unrestricted',
				projects: shared('off'),
				permissions: grant
			});
			expect(scope.project_ids).toEqual([]);
			expect(scope.write_project_ids).toEqual([]);
		});

		it('a missing setting counts as off', () => {
			for (const value of [null, undefined]) {
				const scope = computeEffectiveAgentProjectScope({
					scope: { mode: 'read_write' },
					projectScopeMode: 'all_unrestricted',
					projects: shared(value),
					permissions: grant
				});
				expect(scope.project_ids).toEqual([]);
			}
		});

		it('read lets the agent read but never write, even for an editor', () => {
			const scope = computeEffectiveAgentProjectScope({
				scope: { mode: 'read_write' },
				projectScopeMode: 'all_unrestricted',
				projects: shared('read'),
				permissions: grant
			});
			expect(scope.project_ids).toEqual(['theirs']);
			expect(scope.write_project_ids).toEqual([]);
		});

		it("write still needs the member's own grant to this connector", () => {
			const scope = computeEffectiveAgentProjectScope({
				scope: { mode: 'read_write' },
				projectScopeMode: 'all_unrestricted',
				projects: shared('write'),
				permissions: []
			});
			expect(scope.project_ids).toEqual([]);
		});

		it('ignores the setting on projects the user owns', () => {
			const scope = computeEffectiveAgentProjectScope({
				scope: { mode: 'read_write' },
				projectScopeMode: 'all_unrestricted',
				projects: [
					{
						id: 'mine',
						is_shared: false,
						access_level: 'admin' as const,
						external_agent_access: 'standard' as const,
						agent_access: 'off' as const
					}
				],
				permissions: []
			});
			expect(scope.write_project_ids).toEqual(['mine']);
		});
	});
});
