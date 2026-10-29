// apps/mobile/src/lib/config.ts
/**
 * Public configuration baked into the app bundle. Only EXPO_PUBLIC_* values are inlined by
 * Expo, and only when referenced explicitly (process.env.EXPO_PUBLIC_X), so each is read once
 * here. Nothing secret belongs in this file or in the app.
 */

export type MobileConfig = {
	supabaseUrl: string;
	supabaseAnonKey: string;
	apiBaseUrl: string;
};

export function readMobileConfig(env: {
	supabaseUrl?: string;
	supabaseAnonKey?: string;
	apiBaseUrl?: string;
}): MobileConfig {
	const supabaseUrl = env.supabaseUrl?.trim();
	const supabaseAnonKey = env.supabaseAnonKey?.trim();
	const apiBaseUrl = (env.apiBaseUrl?.trim() || 'https://build-os.com').replace(/\/+$/, '');

	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error(
			'Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to apps/mobile/.env.local, then restart Expo.'
		);
	}

	const parsed = new URL(supabaseUrl);
	if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
		throw new Error('EXPO_PUBLIC_SUPABASE_URL must be the HTTPS URL of the Supabase project.');
	}
	if (supabaseAnonKey.startsWith('sb_secret_')) {
		throw new Error(
			'The app must use the publishable (anon) Supabase key, never a secret key.'
		);
	}

	const api = new URL(apiBaseUrl);
	if (api.protocol !== 'https:' && api.protocol !== 'http:') {
		throw new Error('EXPO_PUBLIC_API_URL must be an http(s) URL.');
	}
	if (api.protocol === 'http:' && !isPrivateHost(api.hostname)) {
		throw new Error('EXPO_PUBLIC_API_URL may only use plain http for a LAN dev server.');
	}

	return { supabaseUrl: parsed.origin, supabaseAnonKey, apiBaseUrl };
}

// Local dev servers run on the laptop's LAN address; everything else must be HTTPS.
function isPrivateHost(hostname: string): boolean {
	return (
		hostname === 'localhost' ||
		hostname.endsWith('.local') ||
		/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
	);
}
