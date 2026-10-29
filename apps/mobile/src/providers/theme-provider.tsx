// apps/mobile/src/providers/theme-provider.tsx
import { createContext, type PropsWithChildren, use } from 'react';
import { useColorScheme } from 'react-native';

import { getInkprint, type ThemeColors } from '@/theme';

const ThemeContext = createContext<ThemeColors | null>(null);

/** Follows the system light/dark setting; the palette is the web's Inkprint tokens. */
export function ThemeProvider({ children }: PropsWithChildren) {
	const scheme = useColorScheme();
	return <ThemeContext value={getInkprint(scheme)}>{children}</ThemeContext>;
}

export function useTheme(): ThemeColors {
	const colors = use(ThemeContext);
	if (!colors) throw new Error('useTheme must be used within ThemeProvider.');
	return colors;
}
