// apps/web/src/lib/services/agentic-chat/tools/skills/plan.skill.ts
import markdown from './definitions/plan_management/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const planSkill = defineMarkdownSkill({
	id: 'plan_management',
	markdown
});
