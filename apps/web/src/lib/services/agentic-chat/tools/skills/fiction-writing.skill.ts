import fictionStoryCraftMarkdown from './definitions/fiction_story_craft/SKILL.md?raw';
import { defineMarkdownSkill } from './markdown-skill';

export const fictionStoryCraftSkill = defineMarkdownSkill({
	id: 'fiction_story_craft',
	markdown: fictionStoryCraftMarkdown
});
