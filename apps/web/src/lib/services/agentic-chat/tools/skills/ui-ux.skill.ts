// apps/web/src/lib/services/agentic-chat/tools/skills/ui-ux.skill.ts
import rootMarkdown from './definitions/build_quality_ui_ux/SKILL.md?raw';
import accessibilityMarkdown from './definitions/accessibility_inclusive_ui_review/SKILL.md?raw';
import calmSoftwareMarkdown from './definitions/calm_software_design_review/SKILL.md?raw';
import delightfulProductMarkdown from './definitions/delightful_product_review/SKILL.md?raw';
import designSystemMarkdown from './definitions/design_system_architecture_review/SKILL.md?raw';
import informationArchitectureMarkdown from './definitions/information_architecture_review/SKILL.md?raw';
import marketingSiteMarkdown from './definitions/marketing_site_design_review/SKILL.md?raw';
import uiUxQualityMarkdown from './definitions/ui_ux_quality_review/SKILL.md?raw';
import usabilityQuickResearchMarkdown from './definitions/usability_quick_research/SKILL.md?raw';
import visualCraftMarkdown from './definitions/visual_craft_fundamentals/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const buildQualityUiUxSkill = defineMarkdownSkill({
	id: 'build_quality_ui_ux',
	markdown: rootMarkdown
});

export const uiUxQualityReviewSkill = defineMarkdownSkill({
	id: 'ui_ux_quality_review',
	markdown: uiUxQualityMarkdown
});

export const visualCraftFundamentalsSkill = defineMarkdownSkill({
	id: 'visual_craft_fundamentals',
	markdown: visualCraftMarkdown
});

export const accessibilityInclusiveUiReviewSkill = defineMarkdownSkill({
	id: 'accessibility_inclusive_ui_review',
	markdown: accessibilityMarkdown
});

export const marketingSiteDesignReviewSkill = defineMarkdownSkill({
	id: 'marketing_site_design_review',
	markdown: marketingSiteMarkdown
});

export const calmSoftwareDesignReviewSkill = defineMarkdownSkill({
	id: 'calm_software_design_review',
	markdown: calmSoftwareMarkdown
});

export const delightfulProductReviewSkill = defineMarkdownSkill({
	id: 'delightful_product_review',
	markdown: delightfulProductMarkdown
});

export const designSystemArchitectureReviewSkill = defineMarkdownSkill({
	id: 'design_system_architecture_review',
	markdown: designSystemMarkdown
});

export const informationArchitectureReviewSkill = defineMarkdownSkill({
	id: 'information_architecture_review',
	markdown: informationArchitectureMarkdown
});

export const usabilityQuickResearchSkill = defineMarkdownSkill({
	id: 'usability_quick_research',
	markdown: usabilityQuickResearchMarkdown
});
