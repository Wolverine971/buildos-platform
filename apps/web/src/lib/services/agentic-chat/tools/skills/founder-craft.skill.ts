// apps/web/src/lib/services/agentic-chat/tools/skills/founder-craft.skill.ts
import aiEraCraftMarkdown from './definitions/ai_era_craft_and_quality_moat/SKILL.md?raw';
import contextEngineeringMarkdown from './definitions/context_engineering_for_agent_work/SKILL.md?raw';
import nonfictionWritingMarkdown from './definitions/nonfiction_writing_from_lived_conviction/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const aiEraCraftAndQualityMoatSkill = defineMarkdownSkill({
	id: 'ai_era_craft_and_quality_moat',
	markdown: aiEraCraftMarkdown
});

export const contextEngineeringForAgentWorkSkill = defineMarkdownSkill({
	id: 'context_engineering_for_agent_work',
	markdown: contextEngineeringMarkdown
});

export const nonfictionWritingFromLivedConvictionSkill = defineMarkdownSkill({
	id: 'nonfiction_writing_from_lived_conviction',
	markdown: nonfictionWritingMarkdown
});
