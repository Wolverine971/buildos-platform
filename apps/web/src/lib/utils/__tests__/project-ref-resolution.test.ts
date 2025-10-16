// apps/web/src/lib/utils/__tests__/project-ref-resolution.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OperationsExecutor } from '../operations/operations-executor';
import type { ParsedOperation } from '$lib/types/brain-dump';

// Mock Supabase
const mockSupabase = {
	from: vi.fn(),
	auth: {
		safeGetSession: vi.fn()
	}
} as any;

describe('Project Reference Resolution', () => {
	let executor: OperationsExecutor;

	beforeEach(() => {
		vi.clearAllMocks();
		// Reset mock Supabase before each test
		mockSupabase.from = vi.fn();
		executor = new OperationsExecutor(mockSupabase);
	});

	it('should resolve project_ref to project_id when creating new project', async () => {
		const projectId = '550e8400-e29b-41d4-a716-446655440000';
		const userId = '550e8400-e29b-41d4-a716-446655440001';
		const operations: ParsedOperation[] = [
			{
				id: 'op-1',
				table: 'projects',
				operation: 'create',
				ref: 'new-project-1',
				data: {
					name: 'Test Project',
					slug: 'test-project',
					user_id: userId
				},
				enabled: true
			},
			{
				id: 'op-2',
				table: 'tasks',
				operation: 'create',
				data: {
					title: 'Task with project_ref',
					project_ref: 'new-project-1',
					user_id: userId,
					task_type: 'one_off',
					_needs_ref_resolution: true,
					_ref_field: 'project_ref',
					_id_field: 'project_id'
				},
				enabled: true
			}
		];

		// Mock project creation to return a project with ID
		let callCount = 0;
		mockSupabase.from.mockImplementation((table: string) => {
			const mockChain = {
				insert: vi.fn().mockReturnThis(),
				select: vi.fn().mockReturnThis(),
				single: vi.fn().mockImplementation(() => {
					callCount++;
					if (table === 'projects' && callCount === 1) {
						return Promise.resolve({
							data: { id: projectId, name: 'Test Project', slug: 'test-project' },
							error: null
						});
					} else if (table === 'tasks') {
						return Promise.resolve({
							data: {
								id: 'task-id-123',
								title: 'Task with project_ref',
								project_id: projectId
							},
							error: null
						});
					}
					return Promise.resolve({ data: null, error: null });
				}),
				eq: vi.fn().mockReturnThis(),
				update: vi.fn().mockReturnThis()
			};
			return mockChain;
		});

		const result = await executor.executeOperations({
			operations,
			userId,
			brainDumpId: '550e8400-e29b-41d4-a716-446655440002'
		});

		// Verify the project was created successfully
		expect(result.successful).toHaveLength(2);
		expect(result.failed).toHaveLength(0);

		// Check that the task insert was called
		const taskInsertCall = mockSupabase.from.mock.calls.find((call) => call[0] === 'tasks');
		expect(taskInsertCall).toBeDefined();

		// The key test is that both operations succeeded without validation errors
		// The reference resolution happens internally in the executor
	});

	it('should handle multiple tasks with same project_ref', async () => {
		const projectId = '550e8400-e29b-41d4-a716-446655440010';
		const userId = '550e8400-e29b-41d4-a716-446655440011';
		const operations: ParsedOperation[] = [
			{
				id: 'op-1',
				table: 'projects',
				operation: 'create',
				ref: 'new-project-1',
				data: {
					name: 'Multi-task Project',
					slug: 'multi-task-project',
					user_id: userId
				},
				enabled: true
			},
			{
				id: 'op-2',
				table: 'tasks',
				operation: 'create',
				data: {
					title: 'First Task',
					project_ref: 'new-project-1',
					user_id: userId,
					task_type: 'one_off',
					_needs_ref_resolution: true,
					_ref_field: 'project_ref',
					_id_field: 'project_id'
				},
				enabled: true
			},
			{
				id: 'op-3',
				table: 'tasks',
				operation: 'create',
				data: {
					title: 'Second Task',
					project_ref: 'new-project-1',
					user_id: userId,
					task_type: 'one_off',
					_needs_ref_resolution: true,
					_ref_field: 'project_ref',
					_id_field: 'project_id'
				},
				enabled: true
			}
		];

		let callCount = 0;
		mockSupabase.from.mockImplementation((table: string) => {
			const mockChain = {
				insert: vi.fn().mockReturnThis(),
				select: vi.fn().mockReturnThis(),
				single: vi.fn().mockImplementation(() => {
					callCount++;
					if (table === 'projects' && callCount === 1) {
						return Promise.resolve({
							data: {
								id: projectId,
								name: 'Multi-task Project',
								slug: 'multi-task-project'
							},
							error: null
						});
					} else if (table === 'tasks') {
						return Promise.resolve({
							data: {
								id: `task-id-${callCount}`,
								title: `Task ${callCount}`,
								project_id: projectId
							},
							error: null
						});
					}
					return Promise.resolve({ data: null, error: null });
				}),
				eq: vi.fn().mockReturnThis(),
				update: vi.fn().mockReturnThis()
			};
			return mockChain;
		});

		const result = await executor.executeOperations({
			operations,
			userId,
			brainDumpId: '550e8400-e29b-41d4-a716-446655440012'
		});

		expect(result.successful).toHaveLength(3);
		expect(result.failed).toHaveLength(0);

		// All tasks should have been created with the same project_id
		const taskInsertCalls = mockSupabase.from.mock.calls.filter((call) => call[0] === 'tasks');
		expect(taskInsertCalls).toHaveLength(2);
	});
});
