// apps/web/src/lib/services/agentic-chat/tools/skills/document.skill.ts
import markdown from './definitions/document_workspace/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const documentSkill = defineMarkdownSkill({
	id: 'document_workspace',
	markdown
});
