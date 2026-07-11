// apps/worker/src/workers/notification/email-action-url.ts
export function resolveNotificationActionUrl(
	baseUrl: string,
	actionUrl: string | null | undefined
): string | null {
	if (!actionUrl) return null;

	try {
		const resolved = new URL(actionUrl, baseUrl);
		if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
			return null;
		}
		return resolved.toString();
	} catch {
		return null;
	}
}
