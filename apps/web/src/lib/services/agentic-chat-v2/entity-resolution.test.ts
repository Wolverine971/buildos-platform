// apps/web/src/lib/services/agentic-chat-v2/entity-resolution.test.ts
import { describe, expect, it } from 'vitest';
import type { LastTurnContext } from '@buildos/shared-types';
import { buildEntityResolutionHint } from './entity-resolution';

describe('entity-resolution helpers', () => {
	it('formats a compact recent referents hint', () => {
		const lastTurnContext: LastTurnContext = {
			summary: 'Marked two Cadre tasks done.',
			context_type: 'global',
			data_accessed: ['update_onto_task', 'tool_schema'],
			timestamp: '2026-04-09T22:00:00.000Z',
			entities: {
				projects: [
					{
						id: '153dea7b-1fc7-4f68-b014-cd2b00c572ec',
						name: 'The Cadre- DJ Internal'
					}
				],
				tasks: [
					{
						id: '881823a4-e74e-48d2-bf3e-b77db7e47b5f',
						name: 'Draft Announcement Email for NRL Partnership'
					},
					{
						id: '3cdf0778-5301-43da-a899-a67561b4fa73',
						name: 'Invite Phil to BuildOS'
					}
				]
			}
		};

		const hint = buildEntityResolutionHint(lastTurnContext);

		expect(hint).toContain('Recent exact referents from the prior turn:');
		expect(hint).toContain(
			'- task: Draft Announcement Email for NRL Partnership (881823a4-e74e-48d2-bf3e-b77db7e47b5f)'
		);
		expect(hint).toContain(
			'- task: Invite Phil to BuildOS (3cdf0778-5301-43da-a899-a67561b4fa73)'
		);
		expect(hint).toContain(
			'If the user clearly refers to one of these entities, reuse its exact id instead of searching again.'
		);
	});

	it('filters placeholder and non-UUID ids from recent referents', () => {
		const lastTurnContext: LastTurnContext = {
			summary: 'Retried a plan update.',
			context_type: 'project',
			data_accessed: ['tool_schema', 'update_onto_plan'],
			timestamp: '2026-04-09T23:31:16.566Z',
			entities: {
				projects: [{ id: '<project_id_uuid>', name: 'Placeholder Project' }],
				plans: [
					{ id: '<plan_id_uuid>', name: 'Placeholder Plan' },
					{
						id: 'debd6c62-8701-4f2a-972d-9036d1bc7c2f',
						name: 'Maryland Student Walkout Coverage'
					}
				],
				tasks: [{ id: 'task_123', name: 'Legacy style id should be dropped' }]
			}
		};

		const hint = buildEntityResolutionHint(lastTurnContext);

		expect(hint).toContain(
			'Maryland Student Walkout Coverage (debd6c62-8701-4f2a-972d-9036d1bc7c2f)'
		);
		expect(hint).not.toContain('<project_id_uuid>');
		expect(hint).not.toContain('<plan_id_uuid>');
		expect(hint).not.toContain('task_123');
	});
});
