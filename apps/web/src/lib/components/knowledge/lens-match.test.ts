// apps/web/src/lib/components/knowledge/lens-match.test.ts
import { describe, expect, it } from 'vitest';
import { lensEntriesFor, lensOnlyNames } from './lens-match';
import type { LensEntry } from './sharing-types';

const entry = (owner: string, name: string, quotes: string[] = []): LensEntry => ({
	owner: { user_id: owner, name: owner.toUpperCase() },
	entity: { id: `${owner}-${name}`, kind: 'person', name, summary: null },
	record_ids: [],
	quotes,
	facts: [],
	hidden: { contact: 0, other: 0 },
	ask: null,
	grant: null
});

describe('lensEntriesFor', () => {
	it('matches by name or linking quote, ignoring case and spacing', () => {
		const entries = [
			entry('alice', 'Kyle Kulinski'),
			entry('bob', 'K. Kulinski', ['Kyle  kulinski'])
		];
		expect(lensEntriesFor(entries, ['kyle kulinski']).map((e) => e.owner.user_id)).toEqual([
			'alice',
			'bob'
		]);
	});

	it('does not match a different name that shares a word', () => {
		expect(lensEntriesFor([entry('alice', 'Kyle Kulinski')], ['Kyle'])).toEqual([]);
	});

	it('keeps one entry per owner', () => {
		const entries = [
			entry('alice', 'Kyle Kulinski'),
			entry('alice', 'Kyle', ['Kyle Kulinski'])
		];
		expect(lensEntriesFor(entries, ['Kyle Kulinski'])).toHaveLength(1);
	});
});

describe('lensOnlyNames', () => {
	it('leaves out names the viewer already has and duplicates across owners', () => {
		const entries = [
			entry('alice', 'Kyle Kulinski'),
			entry('bob', 'kyle kulinski'),
			entry('bob', 'Krystal Ball')
		];
		expect(lensOnlyNames(entries, ['Krystal Ball']).map((e) => e.entity.name)).toEqual([
			'Kyle Kulinski'
		]);
	});
});
