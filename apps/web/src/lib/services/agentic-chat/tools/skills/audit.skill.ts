// apps/web/src/lib/services/agentic-chat/tools/skills/audit.skill.ts
import markdown from './definitions/workflow_audit/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const workflowAuditSkill = defineMarkdownSkill({
	id: 'workflow_audit',
	markdown
});
