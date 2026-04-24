// apps/web/src/lib/server/calendar-token-crypto.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ENCRYPTED_PREFIX = 'enc:v1.';
const ENCRYPTION_CONTEXT = 'buildos:calendar-tokens:v1';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';

type StoredCalendarTokenFields = {
	access_token: string | null;
	refresh_token: string | null;
};

type StoredCalendarTokenPatch = {
	access_token?: string;
	refresh_token?: string | null;
};

function deriveKey(secret: string): Buffer {
	return createHash('sha256').update(`${ENCRYPTION_CONTEXT}:${secret}`, 'utf8').digest();
}

function buildFallbackSecret(): string | null {
	const serviceKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
	const googleSecret = process.env.PRIVATE_GOOGLE_CLIENT_SECRET?.trim();

	if (!serviceKey || !googleSecret) {
		return null;
	}

	return `${serviceKey}:${googleSecret}`;
}

function getKeyCandidates(): Buffer[] {
	const configuredSecret = process.env.PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY?.trim() || null;
	const fallbackSecret = buildFallbackSecret();
	const candidates = [configuredSecret, fallbackSecret].filter(
		(value): value is string => typeof value === 'string' && value.length > 0
	);
	const seen = new Set<string>();

	return candidates
		.map((candidate) => deriveKey(candidate))
		.filter((candidate) => {
			const fingerprint = candidate.toString('hex');
			if (seen.has(fingerprint)) {
				return false;
			}
			seen.add(fingerprint);
			return true;
		});
}

function getActiveKey(): Buffer {
	const [activeKey] = getKeyCandidates();
	if (!activeKey) {
		throw new Error(
			'Calendar token encryption key is not available. Configure PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY or ensure server secrets are present.'
		);
	}
	return activeKey;
}

export function isEncryptedCalendarToken(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptCalendarToken(value: string | null | undefined): string | null {
	if (!value) {
		return value ?? null;
	}

	if (isEncryptedCalendarToken(value)) {
		return value;
	}

	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, getActiveKey(), iv);
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();

	return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, authTag, ciphertext]).toString('base64url')}`;
}

export function decryptCalendarToken(value: string | null | undefined): {
	value: string | null;
	wasEncrypted: boolean;
} {
	if (!value) {
		return { value: value ?? null, wasEncrypted: false };
	}

	if (!isEncryptedCalendarToken(value)) {
		return { value, wasEncrypted: false };
	}

	const payload = value.slice(ENCRYPTED_PREFIX.length);
	const decoded = Buffer.from(payload, 'base64url');

	if (decoded.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
		throw new Error('Encrypted calendar token payload is malformed');
	}

	const iv = decoded.subarray(0, IV_LENGTH);
	const authTag = decoded.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = decoded.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

	for (const key of getKeyCandidates()) {
		try {
			const decipher = createDecipheriv(ALGORITHM, key, iv);
			decipher.setAuthTag(authTag);
			const plaintext = Buffer.concat([
				decipher.update(ciphertext),
				decipher.final()
			]).toString('utf8');

			return { value: plaintext, wasEncrypted: true };
		} catch {
			continue;
		}
	}

	throw new Error('Unable to decrypt calendar token with available keys');
}

export function decodeStoredCalendarTokens<T extends StoredCalendarTokenFields>(
	record: T
): T & { requiresEncryptionUpgrade: boolean } {
	const accessToken = decryptCalendarToken(record.access_token);
	const refreshToken = decryptCalendarToken(record.refresh_token);

	return {
		...record,
		access_token: accessToken.value,
		refresh_token: refreshToken.value,
		requiresEncryptionUpgrade:
			(Boolean(record.access_token) && !accessToken.wasEncrypted) ||
			(Boolean(record.refresh_token) && !refreshToken.wasEncrypted)
	};
}

export function buildEncryptedCalendarTokenPatch(
	tokens: StoredCalendarTokenPatch
): StoredCalendarTokenPatch {
	const patch: StoredCalendarTokenPatch = {};

	if ('access_token' in tokens && typeof tokens.access_token === 'string') {
		const encryptedAccessToken = encryptCalendarToken(tokens.access_token);
		if (encryptedAccessToken) {
			patch.access_token = encryptedAccessToken;
		}
	}

	if ('refresh_token' in tokens) {
		patch.refresh_token = encryptCalendarToken(tokens.refresh_token);
	}

	return patch;
}
