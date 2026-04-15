// apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSkillById } from './registry';
import { loadSkill } from './skill-load';

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
		expect(result.markdown).toContain("Draft chapter 3: Elena's first magical forging attempt");
		expect(result.markdown).toContain('task_id: "440c2639-9000-4111-aeea-ee374f8fb925"');
		expect(result.markdown).toContain('Never emit `update_onto_task({})`.');
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
