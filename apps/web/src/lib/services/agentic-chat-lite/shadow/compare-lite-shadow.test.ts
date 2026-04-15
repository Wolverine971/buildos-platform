// apps/web/src/lib/services/agentic-chat-lite/shadow/compare-lite-shadow.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	buildLiteShadowComparison,
	formatLiteShadowComparisonReport,
	type LiteShadowPromptSnapshotInput
} from './compare-lite-shadow';

function toolDefinition(name: string) {
	return {
		type: 'function',
		function: {
			name,
			description: `${name} test tool`,
			parameters: {
				type: 'object',
				properties: {}
			}
		}
	};
}

function baseSnapshot(
	overrides: Partial<LiteShadowPromptSnapshotInput> = {}
): LiteShadowPromptSnapshotInput {
	const systemPrompt = [
		'<instructions>',
		'# BuildOS Agent System Prompt',
		'Use the current v2 prompt.',
		'</instructions>',
		'<context>',
		'{"projects":[]}',
		'</context>'
	].join('\n');

	return {
		id: 'snapshot-1',
		turn_run_id: 'turn-1',
		snapshot_version: 'fastchat_prompt_v1',
		system_prompt: systemPrompt,
		model_messages: [
			{ role: 'system', content: systemPrompt },
			{ role: 'assistant', content: 'What should I look at?' },
			{ role: 'user', content: 'What changed this week?' }
		],
		tool_definitions: [toolDefinition('skill_load'), toolDefinition('legacy_direct_tool')],
		prompt_sections: {
			context_type: 'global',
			entity_id: null,
			project_id: null,
			project_name: null,
			data_keys: ['context_meta', 'projects'],
			cost_breakdown: {
				sections: {
					instructions: { chars: 80, est_tokens: 20 },
					context_payload: { chars: 200, est_tokens: 50 },
					tools_text_block: { chars: 40, est_tokens: 10 }
				}
			}
		},
		context_payload: {
			projects: [
				{
					project: {
						id: 'project-1',
						name: 'Launch Alpha',
						state_key: 'active',
						next_step_short: 'Ship beta',
						updated_at: '2026-04-14T14:00:00Z'
					},
					recent_activity: [
						{
							entity_type: 'task',
							entity_id: 'task-1',
							title: 'Finish onboarding',
							action: 'updated',
							updated_at: '2026-04-14T13:45:00Z'
						}
					]
				}
			],
			context_meta: {
				generated_at: '2026-04-14T19:00:00Z'
			}
		},
		request_payload: {
			context_type: 'global'
		},
		created_at: '2026-04-14T19:00:00Z',
		...overrides
	};
}

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('buildLiteShadowComparison', () => {
	it('compares a global v2 snapshot with a lite prompt and reports deltas', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const comparison = buildLiteShadowComparison({
			promptSnapshot: baseSnapshot()
		});

		expect(comparison.prompt_variant).toBe('lite_seed_v1');
		expect(comparison.snapshot).toMatchObject({
			id: 'snapshot-1',
			turn_run_id: 'turn-1',
			snapshot_version: 'fastchat_prompt_v1'
		});
		expect(comparison.context.context_type).toBe('global');
		expect(comparison.lite.sections.map((section) => section.id)).toContain('focus_purpose');
		expect(comparison.v2.section_costs.map((section) => section.id)).toContain(
			'context_payload'
		);
		expect(comparison.tool_names.kept).toContain('skill_load');
		expect(comparison.tool_names.removed_from_lite).toContain('legacy_direct_tool');
		expect(comparison.tool_names.added_in_lite).toContain('get_workspace_overview');
		expect(comparison.context_key_comparison.kept).toEqual(['context_meta', 'projects']);
		expect(comparison.deltas.provider_payload_chars).not.toBe(0);

		const report = formatLiteShadowComparisonReport(comparison);
		expect(report).toContain('Lite Prompt Shadow Comparison');
		expect(report).toContain('Prompt variant: lite_seed_v1');
		expect(report).toContain('Size deltas (lite - v2):');
		expect(report).toContain('legacy_direct_tool');
	});

	it('preserves project and focused entity scope from prompt sections', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const comparison = buildLiteShadowComparison({
			promptSnapshot: baseSnapshot({
				id: 'snapshot-focused',
				prompt_sections: {
					context_type: 'project',
					entity_id: 'project-1',
					project_id: 'project-1',
					project_name: 'Launch Alpha',
					focus_entity_type: 'task',
					focus_entity_id: 'task-1',
					focus_entity_name: 'Draft proposal',
					data_keys: ['project', 'tasks']
				},
				context_payload: {
					project: {
						id: 'project-1',
						name: 'Launch Alpha',
						state_key: 'active',
						updated_at: '2026-04-14T12:00:00Z'
					},
					tasks: [
						{
							id: 'task-1',
							title: 'Draft proposal',
							due_at: '2026-04-18T16:00:00Z'
						}
					]
				},
				request_payload: {
					context_type: 'project',
					entity_id: 'project-1'
				}
			})
		});

		expect(comparison.context).toMatchObject({
			context_type: 'project',
			entity_id: 'project-1',
			project_id: 'project-1',
			project_name: 'Launch Alpha',
			focus_entity_type: 'task',
			focus_entity_id: 'task-1',
			focus_entity_name: 'Draft proposal'
		});
		const focusSection = comparison.lite.sections.find(
			(section) => section.id === 'focus_purpose'
		);
		expect(focusSection?.slots).toMatchObject({
			projectId: 'project-1',
			focusEntityType: 'task',
			focusEntityId: 'task-1',
			focusEntityName: 'Draft proposal'
		});
		expect(comparison.lite.context_inventory.dataSummary.arrayCounts.tasks).toBe(1);
	});

	it('reports missing context payload as a gap while still rendering lite', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const comparison = buildLiteShadowComparison({
			promptSnapshot: baseSnapshot({
				id: 'snapshot-missing-context',
				context_payload: null,
				prompt_sections: {
					context_type: 'project',
					entity_id: 'project-1',
					project_id: 'project-1',
					project_name: 'Launch Alpha',
					data_keys: ['project', 'tasks']
				}
			})
		});

		expect(comparison.gaps).toContain(
			'snapshot.context_payload is missing; lite rendered from scope metadata only.'
		);
		expect(comparison.lite.system_prompt).toContain('Prompt variant: lite_seed_v1');
		expect(comparison.lite.context_inventory.dataSummary.hasData).toBe(false);
		expect(comparison.context_key_comparison.missing_from_lite).toEqual(['project', 'tasks']);
	});
});
