// apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.test.ts
import { describe, expect, it } from 'vitest';
import { getSkillById } from './registry';
import { loadSkill } from './skill-load';

describe('skill loading', () => {
	it('parses skill metadata from markdown frontmatter', () => {
		const skill = getSkillById('project_creation');

		expect(skill).toBeDefined();
		expect(skill?.name).toBe('Project Creation');
		expect(skill?.summary).toContain('smallest valid BuildOS project payload');
		expect(skill?.legacyPaths).toContain('onto.project.create.skill');
		expect(skill?.relatedOps).toEqual(['onto.project.create']);
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
		expect(result.markdown).toContain('Never emit `onto.task.update` with `args: {}`.');
	});
});
