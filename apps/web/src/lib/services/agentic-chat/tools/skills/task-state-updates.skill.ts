// apps/web/src/lib/services/agentic-chat/tools/skills/task-state-updates.skill.ts
import markdown from './definitions/task_state_updates/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const taskStateUpdatesSkill = defineMarkdownSkill({
	id: 'task_state_updates',
	markdown
});
