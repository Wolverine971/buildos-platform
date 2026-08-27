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

export function buildDailyBriefUrl(
	baseUrl: string,
	briefDate: string | null | undefined,
	briefId?: string | null
): string {
	const url = new URL('/briefs', baseUrl);
	if (briefDate) {
		url.searchParams.set('date', briefDate);
	}
	url.searchParams.set('view', 'single');
	if (briefId) {
		url.searchParams.set('brief_id', briefId);
	}
	return url.toString();
}
