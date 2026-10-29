// apps/mobile/src/lib/announce.ts
//
// On iOS, VoiceOver ignores `accessibilityRole="alert"` and `accessibilityLiveRegion` (an
// Android-only prop), so a failed save or a capture's sort result is never spoken unless the
// app announces it. This decides when to speak. Pure: hooks/use-announce.ts does the speaking.

/** The text to speak when a status line changes to `next`, or null: only a new, non-blank message. */
export function announcementFor(
	previous: string | null,
	next: string | null | undefined
): string | null {
	const text = next?.trim() || null;
	return text && text !== previous ? text : null;
}

/** Plain text out of a status line's children (strings and numbers, nested arrays included). */
export function spokenText(children: unknown): string | null {
	if (typeof children === 'string' || typeof children === 'number') {
		return String(children).trim() || null;
	}
	if (Array.isArray(children)) {
		const text = children
			.map((child) => spokenText(child))
			.filter(Boolean)
			.join(' ');
		return text || null;
	}
	return null;
}

/**
 * Speaks a shared result once, however many screens show it. The Today and Workspace tabs
 * both stay mounted with a capture box, and both see the same sort result.
 */
export function createAnnouncer(speak: (message: string) => void, memory = 50) {
	const spoken: string[] = [];
	return (key: string, message: string): boolean => {
		if (spoken.includes(key)) return false;
		spoken.push(key);
		if (spoken.length > memory) spoken.shift();
		speak(message);
		return true;
	};
}
