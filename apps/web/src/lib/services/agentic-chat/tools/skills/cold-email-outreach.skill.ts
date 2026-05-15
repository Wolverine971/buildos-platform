// apps/web/src/lib/services/agentic-chat/tools/skills/cold-email-outreach.skill.ts
import rootMarkdown from './definitions/cold_email_engagement_first_outreach/SKILL.md?raw';
import deliverabilityMarkdown from './definitions/cold_email_deliverability_readiness/SKILL.md?raw';
import icpSignalMarkdown from './definitions/cold_email_icp_signal_design/SKILL.md?raw';
import learningReviewMarkdown from './definitions/cold_email_learning_review/SKILL.md?raw';
import offerLabMarkdown from './definitions/cold_email_offer_lab/SKILL.md?raw';
import compilerMarkdown from './definitions/cold_email_outreach_compiler/SKILL.md?raw';
import replyOsMarkdown from './definitions/cold_email_reply_os/SKILL.md?raw';
import researchAnchorsMarkdown from './definitions/cold_email_research_anchors/SKILL.md?raw';
import tasteReviewMarkdown from './definitions/cold_email_taste_review/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const coldEmailEngagementFirstOutreachSkill = defineMarkdownSkill({
	id: 'cold_email_engagement_first_outreach',
	markdown: rootMarkdown
});

export const coldEmailIcpSignalDesignSkill = defineMarkdownSkill({
	id: 'cold_email_icp_signal_design',
	markdown: icpSignalMarkdown
});

export const coldEmailOfferLabSkill = defineMarkdownSkill({
	id: 'cold_email_offer_lab',
	markdown: offerLabMarkdown
});

export const coldEmailResearchAnchorsSkill = defineMarkdownSkill({
	id: 'cold_email_research_anchors',
	markdown: researchAnchorsMarkdown
});

export const coldEmailOutreachCompilerSkill = defineMarkdownSkill({
	id: 'cold_email_outreach_compiler',
	markdown: compilerMarkdown
});

export const coldEmailTasteReviewSkill = defineMarkdownSkill({
	id: 'cold_email_taste_review',
	markdown: tasteReviewMarkdown
});

export const coldEmailDeliverabilityReadinessSkill = defineMarkdownSkill({
	id: 'cold_email_deliverability_readiness',
	markdown: deliverabilityMarkdown
});

export const coldEmailReplyOsSkill = defineMarkdownSkill({
	id: 'cold_email_reply_os',
	markdown: replyOsMarkdown
});

export const coldEmailLearningReviewSkill = defineMarkdownSkill({
	id: 'cold_email_learning_review',
	markdown: learningReviewMarkdown
});
