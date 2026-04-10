// apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.gateway.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ToolExecutionService } from './tool-execution-service';
import type { ChatToolCall } from '@buildos/shared-types';
import type { ServiceContext, ToolExecutorResponse } from '../shared/types';

const PROJECT_ID = '31021625-1377-4715-9fb4-f93102974628';
const PLAN_ID = '5489a6f8-f997-44e2-8c8c-e1a4e4f00a97';

function buildToolCall(args: Record<string, any>): ChatToolCall {
	return {
		id: 'call_test',
		type: 'function',
		function: {
			name: 'tool_exec',
			arguments: JSON.stringify(args)
		}
	};
}

function buildGatewayToolCall(
	name: 'tool_help' | 'tool_exec' | 'tool_batch' | 'execute_op',
	args: Record<string, any>
): ChatToolCall {
	return {
		id: 'call_test',
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

function buildContext(overrides: Partial<ServiceContext> = {}): ServiceContext {
	return {
		sessionId: 'session_123',
		userId: 'user_123',
		contextType: 'project',
		entityId: PROJECT_ID,
		conversationHistory: [],
		...overrides
	};
}

describe('ToolExecutionService gateway fallback', () => {
	it('executes execute_op payloads with nested input', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				id: '3cdf0778-5301-43da-a899-a67561b4fa73',
				title: 'Rename chapter outline'
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildGatewayToolCall('execute_op', {
				op: 'onto.task.update',
				input: {
					task_id: '3cdf0778-5301-43da-a899-a67561b4fa73',
					title: 'Rename chapter outline'
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'update_onto_task',
			expect.objectContaining({
				project_id: PROJECT_ID,
				task_id: '3cdf0778-5301-43da-a899-a67561b4fa73',
				title: 'Rename chapter outline'
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.ok).toBe(true);
	});

	it('falls back onto.plan.get without plan_id to search_onto_plans when a query can be inferred', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				plans: [{ id: PLAN_ID, name: 'Execution Plan' }]
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({ op: 'onto.plan.get', args: {} }),
			buildContext({
				conversationHistory: [
					{
						role: 'user',
						content: 'Show me the execution plan'
					} as any
				]
			}),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'search_onto_plans',
			expect.objectContaining({
				project_id: PROJECT_ID,
				query: 'Show me the execution plan'
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('onto.plan.get');
		expect((result.data as any)?.result?._fallback?.reason).toBe('missing_required_id');
		expect((result.data as any)?.meta?.executed_op).toBe('onto.plan.search');
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining('executed onto.plan.search'),
				expect.stringContaining('called without args.query; inferred query')
			])
		);
	});

	it('falls back onto.plan.get without plan_id to list_onto_plans when no query is available', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				plans: [{ id: PLAN_ID, name: 'Execution Plan' }]
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({ op: 'onto.plan.get', args: {} }),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'list_onto_plans',
			expect.objectContaining({
				project_id: PROJECT_ID
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.meta?.executed_op).toBe('onto.plan.list');
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([expect.stringContaining('executed onto.plan.list')])
		);
	});

	it('falls back onto.project.get without project_id to search_onto_projects when a query can be inferred', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				projects: [{ id: PROJECT_ID, name: '9takes' }]
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({ op: 'onto.project.get', args: {} }),
			buildContext({
				contextType: 'global',
				entityId: undefined,
				conversationHistory: [
					{
						role: 'user',
						content: 'Open the 9takes project'
					} as any
				]
			}),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'search_onto_projects',
			expect.objectContaining({
				query: 'Open the 9takes project'
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.meta?.executed_op).toBe('onto.project.search');
	});

	it('executes onto.plan.get directly when plan_id is provided', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				plan: { id: PLAN_ID, name: 'Execution Plan' }
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.plan.get',
				args: { plan_id: PLAN_ID }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'get_onto_plan_details',
			expect.objectContaining({
				plan_id: PLAN_ID
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.meta?.executed_op).toBeUndefined();
		expect((result.data as any)?.result?._fallback).toBeUndefined();
	});

	it('accepts legacy search arg alias and normalizes to query for onto.*.search ops', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				tasks: []
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.task.search',
				args: { search: 'launch checklist' }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'search_onto_tasks',
			expect.objectContaining({
				query: 'launch checklist'
			}),
			expect.any(Object)
		);
	});

	it('infers query for onto.*.search when args.query is missing', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				projects: []
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.project.search',
				args: {}
			}),
			buildContext({
				contextType: 'global',
				conversationHistory: [
					{
						role: 'user',
						content: 'Find projects related to onboarding flow'
					} as any
				]
			}),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'search_onto_projects',
			expect.objectContaining({
				query: 'Find projects related to onboarding flow'
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining('called without args.query; inferred query')
			])
		);
	});

	it('normalizes legacy onto_projects.move_document_in_tree to gateway op alias', async () => {
		const documentId = '823f2215-f0c3-40b8-b468-8f1a592384f2';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				moved: true,
				document_id: documentId
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto_projects.move_document_in_tree',
				args: { document_id: documentId }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'move_document_in_tree',
			expect.objectContaining({
				project_id: PROJECT_ID,
				document_id: documentId
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('onto_projects.move_document_in_tree');
		expect((result.data as any)?.meta?.executed_op).toBe('onto.document.tree.move');
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					'Normalized legacy op "onto_projects.move_document_in_tree" to "onto.document.tree.move".'
				)
			])
		);
	});

	it('normalizes bare legacy move_document_in_tree op to gateway canonical op', async () => {
		const documentId = '823f2215-f0c3-40b8-b468-8f1a592384f2';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				moved: true,
				document_id: documentId
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'move_document_in_tree',
				args: { document_id: documentId }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'move_document_in_tree',
			expect.objectContaining({
				project_id: PROJECT_ID,
				document_id: documentId
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('move_document_in_tree');
		expect((result.data as any)?.meta?.executed_op).toBe('onto.document.tree.move');
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					'Normalized legacy op "move_document_in_tree" to "onto.document.tree.move".'
				)
			])
		);
	});

	it('executes cal.event.list with time-range aliases and pagination args', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				events: [{ title: 'Roadmap review' }],
				pagination: {
					offset: 100,
					limit: 100,
					returned: 1,
					total_available: 151,
					has_more: true,
					next_offset: 200
				},
				queried_range: {
					time_min: '2026-03-01T00:00:00.000Z',
					time_max: '2026-04-01T23:59:59.000Z'
				}
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'cal.event.list',
				args: {
					calendar_scope: 'project',
					time_min: '2026-03-01',
					time_max: '2026-04-01',
					limit: 100,
					offset: 100
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'list_calendar_events',
			expect.objectContaining({
				project_id: PROJECT_ID,
				calendar_scope: 'project',
				time_min: '2026-03-01',
				time_max: '2026-04-01',
				limit: 100,
				offset: 100
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('cal.event.list');
		expect((result.data as any)?.ok).toBe(true);
		expect((result.data as any)?.result?.pagination?.has_more).toBe(true);
		expect((result.data as any)?.meta?.executed_op).toBeUndefined();
	});

	it('executes util.profile.overview via get_user_profile_overview', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				profile_exists: true,
				profile: { id: 'profile_1' }
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'util.profile.overview',
				args: { include_doc_structure: true, include_chapters: true }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'get_user_profile_overview',
			expect.objectContaining({
				include_doc_structure: true,
				include_chapters: true
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('util.profile.overview');
	});

	it('executes util.contact.search via search_user_contacts', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				contacts: [{ id: 'contact_1', display_name: 'Stacy' }]
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'util.contact.search',
				args: { query: 'stacy', include_methods: true }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'search_user_contacts',
			expect.objectContaining({
				query: 'stacy',
				include_methods: true
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('util.contact.search');
	});

	it('allows null new_parent_id for onto.document.tree.move root placement', async () => {
		const documentId = '823f2215-f0c3-40b8-b468-8f1a592384f2';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				moved: true,
				document_id: documentId
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.document.tree.move',
				args: {
					document_id: documentId,
					new_parent_id: null,
					new_position: 0
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'move_document_in_tree',
			expect.objectContaining({
				project_id: PROJECT_ID,
				document_id: documentId,
				new_parent_id: null,
				new_position: 0
			}),
			expect.any(Object)
		);
	});

	it('allows null clearing fields for onto.task.update', async () => {
		const taskId = '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				task: {
					id: taskId,
					title: 'Task'
				}
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.task.update',
				args: {
					task_id: taskId,
					goal_id: null,
					due_at: null
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'update_onto_task',
			expect.objectContaining({
				task_id: taskId,
				goal_id: null,
				due_at: null
			}),
			expect.any(Object)
		);
	});

	it('normalizes onto_projects.doc_structure.tree.get and injects project_id', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: {
				structure: { root: [] },
				documents: {},
				unlinked: [],
				archived: []
			}
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto_projects.doc_structure.tree.get',
				args: {}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'get_document_tree',
			expect.objectContaining({
				project_id: PROJECT_ID,
				include_documents: true
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.op).toBe('onto_projects.doc_structure.tree.get');
		expect((result.data as any)?.meta?.executed_op).toBe('onto.document.tree.get');
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([
				expect.stringContaining(
					'defaulted include_documents=true to expose unlinked documents'
				)
			])
		);
	});

	it('normalizes legacy tool_help paths for doc structure groups', async () => {
		const toolExecutor = vi.fn();
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildGatewayToolCall('tool_help', { path: 'onto_projects.doc_structure.tree' }),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect((result.data as any)?.type).toBe('directory');
		expect((result.data as any)?.path).toBe('onto.document.tree');
	});

	it('normalizes calendar skill help alias to cal.skill', async () => {
		const toolExecutor = vi.fn();
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildGatewayToolCall('tool_help', { path: 'calendar.skill' }),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect((result.data as any)?.type).toBe('skill');
		expect((result.data as any)?.id).toBe('calendar_management');
		expect((result.data as any)?.legacy_paths).toContain('cal.skill');
	});

	it('sanitizes malformed op wrappers and still executes canonical op', async () => {
		const taskId = '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5';
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { task: { id: taskId, title: 'Updated title' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'tool_exec"> <parameter name="op">onto.task.update',
				args: { task_id: taskId, title: 'Updated title' }
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'update_onto_task',
			expect.objectContaining({
				task_id: taskId,
				title: 'Updated title'
			}),
			expect.any(Object)
		);
		expect((result.data as any)?.meta?.warnings).toEqual(
			expect.arrayContaining([expect.stringContaining('Sanitized malformed op')])
		);
	});

	it('maps create task name aliases to title', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { task: { id: 'task-1', title: 'Reach out to vendor' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.task.create',
				args: {
					name: 'Reach out to vendor'
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'create_onto_task',
			expect.objectContaining({
				project_id: PROJECT_ID,
				title: 'Reach out to vendor'
			}),
			expect.any(Object)
		);
	});

	it('maps nested task.name alias to title for create task', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { task: { id: 'task-2', title: 'Call Small Business Bureau' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.task.create',
				args: {
					task: { name: 'Call Small Business Bureau' }
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'create_onto_task',
			expect.objectContaining({
				project_id: PROJECT_ID,
				title: 'Call Small Business Bureau'
			}),
			expect.any(Object)
		);
	});

	it('maps update plan aliases to canonical update fields', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { plan: { id: PLAN_ID, name: 'Updated plan' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.plan.update',
				args: {
					plan_id: PLAN_ID,
					plan_name: 'Updated plan',
					plan_description: 'Expanded execution details'
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'update_onto_plan',
			expect.objectContaining({
				plan_id: PLAN_ID,
				name: 'Updated plan',
				description: 'Expanded execution details'
			}),
			expect.any(Object)
		);
	});

	it('maps link aliases from from/to/relationship payloads', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { edge: { id: 'edge-1' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.edge.link',
				args: {
					from: { kind: 'plan', id: PLAN_ID },
					to: { kind: 'task', id: '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5' },
					relationship: 'has_task'
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'link_onto_entities',
			expect.objectContaining({
				src_kind: 'plan',
				src_id: PLAN_ID,
				dst_kind: 'task',
				dst_id: '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5',
				rel: 'has_task'
			}),
			expect.any(Object)
		);
	});

	it('maps link aliases from src/dst objects and relation', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { edge: { id: 'edge-2' } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.edge.link',
				args: {
					src: { kind: 'plan', id: PLAN_ID },
					dst: { kind: 'task', id: '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5' },
					relation: 'has_task'
				}
			}),
			buildContext(),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'link_onto_entities',
			expect.objectContaining({
				src_kind: 'plan',
				src_id: PLAN_ID,
				dst_kind: 'task',
				dst_id: '3f4c1f6f-77c6-45ab-9159-686dc2d92bc5',
				rel: 'has_task'
			}),
			expect.any(Object)
		);
	});

	it('normalizes project create relationship string pairs to entity refs before execution', async () => {
		const toolExecutor = vi.fn().mockResolvedValue({
			data: { project_id: PROJECT_ID, counts: { goals: 1, tasks: 3 } }
		} satisfies ToolExecutorResponse);
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.project.create',
				args: {
					project: {
						name: 'Podcast Launch',
						type_key: 'project.creative.podcast'
					},
					entities: [
						{ temp_id: 'g1', kind: 'goal', name: 'Publish the first 3 episodes' },
						{ temp_id: 't1', kind: 'task', title: 'Define the show format' },
						{ temp_id: 't2', kind: 'task', title: 'Book the first 3 guests' }
					],
					relationships: [
						['g1', 't1'],
						['g1', 't2']
					]
				}
			}),
			buildContext({ contextType: 'project_create', entityId: null }),
			[]
		);

		expect(result.success).toBe(true);
		expect(toolExecutor).toHaveBeenCalledWith(
			'create_onto_project',
			expect.objectContaining({
				project: expect.objectContaining({
					name: 'Podcast Launch',
					type_key: 'project.creative.podcast'
				}),
				relationships: [
					[
						{ temp_id: 'g1', kind: 'goal' },
						{ temp_id: 't1', kind: 'task' }
					],
					[
						{ temp_id: 'g1', kind: 'goal' },
						{ temp_id: 't2', kind: 'task' }
					]
				]
			}),
			expect.any(Object)
		);
	});

	it('rejects project create relationship string pairs when temp ids cannot be resolved', async () => {
		const toolExecutor = vi.fn();
		const service = new ToolExecutionService(toolExecutor);

		const result = await service.executeTool(
			buildToolCall({
				op: 'onto.project.create',
				args: {
					project: {
						name: 'Podcast Launch',
						type_key: 'project.creative.podcast'
					},
					entities: [
						{ temp_id: 'g1', kind: 'goal', name: 'Publish the first 3 episodes' }
					],
					relationships: [['g1', 't9']]
				}
			}),
			buildContext({ contextType: 'project_create', entityId: null }),
			[]
		);

		expect(result.success).toBe(false);
		expect(result.error).toContain('relationships[0][1]');
		expect(result.error).toContain('must match an entity in args.entities');
		expect(toolExecutor).not.toHaveBeenCalled();
	});
});
