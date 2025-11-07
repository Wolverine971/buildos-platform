// apps/web/src/lib/services/dashboardData.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Task } from '$lib/types';

describe('DashboardDataService - Race Condition Fixes', () => {
	let mockSupabase: any;
	let mockDashboardStore: any;
	let DashboardDataService: any;

	beforeEach(async () => {
		// Reset modules to get fresh instances
		vi.resetModules();

		// Mock Supabase client
		mockSupabase = {
			from: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			single: vi.fn().mockResolvedValue({ data: null, error: null })
		};

		// Mock dashboard store with correct method names
		mockDashboardStore = {
			getState: vi.fn(),
			updateTask: vi.fn(() => 'optimistic-update-id'),
			confirmOptimisticUpdate: vi.fn(),
			rollbackOptimisticUpdate: vi.fn()
		};

		// Mock the store module
		vi.doMock('$lib/stores/dashboard.store', () => ({
			dashboardStore: mockDashboardStore
		}));

		// Import the service after mocking
		const module = await import('./dashboardData.service');
		DashboardDataService = module.DashboardDataService;
	});

	describe('Optimistic Update Race Condition Prevention', () => {
		it('should find task BEFORE applying optimistic update', async () => {
			// Mock task in store state
			const mockTask: Partial<Task> = {
				id: 'task-123',
				project_id: 'project-456',
				name: 'Test Task',
				status: 'todo' as const
			};

			const mockState = {
				pastDueTasks: [],
				todaysTasks: [mockTask],
				tomorrowsTasks: [],
				weeklyTasks: [],
				allTasks: [mockTask]
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			// Create a spy to track the order of operations
			const orderOfOperations: string[] = [];

			// Wrap getState to track when it's called
			mockDashboardStore.getState = vi.fn(() => {
				orderOfOperations.push('getState');
				return mockState;
			});

			// Wrap updateTask to track when it's called
			mockDashboardStore.updateTask = vi.fn(() => {
				orderOfOperations.push('updateTask');
				return 'optimistic-update-id';
			});

			// Mock successful API response
			mockSupabase.single.mockResolvedValue({
				data: { ...mockTask, status: 'in_progress' },
				error: null
			});

			// Execute update
			const updates = { status: 'in_progress' as const };
			await service.updateTask('task-123', updates);

			// Verify getState was called BEFORE updateTask
			expect(orderOfOperations[0]).toBe('getState');
			expect(orderOfOperations[1]).toBe('updateTask');
		});

		it('should NOT apply optimistic update if project_id cannot be found', async () => {
			// Mock state without the task
			const mockState = {
				pastDueTasks: [],
				todaysTasks: [],
				tomorrowsTasks: [],
				weeklyTasks: [],
				allTasks: []
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			// Execute update without projectId parameter
			const updates = { status: 'in_progress' as const };
			const result = await service.updateTask('task-123', updates);

			// Verify optimistic update was NOT applied
			expect(mockDashboardStore.updateTask).not.toHaveBeenCalled();

			// Verify error response
			expect(result.success).toBe(false);
			expect(result.message).toContain('project information not available');
		});

		it('should use provided projectId even if task not found in state', async () => {
			// Mock state without the task (task may have been removed due to date change)
			const mockState = {
				pastDueTasks: [],
				todaysTasks: [],
				tomorrowsTasks: [],
				weeklyTasks: [],
				allTasks: []
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			// Mock successful API response
			mockSupabase.single.mockResolvedValue({
				data: { id: 'task-123', project_id: 'project-456', status: 'in_progress' },
				error: null
			});

			// Execute update WITH projectId parameter
			const updates = { status: 'in_progress' as const };
			await service.updateTask('task-123', updates, 'project-456');

			// Verify optimistic update WAS applied
			expect(mockDashboardStore.updateTask).toHaveBeenCalled();
		});

		it('should find task in todayTasks', async () => {
			const mockTask: Partial<Task> = {
				id: 'task-123',
				project_id: 'project-456',
				name: 'Test Task'
			};

			const mockState = {
				pastDueTasks: [],
				todaysTasks: [mockTask],
				tomorrowsTasks: [],
				weeklyTasks: [],
				allTasks: [mockTask]
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			// Mock successful API response
			mockSupabase.single.mockResolvedValue({
				data: { ...mockTask, status: 'done' },
				error: null
			});

			const updates = { status: 'done' as const };
			const result = await service.updateTask('task-123', updates);

			// Should succeed because task was found in todayTasks
			expect(mockDashboardStore.updateTask).toHaveBeenCalledWith('task-123', updates);
		});

		it('should find task in tomorrowsTasks', async () => {
			const mockTask: Partial<Task> = {
				id: 'task-456',
				project_id: 'project-789',
				name: 'Upcoming Task'
			};

			const mockState = {
				pastDueTasks: [],
				todaysTasks: [],
				tomorrowsTasks: [mockTask],
				weeklyTasks: [],
				allTasks: [mockTask]
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			// Mock successful API response
			mockSupabase.single.mockResolvedValue({
				data: { ...mockTask, status: 'in_progress' },
				error: null
			});

			const updates = { status: 'in_progress' as const };
			const result = await service.updateTask('task-456', updates);

			// Should succeed because task was found in tomorrowsTasks
			expect(mockDashboardStore.updateTask).toHaveBeenCalledWith('task-456', updates);
		});

		it('should find task in weeklyTasks', async () => {
			const mockTask: Partial<Task> = {
				id: 'task-789',
				project_id: 'project-123',
				name: 'Weekly Task',
				status: 'done' as const
			};

			const mockState = {
				pastDueTasks: [],
				todaysTasks: [],
				tomorrowsTasks: [],
				weeklyTasks: [mockTask],
				allTasks: [mockTask]
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			// Mock successful API response
			mockSupabase.single.mockResolvedValue({
				data: { ...mockTask, status: 'todo' },
				error: null
			});

			const updates = { status: 'todo' as const };
			const result = await service.updateTask('task-789', updates);

			// Should succeed because task was found in weeklyTasks
			expect(mockDashboardStore.updateTask).toHaveBeenCalledWith('task-789', updates);
		});

		it('should revert optimistic update if API call fails', async () => {
			const mockTask: Partial<Task> = {
				id: 'task-123',
				project_id: 'project-456',
				name: 'Test Task'
			};

			const mockState = {
				pastDueTasks: [],
				todaysTasks: [mockTask],
				tomorrowsTasks: [],
				weeklyTasks: [],
				allTasks: [mockTask]
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			// Mock API failure
			mockSupabase.single.mockResolvedValue({
				data: null,
				error: { message: 'Database error' }
			});

			const updates = { status: 'done' as const };
			const result = await service.updateTask('task-123', updates);

			// Verify optimistic update was applied first
			expect(mockDashboardStore.updateTask).toHaveBeenCalledWith('task-123', updates);

			// Verify it was reverted after failure
			expect(mockDashboardStore.rollbackOptimisticUpdate).toHaveBeenCalledWith(
				'optimistic-update-id'
			);

			// Verify error response
			expect(result.success).toBe(false);
		});

		it('should capture project_id before date change removes task from lists', async () => {
			// Scenario: Task has scheduled_date: today, we're changing it to tomorrow
			// This would move the task from todaysTasks to tomorrowsTasks
			// The critical behavior is that project_id is captured BEFORE the task moves
			const today = new Date();
			const tomorrow = new Date(today);
			tomorrow.setDate(tomorrow.getDate() + 1);

			const mockTask: Partial<Task> = {
				id: 'task-123',
				project_id: 'project-456',
				name: 'Test Task',
				scheduled_date: today.toISOString()
			};

			const mockState = {
				pastDueTasks: [],
				todaysTasks: [mockTask],
				tomorrowsTasks: [],
				weeklyTasks: [],
				allTasks: [mockTask]
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			// Mock successful API response
			mockSupabase.single.mockResolvedValue({
				data: { ...mockTask, scheduled_date: tomorrow.toISOString() },
				error: null
			});

			// Execute update that changes the date
			const updates = { scheduled_date: tomorrow.toISOString() };
			await service.updateTask('task-123', updates);

			// THE KEY TEST: Verify optimistic update was applied
			// This proves we successfully captured project_id before the task moved lists
			// If project_id wasn't captured, updateTask would not be called
			expect(mockDashboardStore.updateTask).toHaveBeenCalledWith('task-123', updates);

			// Verify getState was called (proves we captured the task state)
			expect(mockDashboardStore.getState).toHaveBeenCalled();
		});
	});

	describe('Validation Before Optimistic Update', () => {
		it('should validate project_id exists before making API call', async () => {
			const mockState = {
				pastDueTasks: [],
				todaysTasks: [],
				tomorrowsTasks: [],
				weeklyTasks: [],
				allTasks: []
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			// Try to update without projectId
			const updates = { name: 'Updated Task' };
			const result = await service.updateTask('task-123', updates);

			// Should not call API
			expect(mockSupabase.from).not.toHaveBeenCalled();
			expect(result.success).toBe(false);
		});

		it('should provide helpful error message when task not found', async () => {
			const mockState = {
				pastDueTasks: [],
				todaysTasks: [],
				tomorrowsTasks: [],
				weeklyTasks: [],
				allTasks: []
			};

			mockDashboardStore.getState.mockReturnValue(mockState);

			const service = new DashboardDataService(mockSupabase);

			const updates = { name: 'Updated Task' };
			const result = await service.updateTask('task-123', updates);

			expect(result.success).toBe(false);
			expect(result.message).toContain('project information not available');
			expect(result.message).toContain('refresh the dashboard');
		});
	});
});
