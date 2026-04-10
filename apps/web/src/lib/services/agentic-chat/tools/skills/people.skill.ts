// apps/web/src/lib/services/agentic-chat/tools/skills/people.skill.ts
import markdown from './definitions/people_context/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const peopleSkill = defineMarkdownSkill({
	id: 'people_context',
	markdown
});
