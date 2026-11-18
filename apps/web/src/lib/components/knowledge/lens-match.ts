// apps/web/src/lib/components/knowledge/lens-match.ts
//
// Which of the other members' entries (the project lens, tasker 168) a name on the page is.
// A plain comparison of the name's exact words with each entry's name and the quotes its owner's
// reader linked it by (case and spacing ignored); it never interprets what the text means.
import type { LensEntry } from './sharing-types';

const norm = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Entries whose name or linking quote is one of these words, one per owner, owners A→Z. */
export function lensEntriesFor(entries: LensEntry[], words: string[]): LensEntry[] {
	const wanted = new Set(words.map(norm).filter(Boolean));
	if (!wanted.size) return [];
	const byOwner = new Map<string, LensEntry>();
	for (const entry of entries) {
		const names = [entry.entity.name, ...entry.quotes].map(norm);
		if (!names.some((name) => wanted.has(name))) continue;
		if (!byOwner.has(entry.owner.user_id)) byOwner.set(entry.owner.user_id, entry);
	}
	return [...byOwner.values()].sort((a, b) => a.owner.name.localeCompare(b.owner.name));
}

/** Words other members linked on this record that the viewer's own graph doesn't cover. */
export function lensOnlyNames(entries: LensEntry[], known: string[]): LensEntry[] {
	const mine = new Set(known.map(norm));
	const seen = new Set<string>();
	return entries.filter((entry) => {
		const key = norm(entry.entity.name);
		if (mine.has(key) || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
