// apps/web/src/lib/services/agentic-chat/tools/skills/calendar.skill.ts
import markdown from './definitions/calendar_management/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const calendarSkill = defineMarkdownSkill({
	id: 'calendar_management',
	markdown
});
