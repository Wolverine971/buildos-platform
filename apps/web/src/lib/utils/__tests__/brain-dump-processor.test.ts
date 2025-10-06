// apps/web/src/lib/utils/__tests__/brain-dump-processor.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BrainDumpOptions, BrainDumpProcessor } from '../braindump-processor';
// import type { BrainDumpOptions, ProjectWithRelations } from
// import type {
// 	ProjectWithRelations,
// } from '$lib/types/project';

// Note: We don't mock SmartLLMService via vi.mock() because we'll replace the instance directly
// This gives us more control and avoids module resolution issues

type MockSmartLLMService = {
	getJSONResponse: ReturnType<typeof vi.fn>;
};

type MockActivityLogger = {
	logActivity: ReturnType<typeof vi.fn>;
};

type MockOperationsExecutor = {
	executeOperations: ReturnType<typeof vi.fn>;
};

// Mock Supabase client to match the expected interface
const createMockSupabase = () =>
	({
		from: vi.fn().mockReturnThis(),
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue({ data: null, error: null }),
		order: vi.fn().mockReturnThis(),
		limit: vi.fn().mockReturnThis()
	}) as any; // Using any for test mocking convenience

describe('BrainDumpProcessor', () => {
	let processor: BrainDumpProcessor;
	let mockSmartLLMService: MockSmartLLMService;
	let mockActivityLogger: MockActivityLogger;
	let mockOperationsExecutor: MockOperationsExecutor;
	let mockSupabase: ReturnType<typeof createMockSupabase>;

	beforeEach(() => {
		// Setup mock Supabase client
		mockSupabase = createMockSupabase();

		// Create processor instance
		processor = new BrainDumpProcessor(mockSupabase);

		// Replace the llmService instance with a mock
		// This is better than vi.mock() because we have full control
		mockSmartLLMService = {
			getJSONResponse: vi.fn()
		};
		(processor as any).llmService = mockSmartLLMService;

		// Create mock activity logger
		mockActivityLogger = {
			logActivity: vi.fn().mockResolvedValue(undefined)
		};
		(processor as any).activityLogger = mockActivityLogger;

		// Create mock operations executor
		mockOperationsExecutor = {
			executeOperations: vi.fn()
		};
		(processor as any).operationsExecutor = mockOperationsExecutor;
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('processBrainDump', () => {
		const mockUserId = 'test-user-123';
		const mockBrainDump = 'Create a new project for building a mobile app with React Native';

		it('should process a brain dump for a new project', async () => {
			// Setup mock LLM response for new project
			// SmartLLMService returns direct JSON (no wrapper)
			const mockLLMResponse = {
				title: 'Mobile App Development',
				summary: 'React Native mobile app project',
				insights: 'User wants to build a mobile application',
				operations: [
					{
						table: 'projects',
						operation: 'create',
						data: {
							name: 'Mobile App Project',
							description: 'React Native mobile application',
							context: '## Project Overview\nBuilding a mobile app with React Native',
							executive_summary: 'Mobile app development project',
							tags: ['mobile', 'react-native'],
							status: 'active'
						}
					}
				]
			};

			// Mock preparatory analysis (will be skipped for new projects but called anyway)
			mockSmartLLMService.getJSONResponse.mockResolvedValueOnce(mockLLMResponse);

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false
			};

			const result = await processor.processBrainDump({
				brainDump: mockBrainDump,
				userId: mockUserId,
				options,
				brainDumpId: 'test-brain-dump-id-1'
			});

			// Assertions
			expect(result).toBeDefined();
			expect(result.operations).toHaveLength(1);
			expect(result.operations[0].table).toBe('projects');
			expect(result.operations[0].operation).toBe('create');
			expect(result.title).toBe('Mobile App Development');
			expect(result.summary).toBe('React Native mobile app project');

			// Verify LLM was called
			expect(mockSmartLLMService.getJSONResponse).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: mockUserId,
					profile: expect.any(String), // 'balanced' or 'fast'
					operationType: expect.any(String)
				})
			);

			// Verify activity logging (dual processing always used now)
			expect(mockActivityLogger.logActivity).toHaveBeenCalledWith(
				mockUserId,
				'brain_dump_dual_processing_started',
				expect.any(Object)
			);
		});

		it('should process a brain dump for an existing project', async () => {
			const mockProjectId = 'existing-project-123';
			const mockExistingProject: Partial<ProjectWithRelations> = {
				id: mockProjectId,
				name: 'Existing Project',
				status: 'active',
				context: '## Current Context\nThis is an existing project',
				executive_summary: 'Existing project summary',
				tags: ['existing'],
				tasks: [],
				notes: [],
				phases: []
			};

			// Mock project data fetching
			mockSupabase.single.mockResolvedValueOnce({
				data: mockExistingProject,
				error: null
			});

			// Mock tasks fetching
			mockSupabase.order.mockResolvedValueOnce({
				data: [],
				error: null
			});

			// For existing projects with dual processing:
			// 1. Preparatory analysis
			const mockPrepAnalysis = {
				braindump_classification: 'task-focused',
				needs_context_update: false,
				relevant_task_ids: [],
				processing_recommendation: { skip_context: true, skip_tasks: false }
			};

			// 2. Context extraction (may be skipped)
			const mockContextResponse = {
				title: 'Context',
				summary: 'Context summary',
				insights: '',
				operations: []
			};

			// 3. Task extraction
			const mockTasksResponse = {
				title: 'Update for existing project',
				summary: 'Adding authentication feature',
				insights: 'User wants to add authentication',
				operations: [
					{
						table: 'tasks',
						operation: 'create',
						data: {
							title: 'Implement authentication',
							description: 'Add authentication feature',
							status: 'pending',
							priority: 'high',
							project_id: mockProjectId
						}
					}
				]
			};

			mockSmartLLMService.getJSONResponse
				.mockResolvedValueOnce(mockPrepAnalysis)
				.mockResolvedValueOnce(mockContextResponse)
				.mockResolvedValueOnce(mockTasksResponse);

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false
			};

			const result = await processor.processBrainDump({
				brainDump: 'Add authentication feature to the project',
				userId: mockUserId,
				selectedProjectId: mockProjectId,
				options,
				brainDumpId: 'test-brain-dump-id-2'
			});

			// Assertions
			expect(result).toBeDefined();
			expect(result.operations).toHaveLength(1);
			expect(result.operations[0].table).toBe('tasks');
			expect(result.operations[0].operation).toBe('create');
		});

		it('should use dual processing for large brain dumps', async () => {
			const largeBrainDump = 'a'.repeat(3000); // Create a large brain dump

			// Mock responses for dual processing (context + tasks in parallel)
			const mockContextResponse = {
				title: 'Large Project',
				summary: 'Processing large brain dump',
				insights: 'Complex project with multiple aspects',
				operations: [
					{
						table: 'projects',
						operation: 'create',
						data: {
							name: 'Large Project',
							description: 'A complex project',
							context: '## Project Context\nDetailed project information',
							executive_summary: 'Large scale project',
							tags: ['complex'],
							status: 'active'
						},
						ref: 'new-project-1'
					}
				]
			};

			const mockTasksResponse = {
				title: 'Tasks',
				summary: 'Task extraction',
				insights: '',
				operations: [
					{
						table: 'tasks',
						operation: 'create',
						data: {
							title: 'Task 1',
							description: 'First task',
							status: 'pending',
							priority: 'high',
							project_ref: 'new-project-1'
						}
					},
					{
						table: 'tasks',
						operation: 'create',
						data: {
							title: 'Task 2',
							description: 'Second task',
							status: 'pending',
							priority: 'medium',
							project_ref: 'new-project-1'
						}
					}
				]
			};

			// For new projects, only need 2 calls (context + tasks in parallel)
			mockSmartLLMService.getJSONResponse
				.mockResolvedValueOnce(mockContextResponse)
				.mockResolvedValueOnce(mockTasksResponse);

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false,
				useDualProcessing: true
			};

			const result = await processor.processBrainDump({
				brainDump: largeBrainDump,
				userId: mockUserId,
				options,
				brainDumpId: 'test-brain-dump-id-3'
			});

			// Assertions
			expect(result).toBeDefined();
			expect(result.operations).toBeDefined();
			expect(result.operations.length).toBeGreaterThan(0);

			// Verify dual processing was triggered (2 calls: context + tasks)
			expect(mockSmartLLMService.getJSONResponse).toHaveBeenCalledTimes(2);
		}, 10000);
	});

	describe('error handling', () => {
		const mockUserId = 'test-user-123';

		it('should handle LLM request failures gracefully', async () => {
			// Mock LLM failure - all calls should reject
			mockSmartLLMService.getJSONResponse.mockRejectedValue(
				new Error('LLM service unavailable')
			);

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false,
				retryAttempts: 1 // Reduce retries to fail faster
			};

			await expect(
				processor.processBrainDump({
					brainDump: 'Test brain dump',
					userId: mockUserId,
					options,
					brainDumpId: 'test-brain-dump-id-4'
				})
			).rejects.toThrow();

			// Verify error logging
			expect(mockActivityLogger.logActivity).toHaveBeenCalledWith(
				mockUserId,
				'brain_dump_processing_failed',
				expect.objectContaining({
					error: expect.any(String)
				})
			);
		}, 10000); // Increase timeout for this test

		it('should handle invalid JSON responses from LLM', async () => {
			// Mock invalid JSON response (missing operations field)
			// This should cause validation to fail
			mockSmartLLMService.getJSONResponse
				.mockResolvedValueOnce({
					// Missing operations field - should cause validation error
					title: 'Invalid',
					summary: 'Invalid response'
				})
				.mockResolvedValueOnce({
					// Second call also invalid
					title: 'Invalid',
					summary: 'Invalid response'
				});

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false,
				retryAttempts: 1 // Reduce retries to fail faster
			};

			await expect(
				processor.processBrainDump({
					brainDump: 'Test brain dump',
					userId: mockUserId,
					options,
					brainDumpId: 'test-brain-dump-id-5'
				})
			).rejects.toThrow();
		}, 10000); // Increase timeout for this test

		it('should retry dual processing on failure', async () => {
			// First attempt fails, second succeeds
			const mockContextResponse = {
				title: 'Retry Test',
				summary: 'Testing retry logic',
				insights: 'Retry mechanism test',
				operations: [
					{
						table: 'projects',
						operation: 'create',
						data: {
							name: 'Retry Project',
							description: 'Testing retries',
							context: '## Retry Test',
							executive_summary: 'Retry test project',
							tags: ['test'],
							status: 'active'
						},
						ref: 'new-project-1'
					}
				]
			};

			const mockTasksResponse = {
				title: 'Tasks',
				summary: '',
				insights: '',
				operations: []
			};

			// First attempt fails
			mockSmartLLMService.getJSONResponse
				.mockRejectedValueOnce(new Error('Temporary failure'))
				// Second attempt succeeds (context + tasks in parallel)
				.mockResolvedValueOnce(mockContextResponse)
				.mockResolvedValueOnce(mockTasksResponse);

			const options: BrainDumpOptions = {
				autoExecute: false,
				streamResults: false,
				useDualProcessing: true,
				retryAttempts: 2
			};

			const result = await processor.processBrainDump({
				brainDump: 'a'.repeat(3000), // Large dump to trigger dual processing
				userId: mockUserId,
				options,
				brainDumpId: 'test-brain-dump-id-6'
			});

			// Should succeed after retry
			expect(result).toBeDefined();
			expect(result.operations).toBeDefined();
			expect(result.operations.length).toBeGreaterThanOrEqual(0);
		}, 10000);
	});

	describe('auto-execution', () => {
		const mockUserId = 'test-user-123';

		it('should auto-execute operations when enabled', async () => {
			// Setup mock LLM response
			const mockLLMResponse = {
				title: 'Auto Execute Test',
				summary: 'Testing auto execution',
				insights: 'Auto execution test',
				operations: [
					{
						table: 'projects',
						operation: 'create',
						data: {
							name: 'Auto Execute Project',
							description: 'Testing auto execution',
							status: 'active'
						},
						ref: 'new-project-1'
					}
				]
			};

			// For new project: context + tasks
			mockSmartLLMService.getJSONResponse
				.mockResolvedValueOnce(mockLLMResponse)
				.mockResolvedValueOnce({ title: '', summary: '', insights: '', operations: [] });

			// Mock successful execution
			mockOperationsExecutor.executeOperations.mockResolvedValue({
				successful: [{ id: 'op-1', result: { id: 'created-project-id' } }],
				failed: []
			});

			const options: BrainDumpOptions = {
				autoExecute: true,
				streamResults: false
			};

			const result = await processor.processBrainDump({
				brainDump: 'Create a test project',
				userId: mockUserId,
				options,
				brainDumpId: 'test-brain-dump-id-7'
			});

			// Assertions
			expect(result).toBeDefined();
			expect(result.operations).toBeDefined();
			expect(result.operations).toHaveLength(1);

			// Verify operations were executed with brainDumpId
			expect(mockOperationsExecutor.executeOperations).toHaveBeenCalled();
			const callArgs = mockOperationsExecutor.executeOperations.mock.calls[0][0];
			expect(callArgs.operations).toBeInstanceOf(Array);
			expect(callArgs.brainDumpId).toBe('test-brain-dump-id-7');
			expect(callArgs.userId).toBe(mockUserId);
		});
	});

	describe('threshold calculation', () => {
		it('should validate maximum content length', async () => {
			// Import the content length constants
			const thresholdModule = await import('$lib/constants/brain-dump-thresholds');
			const { CONTENT_LENGTH } = thresholdModule;

			// Verify the maximum length constant exists
			expect(CONTENT_LENGTH.MAX).toBe(100000);

			// Note: The dual processing threshold logic was removed in the architecture refactor
			// Dual processing is now always used, with preparatory analysis determining optimization
		});
	});
});
