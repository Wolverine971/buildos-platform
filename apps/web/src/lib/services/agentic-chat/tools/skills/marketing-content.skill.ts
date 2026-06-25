// apps/web/src/lib/services/agentic-chat/tools/skills/marketing-content.skill.ts
import algorithmAwarePublishingMarkdown from './definitions/algorithm_aware_publishing/SKILL.md?raw';
import contentCreationPipelineMarkdown from './definitions/content_creation_pipeline/SKILL.md?raw';
import contentStrategyMarkdown from './definitions/content_strategy_beyond_blogging/SKILL.md?raw';
import goingViralMarkdown from './definitions/going_viral/SKILL.md?raw';
import frameworkExtractionLensMarkdown from './definitions/framework_extraction_lens/SKILL.md?raw';
import hookCraftMarkdown from './definitions/hook_craft_short_form/SKILL.md?raw';
import ideaExpansionLensMarkdown from './definitions/idea_expansion_lens/SKILL.md?raw';
import livedConvictionLensMarkdown from './definitions/lived_conviction_lens/SKILL.md?raw';
import mediumTailoringMarkdown from './definitions/medium_tailoring/SKILL.md?raw';
import sensoryDoubleTapMarkdown from './definitions/sensory_double_tap/SKILL.md?raw';
import storyboardJourneyLensMarkdown from './definitions/storyboard_journey_lens/SKILL.md?raw';
import storyDrivenContentMarkdown from './definitions/story_driven_content_craft/SKILL.md?raw';
import viralContentForBoringBrandsMarkdown from './definitions/viral_content_for_boring_brands/SKILL.md?raw';
import viralVideoScriptMarkdown from './definitions/viral_video_script_structure/SKILL.md?raw';
import youtubeChannelCraftMarkdown from './definitions/youtube_channel_craft_for_founders/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const contentCreationPipelineSkill = defineMarkdownSkill({
	id: 'content_creation_pipeline',
	markdown: contentCreationPipelineMarkdown
});

export const ideaExpansionLensSkill = defineMarkdownSkill({
	id: 'idea_expansion_lens',
	markdown: ideaExpansionLensMarkdown
});

export const sensoryDoubleTapSkill = defineMarkdownSkill({
	id: 'sensory_double_tap',
	markdown: sensoryDoubleTapMarkdown
});

export const storyboardJourneyLensSkill = defineMarkdownSkill({
	id: 'storyboard_journey_lens',
	markdown: storyboardJourneyLensMarkdown
});

export const mediumTailoringSkill = defineMarkdownSkill({
	id: 'medium_tailoring',
	markdown: mediumTailoringMarkdown
});

export const livedConvictionLensSkill = defineMarkdownSkill({
	id: 'lived_conviction_lens',
	markdown: livedConvictionLensMarkdown
});

export const frameworkExtractionLensSkill = defineMarkdownSkill({
	id: 'framework_extraction_lens',
	markdown: frameworkExtractionLensMarkdown
});

export const contentStrategyBeyondBloggingSkill = defineMarkdownSkill({
	id: 'content_strategy_beyond_blogging',
	markdown: contentStrategyMarkdown
});

export const hookCraftShortFormSkill = defineMarkdownSkill({
	id: 'hook_craft_short_form',
	markdown: hookCraftMarkdown
});

export const viralVideoScriptStructureSkill = defineMarkdownSkill({
	id: 'viral_video_script_structure',
	markdown: viralVideoScriptMarkdown
});

export const storyDrivenContentCraftSkill = defineMarkdownSkill({
	id: 'story_driven_content_craft',
	markdown: storyDrivenContentMarkdown
});

export const algorithmAwarePublishingSkill = defineMarkdownSkill({
	id: 'algorithm_aware_publishing',
	markdown: algorithmAwarePublishingMarkdown
});

export const goingViralSkill = defineMarkdownSkill({
	id: 'going_viral',
	markdown: goingViralMarkdown
});

export const viralContentForBoringBrandsSkill = defineMarkdownSkill({
	id: 'viral_content_for_boring_brands',
	markdown: viralContentForBoringBrandsMarkdown
});

export const youtubeChannelCraftForFoundersSkill = defineMarkdownSkill({
	id: 'youtube_channel_craft_for_founders',
	markdown: youtubeChannelCraftMarkdown
});
