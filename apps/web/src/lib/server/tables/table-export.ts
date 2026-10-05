// apps/web/src/lib/server/tables/table-export.ts

/**
 * Download filename for a table export. The quoted `filename` is an ASCII-only
 * fallback; the RFC 5987 `filename*` carries the real title for browsers that
 * read it.
 */
export function csvFilename(title: string): { ascii: string; encoded: string } {
	const trimmed = title.trim() || 'table';
	const ascii =
		trimmed
			.normalize('NFKD')
			.replace(/[^\w .-]+/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 80) || 'table';
	return {
		ascii: `${ascii}.csv`,
		encoded: encodeURIComponent(`${trimmed.slice(0, 120)}.csv`)
	};
}

export function csvContentDisposition(title: string): string {
	const filename = csvFilename(title);
	return `attachment; filename="${filename.ascii}"; filename*=UTF-8''${filename.encoded}`;
}
