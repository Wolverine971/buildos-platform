// apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLitePhaseFrame, buildLitePromptEnvelope, LITE_PROMPT_SECTION_ORDER } from './index';

afterEach(() => {
	vi.unstubAllEnvs();
});

function extractLoadedJson(prompt: string): Record<string, unknown> {
	const match = prompt.match(/```json\n([\s\S]*?)\n```/);
	if (!match) throw new Error('Expected a JSON code fence in the lite prompt');
	return JSON.parse(match[1]) as Record<string, unknown>;
}

describe('buildLitePromptEnvelope', () => {
	it('renders the global seed as inspectable sections with canonical tool names', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');

		const envelope = buildLitePromptEnvelope({
			contextType: 'global',
			entityId: null,
			projectId: null,
			now: '2026-04-14T15:00:00-04:00',
			timezone: 'America/New_York',
			productSurface: 'global workspace chat',
			conversationPosition: 'beginning of chat thread',
			data: {
				projects: [
					{
						project: {
							id: 'project-1',
							name: 'Launch Alpha',
							state_key: 'active',
							description: null,
							start_at: null,
							end_at: null,
							next_step_short: 'Ship the beta build',
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
						],
						goals: [],
						milestones: [],
						plans: []
					}
				],
				context_meta: {
					generated_at: '2026-04-14T19:00:00Z',
					source: 'rpc',
					project_count: 3,
					projects_returned: 1,
					project_limit: 10,
					includes_doc_structure: false,
					recent_activity_window_days: 7,
					recent_activity_max_lookback_days: 30,
					entity_limits_per_project: {
						recent_activity: 5,
						goals: 3,
						milestones: 3,
						plans: 3
					}
				}
			}
		});

		expect(envelope.promptVariant).toBe('lite_seed_v1');
		expect(envelope.sections.map((section) => section.id)).toEqual(LITE_PROMPT_SECTION_ORDER);
		expect(envelope.systemPrompt).toContain('# BuildOS Lite Agentic Chat Prompt');
		expect(envelope.systemPrompt).toContain('Product surface: global workspace chat');
		expect(envelope.systemPrompt).toContain('Conversation position: beginning of chat thread');
		expect(envelope.systemPrompt).toContain('Workspace and project overviews');
		expect(envelope.systemPrompt).toContain(
			'Tool schemas are supplied through model tool definitions'
		);
		expect(envelope.systemPrompt).not.toContain('"parameters"');
		expect(envelope.toolsSummary.discoveryTools).toEqual([
			'skill_load',
			'tool_search',
			'tool_schema'
		]);
		expect(envelope.toolsSummary.directTools).toContain('get_workspace_overview');
		expect(envelope.toolsSummary.directTools).not.toContain('resolve_libri_resource');
		expect(envelope.contextInventory.dataSummary.arrayCounts.projects).toBe(1);
		expect(envelope.contextInventory.timeline.facts).toContain(
			'Recent activity items loaded: 1.'
		);
	});

	it('renders project entity focus without hiding the focused context slots', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			projectName: 'Launch Alpha',
			focusEntityType: 'task',
			focusEntityId: 'task-1',
			focusEntityName: 'Draft proposal',
			now: '2026-04-14T19:00:00Z',
			data: {
				project: {
					id: 'project-1',
					name: 'Launch Alpha',
					state_key: 'active',
					description: null,
					start_at: null,
					end_at: null,
					next_step_short: 'Draft the proposal',
					updated_at: '2026-04-14T12:00:00Z'
				},
				doc_structure: {
					version: 1,
					root: []
				},
				goals: [],
				milestones: [],
				plans: [],
				tasks: [
					{
						id: 'task-1',
						title: 'Draft proposal',
						description: null,
						state_key: 'active',
						priority: 2,
						start_at: null,
						due_at: '2026-04-18T16:00:00Z',
						completed_at: null,
						updated_at: '2026-04-14T12:00:00Z'
					}
				],
				documents: [
					{
						id: 'doc-linked',
						title: 'Linked doc',
						state_key: 'active',
						created_at: '2026-04-10T00:00:00Z',
						updated_at: '2026-04-11T00:00:00Z',
						in_doc_structure: true,
						is_unlinked: false
					},
					{
						id: 'doc-unlinked',
						title: 'Unlinked doc',
						state_key: 'active',
						created_at: '2026-04-12T00:00:00Z',
						updated_at: '2026-04-13T00:00:00Z',
						in_doc_structure: false,
						is_unlinked: true
					}
				],
				events: [],
				events_window: {
					timezone: 'UTC',
					now_at: '2026-04-14T19:00:00Z',
					start_at: '2026-04-07T19:00:00Z',
					end_at: '2026-04-28T19:00:00Z',
					past_days: 7,
					future_days: 14
				},
				members: [],
				context_meta: {
					generated_at: '2026-04-14T19:00:00Z',
					source: 'rpc',
					entity_scopes: {}
				},
				focus_entity_type: 'task',
				focus_entity_id: 'task-1',
				focus_entity_full: {
					id: 'task-1',
					title: 'Draft proposal'
				},
				linked_entities: {
					documents: [{ id: 'doc-linked', title: 'Linked doc' }]
				}
			}
		});

		const focusSection = envelope.sections.find((section) => section.id === 'focus_purpose');
		expect(focusSection?.slots).toMatchObject({
			contextType: 'project',
			projectId: 'project-1',
			focusEntityType: 'task',
			focusEntityId: 'task-1',
			focusEntityName: 'Draft proposal'
		});
		const loadedContext = extractLoadedJson(envelope.systemPrompt);
		expect(envelope.systemPrompt).toContain('Focus entity: task Draft proposal');
		expect(envelope.systemPrompt).toContain('"focus_entity_type": "task"');
		expect(loadedContext.documents).toEqual([
			expect.objectContaining({
				id: 'doc-unlinked',
				title: 'Unlinked doc'
			})
		]);
		expect(loadedContext.linked_entities).toEqual({
			documents: [{ id: 'doc-linked', title: 'Linked doc' }]
		});
		expect(envelope.contextInventory.dataSummary.arrayCounts.tasks).toBe(1);
		expect(envelope.contextInventory.timeline.facts).toContain(
			'Event window: 2026-04-07T19:00:00Z to 2026-04-28T19:00:00Z.'
		);
		expect(envelope.contextInventory.retrievalMap.omitted).toContain('unrelated projects');
	});
});

describe('buildLitePhaseFrame', () => {
	it('renders an observability-only phase frame for a tool result', () => {
		const frame = buildLitePhaseFrame({
			phase: 'after_tool',
			toolCall: {
				id: 'call-1',
				name: 'update_onto_task'
			},
			toolResult: {
				status: 'success'
			},
			effectiveContextType: 'project',
			effectiveEntityId: 'task-1',
			latestContextShift: {
				from: 'project',
				to: 'project',
				entityId: 'project-1'
			},
			knownIds: {
				project_id: 'project-1',
				task_id: 'task-1',
				ignored: null
			},
			nextActionHint: 'summarize the update and mention the task id'
		});

		expect(frame.content).toContain('Phase: after_tool');
		expect(frame.content).toContain('Tool: update_onto_task');
		expect(frame.content).toContain('Result: success');
		expect(frame.content).toContain('Known IDs: project_id=project-1, task_id=task-1');
		expect(frame.content).toContain('Next: summarize the update and mention the task id');
		expect(frame.slots).toMatchObject({
			phase: 'after_tool',
			toolName: 'update_onto_task',
			effectiveContextType: 'project'
		});
		expect(frame.estimatedTokens).toBeGreaterThan(0);
	});
});
