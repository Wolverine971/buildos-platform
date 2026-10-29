// apps/mobile/src/providers/auth-provider.tsx
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, type PropsWithChildren, use, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

type AuthState = {
	session: Session | null;
	loading: boolean;
	error: string | null;
	retry: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Restores the keychain session on launch, follows Supabase auth events, and keeps token
 * refresh running only while the app is in the foreground. The query cache is cleared whenever
 * the signed-in user changes, so one account never sees another's cached screens.
 */
export function AuthProvider({ children }: PropsWithChildren) {
	const queryClient = useQueryClient();
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [attempt, setAttempt] = useState(0);

	useEffect(() => {
		let active = true;
		let revision = 0;
		let previousUserId: string | null | undefined;

		const acceptSession = (next: Session | null) => {
			const userId = next?.user.id ?? null;
			if (previousUserId !== undefined && previousUserId !== userId) queryClient.clear();
			previousUserId = userId;
			setSession(next);
			setError(null);
			setLoading(false);
		};

		const {
			data: { subscription }
		} = supabase.auth.onAuthStateChange((_event, next) => {
			revision++;
			if (!active) return;
			acceptSession(next);
		});

		const initialRevision = revision;
		void supabase.auth
			.getSession()
			.then(({ data, error: sessionError }) => {
				if (!active || revision !== initialRevision) return;
				if (sessionError) throw sessionError;
				acceptSession(data.session);
			})
			.catch(() => {
				if (!active || revision !== initialRevision) return;
				setError(
					'Your saved session could not be restored. Check your connection and try again.'
				);
				setLoading(false);
			});

		const refreshForState = (state: string) => {
			if (state === 'active') void supabase.auth.startAutoRefresh();
			else void supabase.auth.stopAutoRefresh();
		};
		refreshForState(AppState.currentState ?? 'active');
		const appState = AppState.addEventListener('change', refreshForState);

		return () => {
			active = false;
			subscription.unsubscribe();
			appState.remove();
			void supabase.auth.stopAutoRefresh();
		};
	}, [attempt, queryClient]);

	return (
		<AuthContext
			value={{
				session,
				loading,
				error,
				retry: () => {
					setLoading(true);
					setError(null);
					setAttempt((value) => value + 1);
				}
			}}
		>
			{children}
		</AuthContext>
	);
}

export function useAuth(): AuthState {
	const context = use(AuthContext);
	if (!context) throw new Error('useAuth must be used within AuthProvider.');
	return context;
}
