// apps/web/src/lib/services/agentic-chat/tools/skills/skill-output-contract.test.ts
//
// Guards the 2026-06-15 content pass:
//  - the BuildOS-native procedural skills must each declare an `## Output`
//    contract (parsed into `outputContract`, shipped on every skill-load format).
//  - the rebuilt `information_architecture_review` must have an output contract
//    AND its declared reference module must actually resolve at runtime.
import { describe, expect, it } from 'vitest';
import { getSkillById } from './registry';
import { loadSkillReference } from './skill-reference-load';

const NATIVE_PROCEDURAL_SKILLS = [
	'task_management',
	'plan_management',
	'project_audit',
	'calendar_management',
	'document_workspace',
	'people_context',
	'project_creation'
] as const;

describe('skill output contracts', () => {
	it.each(NATIVE_PROCEDURAL_SKILLS)(
		'native procedural skill "%s" declares a non-empty output contract',
		(skillId) => {
			const skill = getSkillById(skillId);
			expect(skill, `skill ${skillId} should be registered`).toBeDefined();
			expect(
				skill?.outputContract?.trim().length ?? 0,
				`skill ${skillId} is missing an ## Output section`
			).toBeGreaterThan(0);
		}
	);

	it('information_architecture_review has an output contract and a resolvable reference module', () => {
		const skill = getSkillById('information_architecture_review');
		expect(skill).toBeDefined();
		expect(skill?.outputContract?.trim().length ?? 0).toBeGreaterThan(0);
		expect(
			skill?.referenceModules?.some(
				(m) => m.id === 'information_architecture_review.ia_heuristics'
			)
		).toBe(true);

		const reference = loadSkillReference(
			'information_architecture_review',
			'information_architecture_review.ia_heuristics'
		) as Record<string, unknown>;
		expect(reference.type).toBe('skill_reference');
		expect(typeof reference.content === 'string' && reference.content.trim().length > 0).toBe(
			true
		);
	});
});
