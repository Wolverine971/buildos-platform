// src/lib/utils/__tests__/brain-dump-integration-simple.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock SvelteKit navigation module
vi.mock('$app/navigation', () => ({
	invalidate: vi.fn()
}));

// Import after mocking dependencies
import { BrainDumpProcessor } from '../braindump-processor';

describe('Brain Dump Processor Integration - Simple Tests', () => {
	let processor: BrainDumpProcessor;
	let mockSupabase: any;
	const testUserId = '550e8400-e29b-41d4-a716-446655440000';

	// Mock Supabase client with comprehensive chaining support
	const createMockSupabase = () => {
		const mockChain = {
			from: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			insert: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			single: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			rpc: vi.fn().mockResolvedValue({ data: null, error: null })
		};

		// All methods return the mockChain to support chaining
		Object.keys(mockChain).forEach((key) => {
			if (!['single', 'rpc'].includes(key)) {
				mockChain[key].mockReturnValue(mockChain);
			}
		});

		return mockChain;
	};

	beforeEach(() => {
		mockSupabase = createMockSupabase();
		processor = new BrainDumpProcessor(mockSupabase);
		vi.clearAllMocks();
	});

	describe('New Project Creation Flow', () => {
		it('should handle new project brain dump without existing project', async () => {
			const brainDump = `I want to build a simple todo app.
			
			Features:
			- Add/remove tasks
			- Mark as complete
			- Filter by status
			
			First task: Set up project structure`;

			// Mock no existing project (selectedProjectId = 'new')
			mockSupabase.single.mockResolvedValue({ data: null, error: null });

			// Mock LLM response for new project
			const mockLLMResponse = {
				title: 'Simple Todo App',
				summary: 'New todo app project created',
				insights: 'Simple project with clear requirements',
				processingNote: 'Focused todo app project',
				operations: [
					{
						id: 'op-1',
						table: 'projects',
						operation: 'create',
						ref: 'todo-app-1',
						data: {
							name: 'Simple Todo App',
							description: 'Basic todo application',
							status: 'active',
							slug: 'simple-todo-app'
						},
						enabled: true
					}
				],
				metadata: {
					totalOperations: 1,
					tableBreakdown: { projects: 1 },
					processingTime: 1000,
					timestamp: new Date().toISOString(),
					project_info: null,
					processingMode: 'single'
				}
			};

			vi.spyOn(processor['llmPool'], 'makeRequest').mockResolvedValue({
				result: mockLLMResponse,
				content: JSON.stringify(mockLLMResponse),
				model: 'gpt-4o',
				usage: { total_tokens: 500 }
			});

			// Mock successful project creation
			mockSupabase.single.mockResolvedValue({
				data: { id: '550e8400-e29b-41d4-a716-446655440001' },
				error: null
			});

			const result = await processor.processBrainDump({
				brainDump,
				userId: testUserId,
				selectedProjectId: 'new',
				options: { autoExecute: true },
				brainDumpId: 'test-brain-dump-id-1'
			});

			// Verify basic structure
			expect(result.title).toBe('Simple Todo App');
			expect(result.operations).toHaveLength(1);
			expect(result.operations[0].table).toBe('projects');
			expect(result.operations[0].operation).toBe('create');
		});
	});

	describe('Existing Project Update Flow', () => {
		it('should handle brain dump for existing project', async () => {
			const brainDump = `Update for the todo app:
			
			We need to add user authentication and data persistence.
			
			New tasks:
			- Set up user auth system
			- Add database integration
			- Create user registration flow`;

			const projectId = '550e8400-e29b-41d4-a716-446655440001';

			// Mock getting existing project data with all required database calls
			const mockProjectData = {
				id: projectId,
				name: 'Simple Todo App',
				description: 'Basic todo application',
				context: 'Initial project context',
				status: 'active'
			};

			// Mock the complex query chain for getDataForProject
			mockSupabase.single
				// First call for project data
				.mockResolvedValueOnce({ data: mockProjectData, error: null })
				// Second call for tasks
				.mockResolvedValueOnce({ data: [], error: null })
				// Third call for notes
				.mockResolvedValueOnce({ data: [], error: null });

			// Mock LLM response for existing project update
			const mockLLMResponse = {
				title: 'Todo App Authentication Update',
				summary: 'Added authentication and persistence features',
				insights: 'Expanding to more robust application architecture',
				operations: [
					{
						id: 'op-1',
						table: 'tasks',
						operation: 'create',
						data: {
							title: 'Set up user auth system',
							project_id: projectId,
							status: 'backlog',
							priority: 'high'
						},
						enabled: true
					}
				],
				metadata: {
					totalOperations: 1,
					tableBreakdown: { tasks: 1 },
					processingTime: 800,
					timestamp: new Date().toISOString(),
					project_info: {
						id: projectId,
						name: 'Simple Todo App',
						slug: null,
						isNew: false
					},
					processingMode: 'single'
				}
			};

			vi.spyOn(processor['llmPool'], 'makeRequest').mockResolvedValue({
				result: mockLLMResponse,
				content: JSON.stringify(mockLLMResponse),
				model: 'gpt-4o',
				usage: { total_tokens: 800 }
			});

			// Mock successful task creation
			mockSupabase.single.mockResolvedValue({
				data: { id: '550e8400-e29b-41d4-a716-446655440002' },
				error: null
			});

			const result = await processor.processBrainDump({
				brainDump,
				userId: testUserId,
				selectedProjectId: projectId,
				options: { autoExecute: true },
				brainDumpId: 'test-brain-dump-id-2'
			});

			// Verify update structure
			expect(result.title).toBe('Todo App Authentication Update');
			expect(result.operations).toHaveLength(1);
			expect(result.operations[0].table).toBe('tasks');
			expect(result.operations[0].data.project_id).toBe(projectId);
		});
	});

	describe('Reference Resolution Testing', () => {
		it('should properly resolve project references in new project with tasks', async () => {
			const brainDump = `Create a blog platform project.
			
			Core features:
			- User authentication
			- Post creation and editing
			- Comments system
			
			Initial tasks:
			- Set up project structure
			- Design database schema
			- Create authentication system`;

			const projectId = '550e8400-e29b-41d4-a716-446655440001';

			// Mock LLM response with project and tasks
			const mockLLMResponse = {
				title: 'Blog Platform',
				summary: 'New blog platform with authentication and commenting',
				insights: 'Comprehensive blogging platform with user management',
				operations: [
					{
						id: 'op-1',
						table: 'projects',
						operation: 'create',
						ref: 'blog-platform-1',
						data: {
							name: 'Blog Platform',
							description: 'Full-featured blogging platform',
							status: 'active',
							slug: 'blog-platform'
						},
						enabled: true
					},
					{
						id: 'op-2',
						table: 'tasks',
						operation: 'create',
						data: {
							title: 'Set up project structure',
							project_ref: 'blog-platform-1', // Should resolve to project_id
							status: 'backlog',
							priority: 'high',
							task_type: 'one_off'
						},
						enabled: true
					},
					{
						id: 'op-3',
						table: 'tasks',
						operation: 'create',
						data: {
							title: 'Design database schema',
							project_ref: 'blog-platform-1', // Should resolve to project_id
							status: 'backlog',
							priority: 'high',
							task_type: 'one_off'
						},
						enabled: true
					}
				],
				metadata: {
					totalOperations: 1,
					tableBreakdown: { tasks: 1 },
					processingTime: 800,
					timestamp: new Date().toISOString(),
					project_info: {
						id: projectId,
						name: 'Simple Todo App',
						slug: null,
						isNew: false
					},
					processingMode: 'single'
				}
			};

			vi.spyOn(processor['llmPool'], 'makeRequest').mockResolvedValue({
				result: mockLLMResponse,
				content: JSON.stringify(mockLLMResponse),
				model: 'gpt-4o',
				usage: { total_tokens: 1200 }
			});

			// Mock database operations - first check for existing project, then create operations
			let callCount = 0;
			mockSupabase.single.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// Initial check for existing project - none found
					return Promise.resolve({
						data: null,
						error: null
					});
				} else if (callCount === 2) {
					// Project creation
					return Promise.resolve({
						data: { id: '550e8400-e29b-41d4-a716-446655440003' },
						error: null
					});
				} else if (callCount <= 4) {
					// Task creation (2 tasks)
					return Promise.resolve({
						data: { id: `550e8400-e29b-41d4-a716-44665544000${callCount}` },
						error: null
					});
				} else {
					// Brain dump save
					return Promise.resolve({
						data: { id: 'brain-dump-001' },
						error: null
					});
				}
			});

			const result = await processor.processBrainDump({
				brainDump,
				userId: testUserId,
				selectedProjectId: 'new',
				options: { autoExecute: true },
				brainDumpId: 'test-brain-dump-id-1'
			});

			// Verify operations were created and executed
			expect(result.operations).toHaveLength(3);

			// Verify project creation
			const projectOp = result.operations.find((op) => op.table === 'projects');
			expect(projectOp).toBeDefined();
			expect(projectOp?.ref).toBe('blog-platform-1');

			// Verify tasks reference the project
			const taskOps = result.operations.filter((op) => op.table === 'tasks');
			expect(taskOps).toHaveLength(2);

			// Tasks should have project_ref that gets resolved to project_id during execution
			taskOps.forEach((task) => {
				expect(task.data.project_ref).toBe('blog-platform-1');
			});

			// Verify execution results
			expect(result.executionResult).toBeDefined();
			expect(result.executionResult?.successful).toHaveLength(3);
			expect(result.executionResult?.failed).toHaveLength(0);
		});
	});

	describe('Error Handling', () => {
		it('should handle LLM API failures gracefully', async () => {
			const brainDump = 'Simple test brain dump';

			// Mock LLM failure
			vi.spyOn(processor['llmPool'], 'makeRequest').mockRejectedValue(
				new Error('LLM service unavailable')
			);

			await expect(
				processor.processBrainDump({
					brainDump,
					userId: testUserId,
					selectedProjectId: 'new',
					options: { autoExecute: true },
					brainDumpId: 'test-brain-dump-id-3'
				})
			).rejects.toThrow('Brain dump processing failed');
		});

		it('should handle database operation failures', async () => {
			const brainDump = 'Test brain dump for database error';
			const projectId = '550e8400-e29b-41d4-a716-446655440001';

			// Mock successful LLM response
			const mockLLMResponse = {
				title: 'Test Project',
				summary: 'Test project for error handling',
				insights: 'Testing database error scenarios',
				operations: [
					{
						id: 'op-1',
						table: 'projects',
						operation: 'create',
						data: { name: 'Test Project', slug: 'test-project' },
						enabled: true
					}
				],
				metadata: {
					totalOperations: 1,
					tableBreakdown: { tasks: 1 },
					processingTime: 800,
					timestamp: new Date().toISOString(),
					project_info: {
						id: projectId,
						name: 'Simple Todo App',
						slug: null,
						isNew: false
					},
					processingMode: 'single'
				}
			};

			vi.spyOn(processor['llmPool'], 'makeRequest').mockResolvedValue({
				result: mockLLMResponse,
				content: JSON.stringify(mockLLMResponse),
				model: 'gpt-4o',
				usage: { total_tokens: 300 }
			});

			// Mock brain dump save success but operation execution failure
			mockSupabase.single.mockResolvedValueOnce({
				data: { id: 'test-brain-dump-id-3' },
				error: null
			});

			// Mock operation failure
			mockSupabase.from.mockReturnValue(mockSupabase);
			mockSupabase.insert.mockResolvedValueOnce({
				data: null,
				error: { message: 'Database connection failed' }
			});

			const result = await processor.processBrainDump({
				brainDump,
				userId: testUserId,
				selectedProjectId: 'new',
				options: { autoExecute: true },
				brainDumpId: 'test-brain-dump-id-3'
			});

			// The processor should complete successfully even if operations fail
			expect(result).toBeDefined();
			expect(result.title).toBe('Test Project');
			// Check if there are any operations that may have failed
			// The exact behavior depends on the implementation
		});
	});
});
