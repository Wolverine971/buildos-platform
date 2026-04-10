// apps/web/src/lib/services/agentic-chat/tools/skills/forecast.skill.ts
import markdown from './definitions/workflow_forecast/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const workflowForecastSkill = defineMarkdownSkill({
	id: 'workflow_forecast',
	markdown
});
