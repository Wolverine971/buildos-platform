// apps/web/src/lib/services/agentic-chat/tools/skills/table.skill.ts
import markdown from './definitions/table_workspace/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

/** BuildOS Tables (2026-10-04): preloaded when the focused entity is a table. */
export const tableSkill = defineMarkdownSkill({
	id: 'table_workspace',
	markdown
});
