// apps/web/src/lib/services/agentic-chat-v2/session-service.test.ts
import { describe, expect, it } from 'vitest';
import { buildInterruptedToolHistorySummary } from './session-service';

describe('fast chat session service helpers', () => {
	it('summarizes completed web visit results from interrupted turns', () => {
		const summary = buildInterruptedToolHistorySummary([
			{
				message_id: 'assistant-message-1',
				tool_name: 'web_visit',
				gateway_op: 'util.web.visit',
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: { url: 'https://thecadretraining.com/classes' },
				result: {
					url: 'https://thecadretraining.com/classes',
					final_url: 'https://thecadretraining.com/classes',
					status_code: 200,
					title: 'Classes - The Cadre Training',
					content:
						'Foundation Precision | Cody, WY May 11 Advanced Precision | Cody, WY May 13',
					structured_data: [
						{
							type: 'Event',
							name: 'Foundation Precision | Cody, WY',
							startDate: '2026-05-11T15:00:00+00:00'
						}
					]
				}
			},
			{
				message_id: 'assistant-message-1',
				tool_name: 'web_visit',
				gateway_op: 'util.web.visit',
				sequence_index: 2,
				success: false,
				error_message: 'Operation cancelled',
				arguments: { url: 'https://thecadretraining.com/classes' },
				result: null
			}
		]);

		expect(summary).toContain('Previous interrupted assistant turn tool results');
		expect(summary).toContain('Foundation Precision | Cody, WY');
		expect(summary).toContain('Operation cancelled');
	});
});
