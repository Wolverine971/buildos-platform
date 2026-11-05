// packages/agentic-chat-runtime/src/context-finder/load.outline.test.ts
//
// Outline-first loading (tasker 150): the finder reads headings from the stored outline and
// reads document text only for stale outlines and for the documents a plan picks.
import { describe, expect, it, vi } from 'vitest';
import {
	extractOutline,
	hashDocumentContent
} from '@buildos/shared-agent-ops/utils/document-outline';
import {
	buildContextFinderEntities,
	contextItemChars,
	contextItemExcerpts,
	findProjectContext,
	loadContextFinderProject,
	materializeContextPlan,
	plainOutlineHeading,
	renderContextEvidenceBlock,
	selectProjectContext,
	CONTEXT_FINDER_POLICY,
	type ContextFinderDecider,
	type ContextFinderReadClient
} from './index';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PROJECT = id(99);
const FRESH = id(1);
const STALE = id(2);
const OTHER = id(3);

const FRESH_TEXT = [
	'# Launch plan',
	'Intro.',
	'## **Budget** & money',
	'Budget is $300K.',
	'### Land',
	'Land costs $150K/acre.',
	'## Team',
	'Board: grandmother, pastor.'
].join('\n');
const STALE_TEXT = '## Old notes\nStill here.\n## Contacts\nPastor Jim.';
const OTHER_TEXT = `## Archive\n${'y'.repeat(5_000)}`;

type Call = { table: string; columns: string; filters: [string, string, unknown][] };

function docRow(docId: string, title: string, text: string, outline: unknown) {
	return {
		id: docId,
		title,
		description: `${title} description`,
		type_key: 'document.knowledge',
		state_key: 'draft',
		updated_at: '2026-11-01T00:00:00Z',
		created_at: '2026-10-01T00:00:00Z',
		outline,
		content_hash: hashDocumentContent(text),
		content: text
	};
}

/** A Supabase-shaped fake that returns only the selected columns and records every read. */
function fakeClient(
	options: { failTextRead?: boolean; textOverride?: Record<string, string> } = {}
) {
	const docs = [
		docRow(FRESH, 'Launch plan', FRESH_TEXT, extractOutline(FRESH_TEXT)),
		docRow(STALE, 'Old notes', STALE_TEXT, extractOutline('## Different\nold text')),
		docRow(OTHER, 'Archive', OTHER_TEXT, extractOutline(OTHER_TEXT))
	];
	const calls: Call[] = [];
	const client: ContextFinderReadClient = {
		from(table: string) {
			const call: Call = { table, columns: '', filters: [] };
			calls.push(call);
			const resolve = () => {
				if (table === 'onto_projects')
					return {
						data: { id: PROJECT, name: 'School', description: null },
						error: null
					};
				if (table !== 'onto_documents') return { data: [], error: null };
				const ids = call.filters.find(([op, column]) => op === 'in' && column === 'id');
				if (ids && options.failTextRead) return { data: null, error: { message: 'boom' } };
				const rows = docs
					.filter((doc) => !ids || (ids[2] as string[]).includes(doc.id))
					.map((doc) => {
						// An override is an edit that lands after the listing, before the text read.
						const content = (ids && options.textOverride?.[doc.id]) || doc.content;
						const full = {
							...doc,
							content,
							content_hash: hashDocumentContent(content),
							table: null
						} as Record<string, unknown>;
						const columns = call.columns.split(',').map((c) => c.split(':')[0]!);
						return Object.fromEntries(columns.map((c) => [c, full[c]]));
					});
				return { data: rows, error: null };
			};
			const builder: Record<string, unknown> = {
				select(columns: string) {
					call.columns = columns;
					return builder;
				},
				eq(column: string, value: unknown) {
					call.filters.push(['eq', column, value]);
					return builder;
				},
				in(column: string, value: unknown) {
					call.filters.push(['in', column, value]);
					return builder;
				},
				is: () => builder,
				order: () => builder,
				limit: () => builder,
				abortSignal: () => builder,
				maybeSingle: () => Promise.resolve(resolve()),
				then: (ok: (value: unknown) => unknown, bad?: (e: unknown) => unknown) =>
					Promise.resolve(resolve()).then(ok, bad)
			};
			return builder as never;
		}
	};
	const textReads = () =>
		calls
			.filter((call) => call.table === 'onto_documents' && call.columns.includes('content,'))
			.map((call) => call.filters.find(([op]) => op === 'in')?.[2]);
	return { client, calls, textReads };
}

function decider(scores: (key: string) => number) {
	const decide = vi.fn(async (request: { questions: Record<string, unknown> }) => {
		const keys = Object.keys(request.questions);
		return {
			ok: true as const,
			answers: Object.fromEntries(keys.map((k) => [k, { type: 'noul', noul: scores(k) }])),
			receipt: {
				modelRequested: 'jev',
				modelUsed: 'jev',
				requestId: 'r',
				inputTokens: 1,
				outputTokens: 1,
				costUsd: 0,
				durationMs: 1,
				requestBytes: 1,
				questionCount: keys.length,
				attempts: 1
			}
		};
	});
	return { decide, decider: { decide } as unknown as ContextFinderDecider };
}

const signal = () => new AbortController().signal;

describe('outline-first loading', () => {
	it('never selects document text in bulk; reads it only for a stale outline', async () => {
		const { client, calls, textReads } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const listing = calls.find(
			(call) => call.table === 'onto_documents' && call.columns.includes('outline')
		)!;
		expect(listing.columns.split(',')).not.toContain('content');
		expect(textReads()).toEqual([[STALE]]);
		const byId = new Map(project.documents.map((doc) => [doc.id, doc]));
		expect(byId.get(FRESH)!.content).toBeUndefined();
		expect(byId.get(STALE)!.content).toBe(STALE_TEXT);
		expect(project.documentText).toBeTypeOf('function');
	});

	it('builds packets from the stored outline: plain headings, anchors, offsets, no text', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const [fresh, stale] = buildContextFinderEntities(project);
		expect(fresh!.textLoaded).toBe(false);
		expect(fresh!.fullText).toBe('');
		expect(fresh!.textChars).toBe(FRESH_TEXT.length);
		expect(fresh!.packet.headings).toEqual(['Budget & money', 'Land', 'Team']);
		expect(fresh!.sections.map((s) => [s.heading, s.anchor, s.body])).toEqual([
			['Launch plan', 'launch-plan', ''],
			['Budget & money', 'budget--money', ''],
			['Land', 'land', ''],
			['Team', 'team', '']
		]);
		// The stale document's headings come from its current text, not the old outline.
		expect(stale!.textLoaded).toBe(true);
		expect(stale!.packet.headings).toEqual(['Old notes', 'Contacts']);
	});

	it('reads text only for the documents the plan loads in full', async () => {
		const { client, textReads } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const { decider: d } = decider((k) =>
			k === 'e_d0' ? 0.9 : k === 'h_d0_0' ? 0.8 : k.startsWith('e_') ? 0.1 : 0
		);
		const result = await findProjectContext({ project, message: 'Budget?', decider: d });
		expect(textReads()).toEqual([[STALE], [FRESH]]);
		expect(result.evidence.full).toHaveLength(1);
		expect(result.evidence.full[0]).toMatchObject({
			id: FRESH,
			partial: true,
			excerpts: [
				{
					heading: 'Budget & money',
					text: '## **Budget** & money\nBudget is $300K.\n### Land\nLand costs $150K/acre.'
				}
			]
		});
		const other = result.entities.find((entity) => entity.id === OTHER)!;
		expect(other.textLoaded).toBe(false);
	});

	it('re-measures sections when the text changed after the outline load', async () => {
		const edited = FRESH_TEXT.replace('Intro.', 'A much longer introduction paragraph.');
		const { client } = fakeClient({ textOverride: { [FRESH]: edited } });
		const project = await loadContextFinderProject(client, PROJECT, signal());
		expect(project.documents[0]!.content).toBeUndefined();
		const { decider: d } = decider((k) => (k === 'e_d0' ? 0.9 : k === 'h_d0_2' ? 0.8 : 0));
		const result = await findProjectContext({ project, message: 'Team?', decider: d });
		expect(result.evidence.full[0]!.excerpts).toEqual([
			{ heading: 'Team', text: '## Team\nBoard: grandmother, pastor.' }
		]);
	});

	it('falls back to the document card when the text read fails', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		project.documentText = async () => {
			throw new Error('network');
		};
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { decider: d } = decider((k) => (k === 'e_d0' ? 0.9 : 0));
		const result = await findProjectContext({ project, message: 'Plan?', decider: d });
		warn.mockRestore();
		const [item] = result.evidence.full;
		expect(item!.partial).toBe(true);
		expect(item!.excerpts[0]!.text).toContain('Launch plan description');
		expect(item!.excerpts[0]!.text).toContain('- Budget & money (anchor: budget--money)');
	});

	it('budgets a plan from outline offsets at or above the real excerpt size', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const outlined = buildContextFinderEntities(project);
		const loaded = buildContextFinderEntities({
			...project,
			documents: project.documents.map((doc) => ({
				...doc,
				content: doc.id === FRESH ? FRESH_TEXT : doc.id === OTHER ? OTHER_TEXT : doc.content
			}))
		});
		for (const sections of [
			[{ heading: 'Budget & money', p: 0.9 }],
			[{ heading: 'Team', p: 0.9 }],
			[]
		])
			for (const i of [0, 2]) {
				const estimate = contextItemChars(outlined[i]!, sections);
				const real = contextItemExcerpts(loaded[i]!, sections).chars;
				expect(estimate).toBeGreaterThanOrEqual(real);
				expect(estimate - real).toBeLessThan(5);
			}
		const plan = selectProjectContext({ entities: outlined, scores: { e_d2: 0.9 } });
		expect(materializeContextPlan({ plan, entities: loaded }).full[0]!.excerpts[0]!.text).toBe(
			OTHER_TEXT.slice(0, 1_500)
		);
	});
});

describe('what an agent gets up front (option B)', () => {
	it('gives each picked document its card and at most two sections within 5k', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		// Jev likes every heading of the launch plan.
		const { decider: d } = decider((k) =>
			k === 'e_d0' ? 0.9 : k.startsWith('h_d0_') ? 0.8 : 0
		);
		const result = await findProjectContext({ project, message: 'Plan?', decider: d });
		const [item] = result.evidence.full;
		expect(result.evidence.coverage.budgetChars).toBe(CONTEXT_FINDER_POLICY.agentBudgetChars);
		expect(item!.excerpts.length).toBeLessThanOrEqual(2);
		expect(item!.card).toEqual({
			description: 'Launch plan description',
			sections: [
				{ heading: 'Budget & money', anchor: 'budget--money' },
				{ heading: 'Land', anchor: 'land' },
				{ heading: 'Team', anchor: 'team' }
			],
			more: 0
		});
		const block = renderContextEvidenceBlock(result.evidence);
		expect(block).toContain(
			'Sections (anchor): Budget & money (budget--money) · Land (land) · Team (team)'
		);
		expect(block).toContain('read_document_section');
	});

	it('leaves the full budget to hosts that select directly (drift review)', async () => {
		const { client } = fakeClient();
		const project = await loadContextFinderProject(client, PROJECT, signal());
		const entities = buildContextFinderEntities(project);
		const plan = selectProjectContext({
			entities,
			scores: { e_d0: 0.9, h_d0_0: 0.8, h_d0_1: 0.8, h_d0_2: 0.8 }
		});
		expect(plan.items[0]!.sections).toHaveLength(3);
	});
});

describe('plainOutlineHeading', () => {
	it('strips the rendered HTML the outline stores and decodes entities', () => {
		expect(plainOutlineHeading('<strong>Bold</strong> &amp; <code>x</code>')).toBe('Bold & x');
		expect(plainOutlineHeading('Sub <a href="x">link</a> &#39;q&#39; &#x2014;')).toBe(
			"Sub link 'q' —"
		);
		expect(plainOutlineHeading('&unknown; stays')).toBe('&unknown; stays');
	});
});
