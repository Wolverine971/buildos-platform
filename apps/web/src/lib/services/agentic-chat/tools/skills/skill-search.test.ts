// apps/web/src/lib/services/agentic-chat/tools/skills/skill-search.test.ts
import { describe, expect, it } from 'vitest';
import { searchSkills } from './skill-search';

describe('skill search', () => {
	it('finds skills by natural language query', () => {
		const result = searchSkills({ query: 'cold email deliverability', limit: 3 }) as Record<
			string,
			any
		>;

		expect(result.type).toBe('skill_search_results');
		expect(result.matches[0]).toMatchObject({
			skill_id: 'cold_email_deliverability_readiness'
		});
	});

	it('filters skills through a domain card', () => {
		const result = searchSkills({
			domain: 'marketing.youtube_growth',
			query: 'video script',
			limit: 5
		}) as Record<string, any>;

		const ids = result.matches.map((match: Record<string, unknown>) => match.skill_id);
		expect(ids).toContain('viral_video_script_structure');
		expect(ids).toContain('content_strategy_beyond_blogging');
		expect(ids).not.toContain('cold_email_engagement_first_outreach');
	});
});
