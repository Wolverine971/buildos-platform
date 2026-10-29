// apps/mobile/src/app/_layout.tsx
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { AppText } from '@/components/text';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeProvider, useTheme } from '@/providers/theme-provider';

export { ErrorBoundary } from 'expo-router';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigation() {
	const { session, loading, error, retry } = useAuth();
	const colors = useTheme();

	useEffect(() => {
		if (!loading) void SplashScreen.hideAsync().catch(() => {});
	}, [loading]);

	if (loading || error) {
		return (
			<Screen contentContainerStyle={{ justifyContent: 'center' }}>
				{loading ? (
					<ActivityIndicator
						color={colors.accent}
						accessibilityLabel="Restoring your session"
					/>
				) : (
					<>
						<AppText variant="error" selectable>
							{error}
						</AppText>
						<Button title="Try again" onPress={retry} />
					</>
				)}
			</Screen>
		);
	}

	return (
		<Stack
			screenOptions={{
				headerStyle: { backgroundColor: colors.bench },
				headerTintColor: colors.foreground,
				headerTitleStyle: { color: colors.foreground },
				headerShadowVisible: false,
				contentStyle: { backgroundColor: colors.background }
			}}
		>
			<Stack.Protected guard={!session}>
				<Stack.Screen name="sign-in" options={{ headerShown: false }} />
			</Stack.Protected>
			<Stack.Protected guard={!!session}>
				<Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Today' }} />
				<Stack.Screen
					name="project/[id]"
					options={{ title: 'Project', headerBackTitle: 'Back' }}
				/>
				<Stack.Screen name="reader" options={{ presentation: 'modal', title: 'Task' }} />
			</Stack.Protected>
		</Stack>
	);
}

export default function RootLayout() {
	return (
		<ThemeProvider>
			<QueryProvider>
				<AuthProvider>
					<StatusBar style="auto" />
					<Navigation />
				</AuthProvider>
			</QueryProvider>
		</ThemeProvider>
	);
}
