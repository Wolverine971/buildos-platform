// apps/web/src/lib/services/agentic-chat/tools/skills/registry.ts
import { workflowAuditSkill } from './audit.skill';
import { calendarSkill } from './calendar.skill';
import { documentSkill } from './document.skill';
import { workflowForecastSkill } from './forecast.skill';
import { peopleSkill } from './people.skill';
import { planSkill } from './plan.skill';
import { taskSkill } from './task.skill';
import type { SkillDefinition } from './types';

const ALL_SKILLS: SkillDefinition[] = [
	calendarSkill,
	documentSkill,
	planSkill,
	taskSkill,
	peopleSkill,
	workflowAuditSkill,
	workflowForecastSkill
];

export const SKILLS_BY_PATH: Record<string, SkillDefinition> = Object.fromEntries(
	ALL_SKILLS.map((skill) => [skill.path, skill])
);

export function getSkillByPath(path: string): SkillDefinition | undefined {
	return SKILLS_BY_PATH[path];
}

export function listAllSkills(): SkillDefinition[] {
	return [...ALL_SKILLS];
}

export function isRegisteredSkillPath(path: string): boolean {
	return Boolean(SKILLS_BY_PATH[path]);
}

export function listSkillsForDirectory(
	path: string
): Array<{ name: string; type: 'skill'; summary: string }> {
	const prefix = path.endsWith('.') ? path : `${path}.`;
	return ALL_SKILLS.filter((skill) => {
		if (!skill.path.startsWith(prefix)) return false;
		const remainder = skill.path.slice(prefix.length);
		if (remainder.length === 0) return false;
		const segments = remainder.split('.');
		return segments.length === 1 || (segments.length === 2 && segments[1] === 'skill');
	})
		.map((skill) => ({
			name: skill.path,
			type: 'skill' as const,
			summary: skill.summary
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}
