// apps/web/src/lib/services/agentic-chat-lite/preview/build-lite-prompt-preview.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	buildMasterPromptMock,
	loadFastChatPromptContextMock,
	normalizeFastContextTypeMock,
	selectFastChatToolsMock
} = vi.hoisted(() => ({
	buildMasterPromptMock: vi.fn(),
	loadFastChatPromptContextMock: vi.fn(),
	normalizeFastContextTypeMock: vi.fn(),
	selectFastChatToolsMock: vi.fn()
}));

vi.mock('$lib/services/agentic-chat-v2', () => ({
	buildMasterPrompt: buildMasterPromptMock,
	loadFastChatPromptContext: loadFastChatPromptContextMock,
	normalizeFastContextType: normalizeFastContextTypeMock,
	selectFastChatTools: selectFastChatToolsMock
}));

import { buildLitePromptPreview, LitePromptPreviewInputError } from './build-lite-prompt-preview';

const toolFixtures = [
	{
		type: 'function',
		function: {
			name: 'skill_load',
			description: 'Load skill guidance.',
			parameters: {
				type: 'object',
				properties: {
					skill: { type: 'string' }
				},
				required: ['skill']
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_project_overview',
			description: 'Fetch a compact project overview.',
			parameters: {
				type: 'object',
				properties: {
					project_id: { type: 'string' }
				}
			}
		}
	}
] as any;

describe('buildLitePromptPreview', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		normalizeFastContextTypeMock.mockImplementation((input?: string) =>
			!input || input === 'general' ? 'global' : input
		);
		selectFastChatToolsMock.mockReturnValue(toolFixtures);
		buildMasterPromptMock.mockReturnValue('<instructions>current v2</instructions>');
		loadFastChatPromptContextMock.mockResolvedValue({
			contextType: 'global',
			entityId: null,
			projectId: null,
			projectName: null,
			data: {
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
			}
		});
	});

	it('builds a global lite prompt preview without current v2 by default', async () => {
		const preview = await buildLitePromptPreview({
			supabase: {} as any,
			userId: 'admin-1',
			input: {
				context_type: 'global',
				sample_message: 'What changed this week?',
				now: '2026-04-14T15:00:00-04:00',
				timezone: 'America/New_York'
			}
		});

		expect(preview.prompt_variant).toBe('lite_seed_v1');
		expect(preview.current_v2).toBeUndefined();
		expect(preview.lite.sections.map((section) => section.id)).toEqual([
			'identity_mission',
			'operating_strategy',
			'safety_data_rules',
			'capabilities_skills_tools',
			'focus_purpose',
			'location_loaded_context',
			'timeline_recent_activity',
			'context_inventory_retrieval',
			'tool_surface_dynamic'
		]);
		expect(preview.lite.system_prompt).toContain('Prompt variant: lite_seed_v1');
		expect(preview.lite.context_inventory.dataSummary.arrayCounts.projects).toBe(1);
		expect(preview.lite.tool_surface_report.toolCount).toBe(2);
		expect(preview.lite.cost_breakdown.provider_payload_estimate.chars).toBeGreaterThan(
			preview.lite.cost_breakdown.system_prompt.chars
		);
		expect(loadFastChatPromptContextMock).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'admin-1',
				contextType: 'global',
				entityId: null,
				projectFocus: null
			})
		);
		expect(buildMasterPromptMock).not.toHaveBeenCalled();
	});

	it('normalizes project focused entity input into the v2 context loader shape', async () => {
		loadFastChatPromptContextMock.mockResolvedValueOnce({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			projectName: 'Launch Alpha',
			focusEntityType: 'task',
			focusEntityId: 'task-1',
			focusEntityName: 'Draft proposal',
			data: {
				project: {
					id: 'project-1',
					name: 'Launch Alpha',
					state_key: 'active',
					updated_at: '2026-04-14T12:00:00Z'
				},
				tasks: [{ id: 'task-1', title: 'Draft proposal', due_at: '2026-04-18T16:00:00Z' }]
			}
		});

		const preview = await buildLitePromptPreview({
			supabase: {} as any,
			userId: 'admin-1',
			input: {
				context_type: 'project',
				entity_id: 'project-1',
				project_focus: {
					projectId: 'project-1',
					projectName: 'Launch Alpha',
					focusEntityType: 'task',
					focusEntityId: 'task-1',
					focusEntityName: 'Draft proposal'
				}
			}
		});

		expect(loadFastChatPromptContextMock).toHaveBeenCalledWith(
			expect.objectContaining({
				contextType: 'project',
				entityId: 'project-1',
				projectFocus: {
					projectId: 'project-1',
					projectName: 'Launch Alpha',
					focusType: 'task',
					focusEntityId: 'task-1',
					focusEntityName: 'Draft proposal'
				}
			})
		);
		const focusSection = preview.lite.sections.find(
			(section) => section.id === 'focus_purpose'
		);
		expect(focusSection?.slots).toMatchObject({
			projectId: 'project-1',
			focusEntityType: 'task',
			focusEntityId: 'task-1'
		});
		expect(preview.lite.system_prompt).toContain('Focus entity: task Draft proposal');
	});

	it('includes the current v2 prompt only when requested', async () => {
		const preview = await buildLitePromptPreview({
			supabase: {} as any,
			userId: 'admin-1',
			input: {
				context_type: 'global',
				sample_message: 'Compare these prompts.',
				include_current_v2: true
			}
		});

		expect(buildMasterPromptMock).toHaveBeenCalledTimes(1);
		expect(preview.current_v2?.system_prompt).toBe('<instructions>current v2</instructions>');
		expect(preview.current_v2?.cost_breakdown.system_prompt.chars).toBeGreaterThan(0);
	});

	it('rejects unsupported context and focus types before loading context', async () => {
		normalizeFastContextTypeMock.mockReturnValueOnce('surprise_context');
		await expect(
			buildLitePromptPreview({
				supabase: {} as any,
				userId: 'admin-1',
				input: { context_type: 'surprise_context' }
			})
		).rejects.toBeInstanceOf(LitePromptPreviewInputError);

		await expect(
			buildLitePromptPreview({
				supabase: {} as any,
				userId: 'admin-1',
				input: {
					context_type: 'project',
					entity_id: 'project-1',
					project_focus: {
						projectId: 'project-1',
						focusEntityType: 'not-real'
					}
				}
			})
		).rejects.toBeInstanceOf(LitePromptPreviewInputError);
	});
});
