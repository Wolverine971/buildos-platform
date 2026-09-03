// apps/web/src/lib/server/google-calendar-token-crypto.ts
// Preserve the web API while workers use the same server-only encryption code.
import { env as privateEnv } from '$env/dynamic/private';
import {
	decryptGoogleCalendarToken as decryptToken,
	encryptGoogleCalendarToken as encryptToken,
	type GoogleCalendarTokenContext,
	type GoogleCalendarTokenKeyResolver
} from '@buildos/shared-agent-ops/calendar/google-calendar-token-crypto';

export {
	getActiveGoogleCalendarTokenKeyVersion,
	isEncryptedGoogleCalendarToken,
	type GoogleCalendarOauthClientKind,
	type GoogleCalendarTokenContext
} from '@buildos/shared-agent-ops/calendar/google-calendar-token-crypto';

export const resolveWebGoogleCalendarTokenKey: GoogleCalendarTokenKeyResolver = (version) => {
	const name = `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V${version}`;
	return privateEnv[name] ?? process.env[name];
};

export function encryptGoogleCalendarToken(
	value: string,
	context: GoogleCalendarTokenContext
): string {
	return encryptToken(value, context, resolveWebGoogleCalendarTokenKey);
}

export function decryptGoogleCalendarToken(
	value: string,
	context: GoogleCalendarTokenContext
): string {
	return decryptToken(value, context, resolveWebGoogleCalendarTokenKey);
}
