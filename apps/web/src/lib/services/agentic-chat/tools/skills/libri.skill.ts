// apps/web/src/lib/services/agentic-chat/tools/skills/libri.skill.ts
import markdown from './definitions/libri_knowledge/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const libriSkill = defineMarkdownSkill({
	id: 'libri_knowledge',
	markdown
});
