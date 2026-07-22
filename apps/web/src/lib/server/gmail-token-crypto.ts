// apps/web/src/lib/server/gmail-token-crypto.ts
import { env as privateEnv } from '$env/dynamic/private';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const ACTIVE_KEY_VERSION = 1;
const ENCRYPTED_PREFIX = 'enc:gmail:v';
const ENCRYPTION_CONTEXT = 'buildos:gmail-oauth-tokens';

export type GmailGrantKind = 'read' | 'send' | 'compose' | 'modify';

export type GmailTokenContext = {
	userId: string;
	providerAccountId: string;
	grantKind: GmailGrantKind;
};

function getPrivateEnv(name: string): string | undefined {
	return privateEnv[name] ?? process.env[name];
}

function getKeySecret(version: number): string {
	const secret = getPrivateEnv(`PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V${version}`)?.trim();
	if (!secret) {
		throw new Error(
			`Gmail token encryption key V${version} is unavailable. Configure PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V${version}.`
		);
	}
	if (Buffer.byteLength(secret, 'utf8') < 32) {
		throw new Error(
			`Gmail token encryption key V${version} must contain at least 32 bytes of secret material.`
		);
	}

	return secret;
}

function deriveKey(version: number): Buffer {
	return createHash('sha256')
		.update(`${ENCRYPTION_CONTEXT}:v${version}:${getKeySecret(version)}`, 'utf8')
		.digest();
}

function serializeContext(context: GmailTokenContext): Buffer {
	if (!context.userId || !context.providerAccountId || !context.grantKind) {
		throw new Error('Complete Gmail token encryption context is required');
	}

	return Buffer.from(
		JSON.stringify({
			context: ENCRYPTION_CONTEXT,
			userId: context.userId,
			providerAccountId: context.providerAccountId,
			grantKind: context.grantKind
		}),
		'utf8'
	);
}

function parseEncryptedToken(value: string): {
	version: number;
	payload: Buffer;
} {
	const match = /^enc:gmail:v(\d+)\.([A-Za-z0-9_-]+)$/.exec(value);
	if (!match) {
		throw new Error('Gmail OAuth token is not in the expected encrypted format');
	}

	const version = Number(match[1]);
	if (!Number.isInteger(version) || version < 1) {
		throw new Error('Gmail OAuth token has an invalid encryption key version');
	}

	return {
		version,
		payload: Buffer.from(match[2]!, 'base64url')
	};
}

export function getActiveGmailTokenKeyVersion(): number {
	return ACTIVE_KEY_VERSION;
}

export function isEncryptedGmailToken(value: string | null | undefined): boolean {
	return typeof value === 'string' && value.startsWith(ENCRYPTED_PREFIX);
}

export function encryptGmailToken(value: string, context: GmailTokenContext): string {
	if (!value) {
		throw new Error('Cannot encrypt an empty Gmail OAuth token');
	}

	if (isEncryptedGmailToken(value)) {
		throw new Error('Gmail OAuth token is already encrypted');
	}

	const version = ACTIVE_KEY_VERSION;
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv(ALGORITHM, deriveKey(version), iv);
	cipher.setAAD(serializeContext(context));
	const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
	const authTag = cipher.getAuthTag();
	const payload = Buffer.concat([iv, authTag, ciphertext]).toString('base64url');

	return `${ENCRYPTED_PREFIX}${version}.${payload}`;
}

export function decryptGmailToken(value: string, context: GmailTokenContext): string {
	const { version, payload } = parseEncryptedToken(value);
	if (payload.length <= IV_LENGTH + AUTH_TAG_LENGTH) {
		throw new Error('Encrypted Gmail OAuth token payload is malformed');
	}

	const iv = payload.subarray(0, IV_LENGTH);
	const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
	const decipher = createDecipheriv(ALGORITHM, deriveKey(version), iv);
	decipher.setAAD(serializeContext(context));
	decipher.setAuthTag(authTag);

	try {
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
	} catch {
		throw new Error('Unable to decrypt Gmail OAuth token for this connection');
	}
}
