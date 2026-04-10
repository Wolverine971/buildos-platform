// apps/web/src/lib/services/agentic-chat/tools/skills/project-create.skill.ts
import markdown from './definitions/project_creation/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const projectCreateSkill = defineMarkdownSkill({
	id: 'project_creation',
	markdown
});
