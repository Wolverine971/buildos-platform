// apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-libri.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);

vi.mock('$env/dynamic/private', () => ({
	env: mockEnv
}));

import { ChatToolExecutor } from './tool-executor';
import type { ChatToolCall } from '@buildos/shared-types';

afterEach(() => {
	delete mockEnv.LIBRI_API_BASE_URL;
	delete mockEnv.LIBRI_API_KEY;
	delete mockEnv.LIBRI_APP_BASE_URL;
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('ChatToolExecutor Libri dispatch', () => {
	it('executes resolve_libri_resource through the internal tool path', async () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		mockEnv.LIBRI_API_BASE_URL = 'https://libri.example';
		mockEnv.LIBRI_API_KEY = 'libri-secret-key';

		const fetchFn = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						status: 'found',
						resourceKey: 'person:james-clear',
						query: 'James Clear',
						results: [{ type: 'person', title: 'James Clear' }],
						job: null,
						message: 'Found existing Libri resource.'
					}),
					{
						status: 200,
						headers: { 'content-type': 'application/json' }
					}
				)
		) as unknown as typeof fetch;

		const supabase = {
			auth: {
				getSession: vi.fn().mockResolvedValue({ data: { session: null } })
			}
		} as any;
		const executor = new ChatToolExecutor(supabase, 'user-1', 'session-1', fetchFn, undefined, {
			logExecutions: false
		});

		const toolCall: ChatToolCall = {
			id: 'call-libri',
			type: 'function',
			function: {
				name: 'resolve_libri_resource',
				arguments: JSON.stringify({
					query: 'James Clear',
					reason: 'User asked BuildOS for information about James Clear'
				})
			}
		} as ChatToolCall;

		const result = await executor.execute(toolCall);

		expect(result.success).toBe(true);
		expect(result.tool_call_id).toBe('call-libri');
		expect(result.result).toEqual(
			expect.objectContaining({
				status: 'found',
				resourceKey: 'person:james-clear',
				message: 'Found existing Libri resource.'
			})
		);
		expect(fetchFn).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(vi.mocked(fetchFn).mock.calls[0][1]?.body)).source).toEqual(
			expect.objectContaining({
				system: 'buildos',
				contextType: 'global',
				sessionId: 'session-1'
			})
		);
	});
});
