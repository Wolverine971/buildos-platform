// apps/web/src/lib/services/agentic-chat/tools/skills/skill-authoring-validation.ts
import type { SkillDefinition, SkillLinkedResource } from './types';

export type SkillAuthoringIssueSeverity = 'error' | 'warning';

export type SkillAuthoringIssueCode =
	| 'duplicate_skill_id'
	| 'missing_parent'
	| 'missing_child_depth'
	| 'invalid_root_depth'
	| 'invalid_child_depth'
	| 'parent_cycle'
	| 'duplicate_linked_resource_id'
	| 'linked_resource_without_load_rule'
	| 'linked_resource_self_reference'
	| 'unsafe_reference_path'
	| 'oversized_root_skill';

export type SkillAuthoringIssue = {
	severity: SkillAuthoringIssueSeverity;
	code: SkillAuthoringIssueCode;
	skillId: string;
	message: string;
	relatedId?: string;
};

export type SkillAuthoringValidationOptions = {
	rootLineWarningThreshold?: number;
};

const DEFAULT_ROOT_LINE_WARNING_THRESHOLD = 150;

function createIssue(issue: SkillAuthoringIssue): SkillAuthoringIssue {
	return issue;
}

function getSkillDepth(skill: SkillDefinition): number {
	return typeof skill.depth === 'number' ? skill.depth : 0;
}

function isUnsafeReferencePath(path: string): boolean {
	if (path.startsWith('/') || path.startsWith('\\')) return true;
	if (!path.endsWith('.md')) return true;
	const parts = path.split(/[\\/]+/).filter((part) => part.length > 0);
	return parts.includes('..') || parts[0] !== 'references';
}

function validateLinkedResources(
	skill: SkillDefinition,
	kind: 'child_skills' | 'reference_modules',
	resources: SkillLinkedResource[] | undefined,
	issues: SkillAuthoringIssue[]
): void {
	if (!resources?.length) return;

	const seenIds = new Set<string>();

	for (const resource of resources) {
		if (seenIds.has(resource.id)) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'duplicate_linked_resource_id',
					skillId: skill.id,
					relatedId: resource.id,
					message: `Skill "${skill.id}" declares duplicate ${kind} handle "${resource.id}".`
				})
			);
		}
		seenIds.add(resource.id);

		if (resource.id === skill.id) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'linked_resource_self_reference',
					skillId: skill.id,
					relatedId: resource.id,
					message: `Skill "${skill.id}" cannot link to itself as a ${kind} handle.`
				})
			);
		}

		if (resource.whenToLoad.length === 0) {
			issues.push(
				createIssue({
					severity: 'warning',
					code: 'linked_resource_without_load_rule',
					skillId: skill.id,
					relatedId: resource.id,
					message: `Skill "${skill.id}" declares ${kind} handle "${resource.id}" without when_to_load guidance.`
				})
			);
		}

		if (kind === 'reference_modules') {
			if (!resource.path || isUnsafeReferencePath(resource.path)) {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'unsafe_reference_path',
						skillId: skill.id,
						relatedId: resource.id,
						message: `Reference module "${resource.id}" must use a safe references/*.md path.`
					})
				);
			}
		}
	}
}

function validateParentCycles(
	skill: SkillDefinition,
	skillsById: Map<string, SkillDefinition>,
	issues: SkillAuthoringIssue[]
): void {
	const visited = new Set<string>();
	let current: SkillDefinition | undefined = skill;

	while (current?.parentId) {
		if (visited.has(current.id)) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'parent_cycle',
					skillId: skill.id,
					relatedId: current.id,
					message: `Skill "${skill.id}" has a cyclic parent chain through "${current.id}".`
				})
			);
			return;
		}

		visited.add(current.id);
		current = skillsById.get(current.parentId);
	}
}

export function validateSkillAuthoring(
	skills: SkillDefinition[],
	options: SkillAuthoringValidationOptions = {}
): SkillAuthoringIssue[] {
	const issues: SkillAuthoringIssue[] = [];
	const rootLineWarningThreshold =
		options.rootLineWarningThreshold ?? DEFAULT_ROOT_LINE_WARNING_THRESHOLD;
	const skillsById = new Map<string, SkillDefinition>();

	for (const skill of skills) {
		if (skillsById.has(skill.id)) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'duplicate_skill_id',
					skillId: skill.id,
					message: `Duplicate skill id "${skill.id}" is registered.`
				})
			);
		}
		skillsById.set(skill.id, skill);
	}

	for (const skill of skills) {
		const isChild = Boolean(skill.parentId);

		if (!isChild && typeof skill.depth === 'number' && skill.depth !== 0) {
			issues.push(
				createIssue({
					severity: 'error',
					code: 'invalid_root_depth',
					skillId: skill.id,
					message: `Root skill "${skill.id}" must not declare depth ${skill.depth}; use 0 or omit depth.`
				})
			);
		}

		if (isChild) {
			const parent = skillsById.get(skill.parentId as string);

			if (!parent) {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'missing_parent',
						skillId: skill.id,
						relatedId: skill.parentId,
						message: `Child skill "${skill.id}" references missing parent "${skill.parentId}".`
					})
				);
			}

			if (typeof skill.depth !== 'number') {
				issues.push(
					createIssue({
						severity: 'error',
						code: 'missing_child_depth',
						skillId: skill.id,
						relatedId: skill.parentId,
						message: `Child skill "${skill.id}" must declare depth.`
					})
				);
			} else if (parent) {
				const expectedDepth = getSkillDepth(parent) + 1;
				if (skill.depth !== expectedDepth) {
					issues.push(
						createIssue({
							severity: 'error',
							code: 'invalid_child_depth',
							skillId: skill.id,
							relatedId: parent.id,
							message: `Child skill "${skill.id}" has depth ${skill.depth}; expected ${expectedDepth} based on parent "${parent.id}".`
						})
					);
				}
			}
		}

		if (
			!isChild &&
			(skill.bodyLineCount ?? 0) > rootLineWarningThreshold &&
			!skill.childSkills?.length &&
			!skill.referenceModules?.length
		) {
			issues.push(
				createIssue({
					severity: 'warning',
					code: 'oversized_root_skill',
					skillId: skill.id,
					message: `Root skill "${skill.id}" is ${skill.bodyLineCount} lines without child skills or reference modules. Consider splitting niche or high-context material.`
				})
			);
		}

		validateLinkedResources(skill, 'child_skills', skill.childSkills, issues);
		validateLinkedResources(skill, 'reference_modules', skill.referenceModules, issues);
		validateParentCycles(skill, skillsById, issues);
	}

	return issues.sort((a, b) => {
		const severityOrder = a.severity.localeCompare(b.severity);
		if (severityOrder !== 0) return severityOrder;
		const skillOrder = a.skillId.localeCompare(b.skillId);
		if (skillOrder !== 0) return skillOrder;
		return a.code.localeCompare(b.code);
	});
}
