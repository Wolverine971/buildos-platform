// apps/mobile/src/app/_layout.tsx
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BoltSpinner, Key } from '@/components/kit';
import { READER_DETENTS } from '@/components/reader/sheet';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { QueryProvider } from '@/providers/query-provider';
import { ThemeProvider, useTheme } from '@/providers/theme-provider';
import { radius, spacing, typeScale } from '@/theme';

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
			<View style={[styles.gate, { backgroundColor: colors.background }]}>
				{loading ? (
					<BoltSpinner size={32} label="Restoring your session" />
				) : (
					<>
						<Text
							selectable
							maxFontSizeMultiplier={1.4}
							style={[typeScale.row, styles.center, { color: colors.destructive }]}
						>
							{error}
						</Text>
						<Key title="Try again" size="sm" variant="outline" onPress={retry} />
					</>
				)}
			</View>
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
				{/*
				 * Today and Workspace, each with its own stack; project pages are pushed inside a
				 * tab so the tab bar stays (see app/(tabs)/(today,workspace)/_layout.tsx).
				 */}
				<Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Today' }} />
				{/*
				 * The reader: a native iOS sheet that opens at two thirds and pulls up to full
				 * height. On this root stack, so it covers the tab bar. The route switches detents
				 * while editing and turns off swipe-to-close while something is unsaved (see
				 * app/reader.tsx).
				 */}
				<Stack.Screen
					name="reader"
					options={{
						presentation: 'formSheet',
						headerShown: false,
						title: 'Reader',
						sheetAllowedDetents: READER_DETENTS,
						sheetInitialDetentIndex: 0,
						sheetGrabberVisible: true,
						sheetCornerRadius: radius.sheet,
						sheetExpandsWhenScrolledToEdge: true,
						contentStyle: { backgroundColor: colors.background }
					}}
				/>
				{/*
				 * Chat: full screen over whatever was open (the website's phone chat is a
				 * full-screen modal too). Opened by the Brain Bolt in any page's nav bar; the
				 * context (Workspace or a project) travels in its params (see app/chat.tsx).
				 */}
				<Stack.Screen
					name="chat"
					options={{
						presentation: 'fullScreenModal',
						headerShown: false,
						title: 'Chat',
						contentStyle: { backgroundColor: colors.bench }
					}}
				/>
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

const styles = StyleSheet.create({
	gate: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: spacing.xl,
		gap: spacing.lg
	},
	center: { textAlign: 'center' }
});
