// apps/mobile/src/app/sign-in.tsx
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { AppText } from '@/components/text';
import { TextField } from '@/components/text-field';
import { config } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/providers/theme-provider';
import { spacing } from '@/theme';

/**
 * Email and password against the same Supabase project as the web. Google and Apple sign-in
 * arrive with the development build (they need native modules Expo Go does not ship).
 */
export default function SignInScreen() {
	const colors = useTheme();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const submit = async () => {
		if (busy) return;
		setBusy(true);
		setError(null);
		const { error: signInError } = await supabase.auth.signInWithPassword({
			email: email.trim(),
			password
		});
		if (signInError) {
			setError(
				signInError.message === 'Invalid login credentials'
					? 'That email and password do not match.'
					: signInError.message
			);
		}
		setBusy(false);
	};

	return (
		<KeyboardAvoidingView
			behavior={Platform.OS === 'ios' ? 'padding' : undefined}
			style={{ flex: 1 }}
		>
			<Screen contentContainerStyle={{ justifyContent: 'center' }}>
				<View style={{ gap: spacing.xs }}>
					<AppText variant="label">BuildOS</AppText>
					<AppText variant="title">Sign in</AppText>
					<AppText variant="muted">Same account as build-os.com.</AppText>
				</View>

				<TextField
					label="Email"
					value={email}
					onChangeText={setEmail}
					autoCapitalize="none"
					autoComplete="email"
					keyboardType="email-address"
					textContentType="username"
					returnKeyType="next"
				/>
				<TextField
					label="Password"
					value={password}
					onChangeText={setPassword}
					secureTextEntry
					autoComplete="current-password"
					textContentType="password"
					returnKeyType="go"
					onSubmitEditing={() => void submit()}
				/>

				{error ? (
					<AppText variant="error" accessibilityLiveRegion="polite">
						{error}
					</AppText>
				) : null}

				<Button
					title="Sign in"
					loading={busy}
					disabled={!email.trim() || !password}
					onPress={() => void submit()}
				/>

				<Pressable
					accessibilityRole="link"
					onPress={() =>
						void WebBrowser.openBrowserAsync(
							`${config.apiBaseUrl}/auth/forgot-password`
						)
					}
				>
					<AppText variant="muted" style={{ color: colors.accent, textAlign: 'center' }}>
						Forgot your password?
					</AppText>
				</Pressable>
			</Screen>
		</KeyboardAvoidingView>
	);
}
