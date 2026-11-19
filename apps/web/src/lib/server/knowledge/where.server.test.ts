// apps/web/src/lib/server/knowledge/where.server.test.ts
import { describe, expect, it } from 'vitest';
import { loadWhereForEntities } from './where.server';

/** A tiny PostgREST stand-in: `.in()` and `.eq()` filter rows; everything else passes through. */
function fakeDb(tables: Record<string, Array<Record<string, unknown>>>) {
	return {
		from(table: string) {
			let rows = [...(tables[table] ?? [])];
			const builder: any = {
				select: () => builder,
				is: () => builder,
				order: () => builder,
				limit: () => builder,
				eq: (col: string, value: unknown) => {
					rows = rows.filter((r) => r[col] === value);
					return builder;
				},
				in: (col: string, values: unknown[]) => {
					rows = rows.filter((r) => values.includes(r[col]));
					return builder;
				},
				then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null })
			};
			return builder;
		}
	};
}

const ME = 'user-me';
const link = (
	entity_id: string,
	record_kind: string,
	record_id: string,
	quote: string | null = null
) => ({
	entity_id,
	record_kind,
	record_id,
	quote,
	owner_user_id: ME,
	created_at: '2026-11-18T00:00:00Z'
});

describe('loadWhereForEntities', () => {
	const db = fakeDb({
		knowledge_record_links: [
			link('kyle', 'task', 't-open', 'Call Kyle about the deck'),
			link('kyle', 'task', 't-done', 'Kyle sent notes'),
			link('kyle', 'document', 'd-1', 'Kyle runs ops at Acme'),
			link('kyle', 'project', 'p-cadre', 'Kyle is our client lead'),
			link('kyle', 'task', 't-gone'), // deleted or not shared: no row comes back
			link('acme', 'document', 'd-1')
		],
		onto_tasks: [
			{ id: 't-done', title: 'Thank Kyle', project_id: 'p-buildos', state_key: 'done' },
			{ id: 't-open', title: 'Call Kyle', project_id: 'p-buildos', state_key: 'todo' }
		],
		onto_documents: [
			{ id: 'd-1', title: 'Acme brief', project_id: 'p-buildos', state_key: null }
		],
		onto_projects: [
			{ id: 'p-buildos', name: 'BuildOS' },
			{ id: 'p-cadre', name: 'Cadre' }
		]
	});

	it('groups tasks and docs under their projects and counts every mention', async () => {
		const where = await loadWhereForEntities(db, ME, ['kyle', 'acme', 'nobody']);
		expect(where.kyle!.projects).toEqual([
			{ id: 'p-buildos', name: 'BuildOS', count: 3, quote: null },
			{ id: 'p-cadre', name: 'Cadre', count: 1, quote: 'Kyle is our client lead' }
		]);
		expect(where.kyle!.tasks.map((t) => [t.title, t.done, t.project_name])).toEqual([
			['Call Kyle', false, 'BuildOS'],
			['Thank Kyle', true, 'BuildOS']
		]);
		expect(where.kyle!.documents.map((d) => d.quote)).toEqual(['Kyle runs ops at Acme']);
		expect(where.acme!.projects.map((p) => p.name)).toEqual(['BuildOS']);
		expect(where.nobody).toEqual({ projects: [], tasks: [], documents: [] });
	});

	it('drops records the caller cannot open', async () => {
		const where = await loadWhereForEntities(db, ME, ['kyle']);
		const ids = [...where.kyle!.tasks, ...where.kyle!.documents].map((r) => r.id);
		expect(ids).not.toContain('t-gone');
	});
});
