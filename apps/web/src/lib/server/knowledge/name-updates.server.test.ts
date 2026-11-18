// apps/web/src/lib/server/knowledge/name-updates.server.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	anchorAt,
	findNameSpans,
	type KnowledgeDataClient
} from '@buildos/shared-agent-ops/knowledge';
import { applyNameUpdates, listNameUpdates } from './name-updates.server';

type Row = Record<string, any>;

/** Just enough of the PostgREST builder for these two functions. */
function fakeDb(tables: Record<string, Row[]>): KnowledgeDataClient {
	return {
		rpc: async () => ({ data: null, error: null }),
		from(table: string) {
			const filters: Array<(r: Row) => boolean> = [];
			let patch: Row | null = null;
			let one = false;
			const q: any = {
				select: () => q,
				eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
				in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
				is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
				limit: () => q,
				update: (p: Row) => ((patch = p), q),
				maybeSingle: () => ((one = true), q),
				then: (ok: any) => {
					const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
					if (patch) for (const r of rows) Object.assign(r, patch);
					const copies = rows.map((r) => ({ ...r }));
					return Promise.resolve(
						ok({ data: one ? (copies[0] ?? null) : copies, error: null })
					);
				}
			};
			return q;
		}
	};
}

const USER = '11111111-1111-4111-8111-111111111111';
const ENTRY = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';
const DOC = '44444444-4444-4444-8444-444444444444';
const PROJECT = '55555555-5555-4555-8555-555555555555';

function mention(
	id: string,
	recordKind: 'task' | 'document',
	recordId: string,
	field: any,
	text: string,
	name: string
) {
	const span = findNameSpans(text, name)[0]!;
	const a = anchorAt(text, span, field);
	return {
		id,
		owner_user_id: USER,
		entity_id: ENTRY,
		record_kind: recordKind,
		record_id: recordId,
		field,
		start_offset: a.start,
		end_offset: a.end,
		text: a.text,
		prefix: a.prefix,
		suffix: a.suffix,
		status: 'active'
	};
}

function setup() {
	const taskTitle = 'Follow up with Phil Velayo on building his website';
	const docContent =
		'Intro.\n\nReferred by Phil Velayo from thecadretraining.com. Phil said yes.';
	const tables: Record<string, Row[]> = {
		knowledge_entities: [
			{ id: ENTRY, owner_user_id: USER, name: 'Phillip Velayo', status: 'active' }
		],
		onto_tasks: [
			{
				id: TASK,
				title: taskTitle,
				description: '',
				project_id: PROJECT,
				updated_at: 't1',
				deleted_at: null
			}
		],
		onto_documents: [
			{
				id: DOC,
				title: 'Client doc',
				content: docContent,
				project_id: PROJECT,
				updated_at: 'd1',
				deleted_at: null
			}
		],
		knowledge_mentions: [
			mention('m1', 'task', TASK, 'title', taskTitle, 'Phil Velayo'),
			mention('m2', 'document', DOC, 'content', docContent, 'Phil Velayo'),
			// One-word references are left alone.
			mention(
				'm3',
				'document',
				DOC,
				'content',
				docContent.replace('Referred by Phil Velayo', 'Referred by X'),
				'Phil'
			)
		]
	};
	return { tables, db: fakeDb(tables), taskTitle, docContent };
}

describe('listNameUpdates', () => {
	it('lists full-name spellings that differ, with the sentence before and after', async () => {
		const { db } = setup();
		const out = await listNameUpdates({ db, userId: USER, canEdit: async () => true }, ENTRY);
		expect(out.name).toBe('Phillip Velayo');
		expect(out.places.map((p) => [p.mention_id, p.from, p.after])).toEqual([
			['m1', 'Phil Velayo', 'Follow up with Phillip Velayo on building his website'],
			['m2', 'Phil Velayo', 'Referred by Phillip Velayo from thecadretraining.com.']
		]);
		expect(out.places.every((p) => p.can_edit)).toBe(true);
	});
});

describe('applyNameUpdates', () => {
	it('writes through the update routes, replacing only the tagged words, and moves the tags', async () => {
		const { tables, db, docContent } = setup();
		const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
		const out = await applyNameUpdates(
			{
				db,
				userId: USER,
				canEdit: async () => true,
				fetch: fetch as unknown as typeof globalThis.fetch
			},
			[
				{ mention_id: 'm1', to: 'Phillip Velayo' },
				{ mention_id: 'm2', to: 'Phillip Velayo' }
			]
		);
		expect(out.skipped).toEqual([]);
		expect(out.applied.map((a) => a.mention_id).sort()).toEqual(['m1', 'm2']);
		const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
		const bodies = Object.fromEntries(
			calls.map(([url, init]) => [url, JSON.parse(String(init.body))])
		);
		expect(bodies[`/api/onto/tasks/${TASK}`]).toEqual({
			title: 'Follow up with Phillip Velayo on building his website'
		});
		expect(bodies[`/api/onto/documents/${DOC}`]).toEqual({
			content: docContent.replace('Phil Velayo', 'Phillip Velayo'),
			expected_updated_at: 'd1'
		});
		const m2 = tables.knowledge_mentions!.find((m) => m.id === 'm2')!;
		expect(m2.text).toBe('Phillip Velayo');
		expect(
			docContent
				.replace('Phil Velayo', 'Phillip Velayo')
				.slice(m2.start_offset, m2.end_offset)
		).toBe('Phillip Velayo');
	});

	it('skips a place whose words changed and records the user cannot edit', async () => {
		const { tables, db } = setup();
		tables.onto_tasks![0]!.title = 'Follow up with Rod on the website';
		const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
		const out = await applyNameUpdates(
			{
				db,
				userId: USER,
				canEdit: async () => false,
				fetch: fetch as unknown as typeof globalThis.fetch
			},
			[{ mention_id: 'm1', to: 'Phillip Velayo' }]
		);
		expect(out.applied).toEqual([]);
		expect(out.skipped).toEqual([{ mention_id: 'm1', reason: 'You can’t edit this' }]);
		expect(fetch).not.toHaveBeenCalled();

		const editable = await applyNameUpdates(
			{
				db,
				userId: USER,
				canEdit: async () => true,
				fetch: fetch as unknown as typeof globalThis.fetch
			},
			[{ mention_id: 'm1', to: 'Phillip Velayo' }]
		);
		expect(editable.skipped).toEqual([{ mention_id: 'm1', reason: 'The words changed since' }]);
		expect(fetch).not.toHaveBeenCalled();
	});

	it('Undo is the same call with the old words', async () => {
		const { tables, db, docContent } = setup();
		const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
		const deps = {
			db,
			userId: USER,
			canEdit: async () => true,
			fetch: fetch as unknown as typeof globalThis.fetch
		};
		await applyNameUpdates(deps, [{ mention_id: 'm2', to: 'Phillip Velayo' }]);
		// The route wrote the new text; mirror it in the fake.
		tables.onto_documents![0]!.content = docContent.replace('Phil Velayo', 'Phillip Velayo');
		const undo = await applyNameUpdates(deps, [{ mention_id: 'm2', to: 'Phil Velayo' }]);
		expect(undo.applied).toEqual([
			expect.objectContaining({ mention_id: 'm2', from: 'Phillip Velayo', to: 'Phil Velayo' })
		]);
		const lastBody = JSON.parse(
			String((fetch.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body)
		);
		expect(lastBody.content).toBe(docContent);
	});
});
