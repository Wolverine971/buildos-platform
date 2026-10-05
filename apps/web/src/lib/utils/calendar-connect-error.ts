// apps/web/src/lib/utils/calendar-connect-error.ts
// Messages for the `?calendar=1&error=<code>` codes the Calendar OAuth callback redirects with.

export function calendarConnectErrorMessage(errorCode: string): string {
	switch (errorCode) {
		case 'access_denied':
			return 'Access to Google Calendar was denied';
		case 'scope_mismatch':
			// Google's consent screen lets people untick individual Calendar permissions.
			return "Google didn't give BuildOS every Calendar permission it needs. Connect again and leave all the Calendar boxes checked.";
		case 'no_authorization_code':
			return 'No authorization code received from Google';
		case 'invalid_state':
			return 'Invalid security token. Please try again.';
		case 'token_exchange_failed':
			return 'Failed to exchange authorization code for tokens';
		default:
			return `Calendar connection failed: ${errorCode}`;
	}
}
