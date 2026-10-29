// apps/mobile/src/components/kit/index.ts
// The BuildOS kit. Each agent appends its exports in its own block; re-read before editing.

// Foundation
export * from './icons';
export { GraphPaper, Grain, Halftone, usePatternId } from './textures';
export { MicroLabel, Stamp, type LabelTone, type StampTone } from './label';
export {
	Key,
	RoundKey,
	playHaptic,
	type KeyHaptic,
	type KeyProps,
	type KeySize,
	type KeyVariant,
	type RoundKeyProps,
	type RoundKeyTone
} from './key';
export { Wordmark } from './wordmark';
export { BOLT_PATH, BoltMark, BoltScrollView, BoltSpinner, type BoltScrollViewProps } from './bolt';
export { Bench, PageTitle, Sheet } from './frame';
export { hitSlopFor, KEY_PRESS, KEY_SPRING, PULL } from './math';

// Chrome
export {
	NAV_BAR_HEIGHT,
	NAV_KEY_SIZE,
	NavBar,
	NavKey,
	type NavBack,
	type NavBarProps,
	type NavKeyProps
} from './nav-bar';
export { AccountKey } from './account-key';
export { TAB_BAR_ROW_HEIGHT, TabBar } from './tab-bar';

// Tiles
export {
	ProjectTile,
	PulsePill,
	type ProjectTileProps,
	type PulsePillProps
} from './project-tile';
