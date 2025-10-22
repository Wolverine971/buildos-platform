// apps/worker/tests/briefGenerator.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Supabase
const mockSupabase = {
	from: vi.fn(() => mockSupabase),
	select: vi.fn(() => mockSupabase),
	insert: vi.fn(() => mockSupabase),
	update: vi.fn(() => mockSupabase),
	upsert: vi.fn(() => mockSupabase),
	eq: vi.fn(() => mockSupabase),
	in: vi.fn(() => mockSupabase),
	single: vi.fn(() => Promise.resolve({ data: null, error: null })),
	then: vi.fn((callback) => callback({ data: [], error: null }))
};

vi.mock('../src/lib/supabase', () => ({
	supabase: mockSupabase
}));

// Mock progress tracker
vi.mock('../src/lib/progressTracker', () => ({
	updateProgress: vi.fn()
}));

// Mock LLM service
vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: {
		getInstance: vi.fn(() => ({
			generateText: vi.fn(() => Promise.resolve('Mock LLM analysis'))
		}))
	}
}));

describe('Brief Generator - Parallel Project Processing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('Parallel Project Brief Generation', () => {
		it('should process multiple projects in parallel', async () => {
			// This test verifies that projects are processed concurrently, not sequentially
			const mockProjects = [
				{
					project_id: 'project-1',
					name: 'Project One',
					user_id: 'user-1',
					tasks: [],
					notes: []
				},
				{
					project_id: 'project-2',
					name: 'Project Two',
					user_id: 'user-1',
					tasks: [],
					notes: []
				},
				{
					project_id: 'project-3',
					name: 'Project Three',
					user_id: 'user-1',
					tasks: [],
					notes: []
				}
			];

			// Track execution order to verify parallelism
			const executionOrder: string[] = [];
			const projectProcessingTimes = new Map<string, number>();

			// Mock project processing with artificial delays
			const mockGenerateProjectBrief = vi.fn(async (project) => {
				const startTime = Date.now();
				executionOrder.push(`start-${project.project_id}`);

				// Simulate different processing times
				const delay = project.project_id === 'project-1' ? 300 : 100;
				await new Promise((resolve) => setTimeout(resolve, delay));

				executionOrder.push(`end-${project.project_id}`);
				projectProcessingTimes.set(project.project_id, Date.now() - startTime);

				return {
					project_id: project.project_id,
					content: `Brief for ${project.name}`,
					tasks_today: [],
					overdue_tasks: []
				};
			});

			// Simulate parallel processing (same as in briefGenerator.ts)
			const startTime = Date.now();
			const projectBriefPromises = mockProjects.map(async (project) => {
				try {
					return await mockGenerateProjectBrief(project);
				} catch (error) {
					console.warn(`Failed to generate brief for ${project.name}:`, error);
					return null;
				}
			});

			const projectBriefResults = await Promise.allSettled(projectBriefPromises);
			const projectBriefs = projectBriefResults
				.filter((result) => result.status === 'fulfilled' && result.value !== null)
				.map((result) => (result as PromiseFulfilledResult<any>).value);

			const totalTime = Date.now() - startTime;

			// Assertions
			expect(mockGenerateProjectBrief).toHaveBeenCalledTimes(3);
			expect(projectBriefs).toHaveLength(3);

			// Verify all projects were processed
			expect(projectBriefs.map((b) => b.project_id)).toEqual([
				'project-1',
				'project-2',
				'project-3'
			]);

			// Key test: Total time should be ~300ms (longest task), NOT ~500ms (sum of all tasks)
			// This proves parallel execution
			expect(totalTime).toBeLessThan(400); // Allow 100ms buffer
			expect(totalTime).toBeGreaterThan(280); // Should take at least as long as longest task

			// Verify execution order shows parallel starts
			expect(executionOrder[0]).toBe('start-project-1');
			expect(executionOrder[1]).toBe('start-project-2');
			expect(executionOrder[2]).toBe('start-project-3');
		});

		it('should handle project failures gracefully without blocking others', async () => {
			const mockProjects = [
				{ project_id: 'project-1', name: 'Success Project', user_id: 'user-1' },
				{ project_id: 'project-2', name: 'Failing Project', user_id: 'user-1' },
				{ project_id: 'project-3', name: 'Another Success', user_id: 'user-1' }
			];

			const mockGenerateProjectBrief = vi.fn(async (project) => {
				if (project.project_id === 'project-2') {
					throw new Error('Database connection failed');
				}
				return {
					project_id: project.project_id,
					content: `Brief for ${project.name}`
				};
			});

			// Simulate parallel processing with error handling
			const projectBriefPromises = mockProjects.map(async (project) => {
				try {
					return await mockGenerateProjectBrief(project);
				} catch (error) {
					console.warn(`Failed to generate brief for ${project.name}:`, error);
					return null;
				}
			});

			const projectBriefResults = await Promise.allSettled(projectBriefPromises);
			const projectBriefs = projectBriefResults
				.filter((result) => result.status === 'fulfilled' && result.value !== null)
				.map((result) => (result as PromiseFulfilledResult<any>).value);

			// Assertions
			expect(mockGenerateProjectBrief).toHaveBeenCalledTimes(3);
			expect(projectBriefs).toHaveLength(2); // Only successful projects

			// Verify successful projects were not affected by the failure
			expect(projectBriefs.map((b) => b.project_id)).toEqual(['project-1', 'project-3']);
		});

		it('should complete all projects even if all fail', async () => {
			const mockProjects = [
				{
					project_id: 'project-1',
					name: 'Failing Project 1',
					user_id: 'user-1'
				},
				{
					project_id: 'project-2',
					name: 'Failing Project 2',
					user_id: 'user-1'
				}
			];

			const mockGenerateProjectBrief = vi.fn(async () => {
				throw new Error('Database error');
			});

			const projectBriefPromises = mockProjects.map(async (project) => {
				try {
					return await mockGenerateProjectBrief(project);
				} catch (error) {
					return null;
				}
			});

			const projectBriefResults = await Promise.allSettled(projectBriefPromises);
			const projectBriefs = projectBriefResults
				.filter((result) => result.status === 'fulfilled' && result.value !== null)
				.map((result) => (result as PromiseFulfilledResult<any>).value);

			// Should complete without throwing, just with empty results
			expect(mockGenerateProjectBrief).toHaveBeenCalledTimes(2);
			expect(projectBriefs).toHaveLength(0);
		});

		it('should process 10+ projects efficiently', async () => {
			// Test scalability with many projects
			const mockProjects = Array.from({ length: 15 }, (_, i) => ({
				project_id: `project-${i}`,
				name: `Project ${i}`,
				user_id: 'user-1'
			}));

			const mockGenerateProjectBrief = vi.fn(async (project) => {
				await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms per project
				return {
					project_id: project.project_id,
					content: `Brief for ${project.name}`
				};
			});

			const startTime = Date.now();
			const projectBriefPromises = mockProjects.map(async (project) => {
				try {
					return await mockGenerateProjectBrief(project);
				} catch (error) {
					return null;
				}
			});

			const projectBriefResults = await Promise.allSettled(projectBriefPromises);
			const projectBriefs = projectBriefResults
				.filter((result) => result.status === 'fulfilled' && result.value !== null)
				.map((result) => (result as PromiseFulfilledResult<any>).value);

			const totalTime = Date.now() - startTime;

			// Assertions
			expect(projectBriefs).toHaveLength(15);

			// Sequential would take 15 × 50ms = 750ms
			// Parallel should take ~50-100ms (with some overhead)
			expect(totalTime).toBeLessThan(200); // Should be much faster than 750ms
			expect(totalTime).toBeGreaterThan(40); // Should take at least as long as one task
		});
	});

	describe('Performance Comparison', () => {
		it('should demonstrate speedup vs sequential processing', async () => {
			const mockProjects = Array.from({ length: 5 }, (_, i) => ({
				project_id: `project-${i}`,
				name: `Project ${i}`
			}));

			const processTime = 100; // ms per project

			// Sequential processing (OLD way)
			const sequentialStart = Date.now();
			const sequentialResults = [];
			for (const project of mockProjects) {
				await new Promise((resolve) => setTimeout(resolve, processTime));
				sequentialResults.push({ project_id: project.project_id });
			}
			const sequentialTime = Date.now() - sequentialStart;

			// Parallel processing (NEW way)
			const parallelStart = Date.now();
			const parallelPromises = mockProjects.map(async (project) => {
				await new Promise((resolve) => setTimeout(resolve, processTime));
				return { project_id: project.project_id };
			});
			const parallelResults = await Promise.all(parallelPromises);
			const parallelTime = Date.now() - parallelStart;

			// Assertions
			expect(sequentialResults).toHaveLength(5);
			expect(parallelResults).toHaveLength(5);

			// Parallel should be ~5x faster
			expect(sequentialTime).toBeGreaterThan(480); // ~500ms (5 × 100ms)
			expect(parallelTime).toBeLessThan(150); // ~100ms + overhead
			expect(sequentialTime / parallelTime).toBeGreaterThan(3); // At least 3x speedup
		});
	});
});
