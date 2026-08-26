// apps/web/src/lib/services/chat-compression-service.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@buildos/shared-types';
import { ChatCompressionService } from './chat-compression-service';

function message(overrides: Partial<ChatMessage>): ChatMessage {
	return {
		id: crypto.randomUUID(),
		session_id: 'session-1',
		role: 'user',
		content: '',
		created_at: '2026-08-26T12:00:00.000Z',
		...overrides
	} as ChatMessage;
}

describe('ChatCompressionService.smartCompress', () => {
	it('keeps assistant tool calls and tool results in chronological order', async () => {
		const supabase = { from: vi.fn() } as never;
		const service = new ChatCompressionService(supabase);
		const messages = [
			message({ role: 'user', content: 'Find the project' }),
			message({
				role: 'assistant',
				content: '',
				tool_calls: [
					{
						id: 'call-1',
						type: 'function',
						function: { name: 'search', arguments: '{}' }
					}
				]
			}),
			message({ role: 'tool', content: 'Project A', tool_call_id: 'call-1' }),
			message({ role: 'assistant', content: 'I found Project A.' })
		];

		const result = await service.smartCompress(
			'session-1',
			messages,
			'global',
			'user-1',
			10_000
		);

		expect(result.compressedMessages.map((item) => item.role)).toEqual([
			'user',
			'assistant',
			'tool',
			'assistant'
		]);
		expect(result.compressedMessages.map((item) => item.content)).toEqual([
			'Find the project',
			'',
			'Project A',
			'I found Project A.'
		]);
		expect(supabase.from).not.toHaveBeenCalled();
	});

	it('uses the requested token budget even for a short message list', async () => {
		const compressionInsert = vi.fn(() => ({
			select: () => ({ single: async () => ({ data: { id: 'compression-1' }, error: null }) })
		}));
		const sessionUpdate = vi.fn(() => ({ eq: async () => ({ data: null, error: null }) }));
		const supabase = {
			from: vi.fn((table: string) =>
				table === 'chat_compressions'
					? { insert: compressionInsert }
					: { update: sessionUpdate }
			)
		} as never;
		const service = new ChatCompressionService(supabase);
		const summarize = vi
			.spyOn(service as never, 'compressMessageGroup')
			.mockResolvedValue('The user supplied a long project brief.');
		const messages = [message({ content: 'Detailed project context. '.repeat(200) })];

		const result = await service.smartCompress('session-1', messages, 'project', 'user-1', 100);

		expect(summarize).toHaveBeenCalledOnce();
		expect(result.compressedMessages).toEqual([
			{
				role: 'system',
				content: '[Compressed 1 messages]: The user supplied a long project brief.'
			}
		]);
		expect(result.metadata.compressedTokens).toBeLessThan(result.metadata.originalTokens);
		expect(compressionInsert).toHaveBeenCalledOnce();
		expect(sessionUpdate).toHaveBeenCalledOnce();
	});
});
