// apps/mobile/src/components/kit/account-key.tsx
// The account key on the right of the nav bar: who is signed in, Account & data on the web
// (exports, delete account), and Sign out.
import * as WebBrowser from 'expo-web-browser';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { openWebPage, signOutIfAccountGone, WEB_PAGES } from '@/lib/web-pages';
import { useAuth } from '@/providers/auth-provider';
import { useInk } from '@/providers/theme-provider';

import { UserRound } from './icons';
import { NavKey } from './nav-bar';

/** Same sign-out as before: this phone only, other devices stay signed in. */
function signOut() {
	void supabase.auth.signOut({ scope: 'local' });
}

/**
 * Opens Profile → Account on the website, signed in. If the person deleted their account
 * there, the phone signs out when the page closes instead of showing errors forever.
 */
async function openAccountPage(accent: string) {
	try {
		await openWebPage(WEB_PAGES.account, {
			createHandoff: (input) => api.auth.createHandoff(input),
			open: (url) =>
				WebBrowser.openBrowserAsync(url, {
					controlsColor: accent,
					dismissButtonStyle: 'done'
				})
		});
	} catch (error) {
		Alert.alert(
			"Couldn't open your account page",
			error instanceof Error && error.message ? error.message : 'Try again in a moment.'
		);
		return;
	}
	await signOutIfAccountGone({
		check: () => api.me(),
		refresh: () => supabase.auth.refreshSession(),
		signOut: () => supabase.auth.signOut({ scope: 'local' })
	});
}

/**
 * Nav key that opens an action sheet titled with the signed-in email: Account & data (the
 * website's account page: exports, delete account) and a destructive Sign out.
 */
export function AccountKey() {
	const { session } = useAuth();
	const ink = useInk();
	const email = session?.user.email ?? 'Signed in';
	const account = () => void openAccountPage(ink.colors.accent);

	const open = () => {
		if (Platform.OS === 'ios') {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					title: email,
					options: ['Account & data', 'Sign out', 'Cancel'],
					destructiveButtonIndex: 1,
					cancelButtonIndex: 2,
					tintColor: ink.colors.accent,
					userInterfaceStyle: ink.scheme
				},
				(index) => {
					if (index === 0) account();
					if (index === 1) signOut();
				}
			);
			return;
		}
		Alert.alert(email, undefined, [
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Account & data', onPress: account },
			{ text: 'Sign out', style: 'destructive', onPress: signOut }
		]);
	};

	return (
		<NavKey
			icon={UserRound}
			onPress={open}
			accessibilityLabel="Account"
			accessibilityHint="Shows the signed-in email, Account & data, and Sign out"
		/>
	);
}
