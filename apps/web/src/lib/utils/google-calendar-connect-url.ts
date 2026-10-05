// apps/web/src/lib/utils/google-calendar-connect-url.ts
// Browser helper for "connect Google Calendar" buttons outside the Settings tab. Legacy users get
// their auth URL from /profile/calendar; multi-account users (dedicated Calendar OAuth client)
// get none there and start the flow through the connections API instead.

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function unwrap(payload: any): any {
	return payload?.success === true && payload && 'data' in payload ? payload.data : payload;
}

function errorMessage(payload: any, fallback: string): string {
	return payload?.error || payload?.message || fallback;
}

export async function getGoogleCalendarConnectUrl(
	redirectPath: string,
	fetchImpl: FetchLike = fetch
): Promise<string> {
	const settingsResponse = await fetchImpl(
		`/profile/calendar?redirect=${encodeURIComponent(redirectPath)}`,
		{ cache: 'no-store' }
	);
	const settingsPayload = await settingsResponse.json().catch(() => null);
	if (!settingsResponse.ok) {
		throw new Error(errorMessage(settingsPayload, 'Failed to get calendar auth URL'));
	}

	const settings = unwrap(settingsPayload);
	if (settings?.calendarAuthUrl) return settings.calendarAuthUrl;

	if (settings?.multiCalendar) {
		const connectResponse = await fetchImpl('/api/integrations/google-calendar/connections', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ redirectPath })
		});
		const connectPayload = await connectResponse.json().catch(() => null);
		if (!connectResponse.ok) {
			throw new Error(
				errorMessage(connectPayload, 'Failed to start Google Calendar connection')
			);
		}
		const authorizationUrl = unwrap(connectPayload)?.authorizationUrl;
		if (authorizationUrl) return authorizationUrl;
	}

	throw new Error('No auth URL returned');
}
