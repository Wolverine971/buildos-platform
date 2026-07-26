// apps/web/src/lib/services/agentic-chat/tools/skills/research-capture.skill.ts
import markdown from './definitions/research_capture/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const researchCaptureSkill = defineMarkdownSkill({
	id: 'research_capture',
	markdown
});
