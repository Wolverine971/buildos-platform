// apps/mobile/src/app/(tabs)/_layout.tsx
import { type BottomTabBarProps, Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';

import { FolderOpen, type Icon, Sun, TabBar } from '@/components/kit';
import { TAB_LABEL, TAB_ROUTE } from '@/lib/routes';
import { useTheme } from '@/providers/theme-provider';

// Module scope so the navigator gets the same functions every render.
const renderTabBar = (props: BottomTabBarProps) => <TabBar {...props} />;

function tabIcon(Glyph: Icon) {
	return ({ color, size }: { color: ColorValue; size: number }) => (
		<Glyph size={size} color={color} strokeWidth={1.9} />
	);
}
const todayIcon = tabIcon(Sun);
const workspaceIcon = tabIcon(FolderOpen);

/**
 * Today and Workspace, the phone's two homes. Each tab is a group with its own stack
 * ((today,workspace)/_layout.tsx), so a project pushed on either keeps this bar. Each screen
 * draws its own NavBar, so the navigator's headers are off; readers open as sheets over both.
 */
export default function TabsLayout() {
	const colors = useTheme();
	return (
		<Tabs
			tabBar={renderTabBar}
			screenOptions={{
				headerShown: false,
				sceneStyle: { backgroundColor: colors.background }
			}}
		>
			<Tabs.Screen
				name={TAB_ROUTE.today}
				options={{ title: TAB_LABEL.today, tabBarIcon: todayIcon }}
			/>
			<Tabs.Screen
				name={TAB_ROUTE.workspace}
				options={{ title: TAB_LABEL.workspace, tabBarIcon: workspaceIcon }}
			/>
		</Tabs>
	);
}
