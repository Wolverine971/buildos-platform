// apps/worker/scripts/backfill-document-outlines.ts
//
// Fills the `onto_documents.outline` cache (tasker 150). The context finder reads headings
// from it instead of loading every document's text; a document whose outline is missing or
// stale costs a text read on every project chat turn until it is refreshed.
//
//   pnpm --filter @buildos/worker exec tsx --env-file=.env scripts/backfill-document-outlines.ts
//   … same … --apply            write outlines (prod write: derived cache column only)
//
// Dry run (default) is read-only and reports coverage and, per project, the characters the
// finder's document listing loaded before (every body) and after (outlines only).
// The write touches only `outline`, guarded by the content_hash it was computed from, so a
// concurrent edit is never overwritten. The updated_at trigger ignores outline-only writes and
// the embedding trigger skips them (title/description/content unchanged).
import { createClient } from '@supabase/supabase-js';
import { extractOutline } from '@buildos/shared-agent-ops/utils/document-outline';

const apply = process.argv.includes('--apply');
const url = process.env.PUBLIC_SUPABASE_URL?.trim();
const key = process.env.PRIVATE_SUPABASE_SERVICE_KEY?.trim();
if (!url || !key) {
	console.error('PUBLIC_SUPABASE_URL and PRIVATE_SUPABASE_SERVICE_KEY are required.');
	process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const PAGE = 200;
/** The finder lists at most this many documents per project, newest first (load.ts). */
const FINDER_DOCUMENTS = 300;

type Row = {
	id: string;
	project_id: string;
	updated_at: string;
	content: string | null;
	content_hash: string | null;
	outline: { content_hash?: unknown; nodes?: unknown } | null;
	state_key: string | null;
	archived_at: string | null;
};

const isFresh = (row: Row) =>
	!!row.outline &&
	typeof row.outline.content_hash === 'string' &&
	Array.isArray(row.outline.nodes) &&
	row.outline.content_hash === row.content_hash;

async function main() {
	const rows: Row[] = [];
	for (let from = 0; ; from += PAGE) {
		const { data, error } = await db
			.from('onto_documents')
			.select('id,project_id,updated_at,content,content_hash,outline,state_key,archived_at')
			.is('deleted_at', null)
			.order('id', { ascending: true })
			.range(from, from + PAGE - 1);
		if (error) throw new Error(`read failed at ${from}: ${error.message}`);
		rows.push(...((data ?? []) as Row[]));
		if (!data || data.length < PAGE) break;
	}

	const stale = rows.filter((row) => !isFresh(row));
	const outlines = new Map<string, ReturnType<typeof extractOutline>>();
	const hashMismatch: string[] = [];
	for (const row of stale) {
		const outline = extractOutline(row.content);
		// The JS hash must equal the generated column, or the finder would never see it fresh.
		if (outline.content_hash !== row.content_hash) hashMismatch.push(row.id);
		else outlines.set(row.id, outline);
	}

	// Per project, the finder's document listing: newest 300 live, unarchived documents.
	const byProject = new Map<string, Row[]>();
	for (const row of rows) {
		if (row.archived_at || row.state_key === 'archived') continue;
		const list = byProject.get(row.project_id) ?? [];
		list.push(row);
		byProject.set(row.project_id, list);
	}
	const sizes = [...byProject.entries()].map(([projectId, list]) => {
		const listed = list
			.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
			.slice(0, FINDER_DOCUMENTS);
		const body = (row: Row) => (row.content ?? '').length;
		const outlineChars = (row: Row) =>
			JSON.stringify(isFresh(row) ? row.outline : (outlines.get(row.id) ?? null)).length;
		return {
			projectId,
			docs: listed.length,
			before: listed.reduce((n, row) => n + body(row), 0),
			// Today, before the backfill: outlines plus the text of every stale document.
			now: listed.reduce((n, row) => n + (isFresh(row) ? outlineChars(row) : body(row)), 0),
			after: listed.reduce((n, row) => n + outlineChars(row), 0)
		};
	});
	const pct = (q: number, values: number[]) => {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
	};
	const summary = (field: 'before' | 'now' | 'after') => ({
		median: pct(
			0.5,
			sizes.map((s) => s[field])
		),
		p90: pct(
			0.9,
			sizes.map((s) => s[field])
		),
		max: Math.max(0, ...sizes.map((s) => s[field]))
	});
	console.log(
		JSON.stringify(
			{
				documents: rows.length,
				freshOutlines: rows.length - stale.length,
				toWrite: outlines.size,
				hashMismatch: hashMismatch.length,
				projects: sizes.length,
				listingChars: {
					beforeAllBodies: summary('before'),
					outlineFirstToday: summary('now'),
					outlineFirstAfterBackfill: summary('after')
				},
				largest: sizes
					.sort((a, b) => b.before - a.before)
					.slice(0, 5)
					.map((s) => ({ ...s, projectId: s.projectId.slice(0, 8) }))
			},
			null,
			1
		)
	);
	if (!apply) {
		console.log('Dry run: nothing written. Pass --apply to write outlines.');
		return;
	}

	let written = 0;
	let skipped = 0;
	for (const row of stale) {
		const outline = outlines.get(row.id);
		if (!outline) continue;
		const { data, error } = await db
			.from('onto_documents')
			.update({ outline })
			.eq('id', row.id)
			.eq('content_hash', row.content_hash!)
			.select('id');
		if (error) throw new Error(`write failed for ${row.id}: ${error.message}`);
		if (data?.length) written += 1;
		else skipped += 1; // edited since the read; its next save refreshes the outline
	}
	console.log(JSON.stringify({ written, skippedEditedSinceRead: skipped }));
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
