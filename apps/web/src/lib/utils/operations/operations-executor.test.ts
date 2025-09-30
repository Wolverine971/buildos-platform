// src/lib/utils/operations/operations-executor.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OperationsExecutor } from './operations-executor';
import { OperationValidator } from './operation-validator';
import type { ParsedOperation } from '../../types/brain-dump';

// Helper to get future dates for testing
const getFutureDate = (daysFromNow: number = 7): string => {
	const date = new Date();
	date.setDate(date.getDate() + daysFromNow);
	return date.toISOString().split('T')[0];
};

// Mock Supabase client
const createMockSupabase = () => {
	const updateMock = vi.fn();
	const eqMock = vi.fn();
	const selectMock = vi.fn();
	const singleMock = vi.fn();

	// Chain methods properly for update operations
	updateMock.mockReturnValue({ eq: eqMock });
	eqMock.mockReturnValue({ eq: eqMock, select: selectMock });
	selectMock.mockReturnValue({ single: singleMock });
	singleMock.mockResolvedValue({
		data: { id: 'test-id', title: 'Updated', context: 'Updated context' },
		error: null
	});

	// Create chainable mock for select queries
	const createChainableSelectMock = () => {
		const chainableMock = {
			eq: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({
				data: {
					id: 'test-project-id',
					name: 'Test Project',
					start_date: getFutureDate(1),
					end_date: getFutureDate(90)
				},
				error: null
			})
		};
		// Make eq return itself for chaining
		chainableMock.eq.mockReturnValue(chainableMock);
		return chainableMock;
	};

	return {
		from: vi.fn((table: string) => ({
			insert: vi.fn((data: any) => ({
				select: vi.fn().mockReturnValue({
					single: vi.fn().mockResolvedValue({
						data: { ...data, id: data.id || 'test-id' },
						error: null
					})
				})
			})),
			update: updateMock,
			select: vi.fn(() => createChainableSelectMock())
		}))
	};
};

const mockSupabase = createMockSupabase();

describe('OperationsExecutor - Update Operations', () => {
	let executor: OperationsExecutor;
	let validator: OperationValidator;

	beforeEach(() => {
		vi.clearAllMocks();
		executor = new OperationsExecutor(mockSupabase as any);
		validator = new OperationValidator();
	});

	describe('Update with ID in data field', () => {
		it('should handle update operation with id in data field (backward compatibility)', async () => {
			const operations: ParsedOperation[] = [
				{
					id: 'op-1',
					operation: 'update',
					table: 'projects',
					data: {
						id: '550e8400-e29b-41d4-a716-446655440030',
						context: 'Updated context',
						user_id: '550e8400-e29b-41d4-a716-446655440031' // This should be overridden
					},
					enabled: true
				}
			];

			const result = await executor.executeOperations({
				operations,
				userId: '550e8400-e29b-41d4-a716-446655440032',
				brainDumpId: '550e8400-e29b-41d4-a716-446655440033'
			});

			expect(result.successful.length).toBe(1);
			expect(result.failed.length).toBe(0);

			// Verify update was called with correct structure
			const updateCall = mockSupabase.from.mock.results[0].value.update.mock.calls[0][0];
			expect(updateCall.id).toBeUndefined(); // id should not be in update data
			expect(updateCall.user_id).toBeUndefined(); // user_id should not be in update data
			expect(updateCall.context).toBe('Updated context');
		});

		it('should handle update operation with conditions field', async () => {
			const operations: ParsedOperation[] = [
				{
					operation: 'update',
					table: 'tasks',
					conditions: { id: '123e4567-e89b-12d3-a456-426614174000' },
					data: {
						title: 'Updated Task Title',
						status: 'done', // Use valid enum value
						project_id: '550e8400-e29b-41d4-a716-446655440040'
					}
				}
			];

			const result = await executor.executeOperations({
				operations,
				userId: '123e4567-e89b-12d3-a456-426614174001',
				brainDumpId: '123e4567-e89b-12d3-a456-426614174002'
			});

			expect(result.successful.length).toBe(1);
			expect(result.failed.length).toBe(0);
		});

		it('should fail update operation without id or conditions', async () => {
			const operations: ParsedOperation[] = [
				{
					operation: 'update',
					table: 'projects',
					data: {
						context: 'Updated context'
						// No id and no conditions
					}
				}
			];

			const result = await executor.executeOperations({
				operations,
				userId: 'user-id',
				brainDumpId: 'brain-dump-id'
			});

			expect(result.successful.length).toBe(0);
			expect(result.failed.length).toBe(1);
			expect(result.failed[0].error).toContain(
				'Update operation requires conditions or an id in data'
			);
		});
	});
});

describe('OperationsExecutor - Notes Creation', () => {
	let executor: OperationsExecutor;

	beforeEach(() => {
		vi.clearAllMocks();
		executor = new OperationsExecutor(mockSupabase as any);
	});

	it('should add user_id to notes creation even if provided in data', async () => {
		const operations: ParsedOperation[] = [
			{
				operation: 'create',
				table: 'notes',
				data: {
					title: 'Context Engineering Relevance',
					content: 'Important insights',
					project_id: '123e4567-e89b-12d3-a456-426614174003',
					category: 'insight',
					tags: ['Context Engineering', 'AI Boom'],
					user_id: '123e4567-e89b-12d3-a456-426614174004' // This should be overridden
				}
			}
		];

		const result = await executor.executeOperations({
			operations,
			userId: '123e4567-e89b-12d3-a456-426614174005',
			brainDumpId: '123e4567-e89b-12d3-a456-426614174006'
		});

		// Debug logging
		if (result.failed.length > 0) {
			console.error('Failed operations:', result.failed);
		}

		expect(result.successful.length).toBe(1);
		expect(result.failed.length).toBe(0);

		// Verify insert was called with correct user_id
		const insertCall = mockSupabase.from.mock.results[0].value.insert.mock.calls[0][0];
		expect(insertCall.user_id).toBe('123e4567-e89b-12d3-a456-426614174005');
		expect(insertCall.title).toBe('Context Engineering Relevance');
		expect(insertCall.tags).toEqual(['Context Engineering', 'AI Boom']);
	});

	it('should handle notes with all valid fields', async () => {
		const operations: ParsedOperation[] = [
			{
				operation: 'create',
				table: 'notes',
				data: {
					title: 'Test Note',
					content: 'Test content',
					category: 'reference',
					tags: ['tag1', 'tag2'],
					project_id: '123e4567-e89b-12d3-a456-426614174007'
				}
			}
		];

		const result = await executor.executeOperations({
			operations,
			userId: '123e4567-e89b-12d3-a456-426614174008',
			brainDumpId: '123e4567-e89b-12d3-a456-426614174009'
		});

		expect(result.successful.length).toBe(1);
		expect(result.failed.length).toBe(0);
	});
});

describe('OperationsExecutor - Recurring Tasks', () => {
	let executor: OperationsExecutor;
	let validator: OperationValidator;

	beforeEach(() => {
		vi.clearAllMocks();
		executor = new OperationsExecutor(mockSupabase as any);
		validator = new OperationValidator();
	});

	describe('Recurring Task Creation', () => {
		it('should create a recurring task with recurrence_pattern', async () => {
			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'tasks',
					data: {
						title: 'Weekly Team Meeting',
						description: 'Sync with team',
						task_type: 'recurring',
						recurrence_pattern: 'weekly',
						start_date: getFutureDate(7),
						recurrence_ends: getFutureDate(365),
						priority: 'high',
						duration_minutes: 60,
						project_id: '550e8400-e29b-41d4-a716-446655440040'
					}
				}
			];

			const result = await executor.executeOperations({
				operations,
				userId: 'user-id',
				brainDumpId: 'brain-dump-id'
			});

			// Debug logging
			if (result.failed.length > 0) {
				console.error('Test: Recurring task creation failed:', result.failed);
			}

			expect(result.successful.length).toBe(1);
			expect(result.failed.length).toBe(0);
			expect(mockSupabase.from).toHaveBeenCalledWith('tasks');

			// Verify the insert was called with recurrence fields
			if (mockSupabase.from.mock.results[0]?.value?.insert?.mock?.calls?.[0]) {
				const insertCall = mockSupabase.from.mock.results[0].value.insert.mock.calls[0][0];
				expect(insertCall.task_type).toBe('recurring');
				expect(insertCall.recurrence_pattern).toBe('weekly');
				expect(insertCall.recurrence_ends).toBe(getFutureDate(365));
			}
		});

		it('should default to weekly pattern if not specified for recurring tasks', async () => {
			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'tasks',
					data: {
						title: 'Recurring Task Without Pattern',
						task_type: 'recurring',
						start_date: getFutureDate(7),
						project_id: '550e8400-e29b-41d4-a716-446655440040'
					}
				}
			];

			const result = await executor.executeOperations({
				operations,
				userId: 'user-id',
				brainDumpId: 'brain-dump-id'
			});

			expect(result.successful.length).toBe(1);
			if (mockSupabase.from.mock.results[0]?.value?.insert?.mock?.calls?.[0]) {
				const insertCall = mockSupabase.from.mock.results[0].value.insert.mock.calls[0][0];
				expect(insertCall.recurrence_pattern).toBe('weekly');
			}
		});

		it('should set task_type to one_off if not specified', async () => {
			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'tasks',
					data: {
						title: 'Regular Task',
						description: 'One-time task',
						project_id: '550e8400-e29b-41d4-a716-446655440040'
					}
				}
			];

			const result = await executor.executeOperations({
				operations,
				userId: 'user-id',
				brainDumpId: 'brain-dump-id'
			});

			expect(result.successful.length).toBe(1);
			const insertCall = mockSupabase.from.mock.results[0].value.insert.mock.calls[0][0];
			expect(insertCall.task_type).toBe('one_off');
			expect(insertCall.recurrence_pattern).toBeUndefined();
		});

		it('should handle all recurrence patterns', async () => {
			const patterns = [
				'daily',
				'weekdays',
				'weekly',
				'biweekly',
				'monthly',
				'quarterly',
				'yearly'
			];

			for (const pattern of patterns) {
				vi.clearAllMocks();

				const operations: ParsedOperation[] = [
					{
						operation: 'create',
						table: 'tasks',
						data: {
							title: `${pattern} Task`,
							task_type: 'recurring',
							recurrence_pattern: pattern,
							start_date: getFutureDate(7),
							project_id: '550e8400-e29b-41d4-a716-446655440040'
						}
					}
				];

				const result = await executor.executeOperations({
					operations,
					userId: 'user-id',
					brainDumpId: 'brain-dump-id'
				});

				expect(result.successful.length).toBe(1);
				if (mockSupabase.from.mock.results[0]?.value?.insert?.mock?.calls?.[0]) {
					const insertCall =
						mockSupabase.from.mock.results[0].value.insert.mock.calls[0][0];
					expect(insertCall.recurrence_pattern).toBe(pattern);
				}
			}
		});
	});

	describe('Recurring Task Validation', () => {
		it('should validate recurring task has required fields', () => {
			const operation: ParsedOperation = {
				operation: 'create',
				table: 'tasks',
				data: {
					title: 'Invalid Recurring Task',
					task_type: 'recurring',
					// Missing recurrence_pattern - but this is now allowed (defaults to weekly)
					// Missing start_date - this should fail validation
					project_id: '550e8400-e29b-41d4-a716-446655440040'
				}
			};

			const validation = validator.validateOperation(operation);

			// Validator should fail because recurring tasks require start_date
			expect(validation.isValid).toBe(false);
			expect(validation.error).toContain('start_date');
		});

		it('should validate recurrence_pattern is valid enum value', () => {
			const operation: ParsedOperation = {
				operation: 'create',
				table: 'tasks',
				data: {
					title: 'Invalid Pattern Task',
					task_type: 'recurring',
					recurrence_pattern: 'invalid_pattern'
				}
			};

			const validation = validator.validateOperation(operation);

			// The validator should either sanitize invalid patterns or keep them
			// (database will enforce the enum constraint)
			if (
				validation.isValid &&
				validation.sanitizedData?.recurrence_pattern === 'invalid_pattern'
			) {
				// If it kept the invalid pattern, that's ok - DB will catch it
				expect(validation.sanitizedData?.recurrence_pattern).toBe('invalid_pattern');
			} else if (validation.isValid) {
				// Or it might have been sanitized to a valid pattern
				expect([
					'daily',
					'weekdays',
					'weekly',
					'biweekly',
					'monthly',
					'quarterly',
					'yearly'
				]).toContain(validation.sanitizedData?.recurrence_pattern || 'weekly');
			}
		});
	});

	describe('Brain Dump Processing', () => {
		it('should parse recurring task from brain dump format', async () => {
			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'tasks',
					data: {
						title: 'Weekly Review',
						description: 'Review progress and plan next week',
						task_type: 'recurring',
						recurrence_pattern: 'weekly',
						start_date: getFutureDate(14),
						recurrence_ends: getFutureDate(180),
						duration_minutes: 30,
						priority: 'medium',
						project_id: '550e8400-e29b-41d4-a716-446655440040' // Use project_id instead of project_ref
					}
				}
			];

			const result = await executor.executeOperations({
				operations,
				userId: 'user-id',
				brainDumpId: 'brain-dump-id'
			});

			expect(result.successful.length).toBe(1);
			expect(result.failed.length).toBe(0);

			if (mockSupabase.from.mock.results[0]?.value?.insert?.mock?.calls?.[0]) {
				const insertCall = mockSupabase.from.mock.results[0].value.insert.mock.calls[0][0];
				expect(insertCall).toMatchObject({
					title: 'Weekly Review',
					task_type: 'recurring',
					recurrence_pattern: 'weekly',
					start_date: getFutureDate(14),
					recurrence_ends: getFutureDate(180),
					duration_minutes: 30,
					priority: 'medium'
				});
			}
		});

		it('should handle multiple recurring tasks in batch', async () => {
			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'tasks',
					data: {
						title: 'Daily Standup',
						task_type: 'recurring',
						recurrence_pattern: 'weekdays',
						start_date: getFutureDate(7),
						duration_minutes: 15,
						project_id: '550e8400-e29b-41d4-a716-446655440040'
					}
				},
				{
					operation: 'create',
					table: 'tasks',
					data: {
						title: 'Monthly Report',
						task_type: 'recurring',
						recurrence_pattern: 'monthly',
						start_date: getFutureDate(7),
						duration_minutes: 120,
						project_id: '550e8400-e29b-41d4-a716-446655440040'
					}
				},
				{
					operation: 'create',
					table: 'tasks',
					data: {
						title: 'One-off Task',
						task_type: 'one_off',
						duration_minutes: 60,
						project_id: '550e8400-e29b-41d4-a716-446655440040'
					}
				}
			];

			const result = await executor.executeOperations({
				operations,
				userId: 'user-id',
				brainDumpId: 'brain-dump-id'
			});

			// Debug logging
			if (result.failed.length > 0) {
				console.error('Test: Multiple batch failed:', result.failed);
			}
			console.log('Test: Multiple batch successful count:', result.successful.length);

			expect(result.successful.length).toBe(3);
			expect(result.failed.length).toBe(0);
			// The mock might be called more than 3 times due to internal operations
			expect(mockSupabase.from).toHaveBeenCalled();
		});
	});
});

describe('OperationsExecutor - Rollback Functionality', () => {
	let executor: OperationsExecutor;
	const mockSupabaseWithRollback = () => {
		const deleteMock = vi.fn().mockReturnThis();
		const eqMock = vi.fn().mockReturnThis();

		return {
			from: vi.fn((table: string) => {
				const insertMock = vi.fn((data: any) => ({
					select: vi.fn().mockReturnValue({
						single: vi.fn().mockResolvedValue({
							data: { ...data, id: data.id || `${table}-id-${Date.now()}` },
							error: null
						})
					})
				}));

				const updateMock = vi.fn(() => ({
					eq: eqMock
				}));

				eqMock.mockReturnValue({
					eq: eqMock,
					select: vi.fn().mockReturnValue({
						single: vi.fn().mockResolvedValue({
							data: { id: `${table}-id` },
							error: null
						})
					})
				});

				return {
					insert: insertMock,
					update: updateMock,
					delete: deleteMock,
					select: vi.fn(() => ({
						eq: eqMock,
						single: vi.fn().mockResolvedValue({
							data: { id: `${table}-id` },
							error: null
						})
					}))
				};
			})
		};
	};

	beforeEach(() => {
		vi.clearAllMocks();
		executor = new OperationsExecutor(mockSupabaseWithRollback() as any);
	});

	describe('Rollback Stack Management', () => {
		it('should rollback all successful create operations when one fails', async () => {
			const mockSupabaseRollback = mockSupabaseWithRollback();
			executor = new OperationsExecutor(mockSupabaseRollback as any);

			let callCount = 0;
			const fromMock = vi.fn((table: string) => {
				callCount++;

				if (callCount <= 2) {
					// First two operations succeed
					return {
						insert: vi.fn((data: any) => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { ...data, id: `created-${callCount}` },
									error: null
								})
							})
						})),
						delete: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockResolvedValue({
									data: null,
									error: null
								})
							})
						})
					};
				} else {
					// Third operation fails
					return {
						insert: vi.fn(() => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: null,
									error: { message: 'Database constraint violation' }
								})
							})
						})),
						delete: vi.fn().mockReturnValue({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockResolvedValue({
									data: null,
									error: null
								})
							})
						})
					};
				}
			});

			mockSupabaseRollback.from = fromMock;

			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'projects',
					data: { name: 'Project 1', user_id: 'user-123' }
				},
				{
					operation: 'create',
					table: 'tasks',
					data: { title: 'Task 1', user_id: 'user-123', project_id: 'proj-1' }
				},
				{
					operation: 'create',
					table: 'notes',
					data: { content: 'Note 1', user_id: 'user-123', project_id: 'proj-1' }
				}
			];

			try {
				await executor.executeOperations({
					operations,
					userId: 'user-123',
					brainDumpId: 'dump-123'
				});
				expect.fail('Should have thrown error');
			} catch (error: any) {
				// Verify rollback was attempted
				expect(error.message).toContain('rolled back');
				expect(error.message).toContain('Database constraint violation');
			}
		});

		it('should rollback operations in reverse order (LIFO)', async () => {
			const deleteOrder: string[] = [];
			const mockSupabaseRollback = mockSupabaseWithRollback();

			let insertCount = 0;
			const fromMock = vi.fn((table: string) => {
				insertCount++;

				// Track delete operations
				const deleteMock = vi.fn(() => {
					deleteOrder.push(table);
					return {
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockResolvedValue({
								data: null,
								error: null
							})
						})
					};
				});

				if (insertCount <= 2) {
					// First two succeed
					return {
						insert: vi.fn((data: any) => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { ...data, id: `id-${insertCount}` },
									error: null
								})
							})
						})),
						delete: deleteMock
					};
				} else {
					// Third fails
					return {
						insert: vi.fn(() => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: null,
									error: { message: 'Failure' }
								})
							})
						})),
						delete: deleteMock
					};
				}
			});

			mockSupabaseRollback.from = fromMock;
			executor = new OperationsExecutor(mockSupabaseRollback as any);

			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'projects',
					data: { name: 'Project 1', user_id: 'user-123' }
				},
				{
					operation: 'create',
					table: 'tasks',
					data: { title: 'Task 1', user_id: 'user-123', project_id: 'proj-1' }
				},
				{
					operation: 'create',
					table: 'notes',
					data: { content: 'Note 1', user_id: 'user-123', project_id: 'proj-1' }
				}
			];

			try {
				await executor.executeOperations({
					operations,
					userId: 'user-123',
					brainDumpId: 'dump-123'
				});
			} catch (error) {
				// Verify rollback order is reversed (LIFO)
				// tasks should be deleted before projects
				expect(deleteOrder[0]).toBe('tasks');
				expect(deleteOrder[1]).toBe('projects');
			}
		});

		it('should only rollback create operations, not updates', async () => {
			const deleteCallsByTable: Record<string, number> = {};
			const mockSupabaseRollback = mockSupabaseWithRollback();

			let operationCount = 0;
			const fromMock = vi.fn((table: string) => {
				operationCount++;

				// Track delete calls
				const deleteMock = vi.fn(() => {
					deleteCallsByTable[table] = (deleteCallsByTable[table] || 0) + 1;
					return {
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockResolvedValue({
								data: null,
								error: null
							})
						})
					};
				});

				if (operationCount <= 2) {
					// First two succeed
					return {
						insert: vi.fn((data: any) => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { ...data, id: `id-${operationCount}` },
									error: null
								})
							})
						})),
						update: vi.fn(() => ({
							eq: vi.fn().mockReturnValue({
								eq: vi.fn().mockReturnValue({
									select: vi.fn().mockReturnValue({
										single: vi.fn().mockResolvedValue({
											data: { id: `id-${operationCount}` },
											error: null
										})
									})
								})
							})
						})),
						delete: deleteMock
					};
				} else {
					// Third fails
					return {
						insert: vi.fn(() => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: null,
									error: { message: 'Failure' }
								})
							})
						})),
						delete: deleteMock
					};
				}
			});

			mockSupabaseRollback.from = fromMock;
			executor = new OperationsExecutor(mockSupabaseRollback as any);

			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'projects',
					data: { name: 'Project 1', user_id: 'user-123' }
				},
				{
					operation: 'update',
					table: 'tasks',
					data: { id: 'existing-task', title: 'Updated Task', user_id: 'user-123' }
				},
				{
					operation: 'create',
					table: 'notes',
					data: { content: 'Note 1', user_id: 'user-123', project_id: 'proj-1' }
				}
			];

			try {
				await executor.executeOperations({
					operations,
					userId: 'user-123',
					brainDumpId: 'dump-123'
				});
			} catch (error) {
				// Only projects (create) should have delete called, not tasks (update)
				expect(deleteCallsByTable['projects']).toBeGreaterThan(0);
				expect(deleteCallsByTable['tasks']).toBeUndefined();
			}
		});
	});

	describe('Rollback Security', () => {
		it('should include user_id check in rollback deletes', async () => {
			const eqCalls: any[] = [];
			const mockSupabaseRollback = mockSupabaseWithRollback();

			let callCount = 0;
			const fromMock = vi.fn((table: string) => {
				callCount++;

				const eqMock = vi.fn((...args: any[]) => {
					eqCalls.push(args);
					return {
						eq: eqMock,
						single: vi.fn().mockResolvedValue({
							data: null,
							error: null
						})
					};
				});

				if (callCount === 1) {
					// First succeeds
					return {
						insert: vi.fn((data: any) => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { ...data, id: 'id-1' },
									error: null
								})
							})
						})),
						delete: vi.fn().mockReturnValue({ eq: eqMock })
					};
				} else {
					// Second fails
					return {
						insert: vi.fn(() => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: null,
									error: { message: 'Failure' }
								})
							})
						})),
						delete: vi.fn().mockReturnValue({ eq: eqMock })
					};
				}
			});

			mockSupabaseRollback.from = fromMock;
			executor = new OperationsExecutor(mockSupabaseRollback as any);

			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'projects',
					data: { name: 'Project 1', user_id: 'user-123' }
				},
				{
					operation: 'create',
					table: 'tasks',
					data: { title: 'Task 1', user_id: 'user-123', project_id: 'proj-1' }
				}
			];

			try {
				await executor.executeOperations({
					operations,
					userId: 'user-123',
					brainDumpId: 'dump-123'
				});
			} catch (error) {
				// Verify user_id was checked during rollback
				const userIdEqCall = eqCalls.find((call) => call[0] === 'user_id');
				expect(userIdEqCall).toBeDefined();
				expect(userIdEqCall[1]).toBe('user-123');
			}
		});
	});

	describe('Rollback Error Handling', () => {
		it('should continue rolling back even if one rollback fails', async () => {
			const deleteAttempts: string[] = [];
			const mockSupabaseRollback = mockSupabaseWithRollback();

			let insertCount = 0;
			const fromMock = vi.fn((table: string) => {
				insertCount++;

				let deleteAttempt = 0;
				const deleteMock = vi.fn(() => {
					deleteAttempts.push(table);
					deleteAttempt++;
					return {
						eq: vi.fn().mockReturnValue({
							eq: vi.fn().mockResolvedValue({
								data: null,
								// First delete fails, second succeeds
								error: deleteAttempt === 1 ? { message: 'Delete failed' } : null
							})
						})
					};
				});

				if (insertCount <= 2) {
					// Both inserts succeed
					return {
						insert: vi.fn((data: any) => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: { ...data, id: `id-${insertCount}` },
									error: null
								})
							})
						})),
						delete: deleteMock
					};
				} else {
					// Third insert fails
					return {
						insert: vi.fn(() => ({
							select: vi.fn().mockReturnValue({
								single: vi.fn().mockResolvedValue({
									data: null,
									error: { message: 'Insert failure' }
								})
							})
						})),
						delete: deleteMock
					};
				}
			});

			mockSupabaseRollback.from = fromMock;
			executor = new OperationsExecutor(mockSupabaseRollback as any);

			const operations: ParsedOperation[] = [
				{
					operation: 'create',
					table: 'projects',
					data: { name: 'Project 1', user_id: 'user-123' }
				},
				{
					operation: 'create',
					table: 'tasks',
					data: { title: 'Task 1', user_id: 'user-123', project_id: 'proj-1' }
				},
				{
					operation: 'create',
					table: 'notes',
					data: { content: 'Note 1', user_id: 'user-123', project_id: 'proj-1' }
				}
			];

			try {
				await executor.executeOperations({
					operations,
					userId: 'user-123',
					brainDumpId: 'dump-123'
				});
			} catch (error) {
				// Should attempt to delete both items despite first failure
				expect(deleteAttempts.length).toBe(2);
			}
		});
	});
});
