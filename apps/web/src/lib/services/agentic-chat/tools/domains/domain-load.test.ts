// apps/web/src/lib/services/agentic-chat/tools/domains/domain-load.test.ts
import { describe, expect, it } from 'vitest';
import { getSkillById } from '../skills/registry';
import { listDomains } from './catalog';
import { loadDomain, searchDomains } from './domain-load';

describe('domain discovery', () => {
	it('keeps catalog links internally resolvable', () => {
		const domains = listDomains();
		const domainIds = new Set(domains.map((domain) => domain.id));

		for (const domain of domains) {
			for (const parentId of domain.parentIds) {
				expect(domainIds.has(parentId), `${domain.id} parent ${parentId}`).toBe(true);
			}
			for (const relatedId of domain.relatedDomainIds ?? []) {
				expect(domainIds.has(relatedId), `${domain.id} related ${relatedId}`).toBe(true);
			}
			for (const skill of domain.skills) {
				expect(getSkillById(skill.id), `${domain.id} skill ${skill.id}`).toBeDefined();
			}
			for (const stack of domain.recommendedSkillStacks ?? []) {
				for (const skillId of stack.skillIds) {
					expect(
						getSkillById(skillId),
						`${domain.id} stack ${stack.id} skill ${skillId}`
					).toBeDefined();
				}
			}
		}
	});

	it('finds a concrete domain from user language', () => {
		const result = searchDomains({ query: 'grow our LinkedIn company page', limit: 3 });

		expect(result.type).toBe('domain_search_results');
		expect(result.matches[0]).toMatchObject({
			domain_id: 'marketing.linkedin_company_page_growth',
			coverage_status: 'strong'
		});
		expect(result.materialized_tools).toEqual(['domain_load']);
		expect(result.matches[0]?.skill_ids).toContain('linkedin_company_page_growth');
		expect(result.matches[0]?.work_capability_ids).toContain(
			'linkedin_company_page_growth_plan'
		);
	});

	it('loads a compact domain card with linked skills and gaps', () => {
		const result = loadDomain('sales_and_growth.cold_email');

		expect(result).toMatchObject({
			type: 'domain',
			domain_id: 'sales_and_growth.cold_email',
			coverage_status: 'strong'
		});
		if (result.type !== 'domain') {
			throw new Error('Expected domain payload');
		}
		expect(result.skills.map((skill) => skill.id)).toContain(
			'cold_email_engagement_first_outreach'
		);
		expect(result.skills.map((skill) => skill.id)).toContain('cold_email_reply_os');
		expect(result.work_capability_ids).toEqual(
			expect.arrayContaining(['cold_email_campaign_build', 'cold_email_sender_readiness'])
		);
		expect(result.materialized_tools).toEqual(['work_capability_load', 'resource_search']);
		expect(result.boundaries.join(' ')).toContain('child skills');
	});

	it('normalizes domain id input before lookup', () => {
		const result = loadDomain('  MARKETING.YOUTUBE_GROWTH  ');
		expect(result).toMatchObject({
			type: 'domain',
			domain_id: 'marketing.youtube_growth'
		});
	});

	it('routes YouTube audience requests to the platform domain before generic creator growth', () => {
		const result = searchDomains({ query: 'I want to grow my YouTube audience', limit: 3 });

		expect(result.matches[0]).toMatchObject({
			domain_id: 'marketing.youtube_growth',
			coverage_status: 'partial'
		});
		expect(result.matches[0]?.skill_ids).toEqual(
			expect.arrayContaining([
				'content_strategy_beyond_blogging',
				'hook_craft_short_form',
				'viral_video_script_structure',
				'algorithm_aware_publishing'
			])
		);
	});

	it('loads recommended skill stacks for multi-skill domain work', () => {
		const result = loadDomain('marketing.youtube_growth');

		if (result.type !== 'domain') {
			throw new Error('Expected domain payload');
		}
		expect(result.recommended_skill_stacks).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: 'youtube_growth_strategy_plan',
					skill_ids: [
						'youtube_channel_craft_for_founders',
						'content_strategy_beyond_blogging',
						'algorithm_aware_publishing',
						'viral_video_script_structure'
					]
				})
			])
		);
		expect(result.work_capability_ids).toEqual(
			expect.arrayContaining(['youtube_growth_strategy_plan', 'youtube_video_improvement'])
		);
	});

	it('represents coverage gaps without pretending a skill exists', () => {
		const result = loadDomain('creator_growth');

		expect(result).toMatchObject({
			type: 'domain',
			domain_id: 'creator_growth',
			coverage_status: 'partial'
		});
		if (result.type !== 'domain') {
			throw new Error('Expected domain payload');
		}
		expect(result.skills.map((skill) => skill.id)).toEqual(
			expect.arrayContaining([
				'content_strategy_beyond_blogging',
				'algorithm_aware_publishing'
			])
		);
		expect(result.gaps.map((gap) => gap.missing_skill_id)).toContain(
			'youtube_channel_diagnostics'
		);
	});
});
