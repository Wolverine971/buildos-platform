// apps/web/src/lib/services/agentic-chat/tools/skills/task.skill.ts
import markdown from './definitions/task_management/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const taskSkill = defineMarkdownSkill({
	id: 'task_management',
	markdown
});
