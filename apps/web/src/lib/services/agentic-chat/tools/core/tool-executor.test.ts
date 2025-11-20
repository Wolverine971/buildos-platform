// apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.test.ts
/**
 * Tests for data update strategies in ChatToolExecutor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatToolExecutor } from './tool-executor';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { SmartLLMService } from '$lib/services/smart-llm-service';

// Mock modules
vi.mock('$lib/services/smart-llm-service');

describe('ChatToolExecutor - Update Strategies', () => {
	let toolExecutor: ChatToolExecutor;
	let mockSupabase: SupabaseClient<Database>;
	let mockLLMService: SmartLLMService;
	let mockFetch: typeof fetch;

	const userId = 'test-user-123';
	const sessionId = 'test-session-456';

	beforeEach(() => {
		// Setup mock Supabase client
		mockSupabase = {
			from: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			single: vi.fn().mockReturnThis(),
			insert: vi.fn().mockReturnThis(),
			update: vi.fn().mockReturnThis()
		} as unknown as SupabaseClient<Database>;

		// Setup mock LLM service
		mockLLMService = {
			generateTextDetailed: vi.fn().mockResolvedValue({
				text: 'Merged content from LLM',
				usage: { total_tokens: 100 }
			})
		} as unknown as SmartLLMService;

		// Setup mock fetch for API calls
		mockFetch = vi.fn().mockImplementation((url, options) => {
			const body = options?.body ? JSON.parse(options.body as string) : {};

			// Mock response based on URL
			if (url.includes('/api/onto/documents/')) {
				if (options?.method === 'GET') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							document: {
								id: 'doc-123',
								title: 'Test Document',
								props: {
									body_markdown: 'Existing document content'
								}
							}
						})
					});
				}
				if (options?.method === 'PATCH') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							document: {
								id: 'doc-123',
								title: body.title || 'Test Document',
								props: {
									body_markdown: body.body_markdown
								}
							}
						})
					});
				}
			}

			if (url.includes('/api/onto/tasks/')) {
				if (options?.method === 'GET') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							task: {
								id: 'task-123',
								title: 'Test Task',
								props: {
									description: 'Existing task description'
								}
							}
						})
					});
				}
				if (options?.method === 'PATCH') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							task: {
								id: 'task-123',
								title: body.title || 'Test Task',
								description: body.description
							}
						})
					});
				}
			}

			return Promise.resolve({
				ok: false,
				json: () => Promise.resolve({ error: 'Not found' })
			});
		});

		toolExecutor = new ChatToolExecutor(
			mockSupabase,
			userId,
			sessionId,
			mockFetch,
			mockLLMService
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Document Update Strategies', () => {
		it('should use replace strategy by default', async () => {
			const result = await toolExecutor.execute({
				id: 'call-1',
				type: 'function',
				function: {
					name: 'update_onto_document',
					arguments: JSON.stringify({
						document_id: 'doc-123',
						body_markdown: 'New content replacing everything'
					})
				}
			});

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('New content replacing everything')
				})
			);
			// Should NOT fetch existing content for replace
			expect(mockFetch).toHaveBeenCalledTimes(1);
		});

		it('should append content when strategy is append', async () => {
			const result = await toolExecutor.execute({
				id: 'call-2',
				type: 'function',
				function: {
					name: 'update_onto_document',
					arguments: JSON.stringify({
						document_id: 'doc-123',
						body_markdown: 'Additional content',
						update_strategy: 'append'
					})
				}
			});

			expect(result.success).toBe(true);
			// Should fetch existing content first
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({ method: 'GET' })
			);
			// Then update with appended content
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('Existing document content\\n\\nAdditional content')
				})
			);
		});

		it('should use LLM merge when strategy is merge_llm', async () => {
			const result = await toolExecutor.execute({
				id: 'call-3',
				type: 'function',
				function: {
					name: 'update_onto_document',
					arguments: JSON.stringify({
						document_id: 'doc-123',
						body_markdown: 'New insights to integrate',
						update_strategy: 'merge_llm',
						merge_instructions: 'Integrate the new insights while preserving the structure'
					})
				}
			});

			expect(result.success).toBe(true);
			// Should fetch existing content
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({ method: 'GET' })
			);
			// Should call LLM service
			expect(mockLLMService.generateTextDetailed).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('Existing document content'),
					systemPrompt: expect.stringContaining('careful editor'),
					operationType: 'agentic_chat_content_merge'
				})
			);
			// Should update with merged content
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('Merged content from LLM')
				})
			);
		});

		it('should fall back to append when LLM service fails', async () => {
			// Make LLM service throw an error
			mockLLMService.generateTextDetailed = vi.fn().mockRejectedValue(new Error('LLM service error'));

			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const result = await toolExecutor.execute({
				id: 'call-4',
				type: 'function',
				function: {
					name: 'update_onto_document',
					arguments: JSON.stringify({
						document_id: 'doc-123',
						body_markdown: 'Content to merge',
						update_strategy: 'merge_llm'
					})
				}
			});

			expect(result.success).toBe(true);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('LLM merge failed'),
				expect.any(Error)
			);
			// Should fall back to append
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('Existing document content\\n\\nContent to merge')
				})
			);

			consoleSpy.mockRestore();
		});

		it('should handle empty existing content gracefully', async () => {
			// Mock empty existing content
			mockFetch = vi.fn().mockImplementation((url, options) => {
				if (url.includes('/api/onto/documents/') && options?.method === 'GET') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							document: {
								id: 'doc-123',
								title: 'Test Document',
								props: {}  // No body_markdown
							}
						})
					});
				}
				if (url.includes('/api/onto/documents/') && options?.method === 'PATCH') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							document: { id: 'doc-123' }
						})
					});
				}
				return Promise.resolve({ ok: false });
			});

			const executor = new ChatToolExecutor(
				mockSupabase,
				userId,
				sessionId,
				mockFetch,
				mockLLMService
			);

			const result = await executor.execute({
				id: 'call-5',
				type: 'function',
				function: {
					name: 'update_onto_document',
					arguments: JSON.stringify({
						document_id: 'doc-123',
						body_markdown: 'New content',
						update_strategy: 'append'
					})
				}
			});

			expect(result.success).toBe(true);
			// Should just use the new content when existing is empty
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('"body_markdown":"New content"')
				})
			);
		});
	});

	describe('Task Update Strategies', () => {
		it('should apply append strategy to task descriptions', async () => {
			const result = await toolExecutor.execute({
				id: 'call-6',
				type: 'function',
				function: {
					name: 'update_onto_task',
					arguments: JSON.stringify({
						task_id: 'task-123',
						description: 'Additional requirements',
						update_strategy: 'append'
					})
				}
			});

			expect(result.success).toBe(true);
			// Should fetch existing task
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/tasks/task-123'),
				expect.objectContaining({ method: 'GET' })
			);
			// Should update with appended description
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/tasks/task-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('Existing task description\\n\\nAdditional requirements')
				})
			);
		});

		it('should handle missing description field gracefully', async () => {
			// Mock task without description
			mockFetch = vi.fn().mockImplementation((url, options) => {
				if (url.includes('/api/onto/tasks/') && options?.method === 'GET') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							task: {
								id: 'task-123',
								title: 'Test Task',
								props: {} // No description
							}
						})
					});
				}
				if (url.includes('/api/onto/tasks/') && options?.method === 'PATCH') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							task: { id: 'task-123' }
						})
					});
				}
				return Promise.resolve({ ok: false });
			});

			const executor = new ChatToolExecutor(
				mockSupabase,
				userId,
				sessionId,
				mockFetch,
				mockLLMService
			);

			const result = await executor.execute({
				id: 'call-7',
				type: 'function',
				function: {
					name: 'update_onto_task',
					arguments: JSON.stringify({
						task_id: 'task-123',
						description: 'New description',
						update_strategy: 'append'
					})
				}
			});

			expect(result.success).toBe(true);
			// Should use the new description when existing is missing
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/tasks/task-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('"description":"New description"')
				})
			);
		});
	});

	describe('Edge Cases and Error Handling', () => {
		it('should not update if no new content is provided', async () => {
			const result = await toolExecutor.execute({
				id: 'call-8',
				type: 'function',
				function: {
					name: 'update_onto_document',
					arguments: JSON.stringify({
						document_id: 'doc-123',
						body_markdown: '',
						update_strategy: 'append'
					})
				}
			});

			expect(result.success).toBe(true);
			// Should fetch existing content
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({ method: 'GET' })
			);
			// Should preserve existing content when new is empty
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('Existing document content')
				})
			);
		});

		it('should handle fetch errors gracefully', async () => {
			// Make fetch fail for GET
			mockFetch = vi.fn().mockImplementation((url, options) => {
				if (options?.method === 'GET') {
					return Promise.resolve({
						ok: false,
						json: () => Promise.resolve({ error: 'Network error' })
					});
				}
				if (options?.method === 'PATCH') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({ success: true, document: { id: 'doc-123' } })
					});
				}
				return Promise.resolve({ ok: false });
			});

			const executor = new ChatToolExecutor(
				mockSupabase,
				userId,
				sessionId,
				mockFetch,
				mockLLMService
			);

			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const result = await executor.execute({
				id: 'call-9',
				type: 'function',
				function: {
					name: 'update_onto_document',
					arguments: JSON.stringify({
						document_id: 'doc-123',
						body_markdown: 'New content',
						update_strategy: 'append'
					})
				}
			});

			expect(result.success).toBe(true);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to load existing content'),
				expect.any(Error)
			);
			// Should use the new content when fetch fails
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('"body_markdown":"New content"')
				})
			);

			consoleSpy.mockRestore();
		});

		it('should work without LLM service for non-merge strategies', async () => {
			// Create executor without LLM service
			const executorNoLLM = new ChatToolExecutor(
				mockSupabase,
				userId,
				sessionId,
				mockFetch,
				undefined // No LLM service
			);

			const result = await executorNoLLM.execute({
				id: 'call-10',
				type: 'function',
				function: {
					name: 'update_onto_document',
					arguments: JSON.stringify({
						document_id: 'doc-123',
						body_markdown: 'New content',
						update_strategy: 'append'
					})
				}
			});

			expect(result.success).toBe(true);
			// Should work fine with append strategy
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('Existing document content\\n\\nNew content')
				})
			);
		});

		it('should fall back to append when LLM service is not available', async () => {
			// Create executor without LLM service
			const executorNoLLM = new ChatToolExecutor(
				mockSupabase,
				userId,
				sessionId,
				mockFetch,
				undefined // No LLM service
			);

			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			const result = await executorNoLLM.execute({
				id: 'call-11',
				type: 'function',
				function: {
					name: 'update_onto_document',
					arguments: JSON.stringify({
						document_id: 'doc-123',
						body_markdown: 'Content to merge',
						update_strategy: 'merge_llm'
					})
				}
			});

			expect(result.success).toBe(true);
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('LLM service not available'),
				expect.stringContaining('falling back to append')
			);
			// Should fall back to append
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/documents/doc-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('Existing document content\\n\\nContent to merge')
				})
			);

			consoleSpy.mockRestore();
		});
	});

	describe('Goals and Plans Update Strategies', () => {
		it('should apply strategies to goal descriptions', async () => {
			// Mock goal endpoints
			mockFetch = vi.fn().mockImplementation((url, options) => {
				if (url.includes('/api/onto/goals/') && options?.method === 'GET') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							goal: {
								id: 'goal-123',
								name: 'Test Goal',
								props: {
									description: 'Original goal description'
								}
							}
						})
					});
				}
				if (url.includes('/api/onto/goals/') && options?.method === 'PATCH') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							goal: { id: 'goal-123', name: 'Test Goal' }
						})
					});
				}
				return Promise.resolve({ ok: false });
			});

			const executor = new ChatToolExecutor(
				mockSupabase,
				userId,
				sessionId,
				mockFetch,
				mockLLMService
			);

			const result = await executor.execute({
				id: 'call-12',
				type: 'function',
				function: {
					name: 'update_onto_goal',
					arguments: JSON.stringify({
						goal_id: 'goal-123',
						description: 'Additional success criteria',
						update_strategy: 'append'
					})
				}
			});

			expect(result.success).toBe(true);
			expect(mockFetch).toHaveBeenCalledWith(
				expect.stringContaining('/api/onto/goals/goal-123'),
				expect.objectContaining({
					method: 'PATCH',
					body: expect.stringContaining('Original goal description\\n\\nAdditional success criteria')
				})
			);
		});

		it('should apply strategies to plan descriptions', async () => {
			// Mock plan endpoints
			mockFetch = vi.fn().mockImplementation((url, options) => {
				if (url.includes('/api/onto/plans/') && options?.method === 'GET') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							plan: {
								id: 'plan-123',
								name: 'Test Plan',
								props: {
									description: 'Original plan outline'
								}
							}
						})
					});
				}
				if (url.includes('/api/onto/plans/') && options?.method === 'PATCH') {
					return Promise.resolve({
						ok: true,
						json: () => Promise.resolve({
							success: true,
							plan: { id: 'plan-123', name: 'Test Plan' }
						})
					});
				}
				return Promise.resolve({ ok: false });
			});

			const executor = new ChatToolExecutor(
				mockSupabase,
				userId,
				sessionId,
				mockFetch,
				mockLLMService
			);

			const result = await executor.execute({
				id: 'call-13',
				type: 'function',
				function: {
					name: 'update_onto_plan',
					arguments: JSON.stringify({
						plan_id: 'plan-123',
						description: 'New milestones discovered',
						update_strategy: 'merge_llm',
						merge_instructions: 'Add the new milestones to the existing plan structure'
					})
				}
			});

			expect(result.success).toBe(true);
			expect(mockLLMService.generateTextDetailed).toHaveBeenCalledWith(
				expect.objectContaining({
					prompt: expect.stringContaining('Original plan outline'),
					operationType: 'agentic_chat_content_merge'
				})
			);
		});
	});
});