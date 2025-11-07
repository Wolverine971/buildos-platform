// apps/web/src/lib/utils/security.ts
import { timingSafeEqual } from 'crypto';

/**
 * Compare two strings using a constant-time algorithm to avoid timing attacks.
 * Returns false if inputs cannot be compared safely.
 */
export function constantTimeCompare(a: string | null, b: string | null): boolean {
	if (typeof a !== 'string' || typeof b !== 'string') {
		return false;
	}

	const bufferA = Buffer.from(a, 'utf8');
	const bufferB = Buffer.from(b, 'utf8');

	if (bufferA.length !== bufferB.length) {
		return false;
	}

	try {
		return timingSafeEqual(bufferA, bufferB);
	} catch {
		return false;
	}
}

/**
 * Verify an incoming cron request using a shared bearer secret.
 * Keeps comparisons in constant time to protect against timing attacks.
 */
export function isAuthorizedCronRequest(request: Request, secret: string): boolean {
	const authHeader = request.headers.get('authorization');
	const expectedAuth = `Bearer ${secret}`;

	return constantTimeCompare(authHeader, expectedAuth);
}
