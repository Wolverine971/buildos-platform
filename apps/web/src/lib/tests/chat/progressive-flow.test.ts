// apps/web/src/lib/tests/chat/progressive-flow.test.ts
/**
 * Progressive Flow Tests for Chat System
 *
 * Tests the progressive disclosure pattern flow from initial context
 * to detailed information retrieval.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatToolExecutor } from '$lib/chat/tool-executor';
import { CHAT_TOOLS } from '$lib/chat/tools.config';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';

describe('Progressive Disclosure Flow', () => {
	let toolExecutor: ChatToolExecutor;
	let mockSupabase: any;
	const userId = 'test-user-123';

	beforeEach(() => {
		mockSupabase = {
			from: vi.fn().mockReturnThis(),
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			ilike: vi.fn().mockReturnThis(),
			order: vi.fn().mockReturnThis(),
			limit: vi.fn().mockReturnThis(),
			single: vi.fn()
		};

		toolExecutor = new ChatToolExecutor(mockSupabase, userId);
	});

	describe('Two-Tier Tool System', () => {
		it('should have separate tools for list/search vs details', () => {
			const tools = CHAT_TOOLS;

			// Tier 1: List/Search tools (abbreviated)
			const listTools = tools.filter(
				(t) => t.name.startsWith('list_') || t.name.startsWith('search_')
			);

			// Tier 2: Detail tools (full data)
			const detailTools = tools.filter(
				(t) =>
					t.name.includes('_details') ||
					(t.name.startsWith('get_') && t.name.endsWith('_details'))
			);

			expect(listTools.length).toBeGreaterThan(0);
			expect(detailTools.length).toBeGreaterThan(0);

			// Verify tools are properly categorized
			listTools.forEach((tool) => {
				expect(tool.description).toMatch(/list|search|browse|find/i);
			});

			detailTools.forEach((tool) => {
				expect(tool.description).toMatch(/detail|full|complete|specific/i);
			});
		});

		it('should flow from search to details progressively', async () => {
			// Step 1: Search for tasks (abbreviated)
			mockSupabase.single.mockResolvedValueOnce({
				data: [
					{
						id: 'task-1',
						title: 'Setup authentication',
						description:
							'Implement OAuth2 authentication with multiple providers including Google, GitHub, and Microsoft. Handle token refresh, session management, and secure storage.',
						status: 'in_progress'
					},
					{
						id: 'task-2',
						title: 'Design database schema',
						description:
							'Create comprehensive database schema for the application including users, projects, tasks, and related entities with proper relationships and indexes.',
						status: 'backlog'
					}
				],
				error: null
			});

			const searchCall: ChatToolCall = {
				id: 'call-1',
				type: 'function',
				function: {
					name: 'search_tasks',
					arguments: JSON.stringify({ query: 'authentication' })
				}
			};

			const searchResult = await toolExecutor.execute(searchCall);

			// Verify abbreviated results
			expect(searchResult.success).toBe(true);
			if (searchResult.success && searchResult.result) {
				const tasks = searchResult.result.data;
				expect(tasks).toBeDefined();
				expect(tasks[0].description_preview).toBeDefined();
				expect(tasks[0].description_preview.length).toBeLessThanOrEqual(103);
			}

			// Step 2: Get full details for specific task
			mockSupabase.single.mockResolvedValueOnce({
				data: {
					id: 'task-1',
					title: 'Setup authentication',
					description:
						'Implement OAuth2 authentication with multiple providers including Google, GitHub, and Microsoft. Handle token refresh, session management, and secure storage.',
					status: 'in_progress',
					priority: 'high',
					metadata: {
						subtasks: [
							'Setup OAuth applications',
							'Implement callback handlers',
							'Add session management',
							'Implement token refresh'
						],
						assigned_to: 'dev-1',
						estimated_hours: 16,
						tags: ['security', 'backend', 'priority']
					}
				},
				error: null
			});

			const detailCall: ChatToolCall = {
				id: 'call-2',
				type: 'function',
				function: {
					name: 'get_task_details',
					arguments: JSON.stringify({ task_id: 'task-1' })
				}
			};

			const detailResult = await toolExecutor.execute(detailCall);

			// Verify full details
			expect(detailResult.success).toBe(true);
			if (detailResult.success && detailResult.result) {
				const task = detailResult.result.data;
				expect(task.description).toBeDefined();
				expect(task.description).not.toContain('...');
				expect(task.metadata).toBeDefined();
				expect(task.metadata.subtasks).toHaveLength(4);
			}
		});
	});

	describe('Smart Information Loading', () => {
		it('should load related context based on entity type', async () => {
			// Project context should load recent tasks
			mockSupabase.single.mockResolvedValueOnce({
				data: {
					id: 'proj-1',
					name: 'Website Redesign',
					context: 'Redesigning the company website',
					tasks: [
						{ id: 'task-1', title: 'Design mockups', status: 'done' },
						{ id: 'task-2', title: 'Implement homepage', status: 'in_progress' }
					]
				},
				error: null
			});

			const projectCall: ChatToolCall = {
				id: 'call-3',
				type: 'function',
				function: {
					name: 'get_project_details',
					arguments: JSON.stringify({ project_id: 'proj-1' })
				}
			};

			const result = await toolExecutor.execute(projectCall);

			expect(result.success).toBe(true);
			if (result.success && result.result) {
				expect(result.result.data.tasks).toBeDefined();
				expect(result.result.context_loaded).toContain('tasks');
			}
		});

		it('should handle calendar context with time-aware loading', async () => {
			const now = new Date();
			const startOfWeek = new Date(now);
			startOfWeek.setDate(now.getDate() - now.getDay());
			const endOfWeek = new Date(startOfWeek);
			endOfWeek.setDate(startOfWeek.getDate() + 6);

			mockSupabase.single.mockResolvedValueOnce({
				data: [
					{
						id: 'event-1',
						title: 'Team standup',
						start: new Date().toISOString(),
						end: new Date(Date.now() + 3600000).toISOString()
					},
					{
						id: 'event-2',
						title: 'Project review',
						start: new Date(Date.now() + 86400000).toISOString(),
						end: new Date(Date.now() + 90000000).toISOString()
					}
				],
				error: null
			});

			const calendarCall: ChatToolCall = {
				id: 'call-4',
				type: 'function',
				function: {
					name: 'get_calendar_events',
					arguments: JSON.stringify({
						start_date: startOfWeek.toISOString(),
						end_date: endOfWeek.toISOString()
					})
				}
			};

			const result = await toolExecutor.execute(calendarCall);

			expect(result.success).toBe(true);
			if (result.success && result.result) {
				const events = result.result.data;
				expect(events).toHaveLength(2);
				expect(events[0].title).toBeDefined();
			}
		});
	});

	describe('Error Handling and Fallbacks', () => {
		it('should handle missing entities gracefully', async () => {
			mockSupabase.single.mockResolvedValueOnce({
				data: null,
				error: { message: 'Not found' }
			});

			const call: ChatToolCall = {
				id: 'call-5',
				type: 'function',
				function: {
					name: 'get_task_details',
					arguments: JSON.stringify({ task_id: 'non-existent' })
				}
			};

			const result = await toolExecutor.execute(call);

			expect(result.success).toBe(false);
			expect(result.error).toContain('not found');
		});

		it('should validate tool arguments', async () => {
			const invalidCall: ChatToolCall = {
				id: 'call-6',
				type: 'function',
				function: {
					name: 'list_tasks',
					arguments: JSON.stringify({ invalid_param: 'test' })
				}
			};

			const result = await toolExecutor.execute(invalidCall);

			// Should still work but ignore invalid params
			expect(result.success).toBeDefined();
		});

		it('should handle rate limiting gracefully', async () => {
			// Simulate rate limit error
			mockSupabase.single.mockRejectedValueOnce(new Error('Rate limit exceeded'));

			const call: ChatToolCall = {
				id: 'call-7',
				type: 'function',
				function: {
					name: 'list_tasks',
					arguments: JSON.stringify({})
				}
			};

			const result = await toolExecutor.execute(call);

			expect(result.success).toBe(false);
			expect(result.error).toContain('rate limit');
			expect(result.retry_after).toBeDefined();
		});
	});

	describe('Performance Metrics', () => {
		it('should execute list operations quickly', async () => {
			mockSupabase.single.mockResolvedValueOnce({
				data: Array.from({ length: 20 }, (_, i) => ({
					id: `task-${i}`,
					title: `Task ${i}`,
					status: 'backlog'
				})),
				error: null
			});

			const start = Date.now();

			const call: ChatToolCall = {
				id: 'call-8',
				type: 'function',
				function: {
					name: 'list_tasks',
					arguments: JSON.stringify({ limit: 20 })
				}
			};

			const result = await toolExecutor.execute(call);

			const duration = Date.now() - start;

			expect(result.success).toBe(true);
			expect(duration).toBeLessThan(1000); // Should complete within 1 second
			expect(result.duration_ms).toBeDefined();
			expect(result.duration_ms).toBeLessThan(1000);
		});

		it('should batch related queries efficiently', async () => {
			// Mock multiple related queries
			const projectId = 'proj-1';

			mockSupabase.single
				.mockResolvedValueOnce({
					// Project details
					data: { id: projectId, name: 'Project 1' },
					error: null
				})
				.mockResolvedValueOnce({
					// Related tasks
					data: [
						{ id: 'task-1', project_id: projectId },
						{ id: 'task-2', project_id: projectId }
					],
					error: null
				})
				.mockResolvedValueOnce({
					// Related notes
					data: [{ id: 'note-1', project_id: projectId }],
					error: null
				});

			// Simulate batched execution
			const calls = [
				{
					id: 'batch-1',
					type: 'function' as const,
					function: {
						name: 'get_project_details',
						arguments: JSON.stringify({ project_id: projectId })
					}
				},
				{
					id: 'batch-2',
					type: 'function' as const,
					function: {
						name: 'list_tasks',
						arguments: JSON.stringify({ project_id: projectId })
					}
				}
			];

			const results = await Promise.all(calls.map((call) => toolExecutor.execute(call)));

			expect(results).toHaveLength(2);
			results.forEach((result) => {
				expect(result.success).toBe(true);
			});
		});
	});

	describe('Context Evolution', () => {
		it('should track context evolution through conversation', async () => {
			// Initial broad search
			const search1: ChatToolCall = {
				id: 'evolution-1',
				type: 'function',
				function: {
					name: 'search_projects',
					arguments: JSON.stringify({ query: 'website' })
				}
			};

			// User narrows down
			const search2: ChatToolCall = {
				id: 'evolution-2',
				type: 'function',
				function: {
					name: 'get_project_details',
					arguments: JSON.stringify({ project_id: 'proj-website' })
				}
			};

			// Further drilling into tasks
			const search3: ChatToolCall = {
				id: 'evolution-3',
				type: 'function',
				function: {
					name: 'list_tasks',
					arguments: JSON.stringify({
						project_id: 'proj-website',
						status: 'in_progress'
					})
				}
			};

			// Track progression from broad to specific
			const calls = [search1, search2, search3];
			const contextDepth = ['broad', 'focused', 'detailed'];

			calls.forEach((call, index) => {
				expect(call.function.name).toBeDefined();
				// Later calls should be more specific
				if (index > 0) {
					expect(call.function.arguments.length).toBeGreaterThanOrEqual(
						calls[index - 1].function.arguments.length
					);
				}
			});
		});
	});
});
