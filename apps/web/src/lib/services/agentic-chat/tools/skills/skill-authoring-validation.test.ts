// apps/web/src/lib/services/agentic-chat/tools/skills/skill-authoring-validation.test.ts
import { describe, expect, it } from 'vitest';
import { listAllSkills } from './registry';
import { validateSkillAuthoring } from './skill-authoring-validation';
import type { SkillDefinition } from './types';

function createSkill(
	overrides: Partial<SkillDefinition> & Pick<SkillDefinition, 'id'>
): SkillDefinition {
	return {
		id: overrides.id,
		name: overrides.name ?? overrides.id,
		summary: overrides.summary ?? `Summary for ${overrides.id}`,
		legacyPaths: overrides.legacyPaths ?? [],
		relatedOps: overrides.relatedOps ?? [],
		whenToUse: overrides.whenToUse ?? ['Use when needed.'],
		workflow: overrides.workflow ?? ['Do the work.'],
		...overrides
	};
}

describe('skill authoring validation', () => {
	it('keeps the registered runtime skill tree free of authoring errors', () => {
		const issues = validateSkillAuthoring(listAllSkills());

		expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
	});

	it('catches missing parents and invalid child depth', () => {
		const issues = validateSkillAuthoring([
			createSkill({ id: 'root' }),
			createSkill({
				id: 'bad_depth_child',
				parentId: 'root',
				depth: 0
			}),
			createSkill({
				id: 'orphan_child',
				parentId: 'missing_root',
				depth: 1
			})
		]);

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					severity: 'error',
					code: 'missing_parent',
					skillId: 'orphan_child'
				}),
				expect.objectContaining({
					severity: 'error',
					code: 'invalid_child_depth',
					skillId: 'bad_depth_child'
				})
			])
		);
	});

	it('warns when a large root has no depth handles', () => {
		const issues = validateSkillAuthoring(
			[
				createSkill({
					id: 'large_root',
					bodyLineCount: 12
				})
			],
			{ rootLineWarningThreshold: 10 }
		);

		expect(issues).toEqual([
			expect.objectContaining({
				severity: 'warning',
				code: 'oversized_root_skill',
				skillId: 'large_root'
			})
		]);
	});

	it('validates duplicate linked resources and unsafe reference paths', () => {
		const issues = validateSkillAuthoring([
			createSkill({
				id: 'root',
				childSkills: [
					{
						id: 'root.child',
						summary: 'Child summary',
						whenToLoad: []
					},
					{
						id: 'root.child',
						summary: 'Duplicate child summary',
						whenToLoad: ['When duplicate coverage is needed.']
					}
				],
				referenceModules: [
					{
						id: 'root.research',
						summary: 'Research summary',
						whenToLoad: ['When source detail is needed.'],
						path: '../research.md'
					}
				]
			})
		]);

		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					severity: 'error',
					code: 'duplicate_linked_resource_id',
					relatedId: 'root.child'
				}),
				expect.objectContaining({
					severity: 'warning',
					code: 'linked_resource_without_load_rule',
					relatedId: 'root.child'
				}),
				expect.objectContaining({
					severity: 'error',
					code: 'unsafe_reference_path',
					relatedId: 'root.research'
				})
			])
		);
	});
});
