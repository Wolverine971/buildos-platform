// apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSkillById, listChildSkillsForSkill, listRootSkills } from './registry';
import { defineMarkdownSkill } from './markdown-skill';
import { buildSkillLoadPayload, loadSkill } from './skill-load';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('skill loading', () => {
	it('parses skill metadata from markdown frontmatter', () => {
		const skill = getSkillById('project_creation');

		expect(skill).toBeDefined();
		expect(skill?.name).toBe('Project Creation');
		expect(skill?.summary).toContain('smallest valid BuildOS project payload');
		expect(skill?.legacyPaths).toContain('onto.project.create.skill');
		expect(skill?.relatedOps).toEqual(['onto.project.create']);
	});

	it('loads project audit and forecast as project-scoped skills', () => {
		const audit = getSkillById('project_audit');
		const forecast = getSkillById('project_forecast');

		expect(audit).toBeDefined();
		expect(audit?.name).toBe('Project Audit');
		expect(audit?.legacyPaths).toContain('workflow.audit.skill');
		expect(audit?.whenToUse.join(' ')).toContain('context type is `project`');

		expect(forecast).toBeDefined();
		expect(forecast?.name).toBe('Project Forecast');
		expect(forecast?.legacyPaths).toContain('workflow.forecast.skill');
		expect(forecast?.whenToUse.join(' ')).toContain('context type is `project`');
	});

	it('returns a markdown playbook for full skill loads', () => {
		const result = loadSkill('project_creation', {
			format: 'full',
			include_examples: true
		}) as Record<string, unknown>;

		expect(result.type).toBe('skill');
		expect(result.id).toBe('project_creation');
		expect(typeof result.markdown).toBe('string');
		expect(result.markdown).toContain('# Project Creation');
		expect(result.markdown).toContain('## Workflow');
		expect(result.markdown).toContain('## Related Tools');
		expect(result.markdown).toContain('`onto.project.create`');
		expect(result.markdown).toContain('tech_stack');
		expect(result.markdown).toContain('target_word_count');
	});

	it('includes concrete task payload examples in the task management skill', () => {
		const result = loadSkill('task_management', {
			format: 'full',
			include_examples: true
		}) as Record<string, unknown>;

		expect(result.type).toBe('skill');
		expect(typeof result.markdown).toBe('string');
		expect(result.markdown).toContain(
			'Revise chapter 2 dialogue between Elena and Master Thorne'
		);
		expect(result.markdown).toContain('Good create signals');
		expect(result.markdown).toContain("Draft chapter 3: Elena's first magical forging attempt");
		expect(result.markdown).toContain('task_id: "440c2639-9000-4111-aeea-ee374f8fb925"');
		expect(result.markdown).toContain('Never emit `update_onto_task({})`.');
		expect(result.markdown).toContain('## Child Skills');
		expect(result.markdown).toContain('task_state_updates');
		expect(result.child_skills).toEqual([
			expect.objectContaining({
				id: 'task_state_updates',
				path: expect.stringContaining('definitions/task_state_updates/SKILL.md')
			})
		]);
	});

	it('registers task state updates as a loadable child skill', () => {
		const child = getSkillById('task_state_updates');

		expect(child).toBeDefined();
		expect(child?.parentId).toBe('task_management');
		expect(child?.depth).toBe(1);
		expect(child?.relatedOps).toContain('onto.task.update');
		expect(listChildSkillsForSkill('task_management').map((skill) => skill.id)).toContain(
			'task_state_updates'
		);
		expect(listRootSkills().map((skill) => skill.id)).toContain('task_management');
		expect(listRootSkills().map((skill) => skill.id)).not.toContain('task_state_updates');

		const result = loadSkill('task_state_updates', {
			format: 'full',
			include_examples: true
		}) as Record<string, unknown>;

		expect(result.type).toBe('skill');
		expect(result.parent_id).toBe('task_management');
		expect(result.depth).toBe(1);
		expect(result.markdown).toContain('# Task State Updates');
		expect(result.markdown).toContain('The root `task_management` skill remains the default');
	});

	it('registers cold email outreach as a root skill with loadable child skills', () => {
		const root = getSkillById('cold_email_engagement_first_outreach');

		expect(root).toBeDefined();
		expect(root?.name).toBe('Cold Email Engagement-First Outreach');
		expect(root?.legacyPaths).toContain('cold-email-engagement-first-outreach');
		expect(root?.referenceModules?.map((module) => module.id)).toContain(
			'cold_email_engagement_first_outreach.internal_os'
		);

		const childIds = listChildSkillsForSkill('cold_email_engagement_first_outreach').map(
			(skill) => skill.id
		);
		expect(childIds).toEqual(
			expect.arrayContaining([
				'cold_email_icp_signal_design',
				'cold_email_offer_lab',
				'cold_email_research_anchors',
				'cold_email_outreach_compiler',
				'cold_email_taste_review',
				'cold_email_deliverability_readiness',
				'cold_email_reply_os',
				'cold_email_learning_review'
			])
		);
		expect(listRootSkills().map((skill) => skill.id)).toContain(
			'cold_email_engagement_first_outreach'
		);
		expect(listRootSkills().map((skill) => skill.id)).not.toContain('cold_email_offer_lab');

		const result = loadSkill('cold_email_outreach', {
			format: 'full',
			include_examples: true
		}) as Record<string, unknown>;

		expect(result.type).toBe('skill');
		expect(result.id).toBe('cold_email_engagement_first_outreach');
		expect(typeof result.markdown).toBe('string');
		expect(result.markdown).toContain('right person -> right moment -> right reason');
		expect(result.markdown).toContain('## Child Skills');
		expect(result.markdown).toContain('cold_email_offer_lab');
		expect(result.markdown).toContain('## Reference Modules');
		expect(result.markdown).toContain('cold_email_engagement_first_outreach.source_map');
	});

	it('registers cold email child skills with the root parent id', () => {
		const offerLab = getSkillById('cold_email_offer_lab');

		expect(offerLab).toBeDefined();
		expect(offerLab?.parentId).toBe('cold_email_engagement_first_outreach');
		expect(offerLab?.depth).toBe(1);
		expect(offerLab?.whenToUse.join(' ')).toContain('front-end offer');

		const result = loadSkill('cold_email_outreach.offer_lab', {
			format: 'full',
			include_examples: true
		}) as Record<string, unknown>;

		expect(result.type).toBe('skill');
		expect(result.parent_id).toBe('cold_email_engagement_first_outreach');
		expect(result.markdown).toContain('# Cold Email OfferLab');
		expect(result.markdown).toContain('smallest useful yes');
	});

	it('registers build quality UI/UX as a source-backed root with loadable child skills', () => {
		const root = getSkillById('build_quality_ui_ux');

		expect(root).toBeDefined();
		expect(root?.name).toBe('Build Quality UI/UX');
		expect(root?.legacyPaths).toContain('ui_ux');
		expect(root?.referenceModules?.map((module) => module.id)).toEqual(
			expect.arrayContaining([
				'build_quality_ui_ux.source_map',
				'build_quality_ui_ux.child_skill_source_plan'
			])
		);

		const childIds = listChildSkillsForSkill('build_quality_ui_ux').map((skill) => skill.id);
		expect(childIds).toEqual(
			expect.arrayContaining([
				'ui_ux_quality_review',
				'visual_craft_fundamentals',
				'accessibility_inclusive_ui_review',
				'marketing_site_design_review',
				'calm_software_design_review',
				'delightful_product_review',
				'design_system_architecture_review',
				'information_architecture_review',
				'usability_quick_research'
			])
		);
		expect(listRootSkills().map((skill) => skill.id)).toContain('build_quality_ui_ux');
		expect(listRootSkills().map((skill) => skill.id)).not.toContain('ui_ux_quality_review');

		const result = loadSkill('ui-ux', {
			format: 'full',
			include_examples: true
		}) as Record<string, unknown>;

		expect(result.type).toBe('skill');
		expect(result.id).toBe('build_quality_ui_ux');
		expect(typeof result.markdown).toBe('string');
		expect(result.markdown).toContain('## Child Skills');
		expect(result.markdown).toContain('ui_ux_quality_review');
		expect(result.markdown).toContain('design_system_architecture_review');
		expect(result.markdown).toContain('## Reference Modules');
		expect(result.markdown).toContain('build_quality_ui_ux.source_map');
	});

	it('registers UI/UX child skills with the root parent id', () => {
		const designSystem = getSkillById('design_system_architecture_review');

		expect(designSystem).toBeDefined();
		expect(designSystem?.parentId).toBe('build_quality_ui_ux');
		expect(designSystem?.depth).toBe(1);
		expect(designSystem?.whenToUse.join(' ')).toContain('design system');

		const designSystemResult = loadSkill('design_system_architecture_review', {
			format: 'full',
			include_examples: true
		}) as Record<string, unknown>;

		expect(designSystemResult.type).toBe('skill');
		expect(designSystemResult.markdown).toContain('migration path');
		expect(designSystemResult.markdown).toContain('library matrix');

		const result = loadSkill(
			'product-and-design.usability-evaluation-and-quick-research.skill',
			{
				format: 'full',
				include_examples: true
			}
		) as Record<string, unknown>;

		expect(result.type).toBe('skill');
		expect(result.parent_id).toBe('build_quality_ui_ux');
		expect(result.depth).toBe(1);
		expect(result.markdown).toContain('# Usability Quick Research');
		expect(result.markdown).toContain('research as validation theater');
		expect(result.markdown).toContain('bet size');
	});

	it('includes durable source-of-truth guidance in the plan management skill', () => {
		const result = loadSkill('plan_management', {
			format: 'full',
			include_examples: true
		}) as Record<string, unknown>;

		expect(result.type).toBe('skill');
		expect(typeof result.markdown).toBe('string');
		expect(result.markdown).toContain('Prefer a milestone-scoped plan');
		expect(result.markdown).toContain('description is the synopsis; plan is the detailed body');
		expect(result.markdown).toContain('create_onto_plan({ project_id: "<project_id>"');
	});

	it('parses and returns child skill and reference module indexes', () => {
		const skill = defineMarkdownSkill({
			id: 'cold_email_outreach',
			markdown: `---
name: Cold Email Outreach
description: Root playbook for cold outreach. Use for campaign routing, drafting, and audit.
parent_id: marketing
depth: 0
legacy_paths:
  - growth.cold_email.skill
child_skills:
  - id: cold_email_outreach.offer_crafting
    name: Offer Crafting
    summary: Deep playbook for shaping the promise, artifact offer, and smallest useful yes.
    when_to_load:
      - When the agent must design or repair the core offer.
    path: skills/cold_email_outreach/offer_crafting/SKILL.md
reference_modules:
  - id: cold_email_outreach.research_sources
    summary: Source map and supporting research for cold outreach claims.
    when_to_load:
      - When the agent needs provenance or source-specific detail.
    path: references/source-map.md
    visibility: internal
---

# Cold Email Outreach

## When to Use

- Plan a cold outreach campaign.

## Workflow

1. Choose the outreach mode.

## Related Tools

- \`util.contact.search\`
`
		});

		expect(skill.parentId).toBe('marketing');
		expect(skill.depth).toBe(0);
		expect(skill.childSkills).toEqual([
			expect.objectContaining({
				id: 'cold_email_outreach.offer_crafting',
				summary: expect.stringContaining('shaping the promise'),
				whenToLoad: ['When the agent must design or repair the core offer.']
			})
		]);
		expect(skill.referenceModules).toEqual([
			expect.objectContaining({
				id: 'cold_email_outreach.research_sources',
				path: 'references/source-map.md',
				visibility: 'internal'
			})
		]);

		const shortPayload = buildSkillLoadPayload(skill, 'test-version', 'short', false);
		expect(shortPayload.markdown).toBeUndefined();
		expect(shortPayload.child_skills).toEqual([
			expect.objectContaining({
				id: 'cold_email_outreach.offer_crafting',
				when_to_load: ['When the agent must design or repair the core offer.']
			})
		]);
		expect(shortPayload.reference_modules).toEqual([
			expect.objectContaining({
				id: 'cold_email_outreach.research_sources',
				visibility: 'internal'
			})
		]);

		const fullPayload = buildSkillLoadPayload(skill, 'test-version', 'full', false);
		expect(fullPayload.markdown).toContain('## Child Skills');
		expect(fullPayload.markdown).toContain('## Reference Modules');
		expect(fullPayload.markdown).toContain('cold_email_outreach.offer_crafting');
		expect(fullPayload.markdown).not.toContain('Loaded child skill contents');
	});

	it('gates the Libri knowledge skill behind the Libri integration flag', () => {
		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'false');
		expect(getSkillById('libri_knowledge')).toBeUndefined();
		expect(loadSkill('libri').type).toBe('not_found');

		vi.stubEnv('LIBRI_INTEGRATION_ENABLED', 'true');
		const skill = getSkillById('libri_knowledge');
		expect(skill).toBeDefined();
		expect(skill?.summary).toContain('Libri is BuildOS');
		expect(skill?.legacyPaths).toContain('libri');
		expect(skill?.relatedOps).toContain('libri.resource.resolve');

		const result = loadSkill('libri', {
			format: 'full',
			include_examples: true
		}) as Record<string, unknown>;

		expect(result.type).toBe('skill');
		expect(result.id).toBe('libri_knowledge');
		expect(typeof result.markdown).toBe('string');
		expect(result.markdown).toContain('Libri is BuildOS');
		expect(result.markdown).toContain('resolve_libri_resource');
	});
});
