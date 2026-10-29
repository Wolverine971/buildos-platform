// apps/mobile/src/providers/theme-provider.tsx
import { createContext, type PropsWithChildren, use, useEffect, useState } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { getInk, type Ink, type Scheme, type ThemeColors } from '@/theme';

const InkContext = createContext<Ink | null>(null);
// Separate so a motion change never re-renders color consumers.
const ReducedMotionContext = createContext(false);

/** Follows the system light/dark and Reduce Motion settings; colors are the web's Inkprint tokens. */
export function ThemeProvider({ children }: PropsWithChildren) {
	const ink = getInk(useColorScheme());
	const [reduceMotion, setReduceMotion] = useState(false);

	useEffect(() => {
		let alive = true;
		AccessibilityInfo.isReduceMotionEnabled()
			.then((on) => {
				if (alive) setReduceMotion(on);
			})
			.catch(() => {});
		const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
		return () => {
			alive = false;
			sub.remove();
		};
	}, []);

	return (
		<InkContext value={ink}>
			<ReducedMotionContext value={reduceMotion}>{children}</ReducedMotionContext>
		</InkContext>
	);
}

function useInkContext(hook: string): Ink {
	const ink = use(InkContext);
	if (!ink) throw new Error(`${hook} must be used within ThemeProvider.`);
	return ink;
}

export function useTheme(): ThemeColors {
	return useInkContext('useTheme').colors;
}

export function useScheme(): Scheme {
	return useInkContext('useScheme').scheme;
}

/** Colors plus shadows, pulse colors, texture ink and key tones for the current scheme. */
export function useInk(): Ink {
	return useInkContext('useInk');
}

/** True when the user turned on Reduce Motion: skip bounces, scale and spin. */
export function useReducedMotion(): boolean {
	return use(ReducedMotionContext);
}
