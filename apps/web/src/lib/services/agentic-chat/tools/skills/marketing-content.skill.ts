// apps/web/src/lib/services/agentic-chat/tools/skills/marketing-content.skill.ts
import algorithmAwarePublishingMarkdown from './definitions/algorithm_aware_publishing/SKILL.md?raw';
import contentStrategyMarkdown from './definitions/content_strategy_beyond_blogging/SKILL.md?raw';
import goingViralMarkdown from './definitions/going_viral/SKILL.md?raw';
import hookCraftMarkdown from './definitions/hook_craft_short_form/SKILL.md?raw';
import storyDrivenContentMarkdown from './definitions/story_driven_content_craft/SKILL.md?raw';
import viralContentForBoringBrandsMarkdown from './definitions/viral_content_for_boring_brands/SKILL.md?raw';
import viralVideoScriptMarkdown from './definitions/viral_video_script_structure/SKILL.md?raw';
import youtubeChannelCraftMarkdown from './definitions/youtube_channel_craft_for_founders/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

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
