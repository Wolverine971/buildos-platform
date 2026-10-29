// apps/mobile/src/components/kit/account-key.tsx
// The account key on the right of the nav bar: shows who is signed in, with Sign out.
import { ActionSheetIOS, Alert, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useInk } from '@/providers/theme-provider';

import { UserRound } from './icons';
import { NavKey } from './nav-bar';

/** Same sign-out as before: this phone only, other devices stay signed in. */
function signOut() {
	void supabase.auth.signOut({ scope: 'local' });
}

/** Nav key that opens an action sheet titled with the signed-in email and a destructive Sign out. */
export function AccountKey() {
	const { session } = useAuth();
	const ink = useInk();
	const email = session?.user.email ?? 'Signed in';

	const open = () => {
		if (Platform.OS === 'ios') {
			ActionSheetIOS.showActionSheetWithOptions(
				{
					title: email,
					options: ['Sign out', 'Cancel'],
					destructiveButtonIndex: 0,
					cancelButtonIndex: 1,
					tintColor: ink.colors.accent,
					userInterfaceStyle: ink.scheme
				},
				(index) => {
					if (index === 0) signOut();
				}
			);
			return;
		}
		Alert.alert(email, undefined, [
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Sign out', style: 'destructive', onPress: signOut }
		]);
	};

	return (
		<NavKey
			icon={UserRound}
			onPress={open}
			accessibilityLabel="Account"
			accessibilityHint="Shows the signed-in email and Sign out"
		/>
	);
}
