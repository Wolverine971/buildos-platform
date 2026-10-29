// apps/mobile/src/app/sign-in.tsx
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	Text,
	TextInput,
	type TextInputProps,
	View
} from 'react-native';

import { AlertTriangle, Key, MicroLabel, PageTitle, Wordmark } from '@/components/kit';
import { Screen } from '@/components/screen';
import { useAnnounce } from '@/hooks/use-announce';
import { config } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { useInk } from '@/providers/theme-provider';
import { radius, typeScale, withAlpha } from '@/theme';

/**
 * Email and password against the same Supabase project as the web. Google and Apple sign-in
 * arrive with the development build (they need native modules Expo Go does not ship).
 */
export default function SignInScreen() {
	const { colors } = useInk();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// Spoken with VoiceOver (a live region only works on Android).
	useAnnounce(error);

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
			style={styles.fill}
		>
			<Screen contentContainerStyle={styles.content}>
				<View style={styles.head}>
					<Wordmark size={28} />
					<PageTitle title="Sign in" />
					<Text
						maxFontSizeMultiplier={1.4}
						style={[typeScale.meta, { color: colors.mutedForeground }]}
					>
						Same account as build-os.com.
					</Text>
				</View>

				<Field
					label="Email"
					value={email}
					onChangeText={setEmail}
					autoCapitalize="none"
					autoCorrect={false}
					autoComplete="email"
					keyboardType="email-address"
					textContentType="username"
					returnKeyType="next"
				/>
				<Field
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
					<View style={styles.error}>
						<AlertTriangle size={14} color={colors.destructive} strokeWidth={2} />
						<Text
							maxFontSizeMultiplier={1.4}
							style={[
								typeScale.meta,
								styles.errorText,
								{ color: colors.destructive }
							]}
						>
							{error}
						</Text>
					</View>
				) : null}

				<Key
					title="Sign in"
					variant="primary"
					loading={busy}
					disabled={!email.trim() || !password}
					onPress={() => void submit()}
				/>

				<Pressable
					accessibilityRole="link"
					accessibilityHint="Opens build-os.com in a browser"
					hitSlop={12}
					style={styles.forgot}
					onPress={() =>
						void WebBrowser.openBrowserAsync(
							`${config.apiBaseUrl}/auth/forgot-password`
						)
					}
				>
					{({ pressed }) => (
						<Text
							maxFontSizeMultiplier={1.4}
							style={[
								typeScale.meta,
								styles.forgotText,
								{ color: colors.accent, opacity: pressed ? 0.6 : 1 }
							]}
						>
							Forgot your password?
						</Text>
					)}
				</Pressable>
			</Screen>
		</KeyboardAvoidingView>
	);
}

/** A writable field: micro-label over a card input, accent edge on focus (the search field's look). */
function Field({ label, style, onFocus, onBlur, ...props }: TextInputProps & { label: string }) {
	const ink = useInk();
	const { colors } = ink;
	const [focused, setFocused] = useState(false);
	return (
		<View style={styles.field}>
			<MicroLabel>{label}</MicroLabel>
			<TextInput
				accessibilityLabel={label}
				placeholderTextColor={colors.mutedForeground}
				keyboardAppearance={ink.dark ? 'dark' : 'light'}
				selectionColor={colors.accent}
				cursorColor={colors.accent}
				maxFontSizeMultiplier={1.4}
				{...props}
				onFocus={(event) => {
					setFocused(true);
					onFocus?.(event);
				}}
				onBlur={(event) => {
					setFocused(false);
					onBlur?.(event);
				}}
				style={[
					styles.input,
					{
						color: colors.foreground,
						backgroundColor: colors.card,
						borderColor: focused ? withAlpha(colors.accent, 0.7) : colors.border,
						boxShadow: focused
							? `0 0 0 1px ${withAlpha(colors.accent, 0.3)}, ${ink.shadows.ink}`
							: ink.shadows.ink
					},
					style
				]}
			/>
		</View>
	);
}

const styles = StyleSheet.create({
	fill: { flex: 1 },
	content: { justifyContent: 'center', gap: 16 },
	head: { gap: 6, marginBottom: 4 },
	field: { gap: 6 },
	input: {
		minHeight: 46,
		paddingHorizontal: 12,
		borderWidth: 1,
		borderRadius: radius.md,
		fontSize: 16
	},
	error: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
	errorText: { flex: 1, marginTop: -2 },
	forgot: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
	forgotText: { textAlign: 'center' }
});
