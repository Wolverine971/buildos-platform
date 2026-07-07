// apps/web/src/lib/services/agentic-chat/tools/skills/skill-reference-load.test.ts
import { describe, expect, it } from 'vitest';
import { loadSkillReference } from './skill-reference-load';
import { listAllSkills } from './registry';

describe('skill reference loading', () => {
	it('loads a declared reference module by id', () => {
		const result = loadSkillReference(
			'task_management',
			'task_management.state_coverage'
		) as Record<string, unknown>;

		expect(result.type).toBe('skill_reference');
		expect(result.skill_id).toBe('task_management');
		expect(result.reference_id).toBe('task_management.state_coverage');
		expect(result.path).toBe('references/state-coverage.md');
		expect(result.content).toContain('# Task State Coverage Reference');
		expect(result.content).toContain('"state_key": "done"');
	});

	it('loads a declared reference module by path', () => {
		const result = loadSkillReference(
			'task_management',
			'references/state-coverage.md'
		) as Record<string, unknown>;

		expect(result.type).toBe('skill_reference');
		expect(result.reference_id).toBe('task_management.state_coverage');
	});

	it('blocks internal reference modules on public portable surfaces', () => {
		const result = loadSkillReference(
			'cold_email_engagement_first_outreach',
			'cold_email_engagement_first_outreach.internal_os',
			{ surface: 'public_portable' }
		) as Record<string, unknown>;

		expect(result).toMatchObject({
			type: 'forbidden',
			skill_id: 'cold_email_engagement_first_outreach',
			reference_id: 'cold_email_engagement_first_outreach.internal_os',
			visibility: 'internal',
			surface: 'public_portable'
		});
		expect(result.content).toBeUndefined();
	});

	it('treats omitted reference visibility as internal outside internal chat', () => {
		const result = loadSkillReference('task_management', 'task_management.state_coverage', {
			surface: 'external_agent'
		}) as Record<string, unknown>;

		expect(result).toMatchObject({
			type: 'forbidden',
			skill_id: 'task_management',
			reference_id: 'task_management.state_coverage',
			visibility: 'internal',
			surface: 'external_agent'
		});
		expect(result.content).toBeUndefined();
	});

	it('loads explicitly public reference modules on public portable surfaces', () => {
		const result = loadSkillReference(
			'google_calendar',
			'google_calendar.public_safe_write_rules',
			{ surface: 'public_portable' }
		) as Record<string, unknown>;

		expect(result.type).toBe('skill_reference');
		expect(result.visibility).toBe('public');
		expect(result.content).toContain('Public Safe Calendar Write Rules');
	});

	it('returns declared references when a requested module is not found', () => {
		const result = loadSkillReference('task_management', '../secrets.md') as Record<
			string,
			unknown
		>;

		expect(result.type).toBe('not_found');
		expect(result.message).toBe('No declared reference module found for this skill.');
		expect(result.available_references).toEqual([
			expect.objectContaining({
				id: 'task_management.state_coverage',
				path: 'references/state-coverage.md'
			})
		]);
	});

	it('loads cold email outreach internal reference modules', () => {
		const result = loadSkillReference(
			'cold_email_engagement_first_outreach',
			'cold_email_engagement_first_outreach.internal_os'
		) as Record<string, unknown>;

		expect(result.type).toBe('skill_reference');
		expect(result.skill_id).toBe('cold_email_engagement_first_outreach');
		expect(result.reference_id).toBe('cold_email_engagement_first_outreach.internal_os');
		expect(result.visibility).toBe('internal');
		expect(result.content).toContain(
			'qualified conversations started per unit of market trust consumed'
		);
		expect(result.content).toContain('right person -> right moment -> right reason');
	});

	it('loads the cold email child skill source plan reference', () => {
		const result = loadSkillReference(
			'cold_email_engagement_first_outreach',
			'cold_email_engagement_first_outreach.child_skill_source_plan'
		) as Record<string, unknown>;

		expect(result.type).toBe('skill_reference');
		expect(result.skill_id).toBe('cold_email_engagement_first_outreach');
		expect(result.reference_id).toBe(
			'cold_email_engagement_first_outreach.child_skill_source_plan'
		);
		expect(result.visibility).toBe('internal');
		expect(result.path).toBe('references/child-skill-source-plan.md');
		expect(result.content).toContain('## Child Skill Source Queues');
		expect(result.content).toContain('cold_email_offer_lab');
		expect(result.content).toContain(
			'qualified conversations started per unit of market trust consumed'
		);
	});

	it('loads the cold email source acquisition queue reference', () => {
		const result = loadSkillReference(
			'cold_email_engagement_first_outreach',
			'cold_email_engagement_first_outreach.source_acquisition_queue'
		) as Record<string, unknown>;

		expect(result.type).toBe('skill_reference');
		expect(result.skill_id).toBe('cold_email_engagement_first_outreach');
		expect(result.reference_id).toBe(
			'cold_email_engagement_first_outreach.source_acquisition_queue'
		);
		expect(result.visibility).toBe('internal');
		expect(result.path).toBe('references/source-acquisition-queue.md');
		expect(result.content).toContain('## Batch 1: Deliverability And Compliance');
		expect(result.content).toContain('Lavender benchmark');
		expect(result.content).toContain(
			'qualified conversations per unit of market trust consumed'
		);
	});

	it('bundles content for every declared reference module across the registry', () => {
		for (const skill of listAllSkills()) {
			for (const module of skill.referenceModules ?? []) {
				const result = loadSkillReference(skill.id, module.id) as Record<string, unknown>;

				expect(result.type, `${skill.id} → ${module.id}`).toBe('skill_reference');
				expect(
					typeof result.content === 'string' && result.content.trim().length > 0,
					`${skill.id} → ${module.id} should have non-empty bundled content`
				).toBe(true);
			}
		}
	});

	it('loads the LinkedIn company page growth playbook reference', () => {
		const result = loadSkillReference(
			'linkedin-company-page-growth',
			'linkedin_company_page_growth.playbook'
		) as Record<string, unknown>;

		expect(result.type).toBe('skill_reference');
		expect(result.skill_id).toBe('linkedin_company_page_growth');
		expect(result.reference_id).toBe('linkedin_company_page_growth.playbook');
		expect(result.visibility).toBe('internal');
		expect(result.path).toBe('references/growth-playbook.md');
		expect(result.content).toContain('# LinkedIn Company Page Growth Playbook');
		expect(result.content).toContain('BuildOS-Specific Strategy');
		expect(result.content).toContain('LinkedIn Pages Best Practices');
	});
});
