// apps/worker/src/config/vapid.ts
export const DEFAULT_VAPID_SUBJECT = 'mailto:support@build-os.com';

const URL_SAFE_BASE64_PATTERN = /^[A-Za-z0-9\-_]+$/;

function validateVapidSubject(subject: string): string | null {
	try {
		const parsedSubject = new URL(subject);
		if (parsedSubject.protocol !== 'https:' && parsedSubject.protocol !== 'mailto:') {
			return 'VAPID_SUBJECT must be an https: or mailto: URL';
		}
		return null;
	} catch {
		return 'VAPID_SUBJECT must be a valid URL';
	}
}

function validateVapidKey(
	name: 'VAPID_PUBLIC_KEY' | 'VAPID_PRIVATE_KEY',
	value: string,
	expectedByteLength: number
): string | null {
	if (!URL_SAFE_BASE64_PATTERN.test(value)) {
		return `${name} must be URL safe Base 64 without "=" padding`;
	}

	const decoded = Buffer.from(value, 'base64url');
	if (decoded.length !== expectedByteLength) {
		return `${name} must decode to ${expectedByteLength} bytes`;
	}

	return null;
}

export function validateVapidDetails(
	publicKey: string | undefined,
	privateKey: string | undefined,
	subject: string | undefined = DEFAULT_VAPID_SUBJECT
): string[] {
	const errors: string[] = [];

	if ((publicKey && !privateKey) || (!publicKey && privateKey)) {
		errors.push(
			'Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together for push notifications'
		);
		return errors;
	}

	if (!publicKey || !privateKey) {
		return errors;
	}

	const subjectError = validateVapidSubject(subject || DEFAULT_VAPID_SUBJECT);
	if (subjectError) {
		errors.push(subjectError);
	}

	const publicKeyError = validateVapidKey('VAPID_PUBLIC_KEY', publicKey, 65);
	if (publicKeyError) {
		errors.push(publicKeyError);
	}

	const privateKeyError = validateVapidKey('VAPID_PRIVATE_KEY', privateKey, 32);
	if (privateKeyError) {
		errors.push(privateKeyError);
	}

	return errors;
}
