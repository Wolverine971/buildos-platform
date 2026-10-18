// packages/agentic-chat-runtime/src/tools/ontology-reads.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import {
	getDocumentOutline,
	getOntoDocumentDetails,
	listOntoDocuments,
	listOntoTasks,
	readDocumentSection
} from './ontology-reads';

const PROJECT_ID = '40000000-0000-4000-8000-000000000004';

function makeBuilder(rows: unknown[]) {
	const builder: Record<string, any> = {};
	for (const method of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit']) {
		builder[method] = vi.fn(() => builder);
	}
	builder.then = (
		onFulfilled: (value: unknown) => unknown,
		onRejected: (reason: unknown) => unknown
	) =>
		Promise.resolve({ data: rows, count: rows.length, error: null }).then(
			onFulfilled,
			onRejected
		);
	return builder;
}

function contextWith(rows: unknown[]): AgenticChatSharedReadContextV1 {
	return {
		client: { from: vi.fn(() => makeBuilder(rows)) } as never,
		userId: 'user-1',
		timezone: null,
		access: {
			getActorId: vi.fn(async () => 'actor-1'),
			resolveProjectSummaries: vi.fn(async () => []),
			assertProjectAccess: vi.fn(async () => {}),
			assertEntityAccess: vi.fn(async () => {})
		}
	} as never;
}

describe('ontology list reads', () => {
	// 2026-09-29 Wayne Strategies cleanup: 16 archived "todo" tasks were reported as live work
	// because archived rows looked identical to active ones.
	it('marks archived task rows and says so in the message', async () => {
		const task = {
			id: 'task-1',
			title: 'Reach out to Julian',
			state_key: 'todo',
			project: null
		};
		const result = await listOntoTasks(contextWith([task]), {
			project_id: PROJECT_ID,
			archived: true
		});

		expect(result.tasks).toEqual([
			expect.objectContaining({ id: 'task-1', state_key: 'todo', archived: true })
		]);
		expect(result.message).toContain('ARCHIVED records, not active work');
	});

	it('leaves active rows and messages unchanged', async () => {
		const task = { id: 'task-1', title: 'Send proofs', state_key: 'todo', project: null };
		const result = await listOntoTasks(contextWith([task]), { project_id: PROJECT_ID });

		expect(result.tasks[0]).not.toHaveProperty('archived');
		expect(result.message).toBe('Found 1 ontology tasks.');
	});

	it('marks archived document rows', async () => {
		const document = { id: 'doc-1', title: 'Rod Recovery', state_key: 'archived' };
		const result = await listOntoDocuments(contextWith([document]), {
			project_id: PROJECT_ID,
			archived: true
		});

		expect(result.documents[0]).toMatchObject({ id: 'doc-1', archived: true });
		expect(result.message).toContain('ARCHIVED records');
	});
});

// Tasker 113: archived tasks now carry deleted_at too (board shape), so the archive read must
// not require deleted_at IS NULL, or "double-check those were archived" finds nothing.
describe('archived reads', () => {
	function recordingContext(rows: unknown[]) {
		const builder = makeBuilder(rows);
		const context = contextWith(rows);
		(context as any).client = { from: vi.fn(() => builder) };
		return { context, builder };
	}

	it('finds archived tasks whatever their deleted_at', async () => {
		const { context, builder } = recordingContext([]);
		await listOntoTasks(context, { project_id: PROJECT_ID, archived: true });
		expect(builder.not).toHaveBeenCalledWith('archived_at', 'is', null);
		expect(builder.is).not.toHaveBeenCalledWith('deleted_at', null);
	});

	it('keeps deleted rows out of active task reads and other archive reads', async () => {
		const tasks = recordingContext([]);
		await listOntoTasks(tasks.context, { project_id: PROJECT_ID });
		expect(tasks.builder.is).toHaveBeenCalledWith('deleted_at', null);
		expect(tasks.builder.is).toHaveBeenCalledWith('archived_at', null);

		const documents = recordingContext([]);
		await listOntoDocuments(documents.context, { project_id: PROJECT_ID, archived: true });
		expect(documents.builder.is).toHaveBeenCalledWith('deleted_at', null);
	});
});

describe('document detail read', () => {
	it('fences the body read to the project whose access was checked', async () => {
		const DOCUMENT_ID = '50000000-0000-4000-8000-000000000005';
		const queries: Array<{ eq: ReturnType<typeof vi.fn> }> = [];
		const responses = [
			{ data: { id: DOCUMENT_ID, project_id: PROJECT_ID }, error: null },
			// The document moved after the access check: the fenced read finds nothing.
			{ data: null, error: null }
		];
		const client = {
			from: vi.fn(() => {
				const index = queries.length;
				const query: Record<string, any> = {};
				for (const method of ['select', 'eq', 'is']) query[method] = vi.fn(() => query);
				query.maybeSingle = vi.fn(async () => responses[index]);
				queries.push(query as { eq: ReturnType<typeof vi.fn> });
				return query;
			})
		};
		const context = contextWith([]);
		(context as any).client = client;

		const result = await getOntoDocumentDetails(context, { document_id: DOCUMENT_ID });

		expect(context.access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(queries).toHaveLength(2);
		expect(queries[1]!.eq).toHaveBeenCalledWith('id', DOCUMENT_ID);
		expect(queries[1]!.eq).toHaveBeenCalledWith('project_id', PROJECT_ID);
		expect(result).toMatchObject({ status: 'not_found', document: null });
	});
});

// Audit 2026-10-17 S8: one call reads what used to take an outline round plus a
// round per section batch.
describe('document body reads', () => {
	const DOCUMENT_ID = '50000000-0000-4000-8000-000000000006';
	function documentContext(document: Record<string, unknown>): AgenticChatSharedReadContextV1 {
		let calls = 0;
		const client = {
			from: vi.fn(() => {
				const index = calls;
				calls += 1;
				const query: Record<string, any> = {};
				for (const method of ['select', 'eq', 'is']) query[method] = vi.fn(() => query);
				query.maybeSingle = vi.fn(async () =>
					index % 2 === 0
						? { data: { id: DOCUMENT_ID, project_id: PROJECT_ID }, error: null }
						: {
								data: {
									id: DOCUMENT_ID,
									project_id: PROJECT_ID,
									title: 'Plan',
									...document
								},
								error: null
							}
				);
				return query;
			})
		};
		const context = contextWith([]);
		(context as any).client = client;
		return context;
	}
	const filler = (label: string, count: number) =>
		Array.from({ length: count }, (_, index) => `${label} line ${index + 1}.`).join('\n');
	const doc = [
		'# Plan',
		'Intro text.',
		'## Scope',
		filler('Scope', 3),
		'### Out of scope',
		filler('Out', 2),
		'## Budget',
		filler('Budget', 3),
		'## Risks',
		filler('Risk', 2)
	].join('\n');

	it('reads several anchors in one call, in request order, without nested repeats', async () => {
		const result = await readDocumentSection(documentContext({ content: doc }), {
			document_id: DOCUMENT_ID,
			anchors: ['budget', 'scope', 'out-of-scope']
		});

		expect(result.found).toBe(true);
		expect(result.sections.map((section: any) => section.anchor)).toEqual(['budget', 'scope']);
		expect(result.content.startsWith('## Budget')).toBe(true);
		expect(result.content).toContain('## Scope');
		expect(result.content.match(/### Out of scope/g)).toHaveLength(1);
		expect(result.content).not.toContain('## Risks');
		expect(result).toMatchObject({ offset: 0, truncated: false });
		expect(result).not.toHaveProperty('next_offset');
		expect(result.message).toBe(`2 sections loaded (${result.total_chars} chars).`);
	});

	it('keeps the single-anchor form and its result shape', async () => {
		const result = await readDocumentSection(documentContext({ content: doc }), {
			document_id: DOCUMENT_ID,
			anchor: 'risks'
		});

		expect(result).toMatchObject({
			found: true,
			anchor: 'risks',
			heading: 'Risks',
			level: 2,
			message: 'Section "Risks" loaded.'
		});
		expect(result.content.startsWith('## Risks')).toBe(true);
		expect(result).not.toHaveProperty('sections');
	});

	it('accepts anchors sent as a JSON-array string', async () => {
		const result = await readDocumentSection(documentContext({ content: doc }), {
			document_id: DOCUMENT_ID,
			anchors: '["scope", "risks"]' as unknown as string[]
		});

		expect(result.sections.map((section: any) => section.anchor)).toEqual(['scope', 'risks']);
	});

	it('reads the found anchors and names the missing ones with the real list', async () => {
		const result = await readDocumentSection(documentContext({ content: doc }), {
			document_id: DOCUMENT_ID,
			anchors: ['scope', 'timeline']
		});

		expect(result.found).toBe(true);
		expect(result.heading).toBe('Scope');
		expect(result.not_found_anchors).toEqual(['timeline']);
		expect(result.available_anchors).toEqual(
			expect.arrayContaining(['plan', 'scope', 'budget', 'risks'])
		);
		expect(result.message).toContain('Not found: "timeline"');
	});

	it('returns found:false with available anchors when nothing matches', async () => {
		const result = await readDocumentSection(documentContext({ content: doc }), {
			document_id: DOCUMENT_ID,
			anchors: ['timeline', 'team']
		});

		expect(result).toMatchObject({ found: false, anchors: ['timeline', 'team'] });
		expect(result).not.toHaveProperty('content');
		expect(result.message).toContain('No section with anchor "timeline", "team"');
	});

	it('pages a long body by offset with exact, gap-free continuations', async () => {
		const body = filler('Body', 2_000);
		const context = documentContext({ content: body });
		const first = await readDocumentSection(context, { document_id: DOCUMENT_ID });
		expect(first.truncated).toBe(true);
		expect(first.content.length).toBeLessThanOrEqual(12_000);
		expect(first.next_offset).toBe(first.content.length);
		expect(first.message).toContain(`offset ${first.next_offset}`);

		let text = first.content as string;
		let next: number | undefined = first.next_offset;
		while (next !== undefined) {
			const page = await readDocumentSection(context, {
				document_id: DOCUMENT_ID,
				offset: next
			});
			expect(page.offset).toBe(next);
			text += page.content;
			next = page.next_offset;
		}
		expect(text).toBe(body);
	});

	it('says when the offset is past the end', async () => {
		const result = await readDocumentSection(documentContext({ content: doc }), {
			document_id: DOCUMENT_ID,
			anchors: ['risks'],
			offset: 99_999
		});

		expect(result.content).toBe('');
		expect(result.truncated).toBe(false);
		expect(result.message).toContain('nothing is left to read');
	});

	it('returns a short body inline from the outline, and a long one outline-only', async () => {
		const short = await getDocumentOutline(documentContext({ content: doc }), {
			document_id: DOCUMENT_ID
		});
		expect(short.content).toBe(doc);
		expect(short.content_length).toBe(doc.length);
		expect(short.message).toContain('full body is in content');

		const longBody = `${doc}\n${filler('More', 400)}`;
		const long = await getDocumentOutline(documentContext({ content: longBody }), {
			document_id: DOCUMENT_ID
		});
		expect(long).not.toHaveProperty('content');
		expect(long.content_length).toBe(longBody.length);
		expect(long.message).toContain('one read_document_section call with anchors');
	});

	it('attaches a section index only to a long, non-table document', async () => {
		const short = await getOntoDocumentDetails(documentContext({ content: doc }), {
			document_id: DOCUMENT_ID
		});
		expect(short).not.toHaveProperty('sections');

		const longBody = `${doc}\n${filler('More', 400)}`;
		const long = await getOntoDocumentDetails(documentContext({ content: longBody }), {
			document_id: DOCUMENT_ID
		});
		expect(long.sections.map((section: any) => section.anchor)).toEqual([
			'plan',
			'scope',
			'out-of-scope',
			'budget',
			'risks'
		]);
		expect(long.sections[1]).toMatchObject({ heading: 'Scope', level: 2 });
		expect(long.sections[0].chars).toBe(longBody.length);

		const table = await getOntoDocumentDetails(
			documentContext({ content: longBody, type_key: 'document.table' }),
			{ document_id: DOCUMENT_ID }
		);
		expect(table).not.toHaveProperty('sections');
	});
});
