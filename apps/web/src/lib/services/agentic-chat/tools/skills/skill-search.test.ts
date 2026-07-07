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
			skill_id: 'cold_email_deliverability_readiness',
			skill_type: 'procedure',
			altitude: 'task',
			activation: 'progressive',
			recommended_load_format: 'full'
		});
		// Auto-mounts skill_load so the search -> load hop is round-free under lean
		// discovery (Tier 2 item 4).
		expect(result.materialized_tools).toContain('skill_load');
	});

	it('includes orchestration ownership metadata in matches', () => {
		const result = searchSkills({
			query: 'content_strategy_beyond_blogging',
			limit: 1
		}) as Record<string, any>;

		expect(result.matches[0]).toMatchObject({
			skill_id: 'content_strategy_beyond_blogging',
			skill_type: 'strategy',
			altitude: 'domain',
			activation: 'progressive'
		});
		expect(result.matches[0].dependencies).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'hook_craft_short_form',
					owns: expect.stringContaining('Line-level hook')
				})
			])
		);
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
