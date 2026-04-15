// apps/web/src/lib/services/agentic-chat/tools/skills/forecast.skill.ts
import markdown from './definitions/project_forecast/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const projectForecastSkill = defineMarkdownSkill({
	id: 'project_forecast',
	markdown
});
