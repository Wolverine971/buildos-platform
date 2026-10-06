// apps/worker/tests/agenticChatTavilyUsage.test.ts
import { describe, expect, it, vi } from 'vitest';
import { logTavilyCharge } from '../src/workers/agentic-chat/tools/tavily-usage';

const CONTEXT = {
	operationType: 'agentic_chat_web_navigation',
	userId: 'user-1',
	chatSessionId: 'session-1',
	turnRunId: 'turn-1',
	startedAt: Date.now() - 50,
	metadata: { providerToolCallId: 'call-1' }
};

describe('logTavilyCharge', () => {
	it('writes a zero-token row with the charge, user, session and turn', async () => {
		const logUsageToDatabase = vi.fn(async () => undefined);
		await logTavilyCharge(
			{ logUsageToDatabase },
			{ model: 'tavily/extract-advanced', credits: 0.8, costUsd: 0.0064 },
			CONTEXT
		);
		expect(logUsageToDatabase).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				operationType: 'agentic_chat_web_navigation',
				provider: 'tavily',
				modelUsed: 'tavily/extract-advanced',
				totalTokens: 0,
				totalCost: 0.0064,
				status: 'success',
				chatSessionId: 'session-1',
				turnRunId: 'turn-1',
				metadata: {
					providerToolCallId: 'call-1',
					tavily_credits: 0.8,
					provider_request_id: null
				}
			})
		);
	});

	it('skips free calls and a missing logger, and never throws on a failed write', async () => {
		const logUsageToDatabase = vi.fn(async () => {
			throw new Error('db down');
		});
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		await logTavilyCharge(
			{ logUsageToDatabase },
			{ model: 'tavily/search-advanced', credits: 0, costUsd: 0 },
			CONTEXT
		);
		expect(logUsageToDatabase).not.toHaveBeenCalled();
		await logTavilyCharge(
			undefined,
			{ model: 'tavily/search-advanced', credits: 2, costUsd: 0.016 },
			CONTEXT
		);
		await expect(
			logTavilyCharge(
				{ logUsageToDatabase },
				{ model: 'tavily/search-advanced', credits: 2, costUsd: 0.016 },
				CONTEXT
			)
		).resolves.toBeUndefined();
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});
});
