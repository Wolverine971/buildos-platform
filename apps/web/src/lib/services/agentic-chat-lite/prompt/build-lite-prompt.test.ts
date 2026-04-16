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
		expect(
			envelope.sections.find((section) => section.id === 'capabilities_skills_tools')?.kind
		).toBe('static');
		expect(
			envelope.sections.find((section) => section.id === 'tool_surface_dynamic')?.kind
		).toBe('dynamic');
		const focusHeadingIndex = envelope.systemPrompt.indexOf('## Current Focus and Purpose');
		const operatingHeadingIndex = envelope.systemPrompt.indexOf('## Operating Strategy');
		const safetyHeadingIndex = envelope.systemPrompt.indexOf('## Safety and Data Rules');
		const capabilityHeadingIndex = envelope.systemPrompt.indexOf(
			'## Capabilities, Skills, and Tools'
		);
		const retrievalHeadingIndex = envelope.systemPrompt.indexOf(
			'## Loaded Data and Retrieval Boundaries'
		);
		const toolHeadingIndex = envelope.systemPrompt.indexOf('## Current Tool Surface');
		expect(focusHeadingIndex).toBeGreaterThanOrEqual(0);
		expect(operatingHeadingIndex).toBeGreaterThanOrEqual(0);
		expect(safetyHeadingIndex).toBeGreaterThanOrEqual(0);
		expect(capabilityHeadingIndex).toBeGreaterThanOrEqual(0);
		expect(retrievalHeadingIndex).toBeGreaterThanOrEqual(0);
		expect(toolHeadingIndex).toBeGreaterThanOrEqual(0);
		expect(operatingHeadingIndex).toBeLessThan(focusHeadingIndex);
		expect(safetyHeadingIndex).toBeLessThan(focusHeadingIndex);
		expect(capabilityHeadingIndex).toBeLessThan(focusHeadingIndex);
		expect(toolHeadingIndex).toBeGreaterThan(retrievalHeadingIndex);
		expect(envelope.systemPrompt).toContain('# BuildOS Lite Agentic Chat Prompt');
		expect(envelope.systemPrompt).toContain(
			'You are a proactive project assistant for BuildOS'
		);
		expect(envelope.systemPrompt).toContain(
			'Think in three layers. They work together in sequence:'
		);
		expect(envelope.systemPrompt).toContain('Loaded scope:');
		expect(envelope.systemPrompt).toContain('Actionable loaded context index (bounded):');
		expect(envelope.systemPrompt).not.toContain('Loaded context payload');
		expect(envelope.systemPrompt).not.toContain('"recent_activity": [');
		expect(envelope.systemPrompt).not.toContain('Product surface: global workspace chat');
		expect(envelope.systemPrompt).not.toContain(
			'Conversation position: beginning of chat thread'
		);
		expect(envelope.systemPrompt).toContain('Workspace and project overviews');
		expect(envelope.systemPrompt).toContain(
			'Tool schemas are supplied through model tool definitions'
		);
		expect(envelope.systemPrompt).toContain(
			'If any write fails and no later retry repairs the same target'
		);
		expect(envelope.systemPrompt).toContain(
			'Pre-tool lead-ins are intent only: say what you will attempt, not that it already happened.'
		);
		expect(envelope.systemPrompt).toContain(
			'User-visible durable fields (titles, descriptions, document content'
		);
		expect(envelope.systemPrompt).toContain(
			'Do not claim a requested document type, tree placement, link, or cross-link'
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
		expect(envelope.systemPrompt).toContain('Recent project changes:');
		expect(envelope.systemPrompt).toContain(
			'2026-04-14: task "Finish onboarding (Launch Alpha)", updated, today.'
		);
		expect(envelope.systemPrompt).not.toContain('No recent project changes are loaded.');
	});

	it('renders project intelligence signals when prewarm provides them', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'global',
			now: '2026-04-15T12:00:00Z',
			data: {
				projects: [],
				project_intelligence: {
					generated_at: '2026-04-15T12:00:00Z',
					scope: 'global',
					project_id: null,
					project_name: null,
					timezone: 'UTC',
					windows: {
						due_soon_days: 7,
						upcoming_days: 30,
						recent_changes_days: 7,
						recent_changes_max_lookback_days: 21
					},
					counts: {
						accessible_projects: 3,
						projects_returned: 1,
						overdue_total: 3,
						due_soon_total: 1,
						upcoming_total: 1,
						recent_change_total: 2
					},
					overdue_or_due_soon: [
						{
							kind: 'task',
							id: 'task-overdue',
							project_id: 'project-1',
							project_name: 'Launch Alpha',
							title: 'Send beta invite',
							state_key: 'todo',
							date_kind: 'due_at',
							date: '2026-04-14T12:00:00Z',
							bucket: 'overdue',
							days_delta: -1,
							priority: 2,
							updated_at: '2026-04-14T10:00:00Z'
						},
						{
							kind: 'milestone',
							id: 'milestone-soon',
							project_id: 'project-1',
							project_name: 'Launch Alpha',
							title: 'Beta launch',
							state_key: 'pending',
							date_kind: 'due_at',
							date: '2026-04-18T12:00:00Z',
							bucket: 'due_soon',
							days_delta: 3,
							updated_at: '2026-04-15T10:00:00Z'
						},
						{
							kind: 'event',
							id: 'event-bad-date',
							project_id: 'project-1',
							project_name: 'Launch Alpha',
							title: 'Ancient bad calendar artifact',
							state_key: 'scheduled',
							date_kind: 'start_at',
							date: '0003-03-13T00:00:00Z',
							bucket: 'overdue',
							days_delta: -738919,
							updated_at: '2026-04-15T10:00:00Z'
						},
						{
							kind: 'task',
							id: 'task-stale',
							project_id: 'project-1',
							project_name: 'Launch Alpha',
							title: 'Old backlog cleanup',
							state_key: 'todo',
							date_kind: 'due_at',
							date: '2025-12-01T12:00:00Z',
							bucket: 'overdue',
							days_delta: -135,
							priority: 1,
							updated_at: '2026-04-15T10:00:00Z'
						}
					],
					upcoming_work: [
						{
							kind: 'event',
							id: 'event-1',
							project_id: 'project-1',
							project_name: 'Launch Alpha',
							title: 'Launch review',
							state_key: 'scheduled',
							date_kind: 'start_at',
							date: '2026-04-25T12:00:00Z',
							bucket: 'upcoming',
							days_delta: 10,
							updated_at: '2026-04-15T10:00:00Z'
						}
					],
					recent_changes: [
						{
							kind: 'task',
							id: 'task-1',
							project_id: 'project-1',
							project_name: 'Launch Alpha',
							title: 'Finish onboarding',
							action: 'updated',
							changed_at: '2026-04-15T11:00:00Z'
						},
						{
							kind: 'task',
							id: 'task-1',
							project_id: 'project-1',
							project_name: 'Launch Alpha',
							title: 'Finish onboarding',
							action: 'updated',
							changed_at: '2026-04-15T10:00:00Z'
						}
					],
					project_summaries: [
						{
							project_id: 'project-1',
							project_name: 'Launch Alpha',
							state_key: 'active',
							next_step_short: 'Ship the beta build',
							updated_at: '2026-04-15T10:00:00Z',
							counts: {
								overdue: 1,
								due_soon: 1,
								upcoming: 1,
								recent_changes: 1
							}
						}
					],
					limits: {
						overdue_or_due_soon: 16,
						upcoming_work: 16,
						recent_changes: 16,
						project_summaries: 8
					},
					maybe_more: {
						overdue_or_due_soon: false,
						upcoming_work: false,
						recent_changes: false,
						project_summaries: false
					},
					source: 'load_fastchat_context'
				}
			}
		});

		expect(envelope.systemPrompt).toContain(
			'Loaded project intelligence: 3 overdue, 1 due soon, 1 upcoming, 2 recent changes.'
		);
		expect(envelope.systemPrompt).toContain(
			'2026-04-14: task (task_id: task-overdue) "Send beta invite" in Launch Alpha, overdue, todo, yesterday.'
		);
		expect(envelope.systemPrompt).toContain(
			'2026-04-18: milestone (milestone_id: milestone-soon) "Beta launch" in Launch Alpha, due soon, pending, in 3 days.'
		);
		expect(envelope.systemPrompt).toContain(
			'2026-04-25: event (event_id: event-1) "Launch review" in Launch Alpha, scheduled, in 10 days.'
		);
		expect(envelope.systemPrompt).toContain(
			'2026-04-15: task (task_id: task-1) "Finish onboarding" updated in Launch Alpha.'
		);
		expect(envelope.systemPrompt).not.toContain('Ancient bad calendar artifact');
		expect(envelope.systemPrompt).not.toContain('Old backlog cleanup');
		expect(envelope.systemPrompt).toContain('stale overdue items suppressed');
		expect(envelope.systemPrompt).toContain('invalid-date items suppressed');
		expect(
			envelope.systemPrompt.match(
				/2026-04-15: task \(task_id: task-1\) "Finish onboarding" updated in Launch Alpha\./g
			)
		).toHaveLength(1);
	});

	it('ignores incomplete project intelligence payloads instead of throwing', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'global',
			now: '2026-04-15T12:00:00Z',
			data: {
				projects: [],
				project_intelligence: {
					generated_at: '2026-04-15T12:00:00Z',
					counts: {
						overdue_total: 1,
						due_soon_total: 0,
						upcoming_total: 0,
						recent_change_total: 0
					},
					overdue_or_due_soon: [],
					upcoming_work: [],
					recent_changes: []
				}
			}
		});

		expect(envelope.systemPrompt).not.toContain('Loaded project intelligence:');
		expect(envelope.systemPrompt).toContain('No project timeline or recent activity details');
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
		expect(envelope.systemPrompt).toContain('Launch Alpha is active.');
		expect(envelope.systemPrompt).toContain(
			'Due soon: 2026-04-18: task "Draft proposal", active, in 4 days.'
		);
		expect(envelope.systemPrompt).toContain('Loaded data snapshot:');
		expect(envelope.systemPrompt).toContain('Counts: documents: 2, events: 0');
		expect(envelope.systemPrompt).not.toContain('Top-level keys:');
		expect(envelope.systemPrompt).toContain('"focus_entity":');
		expect(loadedContext.focus_entity).toEqual({
			type: 'task',
			id: 'task-1',
			title: 'Draft proposal'
		});
		expect((loadedContext.entity_refs as Record<string, unknown>).documents).toEqual([
			expect.objectContaining({
				id: 'doc-linked',
				title: 'Linked doc'
			}),
			expect.objectContaining({
				id: 'doc-unlinked',
				title: 'Unlinked doc'
			})
		]);
		expect(loadedContext.linked_entity_refs).toEqual({
			documents: [{ id: 'doc-linked', title: 'Linked doc' }]
		});
		expect(envelope.contextInventory.dataSummary.arrayCounts.tasks).toBe(1);
		expect(envelope.contextInventory.timeline.facts).toContain(
			'Event window: 2026-04-07T19:00:00Z to 2026-04-28T19:00:00Z.'
		);
		expect(envelope.contextInventory.retrievalMap.omitted).toContain('unrelated projects');
	});

	it('keeps project_create focused on creation instead of empty project data boilerplate', () => {
		const envelope = buildLitePromptEnvelope({
			contextType: 'project_create',
			entityId: null,
			projectId: null,
			now: '2026-04-16T02:51:48.252Z',
			data: null
		});

		expect(envelope.sections.map((section) => section.id)).toEqual([
			'identity_mission',
			'operating_strategy',
			'safety_data_rules',
			'capabilities_skills_tools',
			'focus_purpose',
			'location_loaded_context',
			'context_inventory_retrieval',
			'tool_surface_dynamic'
		]);
		expect(envelope.systemPrompt).toContain(
			'The user is trying to create a new BuildOS project right now.'
		);
		expect(envelope.systemPrompt).toContain(
			'Project creation scope:\n- This chat is in project_create mode before a project exists.'
		);
		expect(envelope.systemPrompt).toContain('## Project Creation Boundaries');
		expect(envelope.systemPrompt).toContain(
			'Turn a rough idea into the smallest valid project structure'
		);
		expect(envelope.systemPrompt).not.toContain('## Timeline and Recent Activity');
		expect(envelope.systemPrompt).not.toContain('Project status:');
		expect(envelope.systemPrompt).not.toContain('Overdue or due soon:');
		expect(envelope.systemPrompt).not.toContain('Upcoming dated work:');
		expect(envelope.systemPrompt).not.toContain('Recent project changes:');
		expect(envelope.systemPrompt).not.toContain('Loaded data snapshot:');
		expect(envelope.systemPrompt).not.toContain('Structured context loaded: no (empty).');
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
