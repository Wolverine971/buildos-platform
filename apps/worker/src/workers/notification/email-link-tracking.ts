// apps/worker/src/workers/notification/email-link-tracking.ts
function getTrackableAppDestination(url: string, baseUrl: string): string | null {
	if (url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\')) {
		return url;
	}

	try {
		const destination = new URL(url);
		const appOrigin = new URL(baseUrl).origin;
		return destination.origin === appOrigin ? destination.toString() : null;
	} catch {
		return null;
	}
}

function decodeHtmlAmpersands(url: string): string {
	return url.replace(/&(amp|#0*38|#x0*26);/gi, '&');
}

/**
 * Route only in-app destinations through BuildOS click tracking. External
 * destinations (for example, Google Calendar event links) must remain direct:
 * the tracking redirect intentionally rejects external origins to avoid
 * becoming an open redirect.
 */
export function rewriteLinksForTracking(html: string, trackingId: string, baseUrl: string): string {
	return html.replace(
		/<a\s+([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
		(match, before, url: string, after) => {
			const decodedUrl = decodeHtmlAmpersands(url);
			if (decodedUrl.startsWith('#') || decodedUrl.includes('/api/email-tracking/')) {
				return match;
			}

			const destination = getTrackableAppDestination(decodedUrl, baseUrl);
			if (!destination) {
				return match;
			}

			const trackingUrl = `${baseUrl.replace(/\/$/, '')}/api/email-tracking/${encodeURIComponent(
				trackingId
			)}/click?url=${encodeURIComponent(destination)}`;

			return `<a ${before}href="${trackingUrl}"${after}>`;
		}
	);
}
