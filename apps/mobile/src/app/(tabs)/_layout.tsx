// apps/mobile/src/app/(tabs)/_layout.tsx
import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router/js-tabs';

import { AppText } from '@/components/text';
import { useTheme } from '@/providers/theme-provider';

/** Today and Projects, the phone's two homes. Readers open as sheets over either. */
export default function TabsLayout() {
	const colors = useTheme();
	return (
		<Tabs
			screenOptions={{
				headerStyle: { backgroundColor: colors.bench },
				headerTintColor: colors.foreground,
				headerTitleStyle: { color: colors.foreground },
				headerShadowVisible: false,
				tabBarActiveTintColor: colors.accent,
				tabBarInactiveTintColor: colors.mutedForeground,
				tabBarStyle: { backgroundColor: colors.bench, borderTopColor: colors.border },
				sceneStyle: { backgroundColor: colors.background }
			}}
		>
			<Tabs.Screen
				name="index"
				options={{
					title: 'Today',
					tabBarIcon: ({ color, size }) => (
						<SymbolView
							name="sun.max"
							size={size}
							tintColor={color}
							fallback={<AppText style={{ color }}>☀</AppText>}
						/>
					)
				}}
			/>
			<Tabs.Screen
				name="projects"
				options={{
					title: 'Projects',
					tabBarIcon: ({ color, size }) => (
						<SymbolView
							name="folder"
							size={size}
							tintColor={color}
							fallback={<AppText style={{ color }}>▤</AppText>}
						/>
					)
				}}
			/>
		</Tabs>
	);
}
