// apps/web/src/lib/services/agentic-chat/tools/skills/sales-growth.skill.ts
import growthDiagnosticsMarkdown from './definitions/growth_diagnostics_for_stalled_products/SKILL.md?raw';
import landingPageScorecardMarkdown from './definitions/landing_page_scorecard_funnel/SKILL.md?raw';
import leadListResearchMarkdown from './definitions/lead_list_research/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const landingPageScorecardFunnelSkill = defineMarkdownSkill({
	id: 'landing_page_scorecard_funnel',
	markdown: landingPageScorecardMarkdown
});

export const growthDiagnosticsForStalledProductsSkill = defineMarkdownSkill({
	id: 'growth_diagnostics_for_stalled_products',
	markdown: growthDiagnosticsMarkdown
});

export const leadListResearchSkill = defineMarkdownSkill({
	id: 'lead_list_research',
	markdown: leadListResearchMarkdown
});
