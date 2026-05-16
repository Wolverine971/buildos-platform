// apps/web/src/lib/services/agentic-chat-v2/session-service.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildInterruptedToolHistorySummary,
	buildLoadedSkillHistorySummary
} from './session-service';

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

	it('summarizes loaded skills as a cross-turn continuity ledger', () => {
		const summary = buildLoadedSkillHistorySummary([
			{
				message_id: 'assistant-message-1',
				tool_name: 'skill_load',
				gateway_op: null,
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: {
					skill: 'cold_email_engagement_first_outreach',
					format: 'short'
				},
				result: {
					type: 'skill',
					id: 'cold_email_engagement_first_outreach',
					name: 'Cold Email Engagement-First Outreach',
					format: 'short',
					summary:
						'Compose cold outreach that earns a reply by leading with relevance and a low-friction ask.',
					child_skills: [
						{
							id: 'cold_email_research_anchors',
							summary: 'Find precise relevance anchors.',
							when_to_load: []
						}
					],
					markdown: '# Full playbook should not be carried forward'
				}
			},
			{
				message_id: 'assistant-message-2',
				tool_name: 'skill_load',
				gateway_op: null,
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: {
					skill: 'cold_email_research_anchors',
					format: 'short'
				},
				result: {
					type: 'skill',
					id: 'cold_email_research_anchors',
					name: 'Cold Email Research Anchors',
					parent_id: 'cold_email_engagement_first_outreach',
					depth: 1,
					format: 'short',
					summary: 'Find specific prospect signals before drafting.',
					materialized_tools: ['web_search', 'web_visit']
				}
			},
			{
				message_id: 'assistant-message-3',
				tool_name: 'skill_load',
				gateway_op: null,
				sequence_index: 1,
				success: true,
				error_message: null,
				arguments: {
					skill: 'cold_email_engagement_first_outreach',
					format: 'short'
				},
				result: {
					type: 'skill',
					id: 'cold_email_engagement_first_outreach',
					name: 'Cold Email Engagement-First Outreach',
					format: 'short',
					summary: 'Latest short summary wins when a skill was loaded twice.'
				}
			}
		]);

		expect(summary).toContain('Previously loaded skills in this session');
		expect(summary).toContain('Latest short summary wins');
		expect(summary).toContain('child of `cold_email_engagement_first_outreach`');
		expect(summary).toContain('Tools exposed: `web_search`, `web_visit`');
		expect(summary).toContain('Do not call skill_load again just to rediscover');
		expect(summary).not.toContain('# Full playbook should not be carried forward');
		expect(summary?.match(/`cold_email_engagement_first_outreach`/g)).toHaveLength(2);
	});
});
