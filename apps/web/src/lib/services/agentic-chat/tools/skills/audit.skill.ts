// apps/web/src/lib/services/agentic-chat/tools/skills/audit.skill.ts
import markdown from './definitions/project_audit/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const projectAuditSkill = defineMarkdownSkill({
	id: 'project_audit',
	markdown
});
