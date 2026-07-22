// apps/web/src/lib/server/gmail-token-crypto.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	decryptGmailToken,
	encryptGmailToken,
	getActiveGmailTokenKeyVersion,
	isEncryptedGmailToken,
	type GmailTokenContext
} from './gmail-token-crypto';

const originalKey = process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1;

const context: GmailTokenContext = {
	userId: 'user-1',
	providerAccountId: 'google-sub-1',
	grantKind: 'read'
};

describe('gmail-token-crypto', () => {
	beforeEach(() => {
		process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1 =
			'gmail-test-key-with-at-least-32-bytes-of-entropy';
	});

	afterEach(() => {
		if (originalKey === undefined) {
			delete process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1;
		} else {
			process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1 = originalKey;
		}
	});

	it('encrypts and decrypts with account-bound authenticated context', () => {
		const encrypted = encryptGmailToken('refresh-token-value', context);

		expect(isEncryptedGmailToken(encrypted)).toBe(true);
		expect(encrypted).not.toContain('refresh-token-value');
		expect(decryptGmailToken(encrypted, context)).toBe('refresh-token-value');
		expect(getActiveGmailTokenKeyVersion()).toBe(1);
	});

	it('rejects decryption when the token is moved to a different account', () => {
		const encrypted = encryptGmailToken('refresh-token-value', context);

		expect(() =>
			decryptGmailToken(encrypted, {
				...context,
				providerAccountId: 'google-sub-2'
			})
		).toThrow('Unable to decrypt Gmail OAuth token for this connection');
	});

	it('fails closed instead of using unrelated application secrets', () => {
		delete process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1;

		expect(() => encryptGmailToken('refresh-token-value', context)).toThrow(
			'Configure PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1'
		);
	});

	it('rejects an undersized dedicated encryption key', () => {
		process.env.PRIVATE_GMAIL_TOKEN_ENCRYPTION_KEY_V1 = 'too-short';

		expect(() => encryptGmailToken('refresh-token-value', context)).toThrow(
			'at least 32 bytes'
		);
	});

	it('rejects plaintext and already-encrypted input', () => {
		expect(() => decryptGmailToken('plaintext-token', context)).toThrow(
			'not in the expected encrypted format'
		);

		const encrypted = encryptGmailToken('refresh-token-value', context);
		expect(() => encryptGmailToken(encrypted, context)).toThrow('already encrypted');
	});
});
