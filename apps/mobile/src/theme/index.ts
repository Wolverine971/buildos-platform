// apps/mobile/src/theme/index.ts
import { inkprintLight, inkprintDark } from './inkprint.generated';

export { inkprintLight, inkprintDark };
export type { InkprintColorName } from './inkprint.generated';

import type { InkprintColorName } from './inkprint.generated';

/** One palette: every Inkprint color token as a hex string, light or dark. */
export type ThemeColors = Record<InkprintColorName, string>;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

// Web weight classes use 0.75rem = 12px.
export const radius = { sm: 8, md: 12, lg: 16 } as const;

// The web uses the system UI font, plus the system monospace for stamps and micro-labels
// (see `.micro-label` and `.stamp` in inkprint.css). React Native defaults to the system font,
// so `ui` stays undefined.
export const fontFamily = { ui: undefined, mono: 'Menlo' } as const;

export function getInkprint(scheme: 'light' | 'dark' | null | undefined): ThemeColors {
	return scheme === 'dark' ? inkprintDark : inkprintLight;
}
