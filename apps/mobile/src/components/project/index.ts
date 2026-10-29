// apps/mobile/src/components/project/index.ts
// The project screen's pieces (app/(tabs)/(today,workspace)/project/[id].tsx).
export {
	backTarget,
	countsStamp,
	dueTone,
	editedLabel,
	emojiGlyphs,
	fallbackTile,
	headerTile,
	shortDate,
	shortDue,
	shortLabel,
	taskCounts,
	taskGlyph,
	taskRowLabel,
	webProjectUrl,
	type BackTarget,
	type GlyphShape,
	type GlyphTone,
	type ProjectRowLike,
	type TaskCounts
} from './format';
export { useBackLabel, useDesktopSnapshot } from './hooks';
export { HEADER_TILE, PAGE_INSET, ProjectHeader, type ProjectHeaderProps } from './project-header';
export { DateChip, Glyph, GLYPH_SIZE, ListRow, type ListRowProps } from './rows';
export { ShowAll } from './show-all';
export { SubProjects, type SubProjectsProps } from './sub-projects';
export { TaskList, type TaskListProps } from './task-list';
export { DocList, type DocListProps } from './doc-list';
export { UnderlineTabs, type UnderlineTab, type UnderlineTabsProps } from './underline-tabs';
