// apps/web/src/lib/services/agentic-chat/tools/skills/linkedin-company-page-growth.skill.ts
import rootMarkdown from './definitions/linkedin_company_page_growth/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const linkedinCompanyPageGrowthSkill = defineMarkdownSkill({
	id: 'linkedin_company_page_growth',
	markdown: rootMarkdown
});
