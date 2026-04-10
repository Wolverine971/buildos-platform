// apps/web/src/lib/services/agentic-chat/tools/skills/registry.ts
import { workflowAuditSkill } from './audit.skill';
import { calendarSkill } from './calendar.skill';
import { documentSkill } from './document.skill';
import { workflowForecastSkill } from './forecast.skill';
import { peopleSkill } from './people.skill';
import { planSkill } from './plan.skill';
import { projectCreateSkill } from './project-create.skill';
import { taskSkill } from './task.skill';
import type { SkillDefinition } from './types';

const ALL_SKILLS: SkillDefinition[] = [
	calendarSkill,
	documentSkill,
	planSkill,
	projectCreateSkill,
	taskSkill,
	peopleSkill,
	workflowAuditSkill,
	workflowForecastSkill
];

const SKILLS_BY_ID: Record<string, SkillDefinition> = Object.fromEntries(
	ALL_SKILLS.map((skill) => [skill.id, skill])
);

const SKILLS_BY_REFERENCE: Record<string, SkillDefinition> = Object.fromEntries(
	ALL_SKILLS.flatMap((skill) => [
		[skill.id, skill] as const,
		...skill.legacyPaths.map((legacyPath) => [legacyPath, skill] as const)
	])
);

export function getSkillById(id: string): SkillDefinition | undefined {
	return SKILLS_BY_ID[id];
}

export function getSkillByReference(reference: string): SkillDefinition | undefined {
	return SKILLS_BY_REFERENCE[reference];
}

export function getSkillByPath(path: string): SkillDefinition | undefined {
	return getSkillByReference(path);
}

export function listAllSkills(): SkillDefinition[] {
	return [...ALL_SKILLS];
}

export function isRegisteredSkillReference(reference: string): boolean {
	return Boolean(SKILLS_BY_REFERENCE[reference]);
}

export function isRegisteredSkillPath(path: string): boolean {
	return isRegisteredSkillReference(path);
}

export function listSkillsForDirectory(
	path: string
): Array<{ name: string; type: 'skill'; summary: string }> {
	const prefix = path.endsWith('.') ? path : `${path}.`;
	return ALL_SKILLS.filter((skill) => {
		return skill.legacyPaths.some((legacyPath) => {
			if (!legacyPath.startsWith(prefix)) return false;
			const remainder = legacyPath.slice(prefix.length);
			if (remainder.length === 0) return false;
			const segments = remainder.split('.');
			return segments.length === 1 || (segments.length === 2 && segments[1] === 'skill');
		});
	})
		.map((skill) => ({
			name: skill.id,
			type: 'skill' as const,
			summary: skill.summary
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}
