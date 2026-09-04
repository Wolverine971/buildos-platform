// packages/shared-agent-ops/src/calendar/google-calendar-token-crypto.ts
// Server-only authenticated encryption for source-aware Calendar credentials.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ACTIVE_KEY_VERSION = 1;
const ENCRYPTED_PREFIX = 'enc:calendar:v';
const ENCRYPTION_CONTEXT = 'buildos:google-calendar-connection-tokens';

export type GoogleCalendarOauthClientKind = 'google_calendar' | 'google_shared_login';

export type GoogleCalendarTokenContext = {
	userId: string;
	connectionId: string;
	providerAccountId: string;
	oauthClientKind: GoogleCalendarOauthClientKind;
};

export type GoogleCalendarTokenKeyResolver = (version: number) => string | undefined;

export function googleCalendarTokenKeyEnvVarName(version: number): string {
	return `PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V${version}`;
}

/**
 * "The key is not on this host" and "this key cannot open that ciphertext" are
 * different operational failures with different fixes. Callers could only tell
 * them apart by matching message text, so a missing/short key now throws a named
 * error carrying the env var an operator has to set. Never carries key material.
 */
export class GoogleCalendarTokenKeyUnavailableError extends Error {
	constructor(
		public readonly keyVersion: number,
		public readonly envVarName: string,
		message: string
	) {
		super(message);
		this.name = 'GoogleCalendarTokenKeyUnavailableError';
	}
}

/** Bundle boundaries can break `instanceof`; match by shape as the services do. */
export function isGoogleCalendarTokenKeyUnavailableError(error: unknown): boolean {
	if (error instanceof GoogleCalendarTokenKeyUnavailableError) return true;
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { name?: unknown }).name === 'GoogleCalendarTokenKeyUnavailableError'
	);
}

export const resolveGoogleCalendarTokenKeyFromEnv: GoogleCalendarTokenKeyResolver = (version) =>
	process.env[googleCalendarTokenKeyEnvVarName(version)];

function getKeySecret(version: number, resolveKey: GoogleCalendarTokenKeyResolver): string {
	const secret = resolveKey(version)?.trim();
	if (!secret) {
		throw new GoogleCalendarTokenKeyUnavailableError(
			version,
			googleCalendarTokenKeyEnvVarName(version),
			`Calendar connection token encryption key V${version} is unavailable. Configure ${googleCalendarTokenKeyEnvVarName(version)}.`
		);
	}

	if (Buffer.byteLength(secret, 'utf8') < 32) {
		throw new GoogleCalendarTokenKeyUnavailableError(
			version,
			googleCalendarTokenKeyEnvVarName(version),
			`Calendar connection token encryption key V${version} must contain at least 32 bytes of secret material.`
		);
	}

	return secret;
}

function deriveKey(version: number, resolveKey: GoogleCalendarTokenKeyResolver): Buffer {
	return createHash('sha256')
		.update(`${ENCRYPTION_CONTEXT}:v${version}:${getKeySecret(version, resolveKey)}`, 'utf8')
		.digest();
}

function serializeContext(context: GoogleCalendarTokenContext): Buffer {
	if (
		!context.userId ||
		!context.connectionId ||
		!context.providerAccountId ||
		!context.oauthClientKind
	) {
		throw new Error('Complete Calendar connection token encryption context is required');
	}

	return Buffer.from(
		JSON.stringify({
			context: ENCRYPTION_CONTEXT,
			userId: context.userId,
			connectionId: context.connectionId,
			providerAccountId: context.providerAccountId,
			oauthClientKind: context.oauthClientKind
		}),
		'utf8'
	);
}

function parseEncryptedToken(value: string): { version: number; payload: Buffer } {
	const match = /^enc:calendar:v(\d+)\.([A-Za-z0-9_-]+)$/.exec(value);
	if (!match) {
		throw new Error('Calendar connection OAuth token is not in the expected encrypted format');
	}

	const version = Number(match[1]);
	if (!Number.isInteger(version) || version < 1) {
		throw new Error('Calendar connection OAuth token has an invalid key version');
	}

	return {
		version,
		payload: Buffer.from(match[2]!, 'base64url')
	};
}

export function getActiveGoogleCalendarTokenKeyVersion(): number {
	return ACTIVE_KEY_VERSION;
}

export function isEncryptedGoogleCalendarToken(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptGoogleCalendarToken(
	value: string,
	context: GoogleCalendarTokenContext,
	resolveKey: GoogleCalendarTokenKeyResolver = resolveGoogleCalendarTokenKeyFromEnv
): string {
	if (!value) {
		throw new Error('Cannot encrypt an empty Calendar connection OAuth token');
	}
	if (isEncryptedGoogleCalendarToken(value)) {
		throw new Error('Calendar connection OAuth token is already encrypted');
	}

	const version = ACTIVE_KEY_VERSION;
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, deriveKey(version, resolveKey), iv);
	cipher.setAAD(serializeContext(context));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	const payload = Buffer.concat([iv, authTag, ciphertext]).toString('base64url');

	return `${ENCRYPTED_PREFIX}${version}.${payload}`;
}

export function decryptGoogleCalendarToken(
	value: string,
	context: GoogleCalendarTokenContext,
	resolveKey: GoogleCalendarTokenKeyResolver = resolveGoogleCalendarTokenKeyFromEnv
): string {
	const { version, payload } = parseEncryptedToken(value);
	if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
		throw new Error('Encrypted Calendar connection OAuth token payload is malformed');
	}

	const iv = payload.subarray(0, IV_LENGTH);
	const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
	const decipher = createDecipheriv(ALGORITHM, deriveKey(version, resolveKey), iv);
	decipher.setAAD(serializeContext(context));
	decipher.setAuthTag(authTag);

	try {
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
	} catch {
		throw new Error('Unable to decrypt Calendar OAuth token for this connection');
	}
}
