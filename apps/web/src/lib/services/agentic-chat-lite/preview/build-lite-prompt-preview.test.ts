// apps/web/src/lib/services/agentic-chat-lite/preview/build-lite-prompt-preview.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadFastChatPromptContextMock, normalizeFastContextTypeMock } = vi.hoisted(() => ({
	loadFastChatPromptContextMock: vi.fn(),
	normalizeFastContextTypeMock: vi.fn()
}));

vi.mock('$lib/services/agentic-chat-v2', () => ({
	loadFastChatPromptContext: loadFastChatPromptContextMock,
	normalizeFastContextType: normalizeFastContextTypeMock
}));

import { getGatewaySurfaceForContextType } from '@buildos/agentic-chat-runtime/catalog';
import { buildLitePromptPreview, LitePromptPreviewInputError } from './build-lite-prompt-preview';

describe('buildLitePromptPreview', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		normalizeFastContextTypeMock.mockImplementation((input?: string) =>
			!input || input === 'general' ? 'global' : input
		);
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

	it('builds a global lite prompt preview with the consolidated section order', async () => {
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
		// 2026-09-02 (turn-executor audit Finding 9): the prose tool list is gone;
		// the tools array is the source of truth, so no tool_surface_dynamic
		// section renders when discovery tools are mounted.
		expect(preview.lite.sections.map((section) => section.id)).toEqual([
			'identity_mission',
			'capabilities_skills_tools',
			'operating_strategy',
			'final_response_contract',
			'safety_data_rules',
			'focus_purpose',
			'location_loaded_context'
		]);
		// Stage S7 (2026-09-04): timeline_recent_activity and
		// context_inventory_retrieval fold into location_loaded_context.
		expect(preview.lite.system_prompt).not.toContain('## Timeline and Recent Activity');
		expect(preview.lite.system_prompt).not.toContain('## Loaded Data and Retrieval Boundaries');
		// WP-7 (2026-07-10): the variant lives in envelope metadata, not model input.
		expect(preview.lite.system_prompt).not.toContain('Prompt variant:');
		expect(preview.lite.system_prompt).toContain('# BuildOS Agentic Chat');
		expect(preview.lite.context_inventory.dataSummary.arrayCounts.projects).toBe(1);
		// 2026-09-04: the preview now renders the real stable global surface
		// instead of a stubbed two-tool fixture.
		expect(preview.lite.tool_surface_report.toolCount).toBe(
			getGatewaySurfaceForContextType('global').length
		);
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
