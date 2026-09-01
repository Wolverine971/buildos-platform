// apps/web/src/lib/server/security-headers.ts

export function applyBaselineSecurityHeaders(
	response: Response,
	headers: Readonly<Record<string, string>>
): void {
	for (const [key, value] of Object.entries(headers)) {
		const currentValue = response.headers.get(key)?.trim().toLowerCase();
		if (key.toLowerCase() === 'referrer-policy' && currentValue === 'no-referrer') {
			continue;
		}
		response.headers.set(key, value);
	}
}
