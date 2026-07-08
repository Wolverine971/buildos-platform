// apps/web/src/lib/services/agentic-chat/tools/outcome-cards/outcome-card-load.test.ts
import { describe, expect, it } from 'vitest';
import { listDomains } from '../domains/catalog';
import { listCapabilities } from '../registry/capability-catalog';
import { listResources } from '../resources/resource-registry';
import { getSkillById } from '../skills/registry';
import { getOutcomeCardById, listOutcomeCards } from './catalog';
import { loadOutcomeCard } from './outcome-card-load';
import { searchOutcomeCards } from './outcome-card-search';

describe('outcome card discovery', () => {
	it('keeps catalog links internally resolvable', () => {
		const domainIds = new Set(listDomains().map((domain) => domain.id));
		const buildosCapabilityIds = new Set(listCapabilities().map((capability) => capability.id));
		const resourceIds = new Set(listResources().map((resource) => resource.id));

		for (const capability of listOutcomeCards()) {
			for (const domainId of capability.domainIds) {
				expect(domainIds.has(domainId), `${capability.id} domain ${domainId}`).toBe(true);
			}
			for (const buildosCapabilityId of capability.buildosCapabilityIds) {
				expect(
					buildosCapabilityIds.has(buildosCapabilityId),
					`${capability.id} BuildOS capability ${buildosCapabilityId}`
				).toBe(true);
			}
			for (const skillId of capability.skillIds) {
				expect(getSkillById(skillId), `${capability.id} skill ${skillId}`).toBeDefined();
			}
			if (capability.defaultSkillId) {
				expect(
					getSkillById(capability.defaultSkillId),
					`${capability.id} default skill ${capability.defaultSkillId}`
				).toBeDefined();
			}
			for (const resourceId of capability.resourceIds ?? []) {
				expect(resourceIds.has(resourceId), `${capability.id} resource ${resourceId}`).toBe(
					true
				);
			}
		}
	});

	it('finds YouTube strategy as an outcome instead of a generic skill', () => {
		const result = searchOutcomeCards({
			query: 'grow my YouTube audience and plan the next videos',
			limit: 3
		});

		expect(result.type).toBe('outcome_card_search_results');
		expect(result.matches[0]).toMatchObject({
			outcome_card_id: 'youtube_growth_strategy_plan',
			coverage_status: 'partial',
			default_skill_id: 'content_strategy_beyond_blogging',
			skill_load_formats: {
				content_strategy_beyond_blogging: 'full'
			}
		});
		expect(result.materialized_tools).toEqual(['outcome_card_load']);
	});

	it('filters outcome cards by domain', () => {
		const result = searchOutcomeCards({
			domain: 'sales_and_growth.cold_email',
			query: 'cold email',
			limit: 5
		});
		const ids = result.matches.map((match) => match.outcome_card_id);

		expect(ids).toContain('cold_email_campaign_build');
		expect(ids).toContain('cold_email_sender_readiness');
		expect(ids).not.toContain('youtube_growth_strategy_plan');
	});

	it('keeps project_audit as a legacy alias for the renamed outcome card', () => {
		expect(getOutcomeCardById('project_audit')?.id).toBe('project_health_audit');
		expect(loadOutcomeCard('project_audit')).toMatchObject({
			type: 'outcome_card',
			id: 'project_health_audit',
			default_skill_id: 'project_audit'
		});
	});

	it('keeps project_forecast as an alias for the native forecast outcome card', () => {
		expect(getOutcomeCardById('project_forecast')?.id).toBe('project_slip_forecast');
		expect(loadOutcomeCard('project_forecast')).toMatchObject({
			type: 'outcome_card',
			id: 'project_slip_forecast',
			default_skill_id: 'project_forecast'
		});
	});

	it('loads an outcome card without materializing broad direct tools', () => {
		const result = loadOutcomeCard('linkedin_company_page_growth_plan');

		expect(result).toMatchObject({
			type: 'outcome_card',
			id: 'linkedin_company_page_growth_plan',
			coverage_status: 'strong'
		});
		if (result.type !== 'outcome_card') {
			throw new Error('Expected outcome card payload');
		}
		expect(result.skill_ids).toEqual(['linkedin_company_page_growth']);
		expect(result.skill_load_formats).toEqual({
			linkedin_company_page_growth: 'full'
		});
		expect(result.resource_ids).toEqual(['linkedin_company_page_growth.growth_playbook']);
		expect(result.materialized_tools).toEqual(['skill_load', 'resource_search']);
		expect(result.materialized_tools).not.toContain('create_onto_document');
		expect(result.tool_hints).toContain('create_onto_document');
	});
});
