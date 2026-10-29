// apps/mobile/src/components/reader/format.ts

/** `Oct 28` in the phone's locale, or null for a missing or broken timestamp. */
export function shortDate(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
