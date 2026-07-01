// apps/web/src/lib/services/agentic-chat/tools/skills/skill-authoring-validation.test.ts
import { describe, expect, it } from 'vitest';
import { listAllSkills } from './registry';
import {
	validateReferenceModuleProvenance,
	validateSkillAuthoring,
	validateSkillBlockOntology,
	type SkillAuthoringIssue
} from './skill-authoring-validation';
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

function mdSkill(id: string, markdown: string): SkillDefinition {
	return createSkill({ id, rawMarkdown: markdown });
}

function errorCodes(issues: SkillAuthoringIssue[]): string[] {
	return issues.filter((issue) => issue.severity === 'error').map((issue) => issue.code);
}

const MIGRATED_ORCHESTRATION = `---
name: Test Orchestration
description: A test orchestration skill.
skill_type: orchestration
altitude: domain
activation: progressive
preserve_markdown: true
dependencies:
    - id: sibling_a
      owns: Owns thing A.
    - id: sibling_b
      owns: Owns thing B.
---

## Identity
An orchestration skill.

## Activation
When composing pieces.

## Judgment
The decision spine.

## Procedure
1. Do the first thing. [here]
2. Delegate the second. → \`sibling_a\`
3. Delegate the third. → \`sibling_b\`

## Routing
| Step | Owner |
| ---- | ----- |
| 2 | sibling_a |

## Contract
Return the packet.
`;

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

describe('skill block-ontology linter', () => {
	it('keeps the registered runtime skill tree free of block-ontology errors', () => {
		const issues = validateSkillBlockOntology(listAllSkills());
		expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
	});

	it('passes the golden going_viral skill with zero errors', () => {
		const goingViral = listAllSkills().find((skill) => skill.id === 'going_viral');
		expect(goingViral?.rawMarkdown).toBeTruthy();
		const issues = validateSkillBlockOntology([goingViral!]);
		expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
	});

	it('accepts a well-formed migrated orchestration skill', () => {
		const issues = validateSkillBlockOntology([mdSkill('test_orch', MIGRATED_ORCHESTRATION)]);
		expect(errorCodes(issues)).toEqual([]);
	});

	it('skips structural checks for pending skills but flags legacy skill_type as a warning', () => {
		const pending = `---
name: Pending Skill
description: A pending skill with a legacy combo type.
skill_type: combo
---

## When to Use
Legacy body.

## Workflow
1. Do the thing.
`;
		const issues = validateSkillBlockOntology([mdSkill('pending_skill', pending)]);
		expect(errorCodes(issues)).toEqual([]);
		expect(issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					severity: 'warning',
					code: 'pending_migration_invalid_skill_type',
					skillId: 'pending_skill'
				})
			])
		);
	});

	it('flags an H2 outside the canonical menu', () => {
		const md = MIGRATED_ORCHESTRATION.replace(
			'## Contract',
			'## Pillars\nStuff.\n\n## Contract'
		);
		const issues = validateSkillBlockOntology([mdSkill('bad_block', md)]);
		expect(errorCodes(issues)).toContain('unknown_block');
	});

	it('flags blocks that appear out of canonical order', () => {
		const md = `---
name: Out Of Order
description: Blocks in the wrong order.
skill_type: procedure
altitude: task
activation: invoked
---

## Identity
X.

## Activation
X.

## Contract
Out too early.

## Procedure
1. Step.
`;
		const issues = validateSkillBlockOntology([mdSkill('out_of_order', md)]);
		expect(errorCodes(issues)).toContain('blocks_out_of_order');
	});

	it('flags a missing required block for the declared type', () => {
		// procedure type requires Contract; omit it.
		const md = `---
name: Missing Contract
description: A procedure skill missing its Contract.
skill_type: procedure
altitude: task
activation: invoked
---

## Identity
X.

## Activation
X.

## Procedure
1. Step.
`;
		const issues = validateSkillBlockOntology([mdSkill('missing_contract', md)]);
		expect(errorCodes(issues)).toContain('missing_required_block');
	});

	it('flags a forbidden block for the declared type', () => {
		// reference type forbids Procedure.
		const md = `---
name: Bad Reference
description: A reference skill with a forbidden Procedure block.
skill_type: reference
altitude: domain
activation: progressive
---

## Identity
X.

## Activation
X.

## Procedure
1. Forbidden step.

## Knowledge
Facts.

## Provenance
Sources.
`;
		const issues = validateSkillBlockOntology([mdSkill('bad_reference', md)]);
		expect(errorCodes(issues)).toContain('forbidden_block_present');
	});

	it('reconciles orchestration routes against dependencies', () => {
		const dangling = MIGRATED_ORCHESTRATION.replace('→ `sibling_b`', '→ `sibling_c`');
		const issues = validateSkillBlockOntology([mdSkill('dangling', dangling)]);
		const codes = errorCodes(issues);
		expect(codes).toContain('dangling_route'); // sibling_c has no dependency
		expect(codes).toContain('orphan_dependency'); // sibling_b is no longer routed to
	});

	it('requires a Routing block for orchestration skills', () => {
		const md = MIGRATED_ORCHESTRATION.replace(/## Routing[\s\S]*?## Contract/, '## Contract');
		const issues = validateSkillBlockOntology([mdSkill('no_routing', md)]);
		const codes = errorCodes(issues);
		expect(codes).toContain('orchestration_missing_routing');
		expect(codes).toContain('missing_required_block');
	});

	it('flags an orchestration skill with empty dependencies via the Zod refine', () => {
		const md = `---
name: No Deps
description: Orchestration without dependencies.
skill_type: orchestration
altitude: domain
activation: progressive
---

## Identity
X.

## Activation
X.

## Judgment
X.

## Procedure
1. Step.

## Routing
Table.

## Contract
Out.
`;
		const issues = validateSkillBlockOntology([mdSkill('no_deps', md)]);
		expect(errorCodes(issues)).toContain('invalid_frontmatter');
	});
});

describe('reference-module provenance linter', () => {
	it('is a no-op for modules without frontmatter', () => {
		const issues = validateReferenceModuleProvenance(
			'mod',
			'# Heading\n\nAn untagged claim sentence.\n'
		);
		expect(issues).toEqual([]);
	});

	it('is a no-op when provenance_required is not set', () => {
		const md = `---
reference_id: skill.mod
parent_skill: skill
updated: 2026-07-01
---

An untagged claim sentence.
`;
		expect(validateReferenceModuleProvenance('skill.mod', md)).toEqual([]);
	});

	it('flags untagged claim lines when provenance_required is true', () => {
		const md = `---
reference_id: skill.mod
parent_skill: skill
provenance_required: true
updated: 2026-07-01
---

## Facts

- Completion rate is the currency. (Mosseri, PRIMARY)
- Native beats studio by a wide margin.

> REMOVED (was: an old unsourced enumeration). Kept as audit trail.
`;
		const issues = validateReferenceModuleProvenance('skill.mod', md);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.code).toBe('missing_provenance_tag');
	});

	it('passes when every claim line carries a provenance tag', () => {
		const md = `---
reference_id: skill.mod
parent_skill: skill
provenance_required: true
---

## Facts

- Completion rate is the currency. (Mosseri, PRIMARY)
- Native beats studio by a wide margin. (Brock, practitioner)
- Default posting cadence is once per day. (internal-default)

> REMOVED (was: an old unsourced enumeration).
`;
		expect(validateReferenceModuleProvenance('skill.mod', md)).toEqual([]);
	});
});
