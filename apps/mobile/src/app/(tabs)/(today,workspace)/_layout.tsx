// apps/mobile/src/app/(tabs)/(today,workspace)/_layout.tsx
import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { TabStackContext } from '@/hooks/use-tab-stack';
import { tabStackFromSegment } from '@/lib/routes';
import { useTheme } from '@/providers/theme-provider';

// Each tab's root under any project pushed on it (also seeds the root under a deep link).
export const unstable_settings = {
	today: { anchor: 'index' },
	workspace: { anchor: 'projects' }
};

/**
 * One native stack per tab, so a project keeps the tab bar and stays in the tab it was opened
 * from. Expo Router builds this layout (and project/[id].tsx) once for (today) and once for
 * (workspace); `segment` says which. Re-tapping the current tab pops its stack to the root (the
 * stack listens for tabPress), then scrolls the root to the top. Screens draw their own nav bar.
 */
export default function TabStackLayout({ segment }: { segment?: string }) {
	const colors = useTheme();
	const tab = tabStackFromSegment(segment);
	const screenOptions = useMemo(
		() => ({ headerShown: false, contentStyle: { backgroundColor: colors.background } }),
		[colors.background]
	);

	return (
		<TabStackContext value={tab}>
			<Stack screenOptions={screenOptions} />
		</TabStackContext>
	);
}
