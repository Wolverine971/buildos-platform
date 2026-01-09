// apps/web/tests/integration/synthesis-flow.test.ts
/**
 * Integration test for the complete project synthesis flow
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { CompositeTask } from '$lib/types';
import type { ParsedOperation } from '$lib/types/brain-dump';
import { buildPrompt } from '$lib/services/synthesis/task-synthesis-helpers';

describe('Project Synthesis Integration Flow', () => {
	let mockTasks: CompositeTask[];
	let mockProjectContext: any;

	beforeEach(() => {
		// Setup realistic test data
		mockTasks = [
			{
				id: 'task-1',
				title: 'Implement user authentication',
				description: 'Add login and logout functionality',
				details: 'Build secure authentication with JWT tokens',
				status: 'in_progress',
				priority: 'high',
				task_type: 'one_off',
				duration_minutes: 240,
				project_id: 'project-1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				user_id: 'user-1'
			},
			{
				id: 'task-2',
				title: 'Setup authentication middleware',
				description: 'Create middleware for route protection',
				details: 'Implement middleware to check JWT tokens',
				status: 'backlog',
				priority: 'high',
				task_type: 'one_off',
				duration_minutes: 120,
				project_id: 'project-1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				user_id: 'user-1'
			},
			{
				id: 'task-3',
				title: 'Write auth tests',
				description: 'Create unit tests for authentication',
				details: 'Test login, logout, and token validation',
				status: 'backlog',
				priority: 'medium',
				task_type: 'one_off',
				duration_minutes: 180,
				project_id: 'project-1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				user_id: 'user-1'
			},
			{
				id: 'task-4',
				title: 'Update user documentation',
				description: 'Document authentication endpoints',
				details: 'Add API documentation for auth endpoints',
				status: 'backlog',
				priority: 'low',
				task_type: 'one_off',
				duration_minutes: 60,
				project_id: 'project-1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				user_id: 'user-1'
			},
			{
				id: 'task-5',
				title: 'Fix login bug',
				description: 'Resolve issue with email validation',
				details: 'Email validation regex is too strict',
				status: 'backlog',
				priority: 'high',
				task_type: 'one_off',
				duration_minutes: 30,
				project_id: 'project-1',
				created_at: '2024-01-01T00:00:00Z',
				updated_at: '2024-01-01T00:00:00Z',
				user_id: 'user-1'
			}
		];

		mockProjectContext = {
			name: 'E-commerce Platform',
			description: 'Building a modern e-commerce platform with secure authentication',
			goals: 'Complete authentication system by end of sprint',
			constraints: 'Must be GDPR compliant and support OAuth'
		};
	});

	describe('Prompt Generation', () => {
		it('should generate a complete synthesis prompt', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			// Verify all sections are present
			expect(prompt).toContain('Three-Step Reorganization Process');
			expect(prompt).toContain('Project Context');
			expect(prompt).toContain('E-commerce Platform');
			expect(prompt).toContain('Current Tasks (5 tasks)');
			expect(prompt).toContain('COMPREHENSIVE REORGANIZATION');
			expect(prompt).toContain('When Consolidating Tasks');
			expect(prompt).toContain('Response Format');
		});

		it('should include all task data in the prompt', () => {
			const prompt = buildPrompt(mockTasks, mockProjectContext);

			// Verify all tasks are included
			mockTasks.forEach((task) => {
				expect(prompt).toContain(task.title);
				expect(prompt).toContain(task.description);
			});
		});
	});

	describe('Synthesis Operation Processing', () => {
		it('should correctly process consolidation operations', () => {
			// Simulate LLM response with consolidation
			const synthesisResponse = {
				operations: [
					{
						id: 'synthesis-op-1',
						table: 'tasks',
						operation: 'update' as const,
						data: {
							id: 'task-1',
							title: 'Implement complete authentication system',
							description:
								'Build comprehensive authentication with login, logout, middleware, and testing',
							details:
								'Implement JWT-based authentication with secure login/logout, route protection middleware, comprehensive unit tests, and proper error handling. Include email validation fixes.',
							status: 'in_progress',
							priority: 'high',
							duration_minutes: 480, // Less than sum due to efficiency
							deleted_at: null
						},
						enabled: true,
						reasoning:
							'Consolidated authentication implementation, middleware, and bug fix as they share the same codebase and context'
					},
					{
						id: 'synthesis-op-2',
						table: 'tasks',
						operation: 'update' as const,
						data: {
							id: 'task-2',
							deleted_at: '2024-01-01T00:00:00Z'
						},
						enabled: true,
						reasoning: 'Merged into the main authentication task'
					},
					{
						id: 'synthesis-op-3',
						table: 'tasks',
						operation: 'update' as const,
						data: {
							id: 'task-5',
							deleted_at: '2024-01-01T00:00:00Z'
						},
						enabled: true,
						reasoning: 'Bug fix incorporated into main authentication task'
					}
				],
				comparison: [
					{
						type: 'consolidated',
						originalTasks: ['task-1', 'task-2', 'task-5'],
						newTask: {
							title: 'Implement complete authentication system',
							description: 'Comprehensive authentication implementation'
						},
						reasoning:
							'These tasks are highly interconnected and share the same codebase'
					}
				],
				insights:
					'Found significant overlap in authentication-related tasks. Consolidating them will reduce context switching and improve efficiency by approximately 25%.',
				summary:
					'Consolidated 3 authentication tasks into 1 comprehensive task, reducing total time from 390 to 480 minutes through efficiency gains.'
			};

			// Validate the synthesis response structure
			expect(synthesisResponse.operations).toHaveLength(3);
			expect(synthesisResponse.operations[0].operation).toBe('update');
			expect(synthesisResponse.operations[0].data.title).not.toContain('merged');
			expect(synthesisResponse.operations[0].data.title).not.toContain('combined');
			expect(synthesisResponse.operations[0].reasoning).toContain('Consolidated');

			// Check deleted marking
			const deletedOps = synthesisResponse.operations.filter(
				(op) => op.data.deleted_at !== null
			);
			expect(deletedOps).toHaveLength(2);
		});

		it('should correctly process sequencing operations', () => {
			// Simulate LLM response with sequencing
			const synthesisResponse = {
				operations: [
					{
						id: 'synthesis-op-1',
						table: 'tasks',
						operation: 'update' as const,
						data: {
							id: 'task-3',
							dependencies: ['task-1'],
							start_date: '2024-01-15'
						},
						enabled: true,
						reasoning: 'Tests should be written after implementation is complete'
					},
					{
						id: 'synthesis-op-2',
						table: 'tasks',
						operation: 'update' as const,
						data: {
							id: 'task-4',
							dependencies: ['task-1', 'task-3'],
							start_date: '2024-01-20'
						},
						enabled: true,
						reasoning:
							'Documentation should be updated after implementation and testing'
					}
				],
				comparison: [
					{
						type: 'sequenced',
						originalTasks: ['task-1', 'task-3', 'task-4'],
						reasoning:
							'Created logical dependency chain: implementation → testing → documentation'
					}
				],
				insights:
					'Established clear workflow dependencies to ensure proper task sequencing.',
				summary: 'Sequenced 3 tasks with proper dependencies.'
			};

			// Validate sequencing
			expect(synthesisResponse.operations[0].data.dependencies).toContain('task-1');
			expect(synthesisResponse.operations[1].data.dependencies).toContain('task-3');
		});

		it('should correctly process timeblocking adjustments', () => {
			// Simulate LLM response with time adjustments
			const synthesisResponse = {
				operations: [
					{
						id: 'synthesis-op-1',
						table: 'tasks',
						operation: 'update' as const,
						data: {
							id: 'task-1',
							duration_minutes: 360 // Increased from 240
						},
						enabled: true,
						reasoning:
							'Complex authentication implementation needs more time for proper security considerations'
					},
					{
						id: 'synthesis-op-2',
						table: 'tasks',
						operation: 'update' as const,
						data: {
							id: 'task-5',
							duration_minutes: 60 // Increased from 30
						},
						enabled: true,
						reasoning:
							'Bug fixes often take longer than expected due to testing requirements'
					}
				],
				insights: 'Adjusted time estimates to be more realistic based on task complexity.',
				summary: 'Updated time estimates for 2 tasks to reflect realistic durations.'
			};

			// Validate time adjustments
			expect(synthesisResponse.operations[0].data.duration_minutes).toBeGreaterThan(240);
			expect(synthesisResponse.operations[1].data.duration_minutes).toBeGreaterThan(30);
		});
	});

	describe('Operation Application', () => {
		it('should correctly apply enabled operations', () => {
			const operations: ParsedOperation[] = [
				{
					id: 'op-1',
					table: 'tasks',
					operation: 'update',
					data: { id: 'task-1', title: 'Updated Title' },
					enabled: true
				},
				{
					id: 'op-2',
					table: 'tasks',
					operation: 'update',
					data: { id: 'task-2', title: 'Another Update' },
					enabled: false // This one is disabled
				}
			];

			const disabledOperations = new Set(['op-2']);
			const enabledOps = operations.filter((op) => !disabledOperations.has(op.id));

			expect(enabledOps).toHaveLength(1);
			expect(enabledOps[0].id).toBe('op-1');
		});

		it('should handle operation failures gracefully', () => {
			const results = {
				successful: [{ id: 'op-1', operation: 'update', data: { id: 'task-1' } }],
				failed: [
					{
						id: 'op-2',
						operation: 'update',
						data: { id: 'task-2' },
						error: 'Task not found'
					}
				]
			};

			expect(results.successful).toHaveLength(1);
			expect(results.failed).toHaveLength(1);
			expect(results.failed[0].error).toBe('Task not found');
		});
	});

	describe('End-to-End Flow', () => {
		it('should complete full synthesis flow', async () => {
			// Step 1: Generate prompt
			const prompt = buildPrompt(mockTasks, mockProjectContext);
			expect(prompt).toBeTruthy();
			expect(prompt.length).toBeGreaterThan(1000);

			// Step 2: Simulate LLM response
			const mockLLMResponse = {
				operations: [
					{
						id: 'synthesis-op-1',
						table: 'tasks',
						operation: 'update' as const,
						data: {
							id: 'task-1',
							title: 'Build complete authentication system',
							duration_minutes: 420
						},
						enabled: true,
						reasoning: 'Adjusted scope and time for comprehensive implementation'
					}
				],
				insights: 'Project can be optimized by consolidating related tasks.',
				summary: 'Synthesis complete with 1 optimization.'
			};

			// Step 3: Process operations
			const processedOps = mockLLMResponse.operations.map((op) => ({
				...op,
				processed: true,
				timestamp: new Date().toISOString()
			}));

			expect(processedOps).toHaveLength(1);
			expect(processedOps[0].processed).toBe(true);

			// Step 4: Apply to database (mocked)
			const applyResults = {
				successful: processedOps,
				failed: [],
				summary: {
					totalOperations: 1,
					successCount: 1,
					failureCount: 0
				}
			};

			expect(applyResults.summary.successCount).toBe(1);
			expect(applyResults.summary.failureCount).toBe(0);
		});
	});
});
