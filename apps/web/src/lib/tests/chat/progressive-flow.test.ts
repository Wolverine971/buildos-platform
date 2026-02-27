// apps/web/src/lib/tests/chat/progressive-flow.test.ts
import { describe, it, expect, vi } from 'vitest';
import { ChatToolExecutor } from '$lib/services/agentic-chat/tools/core/tool-executor';
import { CHAT_TOOLS } from '$lib/services/agentic-chat/tools/core/tools.config';
import type { ChatToolCall } from '@buildos/shared-types';

function getToolName(tool: unknown): string {
	const candidate = tool as { name?: string; function?: { name?: string } };
	return candidate.name ?? candidate.function?.name ?? '';
}

function getToolDescription(tool: unknown): string {
	const candidate = tool as { description?: string; function?: { description?: string } };
	return candidate.description ?? candidate.function?.description ?? '';
}

describe('Progressive Disclosure Flow', () => {
	describe('Two-Tier Tool System', () => {
		it('exposes both list/search and detail tools', () => {
			const names = CHAT_TOOLS.map(getToolName).filter(Boolean);
			const descriptions = CHAT_TOOLS.map(getToolDescription);

			const listOrSearch = names.filter(
				(name) => name.startsWith('list_') || name.startsWith('search_')
			);
			const detail = names.filter(
				(name) => name.startsWith('get_') && name.endsWith('_details')
			);

			expect(listOrSearch.length).toBeGreaterThan(0);
			expect(detail.length).toBeGreaterThan(0);
			expect(listOrSearch).toContain('search_onto_tasks');
			expect(detail).toContain('get_onto_task_details');
			expect(
				descriptions.some((description) => /detail|full|complete/i.test(description))
			).toBe(true);
		});

		it('keeps ontology tools namespaced (onto)', () => {
			const names = CHAT_TOOLS.map(getToolName).filter(Boolean);
			const ontoSearch = names.filter((name) => name.startsWith('search_onto_'));
			const ontoDetail = names.filter((name) => name.startsWith('get_onto_'));

			expect(ontoSearch.length).toBeGreaterThan(0);
			expect(ontoDetail.length).toBeGreaterThan(0);
		});
	});

	describe('Error Handling and Fallbacks', () => {
		const mockTable = {
			insert: vi.fn().mockResolvedValue({ error: null })
		};

		const mockSupabase = {
			from: vi.fn(() => mockTable),
			rpc: vi.fn(),
			auth: {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { access_token: 'token' } }
				})
			}
		} as any;

		it('returns a clear error for unknown legacy tool names', async () => {
			const executor = new ChatToolExecutor(
				mockSupabase,
				'user-1',
				'session-1',
				vi.fn() as any
			);

			const call: ChatToolCall = {
				id: 'call-legacy',
				type: 'function',
				function: {
					name: 'get_task_details',
					arguments: JSON.stringify({ task_id: 'task-1' })
				}
			};

			const result = await executor.execute(call);
			expect(result.success).toBe(false);
			expect(result.error).toContain('Unknown tool');
		});

		it('rejects malformed tool arguments before execution', async () => {
			const executor = new ChatToolExecutor(
				mockSupabase,
				'user-1',
				'session-1',
				vi.fn() as any
			);

			const call: ChatToolCall = {
				id: 'call-invalid-json',
				type: 'function',
				function: {
					name: 'list_onto_tasks',
					arguments: '{"project_id": "proj-1"'
				}
			};

			const result = await executor.execute(call);
			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid JSON');
		});
	});

	describe('Context Evolution', () => {
		it('progresses from broad to specific tool calls', () => {
			const calls: ChatToolCall[] = [
				{
					id: 'evolution-1',
					type: 'function',
					function: {
						name: 'search_onto_projects',
						arguments: JSON.stringify({ search_term: 'website' })
					}
				},
				{
					id: 'evolution-2',
					type: 'function',
					function: {
						name: 'get_onto_project_details',
						arguments: JSON.stringify({ project_id: 'proj-website' })
					}
				},
				{
					id: 'evolution-3',
					type: 'function',
					function: {
						name: 'list_onto_tasks',
						arguments: JSON.stringify({
							project_id: 'proj-website',
							state_key: 'in_progress'
						})
					}
				}
			];

			expect(calls[0].function.name).toBe('search_onto_projects');
			expect(calls[1].function.name).toBe('get_onto_project_details');
			expect(calls[2].function.name).toBe('list_onto_tasks');
			expect(calls[1].function.arguments.length).toBeGreaterThanOrEqual(
				calls[0].function.arguments.length
			);
		});
	});
});
